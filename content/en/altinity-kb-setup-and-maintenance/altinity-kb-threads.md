---
title: "Threads"
linkTitle: "Threads"
description: >
    Threads
---


### Count threads used by clickhouse-server

```bash
cat /proc/$(pidof -s clickhouse-server)/status | grep Threads
Threads: 103

ps hH $(pidof -s clickhouse-server) | wc -l
103

ps hH -AF | grep clickhouse | wc -l
116
```

### Thread counts by type (using ps & clickhouse-local)


```bash
ps H -o 'tid comm' $(pidof -s clickhouse-server) |  tail -n +2 | awk '{ printf("%s\t%s\n", $1, $2) }' | clickhouse-local -S "threadid UInt16, name String" -q "SELECT name, count() FROM table GROUP BY name WITH TOTALS ORDER BY count() DESC FORMAT PrettyCompact"
```

### Threads used by running queries:

```sql
SELECT query, length(thread_ids) AS threads_count FROM system.processes ORDER BY threads_count;
```

### Thread pools limits & usage

```sql
SELECT
    name,
    value
FROM system.settings
WHERE name LIKE '%pool%'

┌─name─────────────────────────────────────────┬─value─┐
│ connection_pool_max_wait_ms                  │ 0     │
│ distributed_connections_pool_size            │ 1024  │
│ background_buffer_flush_schedule_pool_size   │ 16    │
│ background_pool_size                         │ 16    │
│ background_move_pool_size                    │ 8     │
│ background_fetches_pool_size                 │ 8     │
│ background_schedule_pool_size                │ 16    │
│ background_message_broker_schedule_pool_size │ 16    │
│ background_distributed_schedule_pool_size    │ 16    │
│ postgresql_connection_pool_size              │ 16    │
│ postgresql_connection_pool_wait_timeout      │ -1    │
│ odbc_bridge_connection_pool_size             │ 16    │
└──────────────────────────────────────────────┴───────┘
```

```sql
SELECT
    metric,
    value
FROM system.metrics
WHERE metric LIKE 'Background%'

┌─metric──────────────────────────────────┬─value─┐
│ BackgroundPoolTask                      │     0 │
│ BackgroundFetchesPoolTask               │     0 │
│ BackgroundMovePoolTask                  │     0 │
│ BackgroundSchedulePoolTask              │     0 │
│ BackgroundBufferFlushSchedulePoolTask   │     0 │
│ BackgroundDistributedSchedulePoolTask   │     0 │
│ BackgroundMessageBrokerSchedulePoolTask │     0 │
└─────────────────────────────────────────┴───────┘


SELECT *
FROM system.asynchronous_metrics
WHERE lower(metric) LIKE '%thread%'
ORDER BY metric ASC

┌─metric───────────────────────────────────┬─value─┐
│ HTTPThreads                              │     0 │
│ InterserverThreads                       │     0 │
│ MySQLThreads                             │     0 │
│ OSThreadsRunnable                        │     2 │
│ OSThreadsTotal                           │  2910 │
│ PostgreSQLThreads                        │     0 │
│ TCPThreads                               │     1 │
│ jemalloc.background_thread.num_runs      │     0 │
│ jemalloc.background_thread.num_threads   │     0 │
│ jemalloc.background_thread.run_intervals │     0 │
└──────────────────────────────────────────┴───────┘


SELECT *
FROM system.metrics
WHERE lower(metric) LIKE '%thread%'
ORDER BY metric ASC

Query id: 6acbb596-e28f-4f89-94b2-27dccfe88ee9

┌─metric─────────────┬─value─┬─description───────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ GlobalThread       │   151 │ Number of threads in global thread pool.                                                                          │
│ GlobalThreadActive │   144 │ Number of threads in global thread pool running a task.                                                           │
│ LocalThread        │     0 │ Number of threads in local thread pools. The threads in local thread pools are taken from the global thread pool. │
│ LocalThreadActive  │     0 │ Number of threads in local thread pools running a task.                                                           │
│ QueryThread        │     0 │ Number of query processing threads                                                                                │
└────────────────────┴───────┴───────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Stack traces of the working threads from the pools

```sql
SET allow_introspection_functions = 1;

WITH arrayMap(x -> demangle(addressToSymbol(x)), trace) AS all
SELECT
    thread_id,
    query_id,
    arrayStringConcat(all, '\n') AS res
FROM system.stack_trace
WHERE res ILIKE '%Pool%'
FORMAT Vertical;
```
