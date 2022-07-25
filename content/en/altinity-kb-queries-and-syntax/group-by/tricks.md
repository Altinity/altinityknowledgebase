---
title: "GROUP BY tricks"
linkTitle: "GROUP BY tricks"
weight: 100
description: >-
     Tricks for GROUP BY memory usage optimization
---

## Tricks

Testing dataset

```sql
CREATE TABLE sessions
(
    `app` LowCardinality(String),
    `user_id` String,
    `created_at` DateTime,
    `platform` LowCardinality(String),
    `clicks` UInt32,
    `session_id` UUID
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(created_at)
ORDER BY (app, user_id, session_id, created_at)

INSERT INTO sessions WITH
    CAST(number % 4, 'Enum8(\'Orange\' = 0, \'Melon\' = 1, \'Red\' = 2, \'Blue\' = 3)') AS app,
    concat('UID: ', leftPad(toString(number % 20000000), 8, '0')) AS user_id,
    toDateTime('2021-10-01 10:11:12') + (number / 300) AS created_at,
    CAST((number + 14) % 3, 'Enum8(\'Bat\' = 0, \'Mice\' = 1, \'Rat\' = 2)') AS platform,
    number % 17 AS clicks,
    generateUUIDv4() AS session_id
SELECT
    app,
    user_id,
    created_at,
    platform,
    clicks,
    session_id
FROM numbers_mt(1000000000)

0 rows in set. Elapsed: 46.078 sec. Processed 1.00 billion rows, 8.00 GB (21.70 million rows/s., 173.62 MB/s.)

┌─database─┬─table────┬─column─────┬─type───────────────────┬───────rows─┬─compressed_bytes─┬─compressed─┬─uncompressed─┬──────────────ratio─┬─codec─┐
│ default  │ sessions │ session_id │ UUID                   │ 1000000000 │      16065918103 │ 14.96 GiB  │ 14.90 GiB    │ 0.9958970223439835 │       │
│ default  │ sessions │ user_id    │ String                 │ 1000000000 │       3056977462 │ 2.85 GiB   │ 13.04 GiB    │   4.57968701896828 │       │
│ default  │ sessions │ clicks     │ UInt32                 │ 1000000000 │       1859359032 │ 1.73 GiB   │ 3.73 GiB     │  2.151278979023993 │       │
│ default  │ sessions │ created_at │ DateTime               │ 1000000000 │       1332089630 │ 1.24 GiB   │ 3.73 GiB     │ 3.0028009451586226 │       │
│ default  │ sessions │ platform   │ LowCardinality(String) │ 1000000000 │        329702248 │ 314.43 MiB │ 956.63 MiB   │  3.042446801879252 │       │
│ default  │ sessions │ app        │ LowCardinality(String) │ 1000000000 │          4825544 │ 4.60 MiB   │ 956.63 MiB   │ 207.87333386660654 │       │
└──────────┴──────────┴────────────┴────────────────────────┴────────────┴──────────────────┴────────────┴──────────────┴────────────────────┴───────┘
```



All queries and datasets are unique, so in different situations different hacks could work better or worsen.

### PreFilter values before GROUP BY

```sql
SELECT
    user_id,
    sum(clicks)
FROM sessions
WHERE created_at > '2021-11-01 00:00:00'
GROUP BY user_id
HAVING (argMax(clicks, created_at) = 16) AND (argMax(platform, created_at) = 'Rat')
FORMAT `Null`


<Debug> MemoryTracker: Peak memory usage (for query): 18.36 GiB.

SELECT
    user_id,
    sum(clicks)
FROM sessions
WHERE user_id IN (
    SELECT user_id
    FROM sessions
    WHERE (platform = 'Rat') AND (clicks = 16) AND (created_at > '2021-11-01 00:00:00') -- So we will select user_id which could potentially match our HAVING clause in OUTER query.
) AND (created_at > '2021-11-01 00:00:00')
GROUP BY user_id
HAVING (argMax(clicks, created_at) = 16) AND (argMax(platform, created_at) = 'Rat')
FORMAT `Null`

<Debug> MemoryTracker: Peak memory usage (for query): 4.43 GiB.
```


### Use Fixed-width data types instead of String 

EG you have 2 strings which has values in special form like this

'ABX 1412312312313' 

You can just remove 4 first characters and convert rest of them to UInt64

toUInt64(substr('ABX 1412312312313',5))

And you packed 17 bytes in 8, more than 2 times the improvement of size!


```sql
SELECT
    user_id,
    sum(clicks)
FROM sessions
GROUP BY
    user_id,
    platform
FORMAT `Null`

Aggregator: Aggregation method: serialized

<Debug> MemoryTracker: Peak memory usage (for query): 28.19 GiB.

Elapsed: 7.375 sec. Processed 1.00 billion rows, 27.00 GB (135.60 million rows/s., 3.66 GB/s.)

WITH
    CAST(user_id, 'FixedString(14)') AS user_fx,
    CAST(platform, 'FixedString(4)') AS platform_fx
SELECT
    user_fx,
    sum(clicks)
FROM sessions
GROUP BY
    user_fx,
    platform_fx
FORMAT `Null`

Aggregator: Aggregation method: keys256

MemoryTracker: Peak memory usage (for query): 22.24 GiB.

Elapsed: 6.637 sec. Processed 1.00 billion rows, 27.00 GB (150.67 million rows/s., 4.07 GB/s.)

WITH
    CAST(user_id, 'FixedString(14)') AS user_fx,
    CAST(platform, 'Enum8(\'Rat\' = 1, \'Mice\' = 2, \'Bat\' = 0)') AS platform_enum
SELECT
    user_fx,
    sum(clicks)
FROM sessions
GROUP BY
    user_fx,
    platform_enum
FORMAT `Null`

Aggregator: Aggregation method: keys128

MemoryTracker: Peak memory usage (for query): 14.14 GiB.

Elapsed: 5.335 sec. Processed 1.00 billion rows, 27.00 GB (187.43 million rows/s., 5.06 GB/s.)

WITH
    toUInt32OrZero(trim( LEADING '0' FROM substr(user_id,6))) AS user_int,
    CAST(platform, 'Enum8(\'Rat\' = 1, \'Mice\' = 2, \'Bat\' = 0)') AS platform_enum
SELECT
    user_int,
    sum(clicks)
FROM sessions
GROUP BY
    user_int,
    platform_enum
FORMAT `Null`

Aggregator: Aggregation method: keys64

MemoryTracker: Peak memory usage (for query): 10.14 GiB.

Elapsed: 8.549 sec. Processed 1.00 billion rows, 27.00 GB (116.97 million rows/s., 3.16 GB/s.)


WITH
    toUInt32('1' || substr(user_id,6)) AS user_int,
    CAST(platform, 'Enum8(\'Rat\' = 1, \'Mice\' = 2, \'Bat\' = 0)') AS platform_enum
SELECT
    user_int,
    sum(clicks)
FROM sessions
GROUP BY
    user_int,
    platform_enum
FORMAT `Null`

Aggregator: Aggregation method: keys64

Peak memory usage (for query): 10.14 GiB.

Elapsed: 6.247 sec. Processed 1.00 billion rows, 27.00 GB (160.09 million rows/s., 4.32 GB/s.)


```

It can be especially useful when you tries to do GROUP BY lc_column_1, lc_column_2 and ClickHouse falls back to serialized algorytm.


### Two LowCardinality Columns in GROUP BY 

```sql
SELECT
    app,
    sum(clicks)
FROM sessions
GROUP BY app
FORMAT `Null`

Aggregator: Aggregation method: low_cardinality_key_string

MemoryTracker: Peak memory usage (for query): 43.81 MiB.

Elapsed: 0.545 sec. Processed 1.00 billion rows, 5.00 GB (1.83 billion rows/s., 9.17 GB/s.)

SELECT
    app,
    platform,
    sum(clicks)
FROM sessions
GROUP BY
    app,
    platform
FORMAT `Null`

Aggregator: Aggregation method: serialized -- Slowest method!

MemoryTracker: Peak memory usage (for query): 222.86 MiB.

Elapsed: 2.923 sec. Processed 1.00 billion rows, 6.00 GB (342.11 million rows/s., 2.05 GB/s.)

SELECT
    CAST(app, 'FixedString(6)') AS app_fx,
    CAST(platform, 'FixedString(4)') AS platform_fx,
    sum(clicks)
FROM sessions
GROUP BY
    app_fx,
    platform_fx
FORMAT `Null`

Aggregator: Aggregation method: keys128

MemoryTracker: Peak memory usage (for query): 160.23 MiB.

Elapsed: 1.632 sec. Processed 1.00 billion rows, 6.00 GB (612.63 million rows/s., 3.68 GB/s.)
```


### Split your query in multiple smaller queries and execute them one BY one

```sql
SELECT
    user_id,
    sum(clicks)
FROM sessions
GROUP BY
    user_id,
    platform
FORMAT `Null`

MemoryTracker: Peak memory usage (for query): 28.19 GiB.

Elapsed: 7.375 sec. Processed 1.00 billion rows, 27.00 GB (135.60 million rows/s., 3.66 GB/s.)


SELECT
    user_id,
    sum(clicks)
FROM sessions
WHERE (cityHash64(user_id) % 4) = 0
GROUP BY
    user_id,
    platform
FORMAT `Null`

MemoryTracker: Peak memory usage (for query): 8.16 GiB.

Elapsed: 2.910 sec. Processed 1.00 billion rows, 27.00 GB (343.64 million rows/s., 9.28 GB/s.)


```
### Shard your data by one of common high cardinal GROUP BY key

So on each shard you will have 1/N of all unique combination and this will result in smaller hash table.

Lets create 2 distributed tables with different distribution: rand() and by user_id

```sql
CREATE TABLE sessions_distributed AS sessions
ENGINE = Distributed('distr-groupby', default, sessions, rand());

INSERT INTO sessions_distributed WITH
    CAST(number % 4, 'Enum8(\'Orange\' = 0, \'Melon\' = 1, \'Red\' = 2, \'Blue\' = 3)') AS app,
    concat('UID: ', leftPad(toString(number % 20000000), 8, '0')) AS user_id,
    toDateTime('2021-10-01 10:11:12') + (number / 300) AS created_at,
    CAST((number + 14) % 3, 'Enum8(\'Bat\' = 0, \'Mice\' = 1, \'Rat\' = 2)') AS platform,
    number % 17 AS clicks,
    generateUUIDv4() AS session_id
SELECT
    app,
    user_id,
    created_at,
    platform,
    clicks,
    session_id
FROM numbers_mt(1000000000);

CREATE TABLE sessions_2 ON CLUSTER 'distr-groupby'
(
    `app` LowCardinality(String),
    `user_id` String,
    `created_at` DateTime,
    `platform` LowCardinality(String),
    `clicks` UInt32,
    `session_id` UUID
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(created_at)
ORDER BY (app, user_id, session_id, created_at);

CREATE TABLE sessions_distributed_2 AS sessions
ENGINE = Distributed('distr-groupby', default, sessions_2, cityHash64(user_id));

INSERT INTO sessions_distributed_2 WITH
    CAST(number % 4, 'Enum8(\'Orange\' = 0, \'Melon\' = 1, \'Red\' = 2, \'Blue\' = 3)') AS app,
    concat('UID: ', leftPad(toString(number % 20000000), 8, '0')) AS user_id,
    toDateTime('2021-10-01 10:11:12') + (number / 300) AS created_at,
    CAST((number + 14) % 3, 'Enum8(\'Bat\' = 0, \'Mice\' = 1, \'Rat\' = 2)') AS platform,
    number % 17 AS clicks,
    generateUUIDv4() AS session_id
SELECT
    app,
    user_id,
    created_at,
    platform,
    clicks,
    session_id
FROM numbers_mt(1000000000);
```

```sql
SELECT
    app,
    platform,
    sum(clicks)
FROM
(
    SELECT
        argMax(app, created_at) AS app,
        argMax(platform, created_at) AS platform,
        user_id,
        argMax(clicks, created_at) AS clicks
    FROM sessions_distributed
    GROUP BY user_id
)
GROUP BY
    app,
    platform;

[chi-distr-groupby-distr-groupby-0-0-0] MemoryTracker: Current memory usage (for query): 12.02 GiB.
[chi-distr-groupby-distr-groupby-1-0-0] MemoryTracker: Current memory usage (for query): 12.05 GiB.
[chi-distr-groupby-distr-groupby-2-0-0] MemoryTracker: Current memory usage (for query): 12.05 GiB.

MemoryTracker: Peak memory usage (for query): 12.20 GiB.

12 rows in set. Elapsed: 28.345 sec. Processed 1.00 billion rows, 32.00 GB (35.28 million rows/s., 1.13 GB/s.)

SELECT
    app,
    platform,
    sum(clicks)
FROM
(
    SELECT
        argMax(app, created_at) AS app,
        argMax(platform, created_at) AS platform,
        user_id,
        argMax(clicks, created_at) AS clicks
    FROM sessions_distributed_2
    GROUP BY user_id
)
GROUP BY
    app,
    platform;

[chi-distr-groupby-distr-groupby-0-0-0] MemoryTracker: Current memory usage (for query): 5.05 GiB.
[chi-distr-groupby-distr-groupby-1-0-0] MemoryTracker: Current memory usage (for query): 5.05 GiB.
[chi-distr-groupby-distr-groupby-2-0-0] MemoryTracker: Current memory usage (for query): 5.05 GiB.

MemoryTracker: Peak memory usage (for query): 5.61 GiB.

12 rows in set. Elapsed: 11.952 sec. Processed 1.00 billion rows, 32.00 GB (83.66 million rows/s., 2.68 GB/s.)

SELECT
    app,
    platform,
    sum(clicks)
FROM
(
    SELECT
        argMax(app, created_at) AS app,
        argMax(platform, created_at) AS platform,
        user_id,
        argMax(clicks, created_at) AS clicks
    FROM sessions_distributed_2
    GROUP BY user_id
)
GROUP BY
    app,
    platform
SETTINGS optimize_distributed_group_by_sharding_key = 1

[chi-distr-groupby-distr-groupby-0-0-0] MemoryTracker: Current memory usage (for query): 5.05 GiB.
[chi-distr-groupby-distr-groupby-1-0-0] MemoryTracker: Current memory usage (for query): 5.05 GiB.
[chi-distr-groupby-distr-groupby-2-0-0] MemoryTracker: Current memory usage (for query): 5.05 GiB.
MemoryTracker: Peak memory usage (for query): 5.61 GiB.

12 rows in set. Elapsed: 11.916 sec. Processed 1.00 billion rows, 32.00 GB (83.92 million rows/s., 2.69 GB/s.)


SELECT
    app,
    platform,
    sum(clicks)
FROM cluster('distr-groupby', view(
    SELECT
        app,
        platform,
        sum(clicks) as clicks
    FROM
    (
        SELECT
            argMax(app, created_at) AS app,
            argMax(platform, created_at) AS platform,
            user_id,
            argMax(clicks, created_at) AS clicks
        FROM sessions_2
        GROUP BY user_id
    )
    GROUP BY
        app,
        platform
))
GROUP BY
    app,
    platform;

[chi-distr-groupby-distr-groupby-0-0-0] MemoryTracker: Current memory usage (for query): 5.05 GiB.
[chi-distr-groupby-distr-groupby-1-0-0] MemoryTracker: Current memory usage (for query): 5.05 GiB.
[chi-distr-groupby-distr-groupby-2-0-0] MemoryTracker: Current memory usage (for query): 5.05 GiB.

MemoryTracker: Peak memory usage (for query): 5.55 GiB.

12 rows in set. Elapsed: 9.491 sec. Processed 1.00 billion rows, 32.00 GB (105.36 million rows/s., 3.37 GB/s.)
```

Query with bigger state:


```sql

SELECT
    app,
    platform,
    sum(last_click) as sum,
    max(max_clicks) as max,
    min(min_clicks) as min,
    max(max_time) as max_time,
    min(min_time) as min_time
FROM
(
    SELECT
        argMax(app, created_at) AS app,
        argMax(platform, created_at) AS platform,
        user_id,
        argMax(clicks, created_at) AS last_click,
        max(clicks) AS max_clicks,
        min(clicks) AS min_clicks,
        max(created_at) AS max_time,
        min(created_at) AS min_time
    FROM sessions_distributed
    GROUP BY user_id
)
GROUP BY
    app,
    platform;

MemoryTracker: Peak memory usage (for query): 19.95 GiB.
12 rows in set. Elapsed: 34.339 sec. Processed 1.00 billion rows, 32.00 GB (29.12 million rows/s., 932.03 MB/s.)

SELECT
    app,
    platform,
    sum(last_click) as sum,
    max(max_clicks) as max,
    min(min_clicks) as min,
    max(max_time) as max_time,
    min(min_time) as min_time
FROM
(
    SELECT
        argMax(app, created_at) AS app,
        argMax(platform, created_at) AS platform,
        user_id,
        argMax(clicks, created_at) AS last_click,
        max(clicks) AS max_clicks,
        min(clicks) AS min_clicks,
        max(created_at) AS max_time,
        min(created_at) AS min_time
    FROM sessions_distributed_2
    GROUP BY user_id
)
GROUP BY
    app,
    platform;


MemoryTracker: Peak memory usage (for query): 10.09 GiB.

12 rows in set. Elapsed: 13.220 sec. Processed 1.00 billion rows, 32.00 GB (75.64 million rows/s., 2.42 GB/s.)

SELECT
    app,
    platform,
    sum(last_click) AS sum,
    max(max_clicks) AS max,
    min(min_clicks) AS min,
    max(max_time) AS max_time,
    min(min_time) AS min_time
FROM
(
    SELECT
        argMax(app, created_at) AS app,
        argMax(platform, created_at) AS platform,
        user_id,
        argMax(clicks, created_at) AS last_click,
        max(clicks) AS max_clicks,
        min(clicks) AS min_clicks,
        max(created_at) AS max_time,
        min(created_at) AS min_time
    FROM sessions_distributed_2
    GROUP BY user_id
)
GROUP BY
    app,
    platform
SETTINGS optimize_distributed_group_by_sharding_key = 1;

MemoryTracker: Peak memory usage (for query): 10.09 GiB.

12 rows in set. Elapsed: 13.361 sec. Processed 1.00 billion rows, 32.00 GB (74.85 million rows/s., 2.40 GB/s.)

SELECT
    app,
    platform,
    sum(last_click) AS sum,
    max(max_clicks) AS max,
    min(min_clicks) AS min,
    max(max_time) AS max_time,
    min(min_time) AS min_time
FROM
(
    SELECT
        argMax(app, created_at) AS app,
        argMax(platform, created_at) AS platform,
        user_id,
        argMax(clicks, created_at) AS last_click,
        max(clicks) AS max_clicks,
        min(clicks) AS min_clicks,
        max(created_at) AS max_time,
        min(created_at) AS min_time
    FROM sessions_distributed_2
    GROUP BY user_id
)
GROUP BY
    app,
    platform
SETTINGS distributed_group_by_no_merge=2;

MemoryTracker: Peak memory usage (for query): 10.02 GiB.

12 rows in set. Elapsed: 9.789 sec. Processed 1.00 billion rows, 32.00 GB (102.15 million rows/s., 3.27 GB/s.)

SELECT
    app,
    platform,
    sum(sum),
    max(max),
    min(min),
    max(max_time) AS max_time,
    min(min_time) AS min_time
FROM cluster('distr-groupby', view(
    SELECT
        app,
        platform,
        sum(last_click) AS sum,
        max(max_clicks) AS max,
        min(min_clicks) AS min,
        max(max_time) AS max_time,
        min(min_time) AS min_time
    FROM
    (
        SELECT
            argMax(app, created_at) AS app,
            argMax(platform, created_at) AS platform,
            user_id,
            argMax(clicks, created_at) AS last_click,
            max(clicks) AS max_clicks,
            min(clicks) AS min_clicks,
            max(created_at) AS max_time,
            min(created_at) AS min_time
        FROM sessions_2
        GROUP BY user_id
    )
    GROUP BY
        app,
        platform
))
GROUP BY
    app,
    platform;

MemoryTracker: Peak memory usage (for query): 10.09 GiB.

12 rows in set. Elapsed: 9.525 sec. Processed 1.00 billion rows, 32.00 GB (104.98 million rows/s., 3.36 GB/s.)
```

```sql

SELECT
    app,
    platform,
    sum(sessions)
FROM
(
    SELECT
        argMax(app, created_at) AS app,
        argMax(platform, created_at) AS platform,
        user_id,
        uniq(session_id) as sessions
    FROM sessions_distributed_2
    GROUP BY user_id
)
GROUP BY
    app,
    platform

MemoryTracker: Peak memory usage (for query): 14.57 GiB.
12 rows in set. Elapsed: 37.730 sec. Processed 1.00 billion rows, 44.01 GB (26.50 million rows/s., 1.17 GB/s.)


SELECT
    app,
    platform,
    sum(sessions)
FROM
(
    SELECT
        argMax(app, created_at) AS app,
        argMax(platform, created_at) AS platform,
        user_id,
        uniq(session_id) as sessions
    FROM sessions_distributed_2
    GROUP BY user_id
)
GROUP BY
    app,
    platform
SETTINGS optimize_distributed_group_by_sharding_key = 1;

MemoryTracker: Peak memory usage (for query): 14.56 GiB.

12 rows in set. Elapsed: 37.792 sec. Processed 1.00 billion rows, 44.01 GB (26.46 million rows/s., 1.16 GB/s.)

SELECT
    app,
    platform,
    sum(sessions)
FROM
(
    SELECT
        argMax(app, created_at) AS app,
        argMax(platform, created_at) AS platform,
        user_id,
        uniq(session_id) as sessions
    FROM sessions_distributed_2
    GROUP BY user_id
)
GROUP BY
    app,
    platform
SETTINGS distributed_group_by_no_merge = 2;

MemoryTracker: Peak memory usage (for query): 14.54 GiB.
12 rows in set. Elapsed: 17.762 sec. Processed 1.00 billion rows, 44.01 GB (56.30 million rows/s., 2.48 GB/s.)

SELECT
    app,
    platform,
    sum(sessions)
FROM cluster('distr-groupby', view(
SELECT
    app,
    platform,
    sum(sessions) as sessions
FROM
(
    SELECT
        argMax(app, created_at) AS app,
        argMax(platform, created_at) AS platform,
        user_id,
        uniq(session_id) as sessions
    FROM sessions_2
    GROUP BY user_id
)
GROUP BY
    app,
    platform))
GROUP BY
    app,
    platform   

MemoryTracker: Peak memory usage (for query): 14.55 GiB.

12 rows in set. Elapsed: 17.574 sec. Processed 1.00 billion rows, 44.01 GB (56.90 million rows/s., 2.50 GB/s.)
```


### Reduce number of threads

Because each thread use independent hash table, if you lower thread amount it will reduce number of hash tables as well and lower memory usage at the cost of slower query execution.

```sql

SELECT
    user_id,
    sum(clicks)
FROM sessions
GROUP BY
    user_id,
    platform
FORMAT `Null`


MemoryTracker: Peak memory usage (for query): 28.19 GiB.

Elapsed: 7.375 sec. Processed 1.00 billion rows, 27.00 GB (135.60 million rows/s., 3.66 GB/s.)

SET max_threads = 2;

SELECT
    user_id,
    sum(clicks)
FROM sessions
GROUP BY
    user_id,
    platform
FORMAT `Null`

MemoryTracker: Peak memory usage (for query): 13.26 GiB.

Elapsed: 62.014 sec. Processed 1.00 billion rows, 27.00 GB (16.13 million rows/s., 435.41 MB/s.)
```

### UNION ALL


```sql

SELECT
    user_id,
    sum(clicks)
FROM sessions
GROUP BY
    app,
    user_id
FORMAT `Null`

MemoryTracker: Peak memory usage (for query): 24.19 GiB.

Elapsed: 5.043 sec. Processed 1.00 billion rows, 27.00 GB (198.29 million rows/s., 5.35 GB/s.)


SELECT
    user_id,
    sum(clicks)
FROM sessions WHERE app = 'Orange'
GROUP BY
    user_id
UNION ALL
SELECT
    user_id,
    sum(clicks)
FROM sessions WHERE app = 'Red'
GROUP BY
    user_id
UNION ALL
SELECT
    user_id,
    sum(clicks)
FROM sessions WHERE app = 'Melon'
GROUP BY
    user_id
UNION ALL
SELECT
    user_id,
    sum(clicks)
FROM sessions WHERE app = 'Blue'
GROUP BY
    user_id
FORMAT Null

MemoryTracker: Peak memory usage (for query): 7.99 GiB.

Elapsed: 2.852 sec. Processed 1.00 billion rows, 27.01 GB (350.74 million rows/s., 9.47 GB/s.)
```


### aggregation_in_order


```sql
SELECT
    user_id,
    sum(clicks)
FROM sessions
WHERE app = 'Orange'
GROUP BY user_id
FORMAT `Null`

MemoryTracker: Peak memory usage (for query): 969.33 MiB.

Elapsed: 2.494 sec. Processed 250.09 million rows, 6.75 GB (100.27 million rows/s., 2.71 GB/s.)



SET optimize_aggregation_in_order = 1;

SELECT
    user_id,
    sum(clicks)
FROM sessions
WHERE app = 'Orange'
GROUP BY
    app,
    user_id
FORMAT `Null`

AggregatingInOrderTransform: Aggregating in order

MemoryTracker: Peak memory usage (for query): 169.24 MiB.

Elapsed: 4.925 sec. Processed 250.09 million rows, 6.75 GB (50.78 million rows/s., 1.37 GB/s.)
```


### Reduce dimensions from GROUP BY with functions like sumMap, *Resample

One 

```sql
SELECT
    user_id,
    toDate(created_at) AS day,
    sum(clicks)
FROM sessions
WHERE (created_at >= toDate('2021-10-01')) AND (created_at < toDate('2021-11-01')) AND (app IN ('Orange', 'Red', 'Blue'))
GROUP BY
    user_id,
    day
FORMAT `Null`

MemoryTracker: Peak memory usage (for query): 50.74 GiB.

Elapsed: 22.671 sec. Processed 594.39 million rows, 18.46 GB (26.22 million rows/s., 814.41 MB/s.)


SELECT
    user_id,
    (toDate('2021-10-01') + date_diff) - 1 AS day,
    clicks
FROM
(
    SELECT
        user_id,
        sumResample(0, 31, 1)(clicks, toDate(created_at) - toDate('2021-10-01')) AS clicks_arr
    FROM sessions
    WHERE (created_at >= toDate('2021-10-01')) AND (created_at < toDate('2021-11-01')) AND (app IN ('Orange', 'Red', 'Blue'))
    GROUP BY user_id
)
ARRAY JOIN
    clicks_arr AS clicks,
    arrayEnumerate(clicks_arr) AS date_diff
FORMAT `Null`

Peak memory usage (for query): 8.24 GiB.

Elapsed: 5.191 sec. Processed 594.39 million rows, 18.46 GB (114.50 million rows/s., 3.56 GB/s.)
```

Multiple

```sql

SELECT
    user_id,
    platform,
    toDate(created_at) AS day,
    sum(clicks)
FROM sessions
WHERE (created_at >= toDate('2021-10-01')) AND (created_at < toDate('2021-11-01')) AND (app IN ('Orange')) AND user_id ='UID: 08525196'
GROUP BY
    user_id,
    platform,
    day
ORDER BY user_id,
    day,
    platform
FORMAT `Null`

Peak memory usage (for query): 29.50 GiB.

Elapsed: 8.181 sec. Processed 198.14 million rows, 6.34 GB (24.22 million rows/s., 775.14 MB/s.)

WITH arrayJoin(arrayZip(clicks_arr_lvl_2, range(3))) AS clicks_res
SELECT
    user_id,
    CAST(clicks_res.2 + 1, 'Enum8(\'Rat\' = 1, \'Mice\' = 2, \'Bat\' = 3)') AS platform,
    (toDate('2021-10-01') + date_diff) - 1 AS day,
    clicks_res.1 AS clicks
FROM
(
    SELECT
        user_id,
        sumResampleResample(1, 4, 1, 0, 31, 1)(clicks, CAST(platform, 'Enum8(\'Rat\' = 1, \'Mice\' = 2, \'Bat\' = 3)'), toDate(created_at) - toDate('2021-10-01')) AS clicks_arr
    FROM sessions
    WHERE (created_at >= toDate('2021-10-01')) AND (created_at < toDate('2021-11-01')) AND (app IN ('Orange'))
    GROUP BY user_id
)
ARRAY JOIN
    clicks_arr AS clicks_arr_lvl_2,
    range(31) AS date_diff
FORMAT `Null`

Peak memory usage (for query): 9.92 GiB.

Elapsed: 4.170 sec. Processed 198.14 million rows, 6.34 GB (47.52 million rows/s., 1.52 GB/s.)


WITH arrayJoin(arrayZip(clicks_arr_lvl_2, range(3))) AS clicks_res
SELECT
    user_id,
    CAST(clicks_res.2 + 1, 'Enum8(\'Rat\' = 1, \'Mice\' = 2, \'Bat\' = 3)') AS platform,
    (toDate('2021-10-01') + date_diff) - 1 AS day,
    clicks_res.1 AS clicks
FROM
(
    SELECT
        user_id,
        sumResampleResample(1, 4, 1, 0, 31, 1)(clicks, CAST(platform, 'Enum8(\'Rat\' = 1, \'Mice\' = 2, \'Bat\' = 3)'), toDate(created_at) - toDate('2021-10-01')) AS clicks_arr
    FROM sessions
    WHERE (created_at >= toDate('2021-10-01')) AND (created_at < toDate('2021-11-01')) AND (app IN ('Orange'))
    GROUP BY user_id
)
ARRAY JOIN
    clicks_arr AS clicks_arr_lvl_2,
    range(31) AS date_diff
WHERE clicks > 0
FORMAT `Null`

Peak memory usage (for query): 10.14 GiB.

Elapsed: 9.533 sec. Processed 198.14 million rows, 6.34 GB (20.78 million rows/s., 665.20 MB/s.)

SELECT
    user_id,
    CAST(plat + 1, 'Enum8(\'Rat\' = 1, \'Mice\' = 2, \'Bat\' = 3)') AS platform,
    (toDate('2021-10-01') + date_diff) - 1 AS day,
    clicks
FROM
(
    WITH
        (SELECT flatten(arrayMap(x -> range(3) AS platforms, range(31) as days))) AS platform_arr,
        (SELECT flatten(arrayMap(x -> [x, x, x], range(31) as days))) AS days_arr
    SELECT
        user_id,
        flatten(sumResampleResample(1, 4, 1, 0, 31, 1)(clicks, CAST(platform, 'Enum8(\'Rat\' = 1, \'Mice\' = 2, \'Bat\' = 3)'), toDate(created_at) - toDate('2021-10-01'))) AS clicks_arr,
        platform_arr,
        days_arr
    FROM sessions
    WHERE (created_at >= toDate('2021-10-01')) AND (created_at < toDate('2021-11-01')) AND (app IN ('Orange'))
    GROUP BY user_id
)
ARRAY JOIN
    clicks_arr AS clicks,
    platform_arr AS plat,
    days_arr AS date_diff
FORMAT `Null`

Peak memory usage (for query): 9.95 GiB.

Elapsed: 3.095 sec. Processed 198.14 million rows, 6.34 GB (64.02 million rows/s., 2.05 GB/s.)

SELECT
    user_id,
    CAST(plat + 1, 'Enum8(\'Rat\' = 1, \'Mice\' = 2, \'Bat\' = 3)') AS platform,
    (toDate('2021-10-01') + date_diff) - 1 AS day,
    clicks
FROM
(
    WITH
        (SELECT flatten(arrayMap(x -> range(3) AS platforms, range(31) as days))) AS platform_arr,
        (SELECT flatten(arrayMap(x -> [x, x, x], range(31) as days))) AS days_arr
    SELECT
        user_id,
        sumResampleResample(1, 4, 1, 0, 31, 1)(clicks, CAST(platform, 'Enum8(\'Rat\' = 1, \'Mice\' = 2, \'Bat\' = 3)'), toDate(created_at) - toDate('2021-10-01')) AS clicks_arr,
        arrayFilter(x -> ((x.1) > 0), arrayZip(flatten(clicks_arr), platform_arr, days_arr)) AS result
    FROM sessions
    WHERE (created_at >= toDate('2021-10-01')) AND (created_at < toDate('2021-11-01')) AND (app IN ('Orange'))
    GROUP BY user_id
)
ARRAY JOIN
    result.1 AS clicks,
    result.2 AS plat,
    result.3 AS date_diff
FORMAT `Null`

Peak memory usage (for query): 9.93 GiB.

Elapsed: 4.717 sec. Processed 198.14 million rows, 6.34 GB (42.00 million rows/s., 1.34 GB/s.)

SELECT
    user_id,
    CAST(range % 3, 'Enum8(\'Rat\' = 0, \'Mice\' = 1, \'Bat\' = 2)') AS platform,
    toDate('2021-10-01') + intDiv(range, 3) AS day,
    clicks
FROM
(
    WITH (
            SELECT range(93)
        ) AS range_arr
    SELECT
        user_id,
        sumResample(0, 93, 1)(clicks, ((toDate(created_at) - toDate('2021-10-01')) * 3) + toUInt8(CAST(platform, 'Enum8(\'Rat\' = 0, \'Mice\' = 1, \'Bat\' = 2)'))) AS clicks_arr,
        range_arr
    FROM sessions
    WHERE (created_at >= toDate('2021-10-01')) AND (created_at < toDate('2021-11-01')) AND (app IN ('Orange'))
    GROUP BY user_id
)
ARRAY JOIN
    clicks_arr AS clicks,
    range_arr AS range
FORMAT `Null`

Peak memory usage (for query): 8.24 GiB.

Elapsed: 4.838 sec. Processed 198.14 million rows, 6.36 GB (40.95 million rows/s., 1.31 GB/s.)

SELECT
    user_id,
    sumResampleResample(1, 4, 1, 0, 31, 1)(clicks, CAST(platform, 'Enum8(\'Rat\' = 1, \'Mice\' = 2, \'Bat\' = 3)'), toDate(created_at) - toDate('2021-10-01')) AS clicks_arr
FROM sessions
WHERE (created_at >= toDate('2021-10-01')) AND (created_at < toDate('2021-11-01')) AND (app IN ('Orange'))
GROUP BY user_id
FORMAT `Null`

Peak memory usage (for query): 5.19 GiB.

0 rows in set. Elapsed: 1.160 sec. Processed 198.14 million rows, 6.34 GB (170.87 million rows/s., 5.47 GB/s.) 

```

ARRAY JOIN can be expensive

https://kb.altinity.com/altinity-kb-functions/array-like-memory-usage/

sumMap, *Resample

https://kb.altinity.com/altinity-kb-functions/resample-vs-if-vs-map-vs-subquery/


### Play with two-level

Disable:

```sql
SET group_by_two_level_threshold = 0, group_by_two_level_threshold_bytes = 0; 
```

From 22.4 ClickHouse can predict, when it make sense to initialize aggregation with two-level from start, instead of rehashing on fly.
It can improve query time.
https://github.com/ClickHouse/ClickHouse/pull/33439

### GROUP BY in external memory

Slow

### Use hash function for GROUP BY keys

GROUP BY cityHash64('xxxx')

Can lead to incorrect results as hash functions is not 1 to 1 mapping.

### Performance bugs

https://github.com/ClickHouse/ClickHouse/issues/15005

https://github.com/ClickHouse/ClickHouse/issues/29131

https://github.com/ClickHouse/ClickHouse/issues/31120

https://github.com/ClickHouse/ClickHouse/issues/35096 Fixed in 22.7
