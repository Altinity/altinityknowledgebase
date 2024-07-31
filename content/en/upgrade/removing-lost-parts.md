---
title: "Removing lost parts"
linkTitle: "Removing lost parts"
description: >
    Removing lost parts
---

## There might be parts left in ZooKeeper that don't exist on disk

The explanation is here https://github.com/ClickHouse/ClickHouse/pull/26716

The problem is introduced in ClickHouse® 20.1.

The problem is fixed in 21.8 and backported to 21.3.16, 21.6.9, 21.7.6.

## Regarding the procedure to reproduce the issue:

The procedure was not confirmed, but I think it should work.

1) Wait for a merge on a particular partition (or run an OPTIMIZE to trigger one)
At this point you can collect the names of parts participating in the merge from the system.merges table, or the system.parts table.

2) When the merge finishes, stop one of the replicas before the inactive parts are dropped (or detach the table).

3) Bring the replica back up (or attach the table).
Check that there are no inactive parts in system.parts, but they stayed in ZooKeeper.
Also check that the inactive parts got removed from ZooKeeper for another replica.
Here is the query to check ZooKeeper:
```
select name, ctime from system.zookeeper
where path='<table_zpath>/replicas/<replica_name>/parts/'
  and name like '<put an expression for the parts that were merged>'
```

4) Drop the partition on the replica that DOES NOT have those extra parts in ZooKeeper.
Check the list of parts in ZooKeeper.
We hope that after this the parts on disk will be removed on all replicas, but one of the replicas will still have some parts left in ZooKeeper.
If this happens, then we think that after a restart of the replica with extra parts in ZooKeeper it will try to download them from another replica.

## A query to find 'forgotten' parts

https://kb.altinity.com/altinity-kb-useful-queries/parts-consistency/#compare-the-list-of-parts-in-zookeeper-with-the-list-of-parts-on-disk

## A query to drop empty partitions with failing replication tasks

```sql
select 'alter table '||database||'.'||table||' drop partition id '''||partition_id||''';' 
from (
select database, table, splitByChar('_',new_part_name)[1] partition_id
from system.replication_queue
where type='GET_PART' and not is_currently_executing and create_time < toStartOfDay(yesterday())
group by database, table, partition_id) q
left join 
(select database, table, partition_id, countIf(active) cnt_active, count() cnt_total
from system.parts group by  database, table, partition_id
) p using database, table, partition_id
where cnt_active=0
```
