---
title: "Kafka consumer issues"
linkTitle: "Kafka consumer issues"
weight: 90
description: >
    Diagnosing Kafka consumer thread starvation and rebalance storms.
keywords:
  - clickhouse kafka
  - max.poll.interval.ms
  - kafka rebalance
  - background_message_broker_schedule_pool_size
---

## Symptoms

- `Maximum application poll interval (max.poll.interval.ms) exceeded`
  errors.
- Kafka consumers getting kicked and rejoining frequently.
- Drip-fire pattern: 1–10 kicks per minute, sustained.

## Diagnostic flow

| Step | Query | What to look for |
|---|---|---|
| 1 | [Q44](/altinity-kb-diagnostics-runbook/query-library/dictionaries-and-kafka/#q44-kafka-consumer-count-vs-pool-size) ⭐ | `consumers > mb_pool_size` confirms starvation. |
| 2 | [Q45](/altinity-kb-diagnostics-runbook/query-library/dictionaries-and-kafka/#q45-kafka-consumer-error-inspection) | Per-consumer error inspection. |
| 3 | [Q13](/altinity-kb-diagnostics-runbook/query-library/pools-and-resources/#q13-pool-saturation-metrics) | Is `BackgroundMessageBrokerSchedulePoolTask` pinned at pool size? |

## Resolution

Raise `background_message_broker_schedule_pool_size` to at least
`consumers * 1.25`. Requires a server restart — the setting is
server-level, not user-level.

If the consumer count itself is excessive, also review whether
`kafka_num_consumers` per table is over-provisioned. Each
`Kafka` table contributes consumers based on this setting; multiplying
across many tables explodes the total quickly.

Related setup guidance:

- [background_message_broker_schedule_pool_size](/altinity-kb-integrations/altinity-kb-kafka/04-operations-troubleshooting/background_message_broker_schedule_pool_size/)
- [Kafka parallel consuming](/altinity-kb-integrations/altinity-kb-kafka/02-consumption-patterns/altinity-kb-kafka-parallel-consuming/)
