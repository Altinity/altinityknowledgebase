---
title: "source parts size is greater than the current maximum"
linkTitle: "source parts sizeis greater than the current maximum"
weight: 100
description: >-
     source parts size (...) is greater than the current maximum (...)
---

## Symptom

I see messages like: `source parts size (...) is greater than the current maximum (...)` in the logs and/or inside `system.replication_queue`


## Cause

Usually that means that there are already few big merges running.
You can see the running merges using the query:

```
SELECT * FROM system.merges
```

That logic is needed to prevent picking a log of huge merges simultaneously
(otherwise they will take all available slots and clickhouse will not be
able to do smaller merges, which usally are important for keeping the
number of parts stable).


## Action

It is normal to see those messages on some stale replicas. And it should be resolved
automatically after some time. So just wait & monitor system.merges &
system.replication_queue tables, it should be resolved by it's own.

If it happens often or don't resolves by it's own during some longer period of time,
it could be caused by: 
1) increased insert pressure
2) disk issues / high load (it works slow, not enought space etc.) 
3) high CPU load (not enough CPU power to catch up with merges)
4) issue with table schemas leading to high merges pressure (high / increased number of tables / partitions / etc.)

Start from checking dmesg / system journals / clickhouse monitoring to find the anomalies. 
