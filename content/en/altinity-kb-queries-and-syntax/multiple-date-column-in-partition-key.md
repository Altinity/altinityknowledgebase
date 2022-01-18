---
title: "Multiple aligned date columns in PARTITION BY expression"
linkTitle: "Multiple aligned date columns in PARTITION BY expression"
weight: 100
description: >-
     How to put multiple correlated date-like columns in partition key without generating a lot of partitions in case not exact match between them.
---

Alternative to doing that by [minmax skip index](https://kb.altinity.com/altinity-kb-queries-and-syntax/skip-indexes/minmax/#multiple-datedatetime-columns-can-be-used-in-where-conditions).

```sql
CREATE TABLE part_key_multiple_dates
(
    `key` UInt32,
    `date` Date,
    `time` DateTime,
    `created_at` DateTime,
    `inserted_at` DateTime
)
ENGINE = MergeTree
PARTITION BY (toYYYYMM(date), ignore(created_at), ignore(inserted_at))
ORDER BY (key, time);


INSERT INTO part_key_multiple_dates SELECT
    number,
    toDate(x),
    now() + intDiv(number, 10) AS x,
    x - (rand() % 100),
    x + (rand() % 100)
FROM numbers(100000000);

SELECT count()
FROM part_key_multiple_dates
WHERE date > (now() + toIntervalDay(105));

┌─count()─┐
│ 8434210 │
└─────────┘

1 rows in set. Elapsed: 0.022 sec. Processed 11.03 million rows, 22.05 MB (501.94 million rows/s., 1.00 GB/s.)

SELECT count()
FROM part_key_multiple_dates
WHERE inserted_at > (now() + toIntervalDay(105));

┌─count()─┐
│ 9279818 │
└─────────┘

1 rows in set. Elapsed: 0.046 sec. Processed 11.03 million rows, 44.10 MB (237.64 million rows/s., 950.57 MB/s.)

SELECT count()
FROM part_key_multiple_dates
WHERE created_at > (now() + toIntervalDay(105));

┌─count()─┐
│ 9279139 │
└─────────┘

1 rows in set. Elapsed: 0.043 sec. Processed 11.03 million rows, 44.10 MB (258.22 million rows/s., 1.03 GB/s.)
```
