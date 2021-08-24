---
title: "SummingMergeTree"
linkTitle: "SummingMergeTree"
description: >
    SummingMergeTree
---
## Nested structures

In certain conditions it could make sense to collapse one of dimensions to set of arrays. It's usually profitable to do if this dimension is not commonly used in queries. It would reduce amount of rows in aggregated table and speed up queries which doesn't care about this dimension in exchange of aggregation performance by collapsed dimension.

```sql
CREATE TABLE traffic
(
    `key1` UInt32,
    `key2` UInt32,
    `port` UInt16,
    `bits_in` UInt32 CODEC (T64,LZ4),
    `bits_out` UInt32 CODEC (T64,LZ4),
    `packets_in` UInt32 CODEC (T64,LZ4),
    `packets_out` UInt32 CODEC (T64,LZ4)
)
ENGINE = SummingMergeTree
ORDER BY (key1, key2, port);

INSERT INTO traffic SELECT
    number % 1000,
    intDiv(number, 10000),
    rand() % 20,
    rand() % 753,
    rand64() % 800,
    rand() % 140,
    rand64() % 231
FROM numbers(100000000);

CREATE TABLE default.traffic_map
(
    `key1` UInt32,
    `key2` UInt32,
    `bits_in` UInt32 CODEC(T64, LZ4),
    `bits_out` UInt32 CODEC(T64, LZ4),
    `packets_in` UInt32 CODEC(T64, LZ4),
    `packets_out` UInt32 CODEC(T64, LZ4),
    `portMap.port` Array(UInt16),
    `portMap.bits_in` Array(UInt32) CODEC(T64, LZ4),
    `portMap.bits_out` Array(UInt32) CODEC(T64, LZ4),
    `portMap.packets_in` Array(UInt32) CODEC(T64, LZ4),
    `portMap.packets_out` Array(UInt32) CODEC(T64, LZ4)
)
ENGINE = SummingMergeTree
ORDER BY (key1, key2);

INSERT INTO traffic_map WITH rand() % 20 AS port
SELECT
    number % 1000 AS key1,
    intDiv(number, 10000) AS key2,
    rand() % 753 AS bits_in,
    rand64() % 800 AS bits_out,
    rand() % 140 AS packets_in,
    rand64() % 231 AS packets_out,
    [port],
    [bits_in],
    [bits_out],
    [packets_in],
    [packets_out]
FROM numbers(100000000);

┌─table───────┬─column──────────────┬─────rows─┬─compressed─┬─uncompressed─┬──ratio─┐
│ traffic     │ bits_out            │ 80252317 │ 109.09 MiB │ 306.14 MiB   │   2.81 │
│ traffic     │ bits_in             │ 80252317 │ 108.34 MiB │ 306.14 MiB   │   2.83 │
│ traffic     │ port                │ 80252317 │ 99.21 MiB  │ 153.07 MiB   │   1.54 │
│ traffic     │ packets_out         │ 80252317 │ 91.36 MiB  │ 306.14 MiB   │   3.35 │
│ traffic     │ packets_in          │ 80252317 │ 84.61 MiB  │ 306.14 MiB   │   3.62 │
│ traffic     │ key2                │ 80252317 │ 47.88 MiB  │ 306.14 MiB   │   6.39 │
│ traffic     │ key1                │ 80252317 │ 1.38 MiB   │ 306.14 MiB   │ 221.42 │
│ traffic_map │ portMap.bits_out    │ 10000000 │ 108.96 MiB │ 306.13 MiB   │   2.81 │
│ traffic_map │ portMap.bits_in     │ 10000000 │ 108.32 MiB │ 306.13 MiB   │   2.83 │
│ traffic_map │ portMap.port        │ 10000000 │ 92.00 MiB  │ 229.36 MiB   │   2.49 │
│ traffic_map │ portMap.packets_out │ 10000000 │ 90.95 MiB  │ 306.13 MiB   │   3.37 │
│ traffic_map │ portMap.packets_in  │ 10000000 │ 84.19 MiB  │ 306.13 MiB   │   3.64 │
│ traffic_map │ key2                │ 10000000 │ 23.46 MiB  │ 38.15 MiB    │   1.63 │
│ traffic_map │ bits_in             │ 10000000 │ 15.59 MiB  │ 38.15 MiB    │   2.45 │
│ traffic_map │ bits_out            │ 10000000 │ 15.59 MiB  │ 38.15 MiB    │   2.45 │
│ traffic_map │ packets_out         │ 10000000 │ 13.22 MiB  │ 38.15 MiB    │   2.89 │
│ traffic_map │ packets_in          │ 10000000 │ 12.62 MiB  │ 38.15 MiB    │   3.02 │
│ traffic_map │ key1                │ 10000000 │ 180.29 KiB │ 38.15 MiB    │ 216.66 │
└─────────────┴─────────────────────┴──────────┴────────────┴──────────────┴────────┘

-- Queries

SELECT
    key1,
    sum(packets_in),
    sum(bits_out)
FROM traffic
GROUP BY key1
FORMAT `Null`

0 rows in set. Elapsed: 0.488 sec. Processed 80.25 million rows, 963.03 MB (164.31 million rows/s., 1.97 GB/s.)

SELECT
    key1,
    sum(packets_in),
    sum(bits_out)
FROM traffic_map
GROUP BY key1
FORMAT `Null`

0 rows in set. Elapsed: 0.063 sec. Processed 10.00 million rows, 120.00 MB (159.43 million rows/s., 1.91 GB/s.)


SELECT
    key1,
    port,
    sum(packets_in),
    sum(bits_out)
FROM traffic
GROUP BY
    key1,
    port
FORMAT `Null`

0 rows in set. Elapsed: 0.668 sec. Processed 80.25 million rows, 1.12 GB (120.14 million rows/s., 1.68 GB/s.)

WITH arrayJoin(arrayZip(untuple(sumMap(portMap.port, portMap.packets_in, portMap.bits_out)))) AS tpl
SELECT
    key1,
    tpl.1 AS port,
    tpl.2 AS packets_in,
    tpl.3 AS bits_out
FROM traffic_map
GROUP BY key1
FORMAT `Null`

0 rows in set. Elapsed: 0.915 sec. Processed 10.00 million rows, 1.08 GB (10.93 million rows/s., 1.18 GB/s.)
```
