---
title: "Who ate my ClickHouse® memory?"
linkTitle: "Who ate my memory?"
description: >
    *"It was here a few minutes ago..."*
keywords: 
  - clickhouse memory
  - clickhouse memory usage
---

```
SYSTEM JEMALLOC PURGE;

SELECT 'OS' as group, metric as name, toInt64(value) as val FROM system.asynchronous_metrics WHERE metric like 'OSMemory%'
    UNION ALL
SELECT 'Caches' as group, metric as name, toInt64(value) FROM system.asynchronous_metrics WHERE metric LIKE '%CacheBytes'
    UNION ALL
SELECT 'MMaps' as group, metric as name, toInt64(value) FROM system.metrics WHERE metric LIKE 'MMappedFileBytes'
    UNION ALL
SELECT 'Process' as group, metric as name, toInt64(value) FROM system.asynchronous_metrics WHERE metric LIKE 'Memory%'
    UNION ALL
SELECT 'MemoryTable', engine as name, toInt64(sum(total_bytes)) FROM system.tables WHERE engine IN ('Join','Memory','Buffer','Set') GROUP BY engine
    UNION ALL
SELECT 'StorageBuffer' as group, metric as name, toInt64(value) FROM system.metrics WHERE metric='StorageBufferBytes'
    UNION ALL
SELECT 'Queries' as group, left(query,7) as name, toInt64(sum(memory_usage)) FROM system.processes GROUP BY name
    UNION ALL
SELECT 'Dictionaries' as group, type as name, toInt64(sum(bytes_allocated)) FROM system.dictionaries GROUP BY name
    UNION ALL
SELECT 'PrimaryKeys' as group, 'db:'||database as name, toInt64(sum(primary_key_bytes_in_memory_allocated)) FROM system.parts GROUP BY name
    UNION ALL
SELECT 'Merges' as group, 'db:'||database as name, toInt64(sum(memory_usage)) FROM system.merges GROUP BY name
    UNION ALL
SELECT 'InMemoryParts' as group, 'db:'||database as name, toInt64(sum(data_uncompressed_bytes)) FROM system.parts WHERE part_type = 'InMemory' GROUP BY name
    UNION ALL
SELECT 'AsyncInserts' as group, 'db:'||database as name, toInt64(sum(total_bytes)) FROM system.asynchronous_inserts GROUP BY name
    UNION ALL
SELECT 'FileBuffersVirtual' as group, metric as name, toInt64(value * 2*1024*1024) FROM system.metrics WHERE metric like 'OpenFileFor%'
    UNION ALL
SELECT 'ThreadStacksVirual' as group, metric as name, toInt64(value * 8*1024*1024) FROM system.metrics WHERE metric = 'GlobalThread'
    UNION ALL
SELECT 'UserMemoryTracking' as group, user as name, toInt64(memory_usage) FROM system.user_processes
    UNION ALL
select 'QueryCacheBytes' as group, '', toInt64(sum(result_size)) FROM system.query_cache
    UNION ALL
SELECT 'MemoryTracking' as group, 'total' as name, toInt64(value) FROM system.metrics WHERE metric = 'MemoryTracking'
```

```sql
SELECT *, formatReadableSize(value) 
FROM system.asynchronous_metrics 
WHERE metric like '%Cach%' or metric like '%Mem%' 
order by metric format PrettyCompactMonoBlock;

SELECT event_time, metric, value, formatReadableSize(value) 
FROM system.asynchronous_metric_log 
WHERE event_time > now() - 600 and (metric like '%Cach%' or metric like '%Mem%') and value <> 0 
order by metric, event_time format PrettyCompactMonoBlock;

SELECT formatReadableSize(sum(bytes_allocated)) FROM system.dictionaries;

SELECT
    database,
    name,
    formatReadableSize(total_bytes)
FROM system.tables
WHERE engine IN ('Memory','Set','Join');

SELECT
    sumIf(data_uncompressed_bytes, part_type = 'InMemory') as memory_parts,
    formatReadableSize(sum(primary_key_bytes_in_memory)) AS primary_key_bytes_in_memory,
    formatReadableSize(sum(primary_key_bytes_in_memory_allocated)) AS primary_key_bytes_in_memory_allocated
FROM system.parts;

SELECT formatReadableSize(sum(memory_usage)) FROM system.merges;

SELECT formatReadableSize(sum(memory_usage)) FROM system.processes;

select formatReadableSize(sum(result_size)) FROM system.query_cache;

SELECT
    initial_query_id,
    elapsed,
    formatReadableSize(memory_usage),
    formatReadableSize(peak_memory_usage),
    query
FROM system.processes
ORDER BY peak_memory_usage DESC
LIMIT 10;

SELECT
    type,
    event_time,
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

## retrospection analysis of the RAM usage based on query_log and part_log (shows peaks)

```sql
WITH 
    now() - INTERVAL 24 HOUR AS min_time,  -- you can adjust that
    now() AS max_time,   -- you can adjust that
    INTERVAL 1 HOUR as time_frame_size
SELECT 
    toStartOfInterval(event_timestamp, time_frame_size) as timeframe,
    formatReadableSize(max(mem_overall)) as peak_ram,
    formatReadableSize(maxIf(mem_by_type, event_type='Insert'))     as inserts_ram,
    formatReadableSize(maxIf(mem_by_type, event_type='Select'))     as selects_ram,
    formatReadableSize(maxIf(mem_by_type, event_type='MergeParts')) as merge_ram,
    formatReadableSize(maxIf(mem_by_type, event_type='MutatePart')) as mutate_ram,
    formatReadableSize(maxIf(mem_by_type, event_type='Alter'))      as alter_ram,
    formatReadableSize(maxIf(mem_by_type, event_type='Create'))     as create_ram,
    formatReadableSize(maxIf(mem_by_type, event_type not IN ('Insert', 'Select', 'MergeParts','MutatePart', 'Alter', 'Create') )) as other_types_ram,
    groupUniqArrayIf(event_type, event_type not IN ('Insert', 'Select', 'MergeParts','MutatePart', 'Alter', 'Create') ) as other_types
FROM (
    SELECT 
        toDateTime( toUInt32(ts) ) as event_timestamp,
        t as event_type,
        SUM(mem) OVER (PARTITION BY t ORDER BY ts) as mem_by_type,
        SUM(mem) OVER (ORDER BY ts) as mem_overall
    FROM 
    (
        WITH arrayJoin([(toFloat64(event_time_microseconds) - (duration_ms / 1000), toInt64(peak_memory_usage)), (toFloat64(event_time_microseconds), -peak_memory_usage)]) AS data
        SELECT
        CAST(event_type,'LowCardinality(String)') as t,
        data.1 as ts,
        data.2 as mem
        FROM system.part_log
        WHERE event_time BETWEEN min_time AND max_time AND peak_memory_usage != 0

        UNION ALL 

        WITH arrayJoin([(toFloat64(query_start_time_microseconds), toInt64(memory_usage)), (toFloat64(event_time_microseconds), -memory_usage)]) AS data
        SELECT 
        query_kind,
        data.1 as ts,
        data.2 as mem
        FROM system.query_log
        WHERE event_time BETWEEN min_time AND max_time AND memory_usage != 0

        UNION ALL 

        WITH 
        arrayJoin([(toFloat64(event_time_microseconds) - (view_duration_ms / 1000), toInt64(peak_memory_usage)), (toFloat64(event_time_microseconds), -peak_memory_usage)]) AS data
        SELECT
        CAST(toString(view_type)||'View','LowCardinality(String)') as t,
        data.1 as ts,
        data.2 as mem
        FROM system.query_views_log
        WHERE event_time BETWEEN min_time AND max_time AND peak_memory_usage != 0
)
)
GROUP BY timeframe
ORDER BY timeframe
FORMAT PrettyCompactMonoBlock;
```

## retrospection analysis of trace_log

```sql
WITH 
    now() - INTERVAL 24 HOUR AS min_time,  -- you can adjust that
    now() AS max_time   -- you can adjust that
SELECT
    trace_type,
    count(),
    topK(20)(query_id)
FROM system.trace_log
WHERE event_time BETWEEN min_time AND max_time
GROUP BY trace_type;

SELECT
    t,
    count() AS queries,
    formatReadableSize(sum(peak_size)) AS sum_of_peaks,
    formatReadableSize(max(peak_size)) AS biggest_query_peak,
    argMax(query_id, peak_size) AS query
FROM
(
    SELECT
        toStartOfInterval(event_time, toIntervalMinute(5)) AS t,
        query_id,
        max(size) AS peak_size
    FROM system.trace_log
    WHERE (trace_type = 'MemoryPeak') AND (event_time > (now() - toIntervalHour(24)))
    GROUP BY
        t,
        query_id
)
GROUP BY t
ORDER BY t ASC;

-- later on you can check particular query_ids in query_log
```

## analysis of the server text logs 

```
grep MemoryTracker /var/log/clickhouse-server.log
zgrep MemoryTracker /var/log/clickhouse-server.log.*.gz
```
