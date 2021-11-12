---
title: "Atomic insert"
linkTitle: "Atomic insert"
description: >
    Atomic insert
---
An insert is atomic if it creates only one part.

An insert will create one part if:

* Data is inserted directly into a MergeTree table
* The MergeTree table doesn't have Materialized Views (there is no atomicity Table <> MV)
* Data is inserted into a single partition.
* For INSERT FORMAT:
    * Number of rows is less than `max_insert_block_size` (default is `1048545`) 
    * Parallel formatting is disabled (For TSV, TKSV, CSV, and JSONEachRow formats setting `input_format_parallel_parsing=0` is set).
* For INSERT SELECT:
    * Number of rows is less than `max_block_size`
* Smaller blocks are properly squashed up to the configured block size (`min_insert_block_size_rows` and `min_insert_block_size_bytes`)

https://github.com/ClickHouse/ClickHouse/issues/9195#issuecomment-587500824
https://github.com/ClickHouse/ClickHouse/issues/5148#issuecomment-487757235

## Examples

```bash
create table trg(A Int64, S String) Engine=MergeTree order by A;

-- Generate test data in Native and TSV format ( 100 millions rows )
clickhouse-client -q \
     'select toInt64(number) A, toString(number) S from numbers(100000000) format Native' > t.native
clickhouse-client -q \
     'select toInt64(number) A, toString(number) S from numbers(100000000) format TSV' > t.tsv

-- Load data in Native format
clickhouse-client --input_format_parallel_parsing=0 \
                  --min_insert_block_size_bytes=0 \
                  --min_insert_block_size_rows=1000000000 \
                  --max_insert_block_size=1000000000  \
                  -q 'insert into trg format Native' <t.native

-- Check that only one part is created
select count(), min(rows), max(rows) from system.parts where level=0 and table='trg'　;
┌─count()─┬─min(rows)─┬─max(rows)─┐
│       1 │ 100000000 │ 100000000 │
└─────────┴───────────┴───────────┘

truncate table trg　;

-- Load data in TSV format
clickhouse-client --input_format_parallel_parsing=0 \
                  --min_insert_block_size_bytes=0 \
                  --min_insert_block_size_rows=1000000000 \
                  --max_insert_block_size=1000000000  \
                  -q 'insert into trg format TSV' <t.tsv

-- Check that only one part is created
select count(), min(rows), max(rows) from system.parts where level=0 and table='trg'　; 
┌─count()─┬─min(rows)─┬─max(rows)─┐
│       1 │ 100000000 │ 100000000 │
└─────────┴───────────┴───────────┘
```
