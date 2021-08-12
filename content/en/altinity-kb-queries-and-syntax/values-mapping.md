---
title: "Values mapping"
linkTitle: "Values mapping"
description: >
    Values mapping
---
```sql
SELECT count()
FROM numbers_mt(1000000000)
WHERE NOT ignore(transform(number % 3, [0, 1, 2, 3], ['aa', 'ab', 'ad', 'af'], 'a0'))

1 rows in set. Elapsed: 4.668 sec. Processed 1.00 billion rows, 8.00 GB (214.21 million rows/s., 1.71 GB/s.)

SELECT count()
FROM numbers_mt(1000000000)
WHERE NOT ignore(multiIf((number % 3) = 0, 'aa', (number % 3) = 1, 'ab', (number % 3) = 2, 'ad', (number % 3) = 3, 'af', 'a0'))

1 rows in set. Elapsed: 7.333 sec. Processed 1.00 billion rows, 8.00 GB (136.37 million rows/s., 1.09 GB/s.)

SELECT count()
FROM numbers_mt(1000000000)
WHERE NOT ignore(CAST(number % 3 AS Enum('aa' = 0, 'ab' = 1, 'ad' = 2, 'af' = 3)'))

1 rows in set. Elapsed: 1.152 sec. Processed 1.00 billion rows, 8.00 GB (867.79 million rows/s., 6.94 GB/s.)
```
