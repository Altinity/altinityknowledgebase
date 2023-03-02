---
title: "ReplacingMergeTree"
linkTitle: "ReplacingMergeTree"
description: >
    ReplacingMergeTree
---
ReplacingMergeTree is a powerful ClickHouse MergeTree engine. It is one of the techniques that can be used to guarantee unicity or exactly once delivery in ClickHouse.

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

* CREATE -- ```insert into t values(..)```
* READ -- ```select from t final```
* UPDATE -- ```insert into t(..., _version) values (...)```, insert with incremented version
* DELETE -- ```insert into t(..., _version, is_deleted) values(..., 1)```

### FINAL

```FINAL``` keyword applies merge in a query time. It works reaonable fast when PK filter is used, but maybe slow for ```SELECT *``` type of queries:

See those links for reference:
* [FINAL clause speed](../../../altinity-kb-queries-and-syntax/altinity-kb-final-clause-speed/)
* [Handling Real-Time Updates in ClickHouse](https://altinity.com/blog/2020/4/14/handling-real-time-updates-in-clickhouse)

**Since 23.2, profile level ```final=1``` can force final automatically, see https://github.com/ClickHouse/ClickHouse/pull/40945**

Clickhouse merge parts only in scope of single partition, so if two rows with the same replacing key would land in different partitions, they would **never** be merged in single row. FINAL keyword works in other way, it merge all rows across all partitions. But that behavior can be changed via`do_not_merge_across_partitions_select_final` setting.

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
* Lightwieght delete: ```DELETE FROM t WHERE ...``` -- experimental

## Use cases

### Last state

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
│ 50000000 │
└──────────┘
```

#### Single key

```sql
-- GROUP BY
SELECT key, argMax(val_1, ts) as val_1, argMax(val_2, ts) as val_2, argMax(val_3, ts) as val_3, argMax(val_4, ts) as val_4, argMax(val_5, ts) as val_5, max(ts) FROM repl_tbl WHERE key = 10 GROUP BY key;
1 rows in set. Elapsed: 0.017 sec. Processed 40.96 thousand rows, 5.24 MB (2.44 million rows/s., 312.31 MB/s.)

-- ORDER BY LIMIT BY
SELECT * FROM repl_tbl WHERE key = 10 ORDER BY ts DESC LIMIT 1 BY key ;
1 rows in set. Elapsed: 0.017 sec. Processed 40.96 thousand rows, 5.24 MB (2.39 million rows/s., 305.41 MB/s.)

-- Subquery
SELECT * FROM repl_tbl WHERE key = 10 AND ts = (SELECT max(ts) FROM repl_tbl WHERE key = 10);
1 rows in set. Elapsed: 0.019 sec. Processed 40.96 thousand rows, 1.18 MB (2.20 million rows/s., 63.47 MB/s.)

-- FINAL
SELECT * FROM repl_tbl FINAL WHERE key = 10;
1 rows in set. Elapsed: 0.021 sec. Processed 40.96 thousand rows, 5.24 MB (1.93 million rows/s., 247.63 MB/s.)
```

#### Multiple keys

```sql
-- GROUP BY
SELECT key, argMax(val_1, ts) as val_1, argMax(val_2, ts) as val_2, argMax(val_3, ts) as val_3, argMax(val_4, ts) as val_4, argMax(val_5, ts) as val_5, max(ts) FROM repl_tbl WHERE key IN (SELECT toUInt32(number) FROM numbers(1000000) WHERE number % 100) GROUP BY key FORMAT Null;
Peak memory usage (for query): 2.31 GiB.
0 rows in set. Elapsed: 3.264 sec. Processed 5.04 million rows, 645.01 MB (1.54 million rows/s., 197.60 MB/s.)

-- set optimize_aggregation_in_order=1;
Peak memory usage (for query): 1.11 GiB.
0 rows in set. Elapsed: 1.772 sec. Processed 2.74 million rows, 350.30 MB (1.54 million rows/s., 197.73 MB/s.)

-- ORDER BY LIMIT BY
SELECT * FROM repl_tbl WHERE key IN (SELECT toUInt32(number)　FROM numbers(1000000) WHERE number % 100) ORDER BY ts DESC LIMIT 1 BY key FORMAT Null;
Peak memory usage (for query): 1.08 GiB.
0 rows in set. Elapsed: 2.429 sec. Processed 5.04 million rows, 645.01 MB (2.07 million rows/s., 265.58 MB/s.)

-- Subquery
SELECT * FROM repl_tbl WHERE (key, ts) IN (SELECT key, max(ts) FROM repl_tbl WHERE key IN (SELECT toUInt32(number) FROM numbers(1000000) WHERE number % 100) GROUP BY key) FORMAT Null;
Peak memory usage (for query): 432.57 MiB.
0 rows in set. Elapsed: 0.939 sec. Processed 5.04 million rows, 160.33 MB (5.36 million rows/s., 170.69 MB/s.)

-- set optimize_aggregation_in_order=1;
Peak memory usage (for query): 202.88 MiB.
0 rows in set. Elapsed: 0.824 sec. Processed 5.04 million rows, 160.33 MB (6.11 million rows/s., 194.58 MB/s.)

-- FINAL
SELECT * FROM repl_tbl FINAL WHERE key IN (SELECT toUInt32(number) FROM numbers(1000000) WHERE number % 100) FORMAT Null;
Peak memory usage (for query): 198.32 MiB.
0 rows in set. Elapsed: 1.211 sec. Processed 5.04 million rows, 645.01 MB (4.16 million rows/s., 532.57 MB/s.)
```

#### Full table

```sql
-- GROUP BY
SELECT key, argMax(val_1, ts) as val_1, argMax(val_2, ts) as val_2, argMax(val_3, ts) as val_3, argMax(val_4, ts) as val_4, argMax(val_5, ts) as val_5, max(ts) FROM repl_tbl GROUP BY key FORMAT Null;
Peak memory usage (for query): 15.02 GiB.
0 rows in set. Elapsed: 19.164 sec. Processed 50.00 million rows, 6.40 GB (2.61 million rows/s., 334.02 MB/s.)

-- set optimize_aggregation_in_order=1;
Peak memory usage (for query): 4.44 GiB.
0 rows in set. Elapsed: 9.700 sec. Processed 21.03 million rows, 2.69 GB (2.17 million rows/s., 277.50 MB/s.)

-- ORDER BY LIMIT BY
SELECT * FROM repl_tbl ORDER BY ts DESC LIMIT 1 BY key FORMAT Null;
Peak memory usage (for query): 10.46 GiB.
0 rows in set. Elapsed: 21.264 sec. Processed 50.00 million rows, 6.40 GB (2.35 million rows/s., 301.03 MB/s.)

-- Subquery
SELECT * FROM repl_tbl WHERE (key, ts) IN (SELECT key, max(ts) FROM repl_tbl GROUP BY key) FORMAT Null;
Peak memory usage (for query): 2.52 GiB.
0 rows in set. Elapsed: 6.891 sec. Processed 50.00 million rows, 1.60 GB (7.26 million rows/s., 232.22 MB/s.)

-- set optimize_aggregation_in_order=1;
Peak memory usage (for query): 1.05 GiB.
0 rows in set. Elapsed: 4.427 sec. Processed 50.00 million rows, 1.60 GB (11.29 million rows/s., 361.49 MB/s.)

-- FINAL
SELECT * FROM repl_tbl FINAL FORMAT Null;
Peak memory usage (for query): 838.75 MiB.
0 rows in set. Elapsed: 6.681 sec. Processed 50.00 million rows, 6.40 GB (7.48 million rows/s., 958.18 MB/s.)
```

