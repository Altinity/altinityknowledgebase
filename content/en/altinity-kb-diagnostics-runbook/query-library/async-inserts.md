---
title: "Async inserts queries"
linkTitle: "Async inserts"
weight: 60
description: >
    Cluster-wide queries for async insert flush errors, latency, MV chain
    inspection, and timeout patterns.
keywords:
  - clickhouse async insert
  - asynchronous_insert_log
  - materialized view
  - flush errors
---

Queries for diagnosing the async insert subsystem: schema variations,
flush errors and latency, materialized-view chain inspection, and the
specific timeout pattern that signals MV-chain saturation. All queries fan
out across the cluster — replace `{cluster}` / `{database}` / `{mv_name}`
with values from your environment.

## Q20. Async insert log — schema check

Column names on `asynchronous_insert_log` have shifted across versions.
Run this once when investigating a new cluster so the rest of the queries
on this page match the actual schema.

```sql
SELECT name, type
FROM system.columns
WHERE database = 'system'
  AND table = 'asynchronous_insert_log'
ORDER BY position;
```

## Q21. Async insert flush errors

Recent failed flushes with the exception text, target database/table,
rows, size, and how long the flush waited. The starting point for "inserts
return 200 OK but the data isn't there".

```sql
SELECT
    hostname AS host,
    event_time,
    status,
    exception,
    database,
    table,
    rows,
    round(bytes / 1e6, 1) AS size_MB,
    flush_time,
    dateDiff('second', event_time, flush_time) AS buffer_wait_sec
FROM clusterAllReplicas('{cluster}', system.asynchronous_insert_log)
WHERE status != 'Ok'
  AND event_time >= now() - INTERVAL 4 HOUR
ORDER BY event_time DESC
LIMIT 30;
```

## Q22. Async insert impact aggregation

Aggregates the last 12 hours of `FlushError` rows by host/table — total
rows, total size, first-error and last-error timestamps. Tells you "how
much data is affected and over what window".

```sql
SELECT
    hostname,
    database,
    table,
    status,
    count()                       AS flush_attempts,
    sum(rows)                     AS total_rows_affected,
    round(sum(bytes) / 1e9, 2)    AS total_GB,
    min(event_time)               AS first_error,
    max(event_time)               AS last_error
FROM clusterAllReplicas('{cluster}', system.asynchronous_insert_log)
WHERE status = 'FlushError'
  AND event_time >= now() - INTERVAL 12 HOUR
GROUP BY hostname, database, table, status
ORDER BY total_rows_affected DESC;
```

## Q23. Async insert flush latency by table/status

Average and max buffer wait time, plus average flush size. Compare `Ok`
rows to `FlushError` rows for the same table — a divergence in flush size
or buffer wait is a strong hint about the cause.

```sql
SELECT
    hostname AS host,
    database,
    table,
    status,
    count() AS count,
    sum(rows) AS total_rows,
    round(sum(bytes) / 1e9, 2) AS total_GB,
    avg(dateDiff('second', event_time, flush_time)) AS avg_buffer_wait_sec,
    max(dateDiff('second', event_time, flush_time)) AS max_buffer_wait_sec,
    round(avg(bytes) / 1e6, 1) AS avg_flush_MB
FROM clusterAllReplicas('{cluster}', system.asynchronous_insert_log)
WHERE event_time >= now() - INTERVAL 4 HOUR
GROUP BY hostname, database, table, status
ORDER BY hostname, status, count DESC;
```

## Q24. Slowest AsyncInsertFlush queries

The slowest flush *queries* (`query_kind = 'AsyncInsertFlush'`) in the last
four hours. Each flush execution is a query in `query_log` — this lets you
see memory, exception, and full query text for the slowest ones.

```sql
SELECT
    hostName() AS host,
    query_id,
    event_time,
    query_duration_ms,
    round(memory_usage / 1e9, 1) AS memory_GB,
    read_rows,
    written_rows,
    exception,
    substr(query, 1, 500) AS query_text
FROM clusterAllReplicas('{cluster}', system.query_log)
WHERE event_time >= now() - INTERVAL 4 HOUR
  AND query_kind = 'AsyncInsertFlush'
  AND (database = '{database}' OR query ILIKE '%{database}%')
  AND type IN ('QueryFinish', 'ExceptionWhileProcessing')
ORDER BY query_duration_ms DESC
LIMIT 20;
```

## Q25. MV appearances in failed flushes

For a specific MV, list every failed flush where the MV appears in
`views`. Quantifies the impact of one MV on flush failures.

```sql
SELECT
    hostName() AS host,
    query_duration_ms,
    round(memory_usage / 1e9, 1) AS memory_GB,
    read_rows,
    written_rows,
    views,
    exception,
    event_time
FROM clusterAllReplicas('{cluster}', system.query_log)
WHERE event_time >= now() - INTERVAL 4 HOUR
  AND query_kind = 'AsyncInsertFlush'
  AND has(views, '{database}.{mv_name}')
  AND type IN ('QueryFinish', 'ExceptionWhileProcessing')
ORDER BY query_duration_ms DESC
LIMIT 20;
```

## Q26. MV frequency in errors

Counts how often each MV appears across `ExceptionWhileProcessing` rows in
the last four hours. The MV with the highest `appearances` is the prime
suspect for the chain bottleneck.

```sql
SELECT
    hostName() AS host,
    arrayJoin(views) AS mv_name,
    count() AS appearances,
    avg(query_duration_ms) / 1000 AS avg_sec,
    max(query_duration_ms) / 1000 AS max_sec
FROM clusterAllReplicas('{cluster}', system.query_log)
WHERE event_time >= now() - INTERVAL 4 HOUR
  AND query_kind = 'AsyncInsertFlush'
  AND type = 'ExceptionWhileProcessing'
GROUP BY host, mv_name
ORDER BY appearances DESC;
```

## Q27. MV definitions — chain inspection

The `as_select` text for every MV in a database. Use after Q26 to inspect
the MV that's appearing most often in failures.

```sql
SELECT name, as_select
FROM system.tables
WHERE database = '{database}'
  AND engine = 'MaterializedView'
ORDER BY name;
```

## Q28. Live async insert health check (last 5 minutes)

A rolling status summary — counts and average row count by `status` for
the last five minutes. Useful as a poll during incident response: "are we
still failing right now?".

```sql
SELECT
    hostname,
    status,
    count() AS cnt,
    avg(rows) AS avg_rows_per_flush,
    max(rows) AS max_rows_per_flush,
    max(event_time) AS latest
FROM clusterAllReplicas('{cluster}', system.asynchronous_insert_log)
WHERE event_time >= now() - INTERVAL 5 MINUTE
GROUP BY hostname, status
ORDER BY hostname, status;
```

## Q38. Async insert timeout failures by table ⭐

Direct culprit identification — pulls failures whose exception matches
`async insert%timeout%` and groups by `arrayJoin(tables)`. The table at
the top of the result is the timing-out target.

```sql
SELECT
    hostName() AS host,
    arrayJoin(tables) AS table_name,
    count() AS failures,
    round(avg(query_duration_ms), 0) AS avg_ms,
    max(event_time) AS last_fail,
    substring(any(exception), 1, 200) AS sample_exception
FROM clusterAllReplicas('{cluster}', system.query_log)
WHERE event_time >= now() - INTERVAL 4 HOUR
  AND type = 'ExceptionWhileProcessing'
  AND exception ILIKE '%async insert%timeout%'
GROUP BY host, table_name
ORDER BY failures DESC
LIMIT 20;
```

`arrayJoin(tables)` exposes the full MV blast radius — including non-writer
dependencies. Always cross-check the actual physical INSERT target with
[Q47](/altinity-kb-diagnostics-runbook/query-library/insert-load-and-host-skew/#q47-failed-insert-query-text-inspection)
before recommending a fix on one of these tables.
