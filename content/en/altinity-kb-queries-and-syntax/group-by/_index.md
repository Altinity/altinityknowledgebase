---
title: "GROUP BY"
linkTitle: "GROUP BY"
keywords:
- clickhouse queries
- clickhouse group by
- clickhouse memory
description: >
    Learn about GROUP BY clause in ClickHouse.
weight: 1
---

## Internal implementation

[Code](https://github.com/ClickHouse/ClickHouse/blob/8ab5270ded39c8b044f60f73c1de00c8117ab8f2/src/Interpreters/Aggregator.cpp#L382)

ClickHouse uses non-blocking? hash tables, so each thread has at least one hash table.

It makes easier to not care about sync between multiple threads, but has such disadvantages as: 
1. Bigger memory usage.
2. Needs to merge those per-thread hash tables afterwards.


Because second step can be a bottleneck in case of a really big GROUP BY with a lot of distinct keys, another solution has been made.

## Two-Level

https://youtu.be/SrucFOs8Y6c?t=2132

```
┌─name───────────────────────────────┬─value────┬─changed─┬─description────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┬─min──┬─max──┬─readonly─┬─type───┐
│ group_by_two_level_threshold       │ 100000   │       0 │ From what number of keys, a two-level aggregation starts. 0 - the threshold is not set.                                                                                                                    │ ᴺᵁᴸᴸ │ ᴺᵁᴸᴸ │        0 │ UInt64 │
│ group_by_two_level_threshold_bytes │ 50000000 │       0 │ From what size of the aggregation state in bytes, a two-level aggregation begins to be used. 0 - the threshold is not set. Two-level aggregation is used when at least one of the thresholds is triggered. │ ᴺᵁᴸᴸ │ ᴺᵁᴸᴸ │        0 │ UInt64 │
└────────────────────────────────────┴──────────┴─────────┴────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┴──────┴──────┴──────────┴────────┘
```

In order to parallelize merging of hash tables, ie execute such merge via multiple threads, ClickHouse use two-level approach:

On the first step ClickHouse creates 256 buckets for each thread. (determined by one byte of hash function)
On the second step ClickHouse can merge those 256 buckets independently by multiple threads.

https://github.com/ClickHouse/ClickHouse/blob/1ea637d996715d2a047f8cd209b478e946bdbfb0/src/Common/HashTable/TwoLevelHashTable.h#L6


## GROUP BY in external memory

It utilizes a two-level group by and dumps those buckets on disk. And at the last stage ClickHouse will read those buckets from disk one by one and merge them. 
So you should have enough RAM to hold one bucket (1/256 of whole GROUP BY size).

https://clickhouse.com/docs/en/sql-reference/statements/select/group-by/#select-group-by-in-external-memory


## optimize_aggregation_in_order GROUP BY

Usually it works slower than regular GROUP BY, because ClickHouse need's to read and process data in specific ORDER, which makes it much more complicated to parallelize reading and aggregating.

But it use much less memory, because ClickHouse can stream resultset and there is no need to keep it in memory.

## Last item cache

ClickHouse saves value of previous hash calculation, just in case next value will be the same.

https://github.com/ClickHouse/ClickHouse/pull/5417
https://github.com/ClickHouse/ClickHouse/blob/808d9afd0f8110faba5ae027051bf0a64e506da3/src/Common/ColumnsHashingImpl.h#L40

## StringHashMap

Actually uses 5 different hash tables

1. For empty strings
2. For strings < 8 bytes
3. For strings < 16 bytes
4. For strings < 24 bytes
5. For strings > 24 bytes 

```sql
SELECT count()
FROM
(
    SELECT materialize('1234567890123456') AS key           -- length(key) = 16
    FROM numbers(1000000000)
)
GROUP BY key

Aggregator: Aggregation method: key_string

Elapsed: 8.888 sec. Processed 1.00 billion rows, 8.00 GB (112.51 million rows/s., 900.11 MB/s.)

SELECT count()
FROM
(
    SELECT materialize('12345678901234567') AS key          -- length(key) = 17
    FROM numbers(1000000000)
)
GROUP BY key

Aggregator: Aggregation method: key_string

Elapsed: 9.089 sec. Processed 1.00 billion rows, 8.00 GB (110.03 million rows/s., 880.22 MB/s.)

SELECT count()
FROM
(
    SELECT materialize('123456789012345678901234') AS key   -- length(key) = 24
    FROM numbers(1000000000)
)
GROUP BY key

Aggregator: Aggregation method: key_string

Elapsed: 9.134 sec. Processed 1.00 billion rows, 8.00 GB (109.49 million rows/s., 875.94 MB/s.)

SELECT count()
FROM
(
    SELECT materialize('1234567890123456789012345') AS key  -- length(key) = 25
    FROM numbers(1000000000)
)
GROUP BY key

Aggregator: Aggregation method: key_string

Elapsed: 12.566 sec. Processed 1.00 billion rows, 8.00 GB (79.58 million rows/s., 636.67 MB/s.)
```

length 

16       8.89
17       9.09
24       9.13
25      12.57


## For what GROUP BY statement use memory

1. Hash tables 

It will grow with:

Amount of unique combinations of keys participated in GROUP BY

Size of keys participated in GROUP BY

2. States of aggregation functions:

Be careful with function, which state can use unrestricted amount of memory and grow indefenetely:

- groupArray (groupArray(1000)())
- uniqExact  (uniq,uniqCombined)
- quantileExact (medianExact) (quantile,quantileTDigest)
- windowFunnel
- groupBitmap
- sequenceCount (sequenceMatch)
- *Map


## Why my GROUP BY eat all the RAM

1. run your query with `set send_logs_level='trace'`

2. Remove all aggregation functions from the query, try to understand how many memory simple GROUP BY will take.

3. One by one remove aggregation functions from query in order to understand which one is taking most of memory
