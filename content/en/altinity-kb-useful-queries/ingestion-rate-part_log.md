---
title: "Ingestion metrics from system.part_log"
linkTitle: "Ingestion metrics from system.part_log"
weight: 100
description: >-
     Query to gather information about ingestion rate from system.part_log. 
---

```sql
SELECT 
	database, 
	table,
	toStartOfHour(event_time) AS time_bucket, 
	count() AS number_of_parts_per_insert,
	min(rows) AS min_rows,
	max(rows) AS max_rows, 
	median(rows) AS median_rows,
	min(size_in_bytes) AS min_bytes, 
	max(size_in_bytes) AS max_bytes,
	median(size_in_bytes) AS median_bytes, 
	median_bytes / median_rows AS avg_row_size
FROM 
	system.part_log 
WHERE 
	event_type = 1 
	AND 
  -- change if another time period is desired
	event_date >= today() - interval 15 day
GROUP BY query_id,database, table, time_bucket
ORDER BY time_bucket, database, table ASC


select database, table, event_type, partition_id, count() c, round(avg(rows)) 
from system.part_log where event_date >= today() and event_type = 'NewPart'
group by database, table, event_type, partition_id
order by c desc
```

