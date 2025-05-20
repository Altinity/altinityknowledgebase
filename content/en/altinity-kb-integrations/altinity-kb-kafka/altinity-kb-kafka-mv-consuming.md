---
title: "Multiple MVs attached to Kafka table"
linkTitle: "Multiple MVs attached to Kafka table"
description: >
    How Multiple MVs attached to Kafka table consume and how they are affected by kafka_num_consumers/kafka_thread_per_consumer
---



So the basic pipeline depicted is a Kafka table with 2 MVs attached. The Kafka broker has 2 topics and 4 partitions. 

### kafka_thread_per_consumer = 0

Kafka engine table will act as 2 consumers but only 1 thread for both consumers. For this scenario we use these settings:

```
kafka_num_consumers = 2
kafka_thread_per_consumer = 0
```

The same Kafka engine will create 2 streams, 1 for each consumer and will join them in a union stream. And it will use 1 thread `[ 2385 ]`
This is how we can see it in the logs:

```log
2022.11.09 17:49:34.282077 [ 2385 ] {} <Debug> StorageKafka (kafka_table): Started streaming to 2 attached views
```

* How ClickHouse® calculates the number of threads depending on the `thread_per_consumer` setting:

  ```c++
    auto stream_count = thread_per_consumer ? 1 : num_created_consumers;
        sources.reserve(stream_count);
        pipes.reserve(stream_count);
        for (size_t i = 0; i < stream_count; ++i)
        {
           ......
        }
  ```

Details:

https://github.com/ClickHouse/ClickHouse/blob/1b49463bd297ade7472abffbc931c4bb9bf213d0/src/Storages/Kafka/StorageKafka.cpp#L834


Also a detailed graph of the pipeline:

![thread_per_consumer0](/assets/thread_per_consumer0.png)

With this approach if the number of consumers are increased, still Kafka engine will use only 1 thread to flush. The consuming/processing rate will probably be increased but not linearly, for example 5 consumers will not consume 5 times faster. Also a good property of this approach is the `linearization` of INSERTS, which means that the order of the inserts is preserved and it is sequential. This option is good for small/medium kafka topics.


### kafka_thread_per_consumer = 1

Kafka engine table will act as 2 consumers and 1 thread per consumers For this scenario we use these settings:

```
kafka_num_consumers = 2
kafka_thread_per_consumer = 1
```

Here the pipeline works like this:

![thread_per_consumer1](/assets/thread_per_consumer1.png)


With this approach, the number of consumers is increased and each consumer will use a thread and so the consuming/processing rate. In this scenario, it is important to remark that the topic needs to have as many partitions as consumers (threads) to achieve the maximum performance. Also if the number of consumers(threads) needs to be raised to more than 16 you need to change the background pool of threads setting `background_message_broker_schedule_pool_size` to a higher value than 16 (which is the default). This option is good for large Kafka topics with millions of messages per second.


The same technique of attaching multiple Materialized Views (MVs) to a Kafka Engine table can be used when you need to apply different transformations to the same topic and store the resulting data in different tables.

This approach also applies to the other streaming engines (RabbitMQ, s3queue, etc).

All streaming engines begin processing data (reading from the source and producing insert blocks) only after at least one Materialized View is attached to the engine. Multiple Materialized Views can be connected to distribute data across various tables with different transformations. But how does it work when the server starts?

Once the first Materialized View (MV) is loaded, started, and attached to the Kafka/s3queue table, data consumption begins immediately—data is read from the source, pushed to the destination, and the pointers advance to the next position. However, any other MVs that haven't started yet will miss the data consumed by the first MV, leading to some data loss.

This issue worsens with asynchronous table loading. Tables are only loaded upon first access, and the loading process takes time. When multiple MVs direct the data stream to different tables, some tables might be ready sooner than others. As soon as the first table becomes ready, data consumption starts, and any tables still loading will miss the data consumed during that interval, resulting in further data loss for those tables.


That means when you make a design with Multiple MVs async_load_databases should be switched off:

```sql
<async_load_databases>false</async_load_databases>
```

Also, you have to prevent starting to consume until all MVs are loaded and started.  For that, you can add an additional Null table to the MV pipeline, so the Kafka table will pass the block to a single Null table first, and only then many MVs start their own transformations to many dest tables:

 KafkaTable → dummy_MV -> NullTable  -> [MV1, MV2, ….] → [Table1, Table2, …]

```sql
create table NullTable Engine=Null as KafkaTable;
create materialized view dummy_MV to NullTable
select * from KafkaTable
--WHERE NOT ignore(throwIf(if((uptime() < 120), 1 , 0)))
WHERE NOT ignore(throwIf(if((uptime() < 120), 1 + sleep(3), 0)))
```

120 seconds should be enough for loading all MVs.

Using an intermediate Null table is also preferable because it's easier to make any changes with MVs:

- drop the dummy_MV to stop consuming
- make any changes to transforming MVs by drop/recreate
- create dummy_MV again to resume consuming

The fix for correctly starting multiple MVs will be available  in 25.5 version
