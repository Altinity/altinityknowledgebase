---
title: "JSONExtract to parse many attributes at a time"
linkTitle: "JSONExtract to parse many attributes at a time"
description: >
    JSONExtract to parse many attributes at a time
---
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
