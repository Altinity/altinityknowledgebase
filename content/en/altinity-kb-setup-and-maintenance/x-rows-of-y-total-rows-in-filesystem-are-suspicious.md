---
title: "X rows of Y total rows in filesystem are suspicious"
linkTitle: "X rows of Y total rows in filesystem are suspicious"
description: >
    X rows of Y total rows in filesystem are suspicious
---
{{% alert title="Warning" color="warning" %}}
The local set of parts of table doesn't look like the set of parts in ZooKeeper. 100.00 rows of 150.00 total rows in filesystem are suspicious. There are 1 unexpected parts with 100 rows (1 of them is not just-written with 100 rows), 0 missing parts (with 0 blocks).: Cannot attach table.
{{% /alert %}}

ClickHouse has a registry of parts in ZooKeeper.

And during the start ClickHouse compares that list of parts on a local disk is consistent with a list in ZooKeeper. If the lists are too different ClickHouse denies to start because it could be an issue with settings, wrong Shard or wrong Replica macroses. But this safe-limiter throws an exception if the difference is more 50% (in rows).

In your case the table is very small and the difference &gt;50% ( 100.00 vs 150.00 ) is only a single part mismatch, which can be the result of hard restart.

```sql
SELECT * FROM system.merge_tree_settings WHERE name = 'replicated_max_ratio_of_wrong_parts'

┌─name────────────────────────────────┬─value─┬─changed─┬─description──────────────────────────────────────────────────────────────────────────┬─type──┐
│ replicated_max_ratio_of_wrong_parts │ 0.5   │       0 │ If ratio of wrong parts to total number of parts is less than this - allow to start. │ Float │
└─────────────────────────────────────┴───────┴─────────┴──────────────────────────────────────────────────────────────────────────────────────┴───────┘
```

You can set another value of `replicated_max_ratio_of_wrong_parts` for all MergeTree tables or per table.

[https://clickhouse.tech/docs/en/operations/settings/merge-tree-settings](https://clickhouse.tech/docs/en/operations/settings/merge-tree-settings)
