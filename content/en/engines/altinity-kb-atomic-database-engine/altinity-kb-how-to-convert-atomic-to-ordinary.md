---
title: "How to Convert Atomic to Ordinary"
linkTitle: "How to Convert Atomic to Ordinary"
description: >
    How to Convert Atomic to Ordinary
---

The following instructions are an example on how to convert a database with the Engine type **Atomic** to a database with the Engine type **Ordinary**.

{% hint style="warning" %}
That can be used only for simple schemas. Schemas with MATERIALIZED views will require extra manipulations.
{% endhint %}

```sql
CREATE DATABASE atomic_db ENGINE = Atomic;
CREATE DATABASE ordinary_db ENGINE = Ordinary;
CREATE TABLE atomic_db.x ENGINE = MergeTree ORDER BY tuple() AS system.numbers;
INSERT INTO atomic_db.x SELECT number FROM numbers(100000);
RENAME TABLE atomic_db.x TO ordinary_db.x;
```

```bash
ls -1 /var/lib/clickhouse/data/ordinary_db/x
all_1_1_0
detached
format_version.txt
```

```sql
DROP DATABASE atomic_db;
DETACH DATABASE ordinary_db;
```

```bash
mv /var/lib/clickhouse/metadata/ordinary_db.sql /var/lib/clickhouse/metadata/atomic_db.sql
vi /var/lib/clickhouse/metadata/atomic_db.sql
mv /var/lib/clickhouse/metadata/ordinary_db /var/lib/clickhouse/metadata/atomic_db
mv /var/lib/clickhouse/data/ordinary_db /var/lib/clickhouse/data/atomic_db
```

```sql
ATTACH DATABASE atomic_db;
SELECT count() FROM atomic_db.x
┌─count()─┐
│  100000 │
└─────────┘
SHOW CREATE DATABASE atomic_db
┌─statement──────────────────────────────────┐
│ CREATE DATABASE atomic_db
ENGINE = Ordinary │
└────────────────────────────────────────────┘
```

## Schemas with Materialized VIEW

```sql
DROP DATABASE IF EXISTS atomic_db;
DROP DATABASE IF EXISTS ordinary_db;

CREATE DATABASE atomic_db engine=Atomic;
CREATE DATABASE ordinary_db engine=Ordinary;

CREATE TABLE atomic_db.x ENGINE = MergeTree ORDER BY tuple() AS system.numbers;
CREATE MATERIALIZED VIEW atomic_db.x_mv ENGINE = MergeTree ORDER BY tuple() AS SELECT * FROM atomic_db.x;
CREATE MATERIALIZED VIEW atomic_db.y_mv ENGINE = MergeTree ORDER BY tuple() AS SELECT * FROM atomic_db.x;
CREATE TABLE atomic_db.z ENGINE = MergeTree ORDER BY tuple() AS system.numbers;
CREATE MATERIALIZED VIEW atomic_db.z_mv TO atomic_db.z AS SELECT * FROM atomic_db.x;

INSERT INTO atomic_db.x SELECT * FROM numbers(100);

--- USE atomic_db;
--- 
--- Query id: 28af886d-a339-4e9c-979c-8bdcfb32fd95
--- 
--- ┌─name───────────────────────────────────────────┐
--- │ .inner_id.b7906fec-f4b2-455b-bf9b-2b18ca64842c │
--- │ .inner_id.bd32d79b-272d-4710-b5ad-bca78d09782f │
--- │ x                                              │
--- │ x_mv                                           │
--- │ y_mv                                           │
--- │ z                                              │
--- │ z_mv                                           │
--- └────────────────────────────────────────────────┘


SELECT mv_storage.database, mv_storage.name, mv.database, mv.name
FROM system.tables AS mv_storage
LEFT JOIN system.tables AS mv ON substring(mv_storage.name, 11) = toString(mv.uuid)
WHERE mv_storage.name LIKE '.inner_id.%' AND mv_storage.database = 'atomic_db';

-- ┌─database──┬─name───────────────────────────────────────────┬─mv.database─┬─mv.name─┐
-- │ atomic_db │ .inner_id.81e1a67d-3d02-4b2a-be17-84d8626d2328 │ atomic_db   │ y_mv    │
-- │ atomic_db │ .inner_id.e428225c-982a-4859-919b-ba5026db101d │ atomic_db   │ x_mv    │
-- └───────────┴────────────────────────────────────────────────┴─────────────┴─────────┘




/* STEP 1: prepare rename statements, also to rename implicit mv storage table to explicit one */

SELECT 
if(
   t.name LIKE '.inner_id.%',
  'RENAME TABLE `' || t.database || '`.`' ||  t.name || '` TO `ordinary_db`.`' || mv.name || '_storage`;',
   'RENAME TABLE `' || t.database || '`.`' ||  t.name || '` TO `ordinary_db`.`' || t.name || '`;'
)
FROM system.tables as t
LEFT JOIN system.tables mv ON (substring(t.name,11) = toString(mv.uuid) AND t.database =  mv.database )
WHERE t.database = 'atomic_db' AND t.engine <> 'MaterializedView'
FORMAT TSVRaw;

-- RENAME TABLE `atomic_db`.`.inner_id.b7906fec-f4b2-455b-bf9b-2b18ca64842c` TO `ordinary_db`.`y_mv_storage`;
-- RENAME TABLE `atomic_db`.`.inner_id.bd32d79b-272d-4710-b5ad-bca78d09782f` TO `ordinary_db`.`x_mv_storage`;
-- RENAME TABLE `atomic_db`.`x` TO `ordinary_db`.`x`;
-- RENAME TABLE `atomic_db`.`z` TO `ordinary_db`.`z`;


/* STEP 2: prepare statements to reattach MV */ 
-- Can be done manually: pick existing MV definition (SHOW CREATE TABLE), and change it in the following way:
-- 1) add TO keyword 2) remove column names and engine settings after mv name 


SELECT 
if(
   t.name LIKE '.inner_id.%',
   replaceRegexpOne(mv.create_table_query, '^CREATE MATERIALIZED VIEW ([^ ]+) \\(.*? AS ', 'CREATE MATERIALIZED VIEW \\1 TO \\1_storage AS '),
   mv.create_table_query
)
FROM system.tables as mv
LEFT JOIN system.tables t ON (substring(t.name,11) = toString(mv.uuid) AND t.database =  mv.database)
WHERE mv.database = 'atomic_db' AND mv.engine='MaterializedView' 
FORMAT TSVRaw;

-- CREATE MATERIALIZED VIEW atomic_db.x_mv TO atomic_db.x_mv_storage AS SELECT * FROM atomic_db.x
-- CREATE MATERIALIZED VIEW atomic_db.y_mv TO atomic_db.y_mv_storage AS SELECT * FROM atomic_db.x

/* STEP 3: stop inserts, fire renames statements prepared at the step 1 (hint: use clickhouse-client -mn) */

RENAME ... 

/* STEP 4: ensure that only MaterialiedView left in source db, and drop it.  */ 

SELECT * FROM system.tables WHERE database = 'atomic_db' and engine <> 'MaterializedView';
DROP DATABASE atomic_db;


/* STEP 4. rename table to old name: */ 

DETACH DATABASE ordinary_db;

-- rename files / folders:

mv /var/lib/clickhouse/metadata/ordinary_db.sql /var/lib/clickhouse/metadata/atomic_db.sql
vi /var/lib/clickhouse/metadata/atomic_db.sql
mv /var/lib/clickhouse/metadata/ordinary_db /var/lib/clickhouse/metadata/atomic_db
mv /var/lib/clickhouse/data/ordinary_db /var/lib/clickhouse/data/atomic_db

-- attach database atomic_db;

ATTACH DATABASE atomic_db;

/* STEP 5. restore MV using statements created on STEP 2 */
```



