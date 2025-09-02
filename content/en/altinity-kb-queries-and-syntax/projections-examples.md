---
title: "ClickHouse® Projections"
linkTitle: "ClickHouse Projections"
description: >
    Using this ClickHouse feature to optimize queries
keywords: 
  - clickhouse projections
  - clickhouse projection vs materialized view
---

Projections in ClickHouse act as inner tables within a main table, functioning as a mechanism to optimize queries by using these inner tables when only specific columns are needed. Essentially, a projection is similar to a [Materialized View](/altinity-kb-schema-design/materialized-views/) with an [AggregatingMergeTree engine](/engines/mergetree-table-engine-family/aggregatingmergetree/), designed to be automatically populated with relevant data.

However, too many projections can lead to excess storage, much like overusing Materialized Views. Projections share the same lifecycle as the main table, meaning they are automatically backfilled and don’t require query rewrites, which is particularly advantageous when integrating with BI tools.

Projection parts are stored within the main table parts, and their merges occur simultaneously as the main table merges, ensuring data consistency without additional maintenance.

compared to a separate table+MV setup:
- A separate table gives you more freedom (like partitioning, granularity, etc), but projections - more consistency (parts managed as a whole)
- Projections do not support many features (like indexes and FINAL).  That becomes better with recent versions, but still a drawback

The design approach for projections is the same as for indexes. Create a table and give it to users.  If you encounter a slower query, add a projection for that particular query (or set of similar queries). You can create 10+ projections per table, materialize, drop, etc - the very same as indexes.  You exchange query speed for disk space/IO and CPU needed to build and rebuild projections on merges.

## Links

* Amos Bird - kuaishou.com - Projections in ClickHouse. [slides](https://github.com/ClickHouse/clickhouse-presentations/blob/master/percona2021/projections.pdf). [video](https://youtu.be/jJ5VuLr2k5k?list=PLWhC0zeznqkkNYzcvHEfZ8hly3Cu9ojKk)
* [Documentation](https://clickhouse.tech/docs/en/engines/table-engines/mergetree-family/mergetree/#projections)
* [tinybird blog article](https://blog.tinybird.co/2021/07/09/projections/) 
* ClickHouse presentation on Projections https://www.youtube.com/watch?v=QDAJTKZT8y4
* Blog video https://clickhouse.com/videos/how-to-a-clickhouse-query-using-projections


## Why is a ClickHouse projection not used?

A query analyzer should have a reason for using a projection and should not have any limitation to do so.  

- the query should use ONLY the columns defined in the projection.
- There should be a lot of data to read from the main table (gigabytes)
- for ORDER BY projection WHERE statement referring to a column should be in the query
- FINAL queries do not work with projections.
- tables with DELETEd rows do not work with projections. This is because rows in a projection may be affected by a DELETE operation. But there is a MergeTree setting lightweight_mutation_projection_mode to change the behavior (Since 24.7)
- Projection is used only if it is cheaper to read from it than from the table (expected amount of rows and GBs read is smaller)
- Projection should be materialized.  Verify that all parts have the needed projection by comparing system.parts and system.projection_parts (see query below)
- a bug in a Clickhouse version.  Look at [changelog](https://clickhouse.com/docs/whats-new/changelog) and search for projection.
- If there are many projections per table, the analyzer can select any of them. If you think that it is better, use settings `preferred_optimize_projection_name` or `force_optimize_projection_name`
- If expressions are used instead of plain column names, the query should use the exact expression as defined in the projection with the same functions and modifiers. Use column aliases to make the query the very same as in the projection definition:

```sql
CREATE TABLE test
(
    a Int64,
    ts DateTime,
    week alias toStartOfWeek(ts),
    PROJECTION weekly_projection
    (
        SELECT week, sum(a) group by week
    )
)
ENGINE = MergeTree ORDER BY a;

insert into test
select number, now()-number*100
from numbers(1e7);

--explain indexes=1
select week, sum(a) from test group by week
settings force_optimize_projection=1;
```

https://fiddle.clickhouse.com/7f331eb2-9408-4813-9c67-caef4cdd227d

Explain result: ReadFromMergeTree (weekly_projection) 

```
Expression ((Project names + Projection))
  Aggregating
    Expression
      ReadFromMergeTree (weekly_projection)
      Indexes:
        PrimaryKey
          Condition: true
          Parts: 9/9
          Granules: 9/1223
```

## check parts 

- has the projection materialized
- does not have lightweight deletes

```
SELECT
    p.database AS base_database,
    p.table AS base_table,
    p.name AS base_part_name,         -- Name of the part in the base table
    p.has_lightweight_delete,
    pp.active
FROM system.parts AS p  -- Alias for the base table's parts
LEFT JOIN system.projection_parts AS pp -- Alias for the projection's parts
ON    p.database = pp.database AND p.table = pp.table
  AND p.name = pp.parent_name
  AND pp.name = 'projection'
WHERE
    p.database = 'database'
    AND p.table = 'table'
    AND p.active  -- Consider only active parts of the base table
  -- and not pp.active          -- see only missed in the list
ORDER BY p.database, p.table, p.name;

```

## Recalculate on Merge

What happens in the case of non-trivial background merges in ReplacingMergeTree, AggregatingMergeTree and similar, and OPTIMIZE table DEDUPLICATE queries?

* Before version 24.8, projections became out of sync with the main data. 
* Since version 24.8, it is controlled by a new table-level setting:<br/>[deduplicate_merge_projection_mode](https://clickhouse.com/docs/en/operations/settings/merge-tree-settings#deduplicate_merge_projection_mode) = `throw`/`drop`/`rebuild`
* Somewhere later (before 25.3) `ignore` option was introduced.  It can be helpful for cases when SummingMergeTree is used with Projections and no DELETE operation in any flavor (Replacing/Collapsing/DELETE/ALTER DELETE) is executed over the table.

However, projection usage is still disabled for FINAL queries. So, you have to use OPTIMIZE FINAL or SELECT ...GROUP BY  instead of FINAL for fighting duplicates between parts 

```
CREATE TABLE users (uid Int16, name String, version Int16,
  projection xx (
     select name,uid,version order by name
  )
) ENGINE=ReplacingMergeTree order by uid
settings deduplicate_merge_projection_mode='rebuild'
  ;

INSERT INTO users
SELECT 
    number AS uid,
    concat('User_', toString(uid)) AS name,
    1 AS version  
FROM numbers(100000);

INSERT INTO users
SELECT 
    number AS uid,
    concat('User_', toString(uid)) AS name,
    2 AS version  
FROM numbers(100000);

SELECT 'duplicate',name,uid,version FROM users 
where name ='User_98304' 
settings force_optimize_projection=1 ;

SELECT 'dedup by group by/limit 1 by',name,uid,version FROM users 
where name ='User_98304' 
order by version DESC
limit 1 by uid
settings force_optimize_projection=1
;

optimize table users final ;

SELECT 'dedup after optimize',name,uid,version FROM users 
where name ='User_98304' 
settings force_optimize_projection=1 ;

```
https://fiddle.clickhouse.com/e1977a66-09ce-43c4-aabc-508c957d44d7


## System tables

- system.projections
- system.projection_parts
- system.projection_parts_columns

```
SELECT
    database,
    table,
    name,
    formatReadableSize(sum(data_compressed_bytes) AS size) AS compressed,
    formatReadableSize(sum(data_uncompressed_bytes) AS usize) AS uncompressed,
    round(usize / size, 2) AS compr_rate,
    sum(rows) AS rows,
    count() AS part_count
FROM system.projection_parts
WHERE active
GROUP BY
    database,
    table,
    name
ORDER BY size DESC;
```

## How to receive a list of tables with projections?

```
select database, table from system.tables
where create_table_query ilike '%projection%'
  and database <> 'system'
```

## Examples  

### Aggregating ClickHouse projections

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

You can create an `orderby projection` and include all columns of a table, but if a table is very wide it will double the amount of stored data. This example demonstrate a trick, we create an `orderby projection` and include primary key columns and the target column and sort by the target column. This allows using subquery to find [primary key values](../../engines/mergetree-table-engine-family/pick-keys/) and after that to query the table using the primary key. 

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



