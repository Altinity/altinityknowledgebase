---
title: "UPSERT by VersionedCollapsingMergeTree"
linkTitle: "VersionedCollapsingMT"
description: How to aggregate mutating event stream with duplicates 
---

### Challenges with mutated data

When you have an incoming event stream with duplicates, updates, and deletes, building a consistent row state inside the Clickhouse table is a big challenge.

The UPDATE/DELETE approach in the OLTP world won’t help with OLAP databases tuned to handle big batches. UPDATE/DELETE operations in Clickhouse are executed as “mutations,” rewriting a lot of data and being relatively slow. You can’t run such operations very often, as for OLTP databases. But the UPSERT operation (insert and replace) runs fast with the ReplacingMergeTree Engine. It’s even set as the default mode for INSERT without any special keyword. We can emulate UPDATE (or even DELETE) with the UPSERT operation.

There are a lot of [blog posts](https://altinity.com/blog/clickhouse-replacingmergetree-explained-the-good-the-bad-and-the-ugly) on how to use  ReplacingMergeTree Engine to handle mutated data streams.  A properly designed table schema with ReplacingMergeTree Engine is a good instrument for building the DWH Dimensions table.  But when maintaining metrics in Fact tables, there are several problems:

- it’s not possible to use a valuable Clickhouse feature - online aggregation of incoming data by Materialized Views or Projections on top of the ReplacingMT table, because duplicates and updates will not be deduplicated by the engine during inserts, and calculated aggregates (like sum or count) will be incorrect.  For significant amounts of data, it’s become critical because aggregating raw data during report queries will take too much time.
- unfinished support for DELETEs. While in the newest versions of Clickhouse, it’s possible to add the is_deleted to ReplacingMergeTree parameters, the necessity of manually filtering out deleted rows after FINAL processing makes that feature less useful.
- Mutated data should be localized to the same partition. If the “replacing” row is saved to a partition different from the previous one, the report query will be much slower or produce unexpected results.

```sql
-- multiple partitions problem
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

You will get a row with ‘first’, not an empty set, as one might expect with the FINAL processing of a whole table.

### Collapsing

Clickhouse has other table engines, such as CollapsingMergeTree and VersionedCollapsingMergeTree, that can be used even better for UPSERT operation.

Both work by inserting a “rollback row” to compensate for the previous insert.  The difference between CollapsingMergeTree and VersionedCollapsingMergeTree is in the algorithm of collapsing.  For Cluster configurations, it’s essential to understand which row came first and who should replace whom.  That is why using ReplicatedVersionedCollapsingMergeTree is mandatory for Replicated Clusters.

When dealing with such complicated data streams, it needs to be solved 3 tasks simultaneously:

- remove duplicates
- process updates and deletes
- calculate correct aggregates

It’s essential to understand how the collapsing algorithm of VersionedCollapsingMergeTree works.  Quote from the [documentation](https://clickhouse.com/docs/en/operations/settings/settings#max-insert-threads) :

> When ClickHouse merges data parts, it deletes each pair of rows that have the same primary key and version and different Sign. The order of rows does not matter.
>

The version column should increase over time. You may use a natural timestamp for that. Random-generated IDs are not suitable for the version column.

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

With VersionedCollapsingMergeTree, we can use more partition strategies, even with columns not tied to the row’s primary key. This could facilitate the creation of faster queries, more convenient TTLs (Time-To-Live), and backups.

### Row deduplication

There are several ways to remove duplicates from the event stream. The most effective feature is block deduplication, which occurs when Clickhouse drops incoming blocks with the same checksum (or tag). However, this requires building a smart ingestor capable of saving positions in a transactional manner.

However, another method is possible: verifying whether a particular row already exists in the destination table to avoid redundant insertions. Together with block deduplication, that method also avoids using ReplacingMergeTree and FINAL during query time.

Ensuring accuracy and consistency in results requires executing this process on a single thread within one cluster node. This method is particularly suitable for less active event streams, such as those with up to 100,000 events per second. To boost performance, incoming streams should be segmented into several partitions (or 'shards') based on the table/event's Primary Key, with each partition processed on a single thread.

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

In most cases, the insert block does not have too many rows (like 1000-100k), so checking the destination table for their existence by scanning the Primary Key (residing in memory) won’t take much time. However, due to the high table index granularity, it can still be noticeable on high load. To enhance performance, consider reducing index granularity to 4096 (from the default 8192) or even fewer values.

### Getting old row

To process updates in CollapsingMergeTree, the 'last row state' must be known before inserting the 'compensation row.' Sometimes, this is possible - CDC events coming from MySQL’s binlog or Postgres’s WAL contain not only 'new' data but also 'old' values. If one of the columns includes a sequence-generated version or timestamp of the row’s update time, it can be used as the row’s 'version' for VersionedCollapsingMergeTree. When the incoming event stream lacks old metric values and suitable version information, we can retrieve that data by examining the ClickHouse table using the same method used for row deduplication in the previous example.

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

I read more data from the Example2 table than from Example1. Instead of simply checking the row existence by the IN operator, a JOIN with existing rows is used to build a “compensate row.”

For UPSERT, the collapsing algorithm requires inserting two rows. So, I need to create two rows from any row that is found in the local table. It´s an essential part of the suggested approach, which allows me to produce proper rows for inserting with a human-readable code with clear if() statements.  That is why I execute arrayJoin while reading old data.

Don’t try to run the code above.  It’s just a short explanation of the idea, lucking many needed elements.

### UPSERT by Collapsing

Here is a more realistic [example](https://fiddle.clickhouse.com/babb6069-f629-4f6b-be2c-be51c9f0aa9b) with more checks that can be played with:

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
with __new as ( SELECT * FROM Stage order by  _version desc, sign desc limit 1 by id ),
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

- When multiple events with the same ID and different versions are received in the one insert batch, the most recent event is applied.
- “delete rows” with sign=-1 and the wrong version are not used for processing. For the Collapsing algorithm, the delete row version should match the version from the row stored in the local table, not the same version from the replacing row.  That’s why I decided to skip such a “delete row” received from the incoming stream and build it from the table’s data.
- using FINAL and PREWHERE (to speed up FINAL) while reading the destination table. PREWHERE filters are applied before FINAL processing, reducing the number of grouped rows.
- filter to skip out-of-order events by checking the version
- DELETE event processing (inside last WHERE)

### Speed Test

```sql
set allow_experimental_analyzer=0;
create table Example3
(
    id              Int32,
    Department      String,
    metric1         UInt32,
    metric2         Float32,
    _version        UInt64,
    sign            Int8 default 1
) engine = VersionedCollapsingMergeTree(sign, _version)
      ORDER BY id
  partition by (id % 20)
settings index_granularity=4096
;

set do_not_merge_across_partitions_select_final=1;

-- make 100M table
INSERT INTO Example3
SELECT
    number AS id,
    ['HR', 'Finance', 'Engineering', 'Sales', 'Marketing'][rand() % 5 + 1] AS Department,
    rand() % 1000 AS metric1,
    (rand() % 10000) / 100.0 AS metric2,
    0 AS _version,
    1 AS sign
FROM numbers(1E8);

create function timeSpent as () ->
    date_diff('millisecond',(select ts from t1),now64(3));

-- measure plain INSERT time for 1M batch
create temporary table t1 (ts DateTime64(3)) as select now64(3);
INSERT INTO Example3
SELECT
    number AS id,
    ['HR', 'Finance', 'Engineering', 'Sales', 'Marketing'][rand() % 5 + 1] AS Department,
    rand() % 1000 AS metric1,
    (rand() % 10000) / 100.0 AS metric2,
    1 AS _version,
    1 AS sign
FROM numbers(1E6);
select '---',timeSpent(),'INSERT';

--create table Stage engine=MergeTree order by id as Example3 ;
create table Stage engine=Null as Example3 ;

create materialized view Example3Transform to Example3 as
with __new as ( SELECT * FROM Stage order by  _version desc,sign desc limit 1 by id ),
     __old AS ( SELECT *, arrayJoin([-1,1]) AS _sign from
         ( select * FROM Example3 final
             PREWHERE id IN (SELECT id FROM __new)
           where sign = 1
             )
                                                                                  )
select id,
       if(__old._sign = -1, __old.Department, __new.Department)   AS
           Department,
       if(__old._sign = -1, __old.metric1, __new.metric1)   AS metric1,
       if(__old._sign = -1, __old.metric2, __new.metric2)   AS metric2,
       if(__old._sign = -1, __old._version, __new._version) AS _version,
       if(__old._sign = -1, -1, 1)                          AS sign
from __new left join __old using id
where if(__new.sign=-1,
         __old._sign = -1,                -- insert only delete row if it's found in old data
         __new._version > __old._version  -- skip duplicates for updates
      );

-- calculate UPSERT time for 1M batch
drop table t1;
create temporary table t1 (ts DateTime64(3)) as select now64(3);
INSERT INTO Stage
SELECT
    (rand() % 1E6)*100 AS id,
    --number AS id,
    ['HR', 'Finance', 'Engineering', 'Sales', 'Marketing'][rand() % 5 + 1] AS Department,
    rand() % 1000 AS metric1,
    (rand() % 10000) / 100.0 AS metric2,
    2 AS _version,
    1 AS sign
FROM numbers(1E6);

select '---',timeSpent(),'UPSERT';

-- FINAL query
drop table t1;
create temporary table t1 (ts DateTime64(3)) as select now64(3);
select Department, count(), sum(metric1) from Example3 FINAL
group by Department order by Department
format Null
;
select '---',timeSpent(),'FINAL';

-- GROUP BY query
drop table t1;
create temporary table t1 (ts DateTime64(3)) as select now64(3);
select Department, sum(sign), sum(sign*metric1) from Example3
group by Department order by Department
format Null
;
select '---',timeSpent(),'GROUP BY';

optimize table Example3 final;
-- FINAL query
drop table t1;
create temporary table t1 (ts DateTime64(3)) as select now64(3);
select Department, count(), sum(metric1) from Example3 FINAL
group by Department order by Department
format Null
;
select '---',timeSpent(),'FINAL OPTIMIZED';

-- GROUP BY query
drop table t1;
create temporary table t1 (ts DateTime64(3)) as select now64(3);
select Department, sum(sign), sum(sign*metric1) from Example3
group by Department order by Department
format Null
;
select '---',timeSpent(),'GROUP BY OPTIMIZED';
```

You can use fiddle or clickhouse-local to run such a test:

```bash
cat test.sql | clickhouse-local -nm
```

Results:

```sql
---	252	INSERT
---	1710	UPSERT
---	763	FINAL
---	311	GROUP BY
---	314	FINAL OPTIMIZED
---	295	GROUP BY OPTIMIZED
```

UPSERT is six times slower than direct INSERT because it requires looking up the destination table. That is the price. It is better to use idempotent inserts with an exactly-once delivery guarantee.  However, it’s not always possible.

The FINAL speed is quite good, especially if we split the table by 20 partitions, use  `do_not_merge_across_partitions_select_final` setting, and keep most of the table’s partitions optimized (1 part per partition).

### Adding projections

Let's add an aggregating projection with a more useful `updated_at` timestamp instead of an abstract `_version`.

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

Keep in mind that building projections requires more resources. Insert time will be longer.

### DELETEs inaccuracy

The typical CDC event for DWH systems besides INSERT is UPSERT—a new row replaces the old one (with suitable aggregate corrections). But DELETE events are also supported (ones with column sign=-1). The Materialized View described above will correctly process the DELETE event by inserting only 1 row with sign=-1 if a row with a particular ID already exists in the table. In such cases, VersionedCollapsingMergeTree will wipe both rows (with sign=1 & -1) during merge or final operations.

However, it can lead to incorrect duplicate processing in some rare situations.  Here is the scenario:

- two events  happen in the source database (insert and delete) for the very same ID
- only insert event create a duplicate (delete event does not duplicate)
- all 3 events (delete and two inserts) were processed in separate batches
- Clickhouse executes the merge operation very quickly after the first INSER and DELETE events are received, effectively removing the row with that ID from the table
- the second (duplicated) insert is saved to the table because we lost the information about the first insertion

The probability of such a sequence is relatively low, especially in normal operations when the amount of DELETEs is not too significant.   Processing events in big batches will reduce the probability even more.

### Combine old and new

The presented technique can be used to reimplement the AggregatingMergeTree algorithm to combine old and new row data using VersionedCollapsingMergeTree.

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

I used a simple, compact column with Int64 type for the primary key in previous examples. It's better to go this route with monotonically growing IDs like autoincrement ID or [SnowFlakeId](https://www.notion.so/4a5c621b1e224c96b44210da5ce9c601?pvs=21) (based on timestamp). However, in some cases, a more complex primary key is needed. For instance, when storing data for multiple tenants (Customers, partners, etc.) in the same table. This is not a problem for the suggested technique - use all the necessary columns in all filters and JOIN operations as Tuple.

```sql
create table Example6 
(
    id              Int64,  
    tenant_id       Int32, 
    metric1         UInt32,
    _version        UInt64,
    sign            Int8 default 1
) engine = VersionedCollapsingMergeTree(sign, _version)
ORDER BY (tenant_id,id)
;
create table Stage engine=Null as Example6 ;

create materialized view Example6Transform to Example6 as
with __new as ( SELECT * FROM Stage order by sign desc, _version desc limit 1 by tenant_id,id ),
     __old AS ( SELECT *, arrayJoin([-1,1]) AS _sign from
                 ( select * FROM Example6 final
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

### Sharding

The suggested approach works well when inserting data in a single thread on a single replica. This is suitable for up to 1M events per second. However, for higher traffic, it's necessary to use multiple ingesting threads across several replicas. In such cases, collisions caused by parts manipulation and replication delay can disrupt the entire Collapsing algorithm.

But inserting different shards with a sharding key derived from ID works fine.  Every shard will operate with its own non-intersecting set of IDs, and don’t interfere with each other.

The same approach can be implemented when inserting several threads into the same replica node.  For big installations with high traffic and many shards and replicas, the ingesting app can split the data stream into a considerably large number of “virtual shards” (or partitions in Kafka terminology) and then map the “virtual shards” to the threads doing inserts to “physical shards.”

The incoming stream could be split into several ones by using an expression like  `cityHash64(id) % 50 = 0`  as a sharding key.  The ingesting app should calculate the shard number before sending data to internal buffers that will be flushed to INSERTs.

```sql
-- emulate insert into distributed table
INSERT INTO function remote('localhos{t,t,t}',default,Stage,id)
SELECT
    (rand() % 1E6)*100 AS id,
    --number AS id,
    ['HR', 'Finance', 'Engineering', 'Sales', 'Marketing'][rand() % 5 + 1] AS Department,
    rand() % 1000 AS metric1,
    (rand() % 10000) / 100.0 AS metric2,
    2 AS _version,
    1 AS sign
FROM numbers(1000)
settings prefer_localhost_replica=0;
```

