---
title: "Ingestion metrics from system.part_log"
linkTitle: "Ingestion metrics from system.part_log"
weight: 100
description: >-
     Query to gather information about ingestion rate from system.part_log. 
---

```sql
-- Insert rate
select database, table, time_bucket,
       max(number_of_parts_per_insert) max_parts_pi,
       median(number_of_parts_per_insert) median_parts_pi,
       min(min_rows_per_part) min_rows_pp, 
       max(max_rows_per_part) max_rows_pp, 
       median(median_rows_per_part) median_rows_pp,
       min(rows_per_insert) min_rows_pi, 
       median(rows_per_insert) median_rows_pi, 
       max(rows_per_insert) max_rows_pi, 
       sum(rows_per_insert) rows_inserted,
       sum(seconds_per_insert) parts_creation_seconds,
       count() inserts,
       sum(number_of_parts_per_insert) new_parts,
       max(last_part_pi) - min(first_part_pi) as insert_period,
       inserts*60/insert_period as inserts_per_minute
from
(SELECT 
	database, 
	table,
	toStartOfDay(event_time) AS time_bucket, 
	count() AS number_of_parts_per_insert,
	min(rows) AS min_rows_per_part,
	max(rows) AS max_rows_per_part, 
	median(rows) AS median_rows_per_part,
	sum(rows) AS rows_per_insert, 
	min(size_in_bytes) AS min_bytes_per_part, 
	max(size_in_bytes) AS max_bytes_per_part,
	median(size_in_bytes) AS median_bytes_per_part, 
	sum(size_in_bytes) AS bytes_per_insert, 
	median_bytes_per_part / median_rows_per_part AS avg_row_size,
	sum(duration_ms)/1000 as seconds_per_insert,
	max(event_time) as last_part_pi,  min(event_time) as first_part_pi
FROM 
	system.part_log
WHERE 
  -- Enum8('NewPart' = 1, 'MergeParts' = 2, 'DownloadPart' = 3, 'RemovePart' = 4, 'MutatePart' = 5, 'MovePart' = 6)
	event_type = 1 
	AND 
  -- change if another time period is desired
	event_date >= today()
GROUP BY query_id, database, table, time_bucket
)
GROUP BY database, table, time_bucket
ORDER BY time_bucket, database, table ASC

-- New parts per partition 
select database, table, event_type, partition_id, count() c, round(avg(rows)) 
from system.part_log where event_date >= today() and event_type = 'NewPart'
group by database, table, event_type, partition_id
order by c desc
```

