---
title: "TTL GROUP BY Examples"
linkTitle: "TTL GROUP BY Examples"
description: >
    TTL GROUP BY Examples
---
### Example with MergeTree table

```sql
CREATE TABLE test_ttl_group_by
(
    `key` UInt32,
    `ts` DateTime,
    `value` UInt32,
    `min_value` UInt32 DEFAULT value,
    `max_value` UInt32 DEFAULT value
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(ts)
ORDER BY (key, toStartOfDay(ts))
TTL ts + interval 30 day 
    GROUP BY key, toStartOfDay(ts) 
    SET value = sum(value), 
    min_value = min(min_value), 
    max_value = max(max_value), 
    ts = min(toStartOfDay(ts));
```

During TTL merges Clickhouse re-calculates values of columns in the SET section.

GROUP BY section should be a prefix of a table's PRIMARY KEY (the same as ORDER BY, if no separate PRIMARY KEY defined).

```sql
-- stop merges to demonstrate data before / after 
-- a rolling up
SYSTEM STOP TTL MERGES test_ttl_group_by;
SYSTEM STOP MERGES test_ttl_group_by;

INSERT INTO test_ttl_group_by (key, ts, value)
SELECT
    number % 5,
    now() + number,
    1
FROM numbers(100);

INSERT INTO test_ttl_group_by (key, ts, value)
SELECT
    number % 5,
    now() - interval 60 day + number,
    2
FROM numbers(100);

SELECT
    toYYYYMM(ts) AS m,
    count(),
    sum(value),
    min(min_value),
    max(max_value)
FROM test_ttl_group_by
GROUP BY m;
┌──────m─┬─count()─┬─sum(value)─┬─min(min_value)─┬─max(max_value)─┐
│ 202102 │     100 │        200 │              2 │              2 │
│ 202104 │     100 │        100 │              1 │              1 │
└────────┴─────────┴────────────┴────────────────┴────────────────┘

SYSTEM START TTL MERGES test_ttl_group_by;
SYSTEM START MERGES test_ttl_group_by;
OPTIMIZE TABLE test_ttl_group_by FINAL;

SELECT
    toYYYYMM(ts) AS m,
    count(),
    sum(value),
    min(min_value),
    max(max_value)
FROM test_ttl_group_by
GROUP BY m;
┌──────m─┬─count()─┬─sum(value)─┬─min(min_value)─┬─max(max_value)─┐
│ 202102 │       5 │        200 │              2 │              2 │
│ 202104 │     100 │        100 │              1 │              1 │
└────────┴─────────┴────────────┴────────────────┴────────────────┘
```

As you can see 100 rows were rolled up into 5 rows (key has 5 values) for rows older than 30 days.

### Example with SummingMergeTree table

```sql
CREATE TABLE test_ttl_group_by
(
    `key1` UInt32,
    `key2` UInt32,
    `ts` DateTime,
    `value` UInt32,
    `min_value` SimpleAggregateFunction(min, UInt32) 
                                       DEFAULT value,
    `max_value` SimpleAggregateFunction(max, UInt32) 
                                       DEFAULT value
)
ENGINE = SummingMergeTree
PARTITION BY toYYYYMM(ts)
PRIMARY KEY (key1, key2, toStartOfDay(ts))
ORDER BY (key1, key2, toStartOfDay(ts), ts)
TTL ts + interval 30 day 
    GROUP BY key1, key2, toStartOfDay(ts) 
    SET value = sum(value), 
    min_value = min(min_value), 
    max_value = max(max_value), 
    ts = min(toStartOfDay(ts));

-- stop merges to demonstrate data before / after 
-- a rolling up
SYSTEM STOP TTL MERGES test_ttl_group_by;
SYSTEM STOP MERGES test_ttl_group_by;

INSERT INTO test_ttl_group_by (key1, key2, ts, value)
SELECT
    1,
    1,
    toStartOfMinute(now() + number*60),
    1
FROM numbers(100);

INSERT INTO test_ttl_group_by (key1, key2, ts, value)
SELECT
    1,
    1,
    toStartOfMinute(now() + number*60),
    1
FROM numbers(100);

INSERT INTO test_ttl_group_by (key1, key2, ts, value)
SELECT
    1,
    1,
    toStartOfMinute(now() + number*60 - toIntervalDay(60)),
    2
FROM numbers(100);

INSERT INTO test_ttl_group_by (key1, key2, ts, value)
SELECT
    1,
    1,
    toStartOfMinute(now() + number*60 - toIntervalDay(60)),
    2
FROM numbers(100);

SELECT
    toYYYYMM(ts) AS m,
    count(),
    sum(value),
    min(min_value),
    max(max_value)
FROM test_ttl_group_by
GROUP BY m;

┌──────m─┬─count()─┬─sum(value)─┬─min(min_value)─┬─max(max_value)─┐
│ 202102 │     200 │        400 │              2 │              2 │
│ 202104 │     200 │        200 │              1 │              1 │
└────────┴─────────┴────────────┴────────────────┴────────────────┘

SYSTEM START TTL MERGES test_ttl_group_by;
SYSTEM START MERGES test_ttl_group_by;
OPTIMIZE TABLE test_ttl_group_by FINAL;

SELECT
    toYYYYMM(ts) AS m,
    count(),
    sum(value),
    min(min_value),
    max(max_value)
FROM test_ttl_group_by
GROUP BY m;

┌──────m─┬─count()─┬─sum(value)─┬─min(min_value)─┬─max(max_value)─┐
│ 202102 │       1 │        400 │              2 │              2 │
│ 202104 │     100 │        200 │              1 │              1 │
└────────┴─────────┴────────────┴────────────────┴────────────────┘
```

During merges Clickhouse re-calculates **ts** columns as **min(toStartOfDay(ts))**. It's possible **only for the last column** of `SummingMergeTree` `ORDER BY` section `ORDER BY (key1, key2, toStartOfDay(ts), ts)` otherwise it will **break** the order of rows in the table.

### Multilevel TTL Group by

```sql
CREATE TABLE test_ttl_group_by
(
    `key` UInt32,
    `ts` DateTime,
    `value` UInt32,
    `min_value` UInt32 DEFAULT value,
    `max_value` UInt32 DEFAULT value
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(ts)
ORDER BY (key, toStartOfWeek(ts), toStartOfDay(ts), toStartOfHour(ts))
TTL 
ts + interval 1 hour 
GROUP BY key, toStartOfWeek(ts), toStartOfDay(ts), toStartOfHour(ts) 
    SET value = sum(value), 
    min_value = min(min_value), 
    max_value = max(max_value), 
    ts = min(toStartOfHour(ts)),
ts + interval 1 day 
GROUP BY key, toStartOfWeek(ts), toStartOfDay(ts) 
    SET value = sum(value), 
    min_value = min(min_value), 
    max_value = max(max_value), 
    ts = min(toStartOfDay(ts)),
ts + interval 30 day 
GROUP BY key, toStartOfWeek(ts) 
    SET value = sum(value), 
    min_value = min(min_value), 
    max_value = max(max_value), 
    ts = min(toStartOfWeek(ts));
    
SYSTEM STOP TTL MERGES test_ttl_group_by;
SYSTEM STOP MERGES test_ttl_group_by;

INSERT INTO test_ttl_group_by (key, ts, value)
SELECT
    number % 5,
    now() + number,
    1
FROM numbers(100);

INSERT INTO test_ttl_group_by (key, ts, value)
SELECT
    number % 5,
    now() - interval 2 hour + number,
    2
FROM numbers(100);    

INSERT INTO test_ttl_group_by (key, ts, value)
SELECT
    number % 5,
    now() - interval 2 day + number,
    3
FROM numbers(100);    

INSERT INTO test_ttl_group_by (key, ts, value)
SELECT
    number % 5,
    now() - interval 2 month + number,
    4
FROM numbers(100); 

SELECT
    toYYYYMMDD(ts) AS d,
    count(),
    sum(value),
    min(min_value),
    max(max_value)
FROM test_ttl_group_by
GROUP BY d
ORDER BY d;

┌────────d─┬─count()─┬─sum(value)─┬─min(min_value)─┬─max(max_value)─┐
│ 20210616 │     100 │        400 │              4 │              4 │
│ 20210814 │     100 │        300 │              3 │              3 │
│ 20210816 │     200 │        300 │              1 │              2 │
└──────────┴─────────┴────────────┴────────────────┴────────────────┘

SYSTEM START TTL MERGES test_ttl_group_by;
SYSTEM START MERGES test_ttl_group_by;
OPTIMIZE TABLE test_ttl_group_by FINAL;

SELECT
    toYYYYMMDD(ts) AS d,
    count(),
    sum(value),
    min(min_value),
    max(max_value)
FROM test_ttl_group_by
GROUP BY d
ORDER BY d;

┌────────d─┬─count()─┬─sum(value)─┬─min(min_value)─┬─max(max_value)─┐
│ 20210613 │       5 │        400 │              4 │              4 │
│ 20210814 │       5 │        300 │              3 │              3 │
│ 20210816 │     105 │        300 │              1 │              2 │
└──────────┴─────────┴────────────┴────────────────┴────────────────┘
```

### TTL GROUP BY + DELETE

```sql
CREATE TABLE test_ttl_group_by
(
    `key` UInt32,
    `ts` DateTime,
    `value` UInt32,
    `min_value` UInt32 DEFAULT value,
    `max_value` UInt32 DEFAULT value
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(ts)
ORDER BY (key, toStartOfDay(ts))
TTL 
ts + interval 180 day,
ts + interval 30 day 
    GROUP BY key, toStartOfDay(ts) 
    SET value = sum(value), 
    min_value = min(min_value), 
    max_value = max(max_value), 
    ts = min(toStartOfDay(ts));

-- stop merges to demonstrate data before / after 
-- a rolling up
SYSTEM STOP TTL MERGES test_ttl_group_by;
SYSTEM STOP MERGES test_ttl_group_by;

INSERT INTO test_ttl_group_by (key, ts, value)
SELECT
    number % 5,
    now() + number,
    1
FROM numbers(100);

INSERT INTO test_ttl_group_by (key, ts, value)
SELECT
    number % 5,
    now() - interval 60 day + number,
    2
FROM numbers(100);    

INSERT INTO test_ttl_group_by (key, ts, value)
SELECT
    number % 5,
    now() - interval 200 day + number,
    3
FROM numbers(100);  

SELECT
    toYYYYMM(ts) AS m,
    count(),
    sum(value),
    min(min_value),
    max(max_value)
FROM test_ttl_group_by
GROUP BY m;

┌──────m─┬─count()─┬─sum(value)─┬─min(min_value)─┬─max(max_value)─┐
│ 202101 │     100 │        300 │              3 │              3 │
│ 202106 │     100 │        200 │              2 │              2 │
│ 202108 │     100 │        100 │              1 │              1 │
└────────┴─────────┴────────────┴────────────────┴────────────────┘

SYSTEM START TTL MERGES test_ttl_group_by;
SYSTEM START MERGES test_ttl_group_by;
OPTIMIZE TABLE test_ttl_group_by FINAL;

┌──────m─┬─count()─┬─sum(value)─┬─min(min_value)─┬─max(max_value)─┐
│ 202106 │       5 │        200 │              2 │              2 │
│ 202108 │     100 │        100 │              1 │              1 │
└────────┴─────────┴────────────┴────────────────┴────────────────┘

```
