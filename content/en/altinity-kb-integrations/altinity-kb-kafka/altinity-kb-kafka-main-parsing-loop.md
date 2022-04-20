---
title: "Kafka main parsing loop"
linkTitle: "Kafka main parsing loop"
description: >
    Kafka main parsing loop
---
One of the threads from scheduled_pool (pre 20.9) / `background_message_broker_schedule_pool` (after 20.9) do that in infinite loop:

1. Batch poll (time limit: `kafka_poll_timeout_ms` 500ms, messages limit: `kafka_poll_max_batch_size` 65536)
2. Parse messages.
3. If we don't have enough data (rows limit: `kafka_max_block_size` 1048576) or time limit reached (`kafka_flush_interval_ms` 7500ms) - continue polling (goto p.1)
4. Write a collected block of data to MV
5. Do commit (commit after write = at-least-once).

On any error, during that process, Kafka client is restarted (leading to rebalancing - leave the group and get back in few seconds).

![Kafka batching](/assets/128942286.png)

## Important settings

These usually should not be adjusted:

* `kafka_poll_max_batch_size` = max_block_size (65536)
* `kafka_poll_timeout_ms` = stream_poll_timeout_ms (500ms)

You may want to adjust those depending on your scenario:

* `kafka_flush_interval_ms` = stream_poll_timeout_ms (7500ms)
* `kafka_max_block_size` = max_insert_block_size / kafka_num_consumers (for the single consumer: 1048576)

## See also

[https://github.com/ClickHouse/ClickHouse/pull/11388](https://github.com/ClickHouse/ClickHouse/pull/11388)
