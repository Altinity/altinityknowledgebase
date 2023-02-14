---
title: "Async INSERTs"
linkTitle: "Async INSERTs"
description: >
    Async INSERTs
---

Async INSERTs is a ClickHouse feature tha enables batching data automatically and transparently on the server-side. Although async inserts work, they still have issues, but have been improved in latest versions. We recommend to batch at app/ingestor level because you will have more control and you decouple this responsibility from ClickHouse. Being said that here some insights about Async inserts you should now:

* Async inserts give acknowledgment immediately after the data got inserted into the buffer (wait_for_async_insert = 0) or by default, after the data got written to a part after flushing from buffer (wait_for_async_insert = 1).
* INSERT .. SELECT is NOT async insert.
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
* Support async inserts in clickhouse-client for queries with inlined data. See [#34267](https://github.com/ClickHouse/ClickHouse/pull/34267).
  

## To improve observability / introspection

It is not possible to relate `part_log/query_id` column with `asynchronous_insert_log/query_id` column. We need to use `query_log/query_id`:

`asynchronous_insert_log` shows up the `query_id` and `flush_query_id` of each async insert. The `query_id` from async insert shows up in the `system.query_log` as `type = 'QueryStart'` but the same `query_id` does not show up in the `query_id` column of the `system.part_log`. Because the `query_id` column in the `part_log` is the identifier of the INSERT query that created a data part, and it seems it is for sync INSERTS but not for async inserts.

## Metrics

```sql
SELECT *
FROM system.metrics
WHERE metric LIKE '%AsyncInsert%'

Query id: 7384b8c8-3d87-4059-b1c4-e9955e97232b

┌─metric───────────────┬─value─┬─description────────────────────────────────────────────────┐
│ PendingAsyncInsert   │     0 │ Number of asynchronous inserts that are waiting for flush. │
│ AsyncInsertCacheSize │     0 │ Number of async insert hash id in cache                    │
└──────────────────────┴───────┴────────────────────────────────────────────────────────────┘

2 rows in set. Elapsed: 0.001 sec.
```
