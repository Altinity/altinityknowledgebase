---
title: "AggregatingMergeTree"
linkTitle: "AggregatingMergeTree"
description: >
    AggregatingMergeTree
---
Q. What happens with columns which are nor the part of ORDER BY key, nor have the AggregateFunction type?

A. it picks the first value met, (similar to `any`)

```sql
CREATE TABLE agg_test
(
    `a` String,
    `b` UInt8,
    `c` SimpleAggregateFunction(max, UInt8)
)
ENGINE = AggregatingMergeTree
ORDER BY a;

INSERT INTO agg_test VALUES ('a', 1, 1);
INSERT INTO agg_test VALUES ('a', 2, 2);

SELECT * FROM agg_test FINAL;

┌─a─┬─b─┬─c─┐
│ a │ 1 │ 2 │
└───┴───┴───┘

INSERT INTO agg_test VALUES ('a', 3, 3);

SELECT * FROM agg_test;

┌─a─┬─b─┬─c─┐
│ a │ 1 │ 2 │
└───┴───┴───┘
┌─a─┬─b─┬─c─┐
│ a │ 3 │ 3 │
└───┴───┴───┘

OPTIMIZE TABLE agg_test FINAL;

SELECT * FROM agg_test;

┌─a─┬─b─┬─c─┐
│ a │ 1 │ 3 │
└───┴───┴───┘
```

## Last non-null value for each column

```
CREATE TABLE test_last
(
    `col1` Int32,
    `col2` SimpleAggregateFunction(anyLast, Nullable(DateTime)),
    `col3` SimpleAggregateFunction(anyLast, Nullable(DateTime))
)
ENGINE = AggregatingMergeTree
ORDER BY col1

Ok.

0 rows in set. Elapsed: 0.003 sec.

INSERT INTO test_last (col1, col2) VALUES (1, now());

Ok.

1 rows in set. Elapsed: 0.014 sec.

INSERT INTO test_last (col1, col3) VALUES (1, now())

Ok.

1 rows in set. Elapsed: 0.006 sec.

SELECT
    col1,
    anyLast(col2),
    anyLast(col3)
FROM test_last
GROUP BY col1

┌─col1─┬───────anyLast(col2)─┬───────anyLast(col3)─┐
│    1 │ 2020-01-16 20:57:46 │ 2020-01-16 20:57:51 │
└──────┴─────────────────────┴─────────────────────┘

1 rows in set. Elapsed: 0.005 sec.

SELECT *
FROM test_last
FINAL

┌─col1─┬────────────────col2─┬────────────────col3─┐
│    1 │ 2020-01-16 20:57:46 │ 2020-01-16 20:57:51 │
└──────┴─────────────────────┴─────────────────────┘

1 rows in set. Elapsed: 0.003 sec.
```

## Merge two data streams

Q.  I have 2 Kafka topics from which I am storing events into 2 different tables (A and B) having the same unique ID. I want to create a single table that combines the data in tables A and B into one table C. The problem is that data received asynchronously and not all the data is available when a row arrives in Table A or vice-versa.

A. You can use AggregatingMergeTree with Nullable columns and any aggregation function or Non-Nullable column and max aggregation function if it acceptable for your data. 

```
CREATE TABLE table_C (
    id      Int64,
    colA    SimpleAggregatingFunction(any,Nullable(UInt32)),
    colB    SimpleAggregatingFunction(max, String)
) ENGINE = AggregatingMergeTree()
ORDER BY id;

CREATE MATERIALIZED VIEW mv_A TO table_C AS
SELECT id,colA FROM Kafka_A;

CREATE MATERIALIZED VIEW mv_B TO table_C AS
SELECT id,colB FROM Kafka_B;
```
