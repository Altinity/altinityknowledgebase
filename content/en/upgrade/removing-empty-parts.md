---
title: "Removing empty parts"
linkTitle: "Removing empty parts"
description: >
    Removing empty parts
---
Removing of empty parts is a new feature introduced in ClickHouse® 20.12.
Earlier versions leave empty parts (with 0 rows) if TTL removes all rows from a part ([https://github.com/ClickHouse/ClickHouse/issues/5491](https://github.com/ClickHouse/ClickHouse/issues/5491)).
If you set up TTL for your data it is likely that there are quite many empty parts in your system.

The new version notices empty parts and tries to remove all of them immediately.
This is a one-time operation which runs right after an upgrade.
After that TTL will remove empty parts on its own.

There is a problem when different replicas of the same table start to remove empty parts at the same time. Because of the bug they can block each other ([https://github.com/ClickHouse/ClickHouse/issues/23292](https://github.com/ClickHouse/ClickHouse/issues/23292)).

What we can do to avoid this problem during an upgrade:

1) Drop empty partitions before upgrading to decrease the number of empty parts in the system.

    ```sql
    SELECT concat('alter table ',database, '.', table, ' drop partition id ''', partition_id, ''';')
    FROM system.parts WHERE active
    GROUP BY database, table, partition_id
    HAVING count() = countIf(rows=0)
    ```

2) Upgrade/restart one replica (in a shard) at a time.
If only one replica is cleaning empty parts there will be no deadlock because of replicas waiting for one another.
Restart one replica, wait for replication queue to process, then restart the next one.

Removing of empty parts can be disabled by adding `remove_empty_parts=0` to the default profile.

```markup
$ cat /etc/clickhouse-server/users.d/remove_empty_parts.xml
<clickhouse>
    <profiles>
        <default>
            <remove_empty_parts>0</remove_empty_parts>
        </default>
    </profiles>
</clickhouse>
```
