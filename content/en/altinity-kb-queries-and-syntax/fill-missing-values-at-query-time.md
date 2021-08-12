---
title: "Fill missing values at query time"
linkTitle: "Fill missing values at query time"
description: >
    Fill missing values at query time
---
```sql
CREATE TABLE event_table
(
    `key` UInt32,
    `created_at` DateTime,
    `value_a` UInt32,
    `value_b` String
)
ENGINE = MergeTree
ORDER BY (key, created_at)

INSERT INTO event_table SELECT
    1 AS key,
    toDateTime('2020-10-11 10:10:10') + number AS created_at,
    if((number = 0) OR ((number % 5) = 1), number + 1, 0) AS value_a,
    if((number = 0) OR ((number % 3) = 1), toString(number), '') AS value_b
FROM numbers(10)

SELECT
    main.key,
    main.created_at,
    a.value_a,
    b.value_b
FROM event_table AS main
ASOF INNER JOIN
(
    SELECT
        key,
        created_at,
        value_a
    FROM event_table
    WHERE value_a != 0
) AS a ON (main.key = a.key) AND (main.created_at >= a.created_at)
ASOF INNER JOIN
(
    SELECT
        key,
        created_at,
        value_b
    FROM event_table
    WHERE value_b != ''
) AS b ON (main.key = b.key) AND (main.created_at >= b.created_at)

┌─main.key─┬─────main.created_at─┬─a.value_a─┬─b.value_b─┐
│        1 │ 2020-10-11 10:10:10 │         1 │ 0         │
│        1 │ 2020-10-11 10:10:11 │         2 │ 1         │
│        1 │ 2020-10-11 10:10:12 │         2 │ 1         │
│        1 │ 2020-10-11 10:10:13 │         2 │ 1         │
│        1 │ 2020-10-11 10:10:14 │         2 │ 4         │
│        1 │ 2020-10-11 10:10:15 │         2 │ 4         │
│        1 │ 2020-10-11 10:10:16 │         7 │ 4         │
│        1 │ 2020-10-11 10:10:17 │         7 │ 7         │
│        1 │ 2020-10-11 10:10:18 │         7 │ 7         │
│        1 │ 2020-10-11 10:10:19 │         7 │ 7         │
└──────────┴─────────────────────┴───────────┴───────────┘

SELECT
    key,
    created_at,
    value_a,
    value_b
FROM
(
    SELECT
        key,
        groupArray(created_at) AS created_arr,
        arrayFill(x -> (x != 0), groupArray(value_a)) AS a_arr,
        arrayFill(x -> (x != ''), groupArray(value_b)) AS b_arr
    FROM
    (
        SELECT *
        FROM event_table
        ORDER BY
            key ASC,
            created_at ASC
    )
    GROUP BY key
)
ARRAY JOIN
    created_arr AS created_at,
    a_arr AS value_a,
    b_arr AS value_b

┌─key─┬──────────created_at─┬─value_a─┬─value_b─┐
│   1 │ 2020-10-11 10:10:10 │       1 │ 0       │
│   1 │ 2020-10-11 10:10:11 │       2 │ 1       │
│   1 │ 2020-10-11 10:10:12 │       2 │ 1       │
│   1 │ 2020-10-11 10:10:13 │       2 │ 1       │
│   1 │ 2020-10-11 10:10:14 │       2 │ 4       │
│   1 │ 2020-10-11 10:10:15 │       2 │ 4       │
│   1 │ 2020-10-11 10:10:16 │       7 │ 4       │
│   1 │ 2020-10-11 10:10:17 │       7 │ 7       │
│   1 │ 2020-10-11 10:10:18 │       7 │ 7       │
│   1 │ 2020-10-11 10:10:19 │       7 │ 7       │
└─────┴─────────────────────┴─────────┴─────────┘
```
