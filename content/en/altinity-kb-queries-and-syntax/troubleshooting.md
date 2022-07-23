---
title: "Troubleshooting"
linkTitle: "Troubleshooting"
description: >
    Troubleshooting
---
## Log of query execution

Controlled by session level setting `send_logs_level`
Possible values: `'trace', 'debug', 'information', 'warning', 'error', 'fatal', 'none'`
Can be used with clickhouse-client in both interactive and non-interactive mode.

```bash
$ clickhouse-client -mn --send_logs_level='trace' --query "SELECT sum(number) FROM numbers(1000)"
[LAPTOP] 2021.04.29 00:05:31.425842 [ 25316 ] {14b0646d-8a6e-4b2f-9b13-52a218cf43ba} <Debug> executeQuery: (from 127.0.0.1:42590, using production parser) SELECT sum(number) FROM numbers(1000)
[LAPTOP] 2021.04.29 00:05:31.426281 [ 25316 ] {14b0646d-8a6e-4b2f-9b13-52a218cf43ba} <Trace> ContextAccess (default): Access granted: CREATE TEMPORARY TABLE ON *.*
[LAPTOP] 2021.04.29 00:05:31.426648 [ 25316 ] {14b0646d-8a6e-4b2f-9b13-52a218cf43ba} <Trace> InterpreterSelectQuery: FetchColumns -> Complete
[LAPTOP] 2021.04.29 00:05:31.427132 [ 25448 ] {14b0646d-8a6e-4b2f-9b13-52a218cf43ba} <Trace> AggregatingTransform: Aggregating
[LAPTOP] 2021.04.29 00:05:31.427187 [ 25448 ] {14b0646d-8a6e-4b2f-9b13-52a218cf43ba} <Trace> Aggregator: Aggregation method: without_key
[LAPTOP] 2021.04.29 00:05:31.427220 [ 25448 ] {14b0646d-8a6e-4b2f-9b13-52a218cf43ba} <Debug> AggregatingTransform: Aggregated. 1000 to 1 rows (from 7.81 KiB) in 0.0004469 sec. (2237637.0552696353 rows/sec., 17.07 MiB/sec.)
[LAPTOP] 2021.04.29 00:05:31.427233 [ 25448 ] {14b0646d-8a6e-4b2f-9b13-52a218cf43ba} <Trace> Aggregator: Merging aggregated data
[LAPTOP] 2021.04.29 00:05:31.427875 [ 25316 ] {14b0646d-8a6e-4b2f-9b13-52a218cf43ba} <Information> executeQuery: Read 1000 rows, 7.81 KiB in 0.0019463 sec., 513795 rows/sec., 3.92 MiB/sec.
[LAPTOP] 2021.04.29 00:05:31.427898 [ 25316 ] {14b0646d-8a6e-4b2f-9b13-52a218cf43ba} <Debug> MemoryTracker: Peak memory usage (for query): 0.00 B.
499500

$ clickhouse-client -mn --send_logs_level='trace' --query "SELECT sum(number) FROM numbers(1000)" 2> ./query.log
```

```sql
LAPTOP.localdomain :) SET send_logs_level='trace';

SET send_logs_level = 'trace'

Query id: cbbffc02-283e-48ef-93e2-8b3baced6689

Ok.

0 rows in set. Elapsed: 0.003 sec.

LAPTOP.localdomain :) SELECT sum(number) FROM numbers(1000);

SELECT sum(number)
FROM numbers(1000)

Query id: d3db767b-34e9-4252-9f90-348cf958f822

[LAPTOP] 2021.04.29 00:06:51.673836 [ 25316 ] {d3db767b-34e9-4252-9f90-348cf958f822} <Debug> executeQuery: (from 127.0.0.1:43116, using production parser) SELECT sum(number) FROM numbers(1000);
[LAPTOP] 2021.04.29 00:06:51.674167 [ 25316 ] {d3db767b-34e9-4252-9f90-348cf958f822} <Trace> ContextAccess (default): Access granted: CREATE TEMPORARY TABLE ON *.*
[LAPTOP] 2021.04.29 00:06:51.674419 [ 25316 ] {d3db767b-34e9-4252-9f90-348cf958f822} <Trace> InterpreterSelectQuery: FetchColumns -> Complete
[LAPTOP] 2021.04.29 00:06:51.674748 [ 25449 ] {d3db767b-34e9-4252-9f90-348cf958f822} <Trace> AggregatingTransform: Aggregating
[LAPTOP] 2021.04.29 00:06:51.674781 [ 25449 ] {d3db767b-34e9-4252-9f90-348cf958f822} <Trace> Aggregator: Aggregation method: without_key
[LAPTOP] 2021.04.29 00:06:51.674855 [ 25449 ] {d3db767b-34e9-4252-9f90-348cf958f822} <Debug> AggregatingTransform: Aggregated. 1000 to 1 rows (from 7.81 KiB) in 0.0003299 sec. (3031221.582297666 rows/sec., 23.13 MiB/sec.)
[LAPTOP] 2021.04.29 00:06:51.674883 [ 25449 ] {d3db767b-34e9-4252-9f90-348cf958f822} <Trace> Aggregator: Merging aggregated data
┌─sum(number)─┐
│      499500 │
└─────────────┘
[LAPTOP] 2021.04.29 00:06:51.675481 [ 25316 ] {d3db767b-34e9-4252-9f90-348cf958f822} <Information> executeQuery: Read 1000 rows, 7.81 KiB in 0.0015799 sec., 632951 rows/sec., 4.83 MiB/sec.
[LAPTOP] 2021.04.29 00:06:51.675508 [ 25316 ] {d3db767b-34e9-4252-9f90-348cf958f822} <Debug> MemoryTracker: Peak memory usage (for query): 0.00 B.

1 rows in set. Elapsed: 0.007 sec. Processed 1.00 thousand rows, 8.00 KB (136.43 thousand rows/s., 1.09 MB/s.)
```

## system tables

```sql
SELECT sum(number)
FROM numbers(1000);

Query id: 34c61093-3303-47d0-860b-0d644fa7264b

┌─sum(number)─┐
│      499500 │
└─────────────┘

1 row in set. Elapsed: 0.002 sec. Processed 1.00 thousand rows, 8.00 KB (461.45 thousand rows/s., 3.69 MB/s.)

SELECT *
FROM system.query_log
WHERE (event_date = today()) AND (query_id = '34c61093-3303-47d0-860b-0d644fa7264b');

If query_thread_log enabled (SET log_query_threads = 1)

SELECT *
FROM system.query_thread_log
WHERE (event_date = today()) AND (query_id = '34c61093-3303-47d0-860b-0d644fa7264b');

If opentelemetry_span_log enabled (SET opentelemetry_start_trace_probability = 1, opentelemetry_trace_processors = 1) 

SELECT *
FROM system.opentelemetry_span_log
WHERE (trace_id, finish_date) IN (
    SELECT
        trace_id,
        finish_date
    FROM system.opentelemetry_span_log
    WHERE ((attribute['clickhouse.query_id']) = '34c61093-3303-47d0-860b-0d644fa7264b') AND (finish_date = today())
);
```



## Flamegraph

[https://www.speedscope.app/](https://www.speedscope.app/)

```sql
WITH
    '95578e1c-1e93-463c-916c-a1a8cdd08198' AS query,
    min(min) AS start_value,
    max(max) AS end_value,
    groupUniqArrayArrayArray(trace_arr) AS uniq_frames,
    arrayMap((x, a, b) -> ('sampled', b, 'none', start_value, end_value, arrayMap(s -> reverse(arrayMap(y -> toUInt32(indexOf(uniq_frames, y) - 1), s)), x), a), groupArray(trace_arr), groupArray(weights), groupArray(trace_type)) AS samples
SELECT
    concat('clickhouse-server@', version()) AS exporter,
    'https://www.speedscope.app/file-format-schema.json' AS `$schema`,
    concat('Clickhouse query id: ', query) AS name,
    CAST(samples, 'Array(Tuple(type String, name String, unit String, startValue UInt64, endValue UInt64, samples Array(Array(UInt32)), weights Array(UInt32)))') AS profiles,
    CAST(tuple(arrayMap(x -> (demangle(addressToSymbol(x)), addressToLine(x)), uniq_frames)), 'Tuple(frames Array(Tuple(name String, line String)))') AS shared
FROM
(
    SELECT
        min(min_ns) AS min,
        trace_type,
        max(max_ns) AS max,
        groupArray(trace) AS trace_arr,
        groupArray(cnt) AS weights
    FROM
    (
        SELECT
            min(timestamp_ns) AS min_ns,
            max(timestamp_ns) AS max_ns,
            trace,
            trace_type,
            count() AS cnt
        FROM system.trace_log
        WHERE query_id = query
        GROUP BY
            trace_type,
            trace
    )
    GROUP BY trace_type
)
SETTINGS allow_introspection_functions = 1, output_format_json_named_tuples_as_objects = 1
FORMAT JSONEachRow
SETTINGS output_format_json_named_tuples_as_objects = 1
```
