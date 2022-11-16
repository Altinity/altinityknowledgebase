---
title: "Distributed table to Cluster"
linkTitle: "Distributed table to cluster"
description: >
  Distributed table to cluster
---

# Distributed table to Cluster

In order to shift INSERTS to a standby cluster (for example increase zone availability or disaster recovery) some ClickHouse features can be used.

Basically we need to create a distributed table, a MV, rewrite the `remote_servers.xml` config file and tune some parameters.

Distributed engine information and parameters:
https://clickhouse.com/docs/en/engines/table-engines/special/distributed/

## Steps

### Create a Distributed table in the source cluster

For example, we should have a `ReplicatedMergeTree` table in which all inserts are falling. This table is the first step in our pipeline:

```sql
CREATE TABLE db.inserts_source ON CLUSTER 'source'
(
    column1 String
    column2 DateTime
    .....
)
ENGINE = ReplicatedMergeTree('/clickhouse/tables/{shard}/inserts_source', '{replica}')
PARTITION BY toYYYYMM(column2)
ORDER BY (column1, column2)
```

This table lives in the source cluster and all INSERTS go there. In order to shift all INSERTS in the source cluster to destination cluster we can create a `Distributed` table that points to another `ReplicatedMergeTree` in the destination cluster:

```sql
CREATE TABLE db.inserts_source_dist ON CLUSTER 'source'
(
    column1 String
    column2 DateTime
    .....
)
ENGINE = Distributed('destination', db, inserts_destination)
```

### Create a Materialized View to shift INSERTS to destination cluster:

```sql
CREATE MATERIALIZED VIEW shift_inserts ON CLUSTER 'source'
TO db.inserts_source_dist AS
SELECT * FROM db.inserts_source
```

### Create a ReplicatedMergeTree table in the destination cluster:

This is the table in the destination cluster that is pointed by the distributed table in the source cluster

```sql
CREATE TABLE db.inserts_destination ON CLUSTER 'destination'
(
    column1 String
    column2 DateTime
    .....
)
ENGINE = ReplicatedMergeTree('/clickhouse/tables/{shard}/inserts_destination', '{replica}')
PARTITION BY toYYYYMM(column2)
ORDER BY (column1, column2)
```

### Rewrite remote_servers.xml:

All the hostnames/FQDN from each replica/node must be accessible from both clusters. Also the remote_servers.xml from the source cluster should read like this:

```xml
<clickhouse>
    <remote_servers>
        <source>   
            <shard>
                <replica>
                    <host>host03</host>
                    <port>9000</port>
                </replica>
                <replica>
                    <host>host04</host>
                    <port>9000</port>
                </replica>
            </shard>
        </source>
        <destination>   
            <shard>
                <replica>
                    <host>host01</host>
                    <port>9000</port>
                </replica>
                <replica>
                    <host>host02</host>
                    <port>9000</port>
                </replica>
            </shard>
        </destination>
   </remote_servers>
</clickhouse>
```

### Configuration settings

Depending on your use case you can set the the distributed INSERTs to sync or async mode. This example is for async mode:
Put this config settings on the default profile. Check for more info about the possible modes:

https://clickhouse.com/docs/en/operations/settings/settings#insert_distributed_sync

```xml
<clickhouse>
    ....
    <profiles>
        <default>
            <!-- StorageDistributed DirectoryMonitors try to batch individual inserts into bigger ones to increase performance -->
            <distributed_directory_monitor_batch_inserts>1</distributed_directory_monitor_batch_inserts>
            <!-- StorageDistributed DirectoryMonitors try to split batch into smaller in case of failures -->
            <distributed_directory_monitor_split_batch_on_failure>1</distributed_directory_monitor_split_batch_on_failure>
        </default>
    .....
    </profiles>
</clickhouse>
```
