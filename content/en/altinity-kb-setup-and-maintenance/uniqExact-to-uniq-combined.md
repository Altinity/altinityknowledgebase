---
title: "How to convert uniqExact states to approximate uniq functions states"
linkTitle: "Convert uniqExact to uniq(Combined)"
weight: 100
description: >-
     Page description for heading and indexes.
---

## uniqExactState 

Can be split in 2 parts: LEB128 count of values + list of values without delimeter

In our case, value is sipHash128 of strings passed to uniqExact function

```sql
┌─hex(uniqExactState(toString(arrayJoin([1]))))─┐
│ 01E2756D8F7A583CA23016E03447724DE7            │
└───────────────────────────────────────────────┘

  01                                  E2756D8F7A583CA23016E03447724DE7
  ^                                         ^
LEB128                                  sipHash128

┌─hex(uniqExactState(toString(arrayJoin([1, 2]))))───────────────────┐
│ 024809CB4528E00621CF626BE9FA14E2BFE2756D8F7A583CA23016E03447724DE7 │
└────────────────────────────────────────────────────────────────────┘


  02 4809CB4528E00621CF626BE9FA14E2BF E2756D8F7A583CA23016E03447724DE7
  ^        ^                                ^
LEB128 sipHash128                       sipHash128
```

So, our task is find how we can generate such values by ourself.
In case of String data type, it just simple sipHash128 function

```sql
┌─hex(sipHash128(toString(2)))─────┬─hex(sipHash128(toString(1)))─────┐
│ 4809CB4528E00621CF626BE9FA14E2BF │ E2756D8F7A583CA23016E03447724DE7 │
└──────────────────────────────────┴──────────────────────────────────┘
```


Second task, we need read state and split it into array of values.
Luckly for us, ClickHouse use exact the same serialization (LEB128 + list of values) for Arrays.

We need one helper UDF function to do that conversion:

```sh
nano /etc/clickhouse-server/config.d/pipe_function.xml
```
```xml
<clickhouse>
  <function>
    <type>executable</type>
    <execute_direct>1</execute_direct>
    <name>pipe</name>
    <return_type>Array(FixedString(16))</return_type>
    <argument>
      <type>String</type>
    </argument>
    <format>RowBinary</format>
    <command>pipe</command>
    <send_chunk_header>0</send_chunk_header>
  </function>
</clickhouse>
```

```sql
┌─arrayMap(x -> hex(x), pipe(uniqExactState(toString(arrayJoin([1, 2])))))──────────────┐
│ ['4809CB4528E00621CF626BE9FA14E2BF','E2756D8F7A583CA23016E03447724DE7']               │
└───────────────────────────────────────────────────────────────────────────────────────┘
```

And here is full example, how you can convert uniqExactState(string) to uniqState(string) or uniqCombinedState(string)

```sql
CREATE TABLE aggregates
(
    `id` UInt32,
    `uniqExact` AggregateFunction(uniqExact, String)
)
ENGINE = AggregatingMergeTree
ORDER BY id


INSERT INTO aggregates SELECT
    number % 10000 AS id,
    uniqExactState(toString(number))
FROM numbers(10000000)
GROUP BY id

Ok.

0 rows in set. Elapsed: 2.042 sec. Processed 10.01 million rows, 80.06 MB (4.90 million rows/s., 39.21 MB/s.)

ALTER TABLE aggregates
    ADD COLUMN `uniq` AggregateFunction(uniq, FixedString(16)),
    ADD COLUMN `uniqCombined` AggregateFunction(uniqCombined, FixedString(16))

ALTER TABLE aggregates
    UPDATE uniqCombined = arrayReduce('uniqCombinedState', pipe(uniqExact)), uniq = arrayReduce('uniqState', pipe(uniqExact)) WHERE 1

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


Now, lets repeat the same insert, but in that case we will also populate uniq & uniqCombined with values converted via sipHash128 function.
If we did everything right, uniq counts will not change, because we inserted the exact same values.

```sql
INSERT INTO aggregates SELECT
    number % 10000 AS id,
    uniqExactState(toString(number)),
    uniqState(sipHash128(toString(number))),
    uniqCombinedState(sipHash128(toString(number)))
FROM numbers(10000000)
GROUP BY id

Ok.

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
