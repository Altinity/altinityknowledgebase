---
title: "SnowflakeID for Efficient Primary Keys "
linkTitle: "SnowflakeID"
weight: 100
description: >-
     SnowflakeID for Efficient Primary Keys 
---

In data warehousing (DWH) environments, the choice of primary key (PK) can significantly impact performance, particularly in terms of RAM usage and query speed. This is where [SnowflakeID](https://en.wikipedia.org/wiki/Snowflake_ID) comes into play, providing a robust solution for PK management. Here’s a deep dive into why and how Snowflake IDs are beneficial and practical implementation examples.

### Why Snowflake ID?

- **Natural IDs Suck**: Natural keys derived from business data can lead to various issues like complexity and instability. Surrogate keys, on the other hand, are system-generated and stable.
- Surrogate keys simplify joins and indexing, which is crucial for performance in large-scale data warehousing.
- Monotonic or sequential IDs help maintain the order of entries, which is essential for performance tuning and efficient range queries.
- Having both a timestamp and a unique ID in the same column allows for fast filtering of rows during SELECT operations. This is particularly useful for time-series data.

### **Building Snowflake IDs**

There are two primary methods to construct the lower bits of a Snowflake ID:

1.	**Hash of Important Columns**:

	Using a hash function on significant columns ensures uniqueness and distribution.

2.	**Row Number in insert batch**

	Utilizing the row number within data blocks provides a straightforward approach to generating unique identifiers.
         

### **Implementation as UDF**

Here’s how to implement Snowflake IDs using standard SQL functions while utilizing second and millisecond timestamps.

Pack hash to lower 22 bits for DateTime64 and 32bits for DateTime

```sql
create function toSnowflake64 as (dt,ch) ->
  bitOr(dateTime64ToSnowflakeID(dt),
   bitAnd(bitAnd(ch,0x3FFFFF)+
      bitAnd(bitShiftRight(ch, 20),0x3FFFFF)+
      bitAnd(bitShiftRight(ch, 40),0x3FFFFF),
      0x3FFFFF) 
  );

create function toSnowflake as (dt,ch) ->
  bitOr(dateTimeToSnowflakeID(dt),
   bitAnd(bitAnd(ch,0xFFFFFFFF)+
      bitAnd(bitShiftRight(ch, 32),0xFFFFFFFF),
      0xFFFFFFFF) 
  );
    
with cityHash64('asdfsdnfs;n') as ch,
  now64() as dt
select dt,
  hex(toSnowflake64(dt,ch) as sn) ,
  snowflakeIDToDateTime64(sn);

with cityHash64('asdfsdnfs;n') as ch,
  now() as dt
select dt,
  hex(toSnowflake(dt,ch) as sn) ,
  snowflakeIDToDateTime(sn);
```

### **Creating Tables with Snowflake ID**

**Using Materialized Columns and hash**

```sql
create table XX 
(
  id Int64 materialized toSnowflake(now(),cityHash64(oldID)),
  oldID  String,
  data String
) engine=MergeTree order by id;

```

Note: Using User-Defined Functions (UDFs) in CREATE TABLE statements is not always useful, as they expand to create table DDL, and changing them is inconvenient.

**Using a Null Table, Materialized View, and** rowNumberInAllBlocks

A more efficient approach involves using a Null table and materialized views.

```sql
create table XX 
(
  id Int64,
  data String
) engine=MergeTree order by id;

create table Null (data String) engine=Null;
create materialized view _XX to XX as
select toSnowflake(now(),rowNumberInAllBlocks()) is id, data
from Null;
```

### Converting from UUID to SnowFlakeID for subsequent events

Consider that your event stream only has a UUID column identifying a particular user.  Registration time that can be used as a base for SnowFlakeID is presented only in the first ‘register’ event, but not in subsequent events.  It’s easy to generate SnowFlakeID for the register event, but next, we need to get it from some other table without disturbing the ingestion process too much.   Using Hash JOINs in Materialized Views is not recommended, so we need some “nested loop join” to get data fast.  In Clickhouse, the “nested loop join” is still not supported, but Direct Dictionary can work around it.

```sql
CREATE TABLE UUID2ID_store (user_id UUID, id UInt64) 
ENGINE = MergeTree() -- EmbeddedRocksDB can be used instead
ORDER BY user_id
settings index_granularity=256;

CREATE DICTIONARY UUID2ID_dict (user_id UUID, id UInt64) 
PRIMARY KEY user_id
LAYOUT ( DIRECT ())
SOURCE(CLICKHOUSE(TABLE 'UUID2ID_store'));

CREATE OR REPLACE FUNCTION UUID2ID AS (uuid) -> dictGet('UUID2ID_dict',id,uuid);

CREATE MATERIALIZED VIEW _toUUID_store TO UUID2ID_store AS
select user_id, toSnowflake64(event_time, cityHash64(user_id)) as id
from Actions;
```

**Conclusion**

Snowflake IDs provide an efficient mechanism for generating unique, monotonic primary keys, which are essential for optimizing query performance in data warehousing environments. By combining timestamps and unique identifiers, snowflake IDs facilitate faster row filtering and ensure stable, surrogate key generation. Implementing these IDs using SQL functions and materialized views ensures that your data warehouse remains performant and scalable.
