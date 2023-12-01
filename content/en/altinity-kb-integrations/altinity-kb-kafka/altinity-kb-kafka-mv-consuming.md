---
title: "Multiple MVs attached to Kafka table"
linkTitle: "Multiple MVs attached to Kafka table"
description: >
    How Multiple MVs attached to Kafka table consume and how they are affected by kafka_num_consumers/kafka_thread_per_consumer
---

So the basic pipeline is depicted in the schema. 

![basic pipeline](https://camo.githubusercontent.com/2c746ce7620b882e8ce7b186d3fc7fdddb853f85c53d7ef1eeac06dd382ace6c/687474703a2f2f64726976652e676f6f676c652e636f6d2f75633f6578706f72743d766965772669643d317a4c57496a4964636b6c6a3838476d716e424d464f4a70726d74336a58336f57)

As you created the Kafka Engine table there is only 1 partition so the kafka engine will act as a single consumer. Also we have:

```
kafka_num_consumers = 1 (default)
kafka_thread_per_consumer = 0 (default)
```

The same Kafka engine will create 2 streams, 1 for each MV attached:


```log
2022.11.09 17:49:34.282077 [ 2385 ] {} <Debug> StorageKafka (kafka_destination): Started streaming to 2 attached views
2022.11.09 17:49:34.282778 [ 73593 ] {} <Debug> StorageKafka (kafka_destination): [rdk:CGRPOP] [thrd:main]: Group "test-group-2022-11-08" received op GET_SUBSCRIPTION in state wait-broker-transport (join-state init)
2022.11.09 17:49:34.333031 [ 2385 ] {} <Warning> StorageKafka (kafka_destination): Can't get assignment. Will keep trying.
2022.11.09 17:49:34.333598 [ 73593 ] {} <Debug> StorageKafka (kafka_destination): [rdk:CGRPOP] [thrd:main]: Group "test-group-2022-11-08" received op GET_ASSIGNMENT in state wait-broker-transport (join-state init)
```

And it will use 1 thread `[ 2385 ]`

These streams are not threads so this is how it works:

* ClickHouse will create a INSERT AST for streaming the data.
* Create two streams and join them, so this means that there is only one thread, because 
  `kafka_thread_per_consumer = 0` and `kafka_num_consumers = 1`
* For 1 consumer, CH will create a thread like explained in this code:
  ```c++
    auto stream_count = thread_per_consumer ? 1 : num_created_consumers;
        sources.reserve(stream_count);
        pipes.reserve(stream_count);
        for (size_t i = 0; i < stream_count; ++i)
        {
            auto source = std::make_shared<KafkaSource>(*this, storage_snapshot, kafka_context, block_io.pipeline.getHeader().getNames(), log, block_size, false);
            sources.emplace_back(source);
            pipes.emplace_back(source);

            // Limit read batch to maximum block size to allow DDL
            StreamLocalLimits limits;

            Poco::Timespan max_execution_time = kafka_settings->kafka_flush_interval_ms.changed
                                          ? kafka_settings->kafka_flush_interval_ms
                                          : getContext()->getSettingsRef().stream_flush_interval_ms;

            source->setTimeLimit(max_execution_time);
        }
  ```

* Linearization of INSERTS: So both streams will get the same data after the kafka_flush and every MV will do it's logic with the same data, forming a block and inserting it into the destination table. 
* NEED TO CHECK (If you detach a MV and populate the topic/queue the `destination_mv` won't get any message and the same for errors_mv. This is because they share the same consumer that is multiplexed (joined streams) by the Kafka engine, and if any of the MVs attached still is alive will read and update the offset of the topic/partition for the consumer group)

https://github.com/ClickHouse/ClickHouse/blob/1b49463bd297ade7472abffbc931c4bb9bf213d0/src/Storages/Kafka/StorageKafka.cpp#L838
