---
title: "Useful settings to turn on/Defaults that should be reconsidered"
linkTitle: "Useful settings to turn on"
weight: 100
description: >-
     Useful settings to turn on.
---

## Useful settings to turn on/Defaults that should be reconsidered

Some setting that are not enabled by default.

* [ttl_only_drop_parts](https://clickhouse.com/docs/en/operations/settings/settings/#ttl_only_drop_parts)

Enables or disables complete dropping of data parts where all rows are expired in MergeTree tables.

When ttl_only_drop_parts is disabled (by default), the ClickHouse server only deletes expired rows according to their TTL.

When ttl_only_drop_parts is enabled, the ClickHouse server drops a whole part when all rows in it are expired.

Dropping whole parts instead of partial cleaning TTL-d rows allows having shorter merge_with_ttl_timeout times and lower impact on system performance.

* [join_use_nulls](https://clickhouse.com/docs/en/operations/settings/settings/#join_use_nulls)

Might be you not expect that join will be filled with default values for missing columns (instead of classic NULLs) during JOIN.

Sets the type of JOIN behaviour. When merging tables, empty cells may appear. ClickHouse fills them differently based on this setting.

Possible values:

0 — The empty cells are filled with the default value of the corresponding field type.
1 — JOIN behaves the same way as in standard SQL. The type of the corresponding field is converted to Nullable, and empty cells are filled with NULL.

* [aggregate_functions_null_for_empty](https://clickhouse.com/docs/en/operations/settings/settings/#aggregate_functions_null_for_empty)

Default behaviour is not compatible with ANSI SQL (ClickHouse avoids Nullable types by perfomance reasons)

```sql
select sum(x), avg(x) from (select 1 x where 0);
┌─sum(x)─┬─avg(x)─┐
│      0 │    nan │
└────────┴────────┘

set aggregate_functions_null_for_empty=1;

select sum(x), avg(x) from (select 1 x where 0);
┌─sumOrNull(x)─┬─avgOrNull(x)─┐
│         ᴺᵁᴸᴸ │         ᴺᵁᴸᴸ │
└──────────────┴──────────────┘
```
