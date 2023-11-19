---
title: "Add a new replica to a ClickHouse cluster"
linkTitle: "add_replica"
description: >
    How to add a new replica manually and using clickhouse-backup
---

## ADD nodes/Replicas to existing Cluster

To add some replicas to an existing cluster if -30TB then better to use replication:

- don’t add the `remote_servers.xml` until replication is done.
- Add these files and restart to limit bandwidth and avoid saturation (70% total bandwidth):

[Core Settings | ClickHouse Docs](https://clickhouse.com/docs/en/operations/settings/settings/#max_replicated_fetches_network_bandwidth_for_server)

💡 Do the **Gbps to Bps** math correctly. For 10G —> 1250MB/s —> 1250000000 B/s and change `max_replicated_*` settings accordingly:

- Nodes replicating from:

```xml
<clickhouse>
	<profiles>
		<default>
			<max_replicated_sends_network_bandwidth_for_server>50000</max_replicated_sends_network_bandwidth_for_server>
		</default>
	</profiles>
</clickhouse>
```

- Nodes replicating to:

```xml
<clickhouse>
	<profiles>
		<default>
			<max_replicated_fetches_network_bandwidth_for_server>50000</max_replicated_sends_network_bandwidth_for_server>
		</default>
	</profiles>
</clickhouse>
```

### Manual method (DDL)

- Create tables `manually` and be sure macros in all replicas are aligned with the ZK path. If zk path uses `{cluster}` then this method won’t work. ZK path should use `{shard}` and `{replica}` or `{uuid}` (if databases are Atomic) only.

```sql
-- DDL for Databases
SELECT concat('CREATE DATABASE "', name, '" ENGINE = ', engine_full, ';') 
FROM system.databases
INTO OUTFILE 'databases.sql' 
FORMAT TSVRaw;
-- DDL for tables and views
SELECT
    replaceRegexpOne(replaceOne(concat(create_table_query, ';'), '(', 'ON CLUSTER \'{cluster}\' ('), 'CREATE (TABLE|DICTIONARY|VIEW|LIVE VIEW|WINDOW VIEW))', 'CREATE \\1 IF NOT EXISTS')
FROM
    system.tables
WHERE
    database NOT IN ('system', 'information_schema', 'INFORMATION_SCHEMA') AND
    create_table_query != '' AND
    name NOT LIKE '.inner.%%' AND
    name NOT LIKE '.inner_id.%%' AND
INTO OUTFILE '/tmp/schema.sql' AND STDOUT
FORMAT TSVRaw
SETTINGS show_table_uuid_in_table_create_query_if_not_nil=1;
--- DDL only for materialized views
SELECT
    replaceRegexpOne(replaceOne(concat(create_table_query, ';'), 'TO', 'ON CLUSTER \'{cluster}\' TO'), 'CREATE MATERIALIZED VIEW', 'CREATE \\1 IF NOT EXISTS')
FROM
    system.tables
WHERE
    database NOT IN ('system', 'information_schema', 'INFORMATION_SCHEMA') AND
    create_table_query != '' AND
    name NOT LIKE '.inner.%%' AND
    name NOT LIKE '.inner_id.%%' AND
		as_select! = ''
INTO OUTFILE '/tmp/schema.sql' AND STDOUT APPEND
FORMAT TSVRaw
SETTINGS show_table_uuid_in_table_create_query_if_not_nil=1;
```

This will generate the UUIDs in the CREATE TABLE definition, something like this:

```sql
CREATE TABLE default.insert_test UUID '51b41170-5192-4947-b13b-d4094c511f06' (`id_order` UInt16, `id_plat` UInt32, `id_warehouse` UInt64, `id_product` UInt16, `order_type` UInt16, `order_status` String, `datetime_order` DateTime, `units` Int16, `total` Float32) ENGINE = ReplicatedMergeTree('/clickhouse/tables/{uuid}/{shard}', '{replica}') PARTITION BY tuple() ORDER BY (id_order, id_plat, id_warehouse) SETTINGS index_granularity = 8192;
```

- Copy both SQL to destination replica and execute

```sql
clickhouse-client --host localhost --port 9000 -mn < databases.sql
clickhouse-client --host localhost --port 9000 -mn < schema.sql
```

### Using clickhouse-backup

- Using clickhouse-backup to copy the schema of a replica to another is also convenient and moreover if using Atomic database with `{uuid}` macros in ReplicatedMergeTree engines:

```bash
sudo -u clickhouse clickhouse-backup --schema --rbac create_remote full-replica
# From the destination replica
sudo -u clickhouse clickhouse-backup --schema --rbac restore_remote full-replica
```

### Check that schema migration was successful and node is replicating

- To check that the schema migration has been **successful** query system.replicas:

```sql
SELECT DISTINCT database,table,replica_is_active FROM system.replicas FORMAT Vertical
```

- Check how the replication process is performing using https://kb.altinity.com/altinity-kb-setup-and-maintenance/altinity-kb-replication-queue/
  
    - If there are many postponed tasks with message:
        
    ```sql
    Not executing fetch of part 7_22719661_22719661_0 because 16 fetches already executing, max 16.                                                                                                      │ 2023-09-25 17:03:06 │            │
    ```
    
    then it is ok, the maximum replication slots are being used. Exceptions are not OK and should be investigated

- If migration was sucessful and replication is working then wait until the replication is finished. It may take some days depending on how much data is being replicated. After this edit the cluster configuration xml file for all replicas (`remote_servers.xml`) and add the new replica to the cluster.
  

### Possible problems

#### **Exception** `REPLICA_ALREADY_EXISTS`
  
```sql
Code: 253. DB::Exception: Received from localhost:9000. 
DB::Exception: There was an error on [dl-ny2-vm-09.internal.io:9000]: 
Code: 253. DB::Exception: Replica /clickhouse/tables/3c3503c3-ed3c-443b-9cb3-ef41b3aed0a8/1/replicas/dl-ny2-vm-09.internal.io 
already exists. (REPLICA_ALREADY_EXISTS) (version 23.5.3.24 (official build)). (REPLICA_ALREADY_EXISTS)
(query: CREATE TABLE IF NOT EXISTS xxxx.yyyy UUID '3c3503c3-ed3c-443b-9cb3-ef41b3aed0a8'
```
    
The DDLs have been executed and some tables have been created and after that dropped but some left overs are left in ZK:
- If databases can be dropped then use `DROP DATABASE xxxxx SYNC`
- If databases cannot be dropped use `SYSTEM DROP REPLICA ‘replica_name’ FROM db.table`
  
#### **Exception** `TABLE_ALREADY_EXISTS`
        
```sql
Code: 57. DB::Exception: Received from localhost:9000. 
DB::Exception: There was an error on [dl-ny2-vm-09.internal.io:9000]: 
Code: 57. DB::Exception: Directory for table data store/3c3/3c3503c3-ed3c-443b-9cb3-ef41b3aed0a8/ already exists. 
(TABLE_ALREADY_EXISTS) (version 23.5.3.24 (official build)). (TABLE_ALREADY_EXISTS)
(query: CREATE TABLE IF NOT EXISTS xxxx.yyyy UUID '3c3503c3-ed3c-443b-9cb3-ef41b3aed0a8' ON CLUSTER '{cluster}'
```
        
Tables have not been dropped correctly:
  - If databases can be dropped then use `DROP DATABASE xxxxx SYNC`
  - If databases cannot be dropped use:

```sql
SELECT concat('DROP TABLE ', database, '.', name, ' SYNC;') 
FROM system.tables 
WHERE database NOT IN ('system', 'information_schema', 'INFORMATION_SCHEMA') 
INTO OUTFILE '/tmp/drop_tables.sql' 
FORMAT TSVRaw;
```
            
### Tuning

- Sometimes replication goes very fast and if you have a tiered storage hot/cold you could run out of space, so for that it is interesting to:
    - reduce fetches from 8 to 4
    - increase moves from 8 to 16

```xml
<yandex>
    <profiles>
        <default>        
            <max_replicated_fetches_network_bandwidth_for_server>625000000</max_replicated_fetches_network_bandwidth_for_server>
            <background_fetches_pool_size>4</background_fetches_pool_size>
            <background_move_pool_size>16</background_move_pool_size>
        </default>
    </profiles>
</yandex>
```

- Also to monitor this with:

```sql
SELECT *
FROM system.metrics
WHERE metric LIKE '%Move%'

Query id: 5050155b-af4a-474f-a07a-f2f7e95fb395

┌─metric─────────────────┬─value─┬─description──────────────────────────────────────────────────┐
│ BackgroundMovePoolTask │     0 │ Number of active tasks in BackgroundProcessingPool for moves │
└────────────────────────┴───────┴──────────────────────────────────────────────────────────────┘

1 row in set. Elapsed: 0.164 sec. 

dnieto-test :) SELECT * FROM system.metrics WHERE metric LIKE '%Fetch%';

SELECT *
FROM system.metrics
WHERE metric LIKE '%Fetch%'

Query id: 992cae2a-fb58-4150-a088-83273805d0c4

┌─metric────────────────────┬─value─┬─description───────────────────────────────────────────────┐
│ ReplicatedFetch           │     0 │ Number of data parts being fetched from replica           │
│ BackgroundFetchesPoolTask │     0 │ Number of active fetches in an associated background pool │
└───────────────────────────┴───────┴───────────────────────────────────────────────────────────┘

2 rows in set. Elapsed: 0.163 sec.
```

- There are new tables in v23 `system.replicated_fetches` and `system.moves` check it out for more info.
- if needed just stop replication using `SYSTEM STOP FETCHES` from the replicating nodes