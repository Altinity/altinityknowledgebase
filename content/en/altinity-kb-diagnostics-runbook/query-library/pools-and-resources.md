---
title: "Pools and resources queries"
linkTitle: "Pools and resources"
weight: 40
description: >
    Cluster-wide queries for background pool saturation and memory pressure.
keywords:
  - clickhouse background pool
  - memory pressure
  - cgroup memory
  - jemalloc
---

Queries for inspecting background thread pool activity, configured pool
sizes, and memory pressure (process, jemalloc, cgroup, OS). All queries
fan out across the cluster — replace `{cluster}` with your cluster name.

## Q13. Pool saturation metrics

Current activity in each background pool. When a pool counter equals its
configured size (Q14), the pool is saturated — additional work will queue
behind it.

```sql
SELECT
    hostName() AS host,
    metric,
    value
FROM clusterAllReplicas('{cluster}', system.metrics)
WHERE metric IN (
    'BackgroundFetchesPoolTask',
    'BackgroundMergesAndMutationsPoolTask',
    'BackgroundCommonPoolTask',
    'BackgroundSchedulePoolTask',
    'BackgroundMessageBrokerSchedulePoolTask',
    'ReplicatedFetch',
    'ReplicatedSend',
    'ReplicatedChecks',
    'Merge',
    'PartMutation',
    'Query'
)
ORDER BY host, metric;
```

## Q14. Pool sizes (server settings)

The configured upper bound for each pool. Pair with Q13: when a Q13 value
matches the Q14 value for the same pool, that pool is the bottleneck.

```sql
SELECT
    hostName() AS host,
    name, value
FROM clusterAllReplicas('{cluster}', system.server_settings)
WHERE name IN (
    'background_pool_size',
    'background_fetches_pool_size',
    'background_merges_mutations_concurrency_ratio',
    'background_common_pool_size',
    'background_schedule_pool_size',
    'background_message_broker_schedule_pool_size'
);
```

## Q15. Memory pressure

Process RSS, the ClickHouse memory tracker, jemalloc resident/active, OS
available/total, and cgroup used/total. The first query when investigating
OOM-kills, `MEMORY_LIMIT_EXCEEDED` (code 241), or pod restarts.

```sql
SELECT
    hostName() AS host,
    metric,
    formatReadableSize(value) AS val
FROM clusterAllReplicas('{cluster}', system.asynchronous_metrics)
WHERE metric IN (
    'MemoryResident',
    'MemoryTracking',
    'jemalloc.resident',
    'jemalloc.active',
    'OSMemoryAvailable',
    'OSMemoryTotal',
    'CGroupMemoryUsed',
    'CGroupMemoryTotal'
)
ORDER BY host, metric;
```

If `MemoryResident` is far above `MemoryTracking`, the gap is jemalloc
retained pages and OS page cache. See
[Who ate my memory?](/altinity-kb-setup-and-maintenance/altinity-kb-who-ate-my-memory/)
for attribution.

## Q54. Memory pressure per host (compact)

Same as Q15 but limited to the three numbers you compare across hosts.
Use this to detect cluster-wide memory pressure (every host at >90%) vs a
single-host issue.

```sql
SELECT
    hostName() AS host,
    metric, formatReadableSize(value) AS val
FROM clusterAllReplicas('{cluster}', system.asynchronous_metrics)
WHERE metric IN ('MemoryResident', 'OSMemoryAvailable',
                 'CGroupMemoryUsed', 'CGroupMemoryTotal')
ORDER BY host, metric;
```

When `CGroupMemoryUsed / CGroupMemoryTotal > 90%` on every host, the
cluster is memory-constrained globally — workload-level tuning helps
marginally, but the real fix is more RAM per node or less work per node.
