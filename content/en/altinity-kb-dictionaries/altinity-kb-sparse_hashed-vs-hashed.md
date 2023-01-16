---
title: "SPARSE_HASHED VS HASHED vs HASHED_ARRAY"
linkTitle: "SPARSE_HASHED VS HASHED vs HASHED_ARRAY"
description: >
    SPARSE_HASHED VS HASHED VS HASHED_ARRAY
---
Sparse_hashed and hashed_array layouts are supposed to save memory but has some downsides. We can test it with the following:

```sql
create table orders(id UInt64, price Float64)
Engine = MergeTree() order by id;

insert into orders select number, 0 from numbers(5000000);

CREATE DICTIONARY orders_hashed (id UInt64, price Float64)
PRIMARY KEY id SOURCE(CLICKHOUSE(HOST 'localhost' PORT 9000
TABLE orders DB 'default' USER 'default'))
LIFETIME(MIN 0 MAX 0) LAYOUT(HASHED());

CREATE DICTIONARY orders_sparse (id UInt64, price Float64)
PRIMARY KEY id SOURCE(CLICKHOUSE(HOST 'localhost' PORT 9000
TABLE orders DB 'default' USER 'default'))
LIFETIME(MIN 0 MAX 0) LAYOUT(SPARSE_HASHED());

CREATE DICTIONARY orders_hashed_array (id UInt64, price Float64)
PRIMARY KEY id SOURCE(CLICKHOUSE(HOST 'localhost' PORT 9000
TABLE orders DB 'default' USER 'default'))
LIFETIME(MIN 0 MAX 0) LAYOUT(HASHED_ARRAY());

SELECT
    name,
    type,
    status,
    element_count,
    formatReadableSize(bytes_allocated) AS RAM
FROM system.dictionaries
WHERE name LIKE 'orders%'
┌─name────────────────┬─type─────────┬─status─┬─element_count─┬─RAM────────┐
│ orders_hashed_array │ HashedArray  │ LOADED │       5000000 │ 68.77 MiB  │
│ orders_sparse       │ SparseHashed │ LOADED │       5000000 │ 76.30 MiB  │
│ orders_hashed       │ Hashed       │ LOADED │       5000000 │ 256.00 MiB │
└─────────────────────┴──────────────┴────────┴───────────────┴────────────┘

SELECT sum(dictGet('default.orders_hashed', 'price', toUInt64(number))) AS res
FROM numbers(10000000)
┌─res─┐
│   0 │
└─────┘
1 rows in set. Elapsed: 0.546 sec. Processed 10.01 million rows ...

SELECT sum(dictGet('default.orders_sparse', 'price', toUInt64(number))) AS res
FROM numbers(10000000)
┌─res─┐
│   0 │
└─────┘
1 rows in set. Elapsed: 1.422 sec. Processed 10.01 million rows ...

SELECT sum(dictGet('default.orders_hashed_array', 'price', toUInt64(number))) AS res
FROM numbers(10000000)
┌─res─┐
│   0 │
└─────┘
1 rows in set. Elapsed: 0.558 sec. Processed 10.01 million rows ...
```

As you can see **SPARSE_HASHED** is memory efficient and use about 3 times less memory (!!!) but is almost 3 times slower as well. On the other side **HASHED_ARRAY** is even more efficient in terms of memory usage and maintains almost the same performance as **HASHED** layout.
