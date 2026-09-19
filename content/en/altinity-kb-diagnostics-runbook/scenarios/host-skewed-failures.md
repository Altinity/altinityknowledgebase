---
title: "Host-skewed failures"
linkTitle: "Host-skewed failures"
weight: 110
description: >
    Diagnosing situations where failures concentrate on a subset of hosts
    even though workload and configuration look identical.
keywords:
  - host skew
  - load_balancing
  - haproxy
  - parallel_view_processing
  - cumulative metrics
---

Three related cases live here: host-skewed failures with a balanced
workload, "stale skew" complaints based on cumulative metrics, and the
misattribution of failure tables when `tables[]` is read as the writer.
All three share the same root pattern — surface appearances disagree with
what's actually happening — and the same investigative tools resolve them.

## Host-skewed insert failures (workload balanced, failures not)

### Symptoms

- Multiple replicas in the cluster.
- Async insert failure rate is wildly different across hosts.
- Question is some variation of "why are some hosts broken while others
  work fine?".

### Diagnostic flow

| Step | Query | What to look for |
|---|---|---|
| 1 | [Q46](/altinity-kb-diagnostics-runbook/query-library/insert-load-and-host-skew/#q46-per-host-insert-duration-profile) ⭐ | Per-host insert duration imbalance. |
| 2 | [Q53](/altinity-kb-diagnostics-runbook/query-library/insert-load-and-host-skew/#q53-failure-rate-per-host) | Failure rate per host, workload-normalised. |
| 3 | [Q48](/altinity-kb-diagnostics-runbook/query-library/insert-load-and-host-skew/#q48-per-second-activity-from-metric_log) | Workload volume per host; active query pile-up. |
| 4 | [Q54](/altinity-kb-diagnostics-runbook/query-library/pools-and-resources/#q54-memory-pressure-per-host-compact) | Memory pressure — concentrated or cluster-wide? |
| 5 | [Q33](/altinity-kb-diagnostics-runbook/query-library/keeper-and-coordination/#q33-keeper-wait-time-and-activity-cumulative) + [Q49](/altinity-kb-diagnostics-runbook/query-library/keeper-and-coordination/#q49-tail-latency-for-keeper-operations) | Confirm Keeper isn't the imbalance source. |
| 6 | [Q52](/altinity-kb-diagnostics-runbook/query-library/insert-load-and-host-skew/#q52-routing-settings-inspection) | Verify routing settings are identical across hosts. |

### Decision tree

- **Settings identical + workload balanced + failures host-skewed** →
  upstream entry-point routing (HAProxy / ingress directing traffic to a
  subset of hosts).
- **Settings identical + memory pressure on bad hosts only** → resource
  contention on those pods (CPU throttling, page-cache pressure).
- **`parallel_view_processing = 0` + MV chains on slow hosts** → serial
  MV execution queue, exacerbated by entry-point routing.

### Resolution path

- Raise `async_insert_busy_timeout_ms` for immediate relief.
- Enable `parallel_view_processing = 1` to cut MV-chain wall time on each
  insert (be aware this can change MV ordering semantics — confirm the
  application is tolerant).
- Change `load_balancing` from a hostname-affine policy to `round_robin`
  or `random`.
- Investigate the ingress / load balancer to spread client connections
  evenly across replicas.

## Stale skew: a "ratio" computed from cumulative metrics

### Symptoms

- Someone reports a metric ratio ("host X has Nx higher Keeper waits")
  and asks for investigation.
- The supporting evidence is `system.events` totals — cumulative since
  process start.

### Diagnostic flow

| Step | Query | What to look for |
|---|---|---|
| 1 | — | Ask which window the ratio was computed over. Cumulative `system.events` values include all historical peaks since process start. |
| 2 | [Q49](/altinity-kb-diagnostics-runbook/query-library/keeper-and-coordination/#q49-tail-latency-for-keeper-operations) | p50/p95/p99 from `metric_log` over a recent window (10–30 min). |
| 3 | [Q33](/altinity-kb-diagnostics-runbook/query-library/keeper-and-coordination/#q33-keeper-wait-time-and-activity-cumulative) | Wait by host on a recent window — confirm whether imbalance is current or historical. |
| 4 | [Q48](/altinity-kb-diagnostics-runbook/query-library/insert-load-and-host-skew/#q48-per-second-activity-from-metric_log) | Whether watches and inflight requests are balanced now. |
| 5 | [Q50](/altinity-kb-diagnostics-runbook/query-library/keeper-and-coordination/#q50-keeper-connection-topology) + [Q51](/altinity-kb-diagnostics-runbook/query-library/keeper-and-coordination/#q51-leader-distribution-across-hosts) | Verify Keeper topology and leadership are uniform. |

### Decision tree

- **Cumulative shows Nx skew, recent 10-min window shows balanced** →
  historical incident artefact, already resolved.
- **Cumulative and recent window agree** → real ongoing imbalance; dig
  into per-host root cause.
- **Recent window shows a different host as outlier** → the original
  observation is stale. Explain the data carefully when reporting back.

## Misattributed failure tables

### Symptoms

- Failed inserts list many target tables in `system.query_log.tables[]`.
- Several look like the culprit.
- Raising timeouts on the suspected tables doesn't help.

### Diagnostic flow

1. Run [Q47](/altinity-kb-diagnostics-runbook/query-library/insert-load-and-host-skew/#q47-failed-insert-query-text-inspection)
   to get the actual INSERT query text.
2. The `INSERT INTO database.table` statement reveals the **physical**
   target — not the MV chain.
3. Compare with the `tables[]` array — additional entries are MV
   dependencies, not direct writes.
4. Apply the fix on the actual physical target table, not on MV
   dependencies.

The `tables[]` array tells you the full MV blast radius, not the specific
writer. Always run Q47 before deciding "the slow table is X". See
[Investigation methods → `tables[]` in query_log is not the writer](/altinity-kb-diagnostics-runbook/investigation-methods/#tables-in-query_log-is-not-the-writer).
