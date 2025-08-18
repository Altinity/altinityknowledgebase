---
title: "Async INSERTs"
linkTitle: "Async INSERTs"
description: >
    Comprehensive guide to ClickHouse Async INSERTs - configuration, best practices, and monitoring
---

## Overview

Async INSERTs is a ClickHouse® feature that enables automatic server-side batching of data. While we generally recommend batching at the application/ingestor level for better control and decoupling, async inserts are valuable when you have hundreds or thousands of clients performing small inserts and client-side batching is not feasible.

**Key Documentation:** [Official Async Inserts Documentation](https://clickhouse.com/docs/en/optimize/asynchronous-inserts)

## How Async Inserts Work

When `async_insert=1` is enabled, ClickHouse buffers incoming inserts and flushes them to disk when one of these conditions is met:
1. Buffer reaches specified size (`async_insert_max_data_size`)
2. Time threshold elapses (`async_insert_busy_timeout_ms`)
3. Maximum number of queries accumulate (`async_insert_max_query_number`)

## Critical Configuration Settings

### Core Settings

```sql
-- Enable async inserts (0=disabled, 1=enabled)
SET async_insert = 1;

-- Wait behavior (STRONGLY RECOMMENDED: use 1)
-- 0 = fire-and-forget mode (risky - no error feedback)
-- 1 = wait for data to be written to storage
SET wait_for_async_insert = 1;

-- Buffer flush conditions
SET async_insert_max_data_size = 1000000;  -- 1MB default
SET async_insert_busy_timeout_ms = 1000;    -- 1 second
SET async_insert_max_query_number = 100;    -- max queries before flush
```

### Adaptive Timeout (Since 24.3)

```sql
-- Adaptive timeout automatically adjusts flush timing based on server load
-- Default: 1 (enabled) - OVERRIDES manual timeout settings
-- Set to 0 for deterministic behavior with manual settings
SET async_insert_use_adaptive_busy_timeout = 0;
```

## Important Behavioral Notes

### What Works and What Doesn't

✅ **Works with Async Inserts:**
- Direct INSERT with VALUES
- INSERT with FORMAT (JSONEachRow, CSV, etc.)
- Native protocol inserts (since 22.x)

❌ **Does NOT Work:**
- `INSERT .. SELECT` statements - Other strategies are needed for managing performance and load. Do not use `async_insert`.

### Data Safety Considerations

**ALWAYS use `wait_for_async_insert = 1` in production!**

Risks with `wait_for_async_insert = 0`:
- **Silent data loss** on errors (read-only table, disk full, too many parts)
- Data loss on sudden restart (no fsync by default)
- Data not immediately queryable after acknowledgment
- No error feedback to client

### Deduplication Behavior

- **Sync inserts:** Automatic deduplication enabled by default
- **Async inserts:** Deduplication disabled by default
- Enable with `async_insert_deduplicate = 1` (since 22.x)
- **Warning:** Don't use with `deduplicate_blocks_in_dependent_materialized_views = 1`

# features / improvements

* Async insert dedup: Support block deduplication for asynchronous inserts. Before this change, async inserts did not support deduplication, because multiple small inserts coexisted in one inserted batch:
  - [#38075](https://github.com/ClickHouse/ClickHouse/issues/38075)
  - [#43304](https://github.com/ClickHouse/ClickHouse/pull/43304)
* Added system table `asynchronous_insert_log`. It contains information about asynchronous inserts (including results of queries in fire-and-forget mode. (with wait_for_async_insert=0)) for better introspection [#42040](https://github.com/ClickHouse/ClickHouse/pull/42040)
* Support async inserts in **clickhouse-client** for queries with inlined data **(Native protocol)**:
  - [#34267](https://github.com/ClickHouse/ClickHouse/pull/34267)
  - [#54098](https://github.com/ClickHouse/ClickHouse/issues/54098)
  - [#54381](https://github.com/ClickHouse/ClickHouse/issues/54381) 
* Async insert backpressure [#4762](https://github.com/ClickHouse/ClickHouse/issues/47623)
* Limit the deduplication overhead when using `async_insert_deduplicate` [#46549](https://github.com/ClickHouse/ClickHouse/pull/46549)
* `SYSTEM FLUSH ASYNC INSERTS` [#49160](https://github.com/ClickHouse/ClickHouse/pull/49160)
* Adjustable asynchronous insert timeouts [#58486](https://github.com/ClickHouse/ClickHouse/pull/58486)


## bugfixes

- Fixed bug which could lead to deadlock while using asynchronous inserts [#43233](https://github.com/ClickHouse/ClickHouse/pull/43233).
- Fix crash when async inserts with deduplication are used for ReplicatedMergeTree tables using a nondefault merging algorithm [#51676](https://github.com/ClickHouse/ClickHouse/pull/51676)
- Async inserts not working with log_comment setting [48430](https://github.com/ClickHouse/ClickHouse/issues/48430)
- Fix misbehaviour with async inserts with deduplication [#50663](https://github.com/ClickHouse/ClickHouse/pull/50663)
- Reject Insert if `async_insert=1` and `deduplicate_blocks_in_dependent_materialized_views=1`[#60888](https://github.com/ClickHouse/ClickHouse/pull/60888)
- Disable `async_insert_use_adaptive_busy_timeout` correctly with compatibility settings [#61486](https://github.com/ClickHouse/ClickHouse/pull/61468)


## observability / introspection

In 22.x versions, it is not possible to relate `part_log/query_id` column with `asynchronous_insert_log/query_id` column. We need to use `query_log/query_id`:

`asynchronous_insert_log` shows up the `query_id` and `flush_query_id` of each async insert. The `query_id` from `asynchronous_insert_log` shows up in the `system.query_log` as `type = 'QueryStart'` but the same `query_id` does not show up in the `query_id` column of the `system.part_log`. Because the `query_id` column in the `part_log` is the identifier of the INSERT query that created a data part, and it seems it is for sync INSERTS but not for async inserts.

So in `asynchronous_inserts` table you can check the current batch that still has not been flushed. In the `asynchronous_insert_log` you can find a log of all the flushed async inserts. 

This has been improved in **ClickHouse 23.7** Flush queries for async inserts (the queries that do the final push of data) are now logged in the `system.query_log` where they appear as `query_kind = 'AsyncInsertFlush'` [#51160](https://github.com/ClickHouse/ClickHouse/pull/51160)


## Versions

- **23.8** is a good version to start using async inserts because of the improvements and bugfixes. 
- **24.3** the new adaptive timeout mechanism has been added so ClickHouse will throttle the inserts based on the server load.[#58486](https://github.com/ClickHouse/ClickHouse/pull/58486) This new feature is enabled by default and will OVERRRIDE current async insert settings, so better to disable it if your async insert settings are working. Here's how to do it in a clickhouse-client session: `SET async_insert_use_adaptive_busy_timeout = 0;` You can also add it as a setting on the INSERT or as a profile setting. 


## Metrics

```sql
SELECT name
FROM system.columns
WHERE (`table` = 'metric_log') AND ((name ILIKE '%asyncinsert%') OR (name ILIKE '%asynchronousinsert%'))

┌─name─────────────────────────────────────────────┐
│ ProfileEvent_AsyncInsertQuery                    │
│ ProfileEvent_AsyncInsertBytes                    │
│ ProfileEvent_AsyncInsertRows                     │
│ ProfileEvent_AsyncInsertCacheHits                │
│ ProfileEvent_FailedAsyncInsertQuery              │
│ ProfileEvent_DistributedAsyncInsertionFailures   │
│ CurrentMetric_AsynchronousInsertThreads          │
│ CurrentMetric_AsynchronousInsertThreadsActive    │
│ CurrentMetric_AsynchronousInsertThreadsScheduled │
│ CurrentMetric_AsynchronousInsertQueueSize        │
│ CurrentMetric_AsynchronousInsertQueueBytes       │
│ CurrentMetric_PendingAsyncInsert                 │
│ CurrentMetric_AsyncInsertCacheSize               │
└──────────────────────────────────────────────────┘

SELECT *
FROM system.metrics
WHERE (metric ILIKE '%asyncinsert%') OR (metric ILIKE '%asynchronousinsert%')

┌─metric─────────────────────────────┬─value─┬─description─────────────────────────────────────────────────────────────┐
│ AsynchronousInsertThreads          │     1 │ Number of threads in the AsynchronousInsert thread pool.                │
│ AsynchronousInsertThreadsActive    │     0 │ Number of threads in the AsynchronousInsert thread pool running a task. │
│ AsynchronousInsertThreadsScheduled │     0 │ Number of queued or active jobs in the AsynchronousInsert thread pool.  │
│ AsynchronousInsertQueueSize        │     1 │ Number of pending tasks in the AsynchronousInsert queue.                │
│ AsynchronousInsertQueueBytes       │   680 │ Number of pending bytes in the AsynchronousInsert queue.                │
│ PendingAsyncInsert                 │     7 │ Number of asynchronous inserts that are waiting for flush.              │
│ AsyncInsertCacheSize               │     0 │ Number of async insert hash id in cache                                 │
└────────────────────────────────────┴───────┴─────────────────────────────────────────────────────────────────────────┘
```
