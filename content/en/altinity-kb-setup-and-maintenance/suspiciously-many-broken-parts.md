---
title: "Suspiciously many broken parts"
linkTitle: "Suspiciously many broken parts"
description: >
    Suspiciously many broken parts error during the server startup.
---

## Symptom:

clickhouse don't start with a message `DB::Exception: Suspiciously many broken parts to remove.`

## Cause:

That exception is just a safeguard check/circuit breaker, triggered when clickhouse detects a lot of broken parts during server startup.

Parts are considered broken if they have bad checksums or some files are missing or malformed. Usually, that means the data was corrupted on the disk.

Why data could be corrupted?

1. the most often reason is a hard restart of the system, leading to a loss of the data which was not fully flushed to disk from the system page cache. Please be aware that by default ClickHouse doesn't do fsync, so data is considered inserted after it was passed to the Linux page cache. See fsync-related settings in ClickHouse.

2. it can also be caused by disk failures, maybe there are bad blocks on hard disk, or logical problems, or some raid issue. Check system journals, use `fsck` / `mdadm` and other standard tools to diagnose the disk problem. 

3. other reasons: manual intervention/bugs etc, for example, the data files or folders are removed by mistake or moved to another folder.

## Action:

1. If you ok to accept the data loss: set up `force_restore_data` flag and clickhouse will move the parts to detached. Data loss is possible if the issue is a result of misconfiguration (i.e. someone accidentally has fixed xml configs with incorrect shard/replica macros, data will be moved to detached folder and can be recovered).

    ```bash
    sudo -u clickhouse touch /var/lib/clickhouse/flags/force_restore_data
    ``` 

    then restart clickhouse, the table will be attached, and the broken parts will be detached, which means the data from those parts will not be available for the selects. You can see the list of those parts in the `system.detached_parts` table and drop them if needed using `ALTER TABLE ...  DROP DETACHED PART ...` commands.

    If you are ok to tolerate bigger losses automatically you can change that safeguard configuration to be less sensitive by increasing `max_suspicious_broken_parts` setting:
    ```
    cat /etc/clickhouse-server/config.d/max_suspicious_broken_parts.xml
    <?xml version="1.0"?>
    <yandex>
         <merge_tree>
             <max_suspicious_broken_parts>50</max_suspicious_broken_parts>
         </merge_tree>
    </yandex>
    ```
    this limit is set to 10 by default, we can set a bigger value (50 or 100 or more), but the data will lose because of the corruption.

    Check also a similar setting `max_suspicious_broken_parts_bytes`.  
    See https://clickhouse.com/docs/en/operations/settings/merge-tree-settings/

2. If you can't accept the data loss - you should recover data from backups / re-insert it once again etc.

    If you don't want to tolerate automatic detaching of broken parts, you can set `max_suspicious_broken_parts_bytes` and `max_suspicious_broken_parts` to 0.


## Scenario illustrating / testing

1. Create table
```
create table t111(A UInt32) Engine=MergeTree order by A settings max_suspicious_broken_parts=1;
insert into t111 select number from numbers(100000);
```
2. Detach the table and make Data corruption 

```
detach table t111;
```
cd /var/lib/clickhouse/data/default/t111/all_*** 
make data file corruption:
```
> data.bin
``` 
repeat for 2 or more data files.

3. Attach the table:
```
attach table t111;
 
Received exception from server (version 21.12.3):
Code: 231. DB::Exception: Received from localhost:9000. DB::Exception: Suspiciously many (2) broken parts to remove.. (TOO_MANY_UNEXPEC
```
4. setup force_restrore_data flag
```
sudo -u clickhouse touch /var/lib/clickhouse/flags/force_restore_data
sudo service clickhouse-server restart
```
then the table `t111` will be attached lost the corrupted data.
