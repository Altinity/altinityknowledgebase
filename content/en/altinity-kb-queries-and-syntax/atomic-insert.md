---
title: "Atomic insert"
linkTitle: "Atomic insert"
description: >
    Atomic insert
---

Insert would be atomic only if those conditions met:

* Insert data only in single partition.
* Numbers of rows is less than `max_insert_block_size`.
* Table doesn't have Materialized Views \(there is no atomicity Table &lt;&gt; MV\)
* For TSV, TKSV, CSV, and JSONEachRow formats, setting `input_format_parallel_parsing=0` is set.

{% embed url="https://github.com/ClickHouse/ClickHouse/issues/9195\#issuecomment-587500824" %}



