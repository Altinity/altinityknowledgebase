---
title: "Example of PostgreSQL dictionary"
linkTitle: "Example of PostgreSQL dictionary"
description: >
    Example of PostgreSQL dictionary
---

```sql
CREATE DICTIONARY postgres_dict
(
    id UInt32,
    value String
)
PRIMARY KEY id
SOURCE(
    POSTGRESQL(
        port 5432
        host 'postgres1'
        user  'postgres'
        password 'mysecretpassword'
        db 'clickhouse'
        table 'test_schema.test_table'
    )
)
LIFETIME(MIN 300 MAX 600)
LAYOUT(HASHED());
```

and later do

```sql
SELECT dictGetString(postgres_dict, 'value', toUInt64(1))
```
