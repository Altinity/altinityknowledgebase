---
title: "Window functions"
linkTitle: "Window functions"
description: >
    Window functions
---
| Link | [blog.tinybird.co/2021/03/16/c…](https://blog.tinybird.co/2021/03/16/coming-soon-on-clickhouse-window-functions/) |
| :--- | :--- |
| Date | Mar 26, 2021 |

![Windows Function Slides](https://api.microlink.io/?adblock=false&meta=false&screenshot&element=%23screenshot&embed=screenshot.url&url=https%3A%2F%2Fcards.microlink.io%2F%3Fpreset%3Dtinybird%26subtitle%3Dtips%26text%3DWindow%2Bfunctions%252C%2Bnested%2Bdata%252C%2BA%2BPostgreSQL%2Bengine%2Band%2Bmore)

[blog.tinybird.co/2021/03/16/c…](https://blog.tinybird.co/2021/03/16/coming-soon-on-clickhouse-window-functions/)

> An exploration on what's possible to do with the most recent experimental feature on ClickHouse - window functions, and an overview of other interesting feat...

[Windows Functions Blog Link](https://blog.tinybird.co/2021/03/16/coming-soon-on-clickhouse-window-functions/)

#### How Do I Simulate Window Functions Using Arrays on older versions of clickhouse?

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
