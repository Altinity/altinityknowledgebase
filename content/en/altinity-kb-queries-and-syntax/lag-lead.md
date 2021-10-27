---
title: "Lag / Lead"
linkTitle: "Lag / Lead"
description: >
    Lag / Lead
---
## Sample data

```sql
CREATE TABLE llexample (
    g Int32,
    a Date )
ENGINE = Memory;

INSERT INTO llexample SELECT
    number % 3,
    toDate('2020-01-01') + number
FROM numbers(10);

SELECT * FROM llexample ORDER BY g,a;

┌─g─┬──────────a─┐
│ 0 │ 2020-01-01 │
│ 0 │ 2020-01-04 │
│ 0 │ 2020-01-07 │
│ 0 │ 2020-01-10 │
│ 1 │ 2020-01-02 │
│ 1 │ 2020-01-05 │
│ 1 │ 2020-01-08 │
│ 2 │ 2020-01-03 │
│ 2 │ 2020-01-06 │
│ 2 │ 2020-01-09 │
└───┴────────────┘
```

## Using arrays

```sql
select g, (arrayJoin(tuple_ll) as ll).1 a, ll.2 prev, ll.3 next
from (
select g, arrayZip( arraySort(groupArray(a)) as aa,
                    arrayPopBack(arrayPushFront(aa, toDate(0))),
                    arrayPopFront(arrayPushBack(aa, toDate(0))) ) tuple_ll
from llexample
group by g)
order by g, a;

┌─g─┬──────────a─┬───────prev─┬───────next─┐
│ 0 │ 2020-01-01 │ 1970-01-01 │ 2020-01-04 │
│ 0 │ 2020-01-04 │ 2020-01-01 │ 2020-01-07 │
│ 0 │ 2020-01-07 │ 2020-01-04 │ 2020-01-10 │
│ 0 │ 2020-01-10 │ 2020-01-07 │ 1970-01-01 │
│ 1 │ 2020-01-02 │ 1970-01-01 │ 2020-01-05 │
│ 1 │ 2020-01-05 │ 2020-01-02 │ 2020-01-08 │
│ 1 │ 2020-01-08 │ 2020-01-05 │ 1970-01-01 │
│ 2 │ 2020-01-03 │ 1970-01-01 │ 2020-01-06 │
│ 2 │ 2020-01-06 │ 2020-01-03 │ 2020-01-09 │
│ 2 │ 2020-01-09 │ 2020-01-06 │ 1970-01-01 │
└───┴────────────┴────────────┴────────────┘
```

## Using window functions (starting from Clickhouse 21.3)

```sql
SET allow_experimental_window_functions = 1;

SELECT
    g,
    a,
    any(a) OVER (PARTITION BY g ORDER BY a ASC ROWS
                 BETWEEN 1 PRECEDING AND 1 PRECEDING) AS prev,
    any(a) OVER (PARTITION BY g ORDER BY a ASC ROWS
                 BETWEEN 1 FOLLOWING AND 1 FOLLOWING) AS next
FROM llexample
ORDER BY
    g ASC,
    a ASC;

┌─g─┬──────────a─┬───────prev─┬───────next─┐
│ 0 │ 2020-01-01 │ 1970-01-01 │ 2020-01-04 │
│ 0 │ 2020-01-04 │ 2020-01-01 │ 2020-01-07 │
│ 0 │ 2020-01-07 │ 2020-01-04 │ 2020-01-10 │
│ 0 │ 2020-01-10 │ 2020-01-07 │ 1970-01-01 │
│ 1 │ 2020-01-02 │ 1970-01-01 │ 2020-01-05 │
│ 1 │ 2020-01-05 │ 2020-01-02 │ 2020-01-08 │
│ 1 │ 2020-01-08 │ 2020-01-05 │ 1970-01-01 │
│ 2 │ 2020-01-03 │ 1970-01-01 │ 2020-01-06 │
│ 2 │ 2020-01-06 │ 2020-01-03 │ 2020-01-09 │
│ 2 │ 2020-01-09 │ 2020-01-06 │ 1970-01-01 │
└───┴────────────┴────────────┴────────────┘
```

## Using lagInFrame/leadInFrame (starting from ClickHouse 21.4)

```sql
SELECT
    g,
    a,
    lagInFrame(a) OVER (PARTITION BY g ORDER BY a ASC ROWS
                 BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING) AS prev,
    leadInFrame(a) OVER (PARTITION BY g ORDER BY a ASC ROWS
                 BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING) AS next
FROM llexample
ORDER BY
    g ASC,
    a ASC;

┌─g─┬──────────a─┬───────prev─┬───────next─┐
│ 0 │ 2020-01-01 │ 1970-01-01 │ 2020-01-04 │
│ 0 │ 2020-01-04 │ 2020-01-01 │ 2020-01-07 │
│ 0 │ 2020-01-07 │ 2020-01-04 │ 2020-01-10 │
│ 0 │ 2020-01-10 │ 2020-01-07 │ 1970-01-01 │
│ 1 │ 2020-01-02 │ 1970-01-01 │ 2020-01-05 │
│ 1 │ 2020-01-05 │ 2020-01-02 │ 2020-01-08 │
│ 1 │ 2020-01-08 │ 2020-01-05 │ 1970-01-01 │
│ 2 │ 2020-01-03 │ 1970-01-01 │ 2020-01-06 │
│ 2 │ 2020-01-06 │ 2020-01-03 │ 2020-01-09 │
│ 2 │ 2020-01-09 │ 2020-01-06 │ 1970-01-01 │
└───┴────────────┴────────────┴────────────┘
```

## Using neighbor (no grouping, incorrect result over blocks)

```sql
SELECT
    g,
    a,
    neighbor(a, -1) AS prev,
    neighbor(a, 1) AS next
FROM
(
    SELECT *
    FROM llexample
    ORDER BY
        g ASC,
        a ASC
);

┌─g─┬──────────a─┬───────prev─┬───────next─┐
│ 0 │ 2020-01-01 │ 1970-01-01 │ 2020-01-04 │
│ 0 │ 2020-01-04 │ 2020-01-01 │ 2020-01-07 │
│ 0 │ 2020-01-07 │ 2020-01-04 │ 2020-01-10 │
│ 0 │ 2020-01-10 │ 2020-01-07 │ 2020-01-02 │
│ 1 │ 2020-01-02 │ 2020-01-10 │ 2020-01-05 │
│ 1 │ 2020-01-05 │ 2020-01-02 │ 2020-01-08 │
│ 1 │ 2020-01-08 │ 2020-01-05 │ 2020-01-03 │
│ 2 │ 2020-01-03 │ 2020-01-08 │ 2020-01-06 │
│ 2 │ 2020-01-06 │ 2020-01-03 │ 2020-01-09 │
│ 2 │ 2020-01-09 │ 2020-01-06 │ 1970-01-01 │
└───┴────────────┴────────────┴────────────┘
```
