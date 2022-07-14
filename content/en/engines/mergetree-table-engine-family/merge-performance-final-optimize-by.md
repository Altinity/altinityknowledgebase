---
title: "Merge performance and OPTIMIZE FINAL"
linkTitle: "Merge performance and OPTIMIZE FINAL"
description: >
    Merge performance and OPTIMIZE FINAL DEDUPLICATE BY expr
---

## Merge Performance

Main things affecting the merge speed are:

* Schema (especially compression codecs, some bad types, sorting order...)
* Horizontal vs Vertical merge 
  * Horizontal = reads all columns at once, do merge sort, write new part
  * Vertical = first read columns from order by, do merge sort, write them to disk, remember permutation, then process the rest of columns on by one, applying permutation.
* compact vs wide parts
* Other things like server load, concurrent merges...

```sql
SELECT name, value
FROM system.merge_tree_settings
WHERE name LIKE '%vert%';

│ enable_vertical_merge_algorithm                  │ 1      
│ vertical_merge_algorithm_min_rows_to_activate    │ 131072
│ vertical_merge_algorithm_min_columns_to_activate │ 11
```

* **Vertical merge** will be used if part has more than 131072 rows and more than 11 columns in the table.
  
```sql
-- Disable Vertical Merges
ALTER TABLE test MODIFY SETTING enable_vertical_merge_algorithm = 0
```

* **Horizontal merge** used by default, will use more memory if there are more than 80 columns in the table

## OPTIMIZE TABLE example FINAL DEDUPLICATE BY expr

When using deduplicate feature in `OPTIMIZE FINAL`, the question is which row will remain and won't be deduped?

For SELECT operations Clickhouse does not guarantee the order of the resultset unless you specify ORDER BY. This random ordering is affected by different parameters, like for example `max_threads`. 

In a merge operation ClickHouse reads rows sequentially in storage order, which is determined by ORDER BY specified in CREATE TABLE statement, and only the first unique row in that order survives deduplication. So it is a bit different from how SELECT actually works. As FINAL clause is used then ClickHouse will merge all rows across all partitions (If it is not specified then the merge operation will be done per partition), and so the first unique row of the first partition will survive deduplication. Merges are single-threaded because it is too complicated to apply merge ops in-parallel, and it generally makes no sense.

* [https://github.com/ClickHouse/ClickHouse/pull/17846](https://github.com/ClickHouse/ClickHouse/pull/17846)
* [https://clickhouse.com/docs/en/sql-reference/statements/optimize/](https://clickhouse.com/docs/en/sql-reference/statements/optimize/)
