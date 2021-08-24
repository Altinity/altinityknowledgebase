---
title: "Skip indexes examples"
linkTitle: "Skip indexes examples"
---
## bloom\_filter

```sql
create table bftest (k Int64, x Int64) Engine=MergeTree order by k;

insert into bftest select number, rand64()%565656 from numbers(10000000);
insert into bftest select number, rand64()%565656 from numbers(100000000);

select count() from bftest where x = 42;
┌─count()─┐
│     201 │
└─────────┘
1 rows in set. Elapsed: 0.243 sec. Processed 110.00 million rows


alter table bftest add index ix1(x) TYPE bloom_filter GRANULARITY 1;

alter table bftest materialize index ix1;


select count() from bftest where x = 42;
┌─count()─┐
│     201 │
└─────────┘
1 rows in set. Elapsed: 0.056 sec. Processed 3.68 million rows
```

## minmax

```sql
create table bftest (k Int64, x Int64) Engine=MergeTree order by k;

-- data is in x column is correlated with the primary key
insert into bftest select number, number * 2 from numbers(100000000);

alter table bftest add index ix1(x) TYPE minmax GRANULARITY 1;
alter table bftest materialize index ix1;

select count() from bftest where x = 42;
1 rows in set. Elapsed: 0.004 sec. Processed 8.19 thousand rows
```

## projection

```sql
create table bftest (k Int64, x Int64, S String) Engine=MergeTree order by k;
insert into bftest select number, rand64()%565656, '' from numbers(10000000);
insert into bftest select number, rand64()%565656, '' from numbers(100000000);
alter table bftest add projection p1 (select k,x order by x);
alter table bftest materialize projection p1 settings mutations_sync=1;
set allow_experimental_projection_optimization=1 ;

-- projection
select count() from bftest where x = 42;
1 rows in set. Elapsed: 0.002 sec. Processed 24.58 thousand rows

-- no projection
select * from bftest where x = 42 format Null;
0 rows in set. Elapsed: 0.432 sec. Processed 110.00 million rows

-- projection
select * from bftest where k in (select k from bftest where x = 42) format Null;
0 rows in set. Elapsed: 0.316 sec. Processed 1.50 million rows
```
