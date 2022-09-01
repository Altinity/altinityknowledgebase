---
title: "How ALTER's works in ClickHouse"
linkTitle: "How ALTER's works in ClickHouse"
weight: 100
description: >-
     
---

### How ALTER's works in ClickHouse:

#### ADD (COLUMN/INDEX/PROJECTION)

Lightweight, will only change table metadata.
So new entity will be added in case of creation of new parts during INSERT's OR during merges of old parts.

In case of COLUMN, ClickHouse will calculate column value on fly in query context.

{{% alert title="Warning" color="warning" %}}

```sql
CREATE TABLE test_materialization
(
    `key` UInt32,
    `value` UInt32
)
ENGINE = MergeTree
ORDER BY key;

INSERT INTO test_materialization(key, value) SELECT 1, 1;
INSERT INTO test_materialization(key, value) SELECT 2, 2;

ALTER TABLE test_materialization ADD COLUMN inserted_at DateTime DEFAULT now();

SELECT key, inserted_at FROM test_materialization;

┌─key─┬─────────inserted_at─┐
│   1 │ 2022-09-01 03:28:58 │
└─────┴─────────────────────┘
┌─key─┬─────────inserted_at─┐
│   2 │ 2022-09-01 03:28:58 │
└─────┴─────────────────────┘

SELECT key, inserted_at FROM test_materialization;

┌─key─┬─────────inserted_at─┐
│   1 │ 2022-09-01 03:29:11 │
└─────┴─────────────────────┘
┌─key─┬─────────inserted_at─┐
│   2 │ 2022-09-01 03:29:11 │
└─────┴─────────────────────┘

Each query will return different inserted_at value, because each time now() function being executed. 


INSERT INTO test_materialization(key, value) SELECT 3, 3;

SELECT key, inserted_at FROM test_materialization;

┌─key─┬─────────inserted_at─┐
│   3 │ 2022-09-01 03:29:36 │   -- < This value was materialized during ingestion, that's why it's smaller than value for keys 1 & 2
└─────┴─────────────────────┘
┌─key─┬─────────inserted_at─┐
│   1 │ 2022-09-01 03:29:53 │
└─────┴─────────────────────┘
┌─key─┬─────────inserted_at─┐
│   2 │ 2022-09-01 03:29:53 │
└─────┴─────────────────────┘

OPTIMIZE TABLE test_materialization FINAL;

SELECT key, inserted_at FROM test_materialization;

┌─key─┬─────────inserted_at─┐
│   1 │ 2022-09-01 03:30:52 │
│   2 │ 2022-09-01 03:30:52 │
│   3 │ 2022-09-01 03:29:36 │
└─────┴─────────────────────┘

SELECT key, inserted_at FROM test_materialization;

┌─key─┬─────────inserted_at─┐
│   1 │ 2022-09-01 03:30:52 │
│   2 │ 2022-09-01 03:30:52 │
│   3 │ 2022-09-01 03:29:36 │
└─────┴─────────────────────┘

So, data inserted after addition of column can have lower inserted_at value then old data without materialization.

```

{{% /alert %}}

If you want to backpopulate data for old parts, you have multiple options:

#### MATERIALIZE (COLUMN/INDEX/PROJECTION) (PART[ITION ID] '')

Will materialize this entity.

#### OPTIMIZE TABLE xxxx (PART[ITION ID] '') (FINAL)

Will trigger merge, which will lead to materialization of all entities in affected parts.

#### ALTER TABLE xxxx UPDATE column_name = column_name WHERE 1;

Will trigger mutation, which will materialize this column.

#### DROP (COLUMN/INDEX/PROJECTION)

Lightweight, it's only about changing of table metadata and removing corresponding files from filesystem.
For Compact parts it will trigger merge, which can be heavy. [issue](https://github.com/ClickHouse/ClickHouse/issues/27502) 


#### MODIFY COLUMN (DATE TYPE) 

1. Change column type in table schema.
2. Schedule mutation to change type for old parts.


### Mutations

Affected parts - parts with rows mathing condition. 

#### ALTER TABLE xxxxx DELETE WHERE column_1 = 1;

1. Will overwrite all column data in affected parts.
2. For all part(ition)s will create new directories on disk and write new data to them or create hardlinks if they untouched.
3. Register new parts names in ZooKeeper.
   
#### ALTER TABLE xxxxx DELETE IN PARTITION ID '' WHERE column_1 = 1;

Will do the same but only for specific partition.

#### ALTER TABLE xxxxx UPDATE SET column_2 = column_2, column_3 = column_3 WHERE column_1 = 1;

1. Will overwrite column_2, column_3 data in affected parts.
2. For all part(ition)s will create new directories on disk and write new data to them or create hardlinks if they untouched.
3. Register new parts names in ZooKeeper.

#### DELETE FROM xxxxx WHERE column_1 = 1;

1. Will create & populate hidden boolean column in affected parts. (_row_exists column)
2. For all part(ition)s will create new directories on disk and write new data to them or create hardlinks if they untouched.
3. Register new parts names in ZooKeeper.

Despite that LWD mutations will not rewrite all columns, steps 2 & 3 in case of big tables can take significiant time. 

