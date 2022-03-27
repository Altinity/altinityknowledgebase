---
title: "What are my TTL settings?"
linkTitle: "What are my TTL settings"
weight: 100
description: >-
     What are my TTL settings?
---

## Using `SHOW CREATE TABLE`

If you just want to see the current TTL settings on a table, you can look at the schema definition. 
```
SHOW CREATE TABLE events2_local
FORMAT Vertical

Query id: eba671e5-6b8c-4a81-a4d8-3e21e39fb76b

Row 1:
──────
statement: CREATE TABLE default.events2_local
(
    `EventDate` DateTime,
    `EventID` UInt32,
    `Value` String
)
ENGINE = ReplicatedMergeTree('/clickhouse/{cluster}/tables/{shard}/default/events2_local', '{replica}')
PARTITION BY toYYYYMM(EventDate)
ORDER BY (EventID, EventDate)
TTL EventDate + toIntervalMonth(1)
SETTINGS index_granularity = 8192
```
This works even when there's no data in the table. It does not tell you when the TTLs expire or anything specific to data in one or more of the table parts. 

## Using system.parts

If you want to see the actually TTL values for specific data, run a query on system.parts. 
There are columns listing all currently applicable TTL limits for each part. 
(It does not work if the table is empty because there aren't any parts yet.)
```
SELECT *
FROM system.parts
WHERE (database = 'default') AND (table = 'events2_local')
FORMAT Vertical

Query id: 59106476-210f-4397-b843-9920745b6200

Row 1:
──────
partition:                             202203
name:                                  202203_0_0_0
...
database:                              default
table:                                 events2_local
...
delete_ttl_info_min:                   2022-04-27 21:26:30
delete_ttl_info_max:                   2022-04-27 21:26:30
move_ttl_info.expression:              []
move_ttl_info.min:                     []
move_ttl_info.max:                     []
default_compression_codec:             LZ4
recompression_ttl_info.expression:     []
recompression_ttl_info.min:            []
recompression_ttl_info.max:            []
group_by_ttl_info.expression:          []
group_by_ttl_info.min:                 []
group_by_ttl_info.max:                 []
rows_where_ttl_info.expression:        []
rows_where_ttl_info.min:               []
rows_where_ttl_info.max:               []
```
