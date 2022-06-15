---
title: "FINAL clause speed"
linkTitle: "FINAL clause speed"
description: >
    FINAL clause speed
---
`SELECT * FROM table FINAL`

* Before 20.5 - always executed in a single thread and slow.
* Since 20.5  - final can be parallel, see [https://github.com/ClickHouse/ClickHouse/pull/10463](https://github.com/ClickHouse/ClickHouse/pull/10463)
* Since 20.10 - you can use `do_not_merge_across_partitions_select_final` setting.
* Sinse 22.6  - final even more parallel, see [https://github.com/ClickHouse/ClickHouse/pull/36396](https://github.com/ClickHouse/ClickHouse/pull/36396)

See [https://github.com/ClickHouse/ClickHouse/pull/15938](https://github.com/ClickHouse/ClickHouse/pull/15938) and [https://github.com/ClickHouse/ClickHouse/issues/11722](https://github.com/ClickHouse/ClickHouse/issues/11722)

So it can work in the following way:

1. Daily partitioning
2. After day end + some time interval during which you can get some updates - for example at 3am / 6am you do `OPTIMIZE TABLE xxx PARTITION 'prev_day' FINAL`
3. In that case using that FINAL with `do_not_merge_across_partitions_select_final` will be cheap.

```sql
DROP TABLE IF EXISTS repl_tbl;

CREATE TABLE repl_tbl
(
    `key` UInt32,
    `val_1` UInt32,
    `val_2` String,
    `val_3` String,
    `val_4` String,
    `val_5` UUID,
    `ts` DateTime
)
ENGINE = ReplacingMergeTree(ts)
PARTITION BY toDate(ts)
ORDER BY key;

​
INSERT INTO repl_tbl SELECT number as key, rand() as val_1, randomStringUTF8(10) as val_2, randomStringUTF8(5) as val_3, randomStringUTF8(4) as val_4, generateUUIDv4() as val_5, '2020-01-01 00:00:00' as ts FROM numbers(10000000);
OPTIMIZE TABLE repl_tbl PARTITION ID '20200101' FINAL;
INSERT INTO repl_tbl SELECT number as key, rand() as val_1, randomStringUTF8(10) as val_2, randomStringUTF8(5) as val_3, randomStringUTF8(4) as val_4, generateUUIDv4() as val_5, '2020-01-02 00:00:00' as ts FROM numbers(10000000);
OPTIMIZE TABLE repl_tbl PARTITION ID '20200102' FINAL;
INSERT INTO repl_tbl SELECT number as key, rand() as val_1, randomStringUTF8(10) as val_2, randomStringUTF8(5) as val_3, randomStringUTF8(4) as val_4, generateUUIDv4() as val_5, '2020-01-03 00:00:00' as ts FROM numbers(10000000);
OPTIMIZE TABLE repl_tbl PARTITION ID '20200103' FINAL;
INSERT INTO repl_tbl SELECT number as key, rand() as val_1, randomStringUTF8(10) as val_2, randomStringUTF8(5) as val_3, randomStringUTF8(4) as val_4, generateUUIDv4() as val_5, '2020-01-04 00:00:00' as ts FROM numbers(10000000);
OPTIMIZE TABLE repl_tbl PARTITION ID '20200104' FINAL;

SYSTEM STOP MERGES repl_tbl;
INSERT INTO repl_tbl SELECT number as key, rand() as val_1, randomStringUTF8(10) as val_2, randomStringUTF8(5) as val_3, randomStringUTF8(4) as val_4, generateUUIDv4() as val_5, '2020-01-05 00:00:00' as ts FROM numbers(10000000);
​

SELECT count() FROM repl_tbl WHERE NOT ignore(*)

┌──count()─┐
│ 50000000 │
└──────────┘

1 rows in set. Elapsed: 1.504 sec. Processed 50.00 million rows, 6.40 GB (33.24 million rows/s., 4.26 GB/s.)

SELECT count() FROM repl_tbl FINAL WHERE NOT ignore(*)

┌──count()─┐
│ 10000000 │
└──────────┘

1 rows in set. Elapsed: 3.314 sec. Processed 50.00 million rows, 6.40 GB (15.09 million rows/s., 1.93 GB/s.)

/* more that 2 time slower, and will get worse once you will have more data */

set do_not_merge_across_partitions_select_final=1;

SELECT count() FROM repl_tbl FINAL WHERE NOT ignore(*)

┌──count()─┐
│ 50000000 │
└──────────┘

1 rows in set. Elapsed: 1.850 sec. Processed 50.00 million rows, 6.40 GB (27.03 million rows/s., 3.46 GB/s.)

/* only 0.35 sec slower, and while partitions have about the same size that extra cost will be about constant */

```
