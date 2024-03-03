---
title: "VersionedCollapsingMergeTree"
linkTitle: "VersionedCollapsingMergeTree"
description: VersionedCollapsingMergeTree
---

When you have an incoming event stream with duplicates and updates you have a big challenge  building a consistent row state inside the Clickhouse table.

ReplacingMergeTree is a great engine for that and there are a lot of blog posts on how to apply it for that particular purpose. But there is a serious problem - you can’t use another very important feature - aggregating rows by Materialized Views or Projections on top of the ReplacingMT table, because duplicates and updates will not be deduplicated and calculated aggregates (like sum or count) will be incorrect.  For big amounts of data, it’s become critical because aggregating raw data during report queries will take too much time.

Another drawback of ReplacingMergeTree is unfinished support for DELETEs. While for the newest versions of Clickhouse, it’s possible to add the is_deleted to ReplacingMergeTree parameters, the necessity of manually filtering out deleted rows even after FINAL processing makes it less useful.

Clickhouse has other table engines that can be used quite well for dealing with UPDATEs and DELETEs - CollapsingMergeTree and VersionedCollapsingMergeTree.   

Both of them use the concept of inserting a “rollback row” to compensate for the previous insert.  The difference between CollapsingMergeTree and VersionedCollapsingMergeTree is in the algorithm of collapsing.  For Cluster configurations, it’s very important to understand what row came first and who should replace whom.  That is why using ReplicatedVersionedCollapsingMergeTree is mandatory for Replicated Clusters.

When dealing with such complicated data streams, it needs to be solved 3 tasks simultaneously:

- remove duplicates
- process updates and deletes
- calculate correct aggregates

Let’s explain in several steps how to do it in Clickhouse with some tricky SQL code.

### Row deduplication

There are a lot of ways to remove duplicates from the event stream.  The most effective is block deduplication when Clickhouse drop inserts blocks with the same checksum (or tag).  But it requires building a smart ingest procedure.

But it’s possible to use another method - checking that particular row is already presented in the destination table and not insert it again.   To get reliable results, such a process should be executed in 1 thread on 1 cluster node.  That can be possible only for not-too-active event streams (like 100k/sec). For heavier streams some sort of partitioning is needed while inserting data with different PK to different shards or replicas or even on the same node.

The example of row deduplication:

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

- use Null table and MatView to be able access both insert block and the dest table
- check existance of ids in dest table with fast index scan by primary key using IN operator
- filter existing rows from insert block by NOT IN operator

Insert block in most cases has not too many rows (like 1000-100k), so checking dest table for their existence by scanning Primary Key (residing in memory) won’t take much time, but due to high table’s index granularity can be still noticeble on high load.  If it’s possible better to reduce index granularity at least to 4096 (from default 8192).

### Last row state

To process updates in CollapsingMergeTree it needs to know “last row state” to insert the  “compensation row”.  Sometimes it’s possible - CDC events coming from MySQL’s binlog or Postgres’s WAL  contains not only “new” data but also “old” values. If one of columns contains timestamp of row’s update time it can be used as row’s “version”. But in most cases incoming event stream does not have old metric values and suitable version information.  In this case we can get that data by looking into Clickhouse table the same way as we do for row deduplication in previous example.

```sql
create table Example2 (id Int64, metric UInt64, sign Int8) 
engine = CollapsingMergeTree(sign) order by id;

create table Example2Null engine = Null as Example2;

create materialized view __Example2 to Example3 as
with _old as (
   select *, arrayJoin([-1,1]) as _sign 
   from Example2 where id in (select id from Example2Null)
   )
select id,
       if(_old._sign=-1, _old.metric, _new.metric) as metric
from Example2Null as _new
join _old using id;
```

Here I read more data from Example2 table compared to Example1.  Instead of simple checking the row existance by IN operator, a JOIN with existed rows used for building “compensate row”. 

The trick with arrayJoin is needed to insert two rows as it required for CollapsingMergeTree table. 

Don’t try to run code above.  It’s just a short explanation of the idea, lucking many needed elements. 

### Replace by collapsing

Here is more realistic [example](https://fiddle.clickhouse.com/babb6069-f629-4f6b-be2c-be51c9f0aa9b), that can be played with:

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
with __new as ( SELECT * FROM Stage order by sign desc, _version desc limit 1 by id ),
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

Let’s finally add aggregating projection  together with more useful `updated_at` timestamp instead of abstract _version. 

[https://fiddle.clickhouse.com/3140d341-ccc5-4f57-8fbf-55dbf4883a21](https://fiddle.clickhouse.com/3140d341-ccc5-4f57-8fbf-55dbf4883a21)

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
    if(__old._sign = -1, __old.metric1, __new.metric1)   AS metric1,
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

### Combine old and new

As the bonus I will use presented techique to reimplement AggregatingMergeTree algorithm with combining old row with new row with VersionedCollapsingMergeTree.

[https://fiddle.clickhouse.com/e1d7e04c-f1d6-4a25-9aac-1fe2b543c693](https://fiddle.clickhouse.com/e1d7e04c-f1d6-4a25-9aac-1fe2b543c693)

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

In the examples above I use for PK a very simple a compact column with In64 type.   When it’s possible better to go such a way.  SnowFlakeId is the best variant and can be easily created during INSERT from DateTime and hash of one or several important columns.  But sometimes it needs to have a more complicated PK as when storing data for multiple Tenant (Customer, Partners, etc) in the same table.  It’s not a problem for suggested technique  - just use all the needed columns in all filter and JOIN operations.

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
