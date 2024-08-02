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

## Find queries which were started but not finished at some moment in time

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
