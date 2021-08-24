---
title: "-Resample vs -If vs -Map vs Subquery"
linkTitle: "-Resample vs -If vs -Map vs Subquery"
---
### 5 categories

```sql
SELECT sumResample(0, 5, 1)(number, number % 5) AS sum
FROM numbers_mt(1000000000)

┌─sum───────────────────────────────────────────────────────────────────────────────────────────┐
│ [99999999500000000,99999999700000000,99999999900000000,100000000100000000,100000000300000000] │
└───────────────────────────────────────────────────────────────────────────────────────────────┘

1 rows in set. Elapsed: 1.010 sec. Processed 1.00 billion rows, 8.00 GB (990.20 million rows/s., 7.92 GB/s.)


SELECT sumMap([number % 5], [number]) AS sum
FROM numbers_mt(1000000000)

┌─sum─────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ ([0,1,2,3,4],[99999999500000000,99999999700000000,99999999900000000,100000000100000000,100000000300000000]) │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────────┘

1 rows in set. Elapsed: 5.730 sec. Processed 1.00 billion rows, 8.00 GB (174.51 million rows/s., 1.40 GB/s.)

SELECT
    sumIf(number, (number % 5) = 0) AS sum_0,
    sumIf(number, (number % 5) = 1) AS sum_1,
    sumIf(number, (number % 5) = 2) AS sum_2,
    sumIf(number, (number % 5) = 3) AS sum_3,
    sumIf(number, (number % 5) = 4) AS sum_4
FROM numbers_mt(1000000000)

┌─────────────sum_0─┬─────────────sum_1─┬─────────────sum_2─┬──────────────sum_3─┬──────────────sum_4─┐
│ 99999999500000000 │ 99999999700000000 │ 99999999900000000 │ 100000000100000000 │ 100000000300000000 │
└───────────────────┴───────────────────┴───────────────────┴────────────────────┴────────────────────┘

1 rows in set. Elapsed: 0.762 sec. Processed 1.00 billion rows, 8.00 GB (1.31 billion rows/s., 10.50 GB/s.)

SELECT sumMap([id], [sum]) AS sum
FROM
(
    SELECT
        number % 5 AS id,
        sum(number) AS sum
    FROM numbers_mt(1000000000)
    GROUP BY id
)

┌─sum─────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ ([0,1,2,3,4],[99999999500000000,99999999700000000,99999999900000000,100000000100000000,100000000300000000]) │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────────┘

1 rows in set. Elapsed: 0.331 sec. Processed 1.00 billion rows, 8.00 GB (3.02 billion rows/s., 24.15 GB/s.)
```

### 20 categories

```sql
SELECT sumResample(0, 20, 1)(number, number % 20) AS sum
FROM numbers_mt(1000000000)

1 rows in set. Elapsed: 1.056 sec. Processed 1.00 billion rows, 8.00 GB (947.28 million rows/s., 7.58 GB/s.)

SELECT sumMap([number % 20], [number]) AS sum
FROM numbers_mt(1000000000)

1 rows in set. Elapsed: 6.410 sec. Processed 1.00 billion rows, 8.00 GB (156.00 million rows/s., 1.25 GB/s.)

SELECT
    sumIf(number, (number % 5) = 0) AS sum_0,
    sumIf(number, (number % 5) = 1) AS sum_1,
    sumIf(number, (number % 5) = 2) AS sum_2,
    sumIf(number, (number % 5) = 3) AS sum_3,
    sumIf(number, (number % 5) = 4) AS sum_4,
    sumIf(number, (number % 5) = 5) AS sum_5,
    sumIf(number, (number % 5) = 6) AS sum_6,
    sumIf(number, (number % 5) = 7) AS sum_7,
    sumIf(number, (number % 5) = 8) AS sum_8,
    sumIf(number, (number % 5) = 9) AS sum_9,
    sumIf(number, (number % 5) = 10) AS sum_10,
    sumIf(number, (number % 5) = 11) AS sum_11,
    sumIf(number, (number % 5) = 12) AS sum_12,
    sumIf(number, (number % 5) = 13) AS sum_13,
    sumIf(number, (number % 5) = 14) AS sum_14,
    sumIf(number, (number % 5) = 15) AS sum_15,
    sumIf(number, (number % 5) = 16) AS sum_16,
    sumIf(number, (number % 5) = 17) AS sum_17,
    sumIf(number, (number % 5) = 18) AS sum_18,
    sumIf(number, (number % 5) = 19) AS sum_19
FROM numbers_mt(1000000000)

1 rows in set. Elapsed: 5.282 sec. Processed 1.00 billion rows, 8.00 GB (189.30 million rows/s., 1.51 GB/s.)

SELECT sumMap([id], [sum]) AS sum
FROM
(
    SELECT
        number % 20 AS id,
        sum(number) AS sum
    FROM numbers_mt(1000000000)
    GROUP BY id
)

1 rows in set. Elapsed: 0.362 sec. Processed 1.00 billion rows, 8.00 GB (2.76 billion rows/s., 22.10 GB/s.)
```
