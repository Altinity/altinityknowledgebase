---
title: "How to Convert Ordinary to Atomic"
linkTitle: "Ordinary to Atomic"
weight: 100
description: >-
     Clickhouse Howto Convert Ordinary to Atomic
---

## Example How to Convert Ordinary to Atomic

```sql
create database db engine=Ordinary;
create table db.test(A Int64) Engine=MergeTree order by A;

create materialized view db.test_mv(A Int64) 
Engine=MergeTree order by A as select * from db.test;

insert into db.test select * from numbers(1000);

create database db_temp engine=Atomic;

rename table db.test to db_temp.test;
rename table db.test_mv to db_temp.test_mv;

drop database db;
rename database db_temp to db;

use db;
show tables;
┌─name───────────────────────────────────────────┐
│ .inner_id.37db402c-fc46-421d-b7db-402cfc46921d │
│ test                                           │
│ test_mv                                        │
└────────────────────────────────────────────────┘

insert into db.test select * from numbers(1000);

select count() from test;
┌─count()─┐
│    2000 │
└─────────┘

select count() from test_mv;
┌─count()─┐
│    2000 │
└─────────┘

show create database db;
┌─statement─────────────────────────┐
│ CREATE DATABASE db
ENGINE = Atomic │
└───────────────────────────────────┘
```
