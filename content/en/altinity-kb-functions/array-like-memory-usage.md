---
title: "arrayMap, arrayJoin or ARRAY JOIN memory usage"
linkTitle: "arrayMap, arrayJoin or ARRAY JOIN memory usage"
description: >
    Why arrayMap, arrayFilter, arrayJoin use so much memory?
---

## arrayMap-like functions memory usage calculation.

In order to calculate arrayMap or similar array* functions ClickHouse temporarily does arrayJoin-like operation, which in certain conditions can lead to huge memory usage for big arrays.

So for example, you have 2 columns:

```sql
SELECT *
FROM
(
    SELECT
        [1, 2, 3, 4, 5] AS array_1,
        [1, 2, 3, 4, 5] AS array_2
)

┌─array_1─────┬─array_2─────┐
│ [1,2,3,4,5] │ [1,2,3,4,5] │
└─────────────┴─────────────┘
```

Let's say we want to multiply array elements at corresponding positions.

```sql
SELECT arrayMap(x -> ((array_1[x]) * (array_2[x])), arrayEnumerate(array_1)) AS multi
FROM
(
    SELECT
        [1, 2, 3, 4, 5] AS array_1,
        [1, 2, 3, 4, 5] AS array_2
)

┌─multi─────────┐
│ [1,4,9,16,25] │
└───────────────┘
```

ClickHouse create temporary structure in memory like this:

```sql
SELECT
    array_1,
	array_2,
    x
FROM
(
    SELECT
        [1, 2, 3, 4, 5] AS array_1,
        [1, 2, 3, 4, 5] AS array_2
)
ARRAY JOIN arrayEnumerate(array_1) AS x

┌─array_1─────┬─array_2─────┬─x─┐
│ [1,2,3,4,5] │ [1,2,3,4,5] │ 1 │
│ [1,2,3,4,5] │ [1,2,3,4,5] │ 2 │
│ [1,2,3,4,5] │ [1,2,3,4,5] │ 3 │
│ [1,2,3,4,5] │ [1,2,3,4,5] │ 4 │
│ [1,2,3,4,5] │ [1,2,3,4,5] │ 5 │
└─────────────┴─────────────┴───┘
```

We can roughly estimate memory usage by multiplying the size of columns participating in the lambda function by the size of the unnested array.

And total memory usage will be 55 values (5(array size)*2(array count)*5(row count) + 5(unnested array size)), which is 5.5 times more than initial array size.

```sql
SELECT groupArray((array_1[x]) * (array_2[x])) AS multi
FROM
(
    SELECT
        array_1,
        array_2,
        x
    FROM
    (
        SELECT
            [1, 2, 3, 4, 5] AS array_1,
            [1, 2, 3, 4, 5] AS array_2
    )
ARRAY JOIN arrayEnumerate(array_1) AS x
)

┌─multi─────────┐
│ [1,4,9,16,25] │
└───────────────┘
```

But what if we write this function in a more logical way, so we wouldn't use any unnested arrays in lambda.

```sql
SELECT arrayMap((x, y) -> (x * y), array_1, array_2) AS multi
FROM
(
    SELECT
        [1, 2, 3, 4, 5] AS array_1,
        [1, 2, 3, 4, 5] AS array_2
)

┌─multi─────────┐
│ [1,4,9,16,25] │
└───────────────┘
```

ClickHouse create temporary structure in memory like this:

```sql
SELECT
    x,
    y
FROM
(
    SELECT
        [1, 2, 3, 4, 5] AS array_1,
        [1, 2, 3, 4, 5] AS array_2
)
ARRAY JOIN
    array_1 AS x,
    array_2 AS y

┌─x─┬─y─┐
│ 1 │ 1 │
│ 2 │ 2 │
│ 3 │ 3 │
│ 4 │ 4 │
│ 5 │ 5 │
└───┴───┘
```

We have only 10 values, which is no more than what we have in initial arrays.

```sql
SELECT groupArray(x * y) AS multi
FROM
(
    SELECT
        x,
        y
    FROM
    (
        SELECT
            [1, 2, 3, 4, 5] AS array_1,
            [1, 2, 3, 4, 5] AS array_2
    )
ARRAY JOIN
        array_1 AS x,
        array_2 AS y
)

┌─multi─────────┐
│ [1,4,9,16,25] │
└───────────────┘
```

The same approach can be applied to other array* function with arrayMap-like capabilities to use lambda functions and ARRAY JOIN (arrayJoin).


## Examples with bigger arrays:

```sql
SET max_threads=1;
SET send_logs_level='trace';

SELECT arrayMap(x -> ((array_1[x]) * (array_2[x])), arrayEnumerate(array_1)) AS multi
FROM
(
    WITH 100 AS size
    SELECT
        materialize(CAST(range(size), 'Array(UInt32)')) AS array_1,
        materialize(CAST(range(size), 'Array(UInt32)')) AS array_2
    FROM numbers(100000000)
)
FORMAT `Null`

<Debug> MemoryTracker: Current memory usage (for query): 8.13 GiB. 

size=100, (2*size)*size = 2*(size^2)

Elapsed: 24.879 sec. Processed 524.04 thousand rows, 4.19 MB (21.06 thousand rows/s., 168.51 KB/s.)

SELECT arrayMap(x -> ((array_1[x]) * (array_2[x])), arrayEnumerate(array_1)) AS multi
FROM
(
    WITH 100 AS size
    SELECT
        materialize(CAST(range(2*size), 'Array(UInt32)')) AS array_1,
        materialize(CAST(range(size), 'Array(UInt32)')) AS array_2
    FROM numbers(100000000)
)
FORMAT `Null`

<Debug> MemoryTracker: Current memory usage (for query): 24.28 GiB.

size=100, (3*size)*2*size = 6*(size^2)

Elapsed: 71.547 sec. Processed 524.04 thousand rows, 4.19 MB (7.32 thousand rows/s., 58.60 KB/s.)


SELECT arrayMap(x -> ((array_1[x]) * (array_2[x])), arrayEnumerate(array_1)) AS multi
FROM
(
    WITH 100 AS size
    SELECT
        materialize(CAST(range(size), 'Array(UInt32)')) AS array_1,
        materialize(CAST(range(2*size), 'Array(UInt32)')) AS array_2
    FROM numbers(100000000)
)
FORMAT `Null`


<Debug> MemoryTracker: Current memory usage (for query): 12.19 GiB.

size=100, (3*size)*size = 3*(size^2)

Elapsed: 36.777 sec. Processed 524.04 thousand rows, 4.19 MB (14.25 thousand rows/s., 113.99 KB/s.)
```

Which data types we have in those arrays?

```sql
WITH 100 AS size
SELECT
    toTypeName(materialize(CAST(range(size), 'Array(UInt32)'))) AS array_1,
    toTypeName(materialize(CAST(range(2 * size), 'Array(UInt32)'))) AS array_2,
    toTypeName(arrayEnumerate(materialize(CAST(range(size), 'Array(UInt32)')))) AS x

┌─array_1───────┬─array_2───────┬─x─────────────┐
│ Array(UInt32) │ Array(UInt32) │ Array(UInt32) │
└───────────────┴───────────────┴───────────────┘
```

So each value use 4 bytes.

By default ClickHouse execute query by blocks of 65515 rows (`max_block_size` setting value)

Lets estimate query total memory usage given previous calculations.

```sql
WITH
    100 AS size,
    4 AS value_size,
    65515 AS max_block_size
SELECT
    array_1_multiplier,
    array_2_multiplier,
    formatReadableSize(((value_size * max_block_size) * ((array_1_multiplier * size) + (array_2_multiplier * size))) * (array_1_multiplier * size) AS estimated_memory_usage_bytes) AS estimated_memory_usage,
    real_memory_usage,
    round(estimated_memory_usage_bytes / (real_memory_usage * 1073741824), 2) AS ratio
FROM
(
    WITH arrayJoin([(1, 1, 8.13), (2, 1, 24.28), (1, 2, 12.19)]) AS tpl
    SELECT
        tpl.1 AS array_1_multiplier,
        tpl.2 AS array_2_multiplier,
        tpl.3 AS real_memory_usage
)

┌─array_1_multiplier─┬─array_2_multiplier─┬─estimated_memory_usage─┬─real_memory_usage─┬─ratio─┐
│                  1 │                  1 │ 4.88 GiB               │              8.13 │   0.6 │
│                  2 │                  1 │ 14.64 GiB              │             24.28 │   0.6 │
│                  1 │                  2 │ 7.32 GiB               │             12.19 │   0.6 │
└────────────────────┴────────────────────┴────────────────────────┴───────────────────┴───────┘
```

Correlation is pretty clear.

What if we will reduce size of blocks used for query execution?

```sql
SET max_block_size = '16k';

SELECT arrayMap(x -> ((array_1[x]) * (array_2[x])), arrayEnumerate(array_1)) AS multi
FROM
(
    WITH 100 AS size
    SELECT
        materialize(CAST(range(size), 'Array(UInt32)')) AS array_1,
        materialize(CAST(range(2 * size), 'Array(UInt32)')) AS array_2
    FROM numbers(100000000)
)
FORMAT `Null`

<Debug> MemoryTracker: Current memory usage (for query): 3.05 GiB.

Elapsed: 35.935 sec. Processed 512.00 thousand rows, 4.10 MB (14.25 thousand rows/s., 113.98 KB/s.)
```

Memory usage down in 4 times, which has strong correlation with our change: 65k -> 16k ~ 4 times.

```sql
SELECT arrayMap((x, y) -> (x * y), array_1, array_2) AS multi
FROM
(
    WITH 100 AS size
    SELECT
        materialize(CAST(range(size), 'Array(UInt32)')) AS array_1,
        materialize(CAST(range(size), 'Array(UInt32)')) AS array_2
    FROM numbers(100000000)
)
FORMAT `Null`

<Debug> MemoryTracker: Peak memory usage (for query): 226.04 MiB.

Elapsed: 5.700 sec. Processed 11.53 million rows, 92.23 MB (2.02 million rows/s., 16.18 MB/s.)
```

Almost 100 times faster than first query!
