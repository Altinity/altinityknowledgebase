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

## After 24.3

```
WITH 
  now() - INTERVAL 120 DAY as retain_old_partitions,
  replicas AS (SELECT DISTINCT database, table, zookeeper_path || '/block_numbers' AS block_numbers_path FROM system.replicas),
  zk_data AS (SELECT DISTINCT name as partition_id, path as block_numbers_path FROM system.zookeeper WHERE path IN (SELECT block_numbers_path FROM replicas) AND mtime < retain_old_partitions AND partition_id <> 'all'),
  zk_partitions AS (SELECT DISTINCT database, table, partition_id FROM replicas JOIN zk_data USING block_numbers_path),
  partitions AS (SELECT DISTINCT database, table, partition_id FROM system.parts)
SELECT 
  format('ALTER TABLE `{}`.`{}` {};',database, table, arrayStringConcat( arraySort(groupArray('FORGET PARTITION ID \'' || partition_id || '\'')), ', ')) AS query
FROM zk_partitions
WHERE (database, table, partition_id) NOT IN (SELECT * FROM partitions) 
GROUP BY database, table
ORDER BY database, table
FORMAT TSVRaw;
```

## After fixing https://github.com/ClickHouse/ClickHouse/issues/72807

```
WITH 
  now() - INTERVAL 120 DAY as retain_old_partitions,
  replicas AS (SELECT DISTINCT database, table, zookeeper_path || '/block_numbers' AS block_numbers_path FROM clusterAllReplicas('{cluster}',system.replicas)),
  zk_data AS (SELECT DISTINCT name as partition_id, path as block_numbers_path FROM system.zookeeper WHERE path IN (SELECT block_numbers_path FROM replicas) AND mtime < retain_old_partitions AND partition_id <> 'all'),
  zk_partitions AS (SELECT DISTINCT database, table, partition_id FROM replicas JOIN zk_data USING block_numbers_path),
  partitions AS (SELECT DISTINCT database, table, partition_id FROM clusterAllReplicas('{cluster}',system.parts))
SELECT 
  format('ALTER TABLE `{}`.`{}` ON CLUSTER \'{{cluster}}\' {};',database, table, arrayStringConcat( arraySort(groupArray('FORGET PARTITION ID \'' || partition_id || '\'')), ', ')) AS query
FROM zk_partitions
WHERE (database, table, partition_id) NOT IN (SELECT * FROM partitions) 
GROUP BY database, table
ORDER BY database, table
FORMAT TSVRaw;
```
