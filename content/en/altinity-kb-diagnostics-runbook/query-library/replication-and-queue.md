---
title: "Replication and queue queries"
linkTitle: "Replication and queue"
weight: 10
description: >
    Cluster-wide queries for inspecting the replication queue, replica
    status, and active fetches.
keywords:
  - clickhouse replication queue
  - replicated_fetches
  - postpone_reason
  - system.replicas
---

Queries for diagnosing replication queue depth, postpone reasons, replica
lag, readonly mode, and in-flight fetches. All queries fan out across the
cluster — replace `{cluster}` with your cluster name.

These queries are referenced from the
[scenarios](/altinity-kb-diagnostics-runbook/scenarios/) by their numeric
IDs (`Q1`, `Q2`, …). The numbering is stable across the runbook.

## Q1. Replication queue overview

Per-host, per-table queue depth, currently-executing entries, max retries,
and the oldest entry. The starting point when "the queue isn't draining".

```sql
SELECT
    hostName() AS host,
    database,
    table,
    count() AS queue_depth,
    countIf(is_currently_executing) AS executing,
    max(num_tries) AS max_retries,
    max(last_exception) AS last_error,
    min(create_time) AS oldest_entry
FROM clusterAllReplicas('{cluster}', system.replication_queue)
GROUP BY host, database, table
ORDER BY host, queue_depth DESC;
```

## Q2. Replication queue — postpone reasons ⭐

The smoking-gun query for merge↔fetch cycles. The `postpone_reason` text
names the actual cause; see the patterns table in
[quick reference](/altinity-kb-diagnostics-runbook/quick-reference/#common-postpone_reason-patterns).

```sql
SELECT
    hostName() AS host,
    database, table, type,
    new_part_name,
    is_currently_executing,
    num_tries,
    num_postponed,
    postpone_reason,
    last_exception,
    create_time
FROM clusterAllReplicas('{cluster}', system.replication_queue)
WHERE num_postponed > 0 OR last_exception != ''
ORDER BY num_postponed DESC, num_tries DESC
LIMIT 50;
```

## Q3. Queue entry type breakdown

Splits the queue by entry type (`GET_PART`, `MERGE_PARTS`, `MUTATE_PART`,
etc.) so you can tell whether the backlog is fetches, merges, or mutations.

```sql
SELECT
    hostName() AS host,
    database, table, type,
    count() AS entries,
    countIf(is_currently_executing) AS executing,
    avg(num_tries) AS avg_tries,
    sum(num_postponed) AS total_postponed
FROM clusterAllReplicas('{cluster}', system.replication_queue)
GROUP BY host, database, table, type
ORDER BY entries DESC;
```

## Q4. Replica status — lag and readonly per host

Drills into a specific replica's state: leader flag, readonly flag, absolute
delay in seconds, queue size split, and how far the log pointer is behind
the leader.

```sql
SELECT
    hostName() AS host,
    database,
    table,
    is_leader,
    is_readonly,
    absolute_delay AS replica_lag_sec,
    queue_size,
    inserts_in_queue,
    merges_in_queue,
    log_max_index - log_pointer AS log_behind,
    active_replicas,
    total_replicas
FROM clusterAllReplicas('{cluster}', system.replicas)
ORDER BY host, replica_lag_sec DESC;
```

## Q5. Replication summary per host ⭐

One row per host — readonly count, lag, queue depth, insert/merge backlog.
The fastest first look at cluster-wide replication health and the first
query in the general-triage flow.

```sql
SELECT
    hostName() AS host,
    count() AS total_tables,
    countIf(is_readonly) AS readonly_tables,
    countIf(absolute_delay > 300) AS lagging_tables,
    max(absolute_delay) AS max_lag_sec,
    sum(queue_size) AS total_queue_depth,
    sum(inserts_in_queue) AS total_inserts_queued,
    sum(merges_in_queue) AS total_merges_queued
FROM clusterAllReplicas('{cluster}', system.replicas)
GROUP BY host
ORDER BY max_lag_sec DESC, readonly_tables DESC;
```

## Q31. Replicated fetches in flight

Active fetch tasks with their source replica, progress, elapsed time, and
bytes transferred. Distinguishes pool *exhaustion* from pool slots *claimed
by stuck tasks*.

```sql
SELECT
    hostName() AS host,
    database, `table`,
    source_replica_hostname,
    elapsed,
    progress,
    round(total_size_bytes_compressed / 1e6, 1) AS total_MB,
    round(bytes_read_compressed / 1e6, 1) AS read_MB,
    result_part_name,
    partition_id,
    thread_id
FROM clusterAllReplicas('{cluster}', system.replicated_fetches)
ORDER BY host, elapsed DESC;
```

The column for the source replica varies by ClickHouse version. If the
above errors with "unknown identifier", inspect the schema first:

```sql
SELECT name FROM system.columns
WHERE database = 'system' AND table = 'replicated_fetches';
```

If `BackgroundFetchesPoolTask` is at the configured pool size but Q31
returns few rows, the slots are claimed by tasks that are *waiting*, not
*transferring* — Keeper saturation is the usual cause.

## Q32. Source replica distribution for active fetches

Aggregates Q31 by source replica — useful when one replica is acting as the
fetch source for everyone and saturating its outbound bandwidth.

```sql
SELECT
    hostName() AS host,
    source_replica_hostname,
    count() AS active_fetches,
    round(avg(progress) * 100, 1) AS avg_progress_pct,
    max(elapsed) AS max_elapsed_sec
FROM clusterAllReplicas('{cluster}', system.replicated_fetches)
GROUP BY host, source_replica_hostname
ORDER BY host, active_fetches DESC;
```
