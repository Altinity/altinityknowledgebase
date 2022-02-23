---
title: "Use both projection and raw data in single query"
linkTitle: "partial-projection-optimization"
description: >
    How to write queries, which will use both data from projection and raw table.
---

```sql
CREATE TABLE default.metric
(
    `key_a` UInt8,
    `key_b` UInt32,
    `date` Date,
    `value` UInt32,
    PROJECTION monthly
    (
        SELECT
            key_a,
            key_b,
            min(date),
            sum(value)
        GROUP BY
            key_a,
            key_b
    )
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(date)
ORDER BY (key_a, key_b, date)
SETTINGS index_granularity = 8192;


INSERT INTO metric SELECT
    key_a,
    key_b,
    date,
    rand() % 100000 AS value
FROM
(
    SELECT
        arrayJoin(range(8)) AS key_a,
        number % 500000 AS key_b,
        today() - intDiv(number, 500000) AS date
    FROM numbers_mt(1080000000)
);

OPTIMIZE TABLE metric FINAL;

SET max_threads = 8;

WITH
    toDate('2015-02-27') AS start_date,
    toDate('2022-02-15') AS end_date,
    key_a IN (1, 3, 5, 7) AS key_a_cond
SELECT
    key_b,
    sum(value) AS sum
FROM metric
WHERE (date > start_date) AND (date < end_date) AND key_a_cond
GROUP BY key_b
ORDER BY sum DESC
LIMIT 25

25 rows in set. Elapsed: 6.561 sec. Processed 4.32 billion rows, 47.54 GB (658.70 million rows/s., 7.25 GB/s.)

WITH
    toDate('2015-02-27') AS start_date,
    toDate('2022-02-15') AS end_date,
    key_a IN (1, 3, 5, 7) AS key_a_cond
SELECT
    key_b,
    sum(value) AS sum
FROM
(
    SELECT
        key_b,
        value
    FROM metric
    WHERE indexHint(_partition_id IN CAST([toYYYYMM(start_date), toYYYYMM(end_date)], 'Array(String)')) AND (date > start_date) AND (date < end_date) AND key_a_cond
    UNION ALL
    SELECT
        key_b,
        sum(value) AS value
    FROM metric
    WHERE indexHint(_partition_id IN CAST(range(toYYYYMM(start_date) + 1, toYYYYMM(end_date)), 'Array(String)')) AND key_a_cond
    GROUP BY key_b
)
GROUP BY key_b
ORDER BY sum DESC
LIMIT 25

25 rows in set. Elapsed: 1.038 sec. Processed 181.86 million rows, 4.56 GB (175.18 million rows/s., 4.40 GB/s.)


WITH
    (toDate('2016-02-27'), toDate('2017-02-15')) AS period_1,
    (toDate('2018-05-27'), toDate('2022-08-15')) AS period_2,
    (date > (period_1.1)) AND (date < (period_1.2)) AS period_1_cond,
    (date > (period_2.1)) AND (date < (period_2.2)) AS period_2_cond,
    key_a IN (1, 3, 5, 7) AS key_a_cond
SELECT
    key_b,
    sumIf(value, period_1_cond) AS sum_per_1,
    sumIf(value, period_2_cond) AS sum_per_2
FROM metric
WHERE (period_1_cond OR period_2_cond) AND key_a_cond
GROUP BY key_b
ORDER BY sum_per_2 / sum_per_1 DESC
LIMIT 25

25 rows in set. Elapsed: 5.717 sec. Processed 3.47 billion rows, 38.17 GB (606.93 million rows/s., 6.68 GB/s.)

WITH
    (toDate('2016-02-27'), toDate('2017-02-15')) AS period_1,
    (toDate('2018-05-27'), toDate('2022-08-15')) AS period_2,
    (date > (period_1.1)) AND (date < (period_1.2)) AS period_1_cond,
    (date > (period_2.1)) AND (date < (period_2.2)) AS period_2_cond,
    CAST([toYYYYMM(period_1.1), toYYYYMM(period_1.2), toYYYYMM(period_2.1), toYYYYMM(period_2.2)], 'Array(String)') AS daily_parts,
    key_a IN (1, 3, 5, 7) AS key_a_cond
SELECT
    key_b,
    sumIf(value, period_1_cond) AS sum_per_1,
    sumIf(value, period_2_cond) AS sum_per_2
FROM
(
    SELECT
        key_b,
        date,
        value
    FROM metric
    WHERE indexHint(_partition_id IN (daily_parts)) AND (period_1_cond OR period_2_cond) AND key_a_cond
    UNION ALL
    SELECT
        key_b,
        min(date) AS date,
        sum(value) AS value
    FROM metric
    WHERE indexHint(_partition_id IN CAST(arrayConcat(range(toYYYYMM(period_1.1) + 1, toYYYYMM(period_1.2)), range(toYYYYMM(period_2.1) + 1, toYYYYMM(period_2.1))), 'Array(String)')) AND indexHint(_partition_id NOT IN (daily_parts)) AND key_a_cond
    GROUP BY
        key_b
)
GROUP BY key_b
ORDER BY sum_per_2 / sum_per_1 DESC
LIMIT 25


25 rows in set. Elapsed: 0.444 sec. Processed 140.34 million rows, 2.11 GB (316.23 million rows/s., 4.77 GB/s.)


WITH
    toDate('2022-01-03') AS start_date,
    toDate('2022-02-15') AS end_date,
    key_a IN (1, 3, 5, 7) AS key_a_cond
SELECT
    key_b,
    sum(value) AS sum
FROM metric
WHERE (date > start_date) AND (date < end_date) AND key_a_cond
GROUP BY key_b
ORDER BY sum DESC
LIMIT 25

25 rows in set. Elapsed: 0.208 sec. Processed 100.06 million rows, 1.10 GB (481.06 million rows/s., 5.29 GB/s.)


WITH
    toDate('2022-01-03') AS start_date,
    toDate('2022-02-15') AS end_date,
    key_a IN (1, 3, 5, 7) AS key_a_cond
SELECT
    key_b,
    sum(value) AS sum
FROM
(
    SELECT
        key_b,
        value
    FROM metric
    WHERE indexHint(_partition_id IN CAST([toYYYYMM(start_date), toYYYYMM(end_date)], 'Array(String)')) AND (date > start_date) AND (date < end_date) AND key_a_cond
    UNION ALL
    SELECT
        key_b,
        sum(value) AS value
    FROM metric
    WHERE indexHint(_partition_id IN CAST(range(toYYYYMM(start_date) + 1, toYYYYMM(end_date)), 'Array(String)')) AND key_a_cond
    GROUP BY key_b
)
GROUP BY key_b
ORDER BY sum DESC
LIMIT 25

25 rows in set. Elapsed: 0.216 sec. Processed 100.06 million rows, 1.10 GB (462.68 million rows/s., 5.09 GB/s.)


WITH
    toDate('2021-12-03') AS start_date,
    toDate('2022-02-15') AS end_date,
    key_a IN (1, 3, 5, 7) AS key_a_cond
SELECT
    key_b,
    sum(value) AS sum
FROM metric
WHERE (date > start_date) AND (date < end_date) AND key_a_cond
GROUP BY key_b
ORDER BY sum DESC
LIMIT 25

25 rows in set. Elapsed: 0.308 sec. Processed 162.09 million rows, 1.78 GB (526.89 million rows/s., 5.80 GB/s.)

WITH
    toDate('2021-12-03') AS start_date,
    toDate('2022-02-15') AS end_date,
    key_a IN (1, 3, 5, 7) AS key_a_cond
SELECT
    key_b,
    sum(value) AS sum
FROM
(
    SELECT
        key_b,
        value
    FROM metric
    WHERE indexHint(_partition_id IN CAST([toYYYYMM(start_date), toYYYYMM(end_date)], 'Array(String)')) AND (date > start_date) AND (date < end_date) AND key_a_cond
    UNION ALL
    SELECT
        key_b,
        sum(value) AS value
    FROM metric
    WHERE indexHint(_partition_id IN CAST(range(toYYYYMM(start_date) + 1, toYYYYMM(end_date)), 'Array(String)')) AND key_a_cond
    GROUP BY key_b
)
GROUP BY key_b
ORDER BY sum DESC
LIMIT 25

25 rows in set. Elapsed: 0.268 sec. Processed 102.08 million rows, 1.16 GB (381.46 million rows/s., 4.33 GB/s.)
```
