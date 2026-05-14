---
title: "Slow queries / high query load"
linkTitle: "Slow queries"
weight: 80
description: >
    Diagnosing query timeouts and dashboard latency complaints.
keywords:
  - clickhouse slow query
  - dashboard timeout
  - query load
---

## Symptoms

- Query timeouts reported by clients.
- Dashboards slow.

## Diagnostic flow

| Step | Query | What to look for |
|---|---|---|
| 1 | [Q17](/altinity-kb-diagnostics-runbook/query-library/queries-and-mutations/#q17-active-queries-right-now) | What's running right now — how long, how much memory. |
| 2 | [Q16](/altinity-kb-diagnostics-runbook/query-library/queries-and-mutations/#q16-query-load-per-host-last-30-minutes) | Query mix in the last 30 minutes — error rate and average duration by `query_kind`. |
| 3 | [Q18](/altinity-kb-diagnostics-runbook/query-library/queries-and-mutations/#q18-recent-oom--exception-queries) | Recent exceptions. |
| 4 | [Q4](/altinity-kb-diagnostics-runbook/query-library/replication-and-queue/#q4-replica-status--lag-and-readonly-per-host) | Are reads hitting a lagging or readonly replica? |
| 5 | [Q13](/altinity-kb-diagnostics-runbook/query-library/pools-and-resources/#q13-pool-saturation-metrics) | Background pool stealing CPU/IO from queries? |
| 6 | [Q15](/altinity-kb-diagnostics-runbook/query-library/pools-and-resources/#q15-memory-pressure) | Memory pressure forcing spill or kills? |
| 7 | [Q6](/altinity-kb-diagnostics-runbook/query-library/parts-and-merges/#q6-parts-health-per-host) | Are scanned tables fragmented (many small parts)? |

For deeper per-query investigation, see
[Who ate my CPU?](/altinity-kb-setup-and-maintenance/who-ate-my-cpu/) and
[Who ate my memory?](/altinity-kb-setup-and-maintenance/altinity-kb-who-ate-my-memory/).
