---
title: "General cluster triage"
linkTitle: "General triage"
weight: 10
description: >
    The four-query first look when you don't yet know what's wrong.
keywords:
  - clickhouse triage
  - clickhouse health check
---

When the only information you have is "something is wrong", four queries
in order give you 80% of the cluster's state in about ten seconds. Use
this when you can't yet pick a more specific scenario.

## Diagnostic flow

| Step | Query | Purpose |
|---|---|---|
| 1 | [Q5](/altinity-kb-diagnostics-runbook/query-library/replication-and-queue/#q5-replication-summary-per-host) | One row per host — readonly tables, lag, queue depth. |
| 2 | [Q11](/altinity-kb-diagnostics-runbook/query-library/disk-and-storage/#q11-disk-usage-per-host) | Per-disk free space across the cluster. |
| 3 | [Q15](/altinity-kb-diagnostics-runbook/query-library/pools-and-resources/#q15-memory-pressure) | Memory headroom (process, jemalloc, cgroup, OS) everywhere. |
| 4 | [Q17](/altinity-kb-diagnostics-runbook/query-library/queries-and-mutations/#q17-active-queries-right-now) | Active queries right now — what's running and how heavy. |
| 5 | [Q18](/altinity-kb-diagnostics-runbook/query-library/queries-and-mutations/#q18-recent-oom--exception-queries) | Recent exceptions across the last 4 hours. |
| 6 | [Q6](/altinity-kb-diagnostics-runbook/query-library/parts-and-merges/#q6-parts-health-per-host) | Parts count overview. |
| 7 | [Q13](/altinity-kb-diagnostics-runbook/query-library/pools-and-resources/#q13-pool-saturation-metrics) | Background pool saturation. |

After these, branch into a specific scenario based on what surfaced:

- Readonly tables in Q5 → [Replica readonly](/altinity-kb-diagnostics-runbook/scenarios/replica-readonly/).
- High lag or queue in Q5 → [Merge–fetch and pool issues](/altinity-kb-diagnostics-runbook/scenarios/merge-fetch-and-pool-issues/).
- Disk near full in Q11 → [Memory and disk pressure](/altinity-kb-diagnostics-runbook/scenarios/memory-and-disk-pressure/).
- Memory pressure in Q15 → [Memory and disk pressure](/altinity-kb-diagnostics-runbook/scenarios/memory-and-disk-pressure/).
- Long-running queries in Q17 → [Slow queries](/altinity-kb-diagnostics-runbook/scenarios/slow-queries/).
- `TOO_MANY_PARTS` in Q18 → [Too many parts and backpressure](/altinity-kb-diagnostics-runbook/scenarios/too-many-parts-and-backpressure/).
- Async insert timeouts in Q18 → [Async insert issues](/altinity-kb-diagnostics-runbook/scenarios/async-insert-issues/).
- Pool counters pinned in Q13 → [Merge–fetch and pool issues](/altinity-kb-diagnostics-runbook/scenarios/merge-fetch-and-pool-issues/).
