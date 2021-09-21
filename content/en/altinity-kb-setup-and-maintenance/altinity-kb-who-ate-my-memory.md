---
title: "Who ate my memory"
linkTitle: "Who ate my memory"
description: >
    Who ate my memory
---
```sql
SELECT formatReadableSize(sum(bytes_allocated)) FROM system.dictionaries;

SELECT
    database,
    name,
    formatReadableSize(total_bytes)
FROM system.tables
WHERE engine IN ('Memory','Set','Join');

SELECT formatReadableSize(sum(memory_usage)) FROM system.merges;

SELECT formatReadableSize(sum(memory_usage)) FROM system.processes;

SELECT
    initial_query_id,
    formatReadableSize(memory_usage),
    formatReadableSize(peak_memory_usage),
    query
FROM system.processes
ORDER BY peak_memory_usage DESC
LIMIT 10;

SELECT
    metric,
    formatReadableSize(value)
FROM system.asynchronous_metrics
WHERE metric IN ('UncompressedCacheBytes', 'MarkCacheBytes');

SELECT
    formatReadableSize(sum(primary_key_bytes_in_memory)) AS primary_key_bytes_in_memory,
    formatReadableSize(sum(primary_key_bytes_in_memory_allocated)) AS primary_key_bytes_in_memory_allocated
FROM system.parts;

SELECT
    initial_query_id,
    formatReadableSize(memory_usage),
    query
FROM system.query_log
WHERE (event_date >= today()) AND (event_time >= (now() - 7200))
ORDER BY memory_usage DESC
LIMIT 10;
```

```bash
for i in `seq 1 600`; do clickhouse-client --empty_result_for_aggregation_by_empty_set=0 -q "select (select 'Merges: \
'||formatReadableSize(sum(memory_usage)) from system.merges), (select \
'Processes: '||formatReadableSize(sum(memory_usage)) from system.processes)";\
sleep 3;  done 

Merges: 96.57 MiB	Processes: 41.98 MiB
Merges: 82.24 MiB	Processes: 41.91 MiB
Merges: 66.33 MiB	Processes: 41.91 MiB
Merges: 66.49 MiB	Processes: 37.13 MiB
Merges: 67.78 MiB	Processes: 37.13 MiB
```

```bash
echo "         Merges      Processes       PrimaryK       TempTabs          Dicts"; \
for i in `seq 1 600`; do clickhouse-client --empty_result_for_aggregation_by_empty_set=0  -q "select \
(select leftPad(formatReadableSize(sum(memory_usage)),15, ' ') from system.merges)||
(select leftPad(formatReadableSize(sum(memory_usage)),15, ' ') from system.processes)||
(select leftPad(formatReadableSize(sum(primary_key_bytes_in_memory_allocated)),15, ' ') from system.parts)|| \
(select leftPad(formatReadableSize(sum(total_bytes)),15, ' ') from system.tables \
 WHERE engine IN ('Memory','Set','Join'))||
(select leftPad(formatReadableSize(sum(bytes_allocated)),15, ' ') FROM system.dictionaries)
"; sleep 3;  done 

         Merges      Processes       PrimaryK       TempTabs          Dicts
         0.00 B         0.00 B      21.36 MiB       1.58 GiB     911.07 MiB
         0.00 B         0.00 B      21.36 MiB       1.58 GiB     911.07 MiB
         0.00 B         0.00 B      21.35 MiB       1.58 GiB     911.07 MiB
         0.00 B         0.00 B      21.36 MiB       1.58 GiB     911.07 MiB

```
