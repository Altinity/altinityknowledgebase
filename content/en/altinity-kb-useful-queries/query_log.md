---
title: "Handy queries for a system.query_log"
linkTitle: "Handy queries for a system.query_log"
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
WHERE (event_time > (now() - 3600)) AND (type = 'QueryFinish')
GROUP BY normalized_query_hash
    WITH TOTALS
ORDER BY UserTime DESC
LIMIT 30
FORMAT Vertical
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
