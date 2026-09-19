---
title: "Dictionaries and Kafka queries"
linkTitle: "Dictionaries and Kafka"
weight: 90
description: >
    Cluster-wide queries for dictionary health and Kafka consumer state.
keywords:
  - clickhouse dictionaries
  - clickhouse kafka
  - kafka consumers
  - max.poll.interval.ms
---

Queries for two related concerns: dictionary load state (often consumed by
MVs and therefore on the insert hot path) and Kafka consumer activity
(starvation manifests as `max.poll.interval.ms` violations). All queries
fan out across the cluster — replace `{cluster}` with your cluster name.

## Q43. Dictionary health check

First — only the dictionaries that are not loaded or have an exception:

```sql
SELECT
    name, status, last_exception,
    loading_duration AS load_sec,
    element_count,
    round(bytes_allocated / 1e6, 1) AS MB
FROM clusterAllReplicas('{cluster}', system.dictionaries)
WHERE status != 'LOADED' OR last_exception != ''
ORDER BY name;
```

Then — every dictionary, sorted by load time. A long-loading dictionary
on the insert hot path (e.g., used inside `dictGet` in an MV) is a common
source of unexpected MV slowness.

```sql
SELECT
    name, status, element_count,
    round(loading_duration, 2) AS load_sec,
    round(bytes_allocated / 1e6, 1) AS MB
FROM clusterAllReplicas('{cluster}', system.dictionaries)
ORDER BY load_sec DESC
LIMIT 30;
```

## Q44. Kafka consumer count vs pool size ⭐

Compares the number of Kafka consumers to the configured message-broker
pool size and the current pool activity. The first query for
"`max.poll.interval.ms` exceeded" errors and Kafka consumer rebalance
storms.

```sql
SELECT
    hostName() AS host,
    (SELECT count() FROM system.kafka_consumers) AS consumers,
    (SELECT value FROM system.server_settings
        WHERE name = 'background_message_broker_schedule_pool_size') AS mb_pool_size,
    (SELECT value FROM system.metrics
        WHERE metric = 'BackgroundMessageBrokerSchedulePoolTask') AS mb_pool_active;
```

Rule of thumb: if `consumers > mb_pool_size`, poll-interval violations are
all but guaranteed. Aim for `mb_pool_size >= consumers * 1.25`.

## Q45. Kafka consumer error inspection

Per-consumer last exception, last poll time, message count, and rebalance
counters. After Q44 confirms starvation, this tells you which consumers
are hitting it.

```sql
SELECT
    hostName() AS host,
    database, table,
    consumer_id,
    last_exception,
    num_messages_read,
    last_poll_time,
    num_rebalance_revocations,
    num_rebalance_assignments
FROM clusterAllReplicas('{cluster}', system.kafka_consumers)
WHERE last_exception != ''
ORDER BY last_poll_time DESC
LIMIT 30;
```
