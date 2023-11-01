---
title: "Adjustable table partitioning"
linkTitle: "Adjustable table partitioning"
weight: 100
description: >-
     Approach, which allow you to redefine partitioning without table creation.
---

In that example, partitioning is being calculated via `MATERIALIZED` column expression `toDate(toStartOfInterval(ts, toIntervalT(...)))`, but partition id also can be generated on application side and inserted to ClickHouse as is.

```sql
CREATE TABLE tbl
(
    `ts` DateTime,
    `key` UInt32,
    `partition_key` Date MATERIALIZED toDate(toStartOfInterval(ts, toIntervalYear(1)))
)
ENGINE = MergeTree
PARTITION BY (partition_key, ignore(ts))
ORDER BY key;

SET send_logs_level = 'trace';

INSERT INTO tbl SELECT toDateTime(toDate('2020-01-01') + number) as ts, number as key FROM numbers(300);

Renaming temporary part tmp_insert_20200101-0_1_1_0 to 20200101-0_1_1_0

INSERT INTO tbl SELECT toDateTime(toDate('2021-01-01') + number) as ts, number as key FROM numbers(300);

Renaming temporary part tmp_insert_20210101-0_2_2_0 to 20210101-0_2_2_0

ALTER TABLE tbl
    MODIFY COLUMN `partition_key` Date MATERIALIZED toDate(toStartOfInterval(ts, toIntervalMonth(1)));

INSERT INTO tbl SELECT toDateTime(toDate('2022-01-01') + number) as ts, number as key FROM numbers(300);

Renaming temporary part tmp_insert_20220101-0_3_3_0 to 20220101-0_3_3_0
Renaming temporary part tmp_insert_20220201-0_4_4_0 to 20220201-0_4_4_0
Renaming temporary part tmp_insert_20220301-0_5_5_0 to 20220301-0_5_5_0
Renaming temporary part tmp_insert_20220401-0_6_6_0 to 20220401-0_6_6_0
Renaming temporary part tmp_insert_20220501-0_7_7_0 to 20220501-0_7_7_0
Renaming temporary part tmp_insert_20220601-0_8_8_0 to 20220601-0_8_8_0
Renaming temporary part tmp_insert_20220701-0_9_9_0 to 20220701-0_9_9_0
Renaming temporary part tmp_insert_20220801-0_10_10_0 to 20220801-0_10_10_0
Renaming temporary part tmp_insert_20220901-0_11_11_0 to 20220901-0_11_11_0
Renaming temporary part tmp_insert_20221001-0_12_12_0 to 20221001-0_12_12_0


INSERT INTO tbl SELECT toDateTime(toDate('2023-01-01') + number) as ts, number as key FROM numbers(5);

Renaming temporary part tmp_insert_20230101-0_13_13_0 to 20230101-0_13_13_0
Renaming temporary part tmp_insert_20230102-0_14_14_0 to 20230102-0_14_14_0
Renaming temporary part tmp_insert_20230103-0_15_15_0 to 20230103-0_15_15_0
Renaming temporary part tmp_insert_20230104-0_16_16_0 to 20230104-0_16_16_0
Renaming temporary part tmp_insert_20230105-0_17_17_0 to 20230105-0_17_17_0


SELECT _partition_id, min(ts), max(ts), count() FROM tbl GROUP BY _partition_id ORDER BY _partition_id;

┌─_partition_id─┬─────────────min(ts)─┬─────────────max(ts)─┬─count()─┐
│ 20200101-0    │ 2020-01-01 00:00:00 │ 2020-10-26 00:00:00 │     300 │
│ 20210101-0    │ 2021-01-01 00:00:00 │ 2021-10-27 00:00:00 │     300 │
│ 20220101-0    │ 2022-01-01 00:00:00 │ 2022-01-31 00:00:00 │      31 │
│ 20220201-0    │ 2022-02-01 00:00:00 │ 2022-02-28 00:00:00 │      28 │
│ 20220301-0    │ 2022-03-01 00:00:00 │ 2022-03-31 00:00:00 │      31 │
│ 20220401-0    │ 2022-04-01 00:00:00 │ 2022-04-30 00:00:00 │      30 │
│ 20220501-0    │ 2022-05-01 00:00:00 │ 2022-05-31 00:00:00 │      31 │
│ 20220601-0    │ 2022-06-01 00:00:00 │ 2022-06-30 00:00:00 │      30 │
│ 20220701-0    │ 2022-07-01 00:00:00 │ 2022-07-31 00:00:00 │      31 │
│ 20220801-0    │ 2022-08-01 00:00:00 │ 2022-08-31 00:00:00 │      31 │
│ 20220901-0    │ 2022-09-01 00:00:00 │ 2022-09-30 00:00:00 │      30 │
│ 20221001-0    │ 2022-10-01 00:00:00 │ 2022-10-27 00:00:00 │      27 │
│ 20230101-0    │ 2023-01-01 00:00:00 │ 2023-01-01 00:00:00 │       1 │
│ 20230102-0    │ 2023-01-02 00:00:00 │ 2023-01-02 00:00:00 │       1 │
│ 20230103-0    │ 2023-01-03 00:00:00 │ 2023-01-03 00:00:00 │       1 │
│ 20230104-0    │ 2023-01-04 00:00:00 │ 2023-01-04 00:00:00 │       1 │
│ 20230105-0    │ 2023-01-05 00:00:00 │ 2023-01-05 00:00:00 │       1 │
└───────────────┴─────────────────────┴─────────────────────┴─────────┘


SELECT count() FROM tbl WHERE ts > '2023-01-04';

Key condition: unknown
MinMax index condition: (column 0 in [1672758001, +Inf))
Selected 1/17 parts by partition key, 1 parts by primary key, 1/1 marks by primary key, 1 marks to read from 1 ranges
Spreading mark ranges among streams (default reading)
Reading 1 ranges in order from part 20230105-0_17_17_0, approx. 1 rows starting from 0
```
