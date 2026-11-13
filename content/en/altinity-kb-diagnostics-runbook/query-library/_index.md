---
title: "Query library"
linkTitle: "Query library"
weight: 30
description: >
    Reference catalogue of cluster-wide diagnostic queries, grouped by subsystem.
keywords:
  - clickhouse system tables
  - clickhouse diagnostics
  - clusterAllReplicas
---

54 cluster-wide queries grouped by the subsystem they probe. Every query
fans out via `clusterAllReplicas('{cluster}', system.<table>)`. Replace
`{cluster}` / `{database}` / `{table}` / `{mv_name}` /
`{target_table_pattern}` with values from your environment before running.

Queries are referenced from the
[scenarios](/altinity-kb-diagnostics-runbook/scenarios/) by their numeric
IDs (`Q1`, `Q2`, …). Numbering is stable across the runbook so you can copy
shortcuts between teammates.

| Page | Queries | Purpose |
|---|---|---|
| [Replication and queue](/altinity-kb-diagnostics-runbook/query-library/replication-and-queue/) | Q1–Q5, Q31, Q32 | Replication queue depth, postpone reasons, replica lag, fetches in flight |
| [Parts and merges](/altinity-kb-diagnostics-runbook/query-library/parts-and-merges/) | Q6–Q10, Q42 | Parts per host/partition, active merges, merge throughput |
| [Disk and storage](/altinity-kb-diagnostics-runbook/query-library/disk-and-storage/) | Q11, Q12 | Per-disk free space, TTL move activity |
| [Pools and resources](/altinity-kb-diagnostics-runbook/query-library/pools-and-resources/) | Q13–Q15, Q54 | Background pool saturation, memory pressure, cgroup limits |
| [Queries and mutations](/altinity-kb-diagnostics-runbook/query-library/queries-and-mutations/) | Q16–Q19 | Recent query load, active queries, OOM/exception queries, stuck mutations |
| [Async inserts](/altinity-kb-diagnostics-runbook/query-library/async-inserts/) | Q20–Q28, Q38 | Flush errors, latency, MV chain inspection, timeout patterns |
| [Keeper and coordination](/altinity-kb-diagnostics-runbook/query-library/keeper-and-coordination/) | Q29, Q30, Q33, Q49–Q51 | Connection state, exception patterns, wait-time percentiles, topology, leader distribution |
| [Insert load and host skew](/altinity-kb-diagnostics-runbook/query-library/insert-load-and-host-skew/) | Q34–Q37, Q40, Q41, Q46–Q48, Q52, Q53 | Insert rate/volume, per-host duration, routing settings, failure rate |
| [Dictionaries and Kafka](/altinity-kb-diagnostics-runbook/query-library/dictionaries-and-kafka/) | Q43–Q45 | Dictionary health, Kafka consumer vs pool size, consumer errors |

## A note on version drift

Several system tables changed schema between ClickHouse releases — column
names on `replicated_fetches`, the view columns on `query_log`, and the
existence of `zookeeper_log`. Each query page calls out the columns to
check first when a query errors out on a specific cluster.
