---
title: "Object consistency in a cluster"
linkTitle: "Object consistency in a cluster"
description: >
    Object consistency in a cluster
---
List of missing tables

```sql
WITH (
     SELECT groupArray(FQDN()) FROM clusterAllReplicas('{cluster}',system,one)
     ) AS hosts
SELECT database,
       table,
       arrayFilter( i-> NOT has(groupArray(host),i), hosts) miss_table
FROM (
        SELECT FQDN() host, database, name table
        FROM clusterAllReplicas('{cluster}',system,tables)
        WHERE engine NOT IN ('Log','Memory','TinyLog')
     )
GROUP BY database, table
HAVING miss_table <> []
SETTINGS skip_unavailable_shards=1;

┌─database─┬─table─┬─miss_table────────────────┐
│ default  │ test  │ ['host366.mynetwork.net'] │
└──────────┴───────┴───────────────────────────┘
```

List of inconsistent tables

```sql
SELECT database, name, engine, uniqExact(create_table_query) AS ddl
FROM clusterAllReplicas('{cluster}',system.tables)
GROUP BY database, name, engine HAVING ddl > 1
```

List of inconsistent columns

```sql
WITH (
     SELECT groupArray(FQDN()) FROM clusterAllReplicas('{cluster}',system,one)
     ) AS hosts
SELECT database,
       table,
       column,
       arrayStringConcat(arrayMap( i -> i.2 ||': '|| i.1,
                                 (groupArray( (type,host) ) AS g)),', ') diff
FROM (
        SELECT FQDN() host, database, table, name column, type
        FROM clusterAllReplicas('{cluster}',system,columns)
     )
GROUP BY database, table, column
HAVING length(arrayDistinct(g.1)) > 1 OR length(g.1) <> length(hosts)
SETTINGS skip_unavailable_shards=1;

┌─database─┬─table───┬─column────┬─diff────────────────────────────────┐
│ default  │ z       │ A         │ ch-host22: Int64, ch-host21: String │
└──────────┴─────────┴───────────┴─────────────────────────────────────┘
```

List of inconsistent dictionaries

```sql
WITH (
     SELECT groupArray(FQDN()) FROM clusterAllReplicas('{cluster}',system,one)
     ) AS hosts
SELECT database,
       dictionary,
       arrayFilter( i-> NOT has(groupArray(host),i), hosts) miss_dict,
       arrayReduce('median', (groupArray((element_count, host)) AS ec).1 )
FROM (
        SELECT FQDN() host, database, name dictionary, element_count
        FROM clusterAllReplicas('{cluster}',system,dictionaries)
     )
GROUP BY database, dictionary
HAVING miss_dict <> []
SETTINGS skip_unavailable_shards=1;
```
