---
title: "JSONEachRow, Tuples, Maps and Materialized Views"
linkTitle: "JSONEachRow, tuple, map and MVs"
weight: 100
description: >-
     How to use Tuple() and Map() with nested JSON messages in MVs
---

## Using JSONEachRow with Tuple() in Materialized views

Sometimes we can have a nested json message with a fixed size structure like this:

```json
{"s": "val1", "t": {"i": 42, "d": "2023-09-01 12:23:34.231"}}
```

Values can be NULL but the structure should be fixed. In this case we can use `Tuple()` to parse the JSON message:

```sql
CREATE TABLE tests.nest_tuple_source
(
    `s` String,
    `t` Tuple(`i` UInt8, `d` DateTime64(3))
)
ENGINE = Null 
```

We can use the above table as a source for a materialized view, like it was a Kafka table and in case our message has unexpected keys we make the Kafka table ignore them with the setting (23.3+):

`input_format_json_ignore_unknown_keys_in_named_tuple = 1`

```sql
CREATE MATERIALIZED VIEW tests.mv_nest_tuple TO tests.nest_tuple_destination
AS
SELECT
    s AS s,
    t.1 AS i,
    t.2 AS d
FROM tests.nest_tuple_source
```

Also, we need a destination table with an adapted structure as the source table:

```sql
CREATE TABLE tests.nest_tuple_destination
(
    `s` String,
    `i` UInt8, 
    `d` DateTime64(3)
)
ENGINE = MergeTree
ORDER BY tuple()

INSERT INTO tests.nest_tuple_source FORMAT JSONEachRow {"s": "val1", "t": {"i": 42, "d": "2023-09-01 12:23:34.231"}}


SELECT *
FROM nest_tuple_destination

┌─s────┬──i─┬───────────────────────d─┐
│ val1 │ 42 │ 2023-09-01 12:23:34.231 │
└──────┴────┴─────────────────────────┘
```

Some hints:

- 💡 Beware of column names in ClickHouse they are Case sensitive.  If a JSON message has the key names in Capitals, the Kafka/Source table should have the same column names in Capitals.

- 💡 Also this `Tuple()` approach is not for Dynamic json schemas as explained above. In the case of having a dynamic schema, use the classic approach using `JSONExtract` set of functions. If the schema is fixed, you can use `Tuple()` for `JSONEachRow` format but you need to use classic tuple notation (using index reference) inside the MV, because using named tuples inside the MV won't work:

- 💡 `tuple.1 AS column1, tuple.2 AS column2` **CORRECT!**
- 💡 `tuple.column1 AS column1, tuple.column2 AS column2` **WRONG!**
- 💡 use `AS` (alias) for aggregated columns or columns affected by functions because MV do not work by positional arguments like SELECTs,they work by names**

Example:

- `parseDateTime32BestEffort(t_date)` **WRONG!**
- `parseDateTime32BestEffort(t_date) AS t_date` **CORRECT!**

## Using JSONEachRow with Map() in Materialized views

Sometimes we can have a nested json message with a dynamic size like these and all elements inside the nested json must be of the same type:

```json
{"k": "val1", "st": {"a": 42, "b": 1.877363}}

{"k": "val2", "st": {"a": 43, "b": 2.3343, "c": 34.4434}}

{"k": "val3", "st": {"a": 66743}}
```

In this case we can use Map() to parse the JSON message:

```sql

CREATE TABLE tests.nest_map_source
(
    `k` String,
    `st` Map(String, Float64)
)
Engine = Null 

CREATE MATERIALIZED VIEW tests.mv_nest_map TO tests.nest_map_destination
AS
SELECT
    k AS k,
    st['a'] AS st_a,
    st['b'] AS st_b,
    st['c'] AS st_c
FROM tests.nest_map_source 


CREATE TABLE tests.nest_map_destination
(
    `k` String,
    `st_a` Float64,
    `st_b` Float64,
    `st_c` Float64
)
ENGINE = MergeTree
ORDER BY tuple()
```

By default, ClickHouse will ignore unknown keys in the Map() but if you want to fail the insert if there are unknown keys then use the setting:

`input_format_skip_unknown_fields = 0`

```sql
INSERT INTO tests.nest_map_source FORMAT JSONEachRow {"k": "val1", "st": {"a": 42, "b": 1.877363}}
INSERT INTO tests.nest_map_source FORMAT JSONEachRow {"k": "val2", "st": {"a": 43, "b": 2.3343, "c": 34.4434}}
INSERT INTO tests.nest_map_source FORMAT JSONEachRow {"k": "val3", "st": {"a": 66743}}


SELECT *
FROM tests.nest_map_destination

┌─k────┬─st_a─┬─────st_b─┬─st_c─┐
│ val1 │   42 │ 1.877363 │    0 │
└──────┴──────┴──────────┴──────┘
┌─k────┬──st_a─┬─st_b─┬─st_c─┐
│ val3 │ 66743 │    0 │    0 │
└──────┴───────┴──────┴──────┘
┌─k────┬─st_a─┬───st_b─┬────st_c─┐
│ val2 │   43 │ 2.3343 │ 34.4434 │
└──────┴──────┴────────┴─────────┘
```

See also:

- [JSONExtract to parse many attributes at a time](/altinity-kb-queries-and-syntax/jsonextract-to-parse-many-attributes-at-a-time/)
- [JSONAsString and Mat. View as JSON parser](/altinity-kb-schema-design/altinity-kb-jsonasstring-and-mat.-view-as-json-parser/)