---
title: "Disk and storage queries"
linkTitle: "Disk and storage"
weight: 30
description: >
    Cluster-wide queries for disk usage and TTL move activity.
keywords:
  - clickhouse disk usage
  - clickhouse ttl
  - NOT_ENOUGH_SPACE
---

Queries for inspecting per-disk free space across the cluster and recent
TTL movement / mutation activity. All queries fan out across the cluster —
replace `{cluster}` with your cluster name.

## Q11. Disk usage per host ⭐

Per-host, per-disk free space, total space, and used percentage. The first
query when `NOT_ENOUGH_SPACE` appears in `last_exception`, or when merges
fail and `Q1`'s exception column points at disk.

```sql
SELECT
    hostName() AS host,
    name AS disk_name,
    type,
    round(free_space / 1e9, 1) AS free_GB,
    round(total_space / 1e9, 1) AS total_GB,
    round((1 - free_space / total_space) * 100, 1) AS used_pct
FROM clusterAllReplicas('{cluster}', system.disks)
GROUP BY host, disk_name, type, free_space, total_space
ORDER BY host, used_pct DESC;
```

## Q12. TTL move / mutation activity

`MovePart` and `MutatePart` events from `part_log` over the last hour.
Useful when investigating whether TTL moves to a cold tier are actually
running, and whether they're succeeding.

```sql
SELECT
    hostName() AS host,
    event_time,
    event_type,
    database, table, part_name,
    rows,
    formatReadableSize(size_in_bytes) AS size,
    error
FROM clusterAllReplicas('{cluster}', system.part_log)
WHERE event_time >= now() - INTERVAL 1 HOUR
  AND event_type IN ('MovePart', 'MutatePart')
ORDER BY event_time DESC
LIMIT 50;
```

A non-empty `error` column with `S3 access denied`, `connection`, or
`credentials` keywords points at the cold-tier disk policy, not at
ClickHouse itself.
