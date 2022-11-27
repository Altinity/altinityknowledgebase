---
title: "Mutations"
linkTitle: "Mutations"
description: >
    ALTER UPDATE / DELETE
---
## How to know if `ALTER TABLE … DELETE/UPDATE mutation ON CLUSTER` was finished successfully on all the nodes?

A. mutation status in system.mutations is local to each replica, so use

```sql
SELECT hostname(), * FROM clusterAllReplicas('your_cluster_name', system.mutations);
-- you can also add WHERE conditions to that query if needed.
```

Look on `is_done` and `latest_fail_reason` columns

## Are mutations being run in parallel or they are sequential in ClickHouse (in scope of one table)

![Mutations](/assets/mutations4.png)

ClickHouse runs mutations sequentially, but it can combine several mutations in a single and apply all of them in one merge.
Sometimes, it can lead to problems, when a combined expression which ClickHouse needs to execute becomes really big. (If ClickHouse combined thousands of mutations in one)


Because ClickHouse stores data in independent parts, ClickHouse is able to run mutation(s) merges for each part independently and in parallel.
It also can lead to high resource utilization, especially memory usage if you use `x IN (SELECT ... FROM big_table)` statements in mutation, because each merge will run and keep in memory its own HashSet. You can avoid this problem, if you will use [Dictionary approach](../update-via-dictionary) for such mutations.

Parallelism of mutations controlled by settings:

```sql
SELECT *
FROM system.merge_tree_settings
WHERE name LIKE '%mutation%'

┌─name───────────────────────────────────────────────┬─value─┬─changed─┬─description──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┬─type───┐
│ max_replicated_mutations_in_queue                  │ 8     │       0 │ How many tasks of mutating parts are allowed simultaneously in ReplicatedMergeTree queue.                                                                                    │ UInt64 │
│ number_of_free_entries_in_pool_to_execute_mutation │ 20    │       0 │ When there is less than specified number of free entries in pool, do not execute part mutations. This is to leave free threads for regular merges and avoid "Too many parts" │ UInt64 │
└────────────────────────────────────────────────────┴───────┴─────────┴──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┴────────┘
```
