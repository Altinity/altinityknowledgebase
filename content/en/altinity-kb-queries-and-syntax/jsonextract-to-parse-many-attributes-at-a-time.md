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
with $${
   "timestamp": "2024-06-12T14:30:00.001Z",
   "functionality": "DOCUMENT",
   "flowId": "210abdee-6de5-474a-83da-748def0facc1",
   "step": "BEGIN",
   "env": "dev",
   "successful": true,
   "data": {
       "action": "initiate_view",
       "client_ip": "192.168.1.100"
   }
}$$ as json, 
  JSONExtractKeysAndValues(json,'String') as m,
  mapFromArrays(m.1, m.2) as p
select extractKeyValuePairs(p['data'])['action'] as data ,
  p['successful']='true' as successful
format Vertical
```

