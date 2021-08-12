---
title: "Partial updates"
linkTitle: "Partial updates"
description: >
    Partial updates
---
Clickhouse is able to fetch from a source only updated rows. You need to define `update_field` section.

As an example, We have a table in an external source MySQL, PG, HTTP, ... defined with the following code sample:

```sql
CREATE TABLE cities
(
    `polygon` Array(Tuple(Float64, Float64)),
    `city` String,
    `updated_at` DateTime DEFAULT now()
)
ENGINE = MergeTree ORDER BY city
```

When you add new row and `update` some rows in this table you should update `updated_at` with the new timestamp.

```sql
-- fetch updated rows every 30 seconds

CREATE DICTIONARY cities_dict (
    polygon Array(Tuple(Float64, Float64)),
    city String
)
PRIMARY KEY polygon
SOURCE(CLICKHOUSE( TABLE cities DB 'default'
                    update_field 'updated_at'))
LAYOUT(POLYGON())
LIFETIME(MIN 30 MAX 30)
```

A dictionary with **update_field** `updated_at` will fetch only updated rows. A dictionary saves the current time (now) time of the last successful update and queries the source `where updated_at >= previous_update - 1` (shift = 1 sec.).

In case of HTTP source Clickhouse will send get requests with **update_field** as an URL parameter `&updated_at=2020-01-01%2000:01:01`
