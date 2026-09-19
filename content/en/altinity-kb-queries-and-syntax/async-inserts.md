---
title: "Async INSERTs"
linkTitle: "Async INSERTs"
description: >
    Configure, scope, and monitor asynchronous inserts in ClickHouse.
---

## Overview

Async INSERTs let ClickHouse® batch many small inserts in server memory before writing them to storage. Use them when clients cannot form sufficiently large batches themselves. Client-side batching remains preferable when you control the writers because it keeps buffering outside ClickHouse.

Starting with the 26.2.4 release line, ClickHouse [enables async inserts by default](https://github.com/ClickHouse/ClickHouse/pull/97590). Earlier releases default to synchronous inserts. Set it explicitly in an ingestion user's profile when you need stable behavior across versions:

```sql
ALTER USER ingest SETTINGS async_insert = 1, wait_for_async_insert = 1;
```

Keep `wait_for_async_insert = 1` for production workloads. ClickHouse then acknowledges an insert only after the batch reaches storage and returns flush errors to the client. With `wait_for_async_insert = 0` (fire-and-forget), the client receives an acknowledgment while data is still buffered and cannot observe later failures.

## How Async Inserts Work

ClickHouse keeps separate buffers for different target tables, insert shapes, formats, and settings. Each server node has its own buffers. A buffer flushes when the first applicable condition is met:

- buffered data reaches `async_insert_max_data_size`
- the busy timeout expires `async_insert_busy_timeout_ms`
- buffered queries reach `async_insert_max_query_number` while insert deduplication is enabled.

Async inserts apply to `INSERT ... VALUES` and inserts with inline formats over HTTP or the native protocol. `INSERT ... SELECT` always runs synchronously.

### Adaptive timeout

Since ClickHouse 24.2, [adaptive busy timeouts are enabled by default](https://github.com/ClickHouse/ClickHouse/pull/58486). Frequent inserts increase the timeout from `async_insert_busy_timeout_min_ms` toward `async_insert_busy_timeout_max_ms`, allowing larger batches. Sparse inserts decrease it toward the minimum to reduce latency.

Keep the adaptive mechanism enabled unless you need a fixed timeout for a tested workload. Tune the minimum for latency and the maximum for batching. Change `async_insert_max_data_size` when batch size, rather than time, should drive flushing. Leave the polling interval and timeout increase/decrease rates at their defaults unless measurements show a specific problem.

### Fixed timeout mode

Set `async_insert_use_adaptive_busy_timeout = 0` to use a fixed busy timeout. In this mode, ClickHouse uses `async_insert_busy_timeout_max_ms`.

`async_insert_busy_timeout_ms` is an alias for `async_insert_busy_timeout_max_ms`, not a separate setting. You can use either name, but use `async_insert_busy_timeout_max_ms` in new
configurations.

```sql
SET async_insert_use_adaptive_busy_timeout = 0;
SET async_insert_busy_timeout_max_ms = 1000;
```

When adaptive timeouts are disabled, `async_insert_busy_timeout_min_ms`, `async_insert_busy_timeout_increase_rate`, and `async_insert_busy_timeout_decrease_rate` do not affect the flush timeout.

## Critical Configuration Settings

| Setting | Scope | Guidance |
|---|---|---|
| `async_insert` | Query/profile | Enables buffering. The default changed from `0` to `1` in the 26.2.4 release line. |
| `wait_for_async_insert` | Query/profile | Keep at `1` so clients receive flush errors and acknowledgment means the data reached storage. |
| `async_insert_max_data_size` | Query/profile | Flushes when a buffer reaches this size. Defaults vary by release and ClickHouse Cloud. |
| `async_insert_busy_timeout_min_ms` / `max_ms` | Query/profile | Bound the adaptive wait. Use the minimum for the latency target and the maximum for the batching window. |
| `async_insert_max_query_number` | Query/profile | Flushes after this many queries when deduplication is enabled. |
| `async_insert_threads` | Server | Limits background parsing and insert threads. It is a [server setting since 23.7](https://github.com/ClickHouse/ClickHouse/pull/49160) and requires a restart. The current default is `16`; `0` disables the async queue. |

Check effective values in `system.settings`, `system.server_settings`, and `system.merge_tree_settings` instead of assuming defaults match another deployment.

## Scoped Async Inserts

Using user profiles or per-query `SETTINGS` for ordinary writers. A [MergeTree-level async insert setting](https://github.com/ClickHouse/ClickHouse/pull/49122), is available since 23.5, can force-enable async inserts for one table:

```sql
ALTER TABLE db.events MODIFY SETTING async_insert = 1;
```

The table value is combined with the query/profile value using logical OR. Therefore, table-level `async_insert = 0` does **not** override an inherited `async_insert = 1`.

### Disable async inserts for one pipeline

A materialized view that writes through a `Distributed` table with `distributed_foreground_insert = 1` enabled can create a secondary regular INSERT on a remote shard. If that query inherits `async_insert = 1` (enabled by default) and batches little data, each pipeline execution can wait for the busy timeout. Prefer writing the view to the local table when that preserves the required sharding. Otherwise, use a dedicated definer profile to force disable asynchronous inserts for the pipeline.

{{% alert title="Security" color="warning" %}}
`SQL SECURITY DEFINER` runs the materialized view with the definer's identity. Use a dedicated account and grant only the required source `SELECT` and target `INSERT` privileges. Apply the user, profile, and view metadata on every relevant node unless your access storage and database replicate them.
{{% /alert %}}

```sql
CREATE SETTINGS PROFILE mv_sync_insert
SETTINGS async_insert = 0 CONST;

CREATE USER mv_sync_definer
IDENTIFIED WITH no_password
SETTINGS PROFILE mv_sync_insert;

GRANT SELECT ON db.source TO mv_sync_definer;
GRANT INSERT ON db.destination TO mv_sync_definer;

ALTER TABLE db.events_mv
MODIFY SQL SECURITY DEFINER DEFINER = mv_sync_definer;
```

The `CONST` constraint prevents an inherited value from replacing the profile value. This method does not work if the destination MergeTree table has `async_insert = 1`, because the table setting force-enables async mode.

## Observability

Use `system.asynchronous_inserts` to inspect buffers that have not flushed. Use `system.asynchronous_insert_log` to inspect completed flushes, failures, and time spent waiting.

To identify available async-insert metrics in `system.metric_log`, run:

```bash
clickhouse-client --connection localhost --query "
SELECT name
FROM system.columns
WHERE table = 'metric_log'
  AND (name ILIKE '%asyncinsert%' OR name ILIKE '%asynchronousinsert%')
ORDER BY name
"
```

Check the current pool, queue, and pending-buffer metrics with:

```bash
clickhouse-client --connection localhost --query "
SELECT metric, value, description
FROM system.metrics
WHERE metric ILIKE '%asyncinsert%'
   OR metric ILIKE '%asynchronousinsert%'
ORDER BY metric;
"
```

`AsynchronousInsertThreads` is the pool's current size; `AsynchronousInsertThreadsActive` is the number running work; and `AsynchronousInsertThreadsScheduled` counts queued or active jobs. `AsynchronousInsertQueueSize`, `AsynchronousInsertQueueBytes`, and `PendingAsyncInsert` show pending work. Increase `async_insert_threads` only when the pool reaches its configured maximum, active threads stay near it, and scheduled work remains above it during normal load. Confirm CPU and storage headroom first: more insert threads can increase contention.

## Version and Reliability Notes

ClickHouse 24.2 introduced adaptive busy timeouts and [SQL security definers for materialized views](https://github.com/ClickHouse/ClickHouse/blob/master/docs/changelogs/archive/v24.2.1.2248-stable.md).

### Deduplication changes in 26.2

ClickHouse 26.2 [unified synchronous and asynchronous insert deduplication](https://clickhouse.com/docs/concepts/features/operations/insert/asyncinserts#deduplication-and-reliability) under `deduplicate_insert`. It defaults to `enable` for Replicated* tables that retain a deduplication log, and supersedes `insert_deduplicate` and `async_insert_deduplicate`. To preserve the earlier per-insert behavior, set `deduplicate_insert = 'backward_compatible_choice'`. The legacy settings then select deduplication for their respective insert type.

Deduplication for dependent materialized views also defaults to enabled in 26.2. Async inserts cannot deduplicate a view that produces more than one output block per input block. Use synchronous inserts for that view, or set `deduplicate_blocks_in_dependent_materialized_views = 0`; the latter allows retries to duplicate rows in the view target.

### Deduplication-hash migration

[`insert_deduplication_version`](https://github.com/ClickHouse/ClickHouse/pull/95409) is a server setting that migrates old, separate synchronous and asynchronous deduplication hashes to one unified hash. It affects async inserts whenever insert deduplication is enabled.

- `old_separate_hashes` uses the historical, different hashes.
- `compatible_double_hashes` writes both the old and unified hashes for every deduplicated block. This is the default in 26.2 through 26.5 and can increase Keeper work and deduplication-log entries on Replicated* tables.
- `new_unified_hash` writes only the unified hash. It becomes the default in [26.6](https://github.com/ClickHouse/ClickHouse/commit/4ebffc68f7e5468796ee5d323789144b6fb5d1ea). From [26.7](https://github.com/ClickHouse/ClickHouse/commit/500c083e4c4), ClickHouse accepts only this value.

Check the effective value before and after an upgrade:

```sql
SELECT name, value, changed, description
FROM system.server_settings
WHERE name = 'insert_deduplication_version';
```

Do not move directly from `old_separate_hashes` to `new_unified_hash`. First run `compatible_double_hashes` on every replica. For Replicated* tables, keep it for at least the largest effective `replicated_deduplication_window_seconds` (one hour by default). For non-replicated tables, run enough inserts to cover the count-based `non_replicated_deduplication_window`. Then change to `new_unified_hash`. This period lets ClickHouse record unified IDs for data that a client might still retry.

Run `SYSTEM FLUSH ASYNC INSERT QUEUE` before planned maintenance to flush pending buffers. Graceful shutdown also flushes them by default.

## Related resources

- [Asynchronous inserts](https://clickhouse.com/docs/concepts/features/operations/insert/asyncinserts)
- [Async insert server settings](https://clickhouse.com/docs/reference/settings/server-settings/settings/async-insert)
- [SQL security for views](https://clickhouse.com/docs/reference/statements/create/view#sql_security)
