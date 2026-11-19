---
title: "Insert load and host skew queries"
linkTitle: "Insert load and host skew"
weight: 80
description: >
    Cluster-wide queries for insert volume, per-host duration, routing
    settings, and failure-rate quantification.
keywords:
  - clickhouse insert rate
  - host skew
  - load_balancing
  - metric_log
  - failure rate
---

Queries for profiling insert workload and detecting host-skewed behaviour.
The set here lets you answer "is the workload balanced", "is the duration
balanced", "is the failure rate balanced", and "are the routing settings
balanced" — four independent questions that together pinpoint host-skew
root causes.

All queries fan out across the cluster — replace `{cluster}` /
`{database}` / `{table_pattern}` / `{target_table_pattern}` with values
from your environment.

## Q34. Active insert sources by user

Live insert activity grouped by user — quick "who's inserting right now".

```sql
SELECT hostName(), user, query_kind, count()
FROM clusterAllReplicas('{cluster}', system.processes)
WHERE query_kind = 'Insert'
GROUP BY hostName(), user, query_kind;
```

## Q35. Insert volume by user (last 24 hours)

Insert volume, error count, and time window per user across the last
day — identifies the heavy clients and the failing ones.

```sql
SELECT
    hostName() AS host,
    user,
    count() AS insert_count,
    sum(written_rows) AS total_rows,
    round(sum(written_bytes) / 1e9, 2) AS total_GB,
    round(avg(query_duration_ms), 0) AS avg_dur_ms,
    countIf(type = 'ExceptionWhileProcessing') AS errors,
    min(event_time) AS first_seen,
    max(event_time) AS last_seen
FROM clusterAllReplicas('{cluster}', system.query_log)
WHERE event_time >= now() - INTERVAL 24 HOUR
  AND query_kind = 'Insert'
  AND type IN ('QueryFinish', 'ExceptionWhileProcessing')
GROUP BY host, user
ORDER BY total_rows DESC
LIMIT 30;
```

## Q36. Insert volume by target table (last 24 hours)

Extracts the target table from the query text with a regex, then
aggregates by it. Cross-check against
[Q47](#q47-failed-insert-query-text-inspection) before treating any table
as the "actual writer" — `tables[]` includes the MV chain.

```sql
SELECT
    hostName() AS host,
    extract(query, 'INTO\s+([\w\.`]+)') AS target_table,
    count() AS inserts,
    sum(written_rows) AS rows,
    round(sum(written_bytes) / 1e9, 2) AS GB,
    countIf(type = 'ExceptionWhileProcessing') AS errors
FROM clusterAllReplicas('{cluster}', system.query_log)
WHERE event_time >= now() - INTERVAL 24 HOUR
  AND query_kind = 'Insert'
GROUP BY host, target_table
ORDER BY rows DESC
LIMIT 30;
```

## Q37. Insert rate per minute (spike detection)

Per-minute insert counts and error counts across the last 24 hours. The
shape of the distribution tells you "spike" vs "sustained" — the
remediation differs.

```sql
SELECT
    toStartOfMinute(event_time) AS minute,
    count() AS inserts,
    sum(written_rows) AS rows,
    countIf(type = 'ExceptionWhileProcessing') AS errors
FROM clusterAllReplicas('{cluster}', system.query_log)
WHERE event_time >= now() - INTERVAL 24 HOUR
  AND query_kind = 'Insert'
GROUP BY minute
ORDER BY inserts DESC
LIMIT 30;
```

## Q40. Active inserts confirmation (per-table specific)

Counts new parts in the last 24 hours for tables matching
`{table_pattern}`. An empty result confirms a table is *not* being written
to — useful for verifying that an old/archived table is frozen.

```sql
SELECT
    hostName() AS host,
    database, `table`,
    sum(rows) AS rows_inserted,
    count() AS insert_events,
    max(event_time) AS last_insert
FROM clusterAllReplicas('{cluster}', system.part_log)
WHERE event_time >= now() - INTERVAL 24 HOUR
  AND event_type = 'NewPart'
  AND `table` LIKE '%{table_pattern}%'
GROUP BY host, database, `table`
ORDER BY rows_inserted DESC;
```

## Q41. Partition schema check (preventive)

Lists the partition key and sorting key for tables matching the pattern.
Use ahead of partition fragmentation diagnosis to confirm what the schema
actually is.

```sql
SELECT
    database, `table`, partition_key, sorting_key
FROM clusterAllReplicas('{cluster}', system.tables)
WHERE `table` LIKE '%{table_pattern}%'
GROUP BY database, `table`, partition_key, sorting_key
ORDER BY database, `table`;
```

## Q46. Per-host insert duration profile ⭐

Per-host average, p95, and p99 insert duration over the last five minutes.
The first query to confirm "failures concentrate on some hosts but volume
looks similar" — if `avg_ms` or `p95_ms` differ by orders of magnitude
across hosts on identical workloads, the bottleneck is host-specific.

```sql
SELECT
    hostName() AS host,
    count() AS query_count,
    round(avg(query_duration_ms), 0) AS avg_ms,
    round(quantile(0.95)(query_duration_ms), 0) AS p95_ms,
    round(quantile(0.99)(query_duration_ms), 0) AS p99_ms
FROM clusterAllReplicas('{cluster}', system.query_log)
WHERE event_time >= now() - INTERVAL 5 MINUTE
  AND type = 'QueryFinish'
  AND query_kind = 'Insert'
GROUP BY host
ORDER BY host;
```

## Q47. Failed insert query text inspection ⭐

The query text contains the actual physical INSERT target — not just the
MV chain that `tables[]` exposes. Use this before blaming any specific
table for a timeout.

```sql
SELECT
    hostName() AS host,
    event_time,
    query_duration_ms,
    substring(exception, 1, 200) AS exception_text,
    user, client_hostname, initial_address,
    substring(query, 1, 500) AS query_text
FROM clusterAllReplicas('{cluster}', system.query_log)
WHERE event_time >= now() - INTERVAL 30 MINUTE
  AND type = 'ExceptionWhileProcessing'
  AND exception ILIKE '%async insert%timeout%'
ORDER BY event_time DESC
LIMIT 5 FORMAT Vertical;
```

The `INSERT INTO database.table` statement in the query text reveals the
real writer. Any other tables that show up in
[Q38](/altinity-kb-diagnostics-runbook/query-library/async-inserts/#q38-async-insert-timeout-failures-by-table)'s
`arrayJoin(tables)` are MV dependencies, not direct writes.

## Q48. Per-second activity from metric_log

Per-host averages and sums of profile events over a recent window:
active queries, message-broker pool task count, disk-write microseconds,
ZooKeeper wait microseconds, async insert attempts, and failed insert
attempts. The right tool for "is host-X currently doing more or less
work than the others?".

```sql
SELECT
    hostName() AS host,
    count() AS samples,
    avg(CurrentMetric_Query) AS avg_active_queries,
    max(CurrentMetric_Query) AS max_active_queries,
    avg(CurrentMetric_BackgroundMessageBrokerSchedulePoolTask) AS avg_mb_pool,
    sum(ProfileEvent_DiskWriteElapsedMicroseconds) AS disk_write_us,
    sum(ProfileEvent_ZooKeeperWaitMicroseconds) AS zk_wait_us,
    sum(ProfileEvent_AsyncInsertQuery) AS async_inserts,
    sum(ProfileEvent_FailedInsertQuery) AS failed_inserts
FROM clusterAllReplicas('{cluster}', system.metric_log)
WHERE event_time >= now() - INTERVAL 5 MINUTE
GROUP BY host
ORDER BY host;
```

`system.metric_log` stores metrics as **columns** (`CurrentMetric_*`,
`ProfileEvent_*`), not rows. You can't filter with
`WHERE metric IN (...)` — `SELECT` the specific columns.

## Q52. Routing settings inspection

Per-host inspection of the settings that control where INSERTs land and
how MVs execute. When these are identical across hosts but behaviour is
still skewed, the cause is upstream (entry-point routing, not ClickHouse).

```sql
SELECT
    hostName() AS host,
    name, value
FROM clusterAllReplicas('{cluster}', system.settings)
WHERE name IN ('load_balancing', 'parallel_view_processing',
               'prefer_localhost_replica', 'distributed_foreground_insert',
               'async_insert', 'async_insert_busy_timeout_ms',
               'async_insert_busy_timeout_max_ms', 'async_insert_threads',
               'wait_for_async_insert')
ORDER BY host, name;
```

See
[Investigation methods → routing settings to know about](/altinity-kb-diagnostics-runbook/investigation-methods/#routing-settings-to-know-about)
for what each setting does.

## Q53. Failure rate per host ⭐

Failure rate as a percentage of attempts — the workload-normalised view
of "which hosts are actually failing more". Pair with Q46 (duration) and
Q48 (volume) for the full picture.

```sql
SELECT
    hostName() AS host,
    sum(ProfileEvent_AsyncInsertQuery) AS total_attempts,
    sum(ProfileEvent_FailedInsertQuery) AS failures,
    round(sum(ProfileEvent_FailedInsertQuery) * 100.0 /
          nullIf(sum(ProfileEvent_AsyncInsertQuery), 0), 1) AS failure_rate_pct
FROM clusterAllReplicas('{cluster}', system.metric_log)
WHERE event_time >= now() - INTERVAL 5 MINUTE
GROUP BY host
ORDER BY failure_rate_pct DESC;
```
