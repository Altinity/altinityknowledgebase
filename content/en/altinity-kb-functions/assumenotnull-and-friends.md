---
title: "assumeNotNull and friends"
linkTitle: "assumeNotNull and friends"
description: >
    assumeNotNull and friends
---
`assumeNotNull` result is implementation specific:

```sql
WITH CAST(NULL, 'Nullable(UInt8)') AS column
SELECT
    column,
    assumeNotNull(column + 999) AS x;

┌─column─┬─x─┐
│   null │ 0 │
└────────┴───┘

WITH CAST(NULL, 'Nullable(UInt8)') AS column
SELECT
    column,
    assumeNotNull(materialize(column) + 999) AS x;

┌─column─┬───x─┐
│   null │ 999 │
└────────┴─────┘

CREATE TABLE test_null
(
    `key` UInt32,
    `value` Nullable(String)
)
ENGINE = MergeTree
ORDER BY key;

INSERT INTO test_null SELECT
    number,
    concat('value ', toString(number))
FROM numbers(4);

SELECT *
FROM test_null;

┌─key─┬─value───┐
│   0 │ value 0 │
│   1 │ value 1 │
│   2 │ value 2 │
│   3 │ value 3 │
└─────┴─────────┘

ALTER TABLE test_null
    UPDATE value = NULL WHERE key = 3;

SELECT *
FROM test_null;

┌─key─┬─value───┐
│   0 │ value 0 │
│   1 │ value 1 │
│   2 │ value 2 │
│   3 │ null    │
└─────┴─────────┘

SELECT
    key,
    assumeNotNull(value)
FROM test_null;

┌─key─┬─assumeNotNull(value)─┐
│   0 │ value 0              │
│   1 │ value 1              │
│   2 │ value 2              │
│   3 │ value 3              │
└─────┴──────────────────────┘

WITH CAST(NULL, 'Nullable(Enum8(\'a\' = 1, \'b\' = 0))') AS test
SELECT assumeNotNull(test)

┌─assumeNotNull(test)─┐
│ b                   │
└─────────────────────┘

WITH CAST(NULL, 'Nullable(Enum8(\'a\' = 1))') AS test
SELECT assumeNotNull(test)

Error on processing query 'with CAST(null, 'Nullable(Enum8(\'a\' = 1))') as test
select assumeNotNull(test); ;':
Code: 36, e.displayText() = DB::Exception: Unexpected value 0 in enum, Stack trace (when copying this message, always include the lines below):
```

{{% alert title="Info" color="info" %}}
Null values in ClickHouse® are stored in a separate dictionary: is this value Null. And for faster dispatch of functions there is no check on Null value while function execution, so functions like plus can modify internal column value (which has default value). In normal conditions it’s not a problem because on read attempt, ClickHouse first would check the Null dictionary and return value from column itself for non-Nulls only. And `assumeNotNull` function just ignores this Null dictionary. So it would return only column values, and in certain cases it’s possible to have unexpected results.
{{% /alert %}}

If it's possible to have Null values, it's better to use `ifNull` function instead.

```sql
SELECT count()
FROM numbers_mt(1000000000)
WHERE NOT ignore(ifNull(toNullable(number), 0))

┌────count()─┐
│ 1000000000 │
└────────────┘

1 rows in set. Elapsed: 0.705 sec. Processed 1.00 billion rows, 8.00 GB (1.42 billion rows/s., 11.35 GB/s.)

SELECT count()
FROM numbers_mt(1000000000)
WHERE NOT ignore(coalesce(toNullable(number), 0))

┌────count()─┐
│ 1000000000 │
└────────────┘

1 rows in set. Elapsed: 2.383 sec. Processed 1.00 billion rows, 8.00 GB (419.56 million rows/s., 3.36 GB/s.)

SELECT count()
FROM numbers_mt(1000000000)
WHERE NOT ignore(assumeNotNull(toNullable(number)))

┌────count()─┐
│ 1000000000 │
└────────────┘

1 rows in set. Elapsed: 0.051 sec. Processed 1.00 billion rows, 8.00 GB (19.62 billion rows/s., 156.98 GB/s.)

SELECT count()
FROM numbers_mt(1000000000)
WHERE NOT ignore(toNullable(number))

┌────count()─┐
│ 1000000000 │
└────────────┘

1 rows in set. Elapsed: 0.050 sec. Processed 1.00 billion rows, 8.00 GB (20.19 billion rows/s., 161.56 GB/s.)
```

{{% alert title="Info" color="info" %}}
There is no overhead for `assumeNotNull` at all.
{{% /alert %}}
