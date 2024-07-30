---
title: "Window functions"
linkTitle: "Window functions"
description: >
    Window functions
---

#### Resources: 

* [Tutorial: ClickHouse® Window Functions](https://altinity.com/blog/clickhouse-window-functions-current-state-of-the-art)
* [Video: Fun with ClickHouse Window Functions](https://www.youtube.com/watch?v=sm_vUdMQz4s)
* [Blog: Battle of the Views: ClickHouse Window View vs. Live View](https://altinity.com/blog/battle-of-the-views-clickhouse-window-view-vs-live-view)

#### How Do I Simulate Window Functions Using Arrays on older versions of ClickHouse?

1. Group with groupArray.
2. Calculate the needed metrics.
3. Ungroup back using arrayJoin.

### NTILE

```sql
SELECT intDiv((num - 1) - (cnt % 3), 3) AS ntile
FROM
(
    SELECT
        row_number() OVER (ORDER BY number ASC) AS num,
        count() OVER () AS cnt
    FROM numbers(11)
)

┌─ntile─┐
│     0 │
│     0 │
│     0 │
│     0 │
│     0 │
│     1 │
│     1 │
│     1 │
│     2 │
│     2 │
│     2 │
└───────┘
```
