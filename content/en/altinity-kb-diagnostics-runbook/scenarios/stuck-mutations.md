---
title: "Stuck mutations"
linkTitle: "Stuck mutations"
weight: 60
description: >
    Diagnosing `ALTER TABLE … UPDATE/DELETE` mutations that won't complete.
keywords:
  - clickhouse mutations
  - alter update
  - alter delete
  - is_done
---

## Symptoms

- `ALTER TABLE … UPDATE / DELETE` not completing.
- `system.mutations.is_done = 0` for hours.

## Diagnostic flow

| Step | Query | What to look for |
|---|---|---|
| 1 | [Q19](/altinity-kb-diagnostics-runbook/query-library/queries-and-mutations/#q19-stuck-mutations) ⭐ | All stuck mutations with `latest_fail_reason`. |
| 2 | [Q8](/altinity-kb-diagnostics-runbook/query-library/parts-and-merges/#q8-active-merges) | Active merges (mutations share the merge pool). |
| 3 | [Q13](/altinity-kb-diagnostics-runbook/query-library/pools-and-resources/#q13-pool-saturation-metrics) | Pool saturation — mutations queued behind merges. |
| 4 | [Q1](/altinity-kb-diagnostics-runbook/query-library/replication-and-queue/#q1-replication-queue-overview) | Queue entries — `MUTATE_PART` types. |
| 5 | [Q11](/altinity-kb-diagnostics-runbook/query-library/disk-and-storage/#q11-disk-usage-per-host) | Disk space (mutations rewrite parts → need ~2× space). |

## Common root causes

- Insufficient merge-pool slots.
- Mutation references a column that no longer exists (look at
  `latest_fail_reason` — the error is explicit).
- Disk space insufficient for the rewrite.
- Mutation blocked behind a merge of the same part.

## Resolution

- For pool-bound stalls, raising the merge pool size (Q14) restores
  progress; review whether the workload genuinely needs that much
  concurrent mutation.
- A mutation whose `latest_fail_reason` is a missing column is fatal —
  `KILL MUTATION WHERE …` is the only path forward.
- For disk-bound stalls, free space (see
  [Memory and disk pressure](/altinity-kb-diagnostics-runbook/scenarios/memory-and-disk-pressure/))
  before retrying.
