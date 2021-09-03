---
title: "Time-series alignment with interpolation"
linkTitle: "Time-series alignment with interpolation"
description: >
    Time-series alignment with interpolation
---


```sql
DROP TABLE test_ts_interpolation;

--- generate test data

CREATE TABLE test_ts_interpolation
ENGINE = Log AS
SELECT
    ((number * 100) + 50) - (rand() % 100) AS timestamp,
    transform(rand() % 2, [0, 1], ['A', 'B'], '') AS ts,
    if(ts = 'A', timestamp * 10, timestamp * 100) AS value
FROM numbers(1000000);


SELECT * FROM test_ts_interpolation;

-- interpolation select with window functions

SELECT 
    timestamp,
    if(
        ts = 'A',
        toFloat64(value),
        prev_a.2 + (timestamp - prev_a.1 ) * (next_a.2 - prev_a.2) / ( next_a.1 - prev_a.1)
    ) as a_value,
    if(
        ts = 'B',
        toFloat64(value),
        prev_b.2 + (timestamp - prev_b.1 ) * (next_b.2 - prev_b.2) / ( next_b.1 - prev_b.1)
    ) as b_value
FROM 
(
    SELECT 
        timestamp,
        ts,
        value,
        anyLastIf((timestamp,value), ts='A') OVER (ORDER BY timestamp ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS prev_a,
        anyLastIf((timestamp,value), ts='A') OVER (ORDER BY timestamp DESC ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS next_a,
        anyLastIf((timestamp,value), ts='B') OVER (ORDER BY timestamp ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS prev_b,
        anyLastIf((timestamp,value), ts='B') OVER (ORDER BY timestamp DESC ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS next_b
    FROM 
    test_ts_interpolation
)
```
