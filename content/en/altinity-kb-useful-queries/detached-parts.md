---
title: "Can detached parts be dropped?"
linkTitle: "Can detached parts be dropped?"
description: >
    Can detached parts be dropped?
---
Here is what different statuses mean:

1. Parts are renamed to 'ignored' if they were found during ATTACH together with other, bigger parts that cover the same blocks of data, i.e. they were already merged into something else.
2. parts are renamed to 'broken' if ClickHouse was not able to load data from the parts. There could be different reasons: some files are lost, checksums are not correct, etc.
3. parts are renamed to 'unexpected' if they are present locally, but are not found in ZooKeeper, in case when an insert was not completed properly. The part is detached only if it's old enough (5 minutes), otherwise CH registers this part in ZooKeeper as a new part.
4. parts are renamed to 'cloned' if ClickHouse have had some parts on local disk while repairing lost replica so already existed parts being renamed and put in detached directory. Controlled by setting `detach_old_local_parts_when_cloning_replica`.

'Ignored' parts are safe to delete. 'Unexpected' and 'broken' should be investigated, but it might not be an easy thing to do, especially for older parts. If the `system.part_log table` is enabled you can find some information there. Otherwise you will need to look in `clickhouse-server.log` for what happened when the parts were detached.
If there is another way you could confirm that there is no data loss in the affected tables, you could simply delete all detached parts.

Here is a query that can help with investigations. It looks for active parts containing the same data blocks that the detached parts:

```sql
select *, 
       concat('alter table ',database,'.',table,' drop detached part ''',a.name,''' settings allow_drop_detached=1;') as drop
from system.detached_parts a
left asof join 
(SELECT database, table, partition_id, name, active, min_block_number, max_block_number
   FROM system.parts WHERE active
) b on a.database=b.database and a.table=b.table and a.partition_id=b.partition_id
   and a.max_block_number <= b.max_block_number
order by table, min_block_number, max_block_number
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
mutate-not-byte-identical
broken-on-start
clone
covered-by-broken
```

## See also 

Since 22.6 clickhouse can clean old detached files automtically
See https://github.com/ClickHouse/ClickHouse/pull/37975/
