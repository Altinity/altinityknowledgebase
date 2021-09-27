---
title: "TTL Recompress example"
linkTitle: "TTL Recompress example"
description: >
    TTL Recompress example
---


## Example how to create a table and define recompression rules

```sql
CREATE TABLE hits
(
    `banner_id` UInt64,
    `event_time` DateTime CODEC(Delta, Default),
    `c_name` String,
    `c_cost` Float64
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(event_time)
ORDER BY (banner_id, event_time)
TTL event_time + toIntervalMonth(1) RECOMPRESS CODEC(ZSTD(1)),
    event_time + toIntervalMonth(6) RECOMPRESS CODEC(ZSTD(6);
```

Default comression is LZ4 [https://clickhouse.tech/docs/en/operations/server-configuration-parameters/settings/\#server-settings-compression](https://clickhouse.tech/docs/en/operations/server-configuration-parameters/settings/#server-settings-compression)

These TTL rules recompress data after 1 and 6 months.

CODEC(Delta, Default) -- **Default** means to use default compression (LZ4 -> ZSTD1 -> ZSTD6) in this case.

## Example how to define recompression rules for an existing table 

```sql
CREATE TABLE hits
(
    `banner_id` UInt64,
    `event_time` DateTime CODEC(Delta, LZ4),
    `c_name` String,
    `c_cost` Float64
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(event_time)
ORDER BY (banner_id, event_time);

ALTER TABLE hits 
  modify column event_time DateTime CODEC(Delta, Default),
  modify TTL event_time + toIntervalMonth(1) RECOMPRESS CODEC(ZSTD(1)),
       event_time + toIntervalMonth(6) RECOMPRESS CODEC(ZSTD(6));
```

All columns have implicite default compression from server config, except `event_time`, that's why need to change to compression to `Default` for this column otherwise it won't be recompressed.
