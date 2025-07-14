---
title: "Handy queries for system.query_log"
linkTitle: "Handy queries for system.query_log"
weight: 100
description: >-
     Handy queries for a system.query_log.
---

## The most cpu / write / read-intensive queries from query_log

```sql
SELECT
    normalized_query_hash,
    any(query),
    count(),
    sum(query_duration_ms) / 1000 AS QueriesDuration,
    sum(ProfileEvents.Values[indexOf(ProfileEvents.Names, 'RealTimeMicroseconds')]) / 1000000 AS RealTime,
    sum(ProfileEvents.Values[indexOf(ProfileEvents.Names, 'UserTimeMicroseconds')]) / 1000000 AS UserTime,
    sum(ProfileEvents.Values[indexOf(ProfileEvents.Names, 'SystemTimeMicroseconds')]) / 1000000 AS SystemTime,
    sum(ProfileEvents.Values[indexOf(ProfileEvents.Names, 'DiskReadElapsedMicroseconds')]) / 1000000 AS DiskReadTime,
    sum(ProfileEvents.Values[indexOf(ProfileEvents.Names, 'DiskWriteElapsedMicroseconds')]) / 1000000 AS DiskWriteTime,
    sum(ProfileEvents.Values[indexOf(ProfileEvents.Names, 'NetworkSendElapsedMicroseconds')]) / 1000000 AS NetworkSendTime,
    sum(ProfileEvents.Values[indexOf(ProfileEvents.Names, 'NetworkReceiveElapsedMicroseconds')]) / 1000000 AS NetworkReceiveTime,
    sum(ProfileEvents.Values[indexOf(ProfileEvents.Names, 'ZooKeeperWaitMicroseconds')]) / 1000000 AS ZooKeeperWaitTime,
    sum(ProfileEvents.Values[indexOf(ProfileEvents.Names, 'OSIOWaitMicroseconds')]) / 1000000 AS OSIOWaitTime,
    sum(ProfileEvents.Values[indexOf(ProfileEvents.Names, 'OSCPUWaitMicroseconds')]) / 1000000 AS OSCPUWaitTime,
    sum(ProfileEvents.Values[indexOf(ProfileEvents.Names, 'OSCPUVirtualTimeMicroseconds')]) / 1000000 AS OSCPUVirtualTime,
    sum(read_rows) AS ReadRows,
    formatReadableSize(sum(read_bytes)) AS ReadBytes,
    sum(written_rows) AS WrittenTows,
    formatReadableSize(sum(written_bytes)) AS WrittenBytes,
    sum(result_rows) AS ResultRows,
    formatReadableSize(sum(result_bytes)) AS ResultBytes
FROM system.query_log
WHERE (event_date >= today()) AND (event_time > (now() - 3600)) AND type in (2,4) -- QueryFinish, ExceptionWhileProcessing
GROUP BY normalized_query_hash
    WITH TOTALS
ORDER BY UserTime DESC
LIMIT 30
FORMAT Vertical
```

-- modern ClickHouse®

```sql
SELECT 
    hostName() as host,
    normalized_query_hash,
    min(event_time),
    max(event_time),
    replace(substr(argMax(query, utime), 1, 80), '\n', ' ') AS query,
    argMax(query_id, utime) AS sample_query_id,
    count(),
    sum(query_duration_ms) / 1000 AS QueriesDuration, /* wall clock */
    sum(ProfileEvents['RealTimeMicroseconds']) / 1000000 AS RealTime,  /* same as above but x number of thread */
    sum(ProfileEvents['UserTimeMicroseconds'] as utime) / 1000000 AS UserTime,  /* time when our query was doin some cpu-insense work, creating cpu load */
    sum(ProfileEvents['SystemTimeMicroseconds']) / 1000000 AS SystemTime, /* time spend on waiting for some system operations */
    sum(ProfileEvents['DiskReadElapsedMicroseconds']) / 1000000 AS DiskReadTime,
    sum(ProfileEvents['DiskWriteElapsedMicroseconds']) / 1000000 AS DiskWriteTime,
    sum(ProfileEvents['NetworkSendElapsedMicroseconds']) / 1000000 AS NetworkSendTime, /* check the other side of the network! */
    sum(ProfileEvents['NetworkReceiveElapsedMicroseconds']) / 1000000 AS NetworkReceiveTime, /* check the other side of the network! */
    sum(ProfileEvents['ZooKeeperWaitMicroseconds']) / 1000000 AS ZooKeeperWaitTime,
    sum(ProfileEvents['OSIOWaitMicroseconds']) / 1000000 AS OSIOWaitTime, /* IO waits, usually disks - that metric is 'orthogonal' to other */ 
    sum(ProfileEvents['OSCPUWaitMicroseconds']) / 1000000 AS OSCPUWaitTime, /* waiting for a 'free' CPU - usually high when the other load on the server creates a lot of contention for cpu */ 
    sum(ProfileEvents['OSCPUVirtualTimeMicroseconds']) / 1000000 AS OSCPUVirtualTime, /* similar to usertime + system time */
    formatReadableSize(sum(ProfileEvents['NetworkReceiveBytes']) as network_receive_bytes) AS NetworkReceiveBytes,
    formatReadableSize(sum(ProfileEvents['NetworkSendBytes']) as network_send_bytes) AS NetworkSendBytes,
    sum(ProfileEvents['SelectedParts']) as SelectedParts,
    sum(ProfileEvents['SelectedRanges']) as SelectedRanges,
    sum(ProfileEvents['SelectedMarks']) as SelectedMarks,
    sum(ProfileEvents['SelectedRows']) as SelectedRows,  /* those may different from read_rows - here the number or rows potentially matching the where conditions, not neccessary all will be read */
    sum(ProfileEvents['SelectedBytes']) as SelectedBytes,
    sum(ProfileEvents['FileOpen']) as FileOpen,
    sum(ProfileEvents['ZooKeeperTransactions']) as ZooKeeperTransactions,
    formatReadableSize(sum(ProfileEvents['OSReadBytes'] ) as os_read_bytes ) as OSReadBytesExcludePageCache,
    formatReadableSize(sum(ProfileEvents['OSWriteBytes'] ) as os_write_bytes ) as OSWriteBytesExcludePageCache,
    formatReadableSize(sum(ProfileEvents['OSReadChars'] ) as os_read_chars ) as OSReadBytesIncludePageCache,
    formatReadableSize(sum(ProfileEvents['OSWriteChars'] ) as os_write_chars ) as OSWriteCharsIncludePageCache,
    formatReadableSize(quantile(0.97)(memory_usage) as memory_usage_q97) as MemoryUsageQ97 ,
    sum(read_rows) AS ReadRows,
    formatReadableSize(sum(read_bytes) as read_bytes_sum) AS ReadBytes,
    sum(written_rows) AS WrittenRows,
    formatReadableSize(sum(written_bytes) as written_bytes_sum) AS WrittenBytes, /* */
    sum(result_rows) AS ResultRows,
    formatReadableSize(sum(result_bytes) as result_bytes_sum) AS ResultBytes
FROM clusterAllReplicas('{cluster}', system.query_log)
WHERE event_date >= today() AND type in (2,4)-- QueryFinish, ExceptionWhileProcessing
GROUP BY
    GROUPING SETS (
        (normalized_query_hash, host),
        (host),
        ())
ORDER BY OSCPUVirtualTime DESC
LIMIT 30
FORMAT Vertical;
```

## A/B tests of the same query
```
WITH
	query_id='8c050082-428e-4523-847a-caf29511d6ba' AS first,
	query_id='618e0c55-e21d-4630-97e7-5f82e2475c32' AS second,
	arrayConcat(mapKeys(ProfileEvents), ['query_duration_ms', 'read_rows', 'read_bytes', 'written_rows', 'written_bytes', 'result_rows', 'result_bytes', 'memory_usage', 'normalized_query_hash', 'peak_threads_usage', 'query_cache_usage']) AS metrics,
	arrayConcat(mapValues(ProfileEvents), [query_duration_ms, read_rows, read_bytes, written_rows, written_bytes, result_rows, result_bytes, memory_usage, normalized_query_hash, peak_threads_usage, toUInt64(query_cache_usage)]) AS metrics_values
SELECT
	metrics[i] AS metric,
	anyIf(metrics_values[i], first) AS v1,
	anyIf(metrics_values[i], second) AS v2,
	formatReadableQuantity(v1 - v2)
FROM clusterAllReplicas(default, system.query_log)
ARRAY JOIN arrayEnumerate(metrics) AS i
WHERE (first OR second) AND (type = 2)
GROUP BY metric
HAVING v1 != v2
ORDER BY
	(v2 - v1) / (v1 + v2) DESC,
	v2 DESC,
	metric ASC
```

Another variant
```
WITH
    toUUID('d18fb820-4075-49bf-8fa3-cd7e53b9d523') AS fast_query_id,
    toUUID('22ffbcc0-c62a-4895-8105-ee9d7447a643') AS slow_query_id,
    faster AS
    (
        SELECT pe.1 AS event_name, pe.2 AS event_value
        FROM
        (
            SELECT ProfileEvents.Names, ProfileEvents.Values
            FROM system.query_log
            WHERE (query_id = fast_query_id ) AND (type = 'QueryFinish') AND (event_date = today())
        )
        ARRAY JOIN arrayZip(ProfileEvents.Names, ProfileEvents.Values) AS pe
    ),
    slower AS
    (
        SELECT pe.1 AS event_name, pe.2 AS event_value
        FROM
        (
            SELECT ProfileEvents.Names, ProfileEvents.Values
            FROM system.query_log
            WHERE (query_id = slow_query_id) AND (type = 'QueryFinish') AND (event_date = today())
        )
        ARRAY JOIN arrayZip(ProfileEvents.Names, ProfileEvents.Values) AS pe
    )
SELECT
    event_name,
    formatReadableQuantity(slower.event_value) AS slower_value,
    formatReadableQuantity(faster.event_value) AS faster_value,
    round((slower.event_value - faster.event_value) / slower.event_value, 2) AS diff_q
FROM faster
LEFT JOIN slower USING (event_name)
WHERE diff_q > 0.05
ORDER BY event_name ASC
SETTINGS join_use_nulls = 1
```

## Find queries that were started but not finished at some moment in time

```sql
SELECT
  query_id,
  min(event_time) t,
  any(query)
FROM system.query_log
where event_date = today() and event_time > '2021-11-25 02:29:12'
GROUP BY query_id
HAVING countIf(type='QueryFinish') = 0 OR sum(query_duration_ms) > 100000
order by t;

select
     query_id,
     any(query)
from system.query_log
where event_time between '2021-09-24 07:00:00' and '2021-09-24 09:00:00'
group by query_id HAVING countIf(type=1) <> countIf(type!=1)
```

## Columns used in WHERE clauses
```
WITH
    any(query) AS q,
    any(tables) AS _tables,
    arrayJoin(extractAll(query, '\\b(?:PRE)?WHERE\\s+(.*?)\\s+(?:GROUP BY|ORDER BY|UNION|SETTINGS|FORMAT$)')) AS w,
    any(columns) AS cols,
    arrayFilter(x -> (position(w, extract(x, '\\.(`[^`]+`|[^\\.]+)$')) > 0), columns) AS c,
    arrayJoin(c) AS c2
SELECT
    c2,
    count()
FROM system.query_log
WHERE (event_time >= (now() - toIntervalDay(1)))
  AND arrayExists(x -> (x LIKE '%target_table%'), tables)
  AND (query ILIKE 'SELECT%')
GROUP BY c2
ORDER BY count() ASC;
```
Replace %target_table% with the actual table name (or pattern) you want to inspect.

## Most‑selected columns

```
SELECT
    col AS column,
    count() AS hits
FROM system.query_log
ARRAY JOIN columns AS col          -- expand the column list first
WHERE type = 'QueryFinish'
  AND query_kind = 'Select'
  AND event_time >= now() - INTERVAL 7 DAY
  AND notEmpty(columns)
GROUP BY col
ORDER BY hits DESC
LIMIT 50;
```

## Most‑used functions

```
SELECT
    f AS function,
    count() AS hits
FROM system.query_log
ARRAY JOIN used_functions AS f  -- used_aggregate_functions, used_aggregate_function_combinators
WHERE type = 'QueryFinish'
  AND event_time >= now() - INTERVAL 7 DAY
  AND notEmpty(used_functions)
GROUP BY f
ORDER BY hits DESC
LIMIT 50;
```

## query ranks 
```

SELECT *
FROM 
(
SELECT 
    *,
    DENSE_RANK() OVER (PARTITION BY host ORDER BY cnt DESC) as rank_by_cnt,
    DENSE_RANK() OVER (PARTITION BY host ORDER BY QueriesDuration DESC) as rank_by_duration,
    DENSE_RANK() OVER (PARTITION BY host ORDER BY RealTime DESC) as rank_by_real_time,
    DENSE_RANK() OVER (PARTITION BY host ORDER BY UserTime DESC) as rank_by_user_time,
    DENSE_RANK() OVER (PARTITION BY host ORDER BY SystemTime DESC) as rank_by_system_time,
    DENSE_RANK() OVER (PARTITION BY host ORDER BY DiskReadTime DESC) as rank_by_disk_read_time,
    DENSE_RANK() OVER (PARTITION BY host ORDER BY DiskWriteTime DESC) as rank_by_disk_write_time,
    DENSE_RANK() OVER (PARTITION BY host ORDER BY NetworkSendTime DESC) as rank_by_network_send_time,
    DENSE_RANK() OVER (PARTITION BY host ORDER BY NetworkReceiveTime DESC) as rank_by_network_receive_time,
    DENSE_RANK() OVER (PARTITION BY host ORDER BY OSIOWaitTime DESC) as rank_by_os_io_wait_time,
    DENSE_RANK() OVER (PARTITION BY host ORDER BY OSCPUWaitTime DESC) as rank_by_os_cpu_wait_time,
    DENSE_RANK() OVER (PARTITION BY host ORDER BY OSCPUVirtualTime DESC) as rank_by_os_cpu_virtual_time,
    DENSE_RANK() OVER (PARTITION BY host ORDER BY NetworkReceiveBytes DESC) as rank_by_network_receive_bytes,
    DENSE_RANK() OVER (PARTITION BY host ORDER BY NetworkSendBytes DESC) as rank_by_network_send_bytes,
    DENSE_RANK() OVER (PARTITION BY host ORDER BY SelectedParts DESC) as rank_by_selected_parts,
    DENSE_RANK() OVER (PARTITION BY host ORDER BY SelectedRanges DESC) as rank_by_selected_ranges,
    DENSE_RANK() OVER (PARTITION BY host ORDER BY SelectedMarks DESC) as rank_by_selected_marks,
    DENSE_RANK() OVER (PARTITION BY host ORDER BY SelectedRows DESC) as rank_by_selected_rows,
    DENSE_RANK() OVER (PARTITION BY host ORDER BY SelectedBytes DESC) as rank_by_selected_bytes,
    DENSE_RANK() OVER (PARTITION BY host ORDER BY FileOpen DESC) as rank_by_file_open,
    DENSE_RANK() OVER (PARTITION BY host ORDER BY ZooKeeperTransactions DESC) as rank_by_zookeeper_transactions,
    DENSE_RANK() OVER (PARTITION BY host ORDER BY OSReadBytesExcludePageCache DESC) as rank_by_os_read_bytes_exclude_page_cache,
    DENSE_RANK() OVER (PARTITION BY host ORDER BY OSWriteBytesExcludePageCache DESC) as rank_by_os_write_bytes_exclude_page_cache,
    DENSE_RANK() OVER (PARTITION BY host ORDER BY OSReadBytesIncludePageCache DESC) as rank_by_os_read_bytes_include_page_cache,
    DENSE_RANK() OVER (PARTITION BY host ORDER BY OSWriteCharsIncludePageCache DESC) as rank_by_os_write_chars_include_page_cache,
    DENSE_RANK() OVER (PARTITION BY host ORDER BY MemoryUsageQ97 DESC) as rank_by_memory_usage_q97,
    DENSE_RANK() OVER (PARTITION BY host ORDER BY ReadRows DESC) as rank_by_read_rows,
    DENSE_RANK() OVER (PARTITION BY host ORDER BY ReadBytes DESC) as rank_by_read_bytes,
    DENSE_RANK() OVER (PARTITION BY host ORDER BY WrittenRows DESC) as rank_by_written_rows,
    DENSE_RANK() OVER (PARTITION BY host ORDER BY WrittenBytes DESC) as rank_by_written_bytes,
    DENSE_RANK() OVER (PARTITION BY host ORDER BY ResultRows DESC) as rank_by_result_rows,
    DENSE_RANK() OVER (PARTITION BY host ORDER BY ResultBytes DESC) as rank_by_result_bytes
FROM
(
SELECT 
    hostName() as host,
    normalized_query_hash,
    min(event_time) as min_event_time,
    max(event_time) as max_event_time,
    replace(substr(argMax(query, utime), 1, 80), '\n', ' ') AS query,
    argMax(query_id, utime) AS sample_query_id,
    count() as cnt,
    sum(query_duration_ms) / 1000 AS QueriesDuration, /* wall clock */
    sum(ProfileEvents['RealTimeMicroseconds']) / 1000000 AS RealTime,  /* same as above but x number of thread */
    sum(ProfileEvents['UserTimeMicroseconds'] as utime) / 1000000 AS UserTime,  /* time when our query was doin some cpu-insense work, creating cpu load */
    sum(ProfileEvents['SystemTimeMicroseconds']) / 1000000 AS SystemTime, /* time spend on waiting for some system operations */
    sum(ProfileEvents['DiskReadElapsedMicroseconds']) / 1000000 AS DiskReadTime,
    sum(ProfileEvents['DiskWriteElapsedMicroseconds']) / 1000000 AS DiskWriteTime,
    sum(ProfileEvents['NetworkSendElapsedMicroseconds']) / 1000000 AS NetworkSendTime, /* check the other side of the network! */
    sum(ProfileEvents['NetworkReceiveElapsedMicroseconds']) / 1000000 AS NetworkReceiveTime, /* check the other side of the network! */
    sum(ProfileEvents['OSIOWaitMicroseconds']) / 1000000 AS OSIOWaitTime, /* IO waits, usually disks - that metric is 'orthogonal' to other */ 
    sum(ProfileEvents['OSCPUWaitMicroseconds']) / 1000000 AS OSCPUWaitTime, /* waiting for a 'free' CPU - usually high when the other load on the server creates a lot of contention for cpu */ 
    sum(ProfileEvents['OSCPUVirtualTimeMicroseconds']) / 1000000 AS OSCPUVirtualTime, /* similar to usertime + system time */
    sum(ProfileEvents['NetworkReceiveBytes']) AS NetworkReceiveBytes,
    sum(ProfileEvents['NetworkSendBytes']) AS NetworkSendBytes,
    sum(ProfileEvents['SelectedParts']) as SelectedParts,
    sum(ProfileEvents['SelectedRanges']) as SelectedRanges,
    sum(ProfileEvents['SelectedMarks']) as SelectedMarks,
    sum(ProfileEvents['SelectedRows']) as SelectedRows,  /* those may different from read_rows - here the number or rows potentially matching the where conditions, not neccessary all will be read */
    sum(ProfileEvents['SelectedBytes']) as SelectedBytes,
    sum(ProfileEvents['FileOpen']) as FileOpen,
    sum(ProfileEvents['ZooKeeperTransactions']) as ZooKeeperTransactions,
    sum(ProfileEvents['OSReadBytes'] )  as OSReadBytesExcludePageCache,
    sum(ProfileEvents['OSWriteBytes'] )  as OSWriteBytesExcludePageCache,
    sum(ProfileEvents['OSReadChars'] )  as OSReadBytesIncludePageCache,
    sum(ProfileEvents['OSWriteChars'] )  as OSWriteCharsIncludePageCache,
    quantile(0.97)(memory_usage)  as MemoryUsageQ97 ,
    sum(read_rows) AS ReadRows,
    sum(read_bytes) AS ReadBytes,
    sum(written_rows) AS WrittenRows,
    sum(written_bytes) AS WrittenBytes, /* */
    sum(result_rows) AS ResultRows,
    sum(result_bytes) AS ResultBytes
FROM clusterAllReplicas('{cluster}', system.query_log)
WHERE event_time BETWEEN '2024-04-04 11:31:10' and '2024-04-04 12:36:50' AND type in (2,4)-- QueryFinish, ExceptionWhileProcessing
GROUP BY normalized_query_hash, host
)
)
WHERE 
(rank_by_cnt <= 20 and cnt > 10)
OR (rank_by_duration <= 20 and QueriesDuration > 60)
OR (rank_by_real_time <= 20 and RealTime > 60)
OR (rank_by_user_time <= 20 and UserTime > 60)
OR (rank_by_system_time <= 20 and SystemTime > 60)
OR (rank_by_disk_read_time <= 20 and DiskReadTime > 60)
OR (rank_by_disk_write_time <= 20 and DiskWriteTime > 60)
OR (rank_by_network_send_time <= 20 and NetworkSendTime > 60)
OR (rank_by_network_receive_time <= 20 and NetworkReceiveTime > 60)
OR (rank_by_os_io_wait_time <= 20 and OSIOWaitTime > 60)
OR (rank_by_os_cpu_wait_time <= 20 and OSCPUWaitTime > 60)
OR (rank_by_os_cpu_virtual_time <= 20 and OSCPUVirtualTime > 60)
OR (rank_by_network_receive_bytes <= 20 and NetworkReceiveBytes > 500000000)
OR (rank_by_network_send_bytes <= 20 and NetworkSendBytes > 500000000)
OR (rank_by_selected_parts <= 20 and SelectedParts > 1000)
OR (rank_by_selected_ranges <= 20 and SelectedRanges > 1000)
OR (rank_by_selected_marks <= 20 and SelectedMarks > 1000)
OR (rank_by_selected_rows <= 20 and SelectedRows > 1000000)
OR (rank_by_selected_bytes <= 20 and SelectedBytes > 500000000)
OR (rank_by_file_open <= 20 and FileOpen > 1000)
OR (rank_by_zookeeper_transactions <= 20 and ZooKeeperTransactions > 10)
OR (rank_by_os_read_bytes_exclude_page_cache <= 20 and OSReadBytesExcludePageCache > 500000000)
OR (rank_by_os_write_bytes_exclude_page_cache <= 20 and OSWriteBytesExcludePageCache > 500000000)
OR (rank_by_os_read_bytes_include_page_cache <= 20 and OSReadBytesIncludePageCache > 500000000)
OR (rank_by_os_write_chars_include_page_cache <= 20 and OSWriteCharsIncludePageCache > 500000000)
OR (rank_by_memory_usage_q97 <= 20 and MemoryUsageQ97 > 500000000)
OR (rank_by_read_rows <= 20 and ReadRows > 100000)
OR (rank_by_read_bytes <= 20 and ReadBytes > 500000000)
OR (rank_by_written_rows <= 20 and WrittenRows > 100000)
OR (rank_by_written_bytes <= 20 and WrittenBytes > 500000000)
OR (rank_by_result_rows <= 20 and ResultRows > 100000)
OR (rank_by_result_bytes <= 20 and ResultBytes > 100000000)
ORDER BY rank_by_cnt*10 + rank_by_duration*10 + rank_by_real_time*10 + rank_by_user_time*10 + rank_by_system_time*10 + rank_by_disk_read_time*10 + rank_by_disk_write_time*5 + rank_by_network_send_time + rank_by_network_receive_time + rank_by_os_io_wait_time + rank_by_os_cpu_wait_time + rank_by_os_cpu_virtual_time*10 + rank_by_network_receive_bytes*8 + rank_by_network_send_bytes*8 + rank_by_selected_parts*5 + rank_by_selected_ranges*5 + rank_by_selected_marks*5 + rank_by_selected_rows*5 + rank_by_selected_bytes*5 + rank_by_file_open*5 + rank_by_zookeeper_transactions*5 + rank_by_os_read_bytes_exclude_page_cache*5 + rank_by_os_write_bytes_exclude_page_cache*5 + rank_by_os_read_bytes_include_page_cache*5 + rank_by_os_write_chars_include_page_cache*5 + rank_by_memory_usage_q97*10 + rank_by_read_rows*10 + rank_by_read_bytes*10 + rank_by_written_rows*8 + rank_by_written_bytes*8 + rank_by_result_rows*8 + rank_by_result_bytes*8 DESC
```

## Other resources

- [Compare query_log for 2 intervals](https://kb.altinity.com/altinity-kb-useful-queries/compare_query_log_for_2_intervals/)
- [Monitoring INSERT Queries](https://clickhouse.com/blog/monitoring-troubleshooting-insert-queries-clickhouse)
- [Monitoring SELECT Queries](https://clickhouse.com/blog/monitoring-troubleshooting-select-queries-clickhouse)
- [SYSTEM TABLES](https://clickhouse.com/blog/clickhouse-debugging-issues-with-system-tables)
- [Know Your Clickhouse](https://azat.sh/presentations/2022-know-your-clickhouse/)

