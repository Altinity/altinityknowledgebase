---
title: "ClickHouse® Replication and DDL queue problems"
linkTitle: "Replication and DDL queue problems"
description: >
    Finding and troubleshooting  problems in the `replication_queue` and `distributed_ddl_queue`
keywords: 
   - clickhouse replication	
   - clickhouse ddl
   - clickhouse check replication status
   - clickhouse replication queue
---

# How to check ClickHouse® replication problems:

1. Check `system.replicas` first, cluster-wide. It allows to check if the problem is local to some replica or global, and allows to see the exception.
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
    hostName() IN ('chi-prod-live-2-0-0','chi-prod-live-2-2-0','chi-prod-live-2-1-0')
    AND table = 'sessions_local'
    AND database = 'analytics'
    AND part_name in ('20230411_33631_33654_3')
```

1. If there are no errors, just everything get slower - check the load (usual system metrics)

## Common problems & solutions

- If the replication queue does not have any Exceptions only postponed reasons without exceptions just leave ClickHouse® do Merges/Mutations and it will eventually catch up and reduce the number of tasks in `replication_queue`. Number of concurrent merges and fetches can be tuned but if it is done without an analysis of your workload then you may end up in a worse situation. If Delay in queue is going up actions may be needed:

- First simplest approach:
  - try to `SYSTEM RESTART REPLICA db.table` (This will DETACH/ATTACH table internally)

### Some stuck replication task for a partition which was already removed or has no data

- This can be easily detected because some exceptions will be in the replication queue that reference a part from a partition that do not exist. Here the most probably scenario is that the partition was dropped and some tasks were left in the queue.

- drop the partition manually once again (it should remove the task)

- If the partition exists but the part is missing (maybe because it is superseded by a newer merged part) then you can try to DETACH/ATTACH the partition.
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

### Replica is not starting because local set of files differs too much

- First try increase the thresholds or set flag `force_restore_data` flag and restarting clickhouse/pod https://clickhouse.com/docs/en/engines/table-engines/mergetree-family/replication#recovery-after-complete-data-loss  

### Replica is in Read-Only MODE

Sometimes due to crashes, zookeeper split brain problem or other reasons some of the tables can be in Read-Only mode. This allows SELECTS but not INSERTS. So we need to do DROP / RESTORE replica procedure.

Just to be clear, this procedure **will not delete any data**, it will just re-create the metadata in zookeeper with the current state of the [ClickHouse replica](/altinity-kb-setup-and-maintenance/altinity-kb-data-migration/add_remove_replica/).
  
```sql
ALTER TABLE table_name DROP DETACHED PARTITION ALL  -- clean detached folder before operation. PARTITION ALL works only for the fresh clickhouse versions
DETACH TABLE table_name;  -- Required for DROP REPLICA
-- Use the zookeeper_path and replica_name from the above query. 
SYSTEM DROP REPLICA 'replica_name' FROM ZKPATH '/table_path_in_zk'; -- It will remove everything from the /table_path_in_zk/replicas/replica_name
ATTACH TABLE table_name;  -- Table will be in readonly mode, because there is no metadata in ZK and after that execute
SYSTEM RESTORE REPLICA table_name;  -- It will detach all partitions, re-create metadata in ZK (like it's new empty table), and then attach all partitions back
SYSTEM SYNC REPLICA table_name; -- Wait for replicas to synchronize parts. Also it's recommended to check `system.detached_parts` on all replicas after recovery is finished.
SELECT name FROM system.detached_parts WHERE table = 'table_name'; -- check for leftovers. See the potential problem here - https://gist.github.com/den-crane/702e4c8a1162dae7c2edf48a7c2dd00d
```


Starting from version 23, it's possible to use syntax [SYSTEM DROP REPLICA \'replica_name\' FROM TABLE db.table](https://clickhouse.com/docs/en/sql-reference/statements/system#drop-replica) instead of the `ZKPATH` variant, but you need to execute the above command from a different replica than the one you want to drop, which is not convenient sometimes. We recommend using the above method because it works with any version and is more reliable.

### Procedure for many replicas generating DDL:

```sql
SELECT DISTINCT 'DETACH TABLE  ' || database || '.' || table || ' ON CLUSTER \'data\';' FROM clusterAllReplicas('data',system.replicas) WHERE active_replicas < total_replicas FORMAT TSVRaw;

SELECT DISTINCT 'SYSTEM DROP REPLICA \'' || replica_name || '\' FROM ZKPATH \'' || zookeeper_path || '\';' FROM clusterAllReplicas('data',system.replicas) WHERE active_replicas < total_replicas FORMAT TSVRaw;

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

### Stuck DDL tasks in the distributed_ddl_queue

Sometimes [DDL tasks](/altinity-kb-setup-and-maintenance/altinity-kb-ddlworker/) (the ones that use ON CLUSTER) can get stuck in the `distributed_ddl_queue` because the replicas can overload if multiple DDLs (thousands of CREATE/DROP/ALTER) are executed at the same time. This is very normal in heavy ETL jobs.This can be detected by checking the `distributed_ddl_queue` table and see if there are tasks that are not moving or are stuck for a long time.

If these DDLs completed in some replicas but failed in others, the simplest way to solve this is to execute the failed command in the missed replicas without ON CLUSTER. If most of the DDLs failed then check the number of unfinished records in `distributed_ddl_queue` on the other nodes, because most probably it will be as high as thousands.

First backup the `distributed_ddl_queue` into a table so you will have a snapshot of the table with states of the tasks. You can do this with the following command:

```sql
CREATE TABLE default.system_distributed_ddl_queue AS SELECT * FROM system.distributed_ddl_queue;
```

After this we need to check from the backup table which tasks are not finished and execute them manually in the missed replicas, and review the pipeline which do `ON CLUSTER` command and not abuse of them. There is a new `CREATE TEMPORARY TABLE` command that can be used to avoid the `ON CLUSTER` command in some cases, where you need an intermediate table to do some operations and after that you can `INSERT INTO` the final table or do `ALTER TABLE final ATTACH PARTITION FROM TABLE temp` and this temp table will be dropped automatically after the session is closed.
