---
title: "Debug hanging thing"
linkTitle: "Debug hanging thing"
weight: 100
description: >-
     Debug hanging / freezing things
---

## Debug hanging / freezing things 

If ClickHouse is busy with something and you don't know what's happeing, you can easily check the stacktraces of all the thread which are working

```sql
SELECT
 arrayStringConcat(arrayMap(x -> demangle(addressToSymbol(x)), trace), '\n') AS trace_functions,
 count()
FROM system.stack_trace
GROUP BY trace_functions
ORDER BY count()
DESC
SETTINGS allow_introspection_functions=1
FORMAT Vertical;
```

If you can't start any queries, but you have access to the node, you can sent a singal

```
# older versions
for i in $(ls -1 /proc/$(pidof clickhouse-server)/task/); do kill -TSTP $i; done
# even older versions
for i in $(ls -1 /proc/$(pidof clickhouse-server)/task/); do kill -SIGPROF $i; done
```
