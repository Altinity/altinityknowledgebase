---
title: "Parts and merges queries"
linkTitle: "Parts and merges"
weight: 20
description: >
    Cluster-wide queries for parts health, partition fragmentation, and
    merge throughput.
keywords:
  - clickhouse parts
  - clickhouse merges
  - parts_to_delay_insert
  - too_many_parts
---

Queries for diagnosing part counts, partition fragmentation, active merges,
and the part-creation-vs-merge rate. All queries fan out across the
cluster — replace `{cluster}` with your cluster name and
`{table_pattern}` where indicated.

## Q6. Parts health per host

Per-host, per-table active part count, total rows, on-disk size, and the
most recent modification time. The starting point when investigating high
part counts cluster-wide.

```sql
SELECT
    hostName() AS host,
    database,
    table,
    count() AS active_parts,
    sum(rows) AS total_rows,
    round(sum(bytes_on_disk) / 1e9, 2) AS size_GB,
    max(modification_time) AS last_modified
FROM clusterAllReplicas('{cluster}', system.parts)
WHERE active = 1
GROUP BY host, database, table
ORDER BY host, active_parts DESC;
```

## Q7. Parts count per partition ⭐

`parts_to_delay_insert` and `parts_to_throw_insert` are **per partition**,
not per table. A table with a thousand parts spread across a hundred
partitions is fine; a partition with three hundred parts is in trouble.
Use this when diagnosing `TOO_MANY_PARTS` (code 252) or "Delaying inserts
by N ms" warnings.

```sql
SELECT
    hostName() AS host,
    database, table, partition,
    count() AS parts,
    sum(rows) AS rows,
    round(sum(bytes_on_disk) / 1e9, 2) AS size_GB
FROM clusterAllReplicas('{cluster}', system.parts)
WHERE active = 1
GROUP BY host, database, table, partition
HAVING parts > 100
ORDER BY parts DESC
LIMIT 50;
```

## Q8. Active merges

Currently-executing merges by host and table, with progress, elapsed time,
total merge size, and memory in use. Lets you see whether merges are
running and how much memory they hold.

```sql
SELECT
    hostName() AS host,
    database,
    table,
    count() AS active_merges,
    round(avg(progress) * 100, 1) AS avg_progress_pct,
    max(elapsed) AS max_elapsed_sec,
    round(sum(total_size_bytes_compressed) / 1e9, 2) AS total_merge_GB,
    round(sum(memory_usage) / 1e9, 1) AS merge_memory_GB
FROM clusterAllReplicas('{cluster}', system.merges)
GROUP BY host, database, table
ORDER BY host, active_merges DESC;
```

## Q9. Part creation vs merge rate (last 30 minutes)

Counts `NewPart`, `MergeParts`, `MutatePart`, and `RemovePart` events in a
recent window. When `new_parts` is growing faster than `merged_parts`, the
merge pool is not keeping up — back-pressure is imminent.

```sql
SELECT
    hostName() AS host,
    database, table,
    sum(if(event_type = 'NewPart', 1, 0)) AS new_parts,
    sum(if(event_type = 'MergeParts', 1, 0)) AS merged_parts,
    sum(if(event_type = 'MergeParts', rows, 0)) AS rows_merged,
    sum(if(event_type = 'MutatePart', 1, 0)) AS mutations,
    sum(if(event_type = 'RemovePart', 1, 0)) AS removed_parts
FROM clusterAllReplicas('{cluster}', system.part_log)
WHERE event_time >= now() - INTERVAL 30 MINUTE
GROUP BY host, database, table
ORDER BY new_parts DESC
LIMIT 30;
```

## Q10. Merge settings check

Confirms the threshold settings before recommending a tuning change. These
are the values the engine actually uses, not what's in the running config.

```sql
SELECT name, value
FROM system.merge_tree_settings
WHERE name IN (
    'max_bytes_to_merge_at_max_space_in_pool',
    'number_of_free_entries_in_pool_to_lower_max_size_of_merge',
    'max_number_of_merges_with_ttl_in_pool',
    'parts_to_delay_insert',
    'parts_to_throw_insert',
    'inactive_parts_to_delay_insert',
    'inactive_parts_to_throw_insert'
);
```

## Q42. Partition count health

Per-table partition count, active part count, and the ratio between them.
A high `partition_count` usually means a high-cardinality partition key
(e.g., partitioning by minute or hour on a dataset that doesn't need it).
A high `avg_parts_per_partition` means merges can't keep up with inserts.

```sql
SELECT
    hostName() AS host,
    database, `table`,
    count(DISTINCT partition) AS partition_count,
    count() AS active_parts,
    round(active_parts / partition_count, 1) AS avg_parts_per_partition,
    sum(rows) AS total_rows,
    round(sum(bytes_on_disk) / 1e9, 2) AS size_GB
FROM clusterAllReplicas('{cluster}', system.parts)
WHERE active = 1 AND `table` LIKE '%{table_pattern}%'
GROUP BY host, database, `table`
ORDER BY partition_count DESC;
```

Flag thresholds:

- `partition_count > 500` per table → schema problem (partition key
  cardinality is too high).
- `avg_parts_per_partition > 50` → merge pool can't keep up.
- `partition_count = 12` for a year of monthly data → correct.
