---
title: "Investigation methods"
linkTitle: "Investigation methods"
weight: 20
description: >
    Process reminders that prevent the most common misdiagnoses.
keywords:
  - clickhouse troubleshooting
  - clickhouse diagnostics
  - tables array
  - profileevents
  - metric_log
---

These reminders are about *how* to investigate — they prevent the kinds of
wrong reads that send a diagnosis in the wrong direction for hours. Each one
maps to a specific query or pattern elsewhere in the runbook.

## Verify before committing to a cause

When the evidence points to more than one plausible cause, run one more
verification query before you state a conclusion. A wrong RCA costs more
trust and more time than the verification step would have. The cost of an
extra `SELECT` is seconds; the cost of unwinding a wrong diagnosis can be
days.

## `tables[]` in `query_log` is not the writer

The `query_log.tables` array contains every table touched by the query,
including the entire MV dependency chain. The actual physical INSERT target
is in the query text, not in `tables[0]`.

To find the real writer behind a failing insert, extract from the query
text:

```sql
SELECT regexpExtract(query, 'INSERT INTO\s+([\w\.`]+)') AS target, …
```

See [Q47](/altinity-kb-diagnostics-runbook/query-library/insert-load-and-host-skew/#q47-failed-insert-query-text-inspection)
and the dedicated [scenario](/altinity-kb-diagnostics-runbook/scenarios/async-insert-issues/).

## Cumulative metrics hide current state

`system.events` integrates since process start. Ratios computed from those
totals can reflect a peak-load period that happened days ago and is no
longer relevant.

When comparing per-host behaviour right now, use `system.metric_log` with a
recent window (5–30 minutes):

- [Q48](/altinity-kb-diagnostics-runbook/query-library/insert-load-and-host-skew/#q48-per-second-activity-from-metric_log)
  — per-second profile activity by host.
- [Q49](/altinity-kb-diagnostics-runbook/query-library/keeper-and-coordination/#q49-tail-latency-for-keeper-operations)
  — p50/p95/p99 of Keeper transactions, by host.

If someone reports "host X has Nx higher Keeper waits", reproduce it with
Q49 over the last 30 minutes before treating it as a current problem.

## Same settings + different behaviour ⇒ upstream cause

If `system.settings` is identical across hosts (see
[Q52](/altinity-kb-diagnostics-runbook/query-library/insert-load-and-host-skew/#q52-routing-settings-inspection))
and behaviour is still skewed across replicas, the cause is outside
ClickHouse. Likely sources:

- Entry-point routing (HAProxy, ingress, or client library load balancing)
  concentrating traffic on a subset of replicas.
- Pod-level resource contention (CPU throttling, memory pressure on the
  node, page cache flushes from a noisy neighbour).
- Coordination work concentrated on a subset of hosts (leader concentration,
  see [Q51](/altinity-kb-diagnostics-runbook/query-library/keeper-and-coordination/#q51-leader-distribution-across-hosts)).

Stop looking inside ClickHouse — the answer is upstream.

## Distinguish workload from failure

"Volume is balanced" and "failures are balanced" answer different questions.
Either can be skewed independently. To resolve a host-skew report, look at
both:

- Workload — [Q48](/altinity-kb-diagnostics-runbook/query-library/insert-load-and-host-skew/#q48-per-second-activity-from-metric_log)
  (`ProfileEvent_AsyncInsertQuery` per host).
- Failure rate — [Q53](/altinity-kb-diagnostics-runbook/query-library/insert-load-and-host-skew/#q53-failure-rate-per-host)
  (failures normalised by attempts).

Together they let you say "host A receives 4× more attempts" or "host A
fails at 5× the rate at equal volume" — those are very different problems
with different fixes.

## ProfileEvents reveal "waited not worked"

A failed query with `RealTimeMicroseconds ≈ timeout` and
`UserTimeMicroseconds` near zero means the query never executed. It sat in
a queue or on a lock. This rules out "the work itself is slow" and points
to "the wait is the problem".

Before theorising about a slow MV chain or slow merge as the cause of a
failed insert, inspect ProfileEvents on representative failed queries:

```sql
SELECT
    query_id,
    query_duration_ms,
    ProfileEvents['RealTimeMicroseconds']  AS real_us,
    ProfileEvents['UserTimeMicroseconds']  AS user_us,
    ProfileEvents['SystemTimeMicroseconds'] AS sys_us
FROM clusterAllReplicas('{cluster}', system.query_log)
WHERE event_time >= now() - INTERVAL 30 MINUTE
  AND type = 'ExceptionWhileProcessing'
  AND exception ILIKE '%async insert%timeout%'
LIMIT 20;
```

If `user_us` is in single-digit milliseconds while `real_us` is at the
timeout ceiling, the work never ran. Find the lock or queue, not the slow
operator.

## Routing settings to know about

A short glossary of the settings that determine *where* a query lands and
*how* its MVs execute. Confirm them with
[Q52](/altinity-kb-diagnostics-runbook/query-library/insert-load-and-host-skew/#q52-routing-settings-inspection)
before tuning anything.

- **`load_balancing`** — picks the replica for a Distributed table read or
  insert. `hostname_levenshtein_distance` concentrates by hostname
  similarity (often pinning to self), which can imbalance routing
  unexpectedly. `random` or `round_robin` spreads work evenly.
- **`prefer_localhost_replica`** — when `1`, the local replica is preferred
  regardless of `load_balancing`. Useful for read locality, risky for
  insert balance.
- **`distributed_foreground_insert`** — when `1`, INSERTs into a
  Distributed table wait synchronously for remote acks. Slower but no
  silent loss.
- **`parallel_view_processing`** — when `0` (historical default on many
  versions), MVs on a target table execute serially per insert. With a
  deep MV chain, this turns each insert into a long sequential pipeline.

## Sidecar Keeper means co-located, not shared

If `system.zookeeper_connection.host == hostName()` (see
[Q50](/altinity-kb-diagnostics-runbook/query-library/keeper-and-coordination/#q50-keeper-connection-topology)),
the replica connects to a Keeper running on the same pod. "Slow Keeper
follower" theories don't apply in this topology — there is no shared
follower to be slow. Issues here are about pod-level contention (CPU, page
cache, disk), not Keeper network routing.
