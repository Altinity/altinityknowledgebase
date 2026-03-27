---
title: "Using clickhouse-keeper"
linkTitle: "Using clickhouse-keeper"
description: >
    Moving to the ClickHouse® alternative to Zookeeper
keywords: 
  - clickhouse keeper
  - clickhouse-keeper
---

Since 2021 the development of built-in ClickHouse® alternative for Zookeeper is happening, whose goal is to address several design pitfalls, and get rid of extra dependency. 

See slides:  https://presentations.clickhouse.com/meetup54/keeper.pdf and video  https://youtu.be/IfgtdU1Mrm0?t=2682

## Current status (last updated: March 2026)

ClickHouse Keeper is the recommended choice for new installations. It yields better performance in many cases due to the new features, like async replication or multi read. Some ClickHouse server features cannot be used without Keeper, for example the S3Queue.

- Use the latest Keeper version available in your supported upgrade path whenever possible.
- The Keeper version doesn’t need to match the ClickHouse server version
- Modern Keeper usually performs better than older versions because the codebase has matured significantly, new protocol feature flags have been added, and internal replication has improved.

For existing systems that currently use Apache Zookeeper, you can consider upgrading to clickhouse-keeper especially if you will [upgrade ClickHouse](https://altinity.com/clickhouse-upgrade-overview/) also. 

{{% alert title="Warning" color="warning" %}}
Before upgrading ClickHouse Keeper from version older than 23.9 please check Upgrade caveat for async_replication [Upgrade caveat for async_replication](https://kb.altinity.com/altinity-kb-setup-and-maintenance/altinity-kb-zookeeper/clickhouse-keeper#upgrade-caveat-for-async_replication) 
{{% /alert %}}

## How does clickhouse-keeper differ from Zookeeper?

Keeper is optimized for ClickHouse workloads and written in C++ (and can be used as single-binary), so it don't need any external dependencies. It uses the same **client** protocol but both are implementing different consensus protocol: Zookeeper is using ZAB, while ClickHouse Keeper implements eBay NuRAFT [GitHub - eBay/NuRaft: C++ implementation of Raft core logic as a replication library](https://github.com/eBay/NuRaft) which improves stability and performance of base RAFT protocol.

ClickHouse Keeper can also run in embedded mode, operating as a separate thread within the ClickHouse server process, which may be suitable for testing purposes or smaller instances where some performance can be sacrificed for simplicity

## Migration and upgrade guide

- A mixed ZooKeeper / ClickHouse Keeper quorum is not supported. Those are different consensus protocols. 
- ZooKeeper snapshots and transaction logs are not format-compatible with Keeper. For data migration use `clickhouse-keeper-converter`.
- If the above is too complex you can switch to new, empty Keeper ensemble and recreate the Keeper metadata using `SYSTEM RESTORE REPLICA` calls. This method takes longer time but it is suitable for smaller clusters. Check [procedure to restore multiple tables in RO mode article](https://kb.altinity.com/altinity-kb-setup-and-maintenance/altinity-kb-check-replication-ddl-queue/#procedure-to-restore-multiple-tables-in-read-only-mode-per-replica)
- Keep in mind that some metadata is available in ZooKeeper only and will be lost if you don't migrate with clickhouse-keeper-converter using above guide. For example: Distributed DDL queue, RBAC data (if configured), etc. Check [Keeper depended features](https://kb.altinity.com/altinity-kb-setup-and-maintenance/keeper-dependent-features) for more information.

### Upgrade caveat for `async_replication`

`async_replication` is an internal Keeper optimization for RAFT replication and it's turned on by default starting from [25.10](https://github.com/ClickHouse/ClickHouse/pull/88515) . It does not change ClickHouse replicated table semantics, but it can improve Keeper performance.

If you upgrade directly from a version older than `23.9` to `25.10+`:

- either upgrade Keeper to `23.9+` first, and then continue to `25.10+`
- or temporarily set `keeper_server.coordination_settings.async_replication=0` during the upgrade and enable it after the upgrade is finished

### Keeper in kubernetes

If you run ClickHouse on Kubernetes with Altinity operator, Keeper can be managed as a dedicated `ClickHouseKeeperInstallation` resource (often abbreviated as CHK). That is usually the cleanest way to run and upgrade a separate Keeper ensemble on Kubernetes. Please check examples [here](https://github.com/Altinity/clickhouse-operator/blob/master/docs/chk-examples/01-chi-simple-with-keeper.yaml).

## systemd service file

See https://kb.altinity.com/altinity-kb-setup-and-maintenance/altinity-kb-zookeeper/clickhouse-keeper-service/

## init.d script

See https://kb.altinity.com/altinity-kb-setup-and-maintenance/altinity-kb-zookeeper/clickhouse-keeper-initd/

## More than 3 Keeper nodes

The main issue with a larger Keeper ensemble is that it takes more time to re-elect a leader, and commits take longer, which can slow down insertions and DDL queries.

It should be fine, but we don’t recommend running more than three Keeper nodes (excluding observers).

Increasing the number of nodes offers no significant advantages (unless you need to tolerate the simultaneous failure of two Keeper nodes). In terms of performance, it doesn’t perform better—and may even perform worse—and it consumes additional resources (ZooKeeper requires fast, dedicated disks to perform well, as well as some RAM and CPU).

## clickhouse-keeper-client

In clickhouse-keeper-client, paths are now parsed more strictly and must be passed as string literals. In practice, this means using single quotes around paths—for example, ls '/' instead of ls /, and get '/clickhouse/path' instead of get /clickhouse/path. 

## Example of a simple cluster

The Keeper ensemble size must be odd because it requires a majority (50% + 1 nodes) to form a quorum. A 2-node Keeper setup will lose quorum after a single node failure, so the recommended number of Keeper replicas is 3.

On `hostname1` and `hostname2` below, ClickHouse can use the embedded Keeper cluster from `<keeper_server>`, so a separate client-side `<keeper>` section is not required. If your ClickHouse servers connect to an external Keeper or ZooKeeper ensemble, see [ClickHouse config for Keeper]({{< ref "clickhouse-keeper-clickhouse-config" >}}).

### hostname1

```xml
$ cat /etc/clickhouse-server/config.d/keeper.xml

<?xml version="1.0" ?>
<clickhouse>
    <keeper_server>
        <tcp_port>2181</tcp_port>
        <server_id>1</server_id>
        <log_storage_path>/var/lib/clickhouse/coordination/log</log_storage_path>
        <snapshot_storage_path>/var/lib/clickhouse/coordination/snapshots</snapshot_storage_path>

        <coordination_settings>
            <operation_timeout_ms>10000</operation_timeout_ms>
            <session_timeout_ms>30000</session_timeout_ms>
            <raft_logs_level>trace</raft_logs_level>
            <rotate_log_storage_interval>10000</rotate_log_storage_interval>
        </coordination_settings>

        <raft_configuration>
            <server>
                <id>1</id>
                <hostname>hostname1</hostname>
                <port>9444</port>
            </server>
            <server>
                <id>2</id>
                <hostname>hostname2</hostname>
                <port>9444</port>
            </server>
            <server>
                <id>3</id>
                <hostname>hostname3</hostname>
                <port>9444</port>
            </server>
        </raft_configuration>
    </keeper_server>

    <distributed_ddl>
        <path>/clickhouse/testcluster/task_queue/ddl</path>
    </distributed_ddl>
</clickhouse>

$ cat /etc/clickhouse-server/config.d/macros.xml

<?xml version="1.0" ?>
<clickhouse>
    <macros>
        <cluster>testcluster</cluster>
        <replica>replica1</replica>
        <shard>1</shard>
    </macros>
</clickhouse>
```

### hostname2

```xml
$ cat /etc/clickhouse-server/config.d/keeper.xml

<?xml version="1.0" ?>
<clickhouse>
    <keeper_server>
        <tcp_port>2181</tcp_port>
        <server_id>2</server_id>
        <log_storage_path>/var/lib/clickhouse/coordination/log</log_storage_path>
        <snapshot_storage_path>/var/lib/clickhouse/coordination/snapshots</snapshot_storage_path>

        <coordination_settings>
            <operation_timeout_ms>10000</operation_timeout_ms>
            <session_timeout_ms>30000</session_timeout_ms>
            <raft_logs_level>trace</raft_logs_level>
            <rotate_log_storage_interval>10000</rotate_log_storage_interval>
        </coordination_settings>

        <raft_configuration>
            <server>
                <id>1</id>
                <hostname>hostname1</hostname>
                <port>9444</port>
            </server>
            <server>
                <id>2</id>
                <hostname>hostname2</hostname>
                <port>9444</port>
            </server>
            <server>
                <id>3</id>
                <hostname>hostname3</hostname>
                <port>9444</port>
            </server>
        </raft_configuration>
    </keeper_server>

    <distributed_ddl>
        <path>/clickhouse/testcluster/task_queue/ddl</path>
    </distributed_ddl>
</clickhouse>

$ cat /etc/clickhouse-server/config.d/macros.xml

<?xml version="1.0" ?>
<clickhouse>
    <macros>
        <cluster>testcluster</cluster>
        <replica>replica2</replica>
        <shard>1</shard>
    </macros>
</clickhouse>
```

### hostname3

```xml
$ cat /etc/clickhouse-keeper/keeper_config.xml

<?xml version="1.0" ?>
<clickhouse>
    <keeper_server>
        <tcp_port>2181</tcp_port>
        <server_id>3</server_id>
        <log_storage_path>/var/lib/clickhouse/coordination/log</log_storage_path>
        <snapshot_storage_path>/var/lib/clickhouse/coordination/snapshots</snapshot_storage_path>

        <coordination_settings>
            <operation_timeout_ms>10000</operation_timeout_ms>
            <session_timeout_ms>30000</session_timeout_ms>
            <raft_logs_level>trace</raft_logs_level>
            <rotate_log_storage_interval>10000</rotate_log_storage_interval>
        </coordination_settings>

        <raft_configuration>
            <server>
                <id>1</id>
                <hostname>hostname1</hostname>
                <port>9444</port>
            </server>
            <server>
                <id>2</id>
                <hostname>hostname2</hostname>
                <port>9444</port>
            </server>
            <server>
                <id>3</id>
                <hostname>hostname3</hostname>
                <port>9444</port>
            </server>
        </raft_configuration>
    </keeper_server>
</clickhouse>

$ clickhouse-keeper --config /etc/clickhouse-keeper/keeper_config.xml
```

### on both ClickHouse nodes

```xml
$ cat /etc/clickhouse-server/config.d/clusters.xml

<?xml version="1.0" ?>
<clickhouse>
    <remote_servers>
        <testcluster>
            <shard>
                <replica>
                    <host>hostname1</host>
                    <port>9000</port>
                </replica>
                <replica>
                    <host>hostname2</host>
                    <port>9000</port>
                </replica>
            </shard>
        </testcluster>
    </remote_servers>
</clickhouse>
```

Then create a table

```sql
create table test on cluster '{cluster}'   ( A Int64, S String)
Engine = ReplicatedMergeTree('/clickhouse/{cluster}/tables/{database}/{table}','{replica}')
Order by A;

insert into test select number, '' from numbers(100000000);

-- on both nodes:
select count() from test;
```

## Useful references

- Official Keeper guide:
  https://clickhouse.com/docs/en/guides/sre/keeper/clickhouse-keeper/
- `clickhouse-keeper-client`:
  https://clickhouse.com/docs/en/operations/utilities/clickhouse-keeper-client
- Keeper HTTP API and dashboard (`26.1+`):
  https://clickhouse.com/docs/operations/utilities/clickhouse-keeper-http-api
- `system.zookeeper`:
  https://clickhouse.com/docs/operations/system-tables/zookeeper
- `system.zookeeper_connection`:
  https://clickhouse.com/docs/operations/system-tables/zookeeper_connection
- `system.zookeeper_connection_log`:
  https://clickhouse.com/docs/operations/system-tables/zookeeper_connection_log
- `system.zookeeper_info` (`26.1+`):
  https://clickhouse.com/docs/operations/system-tables/zookeeper_info
- `system.zookeeper_log`:
  https://clickhouse.com/docs/operations/system-tables/zookeeper_log
- `aggregated_zookeeper_log` upstream PR:
  resubmit https://github.com/ClickHouse/ClickHouse/pull/87208
- Altinity operator CHK examples:
  https://github.com/Altinity/clickhouse-operator/tree/master/docs/chk-examples
- Altinity operator Keeper dashboard JSON:
  https://github.com/Altinity/clickhouse-operator/blob/master/grafana-dashboard/ClickHouseKeeper_dashboard.json
- Altinity operator Keeper alert rules:
  https://github.com/Altinity/clickhouse-operator/blob/master/deploy/prometheus/prometheus-alert-rules-chkeeper.yaml
