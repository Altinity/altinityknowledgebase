---
title: "ClickHouse® row-level deduplication"
linkTitle: "ClickHouse® row-level deduplication"
weight: 100
description: >-
     ClickHouse® row-level deduplication.
---

## ClickHouse® row-level deduplication.

(Block level deduplication exists in Replicated tables, and is not the subject of that article).

There is quite common requirement to do deduplication on a record level in ClickHouse.
* Sometimes duplicates are appear naturally on collector side. 
* Sometime they appear due the the fact that message queue system (Kafka/Rabbit/etc) offers at-least-once guarantees.  
* Sometimes you just expect insert idempotency on row level.

For now that problem has no good solution in general case using ClickHouse only.

The reason in simple: to check if the row already exists you need to do some lookup (key-value) alike (ClickHouse is bad for key-value lookups),
in general case - across the whole huge table (which can be terabyte/petabyte size).

But there many usecase when you can archive something like row-level deduplication in ClickHouse:

Approach 0. Make deduplication before ingesting data to ClickHouse
+ you have full control
- extra coding and 'moving parts', storing some ids somewhere
+ clean and simple schema and selects in ClickHouse
! check if row exists in ClickHouse before insert can give non-satisfying results if you use ClickHouse cluster (i.e. Replicated / Distributed tables) - due to eventual consistency.

Approach 1. Allow duplicates during ingestion. Remove them on SELECT level (by things like GROUP BY)
+ simple inserts
- complicate selects
- all selects will be significantly slower

Approach 2. Eventual deduplication using Replacing  
+ simple
- can force you to use suboptimal primary key (which will guarantee record uniqueness) 
- deduplication is eventual - you never know when it will happen, and you will get some duplicates if you don't use FINAL clause
- selects with FINAL clause (`select * from table_name FINAL`) are much slower 
   - and may require tricky manual optimization https://github.com/ClickHouse/ClickHouse/issues/31411
   - can work with acceptable speed in some special conditions: https://kb.altinity.com/altinity-kb-queries-and-syntax/altinity-kb-final-clause-speed/  

Approach 3. Eventual deduplication using Collapsing 
 - complicated
 - can force you to use suboptimal primary key (which will guarantee record uniqueness)
 - you need to store previous state of the record somewhere, or extract it before ingestion from ClickHouse
 - deduplication is eventual (same as with Replacing)
    + you can make the proper aggregations of last state w/o FINAL (bookkeeping-alike sums, counts etc)

Approach 4. Eventual deduplication using Summing with SimpleAggregateFunction( anyLast, ...), Aggregating with argMax etc.
 - quite complicated 
 - can force you to use suboptimal primary key (which will guarantee record uniqueness)
 - deduplication is eventual (same as with Replacing)
    + but you can finish deduplication with GROUP BY instead if FINAL (it's faster)
 
Approach 5. Keep data fragment where duplicates are possible isolated. Usually you can expect the duplicates only in some time window (like 5 minutes, or one hour, or something like that).
You can put that 'dirty' data in separate place, and put it to final MergeTree table after deduplication window timeout.
For example - you insert data in some tiny tables (Engine=StripeLog) with minute suffix, and move data from tinytable older that X minutes to target MergeTree (with some external queries).
In the meanwhile you can see realtime data using Engine=Merge / VIEWs etc.
 - quite complicated
 + good control 
 + no duplicated in target table
 + perfect ingestion speed

Approach 6. Deduplication using MV pipeline. You insert into some temporary table (even with Engine=Null) and MV do join or subselect
(which will check the existence of arrived rows in some time frame of target table) and copy new only rows to destination table.
 + don't impact the select speed
 - complicated
 - for clusters can be inaccurate due to eventual consistency 
 - slow down inserts significantly (every insert will need to do lookup in target table first)
 

In all case: due to eventual consistency of ClickHouse replication you can still get duplicates if you insert into different replicas/shards.
