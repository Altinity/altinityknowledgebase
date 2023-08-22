---
title: "How to recreate a table in case of total corruption of the replication queue"
linkTitle: "How to recreate a table"
weight: 100
description: >-
     How to recreate a table in case of total corruption of the replication queue.
---

## How to fix a replication using hard-reset way

1. Find the best replica (replica with the most fresh/consistent) data.
2. Backup the table `alter table mydatabase.mybadtable freeze;`
3. Stop all applications!!! Stop ingestion. Stop queries - table will be empty for some time.
4. Check that detached folder is empty or clean it.
```sql
SELECT concat('alter table ', database, '.', table, ' drop detached part \'', name, '\' settings allow_drop_detached=1;')
FROM system.detached_parts
WHERE (database = 'mydatabase') AND (table = 'mybadtable')
FORMAT TSVRaw;
```
5. Make sure that detached folder is empty `select count() from system.detached_parts where database='mydatabase' and table ='mybadtable';`
6. Detach all parts (table will became empty)
```sql
SELECT concat('alter table ', database, '.', table, ' detach partition id \'', partition_id, '\';') AS detach
FROM system.parts
WHERE (active = 1) AND (database = 'mydatabase') AND (table = 'mybadtable')
GROUP BY detach
ORDER BY detach ASC
FORMAT TSVRaw;
```
7. Make sure that table is empty `select count() from mydatabase.mybadtable;`
8. Attach all parts back
```sql
SELECT concat('alter table ', database, '.', table, ' attach part \'', a.name, '\';')
FROM system.detached_parts AS a
WHERE (database = 'mydatabase') AND (table = 'mybadtable')
FORMAT TSVRaw;
```
9. Make sure that data is consistent at all replicas
```sql
SELECT
    formatReadableSize(sum(bytes)) AS size,
    sum(rows),
    count() AS part_count,
    uniqExact(partition) AS partition_count
FROM system.parts
WHERE (active = 1) AND (database = 'mydatabase') AND (table = 'mybadtable');
```
