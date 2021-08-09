---
title: "SPARSE\_HASHED VS HASHED"
linkTitle: "SPARSE\_HASHED VS HASHED"
description: >
    SPARSE\_HASHED VS HASHED
---

Sparse\_hashed layout is supposed to save memory but has some downsides. We can test how much slower SPARSE\_HASHED than HASHED is with the following:

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

SELECT
    name,
    type,
    status,
    element_count,
    formatReadableSize(bytes_allocated) AS RAM
FROM system.dictionaries
WHERE name LIKE 'orders%'
┌─name──────────┬─type─────────┬─status─┬─element_count─┬─RAM────────┐
│ orders_sparse │ SparseHashed │ LOADED │       5000000 │ 84.29 MiB  │
│ orders_hashed │ Hashed       │ LOADED │       5000000 │ 256.00 MiB │
└───────────────┴──────────────┴────────┴───────────────┴────────────┘

SELECT sum(dictGet('default.orders_hashed', 'price', toUInt64(number))) AS res
FROM numbers(10000000)
┌─res─┐
│   0 │
└─────┘
1 rows in set. Elapsed: 0.279 sec. Processed 10.02 million rows ...


SELECT sum(dictGet('default.orders_sparse', 'price', toUInt64(number))) AS res
FROM numbers(10000000)
┌─res─┐
│   0 │
└─────┘
1 rows in set. Elapsed: 1.085 sec. Processed 10.02 million rows ...
```

As you can see **SPARSE\_HASHED** is memory efficient and use about 3 times less memory \(!!!\) but is almost 4 times slower. But this is the ultimate case because this test does not read data from the disk \(no MergeTree table involved\).

We encourage you to test **SPARSE\_HASHED** against your real queries, because it able to save a lot of memory and have larger \(in rows\) external dictionaries.

© 2021 Altinity Inc. All rights reserved.

