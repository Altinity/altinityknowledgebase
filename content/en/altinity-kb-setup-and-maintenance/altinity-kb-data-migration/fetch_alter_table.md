---
title: "Fetch Alter Table"
linkTitle: "Fetch Alter Table"
description: >
    Fetch Alter Table
---


# FETCH Parts from Zookeeper

This is a detailed explanation on how to move data by fetching partitions or parts between replicas

### Get partitions by database and table:

```sql
SELECT
    hostName() AS host,
    database,
    table
    partition_id,
    name as part_id
FROM cluster('{cluster}', system.parts)
WHERE database IN ('db1','db2' ... 'dbn') AND active
```

This query will return all the partitions and parts stored in this node for the databases and their tables. 

### Fetch the partitions:

Prior starting with the fetching process it is recommended to check the ```system.detached_parts``` table of the destination node. There is a chance that detached folders already contain some old parts, and you will have to remove them all before starting moving data. Otherwise you will attach those old parts together with the fetched parts. Also you could run into issues if there are detached folders with the same names as the ones you are fetching (not very probable, put possible). Simply delete the detached parts and continue with the process.

To fetch a partition:

```sql
ALTER TABLE <tablename> FETCH PARTITION <partition_id> FROM '/clickhouse/{cluster}/tables/{shard}/{table}'
```

The ```FROM``` path is from the zookeeper node and you have to specify the shard from you're [fetching the partition](https://clickhouse.com/docs/en/sql-reference/statements/alter/partition#alter_fetch-partition). Next executing the DDL query:

```sql
ALTER TABLE <tablename> ATTACH PARTITION <partition_id>
```

will attach the partitions to a table. Again and because the process is manual, it is recommended to check that the fetched partitions are attached correctly and that there are no detached parts left. Check both ```system.parts``` and ```system.detached_parts``` tables.

### Detach tables and delete replicas:

If needed, after moving the data and checking that everything is sound, you can detach the tables and delete the replicas.

```sql
-- Required for DROP REPLICA
DETACH TABLE <table_name>;  

-- This will remove everything from /table_path_in_z/replicas/replica_name
-- but not the data. You could reattach the table again and
-- restore the replica if needed. Get the zookeeper_path and replica_name from system.replicas

SYSTEM DROP REPLICA 'replica_name' FROM ZKPATH '/table_path_in_zk/';
```

### Query to generate all the DDL:

With this query you can generate the DDL script that will do the fetch and attach operations for each table and partition.

```sql
SELECT
    DISTINCT
    'alter table '||database||'.'||table||' FETCH PARTITION '''||partition_id||''' FROM '''||zookeeper_path||'''; '
    ||'alter table '||database||'.'||table||' ATTACH PARTITION '''||partition_id||''';'
FROM system.parts INNER JOIN system.replicas USING (database, table)
WHERE database IN ('db1','db2' ... 'dbn') AND active
```

You could add an ORDER BY to manually make the list in the order you need, or use ORDER BY rand() to randomize it. You will then need to split the commands between the shards.
