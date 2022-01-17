---
title: "ZooKeeper schema"
linkTitle: "ZooKeeper schema"
description: >
    ZooKeeper schema
---
## /metadata

Table schema.

```bash
date column -> legacy MergeTree partition expression.
sampling expression -> SAMPLE BY
index granularity -> index_granularity
mode -> type of MergeTree table
sign column -> sign - CollapsingMergeTree / VersionedCollapsingMergeTree
primary key -> ORDER BY key if PRIMARY KEY not defined.
sorting key -> ORDER BY key if PRIMARY KEY defined.
data format version -> 1
partition key -> PARTITION BY
granularity bytes -> index_granularity_bytes

types of MergeTree tables:
Ordinary            = 0
Collapsing          = 1
Summing             = 2
Aggregating         = 3
Replacing           = 5
Graphite            = 6
VersionedCollapsing = 7
```

## /mutations

Log of latest mutations

## /columns

List of columns for latest (reference) table version. Replicas would try to reach this state.

## /log

Log of latest actions with table. 

Related settings:

```sql
┌─name────────────────────────┬─value─┬─changed─┬─description────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┬─type───┐
│ max_replicated_logs_to_keep │ 1000  │       0 │ How many records may be in log, if there is inactive replica. Inactive replica becomes lost when when this number exceed.                                                  │ UInt64 │
│ min_replicated_logs_to_keep │ 10    │       0 │ Keep about this number of last records in ZooKeeper log, even if they are obsolete. It doesn't affect work of tables: used only to diagnose ZooKeeper log before cleaning. │ UInt64 │
└─────────────────────────────┴───────┴─────────┴────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┴────────┘
```

## /replicas

List of table replicas.

## /replicas/replica_name/

### /replicas/replica_name/mutation_pointer

Pointer to the latest mutation executed by replica

### /replicas/replica_name/log_pointer

Pointer to the latest task from replication_queue executed by replica

### /replicas/replica_name/max_processed_insert_time

### /replica/replica_name/metadata

Table schema of specific replica

### /replica/replica_name/columns

Columns list of specific replica.

## /quorum

Used for quorum inserts.
