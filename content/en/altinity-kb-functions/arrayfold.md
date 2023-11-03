---
title: "arrayFold"
linkTitle: "arrayFold"
---

## EWMA example

```sql
WITH
    [40, 45, 43, 31, 20] AS data,
    0.3 AS alpha
SELECT arrayFold((acc, x) -> arrayPushBack(acc, (alpha * x) + ((1 - alpha) * (acc[-1]))), arrayPopFront(data), [CAST(data[1], 'Float64')]) as ewma

┌─ewma─────────────────────────────────────────────────────────────┐
│ [40,41.5,41.949999999999996,38.66499999999999,33.06549999999999] │
└──────────────────────────────────────────────────────────────────┘
```
