---
title: "Replication and DDL queue cleanup"
linkTitle: "Replication and DDL queue cleanup"
description: >
    This article describes how to detect possible problems in the `replication_queue` and `distributed_ddl_queue` and how to clean if needed.
---

# How to check the replication problems:

1. check `system.replicas` first, cluster-wide. It allows to check if the problem is local to some replica or global, and allows to see the exception.
   allows to answer the following questions:
   - Are there any ReadOnly replicas?
   - Is there the connection to zookeeper active?
   - Is there the exception during table init? (`Code: 999. Coordination::Exception: Transaction failed (No node): Op #1`)
  
2. Check `system.replication_queue`. 
   - How many tasks there / are they moving / are there some very old tasks there? (check `created_time` column, if tasks are 24h old, it is a sign of a problem):
   - You can use this qkb article query: https://kb.altinity.com/altinity-kb-setup-and-maintenance/altinity-kb-replication-queue/
   - Check if there are tasks with a high number of `num_tries` or `num_postponed` and `postponed_reason` this is a sign of stuck tasks.
   - Check the problematic parts affecting the stuck tasks. You can use columns `new_part_name` or `parts_to_merge`
   - Check which type is the task. If it is `MUTATE_PART` then it is a mutation task. If it is `MERGE_PARTS` then it is a merge task. These tasks can be deleted from the replication queue but `GET_PARTS` should not be deleted.

3. Check `system.errors`

4. Check `system.mutations`:
   - You can check that in the replication queue are stuck tasks of type `MUTATE_PART`, and that those mutations are still executing `system.mutations` using column `is_done`

5. Find the moment when problem started and collect / analyze / preserve logs from that moment. It is usually during the first steps of a restart/crash

6. Use `part_log` and `system.parts` to gather information of the parts related with the stuck tasks in the replication queue:
   - Check if those parts exist and are active from `system.parts` (use partition_id, name as part and active columns to filter)
   - Extract the part history from `system.part_log`
   - Example query from `part_log`:

```sql
SELECT hostName(), * FROM 
cluster('all-sharded',system.part_log)
WHERE
    hostName() IN ('chi-live-live-2-0-0','chi-live-live-2-2-0','chi-live-live-2-1-0')
    AND table = 'sessions_local'
    AND database = 'analytics'
    AND part_name in ('20230411_33631_33654_3')
```

1. If there are no errors, just everything get slower - check the load (usual system metrics)


## Common problems & solutions


- If the replication queue does not have any Exceptions only postponed reasons without exceptions just leave ClickHouse do Merges/Mutations and it will eventually catch up and reduce the number of tasks in `replication_queue`. Number of concurrent merges and fetches can be tuned but if it is done without an analysis of your workload then you may end up in a worse situation. If Delay in queue is going up actions may be needed:

- First simplest approach:    
  - try to SYSTEM RESTART REPLICA (This will DETACH/ATTACH table internally)


### Some stuck replication task for a partition which was already removed or has no data

- This can be easily detected because some exceptions will be in the replication queue that reference a part from a partition that do not exist. Here the most probably scenario is that the partition was dropped and some tasks were left in the queue.

- drop the partition manually once again (it should remove the task)

- If the partition exists but the part is missing (maybe because it is superseeded by a newer merged part) then you can try to DETACH/ATTACH the partition.
- Below DML generates the ALTER commands to do this:

```sql
WITH 
    extract(new_part_name, '^[^_]+')  as partition_id
SELECT
    '/* count: ' || count() || ' */\n' ||
    'ALTER TABLE ' || database || '.' || table || ' DETACH PARTITION ID \''|| partition_id || '\';\n' ||
    'ALTER TABLE ' || database || '.' || table || ' ATTACH PARTITION ID \''|| partition_id || '\';\n'
FROM 
    system.replication_queue as rq
GROUP BY
    database, table, partition_id
HAVING sum(num_tries) > 1000 OR count() > 100
ORDER BY count() DESC, sum(num_tries) DESC
FORMAT TSVRaw;
```

### Problem with mutation stuck in the queue:

- This can happen if the mutation is finished and by some reason the task is not removed from the queue. This can be detected by checking `system.mutations` table and see if the mutation is done but the task is still in the queue.

- kill the mutation (again)

### Problem of some complex nature (races etc) which exists only on single replica, which can not be resolved by simple ways (`is_lost` flag method)

Not even SYSTEM RESTART REPLICA db.table works and sometimes it can generate a server crash. So we can activate a flag to mark a replica as lost (long time not connected to the cluster) and DETACH/ATTACH table to initiate a special reconciliation procedure that will synchronize from a healthy replica full (replica won’t use its queue, but will check the queue of other replicas, so no need to delete the local queue) , without downloading any parts:

```sql
DETACH TABLE db.table
-- zkCli
[zk: localhost:9181(CONNECTED) 10] ls /clickhouse/tables/code_map_sc/replicas/localhost
[columns, metadata_version, is_lost, host, metadata, log_pointer, parts, mutation_pointer, max_processed_insert_time, is_active, flags, queue, min_unprocessed_insert_time]
[zk: localhost:9181(CONNECTED) 10] set /clickhouse/tables/code_map_sc/replicas/localhost/is_lost 1
-- zkCli
ATTACH TABLE db.table
-- 
```

After this we can check that the tables are out of readonly mode.

If we get an error like this AFTER trying to attach table:

```bash
Received exception from server (version 22.8.15):
Code: 231. DB::Exception: Received from localhost:9000. DB::Exception: The local set of parts of table insights.deleted_sessions (30780cbb-c626-4a6c-acf7-a8d1c104476b) doesn't look like the set of parts in ZooKeeper: 2.97 million rows of 2.97 million total rows in filesystem are suspicious. There are 57 uncovered unexpected parts with 2972851 rows (27 of them is not just-written with 2971882 rows), 2 missing parts (with 25439 blocks), 0 covered unexpected parts (with 0 rows).. (TOO_MANY_UNEXPECTED_DATA_PARTS)
```

Check next problem

### Replica is not starting because local set of files differs too much

  - First try increase the thresholds or set flag `force_restore_data` flag and restarting clickhouse/pod https://clickhouse.com/docs/en/engines/table-engines/mergetree-family/replication#recovery-after-complete-data-loss  



### Replica is in Read Only MODE

Sometimes due to crashes, zookeeper split brain problem or other reasons some of the tables can be in Read-Only mode. This allows SELECTS but not INSERTS. So we need to do DROP / RESTORE replica procedure. 

Just to be clear, this procedure **will not delete any data**, it will just re-create the metadata in zookeeper with the current state of the ClickHouse replica.
  
```sql
DETACH TABLE table_name;  -- Required for DROP REPLICA
-- Use the zookeeper_path and replica_name from the above query. 
SYSTEM DROP REPLICA 'replica_name' FROM ZKPATH '/table_path_in_zk/'; -- It will remove everything from the /table_path_in_zk/replicas/replica_name
ATTACH TABLE table_name;  -- Table will be in readonly mode, because there is no metadata in ZK and after that execute
SYSTEM RESTORE REPLICA table_name;  -- It will detach all partitions, re-create metadata in ZK (like it's new empty table), and then attach all partitions back
SYSTEM SYNC REPLICA table_name; -- Wait for replicas to synchronize parts. Also it's recommended to check `system.detached_parts` on all replicas after recovery is finished.
```

There are some variants in new 23 versions of this procedure using (`SYSTEM DROP REPLICA 'replica_name' FROM TABLE db.table`)[https://clickhouse.com/docs/en/sql-reference/statements/system#drop-replica] instead of the ZKPATH variant, but you need to execute the above command from a different replica that the one you want to drop which is not convenient sometimes. We recommend to use the above method because it works for different versions from 21 to 24 and it is more reliable.

- Procedure for many replicas generating DDL:

```sql
SELECT DISTINCT 'DETACH TABLE  ' || database || '.' || table || ' ON CLUSTER \'data\';' FROM clusterAllReplicas('data',system.replicas) WHERE active_replicas < total_replicas FORMAT TSVRaw;

SELECT DISTINCT 'SYSTEM DROP REPLICA \'' || replica_name || \' FROM ZKPATH \'' || zookeeper_path || '\';' FROM clusterAllReplicas('data',system.replicas) WHERE active_replicas < total_replicas FORMAT TSVRaw;

SELECT DISTINCT 'ATTACH TABLE  ' || database || '.' || table || ' ON CLUSTER \'data\';' FROM clusterAllReplicas('data',system.replicas) WHERE active_replicas < total_replicas FORMAT TSVRaw;

SELECT DISTINCT 'SYSTEM RESTORE REPLICA ' || database || '.' || table || ' ON CLUSTER \'data\';' FROM clusterAllReplicas('data',system.replicas) WHERE active_replicas < total_replicas FORMAT TSVRaw;

-- check detached parts afterwards
SELECT * FROM clusterAllReplicas('data',system.detached_parts)

-- make clickhouse 'forget' about the table (data persisted on disk)
DETACH TABLE db.table ON CLUSTER '...';

-- remove the zookeeper data about that table in zookeeper
SYSTEM DROP REPLICA 'replica_name' FROM ZKPATH '/path/to/table/in/zk'; -- run the commands generated before.

-- register table in clickhouse again - it will be in readonly mode.
ATTACH TABLE db.table ON CLUSTER '...'; 

-- recreate the zookeeper data from the 
SYSTEM RESTORE REPLICA db.name ON CLUSTER '...';

--- do restart replica 

SELECT DISTINCT 'clickhouse-client --host=' || left(hostName(),-2) || ' --query=\'SYSTEM RESTART REPLICA '||database || '.' || table|| '\''　FROM clusterAllReplicas('all-sharded', system.replication_queue)　WHERE last_exception != ''  and create_time > now() -130 FORMAT TSVRaw;
```

Here a bash script that will do the same as above but tailored to a single replica, you can call it like `bash restore_replica.sh chi-clickhouse-cluster-main-cluster-1-3`:

```bash
#!/usr/bin/env bash

#Call like bash restore_replica.sh chi-clickhouse-cluster-main-cluster-1-3

set -o errexit  # exit on fail
set -o pipefail # catch errors in pipelines
set -o nounset  # exit on undeclared variable
set -o xtrace    # trace execution

restore_replica() {
    local chi_name=$1
    # assumes `chi-...-cluster-<shard>-<replica>` naming ou can change this patter to your needs
    local shard=$(echo $chi_name |grep -oP '(?<=cluster-)\d+(?=-\d+$)')

    while true; do

        clickhouse-client --host=${chi_name} --user=admin --password=the_admin_password --query="select concat(database, '.\`', table, '\`', ' ', database, '/', table) FROM system.replicas WHERE is_readonly = 1 ORDER BY database, table" |
        while read -r db_table zk_path; do
            clickhouse-client --host=${chi_name} --user=admin --password=the_admin_password --query="DETACH TABLE ${db_table}"
            clickhouse-client --host=${chi_name} --user=admin --password=the_admin_password --query="SYSTEM DROP REPLICA '"${chi_name}"' FROM ZKPATH '/clickhouse/tables/${shard}/${zk_path}'" || true
            clickhouse-client --host=${chi_name} --user=admin --password=the_admin_password --query="ATTACH TABLE ${db_table}"
            clickhouse-client --host=${chi_name} --user=admin --password=the_admin_password --query="SYSTEM RESTORE REPLICA ${db_table}"
        done || true

        sleep 5

    done
}

restore_replica "$@"
```