---
title: "Ingestion of AggregateFunction"
linkTitle: "Ingestion of AggregateFunction"
weight: 100
description: >-
     ClickHouse. How to insert AggregateFunction data.
---

## How to insert AggregateFunction data

### Ephemeral column

```sql
CREATE TABLE users (
  uid Int16, 
  updated SimpleAggregateFunction(max, DateTime),
  name_stub String Ephemeral,
  name AggregateFunction(argMax, String, DateTime) 
       default arrayReduce('argMaxState', [name_stub], [updated])
) ENGINE=AggregatingMergeTree order by uid;

INSERT INTO users(uid, updated, name_stub) VALUES (1231, '2020-01-02 00:00:00', 'Jane');

INSERT INTO users(uid, updated, name_stub) VALUES (1231, '2020-01-01 00:00:00', 'John');

SELECT
    uid,
    max(updated) AS updated,
    argMaxMerge(name)
FROM users
GROUP BY uid
┌──uid─┬─────────────updated─┬─argMaxMerge(name)─┐
│ 1231 │ 2020-01-02 00:00:00 │ Jane              │
└──────┴─────────────────────┴───────────────────┘
```

### Input function

```sql
CREATE TABLE users (
  uid Int16, 
  updated SimpleAggregateFunction(max, DateTime),
  name AggregateFunction(argMax, String, DateTime)
) ENGINE=AggregatingMergeTree order by uid;

INSERT INTO users
SELECT uid, updated, arrayReduce('argMaxState', [name], [updated])
FROM input('uid Int16, updated DateTime, name String') FORMAT Values (1231, '2020-01-02 00:00:00', 'Jane');

INSERT INTO users
SELECT uid, updated, arrayReduce('argMaxState', [name], [updated])
FROM input('uid Int16, updated DateTime, name String') FORMAT Values (1231, '2020-01-01 00:00:00', 'John');

SELECT
    uid,
    max(updated) AS updated,
    argMaxMerge(name)
FROM users
GROUP BY uid;
┌──uid─┬─────────────updated─┬─argMaxMerge(name)─┐
│ 1231 │ 2020-01-02 00:00:00 │ Jane              │
└──────┴─────────────────────┴───────────────────┘
```

### Materialized View And Null Engine

```sql
CREATE TABLE users (
  uid Int16, 
  updated SimpleAggregateFunction(max, DateTime),
  name AggregateFunction(argMax, String, DateTime)
) ENGINE=AggregatingMergeTree order by uid;

CREATE TABLE users_null (
  uid Int16, 
  updated DateTime,
  name String
) ENGINE=Null;

CREATE MATERIALIZED VIEW users_mv TO users AS
SELECT uid, updated, arrayReduce('argMaxState', [name], [updated]) name
FROM users_null;

INSERT INTO users_null Values (1231, '2020-01-02 00:00:00', 'Jane');

INSERT INTO users_null Values (1231, '2020-01-01 00:00:00', 'John');

SELECT
    uid,
    max(updated) AS updated,
    argMaxMerge(name) 
FROM users
GROUP BY uid;
┌──uid─┬─────────────updated─┬─argMaxMerge(name)─┐
│ 1231 │ 2020-01-02 00:00:00 │ Jane              │
└──────┴─────────────────────┴───────────────────┘
```
