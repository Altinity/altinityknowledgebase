---
title: "Backfill/populate MV in a controlled manner"
linkTitle: "Backfill/populate MV in a controlled manner"
description: >
    Backfill/populate MV in a controlled manner
---
Q. How to populate MV create with TO syntax? INSERT INTO mv SELECT \* FROM huge_table? Will it work if the source table has billions of rows?

A. single huge `insert ... select ...` actually will work, but it will take A LOT of time, and during that time lot of bad things can happen (lack of disk space, hard restart etc). Because of that, it's better to do such backfill in a more controlled manner and in smaller pieces.

One of the best options is to fill one partition at a time, and if it breaks you can drop the partition and refill it.

If you need to construct a single partition from several sources - then the following approach may be the best.

```sql
CREATE TABLE mv_import AS mv;
INSERT INTO mv_import SELECT * FROM huge_table WHERE toYYYYMM(ts) = 202105;
/* or other partition expression*/

/* that insert select may take a lot of time, if something bad will happen
  during that - just truncate mv_import and restart the process */

/* after successful loading of mv_import do*/
ALTER TABLE mv ATTACH PARTITION ID '202105' FROM  mv_import;
```

See also [https://clickhouse.tech/docs/en/sql-reference/statements/alter/partition/\#alter_attach-partition-from](https://clickhouse.tech/docs/en/sql-reference/statements/alter/partition/\#alter_attach-partition-from).

Q. I still do not have enough RAM to GROUP BY the whole partition.

A. Push aggregating to the background during MERGES

There is a modified version of MergeTree Engine, called [AggregatingMergeTree](https://clickhouse.com/docs/en/engines/table-engines/mergetree-family/aggregatingmergetree).  That engine has additional logic that is applied to rows with the same set of values in columns that are specified in the table's ORDER BY expression.   All such rows are aggregated to only one rows using the aggregating functions defined in the column definitions.   There are two "special" column types, designed specifically for that purpose:

- [AggregatingFunction](https://clickhouse.com/docs/en/sql-reference/data-types/aggregatefunction)
- [SimpleAggregatingFunction](https://clickhouse.com/docs/en/sql-reference/data-types/simpleaggregatefunction)

INSERT ... SELECT operating over the very large partition will create data parts by 1M rows (min_insert_block_size_rows), those parts will be aggregated during the merge process the same way as GROUP BY do it, but the number of rows will be much less than the total rows in the partition and RAM usage too.  Merge combined with GROUP BY will create a new part with a much less number of rows. That data part possibly will be merged again with other data, but the number of rows will be not too big.

```sql
CREATE TABLE mv_import (
  id UInt64,
  ts SimpleAggregatingFunction(max,DateTime),  -- most fresh
  v1 SimpleAggregatingFunction(sum,UInt64),    -- just sum
  v2 SimpleAggregatingFunction(max,String),    -- some not empty string
  v3 AggregatingFunction(argMax,String,ts)     -- last value
) ENGINE = AggregatingMergeTree()
ORDER BY id;

INSERT INTO mv_import
SELECT id,                              -- ORDER BY column
   ts,v1,v2,                            -- state for SimpleAggregatingFunction the same as value
   initializeAggregation(argMax,v3,ts)  -- we need to convert from values to States for columns with AggregatingFunction type
FROM huge_table
WHERE toYYYYMM(ts) = 202105;

ATTACH  ...
```

Actually, the first GROUP BY run will happen just before 1M rows will be stored on disk as a data part. You may disable that behavior by switching off [optimize_on_insert](https://clickhouse.com/docs/en/operations/settings/settings#optimize-on-insert) setting if you have heavy calculations during aggregation.





