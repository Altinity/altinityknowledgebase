---
title: "Top N & Remain"
linkTitle: "Top N & Remain"
description: >
    Top N & Remain
---
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

## Using UNION ALL

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

## Using arrays

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

## Using window functions (starting from 21.1)

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

## Using WITH TOTALS

The total number will include the top rows as well so the remainder must be calculated by the application

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
