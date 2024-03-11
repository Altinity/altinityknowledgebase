---
title: "JOINs"
linkTitle: "JOINs"
description: >
    JOINs
aliases:
  - /altinity-kb-queries-and-syntax/joins/join-table-engine/
---
Resources: 

* [Overview of JOINs (Russian)](https://github.com/ClickHouse/clickhouse-presentations/blob/master/meetup38/join.pdf) - Presentation from Meetup 38 in 2019
* [Notes on JOIN options](https://excalidraw.com/#json=xX_heZcCu0whsDmC2Mdvo,ppbUVFpPz-flJu5ZDnwIPw) 

## Join Table Engine

The main purpose of JOIN table engine is to avoid building the right table for joining on each query execution. So it's usually used when you have a high amount of fast queries which share the same right table for joining.

### Updates

It's possible to update rows with setting `join_any_take_last_row` enabled.

```sql
CREATE TABLE id_val_join
(
    `id` UInt32,
    `val` UInt8
)
ENGINE = Join(ANY, LEFT, id)
SETTINGS join_any_take_last_row = 1

Ok.

INSERT INTO id_val_join VALUES (1,21)(1,22)(3,23);

Ok.

SELECT *
FROM
(
    SELECT toUInt32(number) AS id
    FROM numbers(4)
) AS n
ANY LEFT JOIN id_val_join USING (id)

┌─id─┬─val─┐
│  0 │   0 │
│  1 │  22 │
│  2 │   0 │
│  3 │  23 │
└────┴─────┘

INSERT INTO id_val_join VALUES (1,40)(2,24);

Ok.

SELECT *
FROM
(
    SELECT toUInt32(number) AS id
    FROM numbers(4)
) AS n
ANY LEFT JOIN id_val_join USING (id)

┌─id─┬─val─┐
│  0 │   0 │
│  1 │  40 │
│  2 │  24 │
│  3 │  23 │
└────┴─────┘
```

[Join table engine documentation](https://clickhouse.com/docs/en/engines/table-engines/special/join/)
