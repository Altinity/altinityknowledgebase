---
title: "Remote table function"
linkTitle: "Remote table function"
description: >
  Remote table function
---

## remote(...) table function

Suitable for moving up to hundreds of gigabytes of data.

With bigger tables recommended approach is to slice the original data by some `WHERE` condition, ideally - apply the condition on partitioning key, to avoid writing data to many partitions at once.

```sql
INSERT INTO staging_table SELECT * FROM remote(...) WHERE date='2021-04-13';
INSERT INTO staging_table SELECT * FROM remote(...) WHERE date='2021-04-12';
INSERT INTO staging_table SELECT * FROM remote(...) WHERE date='2021-04-11';
....

OR 

INSERT INTO FUNCTION remote(...) SELECT * FROM staging_table WHERE date='2021-04-11';
....
```

### Q. Can it create a bigger load on the source system?

Yes, it may use disk read & network write bandwidth. But typically write speed is worse than the read speed, so most probably the receiver side will be a bottleneck, and the sender side will not be overloaded.

While of course it should be checked, every case is different.

### Q. Can I tune INSERT speed to make it faster?

Yes, by the cost of extra memory usage (on the receiver side).

ClickHouse® tries to form blocks of data in memory and while one of limit: `min_insert_block_size_rows` or `min_insert_block_size_bytes` being hit, ClickHouse dump this block on disk. If ClickHouse tries to execute insert in parallel (`max_insert_threads > 1`), it would form multiple blocks at one time.  
So maximum memory usage can be calculated like this: `max_insert_threads * first(min_insert_block_size_rows OR min_insert_block_size_bytes)`

Default values:

```sql
┌─name────────────────────────┬─value─────┐
│ min_insert_block_size_rows  │ 1048545   │
│ min_insert_block_size_bytes │ 268427520 │
│ max_insert_threads          │ 0         │ <- Values 0 or 1 means that INSERT SELECT is not run in parallel.
└─────────────────────────────┴───────────┘
```

Tune those settings depending on your table average row size and amount of memory which are safe to occupy by `INSERT SELECT` query.

### Q. I've got the error "All connection tries failed"

```sql
SELECT count()
FROM remote('server.from.remote.dc:9440', 'default.table', 'admin', 'password')
Received exception from server (version 20.8.11):
Code: 519. DB::Exception: Received from localhost:9000. DB::Exception: All attempts to get table structure failed. Log:
Code: 279, e.displayText() = DB::NetException: All connection tries failed. Log:
Code: 209, e.displayText() = DB::NetException: Timeout: connect timed out: 192.0.2.1:9440 (server.from.remote.dc:9440) (version 20.8.11.17 (official build))
Code: 209, e.displayText() = DB::NetException: Timeout: connect timed out: 192.0.2.1:9440 (server.from.remote.dc:9440) (version 20.8.11.17 (official build))
Code: 209, e.displayText() = DB::NetException: Timeout: connect timed out: 192.0.2.1:9440 (server.from.remote.dc:9440) (version 20.8.11.17 (official build))
```

1. Using remote(...) table function with secure TCP port (default values is 9440). There is remoteSecure() function for that.  
2. High (>50ms) ping between servers, values for `connect_timeout_with_failover_ms,`  `connect_timeout_with_failover_secure_ms` need's to be adjusted accordingly.  

Default values:

```sql
┌─name────────────────────────────────────┬─value─┐
│ connect_timeout_with_failover_ms        │ 50    │
│ connect_timeout_with_failover_secure_ms │ 100   │
└─────────────────────────────────────────┴───────┘
```

### Example

```
#!/bin/bash

table='...'
database='bvt'
local='...'
remote='...'
CH="clickhouse-client"   # you may add auth here 
settings="  max_insert_threads=20, 
            max_threads=20, 
            min_insert_block_size_bytes = 536870912, 
            min_insert_block_size_rows = 16777216, 
            max_insert_block_size = 16777216,
            optimize_on_insert=0";

# need it to create temp table with same structure (suitable for attach)
params=$($CH -h $remote -q "select partition_key,sorting_key,primary_key from system.tables where table='$table' and database = '$database' " -f TSV)
IFS=$'\t' read -r partition_key sorting_key primary_key <<< $params

$CH -h $local \  # get list of source partitions
-q "select distinct partition from system.parts where table='$table' and database = '$database' "

while read -r partition; do
# check that the partition is already copied
  if [ `$CH -h $remote -q " select count() from system.parts table='$table' and database = '$database' and partition='$partition'"` -eq 0 ] ; then
      $CH -n -h $remote -q "
        create temporary table temp as $database.$table engine=MergeTree -- 23.3 required for temporary table
           partition by ($partition_key) primary key ($primary_key)  order by ($sorting_key);
        -- SYSTEM STOP MERGES temp; -- maybe....
        set $settings;
        insert into temp select * from remote($local,$database.$table) where _partition='$partition'
        -- order by ($sorting_key) -- maybe....
        ;
        alter table $database.$table attach partition $partition from temp
  "
  fi
done
```
