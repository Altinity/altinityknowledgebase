---
title: "JOIN table engine"
linkTitle: "JOIN table engine"
description: >
    JOIN table engine
---
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

[https://clickhouse.tech/docs/en/engines/table-engines/special/join/](https://clickhouse.tech/docs/en/engines/table-engines/special/join/)
