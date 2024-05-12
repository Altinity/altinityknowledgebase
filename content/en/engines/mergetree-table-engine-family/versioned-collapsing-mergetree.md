---
title: "VersionedCollapsingMergeTree"
linkTitle: "VersionedCollapsingMergeTree"
description: VersionedCollapsingMergeTree
---

### Update Challenges

When you have an incoming event stream with duplicates and updates you have a big challenge building a consistent row state inside the Clickhouse table.

ReplacingMergeTree is a great engine for that and there are a lot of blog posts on how to apply it for that particular purpose. But there are several problems:

- you can’t use another important Clickhouse feature - make aggregations by Materialized Views or Projections on top of the ReplacingMT table, because duplicates and updates will not be deduplicated by the engine during inserts, and calculated aggregates (like sum or count) will be incorrect.  For big amounts of data, it’s become critical because aggregating raw data during report queries will take too much time.
- unfinished support for DELETEs. While in the newest versions of Clickhouse, it’s possible to add the is_deleted to ReplacingMergeTree parameters, the necessity of manually filtering out deleted rows after FINAL processing makes that feature less useful.
- mutated data should be localized to the same partition.  If the “replacing” row is saved to another partition than the previous one, the report query will be much slower or produce unexpected results.

```sql
CREATE TABLE RMT
(
    `key` Int64,
    `someCol` String,
    `eventTime` DateTime
)
ENGINE = ReplacingMergeTree()
PARTITION BY toYYYYMM(eventTime)
ORDER BY key;

INSERT INTO RMT Values (1, 'first', '2024-04-25T10:16:21');
INSERT INTO RMT Values (1, 'second', '2024-05-02T08:36:59');

with merged as (select * from RMT FINAL)
select * from merged
where eventTime < '2024-05-01'
```

### Collapsing

Clickhouse has other table engines that can be used quite well for dealing with UPDATEs and DELETEs - CollapsingMergeTree and VersionedCollapsingMergeTree.

Both work by inserting a “rollback row” to compensate for the previous insert.  The difference between CollapsingMergeTree and VersionedCollapsingMergeTree is in the algorithm of collapsing.  For Cluster configurations, it’s important to understand what row came first and who should replace whom.  That is why using ReplicatedVersionedCollapsingMergeTree is mandatory for Replicated Clusters.

When dealing with such complicated data streams, it needs to be solved 3 tasks simultaneously:

- remove duplicates
- process updates and deletes
- calculate correct aggregates

The collapsing algorithm of VersionedCollapsingMergeTree as it is described in the [documentation](https://clickhouse.com/docs/en/operations/settings/settings#max-insert-threads) :

> When ClickHouse merges data parts, it deletes each pair of rows that have the same primary key and version and different Sign. The order of rows does not matter.
>

It’s quite important to understand how it works.

The version column should increase during the time.  You may use some natural timestamp for that.  Random-generated IDs are not suitable for the version column.

### Replace data in another partition

Let’s first fix the problem with mutated data in a different partition.

```sql
CREATE TABLE VCMT
(
    key Int64,
    someCol String,
    eventTime DateTime,
    sign Int8
)
ENGINE = VersionedCollapsingMergeTree(sign,eventTime)
PARTITION BY toYYYYMM(eventTime)
ORDER BY key;

INSERT INTO VCMT Values (1, 'first', '2024-04-25 10:16:21',1);
INSERT INTO VCMT Values (1, 'first', '2024-04-25 10:16:21',-1), (1, 'second', '2024-05-02 08:36:59',1);

set do_not_merge_across_partitions_select_final=1; -- for fast FINAL

select 'no rows after:';
with merged as 
  (select * from VCMT FINAL)
select * from merged
where eventTime < '2024-05-01';
```

https://fiddle.clickhouse.com/f88a71cf-cc75-4f9c-8dd9-569346c686f6

### Row deduplication

There are a lot of ways to remove duplicates from the event stream.  The most effective feature is the block deduplication when Clickhouse drops incoming blocks with the same checksum (or tag).  But it requires building a smart ingestor with the ability to save position in a transactional way.

But it’s possible to use another method - checking that particular row already exists in the destination table and not inserting it again.   To get reliable results, such a process should be executed in 1 thread on 1 cluster node.  That can be possible only for not-too-active event streams (like 100k/sec). To increase performance, incoming streams should be split by several partitions (or we can call them shards) by table/event Primary Key, and process inserts in 1 thread per 1 partition/shard.

An example of row deduplication:

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
);
```

Here is the trick:

- use Null table and MatView to be able to access both the insert block and the dest table
- check the existence of IDs in the destination table with a fast index scan by a primary key using the IN operator
- filter existing rows from insert block by NOT IN operator

Insert block in most cases does not have too many rows (like 1000-100k), so checking the destination table for their existence by scanning Primary Key (residing in memory) won’t take much time, but due to the high table’s index granularity can be still noticeable on high load. To enhance performance, consider reducing index granularity to 4096 (from the default 8192) or even fewer values.

### Last row state

To process updates in CollapsingMergeTree, it needs to know the 'last row state' to insert the 'compensation row.' Sometimes this is possible - CDC events coming from MySQL’s binlog or Postgres’s WAL contain not only 'new' data but also 'old' values. If one of the columns includes a sequence-generated version or timestamp of the row’s update time, it can be used as the row’s 'version' for VersionedCollapsingMergeTree. When the incoming event stream lacks old metric values and suitable version information, we can retrieve that data by examining the ClickHouse table in the same method used for row deduplication in the previous example.

```sql
create table Example2 (id Int64, metric UInt64, sign Int8) 
engine = CollapsingMergeTree(sign) order by id;

create table Example2Null engine = Null as Example2;

create materialized view __Example2 to Example2 as
with _old as (
   select *, arrayJoin([-1,1]) as _sign 
   from Example2 where id in (select id from Example2Null)
   )
select id,
       if(_old._sign=-1, _old.metric, _new.metric) as metric
from Example2Null as _new
join _old using id;
```

Here I read more data from the Example2 table compared to Example1.  Instead of simply checking the row existence by the IN operator, a JOIN with existing rows is used for building a “compensate row”.

The trick with arrayJoin is needed to insert two rows as required for the CollapsingMergeTree table.

Don’t try to run the code above.  It’s just a short explanation of the idea, lucking many needed elements.

### Replace by collapsing

The previous example is very simplified.  Let´s add more checks.

> The _new mean that we can insert -1 sign to just delete the data, we can receive more than one version by block, if the update is done by push a -1 and 1 one the -1 is ignored?
>

For that question better look at Example3 as more completed.  Ex2 shows the idea only.

- If we receive several events only the last one will be applied.
- If we got both -1 and 1 in the very same batch with the same version, we use only the sign=1

```
__new as ( SELECT * FROM Stage order by  _version,sign desc desc limit 1 by id )
```

> Can you explain the usage of the PREWHERE ? since the table is already ordered by id I would have supposed it's would already only pick thoses granules. Or maybe it's an optimisation when the code will have a more complexe order by ?
>

PREWHERE is the optimization trick to run FINAL queries faster. In such cases, filters are applied before FINAL processing doing something like GROUP BY execution.

> I would have done the array join after the join so clickhouse would not have to join so many lines, but maybe copying the data is less efficient than joining ?
>

The collapsing algorithm requires inserting two rows in most cases. So I need to create two rows from any single row that is found in the table. It´s an essential part of the suggested approach, that allows me to create proper rows for inserting with an understandable if() statements.  That is why I do arrayJoin while reading old data.

Here is a more realistic [example](https://fiddle.clickhouse.com/babb6069-f629-4f6b-be2c-be51c9f0aa9b), that can be played with:

```sql
create table Example3 
(
    id              Int32,   
    metric1         UInt32,
    metric2         UInt32,
    _version        UInt64,
    sign            Int8 default 1
) engine = VersionedCollapsingMergeTree(sign, _version)
ORDER BY id
;
create table Stage engine=Null as Example3 ;

create materialized view Example3Transform to Example3 as
with __new as ( SELECT * FROM Stage order by  _version,sign desc desc limit 1 by id ),
 __old AS ( SELECT *, arrayJoin([-1,1]) AS _sign from
                 ( select * FROM Example3 final
                   PREWHERE id IN (SELECT id FROM __new)
                   where sign = 1
                 )
    )
select id,
    if(__old._sign = -1, __old.metric1, __new.metric1)   AS metric1,
    if(__old._sign = -1, __old.metric2, __new.metric2)   AS metric2,
    if(__old._sign = -1, __old._version, __new._version) AS _version,
    if(__old._sign = -1, -1, 1)                          AS sign
from __new left join __old
using id
where if(__new.sign=-1,
  __old._sign = -1,                -- insert only delete row if it's found in old data
  __new._version > __old._version  -- skip duplicates for updates
);

-- original
insert into Stage values (1,1,1,1,1), (2,2,2,1,1);
select 'step1',* from Example3 ;

-- no duplicates (with the same version) inserted
insert into Stage values (1,3,1,1,1),(2,3,2,1,1);
select 'step2',* from Example3 ;

-- delete a row with id=2. version for delete row does not have any meaning
insert into Stage values (2,2,2,0,-1);
select 'step3',* from Example3 final;

-- replace a row with id=1. row with sign=-1 not needed, but can be in the insert blocks (will be skipped)
insert into Stage values (1,1,1,0,-1),(1,3,3,2,1);
select 'step4',* from Example3 final;
```

Important additions:

- filtering insert block to get only 1 (latest) row, if there are inserted many rows with same id
- using FINAL and PREWHERE (to speed up FINAL) while reading main (dest) table
- filter to skip out-of-order events by checking version
- DELETE event processing (inside last WHERE)

### Adding projections

Let’s finally add aggregating projection together with a more useful `updated_at` timestamp instead of an abstract _version.

https://fiddle.clickhouse.com/3140d341-ccc5-4f57-8fbf-55dbf4883a21

```sql
create table Example4 
(
    id              Int32,   
    metric1         UInt32,
    Smetric1        alias metric1*sign,
    metric2         UInt32,
    dim1            LowCardinality(String),
    updated_at      DateTime64(3) default now64(3),
    sign            Int8 default 1,
-- incoming event stream is deduplicated so I can do stream aggregation
    PROJECTION byDim1  (
        select dim1, sum(metric1*sign) group by dim1
    )
) engine = VersionedCollapsingMergeTree(sign, updated_at)
ORDER BY id
;
create table Stage engine=Null as Example4 ;

create materialized view Example4Transform to Example4 as
with __new as ( SELECT * FROM Stage order by sign desc, updated_at desc limit 1 by id ),
     __old AS ( SELECT *, arrayJoin([-1,1]) AS _sign from
                 ( select * FROM Example4 final
                   PREWHERE id IN (SELECT id FROM __new)
                   where sign = 1
                 )
    )
select id,
    if(__old._sign = -1, __old.metric1, __new.metric1) AS metric1,
    if(__old._sign = -1, __old.metric2, __new.metric2) AS metric2,
    if(__old._sign = -1, __old.dim1, __new.dim1) AS dim1,
    if(__old._sign = -1, __old.updated_at, __new.updated_at) AS updated_at,
    if(__old._sign = -1, -1, 1)                          AS sign
from __new left join __old using id
where if(__new.sign=-1,
  __old._sign = -1,                -- insert only delete row if it's found in old data
  __new.updated_at > __old.updated_at  -- skip duplicates for updates
);

-- original
insert into Stage(id,metric1,metric2,dim1) values (1,1,1,'d'), (2,2,2,'d');
select 'step1',* from Example4 ;
select 'proj1',dim1, sum(Smetric1) from Example4 group by dim1;

-- delete a row with id=2
insert into Stage(id,metric1,metric2,sign) values (2,2,2,-1);
select 'step2',* from Example4 final;
select 'proj2',dim1, sum(Smetric1) from Example4 group by dim1;

-- replace a row with id=1. row with sign=-1 not needed, but can be in the insert blocks (will be skipped)
insert into Stage(id,metric1,metric2,dim1,sign) values (1,1,1,'',-1),(1,3,3,'d',1);
select 'step3',* from Example4 final;
select 'proj3',dim1, sum(Smetric1) from Example4 group by dim1;
```

### DELETEs processing

The typical CDC event for DWH systems besides INSERT is UPSERT - a new row replaces the old one (with suitable aggregate corrections).  But DELETE events are also supported (ones with column sign=-1).  Materialized View described above will correctly process the DELETE event by inserting only 1 row with sign=-1 only if a row with a particular ID already exists in the table. In such case VersionedCollapsingMergeTree will wipe both rows (with sign=1 & -1) during Merge or FINAL operations.

But in some rare situations, it can lead to incorrect duplicate processing.  Here is the scenario:

- two events  happen in the source database (insert and delete) for the very same ID
- only insert event create a duplicate (delete event does not duplicate)
- all 3 events (delete and two inserts) were processed in separate batches
- Clickhouse executes the merge operation very quickly after the first INSER and DELETE events are received, effectively removing the row with that ID from the table
- the second (duplicated) insert is saved to the table because we lost the information about the first insertion

The probability of such a sequence is quite low, especially in normal operations when the amount of DELETEs is not too big.   Processing events in big batches will reduce the probability even more.

### Combine old and new

The presented technique can be used to reimplement the AggregatingMergeTree algorithm to combine old row data with new row data using VersionedCollapsingMergeTree.

https://fiddle.clickhouse.com/e1d7e04c-f1d6-4a25-9aac-1fe2b543c693

```sql
create table Example5 
(
    id              Int32,   
    metric1         UInt32,
    metric2         Nullable(UInt32),
    updated_at      DateTime64(3) default now64(3),
    sign            Int8 default 1
) engine = VersionedCollapsingMergeTree(sign, updated_at)
ORDER BY id
;
create table Stage engine=Null as Example5 ;
  
create materialized view Example5Transform to Example5 as
with __new as ( SELECT * FROM Stage order by sign desc, updated_at desc limit 1 by id ),
     __old AS ( SELECT *, arrayJoin([-1,1]) AS _sign from
                 ( select * FROM Example5 final
                   PREWHERE id IN (SELECT id FROM __new)
                   where sign = 1
                 )
    )
select id,
    if(__old._sign = -1, __old.metric1, greatest(__new.metric1, __old.metric1)) AS metric1,    
    if(__old._sign = -1, __old.metric2, ifNull(__new.metric2, __old.metric2)) AS metric2,
    if(__old._sign = -1, __old.updated_at, __new.updated_at) AS updated_at,
    if(__old._sign = -1, -1, 1)                          AS sign
from __new left join __old using id
where if(__new.sign=-1,
  __old._sign = -1,                -- insert only delete row if it's found in old data
  __new.updated_at > __old.updated_at  -- skip duplicates for updates
);

-- original
insert into Stage(id) values (1), (2);
select 'step0',* from Example5 ;

insert into Stage(id,metric1) values (1,1), (2,2);
select 'step1',* from Example5 final;

insert into Stage(id,metric2) values (1,11), (2,12);
select 'step2',* from Example5 final ;
```

### Complex Primary Key

In the examples above I use for PK a very simple compact column with In64 type.   When it’s possible better to go such a way.  [SnowFlakeId](https://www.notion.so/4a5c621b1e224c96b44210da5ce9c601?pvs=21) is the best variant and can be easily created during INSERT from DateTime and the hash of one or several important columns.  But sometimes it needs to have a more complicated PK f.e. when storing data for multiple Tenants (Customers, Partners, etc) in the same table.  It’s not a problem for the suggested technique  - just use all the needed columns in all filters and JOIN operations.

```sql
create table Example1 
(
    id              Int64,  
    tenant_id       Int32, 
    metric1         UInt32,
    _version        UInt64,
    sign            Int8 default 1
) engine = VersionedCollapsingMergeTree(sign, _version)
ORDER BY (tenant_id,id)
;
create table Stage engine=Null as Example1 ;

create materialized view Example1Transform to Example1 as
with __new as ( SELECT * FROM Stage order by sign desc, _version desc limit 1 by tenant_id,id ),
     __old AS ( SELECT *, arrayJoin([-1,1]) AS _sign from
                 ( select * FROM Example1 final
                   PREWHERE (tenant_id,id) IN (SELECT tenant_id,id FROM __new)
                   where sign = 1
                 )
    )
select id,tenant_id,
    if(__old._sign = -1, __old.metric1, __new.metric1)   AS metric1,
    if(__old._sign = -1, __old._version, __new._version) AS _version,
    if(__old._sign = -1, -1, 1)                          AS sign
from __new left join __old
using (tenant_id,id)
where if(__new.sign=-1,
  __old._sign = -1,                -- insert only delete row if it's found in old data
  __new._version > __old._version  -- skip duplicates for updates
);
```