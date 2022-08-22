---
title: "Who ate my CPU"
linkTitle: "Who ate my CPU"
weight: 100
description: >-
     Queries to find which subsytem of Clickhouse is using the most of CPU.
---

## Merges

```sql
SELECT
    table,
    round((elapsed * (1 / progress)) - elapsed, 2) AS estimate,
    elapsed,
    progress,
    is_mutation,
    formatReadableSize(total_size_bytes_compressed) AS size,
    formatReadableSize(memory_usage) AS mem
FROM system.merges
ORDER BY elapsed DESC
```

## Mutations

```sql
SELECT
    database,
    table,
    substr(command, 1, 30) AS command,
    sum(parts_to_do) AS parts_to_do,
    anyIf(latest_fail_reason, latest_fail_reason != '')
FROM system.mutations
WHERE NOT is_done
GROUP BY
    database,
    table,
    command
```

## Current Processes

```sql
select elapsed, query from system.processes where is_initial_query and elapsed > 2
```

## Processes retrospectively

```sql
SELECT
    normalizedQueryHash(query),
    current_database,
    sum(`ProfileEvents.Values`[indexOf(`ProfileEvents.Names`, 'UserTimeMicroseconds')]) AS userCPU,
    count(),
    avg(query_duration_ms) query_duration_ms,
    any( substr(query, 1, 60) ) _query
FROM system.query_log
WHERE (type = 2) AND (event_date >= today())
GROUP BY
    current_database,
    normalizedQueryHash(query)
ORDER BY userCPU DESC
LIMIT 10;
```
