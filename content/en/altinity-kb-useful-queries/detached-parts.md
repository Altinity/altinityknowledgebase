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
ClickHouse® users should monitor for detached parts and act quickly when they appear. Here is what the different statuses of detached parts mean:

1. Parts are renamed to **ignored** if they were found during ATTACH together with other, bigger parts that cover the same blocks of data, i.e. they were already merged into something else.
2. Parts are renamed to **broken** if ClickHouse was not able to load data from the parts. There could be different reasons: some files are lost, checksums are not correct, etc.
3. Parts are renamed to **unexpected** if they are present locally, but are not found in ZooKeeper, in case when an insert was not completed properly. The part is detached only if it's old enough (5 minutes), otherwise CH registers this part in ZooKeeper as a new part.
4. Parts are renamed to **cloned** if ClickHouse has had some parts on local disk while repairing lost replica so already existed parts being renamed and put in detached directory. Controlled by setting `detach_old_local_parts_when_cloning_replica`.

'Ignored' parts are safe to delete. 'Unexpected' and 'broken' should be investigated, but it might not be an easy thing to do, especially for older parts. If the `system.part_log table` is enabled you can find some information there. Otherwise you will need to look in `clickhouse-server.log` for what happened when the parts were detached.
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
# rg forgetPartAndMoveToDetached --type cpp
# rg renameToDetached --type cpp
# rg makeCloneInDetached --type cpp
broken
unexpected
ignored
noquorum
merge-not-byte-identical
mutate-not-byte-identical - 
broken-on-start
clone
covered-by-broken  - that means that ClickHouse during initialization of replicated table detected that some part is not ok, and decided to refetch it from healthy replicas. So the part itself will be detached as 'broken' and if that part was a result of merge / mutation all the previuos generations of that will be marked as covered-by-broken. If clickhouse was able to download the final part you don't need those covered-by-broken.
```

The list of DETACH_REASONS: https://github.com/ClickHouse/ClickHouse/blob/master/src/Storages/MergeTree/MergeTreePartInfo.h#L163
