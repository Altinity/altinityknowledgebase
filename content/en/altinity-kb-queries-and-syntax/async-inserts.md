---
title: "Async INSERTs"
linkTitle: "Async INSERTs"
description: >
    Async INSERTs
---

Async INSERTs is a ClickHouse feature tha enables batching data automatically and transparently on the server-side. We recommend to batch at app/ingestor level because you will have more control and you decouple this responsibility from ClickHouse, but there are use cases where this is not possible and Async inserts come in handy if you have hundreds or thousands of clients doing small inserts.

You can check how they work here: [Async inserts](https://clickhouse.com/docs/en/optimize/asynchronous-inserts)

Some insights about Async inserts you should now:

* Async inserts give acknowledgment immediately after the data got inserted into the buffer (wait_for_async_insert = 0) or by default, after the data got written to a part after flushing from buffer (wait_for_async_insert = 1).
* `INSERT .. SELECT` is NOT async insert. (You can use matView + Null table OR ephemeral columns instead of INPUT function so Async inserts will work)
* Async inserts will do (idempotent) retries.
* Async inserts can do batching, so multiple inserts can be squashed as a single insert (but in that case, retries are not idempotent anymore).
* Important to use `wait_for_async_insert = 1` because with any error you will loose data without knowing it. For example your table is read only -> losing data,  out of disk space -> losing data, too many parts -> losing data.
* If `wait_for_async_insert = 0`:
  * Async inserts can loose your data in case of sudden restart (no fsyncs by default).
  * Async inserted data becomes available for selects not immediately after acknowledgment.
  * Async insert is fast sending ACK to clients unblocking them, because they have to wait until ACK is received.
* Async inserts generally have more `moving parts` there are some background threads monitoring new data to be sent and pushing it out.
* Async inserts require extra monitoring from different system.tables (see `system.part_log`, `system.query_log`, `system.asynchronous_inserts` and `system_asynchronous_insert_log`).

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
* SYSTEM FLUSH ASYNC INSERTS [#49160](https://github.com/ClickHouse/ClickHouse/pull/49160)
* Adjustable asynchronous insert timeouts [#58486](https://github.com/ClickHouse/ClickHouse/pull/58486)


## bugfixes

- Fixed bug which could lead to deadlock while using asynchronous inserts [#43233](https://github.com/ClickHouse/ClickHouse/pull/43233).
- Fix crash when async inserts with deduplication are used for ReplicatedMergeTree tables using a nondefault merging algorithm [#51676](https://github.com/ClickHouse/ClickHouse/pull/51676)
- Async inserts not working with log_comment setting [48430](https://github.com/ClickHouse/ClickHouse/issues/48430)
- Fix misbehaviour with async inserts with deduplication [#50663](https://github.com/ClickHouse/ClickHouse/pull/50663)
- Reject Insert if `async_insert=1` and `deduplicate_blocks_in_dependent_materialized_views=1`[#60888](https://github.com/ClickHouse/ClickHouse/pull/60888)
- Disable async_insert_use_adaptive_busy_timeout correctly with compatibility settings [#61486](https://github.com/ClickHouse/ClickHouse/pull/61468)


## observability / introspection

In 22.x versions, it is not possible to relate `part_log/query_id` column with `asynchronous_insert_log/query_id` column. We need to use `query_log/query_id`:

`asynchronous_insert_log` shows up the `query_id` and `flush_query_id` of each async insert. The `query_id` from `asynchronous_insert_log` shows up in the `system.query_log` as `type = 'QueryStart'` but the same `query_id` does not show up in the `query_id` column of the `system.part_log`. Because the `query_id` column in the `part_log` is the identifier of the INSERT query that created a data part, and it seems it is for sync INSERTS but not for async inserts.

So in `asynchronous_inserts` table you can check the current batch that still has not been flushed. In the `asynchronous_insert_log` you can find a log of all the flushed async inserts. 

This has been improved in **ClickHouse 23.7** Flush queries for async inserts (the queries that do the final push of data) are now logged in the `system.query_log` where they appear as `query_kind = 'AsyncInsertFlush'` [#51160](https://github.com/ClickHouse/ClickHouse/pull/51160)


## Versions

- **23.8** is a good version to start using async inserts because of the improvements and bugfixes. 
- **24.3** the new adaptative timeout mechanism has been added so clickhouse will throttle the inserts based on the server load.

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