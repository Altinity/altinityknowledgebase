---
title: "Threads"
linkTitle: "Threads"
description: >
    Threads
---

Collect thread names & counts using ps & clickhouse-local

```bash
ps H -o 'tid comm' $(pidof -s clickhouse-server) |  tail -n +2 | awk '{ printf("%s\t%s\n", $1, $2) }' | clickhouse-local -S "threadid UInt16, name String" -q "SELECT name, count() FROM table GROUP BY name WITH TOTALS ORDER BY count() DESC FORMAT PrettyCompact"
```

Check threads used by running queries:

```sql
SELECT query, length(thread_ids) AS threads_count FROM system.processes ORDER BY threads_count;
```

```bash
---
title: "cat /proc/$(pidof -s clickhouse-server)/status | grep Threads"
linkTitle: "cat /proc/$(pidof -s clickhouse-server)/status | grep Threads"
description: >
    cat /proc/$(pidof -s clickhouse-server)/status | grep Threads
---
Threads: 103
---
title: "ps hH $(pidof -s clickhouse-server) | wc -l"
linkTitle: "ps hH $(pidof -s clickhouse-server) | wc -l"
description: >
    ps hH $(pidof -s clickhouse-server) | wc -l
---
103
---
title: "ps hH -AF | grep clickhouse | wc -l"
linkTitle: "ps hH -AF | grep clickhouse | wc -l"
description: >
    ps hH -AF | grep clickhouse | wc -l
---
116
```

Pools

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
```

Stack traces 

```sql
SET allow_introspection_functions = 1;

WITH arrayMap(x -> demangle(addressToSymbol(x)), trace) AS all
SELECT
    thread_id,
    query_id,
    arrayStringConcat(all, '\n') AS res
FROM system.stack_trace
WHERE res ILIKE '%Pool%'
```

© 2021 Altinity Inc. All rights reserved.

