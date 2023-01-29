---
title: "Security named collections"
linkTitle: "Security named collections"
description: >
    Security named collections
---


## Dictionary with Clickhouse table as a source with named collections

### Data for connecting to external sources can be stored in named collections

```xml
<clickhouse>
    <named_collections>
        <local_host>
            <host>localhost</host>
            <port>9000</port>
            <database>default</database>
            <user>ch_dict</user>
            <password>mypass</password>
        </local_host>
    </named_collections>
</clickhouse>
```

### Dictionary

```sql
DROP DICTIONARY IF EXISTS named_coll_dict;
CREATE DICTIONARY named_coll_dict
(
    key UInt64,
    val String
)
PRIMARY KEY key
SOURCE(CLICKHOUSE(NAME local_host TABLE my_table DB default))
LIFETIME(MIN 1 MAX 2)
LAYOUT(HASHED());

INSERT INTO my_table(key, val) VALUES(1, 'first row');

SELECT dictGet('named_coll_dict', 'b', 1);
┌─dictGet('named_coll_dict', 'b', 1)─┐
│ first row                          │
└────────────────────────────────────┘
```
