---
title: "DateTime64"
linkTitle: "DateTime64"
weight: 100
description: >-
     DateTime64 data type
---

## Substract fractional seconds

```sql
WITH toDateTime64('2021-09-07 13:41:50.926', 3) AS time
SELECT
    time - 1,
    time - 0.1 AS no_affect,
    time - toDecimal64(0.1, 3) AS uncorrect_result,
    time - toIntervalMillisecond(100) AS correct_result -- from 22.4

Query id: 696722bd-3c22-4270-babe-c6b124fee97f

┌──────────minus(time, 1)─┬───────────────no_affect─┬────────uncorrect_result─┬──────────correct_result─┐
│ 2021-09-07 13:41:49.926 │ 2021-09-07 13:41:50.926 │ 1970-01-01 00:00:00.000 │ 2021-09-07 13:41:50.826 │
└─────────────────────────┴─────────────────────────┴─────────────────────────┴─────────────────────────┘


WITH
    toDateTime64('2021-03-03 09:30:00.100', 3) AS time,
    fromUnixTimestamp64Milli(toInt64(toUnixTimestamp64Milli(time) + (1.25 * 1000))) AS first,
    toDateTime64(toDecimal64(time, 3) + toDecimal64('1.25', 3), 3) AS second,
    reinterpret(reinterpret(time, 'Decimal64(3)') + toDecimal64('1.25', 3), 'DateTime64(3)') AS third,
    time + toIntervalMillisecond(1250) AS fourth, -- from 22.4
    addMilliseconds(time, 1250) AS fifth          -- from 22.4
SELECT
    first,
    second,
    third,
    fourth,
    fifth

Query id: 176cd2e7-68bf-4e26-a492-63e0b5a87cc5

┌───────────────────first─┬──────────────────second─┬───────────────────third─┬──────────────────fourth─┬───────────────────fifth─┐
│ 2021-03-03 09:30:01.350 │ 2021-03-03 09:30:01.350 │ 2021-03-03 09:30:01.350 │ 2021-03-03 09:30:01.350 │ 2021-03-03 09:30:01.350 │
└─────────────────────────┴─────────────────────────┴─────────────────────────┴─────────────────────────┴─────────────────────────┘

SET max_threads=1;

Starting from 22.4

WITH
    materialize(toDateTime64('2021-03-03 09:30:00.100', 3)) AS time,
    time + toIntervalMillisecond(1250) AS fourth
SELECT count()
FROM numbers(100000000)
WHERE NOT ignore(fourth)

1 rows in set. Elapsed: 0.215 sec. Processed 100.03 million rows, 800.21 MB (464.27 million rows/s., 3.71 GB/s.)

WITH
    materialize(toDateTime64('2021-03-03 09:30:00.100', 3)) AS time,
    addMilliseconds(time, 1250) AS fifth
SELECT count()
FROM numbers(100000000)
WHERE NOT ignore(fifth)

1 rows in set. Elapsed: 0.208 sec. Processed 100.03 million rows, 800.21 MB (481.04 million rows/s., 3.85 GB/s.)

###########

WITH
    materialize(toDateTime64('2021-03-03 09:30:00.100', 3)) AS time,
    fromUnixTimestamp64Milli(reinterpretAsInt64(toUnixTimestamp64Milli(time) + (1.25 * 1000))) AS first
SELECT count()
FROM numbers(100000000)
WHERE NOT ignore(first)

1 rows in set. Elapsed: 0.370 sec. Processed 100.03 million rows, 800.21 MB (270.31 million rows/s., 2.16 GB/s.)

WITH
    materialize(toDateTime64('2021-03-03 09:30:00.100', 3)) AS time,
    fromUnixTimestamp64Milli(toUnixTimestamp64Milli(time) + toInt16(1.25 * 1000)) AS first
SELECT count()
FROM numbers(100000000)
WHERE NOT ignore(first)

1 rows in set. Elapsed: 0.256 sec. Processed 100.03 million rows, 800.21 MB (391.06 million rows/s., 3.13 GB/s.)


WITH
    materialize(toDateTime64('2021-03-03 09:30:00.100', 3)) AS time,
    toDateTime64(toDecimal64(time, 3) + toDecimal64('1.25', 3), 3) AS second
SELECT count()
FROM numbers(100000000)
WHERE NOT ignore(second)

1 rows in set. Elapsed: 2.240 sec. Processed 100.03 million rows, 800.21 MB (44.65 million rows/s., 357.17 MB/s.)

SET decimal_check_overflow=0;

WITH
    materialize(toDateTime64('2021-03-03 09:30:00.100', 3)) AS time,
    toDateTime64(toDecimal64(time, 3) + toDecimal64('1.25', 3), 3) AS second
SELECT count()
FROM numbers(100000000)
WHERE NOT ignore(second)

1 rows in set. Elapsed: 1.991 sec. Processed 100.03 million rows, 800.21 MB (50.23 million rows/s., 401.81 MB/s.)


WITH
    materialize(toDateTime64('2021-03-03 09:30:00.100', 3)) AS time,
    reinterpret(reinterpret(time, 'Decimal64(3)') + toDecimal64('1.25', 3), 'DateTime64(3)') AS third
SELECT count()
FROM numbers(100000000)
WHERE NOT ignore(third)

1 rows in set. Elapsed: 0.515 sec. Processed 100.03 million rows, 800.21 MB (194.39 million rows/s., 1.56 GB/s.)

SET decimal_check_overflow=0;

WITH
    materialize(toDateTime64('2021-03-03 09:30:00.100', 3)) AS time,
    reinterpret(reinterpret(time, 'Decimal64(3)') + toDecimal64('1.25', 3), 'DateTime64(3)') AS third
SELECT count()
FROM numbers(100000000)
WHERE NOT ignore(third)

1 rows in set. Elapsed: 0.281 sec. Processed 100.03 million rows, 800.21 MB (356.21 million rows/s., 2.85 GB/s.)
```
