---
title: "JSONExtract to parse many attributes at a time"
linkTitle: "JSONExtract to parse many attributes at a time"
description: >
    JSONExtract to parse many attributes at a time
---

Don't use several JSONExtract for parsing big JSON. It's very ineffective, slow, and consumes CPU. Try to use one JSONExtract to parse String to Tupes and next get the needed elements:

```sql
WITH JSONExtract(json, 'Tuple(name String, id String, resources Nested(description String, format String, tracking_summary Tuple(total UInt32, recent UInt32)), extras Nested(key String, value String))') AS parsed_json
SELECT
    tupleElement(parsed_json, 'name') AS name,
    tupleElement(parsed_json, 'id') AS id,
    tupleElement(tupleElement(parsed_json, 'resources'), 'description') AS `resources.description`,
    tupleElement(tupleElement(parsed_json, 'resources'), 'format') AS `resources.format`,
    tupleElement(tupleElement(tupleElement(parsed_json, 'resources'), 'tracking_summary'), 'total') AS `resources.tracking_summary.total`,
    tupleElement(tupleElement(tupleElement(parsed_json, 'resources'), 'tracking_summary'), 'recent') AS `resources.tracking_summary.recent`
FROM url('https://raw.githubusercontent.com/jsonlines/guide/master/datagov100.json', 'JSONAsString', 'json String')
```
However, such parsing requires static schema - all keys should be presented in every row, or you will get an empty structure.  More dynamic parsing requires several JSONExtract invocations, but still - try not to scan the same data several times:

```sql
WITH
    '{"timestamp":"2024-06-12T14:30:00.001Z","functionality":"DOCUMENT","flowId":"210abdee-6de5-474a-83da-748def0facc1","step":"BEGIN","env":"dev","successful":true,"data":{"action":"initiate_view","stats":{"total":1,"success":1,"failed":0},"client_ip":"192.168.1.100","client_port":"8080"}}' AS json,
    JSONExtractKeysAndValues(json, 'String') AS m,
    mapFromArrays(m.1, m.2) AS p
SELECT
    extractKeyValuePairs(p['data'])['action'] AS data,
    (p['successful']) = 'true' AS successful
FORMAT Vertical

/*
Row 1:
──────
data:       initiate_view
successful: 1
*/

```

For very subnested dynamic JSON files, if you don't need all the keys, you could parse sublevels specifically. Still this will require several JSONExtract calls but each call will have less data to parse so complexity will be reduced for each pass: O(log n)

```sql
CREATE TABLE better_parsing (json String) ENGINE = Memory;
INSERT INTO better_parsing FORMAT JSONAsString {"timestamp":"2024-06-12T14:30:00.001Z","functionality":"DOCUMENT","flowId":"210abdee-6de5-474a-83da-748def0facc1","step":"BEGIN","env":"dev","successful":true,"data":{"action":"initiate_view","stats":{"total":1,"success":1,"failed":0},"client_ip":"192.168.1.100","client_port":"8080"}}

WITH parsed_content AS
    (
      SELECT 
        JSONExtractKeysAndValues(json, 'String') AS 1st_level_arr,
        mapFromArrays(1st_level_arr.1, 1st_level_arr.2) AS 1st_level_map,
        JSONExtractKeysAndValues(1st_level_map['data'], 'String') AS 2nd_level_arr,
        mapFromArrays(2nd_level_arr.1, 2nd_level_arr.2) AS 2nd_level_map,
        JSONExtractKeysAndValues(2nd_level_map['stats'], 'String') AS 3rd_level_arr,
        mapFromArrays(3rd_level_arr.1, 3rd_level_arr.2) AS 3rd_level_map
      FROM json_tests.better_parsing
    ) 
SELECT 
  1st_level_map['timestamp'] AS timestamp,
  2nd_level_map['action'] AS action,
  3rd_level_map['total'] AS total
  3rd_level_map['nokey'] AS no_key_empty
FROM parsed_content

/*
   ┌─timestamp────────────────┬─action────────┬─total─┬─no_key_empty─┐
1. │ 2024-06-12T14:30:00.001Z │ initiate_view │ 1     │              │
   └──────────────────────────┴───────────────┴───────┴──────────────┘

1 row in set. Elapsed: 0.003 sec.
*/
```
