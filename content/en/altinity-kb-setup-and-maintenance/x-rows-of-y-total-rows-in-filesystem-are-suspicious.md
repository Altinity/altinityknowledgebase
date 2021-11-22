---
title: "X rows of Y total rows in filesystem are suspicious"
linkTitle: "X rows of Y total rows in filesystem are suspicious"
description: >
    X rows of Y total rows in filesystem are suspicious
---
{{% alert title="Warning" color="warning" %}}
The local set of parts of table doesn't look like the set of parts in ZooKeeper. 100.00 rows of 150.00 total rows in filesystem are suspicious. There are 1 unexpected parts with 100 rows (1 of them is not just-written with 100 rows), 0 missing parts (with 0 blocks).: Cannot attach table.
{{% /alert %}}

ClickHouse has a registry of parts in ZooKeeper.

And during the start ClickHouse compares that list of parts on a local disk is consistent with a list in ZooKeeper. If the lists are too different ClickHouse denies to start because it could be an issue with settings, wrong Shard or wrong Replica macros. But this safe-limiter throws an exception if the difference is more 50% (in rows).

In your case the table is very small and the difference >50% ( 100.00 vs 150.00 ) is only a single part mismatch, which can be the result of hard restart.

```sql
SELECT * FROM system.merge_tree_settings WHERE name = 'replicated_max_ratio_of_wrong_parts'

┌─name────────────────────────────────┬─value─┬─changed─┬─description──────────────────────────────────────────────────────────────────────────┬─type──┐
│ replicated_max_ratio_of_wrong_parts │ 0.5   │       0 │ If ratio of wrong parts to total number of parts is less than this - allow to start. │ Float │
└─────────────────────────────────────┴───────┴─────────┴──────────────────────────────────────────────────────────────────────────────────────┴───────┘
```

You can set another value of `replicated_max_ratio_of_wrong_parts` for all MergeTree tables or per table.

[https://clickhouse.tech/docs/en/operations/settings/merge-tree-settings](https://clickhouse.tech/docs/en/operations/settings/merge-tree-settings)


## After manipulation with storage_policies and disks

When storage policy changes (one disk was removed from it), ClickHouse compared parts on disk and this replica state in ZooKeeper and found out that a lot of parts (from removed disk) disappeared. So ClickHouse removed them from the replica state in ZooKeeper and scheduled to fetch them from other replicas.

After we add the removed disk to storage_policy back, ClickHouse finds missing parts, but at this moment they are not registered for that replica.
ClickHouse produce error message like this:

```
<Error> Application: DB::Exception: The local set of parts of table default.tbl doesn't look like the set of parts in ZooKeeper: 14.96 billion rows of 16.24 billion total rows in filesystem are suspicious. There are 45 unexpected parts with 14960302620 rows (43 of them is not just-written with 14959824636 rows), 0 missing parts (with 0 blocks).: Cannot attach table `default`.`tbl` from metadata file /var/lib/clickhouse/metadata/default/tbl.sql from query ATTACH TABLE default.tbl ... ENGINE=ReplicatedMergeTree('/clickhouse/tables/0/default/tbl', 'replica-0')... SETTINGS index_granularity = 1024, storage_policy = 'ebs_hot_and_cold': while loading database `default` from path /var/lib/clickhouse/metadata/data
```

At this point, it's possible to either tune setting `replicated_max_ratio_of_wrong_parts` or do force restore, but it will end up downloading all "missing" parts from other replicas, which can take a lot of time for big tables.

### ClickHouse 21.7+

1. Rename table SQL attach script in order to prevent ClickHouse from attaching it at startup.

```sh
mv /var/lib/clickhouse/metadata/default/tbl.sql /var/lib/clickhouse/metadata/default/tbl.sql.bak
```

2. Start ClickHouse server.

3. Remove metadata for this replica from ZooKeeper.

```
SYSTEM DROP REPLICA 'replica-0' FROM ZKPATH '/clickhouse/tables/0/default/tbl';

SELECT * FROM system.zookeeper WHERE path = '/clickhouse/tables/0/default/tbl/replicas';
```

4. Rename table SQL attach script back to normal name.

```sh
mv /var/lib/clickhouse/metadata/default/tbl.sql.bak /var/lib/clickhouse/metadata/default/tbl.sql
```

5. Attach table to ClickHouse server, because there is no metadata in ZooKeeper, ClickHouse will attach it in read only state.

```
ATTACH TABLE default.tbl;
```

6. Run `SYSTEM RESTORE REPLICA` in order to sync state on disk and in ZooKeeper.

```
SYSTEM RESTORE REPLICA default.tbl;
```

7. Run `SYSTEM SYNC REPLICA` to download missing parts from other replicas.

```
SYSTEM SYNC REPLICA default.tbl;
```
