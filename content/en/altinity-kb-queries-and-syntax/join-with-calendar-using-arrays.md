---
title: "Join with Calendar using Arrays"
linkTitle: "Join with Calendar using Arrays"
description: >
    Join with Calendar using Arrays
---
## Sample data

```sql
CREATE TABLE test_metrics (counter_id Int64, timestamp DateTime, metric UInt64)
Engine=Log;

INSERT INTO test_metrics SELECT number % 3,
    toDateTime('2021-01-01 00:00:00'), 1
FROM numbers(20);

INSERT INTO test_metrics SELECT number % 3,
    toDateTime('2021-01-03 00:00:00'), 1
FROM numbers(20);

SELECT counter_id, toDate(timestamp) dt, sum(metric)
FROM test_metrics
GROUP BY counter_id, dt
ORDER BY counter_id, dt;

┌─counter_id─┬─────────dt─┬─sum(metric)─┐
│          0 │ 2021-01-01 │           7 │
│          0 │ 2021-01-03 │           7 │
│          1 │ 2021-01-01 │           7 │
│          1 │ 2021-01-03 │           7 │
│          2 │ 2021-01-01 │           6 │
│          2 │ 2021-01-03 │           6 │
└────────────┴────────────┴─────────────┘
```

## Calendar

```sql
WITH arrayMap(i -> (toDate('2021-01-01') + i), range(4)) AS Calendar
SELECT arrayJoin(Calendar);

┌─arrayJoin(Calendar)─┐
│          2021-01-01 │
│          2021-01-02 │
│          2021-01-03 │
│          2021-01-04 │
└─────────────────────┘
```

## Join with Calendar using arrayJoin

```sql
SELECT counter_id, tuple.2 dt, sum(tuple.1) sum FROM
  (
  WITH arrayMap(i -> (0, toDate('2021-01-01') + i), range(4)) AS Calendar
   SELECT counter_id, arrayJoin(arrayConcat(Calendar, [(sum, dt)])) tuple
   FROM
             (SELECT counter_id, toDate(timestamp) dt, sum(metric) sum
              FROM test_metrics
              GROUP BY counter_id, dt)
  ) GROUP BY counter_id, dt
    ORDER BY counter_id, dt;

┌─counter_id─┬─────────dt─┬─sum─┐
│          0 │ 2021-01-01 │   7 │
│          0 │ 2021-01-02 │   0 │
│          0 │ 2021-01-03 │   7 │
│          0 │ 2021-01-04 │   0 │
│          1 │ 2021-01-01 │   7 │
│          1 │ 2021-01-02 │   0 │
│          1 │ 2021-01-03 │   7 │
│          1 │ 2021-01-04 │   0 │
│          2 │ 2021-01-01 │   6 │
│          2 │ 2021-01-02 │   0 │
│          2 │ 2021-01-03 │   6 │
│          2 │ 2021-01-04 │   0 │
└────────────┴────────────┴─────┘
```

## With fill

```sql
SELECT
    counter_id,
    toDate(timestamp) AS dt,
    sum(metric) AS sum
FROM test_metrics
GROUP BY
    counter_id,
    dt
ORDER BY
    counter_id ASC WITH FILL,
    dt ASC WITH FILL FROM toDate('2021-01-01') TO toDate('2021-01-05');

┌─counter_id─┬─────────dt─┬─sum─┐
│          0 │ 2021-01-01 │   7 │
│          0 │ 2021-01-02 │   0 │
│          0 │ 2021-01-03 │   7 │
│          0 │ 2021-01-04 │   0 │
│          1 │ 2021-01-01 │   7 │
│          1 │ 2021-01-02 │   0 │
│          1 │ 2021-01-03 │   7 │
│          1 │ 2021-01-04 │   0 │
│          2 │ 2021-01-01 │   6 │
│          2 │ 2021-01-02 │   0 │
│          2 │ 2021-01-03 │   6 │
│          2 │ 2021-01-04 │   0 │
└────────────┴────────────┴─────┘
```
