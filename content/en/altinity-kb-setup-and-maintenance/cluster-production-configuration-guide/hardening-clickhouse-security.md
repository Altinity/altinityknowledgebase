---
title: "Backups"
linkTitle: "Backups"
description: >
    Backups
---


ClickHouse is currently at the design stage of creating some universal backup solution. Some custom backup strategies are:

1. Each shard is backed up separately.
2. FREEZE the table/partition. For more information, see [Alter Freeze Partition](https://clickhouse.tech/docs/en/sql-reference/statements/alter/partition/#alter_freeze-partition).
   1. This creates hard links in shadow subdirectory.
3. rsync that directory to a backup location, then remove that subfolder from shadow.
   1. Cloud users are recommended to use [Rclone](https://rclone.org/).
4. Always add the full contents of the metadata subfolder that contains the current DB schema and clickhouse configs to your backup.
5. For a second replica, it’s enough to copy metadata and configuration.
6. Data in clickhouse is already compressed with lz4, backup can be compressed bit better, but avoid using cpu-heavy compression algorythms like gzip, use something like zstd instead.

The tool automating that process  [clickhouse-backup](https://github.com/AlexAkulov/clickhouse-backup).
