---
title: "Remove block numbers from zookeeper for removed partitions"
linkTitle: "Remove block numbers from zookeeper for removed partitions"
weight: 100
description: >-

---

## Remove block numbers from zookeeper for removed partitions

```sql
SELECT distinct concat('delete ', zk.block_numbers_path, zk.partition_id) FROM
(
    SELECT r.database, r.table, zk.block_numbers_path, zk.partition_id, p.partition_id
    FROM 
    (
        SELECT path as block_numbers_path, name as partition_id
        FROM system.zookeeper
        WHERE path IN (
            SELECT concat(zookeeper_path, '/block_numbers/') as block_numbers_path
            FROM clusterAllReplicas('{cluster}',system.replicas)
        )
    ) as zk 
    LEFT JOIN 
    (
            SELECT database, table, concat(zookeeper_path, '/block_numbers/') as block_numbers_path
            FROM clusterAllReplicas('{cluster}',system.replicas)
    )
    as r ON (r.block_numbers_path = zk.block_numbers_path) 
    LEFT JOIN 
    (
        SELECT DISTINCT partition_id, database, table
        FROM clusterAllReplicas('{cluster}',system.parts)
    )
    as p ON (p.partition_id = zk.partition_id AND p.database = r.database AND p.table = r.table)
    WHERE p.partition_id = ''  AND zk.partition_id <> 'all'
    ORDER BY r.database, r.table, zk.block_numbers_path, zk.partition_id, p.partition_id
) t
FORMAT TSVRaw;
```
