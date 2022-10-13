---
title: "Check table metadata in zookeeper"
linkTitle: "Check table metadata in zookeeper"
weight: 100
description: >-
     Check table metadata in zookeeper.
---

## Compare table metadata of different replicas in zookeeper

> Metadata on replica is not up to date with common metadata in Zookeeper

```sql
SELECT *, if( neighbor(name, -1) == name and name != 'is_active', neighbor(value, -1) == value , 1) as looks_good
FROM (
SELECT
    name,
    path,
    ctime,
    mtime,
    value
FROM system.zookeeper
WHERE (path IN (
    SELECT arrayJoin(groupUniqArray(if(path LIKE '%/replicas', concat(path, '/', name), path)))
    FROM system.zookeeper
    WHERE path IN (
        SELECT arrayJoin([zookeeper_path, concat(zookeeper_path, '/replicas')])
        FROM system.replicas
        WHERE table = 'test_repl'
    )
)) AND (name IN ('metadata', 'columns', 'is_active'))
ORDER BY
    name = 'is_active',
    name ASC,
    path ASC
)
```

vs. 

```sql
SELECT metadata_modification_time, create_table_query FROM system.tables WHERE name = 'test_repl'
```
