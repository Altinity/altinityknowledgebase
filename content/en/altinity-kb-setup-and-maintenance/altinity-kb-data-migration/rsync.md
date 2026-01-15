---
title: "Moving ClickHouse to Another Server"
linkTitle: "rsync"
description: >
    Copying Multi-Terabyte Live ClickHouse to Another Server
---

When migrating a large, live ClickHouse cluster (multi-terabyte scale) to a new server or cluster, the goal is to minimize downtime while ensuring data consistency. A practical method is to use **incremental `rsync`** in multiple passes, combined with ClickHouse’s replication features.

1. **Prepare the new cluster**
    - Ensure the new cluster is set up with its own ZooKeeper (or Keeper).
    - Configure ClickHouse but keep it stopped initially.
    - For clickhouse-operator instances, you can stop all pods by CHI definition:
```
spec:
  stop: "true"
```
and attach volumes (PVC) to a service pod.

2. **Initial data sync**
    
    Run a full recursive sync of the data directory from the old server to the new one:
    
    ```bash
    rsync -ravlW --delete /var/lib/clickhouse/ user@new_host:/var/lib/clickhouse/
    ```
    
    Explanation of flags:
    
    - `r`: recursive, includes all subdirectories.
    - `a`: archive mode (preserves symlinks, permissions, timestamps, ownership, devices).
    - `v`: verbose, shows progress.
    - `l`: copy symlinks as symlinks.
    - `W`: copy whole files instead of using rsync’s delta algorithm (faster for large DB files).
    - --delete: remove files from the destination that don’t exist on the source.

    If you plan to run several replicas on a new cluster, rsync data to all of them.  To save the performance of production servers, you can copy data to 1 new replica and then use it as a source for others. You can start with a single replica and add more after switching, but it will take more time afterward, as additional replicas need to pull all the data.

    Add --bwlimit=100000 to preserve the performance of the production cluster while copying a lot of data.
   
    Consider shards as independent clusters.
   
4. **Incremental re-syncs**
    - Repeat the `rsync` step multiple times while the old cluster is live.
    - Each subsequent run will copy only changes and reduce the final sync time.
5. **Restore replication metadata**
    - Start the new ClickHouse node(s).
    - Run `SYSTEM RESTORE REPLICA table_name` to rebuild replication metadata in ZooKeeper.
6. **Test the application**
    - Point your test environment to the new cluster.
    - Validate queries, schema consistency, and application behavior.
7. **Final sync and switchover**
    - Stop ClickHouse on the old cluster.
    - Immediately run a final incremental `rsync` to catch last-minute changes.
    - Reinitialize ZooKeeper/Keeper database (stop/clear snapshots/start).
    - Run `SYSTEM RESTORE REPLICA table_name` to rebuild replication metadata in ZooKeeper again.
    - Start ClickHouse on the new cluster and switch production traffic.
    - add more replicas as needed


NOTES: 

1. To restore metadata on all cluster nodes by a single command, use `ON CLUSTER` modifier for the RESTORE REPLICA command.
2. You can build a script to run restore replica commands over all replicated tables by query:
```
select 'SYSTEM RESTORE REPLICA ' || database || '.' || table || ' ON CLUSTER {cluster} ;'
from system.tables
where engine ilike 'Replicated%'
```

2. If you are using a mount point that differs from /var/lib/clickhouse/data, adjust the rsync command accordingly to point to the correct location. For example, suppose you reconfigure the storage path as follows in /etc/clickhouse-server/config.d/config.xml. 
```
<clickhouse>
    <!-- Path to data directory, with trailing slash. -->
    <path>/data1/clickhouse/</path>
    ...
</clickhouse>
```
You'll need to use `/data1/clickhouse` instead of `/var/lib/clickhouse` in the rsync paths. 

3. ClickHouse Docker container image does not have rsync installed. Add it using apt-get or run sidecar in k8s or run a service pod with volumes attached.


