---
title: "How to encode/decode quantileTDigest states from/to list of centroids"
linkTitle: "Encoding and Decoding of quantileTDigest states"
weight: 100
description: >-
     A way to export or import quantileTDigest states from/into ClickHouse.
---

## quantileTDigestState

quantileTDigestState is stored in two parts: a count of centroids in LEB128 format + list of centroids without a delimeter. Each centroid is represented as two Float32 values: Mean & Count.

```sql
SELECT
    hex(quantileTDigestState(1)),
    hex(toFloat32(1))

┌─hex(quantileTDigestState(1))─┬─hex(toFloat32(1))─┐
│ 010000803F0000803F           │ 0000803F          │
└──────────────────────────────┴───────────────────┘
  01          0000803F      0000803F
  ^           ^             ^
  LEB128      Float32 Mean  Float32 Count
```

We need to make two helper `UDF` functions:

```xml
cat /etc/clickhouse-server/decodeTDigestState_function.xml
<yandex>
  <function>
    <type>executable</type>
    <execute_direct>0</execute_direct>
    <name>decodeTDigestState</name>
    <return_type>Array(Tuple(mean Float32, count Float32))</return_type>
    <argument>
      <type>AggregateFunction(quantileTDigest, UInt32)</type>
    </argument>
    <format>RowBinary</format>
    <command>cat</command>
    <send_chunk_header>0</send_chunk_header>
  </function>
</yandex>

cat /etc/clickhouse-server/encodeTDigestState_function.xml
<yandex>
  <function>
    <type>executable</type>
    <execute_direct>0</execute_direct>
    <name>encodeTDigestState</name>
    <return_type>AggregateFunction(quantileTDigest, UInt32)</return_type>
    <argument>
      <type>Array(Tuple(mean Float32, count Float32))</type>
    </argument>
    <format>RowBinary</format>
    <command>cat</command>
    <send_chunk_header>0</send_chunk_header>
  </function>
</yandex>
```

Those UDF – `(encode/decode)TDigestState` converts `TDigestState` to the `Array(Tuple(Float32, Float32))` and back.

```sql
SELECT quantileTDigest(CAST(number, 'UInt32')) AS result
FROM numbers(10)

┌─result─┐
│      4 │
└────────┘

SELECT decodeTDigestState(quantileTDigestState(CAST(number, 'UInt32'))) AS state
FROM numbers(10)

┌─state─────────────────────────────────────────────────────────┐
│ [(0,1),(1,1),(2,1),(3,1),(4,1),(5,1),(6,1),(7,1),(8,1),(9,1)] │
└───────────────────────────────────────────────────────────────┘

SELECT finalizeAggregation(encodeTDigestState(CAST('[(0,1),(1,1),(2,1),(3,1),(4,1),(5,1),(6,1),(7,1),(8,1),(9,1)]', 'Array(Tuple(Float32, Float32))'))) AS result

┌─result─┐
│      4 │
└────────┘
```

