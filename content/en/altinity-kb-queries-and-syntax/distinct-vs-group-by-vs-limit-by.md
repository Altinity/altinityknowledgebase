---
title: "DISTINCT & GROUP BY & LIMIT 1 BY what the difference"
linkTitle: "DISTINCT & GROUP BY & LIMIT 1 BY what the difference"
weight: 100
description: >-
     Page description for heading and indexes.
---

## DISTINCT


```sql

SELECT DISTINCT number
FROM numbers_mt(100000000)
FORMAT `Null`

MemoryTracker: Peak memory usage (for query): 4.00 GiB.

0 rows in set. Elapsed: 18.720 sec. Processed 100.03 million rows, 800.21 MB (5.34 million rows/s., 42.75 MB/s.)

SELECT DISTINCT number
FROM numbers_mt(100000000)
SETTINGS max_threads = 1
FORMAT `Null`

MemoryTracker: Peak memory usage (for query): 4.00 GiB.

0 rows in set. Elapsed: 18.349 sec. Processed 100.03 million rows, 800.21 MB (5.45 million rows/s., 43.61 MB/s.)

SELECT DISTINCT number
FROM numbers_mt(100000000)
LIMIT 1000
FORMAT `Null`

MemoryTracker: Peak memory usage (for query): 21.56 MiB.

0 rows in set. Elapsed: 0.014 sec. Processed 589.54 thousand rows, 4.72 MB (43.08 million rows/s., 344.61 MB/s.)



SELECT DISTINCT number % 1000
FROM numbers_mt(1000000000)
LIMIT 1000
FORMAT `Null`

MemoryTracker: Peak memory usage (for query): 1.80 MiB.

0 rows in set. Elapsed: 0.005 sec. Processed 589.54 thousand rows, 4.72 MB (127.23 million rows/s., 1.02 GB/s.)

SELECT DISTINCT number % 1000
FROM numbers(1000000000)
LIMIT 1001
FORMAT `Null`

MemoryTracker: Peak memory usage (for query): 847.05 KiB.

0 rows in set. Elapsed: 0.448 sec. Processed 1.00 billion rows, 8.00 GB (2.23 billion rows/s., 17.88 GB/s.)
```

* Final distinct step is single threaded
* Stream resultset

## GROUP BY

```sql

SELECT number
FROM numbers_mt(100000000)
GROUP BY number
FORMAT `Null`

MemoryTracker: Peak memory usage (for query): 4.04 GiB.

0 rows in set. Elapsed: 8.212 sec. Processed 100.00 million rows, 800.00 MB (12.18 million rows/s., 97.42 MB/s.)

SELECT number
FROM numbers_mt(100000000)
GROUP BY number
SETTINGS max_threads = 1
FORMAT `Null`

MemoryTracker: Peak memory usage (for query): 6.00 GiB.

0 rows in set. Elapsed: 19.206 sec. Processed 100.03 million rows, 800.21 MB (5.21 million rows/s., 41.66 MB/s.)

SELECT number
FROM numbers_mt(100000000)
GROUP BY number
LIMIT 1000
FORMAT `Null`

MemoryTracker: Peak memory usage (for query): 4.05 GiB.

0 rows in set. Elapsed: 4.852 sec. Processed 100.00 million rows, 800.00 MB (20.61 million rows/s., 164.88 MB/s.)

This query faster than first, because ClickHouse doesn't need to merge states for all keys, only for first 1000 (based on LIMIT)


SELECT number % 1000 AS key
FROM numbers_mt(1000000000)
GROUP BY key
LIMIT 1000
FORMAT `Null`

MemoryTracker: Peak memory usage (for query): 3.15 MiB.

0 rows in set. Elapsed: 0.770 sec. Processed 1.00 billion rows, 8.00 GB (1.30 billion rows/s., 10.40 GB/s.)

SELECT number % 1000 AS key
FROM numbers_mt(1000000000)
GROUP BY key
LIMIT 1001
FORMAT `Null`

MemoryTracker: Peak memory usage (for query): 3.77 MiB.

0 rows in set. Elapsed: 0.770 sec. Processed 1.00 billion rows, 8.00 GB (1.30 billion rows/s., 10.40 GB/s.)
```

* Multi threaded
* Will return result only after competion of aggregation

## LIMIT BY

```sql
SELECT number
FROM numbers_mt(100000000)
LIMIT 1 BY number
FORMAT `Null`

MemoryTracker: Peak memory usage (for query): 6.00 GiB.

0 rows in set. Elapsed: 39.541 sec. Processed 100.00 million rows, 800.00 MB (2.53 million rows/s., 20.23 MB/s.)

SELECT number
FROM numbers_mt(100000000)
LIMIT 1 BY number
SETTINGS max_threads = 1
FORMAT `Null`

MemoryTracker: Peak memory usage (for query): 6.01 GiB.

0 rows in set. Elapsed: 36.773 sec. Processed 100.03 million rows, 800.21 MB (2.72 million rows/s., 21.76 MB/s.)

SELECT number
FROM numbers_mt(100000000)
LIMIT 1 BY number
LIMIT 1000
FORMAT `Null`

MemoryTracker: Peak memory usage (for query): 10.56 MiB.

0 rows in set. Elapsed: 0.019 sec. Processed 589.54 thousand rows, 4.72 MB (30.52 million rows/s., 244.20 MB/s.)



SELECT number % 1000 AS key
FROM numbers_mt(1000000000)
LIMIT 1 BY key
LIMIT 1000
FORMAT `Null`

MemoryTracker: Peak memory usage (for query): 5.14 MiB.

0 rows in set. Elapsed: 0.008 sec. Processed 589.54 thousand rows, 4.72 MB (71.27 million rows/s., 570.16 MB/s.)

SELECT number % 1000 AS key
FROM numbers_mt(1000000000)
LIMIT 1 BY key
LIMIT 1001
FORMAT `Null`

MemoryTracker: Peak memory usage (for query): 3.23 MiB.

0 rows in set. Elapsed: 36.027 sec. Processed 1.00 billion rows, 8.00 GB (27.76 million rows/s., 222.06 MB/s.)
```

* Single threaded
* Stream resultset
* Can return arbitrary amount of rows per each key
