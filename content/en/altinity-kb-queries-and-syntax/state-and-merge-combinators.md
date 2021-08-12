---
title: "-State & -Merge combinators"
linkTitle: "-State & -Merge combinators"
description: >
    -State & -Merge combinators
---
-State combinator doesn't actually store information about -If combinator, so aggregate functions with -If and without have the same serialized data.

```sql
$ clickhouse-local --query "SELECT maxIfState(number,number % 2) as x, maxState(number) as y FROM numbers(10) FORMAT RowBinary" | clickhouse-local --input-format RowBinary --structure="x AggregateFunction(max,UInt64), y AggregateFunction(max,UInt64)" --query "SELECT maxMerge(x), maxMerge(y) FROM table"
9       9
$ clickhouse-local --query "SELECT maxIfState(number,number % 2) as x, maxState(number) as y FROM numbers(11) FORMAT RowBinary" | clickhouse-local --input-format RowBinary --structure="x AggregateFunction(max,UInt64), y AggregateFunction(max,UInt64)" --query "SELECT maxMerge(x), maxMerge(y) FROM table"
9       10
```

-State combinator have the same serialized data footprint regardless of parameters used in definition of aggregate function. That's true for quantile\* and sequenceMatch/sequenceCount functions.

```sql
$ clickhouse-local --query "SELECT quantilesTDigestIfState(0.1,0.9)(number,number % 2) FROM  numbers(1000000) FORMAT RowBinary" | clickhouse-local --input-format RowBinary --structure="x AggregateFunction(quantileTDigestWeighted(0.5),UInt64,UInt8)" --query "SELECT quantileTDigestWeightedMerge(0.4)(x) FROM table"
400000

$ clickhouse-local --query "SELECT quantilesTDigestIfState(0.1,0.9)(number,number % 2) FROM  numbers(1000000) FORMAT RowBinary" | clickhouse-local --input-format RowBinary --structure="x AggregateFunction(quantilesTDigestWeighted(0.5),UInt64,UInt8)" --query "SELECT quantilesTDigestWeightedMerge(0.4,0.8)(x) FROM table"
[400000,800000]

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
