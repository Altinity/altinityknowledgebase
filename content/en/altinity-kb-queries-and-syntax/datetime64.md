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
    time - toDecimal64(0.1, 3) AS uncorrect_result

┌──────────minus(time, 1)─┬───────────────no_affect─┬────────uncorrect_result─┐
│ 2021-09-07 13:41:49.926 │ 2021-09-07 13:41:50.926 │ 2283-11-11 10:46:37.248 │
└─────────────────────────┴─────────────────────────┴─────────────────────────┘


WITH
    toDateTime64('2021-03-03 09:30:00.100', 3) AS time,
    fromUnixTimestamp64Milli(toInt64(toUnixTimestamp64Milli(time) + (1.25 * 1000))) AS first,
    toDateTime64(toDecimal64(time, 3) + toDecimal64('1.25', 3), 3) AS second,
    reinterpret(reinterpret(time, 'Decimal64(3)') + toDecimal64('1.25', 3), 'DateTime64(3)') AS third
SELECT
    first,
    second,
    third

┌───────────────────first─┬──────────────────second─┬───────────────────third─┐
│ 2021-03-03 09:30:01.350 │ 2021-03-03 09:30:01.350 │ 2021-03-03 09:30:01.350 │
└─────────────────────────┴─────────────────────────┴─────────────────────────┘


WITH
    materialize(toDateTime64('2021-03-03 09:30:00.100', 3)) AS time,
    fromUnixTimestamp64Milli(reinterpretAsInt64(toUnixTimestamp64Milli(time) + (1.25 * 1000))) AS first
SELECT count()
FROM numbers(100000000)
WHERE NOT ignore(first)

1 rows in set. Elapsed: 0.927 sec. Processed 100.03 million rows, 800.21 MB (107.93 million rows/s., 863.48 MB/s.)

WITH
    materialize(toDateTime64('2021-03-03 09:30:00.100', 3)) AS time,
    fromUnixTimestamp64Milli(toUnixTimestamp64Milli(time) + toInt16(1.25 * 1000)) AS first
SELECT count()
FROM numbers(100000000)
WHERE NOT ignore(first)

1 rows in set. Elapsed: 0.652 sec. Processed 100.03 million rows, 800.21 MB (153.52 million rows/s., 1.23 GB/s.)



WITH
    materialize(toDateTime64('2021-03-03 09:30:00.100', 3)) AS time,
    toDateTime64(toDecimal64(time, 3) + toDecimal64('1.25', 3), 3) AS second
SELECT count()
FROM numbers(100000000)
WHERE NOT ignore(second)

1 rows in set. Elapsed: 6.287 sec. Processed 100.03 million rows, 800.21 MB (15.91 million rows/s., 127.28 MB/s.)

SET decimal_check_overflow=0;

WITH
    materialize(toDateTime64('2021-03-03 09:30:00.100', 3)) AS time,
    toDateTime64(toDecimal64(time, 3) + toDecimal64('1.25', 3), 3) AS second
SELECT count()
FROM numbers(100000000)
WHERE NOT ignore(second)

1 rows in set. Elapsed: 5.726 sec. Processed 100.03 million rows, 800.21 MB (17.47 million rows/s., 139.74 MB/s.)



WITH
    materialize(toDateTime64('2021-03-03 09:30:00.100', 3)) AS time,
    reinterpret(reinterpret(time, 'Decimal64(3)') + toDecimal64('1.25', 3), 'DateTime64(3)') AS third
SELECT count()
FROM numbers(100000000)
WHERE NOT ignore(third)

1 rows in set. Elapsed: 1.478 sec. Processed 100.03 million rows, 800.21 MB (67.68 million rows/s., 541.42 MB/s.)

SET decimal_check_overflow=0;

WITH
    materialize(toDateTime64('2021-03-03 09:30:00.100', 3)) AS time,
    reinterpret(reinterpret(time, 'Decimal64(3)') + toDecimal64('1.25', 3), 'DateTime64(3)') AS third
SELECT count()
FROM numbers(100000000)
WHERE NOT ignore(third)

1 rows in set. Elapsed: 0.795 sec. Processed 100.03 million rows, 800.21 MB (125.82 million rows/s., 1.01 GB/s.)
```
