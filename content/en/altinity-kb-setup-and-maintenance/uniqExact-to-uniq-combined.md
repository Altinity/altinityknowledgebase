---
title: "How to convert uniqExact states to approximate uniq functions states"
linkTitle: "Convert uniqExact to uniq(Combined)"
weight: 100
description: >-
     A way to convert to uniqExactState to other uniqStates (like uniqCombinedState) in ClickHouse. 
---

## uniqExactState 

`uniqExactState` is stored in two parts: a count of values in `LEB128` format + list values without a delimeter.

In our case, the value is `sipHash128` of strings passed to uniqExact function.

```text
┌─hex(uniqExactState(toString(arrayJoin([1]))))─┐
│ 01E2756D8F7A583CA23016E03447724DE7            │
└───────────────────────────────────────────────┘
  01         E2756D8F7A583CA23016E03447724DE7
  ^          ^
  LEB128     sipHash128


┌─hex(uniqExactState(toString(arrayJoin([1, 2]))))───────────────────┐
│ 024809CB4528E00621CF626BE9FA14E2BFE2756D8F7A583CA23016E03447724DE7 │
└────────────────────────────────────────────────────────────────────┘
  02 4809CB4528E00621CF626BE9FA14E2BF E2756D8F7A583CA23016E03447724DE7
  ^        ^                                ^
LEB128 sipHash128                       sipHash128
```

So, our task is to find how we can generate such values by ourself.
In case of `String` data type, it just the simple `sipHash128` function.

```text
┌─hex(sipHash128(toString(2)))─────┬─hex(sipHash128(toString(1)))─────┐
│ 4809CB4528E00621CF626BE9FA14E2BF │ E2756D8F7A583CA23016E03447724DE7 │
└──────────────────────────────────┴──────────────────────────────────┘
```

The second task: it needs to read a state and split it into an array of values.
Luckly for us, ClickHouse use the exact same serialization (`LEB128` + list of values) for Arrays (in this case if `uniqExactState` and `Array` are serialized into `RowBinary` format).

We need one a helper -- `UDF` function to do that conversion:

```xml
cat /etc/clickhouse-server/pipe_function.xml
<clickhouse>
  <function>
    <type>executable</type>
    <execute_direct>0</execute_direct>
    <name>pipe</name>
    <return_type>Array(FixedString(16))</return_type>
    <argument>
      <type>String</type>
    </argument>
    <format>RowBinary</format>
    <command>cat</command>
    <send_chunk_header>0</send_chunk_header>
  </function>
</clickhouse>
```
This UDF -- `pipe` converts `uniqExactState` to the `Array(FixedString(16))`.

```text
┌─arrayMap(x -> hex(x), pipe(uniqExactState(toString(arrayJoin([1, 2])))))──────────────┐
│ ['4809CB4528E00621CF626BE9FA14E2BF','E2756D8F7A583CA23016E03447724DE7']               │
└───────────────────────────────────────────────────────────────────────────────────────┘
```

And here is the full example, how you can convert `uniqExactState(string)` to `uniqState(string)` or `uniqCombinedState(string)` using `pipe` UDF and `arrayReduce('func', [..])`.

```sql
-- Generate demo with random data, uniqs are stored as heavy uniqExact
CREATE TABLE aggregates
(
    `id` UInt32,
    `uniqExact` AggregateFunction(uniqExact, String)
)
ENGINE = AggregatingMergeTree
ORDER BY id as
SELECT
    number % 10000 AS id,
    uniqExactState(toString(number))
FROM numbers(10000000)
GROUP BY id;

0 rows in set. Elapsed: 2.042 sec. Processed 10.01 million rows, 80.06 MB (4.90 million rows/s., 39.21 MB/s.)

-- Let's add a new columns to store optimized, approximate uniq & uniqCombined
ALTER TABLE aggregates
    ADD COLUMN `uniq` AggregateFunction(uniq, FixedString(16)) 
             default arrayReduce('uniqState', pipe(uniqExact)),
    ADD COLUMN `uniqCombined` AggregateFunction(uniqCombined, FixedString(16)) 
             default arrayReduce('uniqCombinedState', pipe(uniqExact));

-- Materialize defaults in the new columns
ALTER TABLE aggregates UPDATE uniqCombined = uniqCombined, uniq = uniq 
WHERE 1 settings mutations_sync=2;

-- Let's reset defaults to remove the dependancy of the UDF from our table
ALTER TABLE aggregates
     modify COLUMN `uniq` remove default,
     modify COLUMN `uniqCombined` remove default;

-- Alternatively you can populate data in the new columns directly without using DEFAULT columns
-- ALTER TABLE aggregates UPDATE 
--     uniqCombined = arrayReduce('uniqCombinedState', pipe(uniqExact)), 
--     uniq = arrayReduce('uniqState', pipe(uniqExact)) 
-- WHERE 1 settings mutations_sync=2;

-- Check results, results are slighty different, because uniq & uniqCombined are approximate functions
SELECT
    id % 20 AS key,
    uniqExactMerge(uniqExact),
    uniqCombinedMerge(uniqCombined),
    uniqMerge(uniq)
FROM aggregates
GROUP BY key

┌─key─┬─uniqExactMerge(uniqExact)─┬─uniqCombinedMerge(uniqCombined)─┬─uniqMerge(uniq)─┐
│   0 │                    500000 │                          500195 │          500455 │
│   1 │                    500000 │                          502599 │          501549 │
│   2 │                    500000 │                          498058 │          504428 │
│   3 │                    500000 │                          499748 │          500195 │
│   4 │                    500000 │                          500791 │          500836 │
│   5 │                    500000 │                          502430 │          497558 │
│   6 │                    500000 │                          500262 │          501785 │
│   7 │                    500000 │                          501514 │          495758 │
│   8 │                    500000 │                          500121 │          498597 │
│   9 │                    500000 │                          502173 │          500455 │
│  10 │                    500000 │                          499144 │          498386 │
│  11 │                    500000 │                          500525 │          503139 │
│  12 │                    500000 │                          503624 │          497103 │
│  13 │                    500000 │                          499986 │          497992 │
│  14 │                    500000 │                          502027 │          494833 │
│  15 │                    500000 │                          498831 │          500983 │
│  16 │                    500000 │                          501103 │          500836 │
│  17 │                    500000 │                          499409 │          496791 │
│  18 │                    500000 │                          501641 │          502991 │
│  19 │                    500000 │                          500648 │          500881 │
└─────┴───────────────────────────┴─────────────────────────────────┴─────────────────┘

20 rows in set. Elapsed: 2.312 sec. Processed 10.00 thousand rows, 7.61 MB (4.33 thousand rows/s., 3.29 MB/s.)
```


Now, lets repeat the same insert, but in that case we will also populate `uniq` & `uniqCombined` with values converted via `sipHash128` function.
If we did everything right, `uniq` counts will not change, because we inserted the exact same values.

```sql
INSERT INTO aggregates SELECT
    number % 10000 AS id,
    uniqExactState(toString(number)),
    uniqState(sipHash128(toString(number))),
    uniqCombinedState(sipHash128(toString(number)))
FROM numbers(10000000)
GROUP BY id;

0 rows in set. Elapsed: 5.386 sec. Processed 10.01 million rows, 80.06 MB (1.86 million rows/s., 14.86 MB/s.)


SELECT
    id % 20 AS key,
    uniqExactMerge(uniqExact),
    uniqCombinedMerge(uniqCombined),
    uniqMerge(uniq)
FROM aggregates
GROUP BY key

┌─key─┬─uniqExactMerge(uniqExact)─┬─uniqCombinedMerge(uniqCombined)─┬─uniqMerge(uniq)─┐
│   0 │                    500000 │                          500195 │          500455 │
│   1 │                    500000 │                          502599 │          501549 │
│   2 │                    500000 │                          498058 │          504428 │
│   3 │                    500000 │                          499748 │          500195 │
│   4 │                    500000 │                          500791 │          500836 │
│   5 │                    500000 │                          502430 │          497558 │
│   6 │                    500000 │                          500262 │          501785 │
│   7 │                    500000 │                          501514 │          495758 │
│   8 │                    500000 │                          500121 │          498597 │
│   9 │                    500000 │                          502173 │          500455 │
│  10 │                    500000 │                          499144 │          498386 │
│  11 │                    500000 │                          500525 │          503139 │
│  12 │                    500000 │                          503624 │          497103 │
│  13 │                    500000 │                          499986 │          497992 │
│  14 │                    500000 │                          502027 │          494833 │
│  15 │                    500000 │                          498831 │          500983 │
│  16 │                    500000 │                          501103 │          500836 │
│  17 │                    500000 │                          499409 │          496791 │
│  18 │                    500000 │                          501641 │          502991 │
│  19 │                    500000 │                          500648 │          500881 │
└─────┴───────────────────────────┴─────────────────────────────────┴─────────────────┘

20 rows in set. Elapsed: 3.318 sec. Processed 20.00 thousand rows, 11.02 MB (6.03 thousand rows/s., 3.32 MB/s.)
```

Let's compare the data size, `uniq` won in this case, but check this article [Functions to count uniqs](../../altinity-kb-schema-design/uniq-functions/), milage may vary.

```sql
optimize table aggregates final;

SELECT
    column,
    formatReadableSize(sum(column_data_compressed_bytes) AS size) AS compressed,
    formatReadableSize(sum(column_data_uncompressed_bytes) AS usize) AS uncompressed
FROM system.parts_columns
WHERE (active = 1)  AND (table LIKE 'aggregates') and column like '%uniq%'
GROUP BY column
ORDER BY size DESC;

┌─column───────┬─compressed─┬─uncompressed─┐
│ uniqExact    │ 153.21 MiB │ 152.61 MiB   │
│ uniqCombined │ 76.62 MiB  │ 76.32 MiB    │
│ uniq         │ 38.33 MiB  │ 38.18 MiB    │
└──────────────┴────────────┴──────────────┘
```
