---
title: "-State & -Merge combinators"
linkTitle: "-State & -Merge combinators"
description: >
    -State & -Merge combinators
---

The -State combinator in ClickHouse® does not store additional information about the -If combinator, which means that aggregate functions with and without -If have the same serialized data structure. This can be verified through various examples, as demonstrated below.

**Example 1**: maxIfState and maxState
In this example, we use the maxIfState and maxState functions on a dataset of numbers, serialize the result, and merge it using the maxMerge function.

```sql
$ clickhouse-local --query "SELECT maxIfState(number,number % 2) as x, maxState(number) as y FROM numbers(10) FORMAT RowBinary" | clickhouse-local --input-format RowBinary --structure="x AggregateFunction(max,UInt64), y AggregateFunction(max,UInt64)" --query "SELECT maxMerge(x), maxMerge(y) FROM table"
9       9
$ clickhouse-local --query "SELECT maxIfState(number,number % 2) as x, maxState(number) as y FROM numbers(11) FORMAT RowBinary" | clickhouse-local --input-format RowBinary --structure="x AggregateFunction(max,UInt64), y AggregateFunction(max,UInt64)" --query "SELECT maxMerge(x), maxMerge(y) FROM table"
9       10
```

In both cases, the -State combinator results in identical serialized data footprints, regardless of the conditions in the -If variant. The maxMerge function merges the state without concern for the original -If condition.

**Example 2**: quantilesTDigestIfState
Here, we use the quantilesTDigestIfState function to demonstrate that functions like quantile-based and sequence matching functions follow the same principle regarding serialized data consistency.


```sql
$ clickhouse-local --query "SELECT quantilesTDigestIfState(0.1,0.9)(number,number % 2) FROM  numbers(1000000) FORMAT RowBinary" | clickhouse-local --input-format RowBinary --structure="x AggregateFunction(quantileTDigestWeighted(0.5),UInt64,UInt8)" --query "SELECT quantileTDigestWeightedMerge(0.4)(x) FROM table"
400000

$ clickhouse-local --query "SELECT quantilesTDigestIfState(0.1,0.9)(number,number % 2) FROM  numbers(1000000) FORMAT RowBinary" | clickhouse-local --input-format RowBinary --structure="x AggregateFunction(quantilesTDigestWeighted(0.5),UInt64,UInt8)" --query "SELECT quantilesTDigestWeightedMerge(0.4,0.8)(x) FROM table"
[400000,800000]

```

**Example 3**: Quantile Functions with -Merge
This example shows how the quantileState and quantileMerge functions work together to calculate a specific quantile.

```sql
SELECT quantileMerge(0.9)(x)
FROM
(
    SELECT quantileState(0.1)(number) AS x
    FROM numbers(1000)
)

┌─quantileMerge(0.9)(x)─┐
│                 899.1 │
└───────────────────────┘
```

**Example 4**: sequenceMatch and sequenceCount Functions with -Merge
Finally, we demonstrate the behavior of sequenceMatchState and sequenceMatchMerge, as well as sequenceCountState and sequenceCountMerge, in ClickHouse.

```sql
SELECT
    sequenceMatchMerge('(?2)(?3)')(x) AS `2_3`,
    sequenceMatchMerge('(?1)(?4)')(x) AS `1_4`,
    sequenceMatchMerge('(?1)(?2)(?3)')(x) AS `1_2_3`
FROM
(
    SELECT sequenceMatchState('(?1)(?2)(?3)')(number, number = 8, number = 5, number = 6, number = 9) AS x
    FROM numbers(10)
)

┌─2_3─┬─1_4─┬─1_2_3─┐
│   1 │   1 │     0 │
└─────┴─────┴───────┘
```

Similarly, sequenceCountState and sequenceCountMerge functions behave consistently when merging states:

```sql

SELECT
    sequenceCountMerge('(?1)(?2)')(x) AS `2_3`,
    sequenceCountMerge('(?1)(?4)')(x) AS `1_4`,
    sequenceCountMerge('(?1)(?2)(?3)')(x) AS `1_2_3`
FROM
(
    WITH number % 4 AS cond
    SELECT sequenceCountState('(?1)(?2)(?3)')(number, cond = 1, cond = 2, cond = 3, cond = 5) AS x
    FROM numbers(11)
)

┌─2_3─┬─1_4─┬─1_2_3─┐
│   3 │   0 │     2 │
└─────┴─────┴───────┘
```
ClickHouse's -State combinator stores serialized data in a consistent manner, irrespective of conditions used with -If. The same applies to a wide range of functions, including quantile and sequence-based functions. This behavior ensures that functions like maxMerge, quantileMerge, sequenceMatchMerge, and sequenceCountMerge work seamlessly, even across varied inputs.
