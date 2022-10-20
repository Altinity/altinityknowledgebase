---
title: "Atomic insert"
linkTitle: "Atomic insert"
description: >
    Atomic insert
---
An insert is atomic if it creates only one part.

An insert will create one part if:

* Data is inserted directly into a MergeTree table
* Data is inserted into a single partition.
* For INSERT FORMAT:
    * Number of rows is less than `max_insert_block_size` (default is `1048545`) 
    * Parallel formatting is disabled (For TSV, TKSV, CSV, and JSONEachRow formats setting `input_format_parallel_parsing=0` is set).
* For INSERT SELECT:
    * Number of rows is less than `max_block_size`
* Smaller blocks are properly squashed up to the configured block size (`min_insert_block_size_rows` and `min_insert_block_size_bytes`)
* The MergeTree table doesn't have Materialized Views (there is no atomicity Table <> MV)

https://github.com/ClickHouse/ClickHouse/issues/9195#issuecomment-587500824
https://github.com/ClickHouse/ClickHouse/issues/5148#issuecomment-487757235

## Example how to make a large insert atomically

### Generate test data in Native and TSV format ( 100 millions rows )

Text formats and Native format require different set of settings, here I want to find / demonstrate mandatory minumum of settings for any case.

```bash
clickhouse-client -q \
     'SELECT toInt64(number) A, toString(number) S FROM numbers(100000000) FORMAT Native' > t.native
clickhouse-client -q \
     'SELECT toInt64(number) A, toString(number) S FROM numbers(100000000) FORMAT TSV' > t.tsv
```

### Insert with default settings (not atomic)

```bash
DROP TABLE IF EXISTS trg;
CREATE TABLE trg(A Int64, S String) Engine=MergeTree ORDER BY A;

-- Load data in Native format
clickhouse-client  -q 'INSERT INTO trg FORMAT Native' <t.native

-- Check how many parts is created
SELECT 
    count(),
    min(rows),
    max(rows),
    sum(rows)
FROM system.parts
WHERE (level = 0) AND (table = 'trg');
┌─count()─┬─min(rows)─┬─max(rows)─┬─sum(rows)─┐
│      90 │    890935 │   1113585 │ 100000000 │
└─────────┴───────────┴───────────┴───────────┘

--- 90 parts! was created - not atomic



DROP TABLE IF EXISTS trg;
CREATE TABLE trg(A Int64, S String) Engine=MergeTree ORDER BY A;

-- Load data in TSV format
clickhouse-client  -q 'INSERT INTO trg FORMAT TSV' <t.tsv

-- Check how many parts is created
SELECT 
    count(),
    min(rows),
    max(rows),
    sum(rows)
FROM system.parts
WHERE (level = 0) AND (table = 'trg');
┌─count()─┬─min(rows)─┬─max(rows)─┬─sum(rows)─┐
│      85 │    898207 │   1449610 │ 100000000 │
└─────────┴───────────┴───────────┴───────────┘

--- 85 parts! was created - not atomic
```

### Insert with adjusted settings (atomic)

Atomic insert use more memory because it needs 100 millions rows in memory.

```bash
DROP TABLE IF EXISTS trg;
CREATE TABLE trg(A Int64, S String) Engine=MergeTree ORDER BY A;

clickhouse-client --input_format_parallel_parsing=0 \
                  --min_insert_block_size_bytes=0 \
                  --min_insert_block_size_rows=1000000000 \
                  -q 'INSERT INTO trg FORMAT Native' <t.native

-- Check that only one part is created
SELECT
    count(),
    min(rows),
    max(rows),
    sum(rows)
FROM system.parts
WHERE (level = 0) AND (table = 'trg');
┌─count()─┬─min(rows)─┬─max(rows)─┬─sum(rows)─┐
│       1 │ 100000000 │ 100000000 │ 100000000 │
└─────────┴───────────┴───────────┴───────────┘

-- 1 part, success.



DROP TABLE IF EXISTS trg;
CREATE TABLE trg(A Int64, S String) Engine=MergeTree ORDER BY A;

-- Load data in TSV format
clickhouse-client --input_format_parallel_parsing=0 \
                  --min_insert_block_size_bytes=0 \
                  --min_insert_block_size_rows=1000000000 \
                  -q 'INSERT INTO trg FORMAT TSV' <t.tsv

-- Check that only one part is created
SELECT 
    count(),
    min(rows),
    max(rows),
    sum(rows)
FROM system.parts
WHERE (level = 0) AND (table = 'trg');
┌─count()─┬─min(rows)─┬─max(rows)─┬─sum(rows)─┐
│       1 │ 100000000 │ 100000000 │ 100000000 │
└─────────┴───────────┴───────────┴───────────┘

-- 1 part, success.
```
