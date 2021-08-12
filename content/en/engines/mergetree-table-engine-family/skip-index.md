---
title: "Skip index"
linkTitle: "Skip index"
description: >
    Skip index
---
{{% alert title="Warning" color="warning" %}}
When you are creating skip indexes in non-regular (Replicated)MergeTree tables over non ORDER BY columns. ClickHouse applies index condition on the first step of query execution, so it's possible to get outdated rows.
{{% /alert %}}

```sql
--(1) create test table
drop table if exists test;
create table test
(
    version UInt32
    ,id UInt32
    ,state UInt8
    ,INDEX state_idx (state) type set(0) GRANULARITY 1
) ENGINE ReplacingMergeTree(version)
      ORDER BY (id);

--(2) insert sample data
INSERT INTO test (version, id, state) VALUES (1,1,1);
INSERT INTO test (version, id, state) VALUES (2,1,0);
INSERT INTO test (version, id, state) VALUES (3,1,1);

--(3) check the result:
-- expected 3, 1, 1
select version, id, state from test final;
┌─version─┬─id─┬─state─┐
│       3 │  1 │     1 │
└─────────┴────┴───────┘

-- expected empty result
select version, id, state from test final where state=0;
┌─version─┬─id─┬─state─┐
│       2 │  1 │     0 │
└─────────┴────┴───────┘
```
