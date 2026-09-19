---
title: "Reading ProfileEvents in system.query_log"
linkTitle: "ProfileEvents"
weight: 100
description: >-
    What ProfileEvents are, how to read them by ValueType, and a worked example of diagnosing a slow S3 read and fixing it with the filesystem cache.
keywords:
  - clickhouse profileevents
  - clickhouse query_log
  - clickhouse query performance
---

A `ProfileEvents` column shows up in several system tables — `query_log`, `query_thread_log`, `part_log`, and others. This page looks at it in [`system.query_log`](https://clickhouse.com/docs/en/operations/system-tables/query_log), which stores metadata and statistics about executed queries — start time, duration, error messages, resource usage, and other execution details. Its `ProfileEvents` column is where the per-query counters live, and it is the first place to look when a query is slower than expected.

## system.query_log

Before reaching for `ProfileEvents`, the most basic columns — `query_duration_ms`, `read_rows`, and `read_bytes` — are often enough on their own to spot queries where filtering isn't working well: a query that reads far more rows than it returns is the classic sign. Grouping by `normalized_query_hash`, `initial_user`, or `tables` is a common way to find the offenders.

The log records two kinds of queries:

1. **Initial queries** — run directly by the client.
2. **Child queries** — initiated by other queries (for example, on distributed execution). For a child query, information about its parent is in the `initial_*` columns.

For a distributed query, selecting from `clusterAllReplicas(..., system.query_log)` filtered on a single `initial_query_id` and ordered by `query_start_time_ms` shows every subquery the original triggered, across all replicas — often very valuable for seeing what actually ran where.

Each query creates one or two rows depending on how it ended:

1. If the query succeeded, two rows are created, with types `QueryStart` and `QueryFinish`.
2. If an error occurred *during* processing, two rows are created, with types `QueryStart` and `ExceptionWhileProcessing`.
3. If an error occurred *before* the query was launched, a single row with type `ExceptionBeforeStart` is created.

## ProfileEvents

`ProfileEvents` is populated only on `QueryFinish` rows. It holds per-query counters that the server increments as it executes the query. Each counter is either a **count** (things that happened) or an **accumulator** (time spent, or bytes moved).

[`system.events`](https://clickhouse.com/docs/en/operations/system-tables/events) lists every counter along with its description.

### ValueType

Every counter has a `ValueType`. There are five:

```
┌──────────────┬───────┬───────────────────────────────────────┐
│  ValueType   │ Count │                Meaning                │
├──────────────┼───────┼───────────────────────────────────────┤
│ Number       │ 937   │ plain counters (things that happened) │
│ Microseconds │ 268   │ time accumulators                     │
│ Milliseconds │ 35    │ time accumulators                     │
│ Bytes        │ 110   │ data volumes                          │
│ Nanoseconds  │ 4     │ time accumulators                     │
└──────────────┴───────┴───────────────────────────────────────┘
```

> The counts above are from ClickHouse 25.x–26.x and grow across versions. The authoritative list, with the `ValueType` of each event, is in [`src/Common/ProfileEvents.cpp`](https://github.com/ClickHouse/ClickHouse/blob/master/src/Common/ProfileEvents.cpp) in the ClickHouse source.

Reading by `ValueType` is the trick that keeps the analysis honest: a `Bytes` counter tells you *how much data* moved, a `Microseconds` counter tells you *where the time went*, and you compare like with like. The most important accumulator is:

- **`RealTimeMicroseconds`** — total wall-clock time spent in processing threads. It is a **sum across threads**, so it can be much larger than the query's actual duration; every other `Microseconds` counter is a slice of it. Napkin math: divide it by the query's wall-clock duration (`query_duration_ms`) to get roughly how many cores were busy — e.g. 68 s of `RealTime` over a 9 s query means about 7 cores were working in parallel.

## Debugging queries with ProfileEvents

First, get the per-query summed counters across the cluster:

```sql
SELECT
    argMax(query, is_initial_query)  AS query,
    sumMap(ProfileEvents)            AS pe
FROM clusterAllReplicas('CLUSTER_NAME', system.query_log)
WHERE event_time BETWEEN '2026-07-16 09:30:00' AND '2026-07-16 10:30:00'
  AND type = 'QueryFinish'
GROUP BY initial_query_id
FORMAT PrettyCompact;
```

Grouping by `initial_query_id` folds each query's child rows back together, so `sumMap(ProfileEvents)` gives you the per-query cumulative counters across all replicas.

### Worked example: diagnosing a slow S3 read

Take a simple aggregation over an Iceberg table backed by S3:

```sql
SELECT count(*) AS c
FROM ice.`ns.events`
WHERE ns_tenant_id = 17175
  AND timestamp >= '2025-02-05 00:00:00' AND timestamp < '2025-02-13 00:00:00'
FORMAT Native;
```

Its summed `ProfileEvents`, sorted descending:

**Bytes**

```json
{
  "SelectedBytes": 6453034043,
  "ReadBufferFromS3Bytes": 707763327,
  "IOBufferAllocBytes": 2111320
}
```

- Selected → 6 GB
- Read buffer from S3 → 700 MB (~11%)

The reads are coming from S3, not from local storage — which generally carries higher latency.

**Time**

```json
{
  "RealTimeMicroseconds": 68522726,
  "ReadBufferFromS3Microseconds": 20766862,
  "ParquetFetchWaitTimeMicroseconds": 17608767,
  "S3ReadMicroseconds": 14672021,
  "ReadBufferFromS3InitMicroseconds": 13811413
}
```

- Total wall → 68 s
- S3 read time → 20 s
- Wait for Parquet reads from decoding threads → 17 s
- Time in GET and HEAD requests to S3 → 14 s
- Time spent initializing the connection to S3 → 13 s

Most of the time is spent fetching data from S3 and parsing Parquet. The usual latency hierarchy holds — in-memory > on-disk > network I/O — so the obvious lever is to keep the data closer by enabling the filesystem cache with `filesystem_cache_name=s3_disk_cache`.

### After enabling the filesystem cache

Running the same query again:

**Bytes**

```json
{
  "SelectedBytes": 6453034043,
  "ReadBufferFromFileDescriptorReadBytes": 705258980,
  "CachedReadBufferReadFromCacheBytes": 705258980,
  "IOBufferAllocBytes": 92563600,
  "ReadBufferFromS3Bytes": 13979
}
```

- Selected → 6 GB — **unchanged**: the cache changes *where* bytes are read from, not how many are selected
- Read buffer from file descriptor (filesystem) → 705 MB
- Cached read buffer → 705 MB
- Read buffer from S3 → **14 KB** (was 700 MB)

The `SelectedBytes` figure is identical to the uncached run — as it must be, since the query reads the same columns either way. What changed is the *source*: the 700 MB that came from S3 (`ReadBufferFromS3Bytes`) now comes from the local filesystem cache (`CachedReadBufferReadFromCacheBytes`), and the S3 read collapses to 14 KB (a little residual metadata).

**Time**

```json
{
  "RealTimeMicroseconds": 9385304,
  "OSCPUVirtualTimeMicroseconds": 2726569,
  "UserTimeMicroseconds": 2604127,
  "S3HeadObjectMicroseconds": 1022111,
  "S3ReadMicroseconds": 1013884,
  "OSCPUWaitMicroseconds": 925966,
  "DiskReadElapsedMicroseconds": 65235,
  "ParquetFetchWaitTimeMicroseconds": 61501
}
```

- Total wall → 9.4 s (was 68 s)
- CPU time as seen by the OS (`OSCPUVirtualTimeMicroseconds`) → ~2.7 s
- Time in HEAD/GET requests to S3 (residual metadata only) → ~1 s
- Time a thread was ready to run but waiting for a core (`OSCPUWaitMicroseconds`) → ~0.9 s
- Disk read from the cache → 65 ms
- Wait for Parquet reads from decoding threads → 62 ms

The S3 costs that dominated the uncached run — read (20 s), GET/HEAD (14 s), connection init (13 s) — are gone; only ~1 s of residual metadata HEAD/GET requests still touches S3. Reads now come from the local cache (`DiskReadElapsedMicroseconds` of 65 ms, versus 20 s of S3 read time before), and total wall-clock dropped from **68 s to 9.4 s**. The remaining cost is CPU and cache-disk reads — the bottleneck has moved off the network entirely.

A couple of these counters are easy to misread:

- **`OSCPUWaitMicroseconds`** — time threads were ready to run but waiting for a free core. A significant share of `OSCPUVirtualTimeMicroseconds` is a sign of **CPU starvation** (too many concurrent queries for the cores available). The matching `OSIOWaitMicroseconds` plays the same role for **I/O starvation**.
- **`NetworkReceiveElapsedMicroseconds` / `NetworkSendElapsedMicroseconds`** — these measure how long one node waited for another to respond to a subquery, *not* time lost to a slow network. A large value usually means the other node was busy computing, not that the link is the problem.

## Summary

ProfileEvents are how you replace guesswork with a specific answer to "where did the time go." Keep the `Bytes`, `Microseconds`, and `Number` counters separate — they answer different questions — and read the time counters against `RealTimeMicroseconds`, since each one is a slice of it. What you're really after is ratios: bytes read from S3 versus from cache, CPU time versus wall time. In the example above the counters pointed squarely at S3, and enabling the filesystem cache was enough to fix it.

## Other resources

- [system.query_log](https://clickhouse.com/docs/en/operations/system-tables/query_log) — column reference
- [system.events](https://clickhouse.com/docs/en/operations/system-tables/events) — counter names and descriptions
- [ProfileEvents.cpp](https://github.com/ClickHouse/ClickHouse/blob/master/src/Common/ProfileEvents.cpp) — the authoritative list of every event and its `ValueType`
- [Handy queries for system.query_log](https://kb.altinity.com/altinity-kb-useful-queries/query_log/) — ready-made analysis queries
- [Compare query_log for 2 intervals](https://kb.altinity.com/altinity-kb-useful-queries/compare_query_log_for_2_intervals/) — the before/after (A/B) technique used above
- [Using local cache](https://clickhouse.com/docs/en/operations/storing-data#using-local-cache) — configuring the filesystem cache
- [Monitoring and troubleshooting SELECT queries](https://clickhouse.com/blog/monitoring-troubleshooting-select-queries-clickhouse)
