---
title: "Setting the background message broker schedule pool size"
linkTitle: "Setting the background message broker schedule pool size"
weight: 100
description: >-
    Guide to managing the `background_message_broker_schedule_pool_size` setting for Kafka, RabbitMQ, and NATS table engines in your database.
---

## Setting the background message broker schedule pool size

When using Kafka, RabbitMQ, or NATS table engines, you might encounter issues caused by the oversaturation of the thread pool responsible for background jobs. Monitoring and adjusting the `background_message_broker_schedule_pool_size` setting can help alleviate these problems.

### Identifying Thread Pool Saturation

To check the status of your thread pool, run the following SQL query:

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

If you have `metric_log` enabled, you can use this query to monitor the minimum number of free threads available throughout the day:

```sql
SELECT min(CurrentMetric_BackgroundMessageBrokerSchedulePoolSize - CurrentMetric_BackgroundMessageBrokerSchedulePoolTask) AS min_free_threads
FROM system.metric_log
WHERE event_date = today()
```

### Interpreting Results

If the number of free threads is zero or very close to zero, you might experience issues with your Kafka, RabbitMQ, or NATS engines. In such cases, you should increase the `background_message_broker_schedule_pool_size` setting.

### Adjusting the Thread Pool Size

To fix the problem, increase the `background_message_broker_schedule_pool_size` setting in your `config.xml`. For older ClickHouse® versions, you may need to adjust this setting in both the default profile in `users.xml` and `config.xml`.

### Estimating the Required Pool Size

To estimate the appropriate value for `background_message_broker_schedule_pool_size`, use the following query:

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
;
```


This query helps you determine the necessary pool size based on the number of consumers and threads per consumer for Kafka, and a fixed number for RabbitMQ and NATS.

By following these guidelines, you can ensure your background message broker thread pool is appropriately sized, preventing performance issues and maintaining the efficiency of your Kafka, RabbitMQ, or NATS engines.

### Adjusting the Setting

Create the file `/etc/clickhouse-server/config.d/background_message_broker_schedule_pool_size.xml` with the following content (adjust the value as needed):

```xml
<yandex>
    <background_message_broker_schedule_pool_size>120</background_message_broker_schedule_pool_size>
</yandex>
```

Additionally, for ClickHouse versions **23.8 and earlier**, create the file `/etc/clickhouse-server/users.d/background_message_broker_schedule_pool_size.xml` with the following content:

```xml
<yandex>
    <profiles>
        <default>
            <background_message_broker_schedule_pool_size>120</background_message_broker_schedule_pool_size>
        </default>
    </profiles>
</yandex>
```
