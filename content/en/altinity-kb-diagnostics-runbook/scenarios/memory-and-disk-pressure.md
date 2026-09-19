---
title: "Memory and disk pressure"
linkTitle: "Memory and disk pressure"
weight: 50
description: >
    Diagnosing OOM, `MEMORY_LIMIT_EXCEEDED`, `NOT_ENOUGH_SPACE`, and
    cluster-wide memory pressure that aggravates other failures.
keywords:
  - clickhouse OOM
  - MEMORY_LIMIT_EXCEEDED
  - NOT_ENOUGH_SPACE
  - cgroup memory
---

Three closely-related modes: per-query OOM, disk-full conditions blocking
merges, and the cluster-wide memory pressure that turns a marginal
workload into one that fails.

## OOM / memory pressure

### Symptoms

- Code 241 (`MEMORY_LIMIT_EXCEEDED`).
- `OvercommitTracker` killing queries.
- ClickHouse pod restarts / OOMKilled.

### Diagnostic flow

| Step | Query | What to look for |
|---|---|---|
| 1 | [Q15](/altinity-kb-diagnostics-runbook/query-library/pools-and-resources/#q15-memory-pressure) | `MemoryResident` vs `CGroupMemoryTotal` — actual headroom. |
| 2 | [Q17](/altinity-kb-diagnostics-runbook/query-library/queries-and-mutations/#q17-active-queries-right-now) | Active queries — large aggregations holding GB of memory. |
| 3 | [Q18](/altinity-kb-diagnostics-runbook/query-library/queries-and-mutations/#q18-recent-oom--exception-queries) | Recent OOM patterns — same query? Same user? Same time? |
| 4 | [Q8](/altinity-kb-diagnostics-runbook/query-library/parts-and-merges/#q8-active-merges) | Active merges — large merges hold memory too. |
| 5 | [Q6](/altinity-kb-diagnostics-runbook/query-library/parts-and-merges/#q6-parts-health-per-host) | High parts count → metadata overhead in RAM. |
| 6 | [Q16](/altinity-kb-diagnostics-runbook/query-library/queries-and-mutations/#q16-query-load-per-host-last-30-minutes) | Too many concurrent queries? |
| 7 | [Q14](/altinity-kb-diagnostics-runbook/query-library/pools-and-resources/#q14-pool-sizes-server-settings) + [Q13](/altinity-kb-diagnostics-runbook/query-library/pools-and-resources/#q13-pool-saturation-metrics) | Background pools consuming memory unnecessarily? |

### Common root causes

- Cluster genuinely undersized for the workload.
- Query without `max_memory_usage` doing a large `GROUP BY` without an
  `max_bytes_before_external_group_by` spill threshold.
- Many parts → metadata pressure.
- Concurrent large merges of wide parts.
- Async insert buffers oversized.

See [Who ate my memory?](/altinity-kb-setup-and-maintenance/altinity-kb-who-ate-my-memory/)
for per-subsystem RAM attribution.

## Disk full / NOT_ENOUGH_SPACE

### Symptoms

- Merges failing with "Not enough space" in `last_exception`.
- Insert errors.
- One disk in the storage policy full.

### Diagnostic flow

| Step | Query | What to look for |
|---|---|---|
| 1 | [Q11](/altinity-kb-diagnostics-runbook/query-library/disk-and-storage/#q11-disk-usage-per-host) ⭐ | Disk usage — which disk on which host. |
| 2 | [Q6](/altinity-kb-diagnostics-runbook/query-library/parts-and-merges/#q6-parts-health-per-host) | Largest tables by size — cleanup candidates. |
| 3 | [Q12](/altinity-kb-diagnostics-runbook/query-library/disk-and-storage/#q12-ttl-move--mutation-activity) | TTL move activity — are parts moving to cold tier? |
| 4 | [Q19](/altinity-kb-diagnostics-runbook/query-library/queries-and-mutations/#q19-stuck-mutations) | Stuck mutations adding to disk usage (mutations rewrite parts). |
| 5 | [Q1](/altinity-kb-diagnostics-runbook/query-library/replication-and-queue/#q1-replication-queue-overview) | Queue entries with disk-related exceptions. |

### Common root causes

- TTL move not configured, or the cold-tier disk policy failing (S3
  credentials, network).
- Backup volumes filling local disk.
- Detached parts not cleaned up.
- A single huge partition.

## Cluster-wide memory pressure as an aggravator

### Symptoms

- No single host is OOM, but every host shows `CGroupMemoryUsed > 90%` of
  `CGroupMemoryTotal`.
- Slow inserts, slow merges, page-cache thrashing — and the failures move
  around the cluster rather than concentrating on one host.

### Diagnostic flow

| Step | Query | What to look for |
|---|---|---|
| 1 | [Q54](/altinity-kb-diagnostics-runbook/query-library/pools-and-resources/#q54-memory-pressure-per-host-compact) ⭐ | Confirm pressure is cluster-wide, not concentrated. |
| 2 | [Q15](/altinity-kb-diagnostics-runbook/query-library/pools-and-resources/#q15-memory-pressure) | Full memory breakdown. |
| 3 | [Q9](/altinity-kb-diagnostics-runbook/query-library/parts-and-merges/#q9-part-creation-vs-merge-rate-last-30-minutes) | Whether merge throughput is degraded (a sign of pressure). |
| 4 | `system.asynchronous_metrics.MemoryCacheFiles` (if available) | Page-cache size proxy. |

### Resolution path

With sustained 95%+ utilisation, large MV processing or merge bursts will
stall under pressure. Workload-level tuning helps marginally; the real
fix is more RAM per node or reducing the workload (fewer MVs, smaller
batches, less concurrent work). Tighten `max_memory_usage` per query as a
guard.
