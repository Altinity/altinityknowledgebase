---
title: "ANSI SQL mode"
linkTitle: "ANSI SQL mode"
description: >
    ANSI SQL mode
---
To make ClickHouse® more compatible with ANSI SQL standards (at the expense of some performance), you can adjust several settings. These configurations will bring ClickHouse closer to ANSI SQL behavior but may introduce a slowdown in query performance:

```sql
join_use_nulls=1
```
Introduced in: early versions
Ensures that JOIN operations return NULL for non-matching rows, aligning with standard SQL behavior.


```sql
cast_keep_nullable=1
```
Introduced in: v20.5
Preserves the NULL flag when casting between data types, which is typical in ANSI SQL.


```sql
union_default_mode='DISTINCT'
```
Introduced in: v21.1
Makes the UNION operation default to UNION DISTINCT, which removes duplicate rows, following ANSI SQL behavior.


```sql
allow_experimental_window_functions=1
```
Introduced in: v21.3
Enables support for window functions, which are a standard feature in ANSI SQL.


```sql
prefer_column_name_to_alias=1
```
Introduced in: v21.4
This setting resolves ambiguities by preferring column names over aliases, following ANSI SQL conventions.


```sql
group_by_use_nulls=1
```
Introduced in: v22.7
Allows NULL values to appear in the GROUP BY clause, consistent with ANSI SQL behavior.

By enabling these settings, ClickHouse becomes more ANSI SQL-compliant, although this may come with a trade-off in terms of performance. Each of these options can be enabled as needed, based on the specific SQL compatibility requirements of your application.


