---
title: "Example: minmax"
linkTitle: "Example: minmax"
description: >
    Example: minmax
---
### Use cases

#### Strong correlation between column from table ORDER BY / PARTITION BY key and other column which is regularly being used in WHERE condition

Good example is incremental ID which increasing with time.

```sql
CREATE TABLE skip_idx_corr
(
    `key` UInt32,
    `id` UInt32,
    `ts` DateTime
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(ts)
ORDER BY (key, id);

INSERT INTO skip_idx_corr SELECT
    rand(),
    number,
    now() + intDiv(number, 10)
FROM numbers(100000000);

SELECT count()
FROM skip_idx_corr
WHERE id = 6000000

1 rows in set. Elapsed: 0.167 sec. Processed 100.00 million rows, 400.00 MB
(599.96 million rows/s., 2.40 GB/s.)


ALTER TABLE skip_idx_corr ADD INDEX id_idx id TYPE minmax GRANULARITY 10;
ALTER TABLE skip_idx_corr MATERIALIZE INDEX id_idx;


SELECT count()
FROM skip_idx_corr
WHERE id = 6000000

1 rows in set. Elapsed: 0.017 sec. Processed 6.29 million rows, 25.17 MB
(359.78 million rows/s., 1.44 GB/s.)
```

#### Multiple Date/DateTime columns can be used in WHERE conditions

Usually it could happen if you have separate Date and DateTime columns and different column being used in PARTITION BY expression and in WHERE condition. Another possible scenario when you have multiple DateTime columns which have pretty the same date or even time.

```sql
CREATE TABLE skip_idx_multiple
(
    `key` UInt32,
    `date` Date,
    `time` DateTime,
    `created_at` DateTime,
    `inserted_at` DateTime
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(date)
ORDER BY (key, time);

INSERT INTO skip_idx_multiple SELECT
    number,
    toDate(x),
    now() + intDiv(number, 10) AS x,
    x - (rand() % 100),
    x + (rand() % 100)
FROM numbers(100000000);


SELECT count()
FROM skip_idx_multiple
WHERE date > (now() + toIntervalDay(105));

1 rows in set. Elapsed: 0.048 sec. Processed 14.02 million rows, 28.04 MB
(290.96 million rows/s., 581.92 MB/s.)

SELECT count()
FROM skip_idx_multiple
WHERE time > (now() + toIntervalDay(105));

1 rows in set. Elapsed: 0.188 sec. Processed 100.00 million rows, 400.00 MB
(530.58 million rows/s., 2.12 GB/s.)

SELECT count()
FROM skip_idx_multiple
WHERE created_at > (now() + toIntervalDay(105));

1 rows in set. Elapsed: 0.400 sec. Processed 100.00 million rows, 400.00 MB
(250.28 million rows/s., 1.00 GB/s.)


ALTER TABLE skip_idx_multiple ADD INDEX time_idx time TYPE minmax GRANULARITY 1000;
ALTER TABLE skip_idx_multiple MATERIALIZE INDEX time_idx;

SELECT count()
FROM skip_idx_multiple
WHERE time > (now() + toIntervalDay(105));

1 rows in set. Elapsed: 0.036 sec. Processed 14.02 million rows, 56.08 MB
(391.99 million rows/s., 1.57 GB/s.)


ALTER TABLE skip_idx_multiple ADD INDEX created_at_idx created_at TYPE minmax GRANULARITY 1000;
ALTER TABLE skip_idx_multiple MATERIALIZE INDEX created_at_idx;

SELECT count()
FROM skip_idx_multiple
WHERE created_at > (now() + toIntervalDay(105));

1 rows in set. Elapsed: 0.076 sec. Processed 14.02 million rows, 56.08 MB
(184.90 million rows/s., 739.62 MB/s.)
```

#### Condition in query trying to filter outlier value

```sql
CREATE TABLE skip_idx_outlier
(
    `key` UInt32,
    `ts` DateTime,
    `value` UInt32
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(ts)
ORDER BY (key, ts);

INSERT INTO skip_idx_outlier SELECT
    number,
    now(),
    rand() % 10
FROM numbers(10000000);

INSERT INTO skip_idx_outlier SELECT
    number,
    now(),
    20
FROM numbers(10);

SELECT count()
FROM skip_idx_outlier
WHERE value > 15;

1 rows in set. Elapsed: 0.059 sec. Processed 10.00 million rows, 40.00 MB
(170.64 million rows/s., 682.57 MB/s.)

ALTER TABLE skip_idx_outlier ADD INDEX value_idx value TYPE minmax GRANULARITY 10;
ALTER TABLE skip_idx_outlier MATERIALIZE INDEX value_idx;

SELECT count()
FROM skip_idx_outlier
WHERE value > 15;

1 rows in set. Elapsed: 0.004 sec.
```
