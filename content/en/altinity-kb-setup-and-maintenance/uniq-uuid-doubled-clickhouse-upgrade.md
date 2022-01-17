---
title: "AggregateFunction(uniq, UUID) doubled after ClickHouse upgrade"
linkTitle: "AggregateFunction(uniq, UUID) doubled after ClickHouse upgrade"
weight: 100
description: >-
     Page description for heading and indexes.
---

## What happened

After ClickHouse upgrade from version pre 21.6 to version after 21.6, count of unique UUID in AggregatingMergeTree tables nearly doubled in case of merging of data which was generated in different ClickHouse versions. 

## Why happened

In [pull request](https://github.com/ClickHouse/ClickHouse/pull/23631) which changed the internal representation of big integers data types (and UUID).
SipHash64 hash-function used for uniq aggregation function for UUID data type was replaced with intHash64, which leads to different result for the same UUID value across different ClickHouse versions.
Therefore, it results in doubling of counts, when uniqState created by different ClickHouse versions being merged together.

Related [issue](https://github.com/ClickHouse/ClickHouse/issues/33607).

## Solution

You need to replace any occurrence of `uniqState(uuid)` in MATERIALIZED VIEWs with `uniqState(sipHash64(uuid))` and change data type for already saved data from `AggregateFunction(uniq, UUID)` to `AggregateFunction(uniq, UInt64)`, because result data type of sipHash64 is UInt64.

```sql
-- On ClickHouse version 21.3

CREATE TABLE uniq_state
(
    `key` UInt32,
    `value` AggregateFunction(uniq, UUID)
)
ENGINE = MergeTree
ORDER BY key

INSERT INTO uniq_state SELECT
    number % 10000 AS key,
    uniqState(reinterpretAsUUID(number))
FROM numbers(1000000)
GROUP BY key

Ok.

0 rows in set. Elapsed: 0.404 sec. Processed 1.05 million rows, 8.38 MB (2.59 million rows/s., 20.74 MB/s.)

SELECT
    key % 20,
    uniqMerge(value)
FROM uniq_state
GROUP BY key % 20

┌─modulo(key, 20)─┬─uniqMerge(value)─┐
│               0 │            50000 │
│               1 │            50000 │
│               2 │            50000 │
│               3 │            50000 │
│               4 │            50000 │
│               5 │            50000 │
│               6 │            49999 │
│               7 │            50000 │
│               8 │            49999 │
│               9 │            50000 │
│              10 │            50000 │
│              11 │            50000 │
│              12 │            50000 │
│              13 │            50000 │
│              14 │            50000 │
│              15 │            50000 │
│              16 │            50000 │
│              17 │            50000 │
│              18 │            50000 │
│              19 │            50000 │
└─────────────────┴──────────────────┘


-- After upgrade of ClickHouse to 21.8

SELECT
    key % 20,
    uniqMerge(value)
FROM uniq_state
GROUP BY key % 20


┌─modulo(key, 20)─┬─uniqMerge(value)─┐
│               0 │            50000 │
│               1 │            50000 │
│               2 │            50000 │
│               3 │            50000 │
│               4 │            50000 │
│               5 │            50000 │
│               6 │            49999 │
│               7 │            50000 │
│               8 │            49999 │
│               9 │            50000 │
│              10 │            50000 │
│              11 │            50000 │
│              12 │            50000 │
│              13 │            50000 │
│              14 │            50000 │
│              15 │            50000 │
│              16 │            50000 │
│              17 │            50000 │
│              18 │            50000 │
│              19 │            50000 │
└─────────────────┴──────────────────┘

20 rows in set. Elapsed: 0.240 sec. Processed 10.00 thousand rows, 1.16 MB (41.72 thousand rows/s., 4.86 MB/s.)


CREATE TABLE uniq_state_2
ENGINE = MergeTree
ORDER BY key AS
SELECT *
FROM uniq_state

Ok.

0 rows in set. Elapsed: 0.128 sec. Processed 10.00 thousand rows, 1.16 MB (78.30 thousand rows/s., 9.12 MB/s.)


INSERT INTO uniq_state_2 SELECT
    number % 10000 AS key,
    uniqState(reinterpretAsUUID(number))
FROM numbers(1000000)
GROUP BY key

Ok.

0 rows in set. Elapsed: 0.266 sec. Processed 1.05 million rows, 8.38 MB (3.93 million rows/s., 31.48 MB/s.)


SELECT
    key % 20,
    uniqMerge(value)
FROM uniq_state_2
GROUP BY key % 20

┌─modulo(key, 20)─┬─uniqMerge(value)─┐
│               0 │            99834 │ <- Count of unique values nearly doubled.
│               1 │           100219 │
│               2 │           100128 │
│               3 │           100457 │
│               4 │           100272 │
│               5 │           100279 │
│               6 │            99372 │
│               7 │            99450 │
│               8 │            99974 │
│               9 │            99632 │
│              10 │            99562 │
│              11 │           100660 │
│              12 │           100439 │
│              13 │           100252 │
│              14 │           100650 │
│              15 │            99320 │
│              16 │           100095 │
│              17 │            99632 │
│              18 │            99540 │
│              19 │           100098 │
└─────────────────┴──────────────────┘

20 rows in set. Elapsed: 0.356 sec. Processed 20.00 thousand rows, 2.33 MB (56.18 thousand rows/s., 6.54 MB/s.)


CREATE TABLE uniq_state_3
ENGINE = MergeTree
ORDER BY key AS
SELECT *
FROM uniq_state

0 rows in set. Elapsed: 0.126 sec. Processed 10.00 thousand rows, 1.16 MB (79.33 thousand rows/s., 9.24 MB/s.)

-- Option 1, create separate column

ALTER TABLE uniq_state_3
    ADD COLUMN `value_2` AggregateFunction(uniq, UInt64) DEFAULT unhex(hex(value));
	
	
ALTER TABLE uniq_state_3
    UPDATE value_2 = value_2 WHERE 1;
	
	
SELECT *
FROM system.mutations
WHERE is_done = 0;


Ok.

0 rows in set. Elapsed: 0.008 sec.


INSERT INTO uniq_state_3 (key, value_2) SELECT
    number % 10000 AS key,
    uniqState(sipHash64(reinterpretAsUUID(number)))
FROM numbers(1000000)
GROUP BY key

Ok.

0 rows in set. Elapsed: 0.337 sec. Processed 1.05 million rows, 8.38 MB (3.11 million rows/s., 24.89 MB/s.)


SELECT
    key % 20,
    uniqMerge(value),
    uniqMerge(value_2)
FROM uniq_state_3
GROUP BY key % 20

┌─modulo(key, 20)─┬─uniqMerge(value)─┬─uniqMerge(value_2)─┐
│               0 │            50000 │              50000 │
│               1 │            50000 │              50000 │
│               2 │            50000 │              50000 │
│               3 │            50000 │              50000 │
│               4 │            50000 │              50000 │
│               5 │            50000 │              50000 │
│               6 │            49999 │              49999 │
│               7 │            50000 │              50000 │
│               8 │            49999 │              49999 │
│               9 │            50000 │              50000 │
│              10 │            50000 │              50000 │
│              11 │            50000 │              50000 │
│              12 │            50000 │              50000 │
│              13 │            50000 │              50000 │
│              14 │            50000 │              50000 │
│              15 │            50000 │              50000 │
│              16 │            50000 │              50000 │
│              17 │            50000 │              50000 │
│              18 │            50000 │              50000 │
│              19 │            50000 │              50000 │
└─────────────────┴──────────────────┴────────────────────┘

20 rows in set. Elapsed: 0.768 sec. Processed 20.00 thousand rows, 4.58 MB (26.03 thousand rows/s., 5.96 MB/s.)

-- Option 2, modify column in-place with String as intermediate data type. 

ALTER TABLE uniq_state_3
    MODIFY COLUMN `value` String

Ok.

0 rows in set. Elapsed: 0.280 sec.


ALTER TABLE uniq_state_3
    MODIFY COLUMN `value` AggregateFunction(uniq, UInt64)

Ok.

0 rows in set. Elapsed: 0.254 sec.


INSERT INTO uniq_state_3 (key, value) SELECT
    number % 10000 AS key,
    uniqState(sipHash64(reinterpretAsUUID(number)))
FROM numbers(1000000)
GROUP BY key

Ok.

0 rows in set. Elapsed: 0.554 sec. Processed 1.05 million rows, 8.38 MB (1.89 million rows/s., 15.15 MB/s.)


SELECT
    key % 20,
    uniqMerge(value),
    uniqMerge(value_2)
FROM uniq_state_3
GROUP BY key % 20

┌─modulo(key, 20)─┬─uniqMerge(value)─┬─uniqMerge(value_2)─┐
│               0 │            50000 │              50000 │
│               1 │            50000 │              50000 │
│               2 │            50000 │              50000 │
│               3 │            50000 │              50000 │
│               4 │            50000 │              50000 │
│               5 │            50000 │              50000 │
│               6 │            49999 │              49999 │
│               7 │            50000 │              50000 │
│               8 │            49999 │              49999 │
│               9 │            50000 │              50000 │
│              10 │            50000 │              50000 │
│              11 │            50000 │              50000 │
│              12 │            50000 │              50000 │
│              13 │            50000 │              50000 │
│              14 │            50000 │              50000 │
│              15 │            50000 │              50000 │
│              16 │            50000 │              50000 │
│              17 │            50000 │              50000 │
│              18 │            50000 │              50000 │
│              19 │            50000 │              50000 │
└─────────────────┴──────────────────┴────────────────────┘

20 rows in set. Elapsed: 0.589 sec. Processed 30.00 thousand rows, 6.87 MB (50.93 thousand rows/s., 11.66 MB/s.)

SHOW CREATE TABLE uniq_state_3;

CREATE TABLE default.uniq_state_3
(
    `key` UInt32,
    `value` AggregateFunction(uniq, UInt64),
    `value_2` AggregateFunction(uniq, UInt64) DEFAULT unhex(hex(value))
)
ENGINE = MergeTree
ORDER BY key
SETTINGS index_granularity = 8192

-- Option 3, CAST uniqState(UInt64) to String.

CREATE TABLE uniq_state_4
ENGINE = MergeTree
ORDER BY key AS
SELECT *
FROM uniq_state

Ok.

0 rows in set. Elapsed: 0.146 sec. Processed 10.00 thousand rows, 1.16 MB (68.50 thousand rows/s., 7.98 MB/s.)

INSERT INTO uniq_state_4 (key, value) SELECT
    number % 10000 AS key,
    CAST(uniqState(sipHash64(reinterpretAsUUID(number))), 'String')
FROM numbers(1000000)
GROUP BY key

Ok.

0 rows in set. Elapsed: 0.476 sec. Processed 1.05 million rows, 8.38 MB (2.20 million rows/s., 17.63 MB/s.)

SELECT
    key % 20,
    uniqMerge(value)
FROM uniq_state_4
GROUP BY key % 20

┌─modulo(key, 20)─┬─uniqMerge(value)─┐
│               0 │            50000 │
│               1 │            50000 │
│               2 │            50000 │
│               3 │            50000 │
│               4 │            50000 │
│               5 │            50000 │
│               6 │            49999 │
│               7 │            50000 │
│               8 │            49999 │
│               9 │            50000 │
│              10 │            50000 │
│              11 │            50000 │
│              12 │            50000 │
│              13 │            50000 │
│              14 │            50000 │
│              15 │            50000 │
│              16 │            50000 │
│              17 │            50000 │
│              18 │            50000 │
│              19 │            50000 │
└─────────────────┴──────────────────┘

20 rows in set. Elapsed: 0.281 sec. Processed 20.00 thousand rows, 2.33 MB (71.04 thousand rows/s., 8.27 MB/s.)

SHOW CREATE TABLE uniq_state_4;

CREATE TABLE default.uniq_state_4
(
    `key` UInt32,
    `value` AggregateFunction(uniq, UUID)
)
ENGINE = MergeTree
ORDER BY key
SETTINGS index_granularity = 8192
```
