---
title: "Can detached parts in ClickHouse® be dropped?"
linkTitle: "Can detached parts be dropped?"
description: >
    Cleaning up detached parts without data loss
keywords: 
  - clickhouse detached parts
  - clickhouse detach
  - clickhouse drop partition
---

### Overview

This article explains what detached parts are in ClickHouse® (why they appear, what each detached prefix means, and how to safely clean them up). Use this guide when investigating missing data, replication issues, or disk growth related to the `detached` directory.

Detached parts act like the “Recycle Bin” in Windows. When ClickHouse® deems some data unneeded—often during internal reconciliations at server startup—it moves the data to the detached area instead of deleting it immediately.

Recovery: If you’re missing data due to misconfiguration or an error (such as connecting to the wrong ZooKeeper), check the detached parts. The missing data might be recoverable through manual intervention.

Cleanup: Otherwise, clean up the detached parts periodically to free disk space.

Regarding detached parts and the absence of an automatic cleanup feature within ClickHouse®: this was a deliberate decision, as there is a possibility that data may appear there due to a bug in ClickHouse®'s code, a hardware error (such as a memory error or disk failure), etc. In such cases, automatic cleanup is not desirable.

ClickHouse® users should monitor for detached parts and act quickly when they appear. Here is what the different statuses of detached parts mean:

1. **ignored**: inactive parts that were superseded by a successful merge. If the merged part is valid, the older inactive parts are renamed with `ignored_` and moved to `detached`.
2. **broken**: parts that ClickHouse® could not load during runtime operations (for example during ATTACH). There could be different reasons: files are lost, checksums are not correct, etc.
3. **broken-on-start**: parts that failed to load during table startup. These count toward `max_suspicious_broken_parts` and can prevent a server from starting.
4. **broken-from-backup**: parts that failed to restore during RESTORE operations.
5. **clone**: parts detached during replica repair when local parts already exist. Controlled by `detach_old_local_parts_when_cloning_replica`.
6. **noquorum**: parts created during INSERTs that failed quorum requirements.
7. **merge-not-byte-identical** / **mutate-not-byte-identical**: replica consistency issues where parts are logically equivalent but not byte-identical.
8. **covered-by-broken**: older generations of parts that are covered by a newer broken part detected during initialization; they can be removed after healthy parts are restored.
9. **attaching**: temporary prefix during ATTACH PART operations. Do not delete manually while the operation is in progress.
10. **deleting**: temporary prefix during DROP DETACHED operations. Do not delete manually while the operation is in progress.
11. **tmp-fetch**: temporary prefix during replication fetch operations. Do not delete manually while the operation is in progress.

Note on **unexpected** vs **ignored** (simple rule of thumb): **unexpected** is like a “we found this in the attic” tag, while **ignored** is like “we already replaced this, keep it aside.” In ReplicatedMergeTree startup sanity checks, parts that are unexpected relative to ZooKeeper are typically renamed to **ignored**. So a part found on disk but missing in ZooKeeper will usually appear as **ignored**, not **unexpected**, even though **unexpected** is a valid reason in the codebase.

Important distinction for ReplicatedMergeTree: ClickHouse® tracks expected parts from ZooKeeper and unexpected parts found locally. Broken expected parts increment the `max_suspicious_broken_parts` counter (can block startup). Broken unexpected parts use a separate counter and do not block startup.

**Safe to delete (after validation):** **ignored**, **clone**.

**Temporary - do not delete while in progress:** **attaching**, **deleting**, **tmp-fetch**.

**Investigate before deleting:** **broken**, **broken-on-start**, **broken-from-backup**, **covered-by-broken**, **noquorum**, **merge-not-byte-identical**, **mutate-not-byte-identical**.

If the `system.part_log` table is enabled you can find some information there. Otherwise you will need to look in `clickhouse-server.log` for what happened when the parts were detached.
If there is another way you could confirm that there is no data loss in the affected tables, you could simply delete all detached parts.

Again, it is important to monitor for detached parts and act quickly when they appear. If `clickhouse-server.log` is lost it might be impossible to figure out what happened and why the parts were detached.
You can use `system.asynchronous_metrics` or `system.detached_parts` for monitoring.
```sql
select metric from system.asynchronous_metrics where metric ilike '%detach%'

NumberOfDetachedByUserParts
NumberOfDetachedParts
```

Here is a quick way to find out if you have detached parts along with the reason why.
```sql
SELECT database, table, reason, count()
FROM system.detached_parts
GROUP BY database, table, reason
ORDER BY database ASC, table ASC, reason ASC
```

### drop detached
The DROP DETACHED command in ClickHouse® is used to remove parts or partitions that have previously been detached (i.e., moved to the detached directory and forgotten by the server). The syntax is:

```
ALTER TABLE table_name [ON CLUSTER cluster] DROP DETACHED PARTITION|PART ALL|partition_expr
```

This command removes the specified part or all parts of the specified partition from the detached directory. For more details on how to specify the partition expression, see the documentation on how to set the partition expression DROP DETACHED PARTITION|PART.

Note: You must have the allow_drop_detached setting enabled to use this command allow_drop_detached

### drop all script

Here is a query that can help with investigations. It looks for active parts containing the same data blocks as the detached parts. It 
generates commands to drop the detached parts. 

```sql
with ['broken','unexpected','noquorum','ignored','broken-on-start','clone','attaching','deleting','tmp-fetch',
      'covered-by-broken','merge-not-byte-identical','mutate-not-byte-identical','broken-from-backup'] as DETACH_REASONS
select a.*,
  concat('alter table ',database,'.',table,' drop detached part ''',a.name,''' settings allow_drop_detached=1;') as drop,
  concat('sudo rm -r ',a.path) as rm
from (select * replace(part[1] as partition_id, toInt64(part[2]) as min_block_number, toInt64(part[3]) as max_block_number),
  arrayFilter(x -> x not in DETACH_REASONS, splitByChar('_',name)) as part
from system.detached_parts) a
left join (select database, table, partition_id, name, active, min_block_number, max_block_number from system.parts where active) b 
on a.database=b.database and a.table=b.table and a.partition_id=b.partition_id
where a.min_block_number >= b.min_block_number
  and a.max_block_number <= b.max_block_number
order by table, min_block_number, max_block_number
settings join_use_nulls=1
```

### Other reasons

```
broken
unexpected
ignored
noquorum
 merge-not-byte-identical
 mutate-not-byte-identical
broken-on-start
broken-from-backup
clone
attaching
deleting
tmp-fetch
 covered-by-broken
```

**covered-by-broken** means ClickHouse® detected a broken part during initialization of a replicated table and decided to refetch it from healthy replicas. The broken part is detached as `broken`, and if that part was a result of merge or mutation, all previous generations are marked `covered-by-broken`. Once the healthy final part is restored, you do not need the `covered-by-broken` parts.

The list of DETACH_REASONS: https://github.com/ClickHouse/ClickHouse/blob/master/src/Storages/MergeTree/MergeTreePartInfo.h#L163

### Further reading

Altinity blog: *Understanding Detached Parts in ClickHouse®* - https://altinity.com/blog/understanding-detached-parts-in-clickhouse

### Appendix: Detached Part Types and Source References

| Detached part type | Source code reference |
| --- | --- |
| `broken` | https://github.com/ClickHouse/ClickHouse/blob/53e451c70f33f167efe57dbf455ff9776d6e880f/src/Storages/StorageReplicatedMergeTree.cpp#L2306-L2334 |
| `unexpected` | https://github.com/ClickHouse/ClickHouse/blob/53e451c70f33f167efe57dbf455ff9776d6e880f/src/Storages/MergeTree/MergeTreeData.cpp#L5389-L5393 |
| `ignored` | https://github.com/ClickHouse/ClickHouse/blob/53e451c70f33f167efe57dbf455ff9776d6e880f/src/Storages/MergeTree/MergeTreeSettings.cpp#L507-L512 |
| `noquorum` | https://github.com/ClickHouse/ClickHouse/blob/53e451c70f33f167efe57dbf455ff9776d6e880f/src/Storages/MergeTree/ReplicatedMergeTreeRestartingThread.cpp#L264-L284 |
| `broken-on-start` | https://github.com/ClickHouse/ClickHouse/blob/53e451c70f33f167efe57dbf455ff9776d6e880f/src/Storages/MergeTree/MergeTreeData.cpp#L2301-L2399 |
| `clone` | https://github.com/ClickHouse/ClickHouse/blob/53e451c70f33f167efe57dbf455ff9776d6e880f/src/Storages/StorageReplicatedMergeTree.cpp#L3510-L3518 |
| `attaching` | https://github.com/ClickHouse/ClickHouse/blob/53e451c70f33f167efe57dbf455ff9776d6e880f/src/Storages/MergeTree/MergeTreeData.cpp#L7541-L7671 |
| `deleting` | https://github.com/ClickHouse/ClickHouse/blob/53e451c70f33f167efe57dbf455ff9776d6e880f/src/Storages/MergeTree/MergeTreeData.cpp#L7541-L7583 |
| `tmp-fetch` | https://github.com/ClickHouse/ClickHouse/blob/53e451c70f33f167efe57dbf455ff9776d6e880f/src/Storages/MergeTree/DataPartsExchange.cpp#L408-L413 |
| `covered-by-broken` | https://github.com/ClickHouse/ClickHouse/blob/53e451c70f33f167efe57dbf455ff9776d6e880f/src/Storages/StorageReplicatedMergeTree.cpp#L4571-L4588 |
| `merge-not-byte-identical` | https://github.com/ClickHouse/ClickHouse/blob/53e451c70f33f167efe57dbf455ff9776d6e880f/src/Storages/MergeTree/MergeFromLogEntryTask.cpp#L441-L443 |
| `mutate-not-byte-identical` | https://github.com/ClickHouse/ClickHouse/blob/53e451c70f33f167efe57dbf455ff9776d6e880f/src/Storages/MergeTree/MutateFromLogEntryTask.cpp#L278-L280 |
| `broken-from-backup` | https://github.com/ClickHouse/ClickHouse/blob/53e451c70f33f167efe57dbf455ff9776d6e880f/src/Storages/MergeTree/MergeTreeData.cpp#L6919-L6934 |
