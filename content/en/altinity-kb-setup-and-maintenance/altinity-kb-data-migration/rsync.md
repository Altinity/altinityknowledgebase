---
title: "rsync"
linkTitle: "rsync"
description: >
    rsync
---

## Copying Multi-Terabyte Live ClickHouse to Another Server

When migrating a large, live ClickHouse cluster (multi-terabyte scale) to a new server or cluster, the goal is to minimize downtime while ensuring data consistency. A practical method is to use **incremental `rsync`** in multiple passes, combined with ClickHouse’s replication features.

1. **Prepare the new cluster**
    - Ensure the new cluster is set up with its own ZooKeeper (or Keeper).
    - Configure ClickHouse but keep it stopped initially.
2. **Initial data sync**
    
    Run a full recursive sync of the data directory from the old server to the new one:
    
    ```bash
    rsync -ravlW /var/lib/clickhouse/ user@new_host:/var/lib/clickhouse/
    ```
    
    Explanation of flags:
    
    - `r`: recursive, includes all subdirectories.
    - `a`: archive mode (preserves symlinks, permissions, timestamps, ownership, devices).
    - `v`: verbose, shows progress.
    - `l`: copy symlinks as symlinks.
    - `W`: copy whole files instead of using rsync’s delta algorithm (faster for large DB files).
3. **Incremental re-syncs**
    - Repeat the `rsync` step multiple times while the old cluster is live.
    - Each subsequent run will copy only changes and reduce the final sync time.
4. **Restore replication metadata**
    - Start the new ClickHouse node(s).
    - Run `SYSTEM RESTORE REPLICA` to rebuild replication metadata in ZooKeeper.
    - Verify replication works correctly.
5. **Test the application**
    - Point your test environment to the new cluster.
    - Validate queries, schema consistency, and application behavior.
6. **Final sync and switchover**
    - Stop ClickHouse on the old cluster.
    - Run a final incremental `rsync` to catch last-minute changes.
    - Reinitialize ZooKeeper/Keeper.
    - Run `SYSTEM RESTORE REPLICA` to rebuild replication metadata in ZooKeeper.
    - Start ClickHouse on the new cluster and switch production traffic.
    - add replicas as needed

## Through ATTACH from detached

These instructions apply to ClickHouse® using default locations for storage. 

1. Do [FREEZE TABLE](https://clickhouse.tech/docs/en/sql-reference/statements/alter/partition/#alter_freeze-partition) on needed table, partition. It produces a consistent snapshot of table data.
2. Run rsync command.

   ```bash
   rsync -ravlW --bwlimit=100000 /var/lib/clickhouse/data/shadow/N/database/table
       root@remote_host:/var/lib/clickhouse/data/database/table/detached
   ```

   `--bwlimit` is transfer limit in KBytes per second.

3. Run [ATTACH PARTITION](https://clickhouse.tech/docs/en/sql-reference/statements/alter/partition/#alter_attach-partition) for each partition from `./detached` directory.

IMPORTANT NOTE: If you are using a mount point different from /var/lib/clickhouse/data, adjust the rsync command accordingly to point the correct location. For example, suppose you reconfigure the storage path as follows in /etc/clickhouse-server/config.d/config.xml. 
```
<clickhouse>
    <!-- Path to data directory, with trailing slash. -->
    <path>/data1/clickhouse/</path>
    ...
</clickhouse>
```
You'll need to use `/data1/clickhouse` instead of `/var/lib/clickhouse` in the rsync paths. 
