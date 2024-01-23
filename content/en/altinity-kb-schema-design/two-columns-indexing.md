---
title: "Two columns indexing"
linkTitle: "Two columns indexing"
weight: 100
description: >-
     How to create ORDER BY suitable for filtering over two different columns in two different queries
---

{{% alert title="Info" color="info" %}}
How to create ORDER BY suitable for filtering over two different columns in two different queries
{{% /alert %}}


# How to create ORDER BY suitable for filtering over two different columns in two different queries

Suppose we have telecom CDR data in which A party calls B party. Each data row consists of A party details : event_timestamp, A msisdn , A imei, A Imsi , A start location, A end location , B msisdn, B imei, B imsi , B start location, B end location and some other meta data.
 
Searches will be using one of A or B fields , for example A imsi within start and end time window.

A msisdn, A imsi, A imei values are tightly coupled as users rarely change their phones.
 

The queries will be:

```sql
select * from X where A = '0123456789' and ts between ...;
select * from X where B = '0123456789' and ts between ...;
```

and both A & B are high-cardinality values

Clickhouse primary skip index (ORDER BY/PRIMARY KEY)  work great when you always include leading ORDER BY columns in WHERE filter.  There is an exceptions for low-cardinality columns and high-correlated values, but here is another case.  A & B both high cardinality and seems that their correlation is at medium level (you may check that).

Solutions:

1. ORDER BY + additional Skip Index

```sql
create table X (
    A UInt32,
    B UInt32,
    ts DateTime,
    ....
    INDEX ix_B (B) type minmax GRANULARITY 3
) engine = MergeTree
partition by toYYYYMM(ts)
order by (toStartOfDay(ts),A,B);
```

(you may test bloom_filter index type too)

2. reverse index as a table or projection

```sql
create table X (
    A UInt32,
    B UInt32,
    ts DateTime,
    ....
    PROJECTION ix_B  (
        select A,B,ts ORDER BY B,ts
    )
) engine = MergeTree
partition by toYYYYMM(ts)
order by (toStartOfDay(ts),A,B);

select * from X 
where A in (select A from X where B='....' and ts between ...)
  and B='...' and ts between ... ;
```

3. mortonEncode (available from 23.10) 

Not give the priority neither A nor B, but create table’s ordering suitable for both.


 * https://github.com/ClickHouse/ClickHouse/issues/41195
 * https://www.youtube.com/watch?v=5GR1J4T4_d8
 * https://clickhouse.com/docs/en/operations/settings/settings#analyze_index_with_space_filling_curves

```sql
create table X (
    A UInt32,
    B UInt32,
    ts DateTime,
    ....
) engine = MergeTree
partition by toYYYYMM(ts)
order by (toStartOfDay(ts),mortonEncode(A,B));
select * from X where A = '0123456789' and ts between ...;
select * from X where B = '0123456789' and ts between ...;
```

You have to check all 3 solution with a real data.

