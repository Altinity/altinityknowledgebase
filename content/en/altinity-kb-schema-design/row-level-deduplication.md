---
title: "ClickHouse® row-level deduplication"
linkTitle: "ClickHouse® row-level deduplication"
weight: 100
description: >-
     ClickHouse® row-level deduplication.
---

## ClickHouse® row-level deduplication.

(This article is about row-level deduplication of already ingested data. For insert/block-level deduplication and insert idempotency, see [Insert Deduplication / Insert Idempotency](https://kb.altinity.com/altinity-kb-schema-design/insert_deduplication/). For materialized-view retry semantics, see [Idempotent inserts into a materialized view](https://kb.altinity.com/altinity-kb-schema-design/materialized-views/idempotent_inserts_mv/).)

There is quite common requirement to do deduplication on a record level in ClickHouse.
* Sometimes duplicates are appear naturally on collector side. 
* Sometime they appear due the the fact that message queue system (Kafka/Rabbit/etc) offers at-least-once guarantees.  
* Sometimes you just expect insert idempotency on row level.

For the general case, ClickHouse does not provide a cheap built-in way to enforce arbitrary row-level uniqueness across an already large table.
That is a different problem from retry-safe insert deduplication, which ClickHouse supports separately for `MergeTree` family inserts.

The reason is simple: to check if the row already exists you need a lookup that is closer to a key-value access pattern (which is not what ClickHouse is optimized for),
in general case - across the whole huge table (which can be terabyte/petabyte size).

But there many usecases when you can achieve something like row-level deduplication in ClickHouse:

### Approach 0. Make deduplication before ingesting data to ClickHouse

Pros:
- you have full control
- clean and simple schema and selects in ClickHouse

Cons:
- extra coding and 'moving parts', storing some ids somewhere
- check if row exists in ClickHouse before insert can give non-satisfying results if you use ClickHouse cluster (i.e. Replicated / Distributed tables) - due to eventual consistency.

### Approach 1. Allow duplicates during ingestion. 

Remove them on SELECT level (by things like GROUP BY)

Pros:
- simple inserts

Cons:
- complicates selects
- all selects will be significantly slower

### Approach 2. Eventual deduplication using ReplacingMergeTree  

Pros:
- simple

Cons:
- can force you to use suboptimal ORDER BY (which will guarantee record uniqueness)
- deduplication is eventual - you never know when it will happen, and you will get some duplicates if you don't use `FINAL`
- selects with `FINAL` (`select * from table_name FINAL`) add overhead and should be benchmarked
  - older versions often needed manual optimization https://github.com/ClickHouse/ClickHouse/issues/31411
  - performance has improved significantly in recent releases, so `FINAL` is often acceptable in production workloads https://clickhouse.com/blog/common-getting-started-issues-with-clickhouse
  - additional tuning notes: https://kb.altinity.com/altinity-kb-queries-and-syntax/altinity-kb-final-clause-speed/

### Approach 3. Eventual deduplication using CollapsingMergeTree 

Pros:
- you can make the proper aggregations of last state w/o `FINAL` (bookkeeping-alike sums, counts etc)

Cons:
- complicated
- can force you to use suboptimal ORDER BY (which will guarantee record uniqueness)
- you need to store previous state of the record somewhere, or extract it before ingestion from ClickHouse
- deduplication is eventual (same as with Replacing)

### Approach 4. Eventual deduplication using Summing/Aggregating/CoalescingMergeTree

use SimpleAggregateFunction( anyLast, ...) or AggregateFunction with argMax for Summing/AggregatingMT.
CoalescingMergeTree implies anyLast by default

Pros:
- you can finish deduplication with `GROUP BY` instead of `FINAL` (it's faster)

Cons:
- quite complicated
- can force you to use suboptimal ORDER BY (which will guarantee record uniqueness)
- deduplication is eventual (same as with ReplacingMergeTree)

Example: keep the latest version of each row in an `AggregatingMergeTree` table and read the finalized state with `GROUP BY`:

```sql
create table Example4Raw
(
    id UInt64,
    version UInt64,
    metric UInt64
)
engine = MergeTree
order by (id, version);

create table Example4Agg
(
    id UInt64,
    metric_state AggregateFunction(argMax, UInt64, UInt64)
)
engine = AggregatingMergeTree
order by id;

create materialized view Example4AggMV to Example4Agg as
select id, argMaxState(metric, version) as metric_state
from Example4Raw
group by id;
```
In that example the result contains `id = 1, metric = 20` and `id = 2, metric = 30`.

 
```sql
create table Example4Raw
(
    id UInt64,
    version UInt64,
    metric UInt64
)
engine = MergeTree
order by (id, version);

create table Example4Agg
(
    id UInt64,
    metric_state Nullable(UInt64)
)
engine = CoalescingTree
order by id;

create materialized view Example4AggMV to Example4Agg as
select id, metric as metric_state
from Example4Raw;
```

### Approach 5. Keep data fragments where duplicates are possible to isolate.

Usually you can expect the duplicates only in some time window (like 5 minutes, or one hour, or something like that).

You can put that 'dirty' data in separate place, and put it to final MergeTree table after deduplication window timeout.
For example - you insert data in some tiny tables (Engine=StripeLog) with minute suffix, and move data from tinytable older that X minutes to target MergeTree (with some external queries).
In the meanwhile you can see realtime data using Engine=Merge / VIEWs etc.

Pros:
- good control
- no duplicated in target table
- perfect ingestion speed

Cons:
- quite complicated

### Approach 6. Deduplication using MV pipeline. 

You insert into some temporary table (even with Engine=Null) and MV do join or subselect
(which will check the existence of arrived rows in some time frame of target table) and copy new only rows to destination table.

Pros:
- don't impact the select speed

Cons:
- complicated
- for clusters can be inaccurate due to eventual consistency
- slows down inserts significantly (every insert will need to do lookup in target table first)

```sql
create table Example1 (id Int64, metric UInt64) 
engine = MergeTree order by id;

create table Example1Null engine = Null as Example1;

create materialized view __Example1 to Example1 as
select * from Example1Null 
where id not in (
   select id from Example1 where id in (
      select id from Example1Null
   )
)
```


In all case: due to eventual consistency of ClickHouse replication you can still get duplicates if you insert into different replicas/shards.
