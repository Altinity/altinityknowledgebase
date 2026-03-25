---
title: "How to convert uniqExact states to approximate uniq functions states"
linkTitle: "Convert uniqExact to uniq(Combined)"
weight: 100
description: >-
     A way to convert to uniqExactState to other uniqStates (like uniqCombinedState) in ClickHouse® 
---

## uniqExactState 

`uniqExactState` is stored in two parts: a count of values in `LEB128` format + list values without a delimiter.
Depending on the orignial datatype of the values to count, the datatype of the list values differ.

### Numeric Values

In case of numeric values like `UInt8`, `UInt64` etc. the representation of `uniqExactState` is just a simple array of the unique values encountered. 
Therefore it is easy to recover the values from the state which have appeared:

```text
┌─hex(uniqExactState(arrayJoin([1, 3])))─┐
│ 020103                                 │
└────────────────────────────────────────┘
  02        01             03   
  ^         ^              ^
  LEB128    hex(1::UInt8)  hex(3::UInt8)


┌─finalizeAggregation(CAST(unhex('020103'), 'AggregateFunction(groupArray, UInt8)'))─┐
│ [1,3]                                                                              │
└────────────────────────────────────────────────────────────────────────────────────┘
```

### String Values

#### Internal Representation
In case of values of data type `String`, ClickHouse® applies a hashing algorithm before storing the values into the internal array, otherwise the amount of space needed could get enormous.

```text
┌─hex(uniqExactState(toString(arrayJoin([1]))))─┐
│ 01E2756D8F7A583CA23016E03447724DE7            │
└───────────────────────────────────────────────┘
  01         E2756D8F7A583CA23016E03447724DE7
  ^          ^
  LEB128     hash of '1'


┌─hex(uniqExactState(toString(arrayJoin([1, 2]))))───────────────────┐
│ 024809CB4528E00621CF626BE9FA14E2BFE2756D8F7A583CA23016E03447724DE7 │
└────────────────────────────────────────────────────────────────────┘
  02     4809CB4528E00621CF626BE9FA14E2BF E2756D8F7A583CA23016E03447724DE7
  ^        ^                                ^
  LEB128 hash of '2'                      hash of '1'
```

So, our task is to find how we can generate such values by ourself, speak what hash function is used.
In case of `String` data type, it is just the simple `sipHash128` function.

```text
┌─hex(sipHash128(toString(2)))─────┬─hex(sipHash128(toString(1)))─────┐
│ 4809CB4528E00621CF626BE9FA14E2BF │ E2756D8F7A583CA23016E03447724DE7 │
└──────────────────────────────────┴──────────────────────────────────┘
```

#### Getting the Hash Values
The second task: now that we know how the state is formed, how can we demangle it and convert it into an `Array` of values.
Unfortunatelly it is not possible to get the original values back, as `sipHash128` is a one way conversion, but at least we can try to get an `Array` of hashes.
Luckily for us, ClickHouse® use the exact same serialization (`LEB128` + list of values) for Arrays (in this case if `uniqExactState` and `Array` are serialized into `RowBinary` format).

One way to "convert" the `uniqExactState` to an `Array` of hashes would be via an external helper 
`UDF` function to do that conversion:

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
This UDF -- `pipe` converts `uniqExactState` to the `Array(FixedString(16))`:

```text
┌─arrayMap(x -> hex(x), pipe(uniqExactState(toString(arrayJoin([1, 2])))))──────────────┐
│ ['4809CB4528E00621CF626BE9FA14E2BF','E2756D8F7A583CA23016E03447724DE7']               │
└───────────────────────────────────────────────────────────────────────────────────────┘
```

This way only works if you have direct access to your ClickHouse® installation. 
However if you are on a managed platform like Altinity.Cloud installing executable `UDF`s is typically not supported for security reasons.
Luckily we know that the internal representation of `sipHash128` is `FixedString(16)` which has exactly 128 bit. `UInt128` also takes up exactly 128 bit.
Therefore we can consider the `uniqExactState(String)` as a representation of `Array(UInt128)`.

Again, we can therefore convert our state to an `Array`:

```text
┌─arrayMap(lambda(tuple(x), hex(reinterpretAsFixedString(x))), finalizeAggregation(CAST(unhex(hex(uniqExactState(arrayJoin(['1', '2'])))), 'AggregateFunction(groupArray, UInt128)')))─┐
│ ['4809CB4528E00621CF626BE9FA14E2BF','E2756D8F7A583CA23016E03447724DE7']                                                                                                              │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

As you can see the `Array` is identical to the one we created with the `pipe` function.

#### Full Example of Conversion

And here is the full example, how you can convert `uniqExactState(string)` to any approximate `uniq` function like `uniqState(string)` or `uniqCombinedState(string)` by `reinterpret`  and `arrayReduce('func', [..])`.

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
    ADD COLUMN `uniq` AggregateFunction(uniq, FixedString(16)), 
    ADD COLUMN `uniqCombined` AggregateFunction(uniqCombined, FixedString(16)); 

-- Materialize values in the new columns
ALTER TABLE aggregates 
UPDATE 
  uniqCombined = arrayReduce('uniqCombinedState', arrayMap(x -> reinterpretAsFixedString(x), finalizeAggregation(unhex(hex(uniqExact))::AggregateFunction(groupArray, UInt128)))), 
  uniq = arrayReduce('uniqState', arrayMap(x -> reinterpretAsFixedString(x), finalizeAggregation(unhex(hex(uniqExact))::AggregateFunction(groupArray, UInt128)))) 
WHERE 1 
SETTINGS mutations_sync=2;

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

Let's compare the data size, `uniq` won in this case, but check this article [Functions to count uniqs](../../altinity-kb-schema-design/uniq-functions/), mileage may vary.

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
