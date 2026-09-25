---
title: "Queries and mutations queries"
linkTitle: "Queries and mutations"
weight: 50
description: >
    Per-host query load, active queries, OOM/exception patterns, and stuck
    mutations.
keywords:
  - clickhouse query_log
  - clickhouse processes
  - stuck mutations
  - OOM
---

Queries for the live and recent state of the query system: load by kind,
what's running right now, recent exceptions, and stuck mutations. All
queries fan out across the cluster — replace `{cluster}` with your cluster
name.

## Q16. Query load per host (last 30 minutes)

Per-host query counts by `query_kind`, average duration, peak memory, read
and written rows, and error count. Useful for spotting load imbalance and
error spikes by query type.

```sql
SELECT
    hostName() AS host,
    query_kind,
    count() AS query_count,
    round(avg(query_duration_ms), 0) AS avg_duration_ms,
    round(max(memory_usage) / 1e9, 1) AS max_memory_GB,
    sum(read_rows) AS total_read_rows,
    sum(written_rows) AS total_written_rows,
    countIf(type = 'ExceptionWhileProcessing') AS errors
FROM clusterAllReplicas('{cluster}', system.query_log)
WHERE event_time >= now() - INTERVAL 30 MINUTE
  AND type IN ('QueryFinish', 'ExceptionWhileProcessing')
GROUP BY host, query_kind
ORDER BY host, query_count DESC;
```

## Q17. Active queries right now

Live snapshot of running queries — elapsed, memory, rows read, plus a
query snippet. The fastest way to see "what's pinning the cluster right
now".

```sql
SELECT
    hostName() AS host,
    query_id, user, elapsed,
    round(memory_usage / 1e9, 2) AS memory_GB,
    read_rows,
    formatReadableSize(read_bytes) AS read_bytes,
    query_kind,
    substring(query, 1, 200) AS query_snippet
FROM clusterAllReplicas('{cluster}', system.processes)
ORDER BY elapsed DESC
LIMIT 30;
```

## Q18. Recent OOM / exception queries

Failed queries in the last four hours with their exception code, exception
text, memory usage, and query snippet. Read after Q15 — gives you the
queries responsible for memory pressure spikes.

```sql
SELECT
    hostName() AS host,
    event_time,
    query_id,
    round(memory_usage / 1e9, 1) AS memory_GB,
    query_duration_ms,
    exception_code,
    substring(exception, 1, 300) AS exception_short,
    substring(query, 1, 200) AS query_snippet
FROM clusterAllReplicas('{cluster}', system.query_log)
WHERE event_time >= now() - INTERVAL 4 HOUR
  AND type = 'ExceptionWhileProcessing'
ORDER BY event_time DESC
LIMIT 30;
```

## Q19. Stuck mutations ⭐

All not-done mutations with their command, age, parts-to-do count, and
latest failure reason. The starting point for `ALTER TABLE … UPDATE/DELETE`
not completing.

```sql
SELECT
    hostName() AS host,
    database, table,
    mutation_id,
    command,
    create_time,
    is_done,
    parts_to_do,
    latest_fail_reason,
    latest_fail_time
FROM clusterAllReplicas('{cluster}', system.mutations)
WHERE NOT is_done
ORDER BY host, create_time;
```

Mutations share the merge pool, so a stuck mutation often means the merge
pool is saturated (see Q13). A mutation that references a column that
no longer exists fails immediately with a clear `latest_fail_reason`.
