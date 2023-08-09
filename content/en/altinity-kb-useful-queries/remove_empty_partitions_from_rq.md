---
title: "Removing tasks in the replication queue related to empty partitions"
linkTitle: "Removing tasks in the replication queue related to empty partitions"
weight: 100
description: >-
     Removing tasks in the replication queue related to empty partitions
---

## Removing tasks in the replication queue related to empty partitions

```
SELECT 'ALTER TABLE ' || database || '.' || table || ' DROP PARTITION ID \''|| partition_id || '\';'  FROM 
(SELECT DISTINCT database, table, extract(new_part_name, '^[^_]+')  as partition_id FROM clusterAllReplicas('{cluster}', system.replication_queue) ) as rq
LEFT JOIN 
(SELECT database, table, partition_id, sum(rows) as rows_count, count() as part_count 
FROM clusterAllReplicas('{cluster}', system.parts)
WHERE active GROUP BY database, table, partition_id
)  as p
USING (database, table, partition_id)
WHERE p.rows_count = 0 AND p.part_count = 0
FORMAT TSVRaw;
```
