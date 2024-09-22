---
title: "Time-series alignment with interpolation"
linkTitle: "Time-series alignment with interpolation"
description: >
    Time-series alignment with interpolation
---

This article demonstrates how to perform time-series data alignment with interpolation using window functions in ClickHouse. The goal is to align two different time-series (A and B) on the same timestamp axis and fill the missing values using linear interpolation.

Step-by-Step Implementation
We begin by creating a table with test data that simulates two time-series (A and B) with randomly distributed timestamps and values. Then, we apply interpolation to fill missing values for each time-series based on the surrounding data points.

#### 1. Drop Existing Table (if it exists)

```sql
DROP TABLE test_ts_interpolation;
```
This ensures that any previous versions of the table are removed.

#### 2. Generate Test Data
In this step, we generate random time-series data with timestamps and values for series A and B. The values are calculated differently for each series:

```sql
CREATE TABLE test_ts_interpolation
ENGINE = Log AS
SELECT
    ((number * 100) + 50) - (rand() % 100) AS timestamp, -- random timestamp generation
    transform(rand() % 2, [0, 1], ['A', 'B'], '') AS ts, -- randomly assign series 'A' or 'B'
    if(ts = 'A', timestamp * 10, timestamp * 100) AS value -- different value generation for each series
FROM numbers(1000000);
```
Here, the timestamp is generated randomly and assigned to either series A or B using the transform() function. The value is calculated based on the series type (A or B), with different multipliers for each.

#### 3. Preview the Generated Data
After generating the data, you can inspect it by running a simple SELECT query:
```sql
SELECT * FROM test_ts_interpolation;
```
This will show the randomly generated timestamps, series (A or B), and their corresponding values.

#### 4. Perform Interpolation with Window Functions
To align the time-series and interpolate missing values, we use window functions in the following query:

```sql
SELECT 
    timestamp,
    if(
        ts = 'A',
        toFloat64(value), -- If the current series is 'A', keep the original value
        prev_a.2 + (timestamp - prev_a.1 ) * (next_a.2 - prev_a.2) / ( next_a.1 - prev_a.1) -- Interpolate for 'A'
    ) as a_value,
    if(
        ts = 'B',
        toFloat64(value), -- If the current series is 'B', keep the original value
        prev_b.2 + (timestamp - prev_b.1 ) * (next_b.2 - prev_b.2) / ( next_b.1 - prev_b.1) -- Interpolate for 'B'
    ) as b_value
FROM 
(
    SELECT 
        timestamp,
        ts,
        value,
        -- Find the previous and next values for series 'A'
        anyLastIf((timestamp,value), ts='A') OVER (ORDER BY timestamp ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS prev_a,
        anyLastIf((timestamp,value), ts='A') OVER (ORDER BY timestamp DESC ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS next_a,
        -- Find the previous and next values for series 'B'
        anyLastIf((timestamp,value), ts='B') OVER (ORDER BY timestamp ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS prev_b,
        anyLastIf((timestamp,value), ts='B') OVER (ORDER BY timestamp DESC ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS next_b
    FROM 
    test_ts_interpolation
)

```
#### Explanation:
**Timestamp Alignment:** 
We align the timestamps of both series (A and B) and handle missing data points.

**Interpolation Logic:**
For each A-series timestamp, if the current series is not A, we calculate the interpolated value using the linear interpolation formula:

```bash
interpolated_value = prev_a.2 + ((timestamp - prev_a.1) / (next_a.1 - prev_a.1)) * (next_a.2 - prev_a.2)
```
Similarly, for the B series, interpolation is calculated between the previous (prev_b) and next (next_b) known values.

**Window Functions:**
anyLastIf() is used to fetch the previous or next values for series A and B based on the timestamps.
We use window functions to efficiently calculate these values over the ordered sequence of timestamps.


By using window functions and interpolation, we can align time-series data with irregular timestamps and fill in missing values based on nearby data points. This technique is useful in scenarios where data is recorded at different times or irregular intervals across multiple series.

