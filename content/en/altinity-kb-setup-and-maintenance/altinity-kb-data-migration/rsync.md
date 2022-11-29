---
title: "rsync"
linkTitle: "rsync"
description: >
    rsync
---
### Short Instructions

These instructions apply to ClickHouse using default locations for storage. 

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
