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
    * Numbers of rows is less than `max_insert_block_size` (default is `1048545`) 
    * Parallel formatting is disabled (For TSV, TKSV, CSV, and JSONEachRow formats setting `input_format_parallel_parsing=0` is set).
* For INSERT SELECT:
    * Numbers of rows is less than `max_block_size`, `min_insert_block_size_rows` and `min_insert_block_size_bytes`

https://github.com/ClickHouse/ClickHouse/issues/9195#issuecomment-587500824
https://github.com/ClickHouse/ClickHouse/issues/5148#issuecomment-487757235
