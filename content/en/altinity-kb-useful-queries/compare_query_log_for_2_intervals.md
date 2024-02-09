---
title: "Compare query_log for 2 intervals"
linkTitle: "Compare query_log for 2 intervals"
weight: 100
description: >-
---

```
WITH 
    toStartOfInterval(event_time, INTERVAL 5 MINUTE) = '2023-06-30 13:00:00' as before,
    toStartOfInterval(event_time, INTERVAL 5 MINUTE) = '2023-06-30 15:00:00' as after
SELECT
    normalized_query_hash,
    anyIf(query, before) AS QueryBefore,
    anyIf(query, after) AS QueryAfter,
    countIf(before) as CountBefore,
    sumIf(query_duration_ms, before) / 1000 AS QueriesDurationBefore,
    sumIf(ProfileEvents.Values[indexOf(ProfileEvents.Names, 'RealTimeMicroseconds')], before) / 1000000 AS RealTimeBefore,
    sumIf(ProfileEvents.Values[indexOf(ProfileEvents.Names, 'UserTimeMicroseconds')], before) / 1000000 AS UserTimeBefore,
    sumIf(ProfileEvents.Values[indexOf(ProfileEvents.Names, 'SystemTimeMicroseconds')], before) / 1000000 AS SystemTimeBefore,
    sumIf(ProfileEvents.Values[indexOf(ProfileEvents.Names, 'DiskReadElapsedMicroseconds')], before) / 1000000 AS DiskReadTimeBefore,
    sumIf(ProfileEvents.Values[indexOf(ProfileEvents.Names, 'DiskWriteElapsedMicroseconds')], before) / 1000000 AS DiskWriteTimeBefore,
    sumIf(ProfileEvents.Values[indexOf(ProfileEvents.Names, 'NetworkSendElapsedMicroseconds')], before) / 1000000 AS NetworkSendTimeBefore,
    sumIf(ProfileEvents.Values[indexOf(ProfileEvents.Names, 'NetworkReceiveElapsedMicroseconds')], before) / 1000000 AS NetworkReceiveTimeBefore,
    sumIf(ProfileEvents.Values[indexOf(ProfileEvents.Names, 'ZooKeeperWaitMicroseconds')], before) / 1000000 AS ZooKeeperWaitTimeBefore,
    sumIf(ProfileEvents.Values[indexOf(ProfileEvents.Names, 'OSIOWaitMicroseconds')], before) / 1000000 AS OSIOWaitTimeBefore,
    sumIf(ProfileEvents.Values[indexOf(ProfileEvents.Names, 'OSCPUWaitMicroseconds')], before) / 1000000 AS OSCPUWaitTimeBefore,
    sumIf(ProfileEvents.Values[indexOf(ProfileEvents.Names, 'OSCPUVirtualTimeMicroseconds')], before) / 1000000 AS OSCPUVirtualTimeBefore,
    sumIf(ProfileEvents.Values[indexOf(ProfileEvents.Names, 'SelectedBytes')], before)  AS SelectedBytesBefore, 
    sumIf(ProfileEvents.Values[indexOf(ProfileEvents.Names, 'SelectedRanges')], before)  AS SelectedRangesBefore,
    sumIf(read_rows, before) AS ReadRowsBefore,
    formatReadableSize(sumIf(read_bytes, before) AS ReadBytesBefore),
    sumIf(written_rows, before) AS WrittenTowsBefore,
    formatReadableSize(sumIf(written_bytes, before)) AS WrittenBytesBefore,
    sumIf(result_rows, before) AS ResultRowsBefore,
    formatReadableSize(sumIf(result_bytes, before)) AS ResultBytesBefore,

    countIf(after) as CountAfter,
    sumIf(query_duration_ms, after) / 1000 AS QueriesDurationAfter,
   sumIf(ProfileEvents.Values[indexOf(ProfileEvents.Names, 'RealTimeMicroseconds')], after) / 1000000 AS RealTimeAfter,
    sumIf(ProfileEvents.Values[indexOf(ProfileEvents.Names, 'UserTimeMicroseconds')], after) / 1000000 AS UserTimeAfter,
    sumIf(ProfileEvents.Values[indexOf(ProfileEvents.Names, 'SystemTimeMicroseconds')], after) / 1000000 AS SystemTimeAfter,
    sumIf(ProfileEvents.Values[indexOf(ProfileEvents.Names, 'DiskReadElapsedMicroseconds')], after) / 1000000 AS DiskReadTimeAfter,
    sumIf(ProfileEvents.Values[indexOf(ProfileEvents.Names, 'DiskWriteElapsedMicroseconds')], after) / 1000000 AS DiskWriteTimeAfter,
    sumIf(ProfileEvents.Values[indexOf(ProfileEvents.Names, 'NetworkSendElapsedMicroseconds')], after) / 1000000 AS NetworkSendTimeAfter,
    sumIf(ProfileEvents.Values[indexOf(ProfileEvents.Names, 'NetworkReceiveElapsedMicroseconds')], after) / 1000000 AS NetworkReceiveTimeAfter,
    sumIf(ProfileEvents.Values[indexOf(ProfileEvents.Names, 'ZooKeeperWaitMicroseconds')], after) / 1000000 AS ZooKeeperWaitTimeAfter,
    sumIf(ProfileEvents.Values[indexOf(ProfileEvents.Names, 'OSIOWaitMicroseconds')], after) / 1000000 AS OSIOWaitTimeAfter,
    sumIf(ProfileEvents.Values[indexOf(ProfileEvents.Names, 'OSCPUWaitMicroseconds')], after) / 1000000 AS OSCPUWaitTimeAfter,
    sumIf(ProfileEvents.Values[indexOf(ProfileEvents.Names, 'OSCPUVirtualTimeMicroseconds')], after) / 1000000 AS OSCPUVirtualTimeAfter,
    sumIf(ProfileEvents.Values[indexOf(ProfileEvents.Names, 'SelectedBytes')], after)  AS SelectedBytesAfter,
    sumIf(ProfileEvents.Values[indexOf(ProfileEvents.Names, 'SelectedRanges')], after)  AS SelectedRangesAfter,

    sumIf(read_rows, after) AS ReadRowsAfter,
    formatReadableSize(sumIf(read_bytes, after) AS ReadBytesAfter),
    sumIf(written_rows, after) AS WrittenTowsAfter,
    formatReadableSize(sumIf(written_bytes, after)) AS WrittenBytesAfter,
    sumIf(result_rows, after) AS ResultRowsAfter,
    formatReadableSize(sumIf(result_bytes, after)) AS ResultBytesAfter

FROM system.query_log
WHERE (before OR after) AND type in (2,4) -- QueryFinish, ExceptionWhileProcessing
GROUP BY normalized_query_hash
    WITH TOTALS
ORDER BY SelectedRangesAfter- SelectedRangesBefore DESC
LIMIT 10
FORMAT Vertical
```


```
WITH 
    toDateTime('2024-02-09 00:00:00') as timestamp_of_issue,
    event_time < timestamp_of_issue as before,
    event_time >= timestamp_of_issue as after
select
    normalized_query_hash as h,
    any(query) as query_sample,
    round(quantileIf(0.9)(query_duration_ms, before)) as duration_q90_before,
    round(quantileIf(0.9)(query_duration_ms, after))  as duration_q90_after,
    countIf(before) as cnt_before,
    countIf(after) as cnt_after,
    sumIf(query_duration_ms,before) as duration_sum_before,
    sumIf(query_duration_ms,after) as duration_sum_after,
    sumIf(ProfileEvents['UserTimeMicroseconds'], before) as usertime_sum_before,
    sumIf(ProfileEvents['UserTimeMicroseconds'], after) as usertime_sum_after,
    sumIf(read_bytes,before) as sum_read_bytes_before,
    sumIf(read_bytes,after) as sum_read_bytes_after
from system.query_log
where event_time between timestamp_of_issue - INTERVAL 3 DAY and timestamp_of_issue + INTERVAL 3 DAY
group by h
HAVING cnt_after > 1.1 * cnt_before OR sum_read_bytes_after > 1.2 * sum_read_bytes_before OR usertime_sum_after > 1.2 * usertime_sum_before
ORDER BY sum_read_bytes_after - sum_read_bytes_before 
FORMAT Vertical
```
