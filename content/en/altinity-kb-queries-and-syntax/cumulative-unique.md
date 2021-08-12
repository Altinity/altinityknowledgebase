---
title: "Cumulative Anything"
linkTitle: "Cumulative Anything"
description: >
    Cumulative Anything
---
## Sample data

```sql
CREATE TABLE events
(
    `ts` DateTime,
    `user_id` UInt32
)
ENGINE = Memory;

INSERT INTO events SELECT
    toDateTime('2021-04-29 10:10:10') + toIntervalHour(7 * number) AS ts,
    toDayOfWeek(ts) + (number % 2) AS user_id
FROM numbers(15);
```

## Using arrays

```sql
WITH
    groupArray(_ts) AS ts_arr,
    groupArray(state) AS state_arr
SELECT
    arrayJoin(ts_arr) AS ts,
    arrayReduce('uniqExactMerge', arrayFilter((x, y) -> (y <= ts), state_arr, ts_arr)) AS uniq
FROM
(
    SELECT
        toStartOfDay(ts) AS _ts,
        uniqExactState(user_id) AS state
    FROM events
    GROUP BY _ts
)
ORDER BY ts ASC

┌──────────────────ts─┬─uniq─┐
│ 2021-04-29 00:00:00 │    2 │
│ 2021-04-30 00:00:00 │    3 │
│ 2021-05-01 00:00:00 │    4 │
│ 2021-05-02 00:00:00 │    5 │
│ 2021-05-03 00:00:00 │    7 │
└─────────────────────┴──────┘

WITH arrayJoin(range(toUInt32(_ts) AS int, least(int + toUInt32((3600 * 24) * 5), toUInt32(toDateTime('2021-05-04 00:00:00'))), 3600 * 24)) AS ts_expanded
SELECT
    toDateTime(ts_expanded) AS ts,
    uniqExactMerge(state) AS uniq
FROM
(
    SELECT
        toStartOfDay(ts) AS _ts,
        uniqExactState(user_id) AS state
    FROM events
    GROUP BY _ts
)
GROUP BY ts
ORDER BY ts ASC

┌──────────────────ts─┬─uniq─┐
│ 2021-04-29 00:00:00 │    2 │
│ 2021-04-30 00:00:00 │    3 │
│ 2021-05-01 00:00:00 │    4 │
│ 2021-05-02 00:00:00 │    5 │
│ 2021-05-03 00:00:00 │    7 │
└─────────────────────┴──────┘
```

## Using window functions (starting from Clickhouse 21.3)

```sql
SELECT
    ts,
    uniqExactMerge(state) OVER (ORDER BY ts ASC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS uniq
FROM
(
    SELECT
        toStartOfDay(ts) AS ts,
        uniqExactState(user_id) AS state
    FROM events
    GROUP BY ts
)
ORDER BY ts ASC

┌──────────────────ts─┬─uniq─┐
│ 2021-04-29 00:00:00 │    2 │
│ 2021-04-30 00:00:00 │    3 │
│ 2021-05-01 00:00:00 │    4 │
│ 2021-05-02 00:00:00 │    5 │
│ 2021-05-03 00:00:00 │    7 │
└─────────────────────┴──────┘
```

## Using runningAccumulate (incorrect result over blocks)

```sql
SELECT
    ts,
    runningAccumulate(state) AS uniq
FROM
(
    SELECT
        toStartOfDay(ts) AS ts,
        uniqExactState(user_id) AS state
    FROM events
    GROUP BY ts
    ORDER BY ts ASC
)
ORDER BY ts ASC

┌──────────────────ts─┬─uniq─┐
│ 2021-04-29 00:00:00 │    2 │
│ 2021-04-30 00:00:00 │    3 │
│ 2021-05-01 00:00:00 │    4 │
│ 2021-05-02 00:00:00 │    5 │
│ 2021-05-03 00:00:00 │    7 │
└─────────────────────┴──────┘
```
