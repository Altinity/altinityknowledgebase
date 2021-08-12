---
title: "Error handling"
linkTitle: "Error handling"
description: >
    Error handling
---
## Pre 21.6

There are couple options:

Certain formats which has schema in built in them (like JSONEachRow) could silently skip any unexpected fields after enabling setting `input_format_skip_unknown_fields`

It's also possible to skip up to N malformed messages for each block, with used setting `kafka_skip_broken_messages` but it's also does not support all possible formats.

## After 21.6

It's possible to stream messages which could not be parsed, this behavior could be enabled via setting: `kafka_handle_error_mode='stream'` and clickhouse wil write error and message from Kafka itself to two new virtual columns: `_error, _raw_message`.

So you can create another Materialized View which would collect to a separate table all errors happening while parsing with all important information like offset and content of message.

```sql
CREATE TABLE default.kafka_engine
(
    `i` Int64,
    `s` String
)
ENGINE = Kafka
SETTINGS kafka_broker_list = 'kafka:9092'
kafka_topic_list = 'topic',
kafka_group_name = 'clickhouse',
kafka_format = 'JSONEachRow',
kafka_handle_error_mode='stream';

CREATE MATERIALIZED VIEW default.kafka_errors
(
    `topic` String,
    `partition` Int64,
    `offset` Int64,
    `raw` String,
    `error` String
)
ENGINE = MergeTree
ORDER BY (topic, partition, offset)
SETTINGS index_granularity = 8192 AS
SELECT
    _topic AS topic,
    _partition AS partition,
    _offset AS offset,
    _raw_message AS raw,
    _error AS error
FROM default.kafka_engine
WHERE length(_error) > 0
```

![Table connections](/assets/Untitled-2021-08-05-1027.png)

[https://github.com/ClickHouse/ClickHouse/pull/20249\#issuecomment-779054737](https://github.com/ClickHouse/ClickHouse/pull/20249\#issuecomment-779054737)

[https://github.com/ClickHouse/ClickHouse/pull/21850](https://github.com/ClickHouse/ClickHouse/pull/21850)

[https://altinity.com/blog/clickhouse-kafka-engine-faq](https://altinity.com/blog/clickhouse-kafka-engine-faq)
