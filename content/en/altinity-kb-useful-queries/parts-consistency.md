---
title: "Parts consistency"
linkTitle: "Parts consistency"
---
## Check if there are blocks missing
```sql
SELECT
    database,
    table,
    partition_id,
    ranges.1 AS previous_part,
    ranges.2 AS next_part,
    ranges.3 AS previous_block_number,
    ranges.4 AS next_block_number,
    range(toUInt64(previous_block_number + 1), toUInt64(next_block_number)) AS missing_block_numbers
FROM
(
    WITH
        arrayPopFront(groupArray(min_block_number) AS min) AS min_adj,
        arrayPopBack(groupArray(max_block_number) AS max) AS max_adj,
        arrayFilter((x, y, z) -> (y != (z + 1)), arrayZip(arrayPopBack(groupArray(name) AS name_arr), arrayPopFront(name_arr), max_adj, min_adj), min_adj, max_adj) AS missing_ranges
    SELECT
        database,
        table,
        partition_id,
        missing_ranges
    FROM
    (
        SELECT *
        FROM system.parts
        WHERE active AND (table = 'query_thread_log') AND (partition_id = '202108') AND active
        ORDER BY min_block_number ASC
    )
    GROUP BY
        database,
        table,
        partition_id
)
ARRAY JOIN missing_ranges AS ranges

┌─database─┬─table────────────┬─partition_id─┬─previous_part───────┬─next_part──────────┬─previous_block_number─┬─next_block_number─┬─missing_block_numbers─┐
│ system   │ query_thread_log │ 202108       │ 202108_864_1637_556 │ 202108_1639_1639_0 │                  1637 │              1639 │ [1638]                │
└──────────┴──────────────────┴──────────────┴─────────────────────┴────────────────────┴───────────────────────┴───────────────────┴───────────────────────┘
```
## Find the number of blocks in a table
```sql
SELECT
    database,
    table,
    partition_id,
    sum(max_block_number - min_block_number) AS blocks_count
FROM system.parts
WHERE active AND (table = 'query_thread_log') AND (partition_id = '202108') AND active
GROUP BY
    database,
    table,
    partition_id

┌─database─┬─table────────────┬─partition_id─┬─blocks_count─┐
│ system   │ query_thread_log │ 202108       │         1635 │
└──────────┴──────────────────┴──────────────┴──────────────┘
```
## Compare the list of parts in ZooKeeper with the list of parts on disk
```sql
select zoo.p_path as part_zoo, zoo.ctime, zoo.mtime, disk.p_path as part_disk
from
(
  select concat(path,'/',name) as p_path, ctime, mtime
  from system.zookeeper where path in (select concat(replica_path,'/parts') from system.replicas)
) zoo
left join 
(
  select concat(replica_path,'/parts/',name) as p_path
  from system.parts inner join system.replicas using (database, table)
) disk on zoo.p_path = disk.p_path
where part_disk=''
order by part_zoo;
```
