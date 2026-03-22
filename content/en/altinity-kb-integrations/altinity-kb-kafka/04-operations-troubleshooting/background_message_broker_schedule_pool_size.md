---
title: "Setting the background message broker schedule pool size"
linkTitle: "Setting the background message broker schedule pool size"
weight: 100
description: >-
    Guide to managing the `background_message_broker_schedule_pool_size` setting for Kafka, RabbitMQ, and NATS table engines in your database.
---

## Overview

When using Kafka, RabbitMQ, or NATS table engines in ClickHouse®, you may encounter issues related to a saturated background thread pool. One common symptom is a warning similar to the following:

```
2025.03.14 08:44:26.725868 [ 344 ] {} <Warning> StorageKafka (events_kafka): [rdk:MAXPOLL] [thrd:main]: Application maximum poll interval (60000ms) exceeded by 159ms (adjust max.poll.interval.ms for long-running message processing): leaving group
```

This warning typically appears **not because ClickHouse fails to poll**, but because **there are no available threads** in the background pool to handle the polling in time. In rare cases, the same error might also be caused by long flushing operations to Materialized Views (MVs), especially if their logic is complex or chained.

To resolve this, you should monitor and, if needed, increase the value of the `background_message_broker_schedule_pool_size` setting.

---

## Step 1: Check Thread Pool Utilization

Run the following SQL query to inspect the current status of your background message broker thread pool:

```sql
SELECT
    (
        SELECT value
        FROM system.metrics
        WHERE metric = 'BackgroundMessageBrokerSchedulePoolTask'
    ) AS tasks,
    (
        SELECT value
        FROM system.metrics
        WHERE metric = 'BackgroundMessageBrokerSchedulePoolSize'
    ) AS pool_size,
    pool_size - tasks AS free_threads
```

If you have `metric_log` enabled, you can also monitor the **minimum number of free threads over the day**:

```sql
SELECT min(CurrentMetric_BackgroundMessageBrokerSchedulePoolSize - CurrentMetric_BackgroundMessageBrokerSchedulePoolTask) AS min_free_threads
FROM system.metric_log
WHERE event_date = today()
```

**If `free_threads` is close to zero or negative**, it means your thread pool is saturated and should be increased.

---

## Step 2: Estimate Required Pool Size

To estimate a reasonable value for `background_message_broker_schedule_pool_size`, run the following query:

```sql
WITH
    toUInt32OrDefault(extract(engine_full, 'kafka_num_consumers\s*=\s*(\d+)')) as kafka_num_consumers,
    extract(engine_full, 'kafka_thread_per_consumer\s*=\s*(\d+|\'true\')') not in ('', '0') as kafka_thread_per_consumer,
    multiIf(
        engine = 'Kafka',  
            if(kafka_thread_per_consumer AND kafka_num_consumers > 0, kafka_num_consumers, 1),
        engine = 'RabbitMQ',
            3,
        engine = 'NATS',
            3,
        0 /* should not happen */
    ) as threads_needed
SELECT 
    ceil(sum(threads_needed) * 1.25)
FROM 
    system.tables
WHERE 
    engine in ('Kafka', 'RabbitMQ', 'NATS')
```

This will return an estimate that includes a 25% buffer to accommodate spikes in load.

---

## Step 3: Apply the New Setting

1. **Create or update** the following configuration file:

   **Path:** `/etc/clickhouse-server/config.d/background_message_broker_schedule_pool_size.xml`

   **Content:**
   ```xml
   <yandex>
       <background_message_broker_schedule_pool_size>120</background_message_broker_schedule_pool_size>
   </yandex>
   ```

   Replace `120` with the value recommended from Step 2 (rounded up if needed).

2. **(Only for ClickHouse versions 23.8 and older)**

   Add the same setting to the default user profile:

   **Path:** `/etc/clickhouse-server/users.d/background_message_broker_schedule_pool_size.xml`

   **Content:**
   ```xml
   <yandex>
       <profiles>
           <default>
               <background_message_broker_schedule_pool_size>120</background_message_broker_schedule_pool_size>
           </default>
       </profiles>
   </yandex>
   ```

---

## Step 4: Restart ClickHouse

After applying the configuration, restart ClickHouse to apply the changes:

```bash
sudo systemctl restart clickhouse-server
```

---

## Summary

A saturated background message broker thread pool can lead to missed Kafka polls and consumer group dropouts. Monitoring your metrics and adjusting `background_message_broker_schedule_pool_size` accordingly ensures stable operation of Kafka, RabbitMQ, and NATS integrations.

If the problem persists even after increasing the pool size, consider investigating slow MV chains or flushing logic as a potential bottleneck.
