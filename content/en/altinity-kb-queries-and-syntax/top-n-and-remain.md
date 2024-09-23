---
title: "Top N & Remain"
linkTitle: "Top N & Remain"
description: >
    Top N & Remain
---

When working with large datasets, you may often need to compute the sum of values for the top N groups and aggregate the remainder separately. This article demonstrates several methods to achieve that in ClickHouse.

Dataset Setup
We'll start by creating a table top_with_rest and inserting data for demonstration purposes:

```sql
CREATE TABLE top_with_rest
(
    `k` String,
    `number` UInt64
)
ENGINE = Memory;

INSERT INTO top_with_rest SELECT
    toString(intDiv(number, 10)),
    number
FROM numbers_mt(10000);
```

This creates a table with 10,000 numbers, grouped by dividing the numbers into tens.

## Method 1: Using UNION ALL
This approach retrieves the top 10 groups by sum and aggregates the remaining groups as a separate row.

```sql
SELECT *
FROM
(
    SELECT
        k,
        sum(number) AS res
    FROM top_with_rest
    GROUP BY k
    ORDER BY res DESC
    LIMIT 10
    UNION ALL
    SELECT
        NULL,
        sum(number) AS res
    FROM top_with_rest
    WHERE k NOT IN (
        SELECT k
        FROM top_with_rest
        GROUP BY k
        ORDER BY sum(number) DESC
        LIMIT 10
    )
)
ORDER BY res ASC

┌─k───┬───res─┐
│ 990 │ 99045 │
│ 991 │ 99145 │
│ 992 │ 99245 │
│ 993 │ 99345 │
│ 994 │ 99445 │
│ 995 │ 99545 │
│ 996 │ 99645 │
│ 997 │ 99745 │
│ 998 │ 99845 │
│ 999 │ 99945 │
└─────┴───────┘
┌─k────┬──────res─┐
│ null │ 49000050 │
└──────┴──────────┘
```


## Method 2: Using Arrays
In this method, we push the top 10 groups into an array and add a special row for the remainder

```sql
WITH toUInt64(sumIf(sum, isNull(k)) - sumIf(sum, isNotNull(k))) AS total
SELECT
    (arrayJoin(arrayPushBack(groupArrayIf(10)((k, sum), isNotNull(k)), (NULL, total))) AS tpl).1 AS key,
    tpl.2 AS res
FROM
(
    SELECT
        toNullable(k) AS k,
        sum(number) AS sum
    FROM top_with_rest
    GROUP BY k
        WITH CUBE
    ORDER BY sum DESC
    LIMIT 11
)
ORDER BY res ASC

┌─key──┬──────res─┐
│ 990  │    99045 │
│ 991  │    99145 │
│ 992  │    99245 │
│ 993  │    99345 │
│ 994  │    99445 │
│ 995  │    99545 │
│ 996  │    99645 │
│ 997  │    99745 │
│ 998  │    99845 │
│ 999  │    99945 │
│ null │ 49000050 │
└──────┴──────────┘
```

##  Method 3: Using Window Functions
Window functions, available from ClickHouse version 21.1, provide an efficient way to calculate the sum for the top N rows and the remainder.

```sql
SET allow_experimental_window_functions = 1;

SELECT
    k AS key,
    If(isNotNull(key), sum, toUInt64(sum - wind)) AS res
FROM
(
    SELECT
        *,
        sumIf(sum, isNotNull(k)) OVER () AS wind
    FROM
    (
        SELECT
            toNullable(k) AS k,
            sum(number) AS sum
        FROM top_with_rest
        GROUP BY k
            WITH CUBE
        ORDER BY sum DESC
        LIMIT 11
    )
)
ORDER BY res ASC

┌─key──┬──────res─┐
│ 990  │    99045 │
│ 991  │    99145 │
│ 992  │    99245 │
│ 993  │    99345 │
│ 994  │    99445 │
│ 995  │    99545 │
│ 996  │    99645 │
│ 997  │    99745 │
│ 998  │    99845 │
│ 999  │    99945 │
│ null │ 49000050 │
└──────┴──────────┘
```
Window functions allow efficient summation of the total and top groups in one query.

## Method 4: Using Row Number and Grouping
This approach calculates the row number (rn) for each group and replaces the remaining groups with NULL.
```sql
SELECT
    k,
    sum(sum) AS res
FROM
(
    SELECT
        if(rn > 10, NULL, k) AS k,
        sum
    FROM
    (
        SELECT
            k,
            sum,
            row_number() OVER () AS rn
        FROM
        (
            SELECT
                k,
                sum(number) AS sum
            FROM top_with_rest
            GROUP BY k
            ORDER BY sum DESC
        )
    )
)
GROUP BY k
ORDER BY res

┌─k────┬──────res─┐
│ 990  │    99045 │
│ 991  │    99145 │
│ 992  │    99245 │
│ 993  │    99345 │
│ 994  │    99445 │
│ 995  │    99545 │
│ 996  │    99645 │
│ 997  │    99745 │
│ 998  │    99845 │
│ 999  │    99945 │
│ null │ 49000050 │
└──────┴──────────┘
```
This method uses ROW_NUMBER() to segregate the top N from the rest.

## Method 5: Using WITH TOTALS
This method includes totals for all groups, and you calculate the remainder on the application side.

```
SELECT
    k,
    sum(number) AS res
FROM top_with_rest
GROUP BY k
    WITH TOTALS
ORDER BY res DESC
LIMIT 10

┌─k───┬───res─┐
│ 999 │ 99945 │
│ 998 │ 99845 │
│ 997 │ 99745 │
│ 996 │ 99645 │
│ 995 │ 99545 │
│ 994 │ 99445 │
│ 993 │ 99345 │
│ 992 │ 99245 │
│ 991 │ 99145 │
│ 990 │ 99045 │
└─────┴───────┘

Totals:
┌─k─┬──────res─┐
│   │ 49995000 │
└───┴──────────┘
```
You would subtract the sum of the top rows from the totals in your application.

These methods offer different approaches for handling the Top N rows and aggregating the remainder in ClickHouse. Depending on your requirements—whether you prefer using UNION ALL, arrays, window functions, or totals—each method provides flexibility for efficient querying.
