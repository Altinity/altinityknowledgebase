---
title: "Rewind / fast-forward / replay"
linkTitle: "Rewind / fast-forward / replay"
description: >
    Rewind / fast-forward / replay
---
* Step 1: Detach Kafka tables in ClickHouse
* Step 2: `kafka-consumer-groups.sh --bootstrap-server kafka:9092 --topic topic:0,1,2 --group id1 --reset-offsets --to-latest --execute`
  * More samples: [https://gist.github.com/filimonov/1646259d18b911d7a1e8745d6411c0cc](https://gist.github.com/filimonov/1646259d18b911d7a1e8745d6411c0cc)
* Step: Attach Kafka tables back

See also these configuration settings:

```markup
<kafka>
  <auto_offset_reset>smallest</auto_offset_reset>
</kafka>
```
### About Offset Consuming

When a consumer joins the consumer group, the broker will check if it has a commited offset. If that is the case, then it will start from the latest offset. Both ClickHouse and librdKafka documentation state that the default value for `auto_offset_reset` is largest (or `latest` in new Kafka versions) but it is not, if the consumer is new:

https://github.com/ClickHouse/ClickHouse/blob/f171ad93bcb903e636c9f38812b6aaf0ab045b04/src/Storages/Kafka/StorageKafka.cpp#L506

  `conf.set("auto.offset.reset", "earliest");     // If no offset stored for this group, read all messages from the start`

If there is no offset stored or it is out of range, for that particular consumer group, the consumer will start consuming from the beginning (`earliest`), and if there is some offset stored then it should use the `latest`. 
The log retention policy influences which offset values correspond to the `earliest` and `latest` configurations. Consider a scenario where a topic has a retention policy set to 1 hour. Initially, you produce 5 messages, and then, after an hour, you publish 5 more messages. In this case, the latest offset will remain unchanged from the previous example. However, due to Kafka removing the earlier messages, the earliest available offset will not be 0; instead, it will be 5.
