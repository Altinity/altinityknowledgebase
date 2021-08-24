---
title: "rsync"
linkTitle: "rsync"
description: >
    rsync
---
### Short Instruction

1. Do [FREEZE TABLE](https://clickhouse.tech/docs/en/sql-reference/statements/alter/partition/#alter_freeze-partition) on needed table, partition. It would produce consistent snapshot of table data.
2. Run rsync command.

   ```bash
   rsync -ravlW --bwlimit=100000 /var/lib/clickhouse/data/shadow/N/database/table
       root@remote_host:/var/lib/clickhouse/data/database/table/detached
   ```

   `--bwlimit` is transfer limit in KBytes per second.

3. Run [ATTACH PARTITION](https://clickhouse.tech/docs/en/sql-reference/statements/alter/partition/#alter_attach-partition) for each partition from `./detached` directory.
