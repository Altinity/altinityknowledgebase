---
title: "ReplacingMergeTree"
linkTitle: "ReplacingMergeTree"
description: >
    ReplacingMergeTree
aliases:
  /engines/replacingmergetree
---
[ReplacingMergeTree](https://altinity.com/blog/clickhouse-replacingmergetree-explained-the-good-the-bad-and-the-ugly)
is a powerful ClickHouse® MergeTree engine. It is one of the techniques that can be used to guarantee unicity or exactly once delivery in ClickHouse.

## General Operations

### Engine Parameters

```
Engine = ReplacingMergeTree([version_column],[is_deleted_column])
ORDER BY <list_of_columns>
```

* **ORDER BY** -- The ORDER BY defines the columns that need to be unique at merge time. Since merge time can not be decided most of the time, the FINAL keyword is required to remove duplicates.
* **version_column** -- An monotonically increasing number, which can be based on a timestamp. Used for make sure sure updates are executed in a right order.
* **is_deleted_column** (23.2+ see https://github.com/ClickHouse/ClickHouse/pull/41005) -- the column used to delete rows.

### DML operations

* CREATE -- ```INSERT INTO t values(..)```
* READ -- ```SELECT FROM t final```
* UPDATE -- ```INSERT INTO t(..., _version) values (...)```, insert with incremented version
* DELETE -- ```INSERT INTO t(..., _version, is_deleted) values(..., 1)```

### FINAL

ClickHouse does not guarantee that merge will fire and replace rows using ReplacingMergeTree logic. ```FINAL``` keyword should be used in order to apply merge in a query time. It works reasonably fast when PK filter is used, but maybe slow for ```SELECT *``` type of queries:

See these links for reference:
* [FINAL clause speed](../../../altinity-kb-queries-and-syntax/altinity-kb-final-clause-speed/)
* [Handling Real-Time Updates in ClickHouse](https://altinity.com/blog/2020/4/14/handling-real-time-updates-in-clickhouse)

Since 23.2, profile level ```final=1``` can force final automatically, see https://github.com/ClickHouse/ClickHouse/pull/40945

ClickHouse merge parts only in scope of single partition, so if two rows with the same replacing key would land in different partitions, they would **never** be merged in single row. FINAL keyword works in other way, it merge all rows across all partitions. But that behavior can be changed via`do_not_merge_across_partitions_select_final` setting.

```sql
CREATE TABLE repl_tbl_part
(
    `key` UInt32,
    `value` UInt32,
    `part_key` UInt32
)
ENGINE = ReplacingMergeTree
PARTITION BY part_key
ORDER BY key;

INSERT INTO repl_tbl_part SELECT
    1 AS key,
    number AS value,
    number % 2 AS part_key
FROM numbers(4)
SETTINGS optimize_on_insert = 0;

SELECT * FROM repl_tbl_part;

┌─key─┬─value─┬─part_key─┐
│   1 │     1 │        1 │
│   1 │     3 │        1 │
└─────┴───────┴──────────┘
┌─key─┬─value─┬─part_key─┐
│   1 │     0 │        0 │
│   1 │     2 │        0 │
└─────┴───────┴──────────┘

SELECT * FROM repl_tbl_part FINAL;

┌─key─┬─value─┬─part_key─┐
│   1 │     3 │        1 │
└─────┴───────┴──────────┘

SELECT * FROM repl_tbl_part FINAL SETTINGS do_not_merge_across_partitions_select_final=1;

┌─key─┬─value─┬─part_key─┐
│   1 │     3 │        1 │
└─────┴───────┴──────────┘
┌─key─┬─value─┬─part_key─┐
│   1 │     2 │        0 │
└─────┴───────┴──────────┘

OPTIMIZE TABLE repl_tbl_part FINAL;

SELECT * FROM repl_tbl_part;

┌─key─┬─value─┬─part_key─┐
│   1 │     3 │        1 │
└─────┴───────┴──────────┘
┌─key─┬─value─┬─part_key─┐
│   1 │     2 │        0 │
└─────┴───────┴──────────┘
```

### Deleting the data

* Delete in partition: ```ALTER TABLE t DELETE WHERE ... in PARTITION 'partition'``` -- slow and asynchronous, rebuilds the partition
* Filter is_deleted in queries: ```SELECT ... WHERE is_deleted = 0```
* Before 23.2, use ROW POLICY to apply a filter automatically: ``` CREATE ROW POLICY delete_masking on t using is_deleted = 0 for ALL;```
* 23.2+ ```ReplacingMergeTree(version, is_deleted) ORDER BY .. SETTINGS clean_deleted_rows='Always'``` (see  https://github.com/ClickHouse/ClickHouse/pull/41005)

Other options:
* Partition operations: ```ALTER TABLE t DROP PARTITION 'partition'``` -- locks the table, drops full partition only
* Lightweight delete: ```DELETE FROM t WHERE ...``` -- experimental

## Use cases

### Last state

Tested on ClickHouse 23.6 version
FINAL is good in all cases

```sql
CREATE TABLE repl_tbl
(
    `key` UInt32,
    `val_1` UInt32,
    `val_2` String,
    `val_3` String,
    `val_4` String,
    `val_5` UUID,
    `ts` DateTime
)
ENGINE = ReplacingMergeTree(ts)
ORDER BY key

SYSTEM STOP MERGES repl_tbl;

INSERT INTO repl_tbl SELECT number as key, rand() as val_1, randomStringUTF8(10) as val_2, randomStringUTF8(5) as val_3, randomStringUTF8(4) as val_4, generateUUIDv4() as val_5, now() as ts FROM numbers(10000000);
INSERT INTO repl_tbl SELECT number as key, rand() as val_1, randomStringUTF8(10) as val_2, randomStringUTF8(5) as val_3, randomStringUTF8(4) as val_4, generateUUIDv4() as val_5, now() as ts FROM numbers(10000000);
INSERT INTO repl_tbl SELECT number as key, rand() as val_1, randomStringUTF8(10) as val_2, randomStringUTF8(5) as val_3, randomStringUTF8(4) as val_4, generateUUIDv4() as val_5, now() as ts FROM numbers(10000000);
INSERT INTO repl_tbl SELECT number as key, rand() as val_1, randomStringUTF8(10) as val_2, randomStringUTF8(5) as val_3, randomStringUTF8(4) as val_4, generateUUIDv4() as val_5, now() as ts FROM numbers(10000000);

SELECT count() FROM repl_tbl

┌──count()─┐
│ 40000000 │
└──────────┘
```

#### Single key

```sql
-- GROUP BY
SELECT key, argMax(val_1, ts) as val_1, argMax(val_2, ts) as val_2, argMax(val_3, ts) as val_3, argMax(val_4, ts) as val_4, argMax(val_5, ts) as val_5, max(ts) FROM repl_tbl WHERE key = 10 GROUP BY key;
1 row in set. Elapsed: 0.008 sec.

-- ORDER BY LIMIT BY
SELECT * FROM repl_tbl WHERE key = 10 ORDER BY ts DESC LIMIT 1 BY key ;
1 row in set. Elapsed: 0.006 sec.

-- Subquery
SELECT * FROM repl_tbl WHERE key = 10 AND ts = (SELECT max(ts) FROM repl_tbl WHERE key = 10);
1 row in set. Elapsed: 0.009 sec.

-- FINAL
SELECT * FROM repl_tbl FINAL WHERE key = 10;
1 row in set. Elapsed: 0.008 sec.
```

#### Multiple keys

```sql
-- GROUP BY
SELECT key, argMax(val_1, ts) as val_1, argMax(val_2, ts) as val_2, argMax(val_3, ts) as val_3, argMax(val_4, ts) as val_4, argMax(val_5, ts) as val_5, max(ts) FROM repl_tbl WHERE key IN (SELECT toUInt32(number) FROM numbers(1000000) WHERE number % 100) GROUP BY key FORMAT Null;
Peak memory usage (for query): 2.19 GiB.
0 rows in set. Elapsed: 1.043 sec. Processed 5.08 million rows, 524.38 MB (4.87 million rows/s., 502.64 MB/s.)

-- SET optimize_aggregation_in_order=1;
Peak memory usage (for query): 349.94 MiB.
0 rows in set. Elapsed: 0.901 sec. Processed 4.94 million rows, 506.55 MB (5.48 million rows/s., 562.17 MB/s.)

-- ORDER BY LIMIT BY
SELECT * FROM repl_tbl WHERE key IN (SELECT toUInt32(number)　FROM numbers(1000000) WHERE number % 100) ORDER BY ts DESC LIMIT 1 BY key FORMAT Null;
Peak memory usage (for query): 1.12 GiB.
0 rows in set. Elapsed: 1.171 sec. Processed 5.08 million rows, 524.38 MB (4.34 million rows/s., 447.95 MB/s.)

-- Subquery
SELECT * FROM repl_tbl WHERE (key, ts) IN (SELECT key, max(ts) FROM repl_tbl WHERE key IN (SELECT toUInt32(number) FROM numbers(1000000) WHERE number % 100) GROUP BY key) FORMAT Null;
Peak memory usage (for query): 197.30 MiB.
0 rows in set. Elapsed: 0.484 sec. Processed 8.72 million rows, 507.33 MB (18.04 million rows/s., 1.05 GB/s.)

-- SET optimize_aggregation_in_order=1;
Peak memory usage (for query): 171.93 MiB.
0 rows in set. Elapsed: 0.465 sec. Processed 8.59 million rows, 490.55 MB (18.46 million rows/s., 1.05 GB/s.)

-- FINAL
SELECT * FROM repl_tbl FINAL WHERE key IN (SELECT toUInt32(number) FROM numbers(1000000) WHERE number % 100) FORMAT Null;
Peak memory usage (for query): 537.13 MiB.
0 rows in set. Elapsed: 0.357 sec. Processed 4.39 million rows, 436.28 MB (12.28 million rows/s., 1.22 GB/s.)
```

#### Full table

```sql
-- GROUP BY
SELECT key, argMax(val_1, ts) as val_1, argMax(val_2, ts) as val_2, argMax(val_3, ts) as val_3, argMax(val_4, ts) as val_4, argMax(val_5, ts) as val_5, max(ts) FROM repl_tbl GROUP BY key FORMAT Null;
Peak memory usage (for query): 16.08 GiB.
0 rows in set. Elapsed: 11.600 sec. Processed 40.00 million rows, 5.12 GB (3.45 million rows/s., 441.49 MB/s.)

-- SET optimize_aggregation_in_order=1;
Peak memory usage (for query): 865.76 MiB.
0 rows in set. Elapsed: 9.677 sec. Processed 39.82 million rows, 5.10 GB (4.12 million rows/s., 526.89 MB/s.)

-- ORDER BY LIMIT BY
SELECT * FROM repl_tbl ORDER BY ts DESC LIMIT 1 BY key FORMAT Null;
Peak memory usage (for query): 8.39 GiB.
0 rows in set. Elapsed: 14.489 sec. Processed 40.00 million rows, 5.12 GB (2.76 million rows/s., 353.45 MB/s.)

-- Subquery
SELECT * FROM repl_tbl WHERE (key, ts) IN (SELECT key, max(ts) FROM repl_tbl GROUP BY key) FORMAT Null;
Peak memory usage (for query): 2.40 GiB.
0 rows in set. Elapsed: 5.225 sec. Processed 79.65 million rows, 5.40 GB (15.24 million rows/s., 1.03 GB/s.)

-- SET optimize_aggregation_in_order=1;
Peak memory usage (for query): 924.39 MiB.
0 rows in set. Elapsed: 4.126 sec. Processed 79.67 million rows, 5.40 GB (19.31 million rows/s., 1.31 GB/s.)

-- FINAL
SELECT * FROM repl_tbl FINAL FORMAT Null;
Peak memory usage (for query): 834.09 MiB.
0 rows in set. Elapsed: 2.314 sec. Processed 38.80 million rows, 4.97 GB (16.77 million rows/s., 2.15 GB/s.)
```

