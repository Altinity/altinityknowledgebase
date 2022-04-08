---
title: "How to change ORDER BY"
linkTitle: "How to change ORDER BY"
weight: 100
description: >-
     How to change ORDER BY.
---

## Create a new table and copy data through an intermediate table. Step by step procedure.

We want to add `column3` to the ORDER BY in this table:
```sql
CREATE TABLE example_table
(
  date Date,
  column1 String,
  column2 String,
  column3 String,
  column4 String
)
ENGINE = ReplicatedMergeTree('/clickhouse/{cluster}/tables/{shard}/default/example_table', '{replica}')
PARTITION BY toYYYYMM(date)
ORDER BY (column1, column2)
```

1. Stop publishing/INSERT into `example_table`.

2. `Rename table example_table to example_table_old`

3. Create the new table with the old name. This will preserve all dependencies like materialized views.
```sql
CREATE TABLE example_table as example_table_old 
ENGINE = ReplicatedMergeTree('/clickhouse/{cluster}/tables/{shard}/default/example_table_new', '{replica}')
PARTITION BY toYYYYMM(date)
ORDER BY (column1, column2, column3)
```

4. Copy data from `example_table_old` into `example_table_temp`

     a. Use this query to generate a list of INSERT statements
     ```sql
     select concat('insert into example_table_temp select * from example_table_old where toYYYYMM(date)=',partition) as cmd, 
     database, table, partition, sum(rows), sum(bytes_on_disk), count()
     from system.parts
     where database='default' and table='example_table_old'
     group by database, table, partition
     order by partition
     ```

     b. Create an intermediate table
     ```sql
     CREATE TABLE example_table_temp as example_table_old 
     ENGINE = MergeTree
     PARTITION BY toYYYYMM(date)
     ORDER BY (column1, column2, column3)
     ```

     c. Run the queries one by one

     After each query compare the number of rows in both tables.
     If the INSERT statement was interrupted and failed to copy data, drop the partition in `example_table` and repeat the INSERT.
     If a partition was copied successfully, proceed to the next partition.

     Here is a query to compare the tables:
     ```sql
     select database, table, partition, sum(rows), sum(bytes_on_disk), count()
     from system.parts
     where database='default' and table like 'example_table%'
     group by database, table, partition
     order by partition
     ```

5. Attach data from the intermediate table to `example_table`

     a. Use this query to generate a list of ATTACH statements
     ```sql
     select concat('alter table example_table attach partition id ''',partition,''' from example_table_temp') as cmd, 
     database, table, partition, sum(rows), sum(bytes_on_disk), count()
     from system.parts
     where database='default' and table='example_table_temp'
     group by database, table, partition
     order by partition
     ```

     b. Run the queries one by one

     Here is a query to compare the tables:
     ```sql
     select hostName(), database, table, partition, sum(rows), sum(bytes_on_disk), count()
     from clusterAllReplicas('my-cluster',system.parts)
     where database='default' and table like 'example_table%'
     group by hostName(), database, table, partition
     order by partition
     ```

6. Drop `example_table_old` and `example_table_temp`

