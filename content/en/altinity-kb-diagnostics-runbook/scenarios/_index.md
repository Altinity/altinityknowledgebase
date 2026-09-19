---
title: "Scenarios"
linkTitle: "Scenarios"
weight: 40
description: >
    Step-by-step diagnostic flows for common ClickHouse® failure modes.
keywords:
  - clickhouse troubleshooting
  - diagnostic playbook
  - ClickHouse scenarios
---

Each scenario lists triggering symptoms, an ordered diagnostic flow
(queries to run, in order, with "what to look for"), common root causes,
and resolution paths. Queries are referenced by their numeric ID — follow
the link to the
[query library](/altinity-kb-diagnostics-runbook/query-library/) for the
full SQL.

| Scenario | When to use |
|---|---|
| [General triage](/altinity-kb-diagnostics-runbook/scenarios/general-triage/) | "Something is wrong" — no specific symptom yet. Start here. |
| [Merge–fetch and pool issues](/altinity-kb-diagnostics-runbook/scenarios/merge-fetch-and-pool-issues/) | Queue not draining, pool counters pinned, replicated_fetches near-empty. |
| [Too many parts and backpressure](/altinity-kb-diagnostics-runbook/scenarios/too-many-parts-and-backpressure/) | `TOO_MANY_PARTS`, "Delaying inserts by N ms", cascading insert slowdown. |
| [Replica readonly](/altinity-kb-diagnostics-runbook/scenarios/replica-readonly/) | One or more replicas in readonly mode, growing `absolute_delay`. |
| [Memory and disk pressure](/altinity-kb-diagnostics-runbook/scenarios/memory-and-disk-pressure/) | OOM, `MEMORY_LIMIT_EXCEEDED`, `NOT_ENOUGH_SPACE`, cluster-wide pressure. |
| [Stuck mutations](/altinity-kb-diagnostics-runbook/scenarios/stuck-mutations/) | `ALTER UPDATE/DELETE` not completing. |
| [Async insert issues](/altinity-kb-diagnostics-runbook/scenarios/async-insert-issues/) | Flush errors, MV chain timeouts, stuck async insert queue. |
| [Slow queries](/altinity-kb-diagnostics-runbook/scenarios/slow-queries/) | Dashboard timeouts, query latency complaints. |
| [Kafka consumer issues](/altinity-kb-diagnostics-runbook/scenarios/kafka-consumer-issues/) | `max.poll.interval.ms` violations, consumer rebalance storms. |
| [Frozen historical tables](/altinity-kb-diagnostics-runbook/scenarios/frozen-historical-tables/) | Old tables adding permanent background load. |
| [Host-skewed failures](/altinity-kb-diagnostics-runbook/scenarios/host-skewed-failures/) | Failures concentrate on a subset of hosts; settings and workload look identical. |
