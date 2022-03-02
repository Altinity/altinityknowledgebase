---
title: "Nulls in order by"
linkTitle: "Nulls in order by"
description: >
    Nulls in order by
---

1) It is NOT RECOMMENDED for a general use
2) Use on your own risk
3) Use latest ClickHouse version if you need that.

```sql
CREATE TABLE x
(
    `a` Nullable(UInt32),
    `b` Nullable(UInt32),
    `cnt` UInt32
)
ENGINE = SummingMergeTree
ORDER BY (a, b)
SETTINGS allow_nullable_key = 1;
INSERT INTO x VALUES (Null,2,1), (Null,Null,1), (3, Null, 1), (4,4,1);
INSERT INTO x VALUES (Null,2,1), (Null,Null,1), (3, Null, 1), (4,4,1);
SELECT * FROM x;
┌────a─┬────b─┬─cnt─┐
│    3 │  null │   2 │
│    4 │    4 │   2 │
│  null │    2 │   2 │
│  null │  null │   2 │
└──────┴──────┴─────┘
```
