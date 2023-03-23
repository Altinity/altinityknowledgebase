---
title: "Why is simple `SELECT count()` Slow in ClickHouse?"
linkTitle: "Slow `SELECT count()`"
weight: 100
description: >-
---

## Why is simple `SELECT count()` Slow in ClickHouse?

ClickHouse is a columnar database that provides excellent performance for analytical queries. However, in some cases, a simple count query can be slow. In this article, we'll explore the reasons why this can happen and how to optimize the query.

### Three Strategies for Counting Rows in ClickHouse

There are three ways to count rows in a table in ClickHouse:

1. `optimize_trivial_count_query`: This strategy extracts the number of rows from the table metadata. It's the fastest and most efficient way to count rows, but it only works for simple count queries.

2. `allow_experimental_projection_optimization`: This strategy uses a virtual projection called _minmax_count_projection to count rows. It's faster than scanning the table but slower than the trivial count query.

3. Scanning the smallest column in the table and reading rows from that. This is the slowest strategy and is only used when the other two strategies can't be used.

### Why Does ClickHouse Sometimes Choose the Slowest Counting Strategy?

In some cases, ClickHouse may choose the slowest counting strategy even when there are faster options available. Here are some possible reasons why this can happen:

1. Row policies are used on the table: If row policies are used, ClickHouse needs to filter rows to give the proper count. You can check if row policies are used by selecting from system.row_policies.

2. Experimental light-weight delete feature was used on the table: If the experimental light-weight delete feature was used, ClickHouse may use the slowest counting strategy. You can check this by looking into parts_columns for the column named _row_exists. To do this, run the following query:

```sql
SELECT DISTINCT database, table FROM system.parts_columns WHERE column = '_row_exists';
```

You can also refer to this issue on GitHub for more information: https://github.com/ClickHouse/ClickHouse/issues/47930.

3. `SELECT FINAL` or `final=1` setting is used.

4. `max_parallel_replicas > 1` is used.

5. Sampling is used.

6. Some other features like `allow_experimental_query_deduplication` or `empty_result_for_aggregation_by_empty_set` is used.
