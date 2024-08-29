---
title: "RabbitMQ"
linkTitle: "RabbitMQ"
description: >
    RabbitMQ engine -> 24.3+
---

### Settings

Basic RAbbitMQ settings and use cases: https://clickhouse.com/docs/en/engines/table-engines/integrations/rabbitmq

### Latest improvements/fixes

#### (v23.10+)

- **Allow to save unparsed records and errors in RabbitMQ**:
NATS and FileLog engines. Add virtual columns `_error` and `_raw_message` (for NATS and RabbitMQ), `_raw_record` (for FileLog) that are filled when ClickHouse fails to parse new record.
The behaviour is controlled under storage settings `nats_handle_error_mode` for NATS, `rabbitmq_handle_error_mode` for RabbitMQ, `handle_error_mode` for FileLog similar to `kafka_handle_error_mode`.
If it's set to `default`, en exception will be thrown when ClickHouse fails to parse a record, if it's set to `stream`, error and raw record will be saved into virtual columns.
Closes [#36035](https://github.com/ClickHouse/ClickHouse/issues/36035) and [#55477](https://github.com/ClickHouse/ClickHouse/pull/55477)


#### (v24+)

- [**#45350 RabbitMq Storage Engine should NACK messages if exception is thrown during processing**](https://github.com/ClickHouse/ClickHouse/issues/45350)
- [**#59775 rabbitmq: fix having neither acked nor nacked messages**](https://github.com/ClickHouse/ClickHouse/pull/59775)
- [**#60312 Make rabbitmq nack broken messages**](https://github.com/ClickHouse/ClickHouse/pull/60312)
- [**#61320 Fix logical error in RabbitMQ storage with MATERIALIZED columns**](https://github.com/ClickHouse/ClickHouse/pull/61320)
