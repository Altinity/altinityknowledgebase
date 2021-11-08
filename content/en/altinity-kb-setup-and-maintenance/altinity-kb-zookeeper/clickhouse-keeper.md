---
title: "clickhouse-keeper"
linkTitle: "clickhouse-keeper"
description: >
    clickhouse-keeper
---
In 21.3 there is already an option to run own clickhouse zookeeper implementation. It's still experimental, and still need to be started additionally on few nodes (similar to 'normal' zookeeper) and speaks normal zookeeper protocol - needed to simplify A/B tests with real zookeeper.

No docs, for now, only PR with code & tests. Of course, if you want to play with it - you can, and early feedback is very valuable. But be prepared for a lot of tiny issues here and there, so don't be disappointed if it will not satisfy your expectations for some reason. It's very-very fresh :slightly_smiling_face: It's ready for some trial runs, but not ready yet for production use cases.

To test that you need to run 3 instances of clickhouse-server (which will mimic zookeeper) with an extra config like that:

[https://github.com/ClickHouse/ClickHouse/blob/c8b1004ecb4bfc4aa581dbcbbbe3a4c72ce57123/tests/integration/test_keeper_multinode_simple/configs/enable_keeper1.xml](https://github.com/ClickHouse/ClickHouse/blob/c8b1004ecb4bfc4aa581dbcbbbe3a4c72ce57123/tests/integration/test_keeper_multinode_simple/configs/enable_keeper1.xml)

[https://github.com/ClickHouse/ClickHouse/blob/c8b1004ecb4bfc4aa581dbcbbbe3a4c72ce57123/tests/integration/test_keeper_snapshots/configs/enable_keeper.xml](https://github.com/ClickHouse/ClickHouse/blob/c8b1004ecb4bfc4aa581dbcbbbe3a4c72ce57123/tests/integration/test_keeper_snapshots/configs/enable_keeper.xml)

or event single instance with config like that: [https://github.com/ClickHouse/ClickHouse/blob/master/tests/config/config.d/keeper_port.xml](https://github.com/ClickHouse/ClickHouse/blob/master/tests/config/config.d/keeper_port.xml)
[https://github.com/ClickHouse/ClickHouse/blob/master/tests/config/config.d/zookeeper.xml](https://github.com/ClickHouse/ClickHouse/blob/master/tests/config/config.d/zookeeper.xml)

And point all the clickhouses (zookeeper config secton) to those nodes / ports.

Latest testing version is recommended. We will be thankful for any feedback.

## Example of a simple cluster with 2 nodes of Clickhouse using built-in keeper

For example you can start two Clikhouse nodes (hostname1, hostname2)

### hostname1

```xml
$ cat /etc/clickhouse-server/config.d/keeper.xml

<?xml version="1.0" ?>
<yandex>
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
      </raft_configuration>

    </keeper_server>

    <zookeeper>
        <node>
            <host>localhost</host>
            <port>2181</port>
        </node>
    </zookeeper>

    <distributed_ddl>
        <path>/clickhouse/int/task_queue/ddl</path>
    </distributed_ddl>
</yandex>

$ cat /etc/clickhouse-server/config.d/macros.xml

<?xml version="1.0" ?>
<yandex>
    <macros>
        <cluster>testcluster</cluster>
        <replica>replica1</replica>
        <shard>1</shard>
    </macros>
</yandex>
```

### hostname2

```xml
$ cat /etc/clickhouse-server/config.d/keeper.xml

<?xml version="1.0" ?>
<yandex>
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
      </raft_configuration>

    </keeper_server>

    <zookeeper>
        <node>
            <host>localhost</host>
            <port>2181</port>
        </node>
    </zookeeper>

    <distributed_ddl>
        <path>/clickhouse/int/task_queue/ddl</path>
    </distributed_ddl>
</yandex>

$ cat /etc/clickhouse-server/config.d/macros.xml

<?xml version="1.0" ?>
<yandex>
    <macros>
        <cluster>testcluster</cluster>
        <replica>replica2</replica>
        <shard>1</shard>
    </macros>
</yandex>
```

### on both

```xml
$ cat /etc/clickhouse-server/config.d/clusters.xml

<?xml version="1.0" ?>
<yandex>
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
</yandex>
```

Then create a table

```sql
create table test on '{cluster}'   ( A Int64, S String)
Engine = ReplicatedMergeTree('/clickhouse/{cluster}/tables/{database}/{table}','{replica}')
Order by A;

insert into test select number, '' from numbers(100000000);

-- on both nodes:
select count() from test;
```
