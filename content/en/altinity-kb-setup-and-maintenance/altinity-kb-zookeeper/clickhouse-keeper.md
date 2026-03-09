---
title: "Using clickhouse-keeper"
linkTitle: "Using clickhouse-keeper"
description: >
    Current guidance for running ClickHouse Keeper as the ZooKeeper-compatible coordination service for ClickHouse
keywords:
  - clickhouse keeper
  - clickhouse-keeper
  - zookeeper
---

ClickHouse Keeper is the ZooKeeper-compatible coordination service used by ClickHouse for replicated tables and `ON CLUSTER` DDL. For new self-managed deployments it is the default recommendation instead of Apache ZooKeeper.

This page is a practical Altinity KB summary. For the full upstream reference, use the official ClickHouse Keeper guide:
https://clickhouse.com/docs/en/guides/sre/keeper/clickhouse-keeper/

Background material that is still useful:

- slides: https://presentations.clickhouse.com/meetup54/keeper.pdf
- video: https://youtu.be/IfgtdU1Mrm0?t=2682

## Current status (last updated: March 2026)

The old 2023 guidance in this article is obsolete. In particular, the recommendations around `23.3` and `23.7` should no longer be treated as the current baseline.

Current practical guidance:

- For new installations, prefer ClickHouse Keeper over Apache ZooKeeper.
- Use a current supported stable release of ClickHouse / Keeper. Do not evaluate Keeper based on early `23.x` behavior.
- `async_replication` is available in `23.9+` and is recommended once all Keeper nodes in the ensemble support it.
- Keeper feature flags are visible in `system.zookeeper_connection` and `system.zookeeper_connection_log`.
- Some Keeper feature flags are enabled by default in `25.7+`. If you plan to move directly from a version older than `24.9`, first upgrade the Keeper ensemble to `24.9+`.
- Dynamic reconfiguration and quorum-loss recovery are documented workflows now; you do not need to rely only on old test configs and source code comments anymore.

## Compatibility and limits

- Keeper speaks the ZooKeeper client protocol, so standard ZooKeeper clients can talk to it.
- Keeper snapshots/logs are not format-compatible with ZooKeeper. Use `clickhouse-keeper-converter` for migration.
- A mixed ZooKeeper / ClickHouse Keeper quorum is not possible.
- Keeper is highly compatible with ZooKeeper for ClickHouse workloads, but not every ZooKeeper feature is implemented. Check the official `Unsupported features` section before depending on niche ZooKeeper APIs or non-ClickHouse external integrations.

## Topology guidance

The biggest problem with many older examples, including the original version of this page, is the 2-node Keeper layout. That layout is fine for a lab, but not for production: a 2-node Keeper cluster loses quorum after one failure.

Practical guidance:

- Use `3` or `5` Keeper nodes.
- For a small 2-server ClickHouse cluster, a common pattern is `2` data nodes plus `1` Keeper-only tie-breaker node.
- Keep the `server_id -> hostname` mapping stable across replacements.
- Prefer hostnames over raw IP addresses.
- If you use embedded Keeper on very busy data nodes, validate latency carefully. Keeper is usually the right choice, but it is not magic and very loaded systems can still behave worse after migration.

## How to run Keeper

Keeper can run embedded inside `clickhouse-server` or as the standalone `clickhouse-keeper` binary.

Standalone example:

```bash
clickhouse-keeper --config /etc/clickhouse-keeper/keeper_config.xml
```

Related KB pages:

- systemd service file:
  https://kb.altinity.com/altinity-kb-setup-and-maintenance/altinity-kb-zookeeper/clickhouse-keeper-service/
- init.d script:
  https://kb.altinity.com/altinity-kb-setup-and-maintenance/altinity-kb-zookeeper/clickhouse-keeper-initd/

## Example: two ClickHouse data nodes with a 3-node Keeper ensemble

A better minimal production pattern is:

- `ch1` - ClickHouse data node + Keeper
- `ch2` - ClickHouse data node + Keeper
- `ch3` - Keeper-only tie-breaker

### Keeper config

Use the same `raft_configuration` on all three Keeper nodes. The main per-node difference is `server_id`.

Example for `ch1` (`server_id=1`):

```xml
<?xml version="1.0"?>
<clickhouse>
    <keeper_server>
        <tcp_port>2181</tcp_port>
        <server_id>1</server_id>
        <log_storage_path>/var/lib/clickhouse/coordination/log</log_storage_path>
        <snapshot_storage_path>/var/lib/clickhouse/coordination/snapshots</snapshot_storage_path>
        <enable_reconfiguration>true</enable_reconfiguration>

        <coordination_settings>
            <operation_timeout_ms>10000</operation_timeout_ms>
            <session_timeout_ms>30000</session_timeout_ms>
            <raft_logs_level>information</raft_logs_level>
            <async_replication>true</async_replication>
        </coordination_settings>

        <raft_configuration>
            <server>
                <id>1</id>
                <hostname>ch1</hostname>
                <port>9234</port>
            </server>
            <server>
                <id>2</id>
                <hostname>ch2</hostname>
                <port>9234</port>
            </server>
            <server>
                <id>3</id>
                <hostname>ch3</hostname>
                <port>9234</port>
            </server>
        </raft_configuration>
    </keeper_server>
</clickhouse>
```

On `ch2` use the same config with `<server_id>2</server_id>`. On `ch3` use `<server_id>3</server_id>`.

If you need encrypted connections:

- use `tcp_port_secure` for client-to-Keeper TLS
- use `<raft_configuration><secure>true</secure></raft_configuration>` for Keeper inter-node encryption

### ClickHouse config on data nodes

Point ClickHouse to the whole Keeper ensemble, not just to localhost:

```xml
<?xml version="1.0"?>
<clickhouse>
    <zookeeper>
        <node index="1">
            <host>ch1</host>
            <port>2181</port>
        </node>
        <node index="2">
            <host>ch2</host>
            <port>2181</port>
        </node>
        <node index="3">
            <host>ch3</host>
            <port>2181</port>
        </node>
    </zookeeper>

    <distributed_ddl>
        <path>/clickhouse/task_queue/ddl</path>
    </distributed_ddl>
</clickhouse>
```

Example macros for `ch1`:

```xml
<?xml version="1.0"?>
<clickhouse>
    <macros>
        <shard>1</shard>
        <replica>replica1</replica>
    </macros>
</clickhouse>
```

Example macros for `ch2`:

```xml
<?xml version="1.0"?>
<clickhouse>
    <macros>
        <shard>1</shard>
        <replica>replica2</replica>
    </macros>
</clickhouse>
```

Cluster definition on both data nodes:

```xml
<?xml version="1.0"?>
<clickhouse>
    <remote_servers>
        <cluster_1S_2R>
            <shard>
                <replica>
                    <host>ch1</host>
                    <port>9000</port>
                </replica>
                <replica>
                    <host>ch2</host>
                    <port>9000</port>
                </replica>
            </shard>
        </cluster_1S_2R>
    </remote_servers>
</clickhouse>
```

### Test with a replicated table

Use `{uuid}` in Keeper paths for new replicated tables. This avoids path reuse problems when tables are created and dropped frequently.

```sql
CREATE DATABASE db1 ON CLUSTER 'cluster_1S_2R';

CREATE TABLE db1.test ON CLUSTER 'cluster_1S_2R'
(
    A Int64,
    S String
)
ENGINE = ReplicatedMergeTree('/clickhouse/tables/{shard}/{database}/{uuid}', '{replica}')
ORDER BY A;

INSERT INTO db1.test VALUES (1, 'a'), (2, 'b');

SELECT hostName(), count()
FROM clusterAllReplicas('cluster_1S_2R', db1, test)
GROUP BY hostName()
ORDER BY hostName();
```

## Operational checks

Check Keeper connectivity and enabled feature flags from ClickHouse:

```sql
SELECT
    name,
    host,
    port,
    keeper_api_version,
    enabled_feature_flags,
    session_timeout_ms,
    last_zxid_seen
FROM system.zookeeper_connection;
```

Inspect the current Keeper cluster configuration:

```bash
clickhouse-keeper-client --host ch1 --port 2181 -q "get /keeper/config"
```

Basic health checks:

```bash
echo ruok | nc ch1 2181
echo mntr | nc ch1 2181
```

`ruok` should return `imok`.

If you need to change Keeper membership dynamically, use `clickhouse-keeper-client` `reconfig` commands and keep `enable_reconfiguration=true` on Keeper nodes.

If you lose quorum, follow the official `Recovering after losing quorum` procedure instead of improvising edits in Keeper state directories.

## Useful references

- official Keeper guide:
  https://clickhouse.com/docs/en/guides/sre/keeper/clickhouse-keeper/
- `clickhouse-keeper-client` utility:
  https://clickhouse.com/docs/en/operations/utilities/clickhouse-keeper-client
- `system.zookeeper_connection`:
  https://clickhouse.com/docs/en/operations/system-tables/zookeeper_connection
- `system.zookeeper_connection_log`:
  https://clickhouse.com/docs/en/operations/system-tables/zookeeper_connection_log

Examples of current Keeper configs and workflows also exist in the ClickHouse integration tests under `tests/integration/test_keeper_*`.
