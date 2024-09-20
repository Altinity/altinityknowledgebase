---
title: "Projections"
linkTitle: "Projections"
description: >
    Projections 
---
## Links

* Amos Bird - kuaishou.com - Projections in ClickHouse. [slides](https://github.com/ClickHouse/clickhouse-presentations/blob/master/percona2021/projections.pdf). [video](https://youtu.be/jJ5VuLr2k5k?list=PLWhC0zeznqkkNYzcvHEfZ8hly3Cu9ojKk)
* [Documentation](https://clickhouse.tech/docs/en/engines/table-engines/mergetree-family/mergetree/#projections)
* [tinybird blog article](https://blog.tinybird.co/2021/07/09/projections/) 
* ClickHouse presentation on Projections https://www.youtube.com/watch?v=QDAJTKZT8y4

## Why is a projection not used?

- Projection is used only if it is cheaper to read from it than from the table.
- Projection should be materialized.  Verify that all parts need projection by looking into the system.parts`
- If there are many projections, some other projection can be used. Force by settings `preferred_optimize_projection_name` and `force_optimize_projection_name`
- In the projection, all fields from the query must be included. Use aliases to make the query columns the very same as in the projection definition:

```sql
CREATE TABLE test
(
    a Int64,
    ts DateTime,
    week alias toStartOfWeek(ts),
    PROJECTION p
    (
        SELECT week, sum(a) group by week
    )
)
ENGINE = MergeTree ORDER BY a;

insert into test
select number, now()-number*100
from numbers(1e7);

select week, sum(a) from test group by week
settings force_optimize_projection=1;
```

## Recalculate on Merge

What happens in the case of non-trivial background merges in ReplacingMergeTree, AggregatingMergeTree and similar, and OPTIMIZE table DEDUPLICATE queries?

Before version 24.8, projections became out of sync with the main data.

Since version 24.8, it is controlled by a new table-level setting:

[deduplicate_merge_projection_mode](https://clickhouse.com/docs/en/operations/settings/merge-tree-settings#deduplicate_merge_projection_mode) = 'throw'/'drop'/'rebuild'


Since 24.7, we also have a setting to control the behavior w.r.t. lightweight deletes: lightweight_mutation_projection_mode.

## System tables

- system.projection_parts
- system.projection_parts_columns

## Examples  

### Aggregating projections

```sql
create table z(Browser String, Country UInt8, F Float64)
Engine=MergeTree
order by Browser;

insert into z
     select toString(number%9999),
     number%33, 1
from numbers(100000000);

--Q1)
select sum(F), Browser
from z
group by Browser format Null;
Elapsed: 0.205 sec. Processed 100.00 million rows

--Q2)
select sum(F), Browser, Country
from z
group by Browser,Country format Null;
Elapsed: 0.381 sec. Processed 100.00 million rows

--Q3)
select sum(F),count(), Browser, Country
from z
group by Browser,Country format Null;
Elapsed: 0.398 sec. Processed 100.00 million rows

alter table z add projection pp
   (select Browser,Country, count(), sum(F)
    group by Browser,Country);
alter table z materialize projection pp;

---- 0 = don't use proj, 1 = use projection
set allow_experimental_projection_optimization=1;

--Q1)
select sum(F), Browser
from z
group by Browser format Null;
Elapsed: 0.003 sec. Processed 22.43 thousand rows

--Q2)
select sum(F), Browser, Country
from z
group by Browser,Country format Null;
Elapsed: 0.004 sec. Processed 22.43 thousand rows

--Q3)
select sum(F),count(), Browser, Country
from z
group by Browser,Country format Null;
Elapsed: 0.005 sec. Processed 22.43 thousand rows
```

### Emulation of an inverted index using orderby projection

You can create an `orderby projection` and include all columns of a table, but if a table is very wide it will double of stored data. This example demonstrate a trick, we create an `orderby projection` and include primary key columns and the target column and sort by the target column. This allows using subquery to find [primary key values](../../engines/mergetree-table-engine-family/pick-keys/) and after that to query the table using the primary key. 

```sql
CREATE TABLE test_a
(
    `src` String,
    `dst` String,
    `other_cols` String,
    PROJECTION p1
    (
        SELECT
            src,
            dst
        ORDER BY dst
    )
)
ENGINE = MergeTree
ORDER BY src;

insert into test_a select number, -number, 'other_col '||toString(number) from numbers(1e8);

select * from test_a where src='42';
┌─src─┬─dst─┬─other_cols───┐
│ 42  │ -42 │ other_col 42 │
└─────┴─────┴──────────────┘
1 row in set. Elapsed: 0.005 sec. Processed 16.38 thousand rows, 988.49 KB (3.14 million rows/s., 189.43 MB/s.)


select * from test_a where dst='-42';
┌─src─┬─dst─┬─other_cols───┐
│ 42  │ -42 │ other_col 42 │
└─────┴─────┴──────────────┘
1 row in set. Elapsed: 0.625 sec. Processed 100.00 million rows, 1.79 GB (160.05 million rows/s., 2.86 GB/s.)

-- optimization using projection
select * from test_a where src in (select src from test_a where dst='-42') and dst='-42';
┌─src─┬─dst─┬─other_cols───┐
│ 42  │ -42 │ other_col 42 │
└─────┴─────┴──────────────┘
1 row in set. Elapsed: 0.013 sec. Processed 32.77 thousand rows, 660.75 KB (2.54 million rows/s., 51.26 MB/s.)
```

**Elapsed: 0.625 sec. Processed 100.00 million rows** -- not optimized

VS

**Elapsed: 0.013 sec. Processed 32.77 thousand rows** -- optimized



