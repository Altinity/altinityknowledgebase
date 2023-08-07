---
title: "Async INSERTs"
linkTitle: "Async INSERTs"
description: >
    Async INSERTs
---

Async INSERTs is a ClickHouse feature tha enables batching data automatically and transparently on the server-side. Although async inserts work, they still have issues, but have been improved in latest versions. We recommend to batch at app/ingestor level because you will have more control and you decouple this responsibility from ClickHouse. Being said that here some insights about Async inserts you should now:

* Async inserts give acknowledgment immediately after the data got inserted into the buffer (wait_for_async_insert = 0) or by default, after the data got written to a part after flushing from buffer (wait_for_async_insert = 1).
* INSERT .. SELECT is NOT async insert. (You can use matView + Null table OR ephemeral columns instead of INPUT function, then ASYNC insert work)
* Async inserts will do (idempotent) retries.
* Async inserts can collect data for some offline remote clusters: Yandex self-driving cars were collecting the metrics data during the ride into ClickHouse installed on the car computer to a distributed table with Async inserts enabled, which were flushed to the cluster once the car was plugged to the network.
* Async inserts can do batching, so multiple inserts can be squashed as a single insert (but in that case, retries are not idempotent anymore).
* Async inserts can loose your data in case of sudden restart (no fsyncs by default).
* Async inserted data becomes available for selects not immediately after acknowledgment.
* Async inserts generally have more `moving parts` there are some background threads monitoring new data to be sent and pushing it out.
* Async inserts require extra monitoring from different system.tables (see `system.part_log`, `system.query_log` and `system.asynchronous_inserts` for 22.8). Previously such queries didn't appear in the query log. Check: [#33239](https://github.com/ClickHouse/ClickHouse/pull/33239).
* Important to use `wait_for_async_insert = 1` because with any error you will loose data without knowing it. For example your table is read only -> losing data,  out of disk space -> losing data, too many parts -> losing data.


## 22.10+ bugfixes/features

* Fixed bug which could lead to deadlock while using asynchronous inserts. See [#43233](https://github.com/ClickHouse/ClickHouse/pull/43233).
* Async insert dedup: Support block deduplication for asynchronous inserts. Before this change, async inserts did not support deduplication, because multiple small inserts coexisted in one inserted batch. See [#38075](https://github.com/ClickHouse/ClickHouse/issues/38075) and [#43304](https://github.com/ClickHouse/ClickHouse/pull/43304).
* Added system table `asynchronous_insert_log`. It contains information about asynchronous inserts (including results of queries in fire-and-forget mode. (with wait_for_async_insert=0)) for better introspection. See [#42040](https://github.com/ClickHouse/ClickHouse/pull/42040).
* Support async inserts in clickhouse-client for queries with inlined data (Native protocol). See [#34267](https://github.com/ClickHouse/ClickHouse/pull/34267).
* Async insert backpressure:
    - **[#47623 Back pressure for asynchronous inserts](https://github.com/ClickHouse/ClickHouse/issues/47623)**
- In order to limit the deduplication overhead when using `async_insert_deduplicate`, clickhouse writes lots of keys to keeper, and it's easy to exceed the txn limitation. So the setting `async_insert_max_query_number` is added to limit the number of async inserts in a block. This will impact on the throughput of async inserts, so this setting should not considered when duplication is disabled: `async_insert_deduplicate = 0`
    - **[#46549 enable async-insert-max-query-number only if async_insert_deduplicate](https://github.com/ClickHouse/ClickHouse/pull/46549)**
- SYSTEM FLUSH ASYNC INSERTS
    - **[#49160 Allow to flush asynchronous insert queue](https://github.com/ClickHouse/ClickHouse/pull/49160)**
- Fix crash when async inserts with deduplication are used for ReplicatedMergeTree tables using a nondefault merging algorithm
    - **[Fix async insert with deduplication for ReplicatedMergeTree using merging algorithms #51676](https://github.com/ClickHouse/ClickHouse/pull/51676)**
- Fix misbehaviour with async inserts
    - **[Correctly disable async insert with deduplication when its not needed #50663](https://github.com/ClickHouse/ClickHouse/pull/50663)**

## To improve observability / introspection

In 22.x versions, it is not possible to relate `part_log/query_id` column with `asynchronous_insert_log/query_id` column. We need to use `query_log/query_id`:

`asynchronous_insert_log` shows up the `query_id` and `flush_query_id` of each async insert. The `query_id` from `asynchronous_insert_log` shows up in the `system.query_log` as `type = 'QueryStart'` but the same `query_id` does not show up in the `query_id` column of the `system.part_log`. Because the `query_id` column in the `part_log` is the identifier of the INSERT query that created a data part, and it seems it is for sync INSERTS but not for async inserts.

So in `asynchronous_inserts` table you can check the current batch that still has not been flushed. In the `asynchronous_insert_log` you can find a log of all the async inserts executed.

But in **ClickHouse 23.7** Flush queries for async inserts (the queries that do the final push of data) are now logged in the `system.query_log` where they appear as `query_kind = 'AsyncInsertFlush'`.
- **[Log async insert flush queries into to system.query_log and system.processes #51160](https://github.com/ClickHouse/ClickHouse/pull/51160)**

## Metrics

```sql
SELECT name
FROM system.columns
WHERE (table = 'metric_log') AND (name ILIKE '%Async%')

Query id: 3d0b7cbc-7990-4498-9c18-1c988796c487

┌─name────────────────────────────────────────────────┐
│ ProfileEvent_AsyncInsertQuery                       │
│ ProfileEvent_AsyncInsertBytes                       │
│ ProfileEvent_AsyncInsertCacheHits                   │
│ ProfileEvent_FailedAsyncInsertQuery                 │
│ ProfileEvent_AsynchronousReadWaitMicroseconds       │
│ ProfileEvent_AsynchronousRemoteReadWaitMicroseconds │
│ CurrentMetric_DiskObjectStorageAsyncThreads         │
│ CurrentMetric_DiskObjectStorageAsyncThreadsActive   │
│ CurrentMetric_AsynchronousInsertThreads             │
│ CurrentMetric_AsynchronousInsertThreadsActive       │part
│ CurrentMetric_AsynchronousReadWait                  │
│ CurrentMetric_PendingAsyncInsert                    │
│ CurrentMetric_AsyncInsertCacheSize                  │
└─────────────────────────────────────────────────────┘

SELECT *
FROM system.metrics
WHERE metric ILIKE '%async%'

┌─metric──────────────────────────────┬─value─┬─description──────────────────────────────────────────────────────────────────────┐
│ AsynchronousInsertThreads           │     0 │ Number of threads in the AsynchronousInsert thread pool.                         │
│ AsynchronousInsertThreadsActive     │     0 │ Number of threads in the AsynchronousInsert thread pool running a task.          │
│ AsynchronousReadWait                │     0 │ Number of threads waiting for asynchronous read.                                 │
│ PendingAsyncInsert                  │     0 │ Number of asynchronous inserts that are waiting for flush.                       │
│ AsyncInsertCacheSize                │     0 │ Number of async insert hash id in cache                                          │
└─────────────────────────────────────┴───────┴──────────────────────────────────────────────────────────────────────────────────┘
```
