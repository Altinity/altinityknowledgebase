---
title: "ANSI SQL mode"
linkTitle: "ANSI SQL mode"
description: >
    ANSI SQL mode
---
It's possible to tune some settings which would make ClickHouse more ANSI SQL compatible(and slower):

```sql
SET join_use_nulls=1; -- introduced long ago
SET cast_keep_nullable=1; -- introduced in 20.5
SET union_default_mode='DISTINCT'; -- introduced in 21.1
SET allow_experimental_window_functions=1; -- introduced in 21.3
SET prefer_column_name_to_alias=1; -- introduced in 21.4;
SET group_by_use_nulls=1; -- introduced in 22.7;
```
