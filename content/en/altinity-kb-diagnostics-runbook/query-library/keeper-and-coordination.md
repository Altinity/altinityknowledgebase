---
title: "Keeper and coordination queries"
linkTitle: "Keeper and coordination"
weight: 70
description: >
    Cluster-wide queries for ClickHouse Keeper / ZooKeeper connection
    state, wait-time percentiles, topology, and leader distribution.
keywords:
  - clickhouse keeper
  - zookeeper
  - zookeeper_connection
  - keeper latency
---

Queries for ClickHouse Keeper / ZooKeeper visibility: connection state,
recent exceptions, cumulative wait events, current-window tail latency,
sidecar vs centralized topology, and per-host leader counts.

All queries fan out across the cluster — replace `{cluster}` with your
cluster name.

## Q29. Keeper connection status

Connection state per replica — which Keeper node it's connected to,
session age, expiry flag, API version.

```sql
SELECT
    hostName() AS host,
    name, value
FROM clusterAllReplicas('{cluster}', system.zookeeper_connection);
```

## Q30. Keeper errors (last hour)

Recent exceptions mentioning ZooKeeper / Keeper / code 999. Useful when a
replica goes readonly and you suspect a Keeper session loss.

```sql
SELECT
    hostName() AS host,
    event_time,
    exception_code,
    substring(exception, 1, 200) AS exception_short
FROM clusterAllReplicas('{cluster}', system.query_log)
WHERE event_time >= now() - INTERVAL 1 HOUR
  AND type = 'ExceptionWhileProcessing'
  AND (exception ILIKE '%zookeeper%' OR exception ILIKE '%keeper%' OR exception_code = 999)
ORDER BY event_time DESC
LIMIT 30;
```

## Q33. Keeper wait time and activity (cumulative)

Cumulative Keeper-related event counters since process start. Useful for a
quick "what does Keeper see" snapshot — but read the warning below before
computing ratios.

```sql
SELECT hostName() AS host, event, value
FROM clusterAllReplicas('{cluster}', system.events)
WHERE event LIKE '%ZooKeeper%' OR event LIKE '%Keeper%'
ORDER BY value DESC
LIMIT 30;
```

Key events:

- `ZooKeeperWaitMicroseconds` — total wait time on Keeper responses.
- `ZooKeeperTransactions` — total transactions.
- `ZooKeeperList` — directory listings (high during many-parts
  coordination).
- `ZooKeeperHardwareExceptions` / `ZooKeeperUserExceptions` — error counts.

> **Warning.** These are cumulative since process start. A ratio like
> `ZooKeeperWaitMicroseconds / ZooKeeperTransactions` reflects everything
> the process has seen, including peaks from days ago. For current state,
> use Q49 instead.

## Q49. Tail latency for Keeper operations ⭐

p50 / p95 / p99 of microseconds-per-transaction from `metric_log` over a
recent window. The right tool for "is host X slow on Keeper right now",
because it ignores stale peaks baked into the cumulative counters.

```sql
SELECT
    hostName() AS host,
    quantile(0.50)(ProfileEvent_ZooKeeperWaitMicroseconds / nullIf(ProfileEvent_ZooKeeperTransactions, 0)) AS p50_us_per_txn,
    quantile(0.95)(ProfileEvent_ZooKeeperWaitMicroseconds / nullIf(ProfileEvent_ZooKeeperTransactions, 0)) AS p95_us_per_txn,
    quantile(0.99)(ProfileEvent_ZooKeeperWaitMicroseconds / nullIf(ProfileEvent_ZooKeeperTransactions, 0)) AS p99_us_per_txn
FROM clusterAllReplicas('{cluster}', system.metric_log)
WHERE event_time >= now() - INTERVAL 30 MINUTE
  AND ProfileEvent_ZooKeeperTransactions > 0
GROUP BY host
ORDER BY host;
```

If Q33 shows a per-host ratio but Q49 doesn't, the ratio is an artefact of
historical peak load — not a current problem.

## Q50. Keeper connection topology

Tells you whether each replica connects to a co-located Keeper (sidecar:
`keeper_address == hostName()`) or to a central Keeper cluster. The
"slow Keeper follower" hypothesis only applies in the central topology.

```sql
SELECT
    hostName() AS host,
    name AS keeper_node,
    host AS keeper_address,
    port,
    connected_time,
    session_uptime_elapsed_seconds,
    is_expired,
    keeper_api_version
FROM clusterAllReplicas('{cluster}', system.zookeeper_connection)
ORDER BY host;
```

## Q51. Leader distribution across hosts

Per-host counts of `is_leader = 1` vs `is_leader = 0` rows in
`system.replicas`. In a healthy multi-replica cluster, leader counts
should be roughly balanced. In a sidecar Keeper layout where every replica
is leader of its local copy, you'll see `leader_count == total_replicas` —
expected, not a concern.

```sql
SELECT
    hostName() AS host,
    countIf(is_leader = 1) AS leader_count,
    countIf(is_leader = 0) AS non_leader_count,
    count() AS total_replicas
FROM clusterAllReplicas('{cluster}', system.replicas)
GROUP BY host
ORDER BY host;
```
