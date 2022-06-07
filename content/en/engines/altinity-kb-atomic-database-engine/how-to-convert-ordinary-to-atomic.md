---
title: "How to Convert Ordinary to Atomic"
linkTitle: "How to Convert Ordinary to Atomic"
weight: 100
description: >-
     Clickhouse Howto Convert Ordinary to Atomic
---

## Example How to Convert Ordinary to Atomic

```sql
CREATE DATABASE db ENGINE=Ordinary;
CREATE TABLE db.test(A Int64) ENGINE=MergeTree ORDER BY A;

CREATE MATERIALIZED VIEW db.test_mv(A Int64) 
ENGINE=MergeTree ORDER BY A AS SELECT * FROM db.test;

INSERT INTO db.test SELECT * FROM numbers(1000);

CREATE DATABASE db_temp ENGINE=Atomic;

RENAME TABLE db.test TO db_temp.test;
RENAME TABLE db.test_mv TO db_temp.test_mv;

DROP DATABASE db;
RENAME DATABASE db_temp TO db;

USE db;
SHOW TABLES;
┌─name───────────────────────────────────────────┐
│ .inner_id.37db402c-fc46-421d-b7db-402cfc46921d │
│ test                                           │
│ test_mv                                        │
└────────────────────────────────────────────────┘

INSERT INTO db.test SELECT * FROM numbers(1000);

SELECT count() FROM test;
┌─count()─┐
│    2000 │
└─────────┘

SELECT count() FROM test_mv;
┌─count()─┐
│    2000 │
└─────────┘

SHOW CREATE DATABASE db;
┌─statement─────────────────────────┐
│ CREATE DATABASE db
ENGINE = Atomic │
└───────────────────────────────────┘
```
