---
title: "ClickHouse® AggregatingMergeTree"
linkTitle: "AggregatingMergeTree"
description: >
  FAQs for storing and merging pre-aggregated data
keywords: 
  - clickhouse aggregatingmergetree
  - aggregatingmergetree
---
Q. What happens with columns which are not part of the [ORDER BY](/engines/mergetree-table-engine-family/pick-keys/) key, nor have the AggregateFunction type?

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

Q.  I have 2 Kafka topics from which I am storing events into 2 different tables (A and B) having the same unique ID. I want to create a single table that combines the data in tables A and B into one table C. The problem is that data is received asynchronously and not all the data is available when a row arrives in Table A or vice-versa.

A. You can use AggregatingMergeTree with Nullable columns and any aggregation function or Non-Nullable column and max aggregation function if it is acceptable for your data. 

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

Here is a more complicated example (from here https://gist.github.com/den-crane/d03524eadbbce0bafa528101afa8f794)
```
CREATE TABLE states_raw(
    d date,
    uid UInt64,
    first_name String,
    last_name String,
    modification_timestamp_mcs DateTime64(3) default now64(3)
) ENGINE = Null;

CREATE TABLE final_states_by_month(
    d date,
    uid UInt64,
    final_first_name      AggregateFunction(argMax, String, DateTime64(3)),
    final_last_name      AggregateFunction(argMax, String, DateTime64(3)))
ENGINE = AggregatingMergeTree
PARTITION BY toYYYYMM(d)
ORDER BY (uid, d);

CREATE MATERIALIZED VIEW final_states_by_month_mv TO final_states_by_month AS
SELECT
    d, uid,
    argMaxState(first_name, if(first_name<>'', modification_timestamp_mcs, toDateTime64(0,3))) AS final_first_name,
    argMaxState(last_name, if(last_name<>'', modification_timestamp_mcs, toDateTime64(0,3)))   AS final_last_name
FROM states_raw
GROUP BY d, uid;


insert into states_raw(d,uid,first_name) values (today(), 1, 'Tom');
insert into states_raw(d,uid,last_name) values (today(),  1, 'Jones');
insert into states_raw(d,uid,first_name,last_name) values (today(), 2, 'XXX', '');
insert into states_raw(d,uid,first_name,last_name) values (today(), 2, 'YYY', 'YYY');


select uid, argMaxMerge(final_first_name) first_name, argMaxMerge(final_last_name) last_name 
from final_states_by_month group by uid

┌─uid─┬─first_name─┬─last_name─┐
│   2 │ YYY        │ YYY       │
│   1 │ Tom        │ Jones     │
└─────┴────────────┴───────────┘

optimize table final_states_by_month final;

select uid, finalizeAggregation(final_first_name) first_name, finalizeAggregation(final_last_name) last_name 
from final_states_by_month 

┌─uid─┬─first_name─┬─last_name─┐
│   1 │ Tom        │ Jones     │
│   2 │ YYY        │ YYY       │
└─────┴────────────┴───────────┘
```

