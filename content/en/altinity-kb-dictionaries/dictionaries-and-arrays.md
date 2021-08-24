---
title: "Dictionaries & arrays"
linkTitle: "Dictionaries & arrays"
description: >
    Dictionaries & arrays
---
## Dictionary with Clickhouse table as a source

### Test data

```sql
DROP TABLE IF EXISTS arr_src;
CREATE TABLE arr_src
(
    key UInt64,
    array_int Array(Int64),
    array_str Array(String)
) ENGINE = MergeTree order by key;

INSERT INTO arr_src SELECT
    number,
    arrayMap(i -> (number * i), range(5)),
    arrayMap(i -> concat('str', toString(number * i)), range(5))
FROM numbers(1000);
```

### Dictionary

```sql
DROP DICTIONARY IF EXISTS arr_dict;
CREATE DICTIONARY arr_dict
(
    key UInt64,
    array_int Array(Int64) DEFAULT [1,2,3],
    array_str Array(String) DEFAULT ['1','2','3']
)
PRIMARY KEY key
SOURCE(CLICKHOUSE(DATABASE 'default' TABLE 'arr_src'))
LIFETIME(120)
LAYOUT(HASHED());

SELECT
    dictGet('arr_dict', 'array_int', toUInt64(42)) AS res_int,
    dictGetOrDefault('arr_dict', 'array_str', toUInt64(424242), ['none']) AS res_str

┌─res_int───────────┬─res_str──┐
│ [0,42,84,126,168] │ ['none'] │
└───────────────────┴──────────┘
```

## Dictionary with PostgreSQL as a source

### Test data in PG

```sql
create user ch;
create database ch;
GRANT ALL PRIVILEGES ON DATABASE ch TO ch;
ALTER USER ch WITH PASSWORD 'chch';

CREATE TABLE arr_src (
    key int,
    array_int   integer[],
    array_str   text[]
);

INSERT INTO arr_src VALUES
  (42, '{0,42,84,126,168}','{"str0","str42","str84","str126","str168"}'),
  (66, '{0,66,132,198,264}','{"str0","str66","str132","str198","str264"}');
```

### Dictionary Example

```sql
CREATE DICTIONARY pg_arr_dict
(
    key UInt64,
    array_int Array(Int64) DEFAULT [1,2,3],
    array_str Array(String) DEFAULT ['1','2','3']
)
PRIMARY KEY key
SOURCE(POSTGRESQL(PORT 5432 HOST 'pg-host'
         user 'ch' password 'chch'  DATABASE  'ch' TABLE 'arr_src'))
LIFETIME(120)
LAYOUT(HASHED());

select * from pg_arr_dict;
┌─key─┬─array_int──────────┬─array_str───────────────────────────────────┐
│  66 │ [0,66,132,198,264] │ ['str0','str66','str132','str198','str264'] │
│  42 │ [0,42,84,126,168]  │ ['str0','str42','str84','str126','str168']  │
└─────┴────────────────────┴─────────────────────────────────────────────┘

SELECT
    dictGet('pg_arr_dict', 'array_int', toUInt64(42)) AS res_int,
    dictGetOrDefault('pg_arr_dict', 'array_str', toUInt64(424242), ['none']) AS res_str

┌─res_int───────────┬─res_str──┐
│ [0,42,84,126,168] │ ['none'] │
└───────────────────┴──────────┘
```

## Dictionary with MySQL as a source

### Test data in MySQL

```sql
-- casted into CH Arrays

create table arr_src(
   _key bigint(20) NOT NULL, 
   _array_int text, 
   _array_str text, 
   PRIMARY KEY(_key)
);

INSERT INTO arr_src VALUES 
  (42, '[0,42,84,126,168]','[''str0'',''str42'',''str84'',''str126'',''str168'']'),
  (66, '[0,66,132,198,264]','[''str0'',''str66'',''str132'',''str198'',''str264'']');
```

### Dictionary in MySQL

```sql
-- supporting table to cast data
CREATE TABLE arr_src
(
    `_key` UInt8,
    `_array_int` String,
    `array_int` Array(Int32) ALIAS cast(_array_int, 'Array(Int32)'),
    `_array_str` String,
    `array_str` Array(String) ALIAS cast(_array_str, 'Array(String)')
)
ENGINE = MySQL('mysql_host', 'ch', 'arr_src', 'ch', 'pass');

-- dictionary fetches data from the supporting table
CREATE DICTIONARY mysql_arr_dict
(
    _key UInt64,
    array_int Array(Int64) DEFAULT [1,2,3],
    array_str Array(String) DEFAULT ['1','2','3']
)
PRIMARY KEY _key
SOURCE(CLICKHOUSE(DATABASE 'default' TABLE 'arr_src'))
LIFETIME(120)
LAYOUT(HASHED());


select * from mysql_arr_dict;
┌─_key─┬─array_int──────────┬─array_str───────────────────────────────────┐
│   66 │ [0,66,132,198,264] │ ['str0','str66','str132','str198','str264'] │
│   42 │ [0,42,84,126,168]  │ ['str0','str42','str84','str126','str168']  │
└──────┴────────────────────┴─────────────────────────────────────────────┘


SELECT
    dictGet('mysql_arr_dict', 'array_int', toUInt64(42)) AS res_int,
    dictGetOrDefault('mysql_arr_dict', 'array_str', toUInt64(424242), ['none']) AS res_str

┌─res_int───────────┬─res_str──┐
│ [0,42,84,126,168] │ ['none'] │
└───────────────────┴──────────┘

SELECT
    dictGet('mysql_arr_dict', 'array_int', toUInt64(66)) AS res_int,
    dictGetOrDefault('mysql_arr_dict', 'array_str', toUInt64(66), ['none']) AS res_str

┌─res_int────────────┬─res_str─────────────────────────────────────┐
│ [0,66,132,198,264] │ ['str0','str66','str132','str198','str264'] │
└────────────────────┴─────────────────────────────────────────────┘
```
