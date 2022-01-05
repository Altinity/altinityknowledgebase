## Symptom:

clickhouse don't start with a message `DB::Exception: Suspiciously many broken parts to remove.`

## Cause:

Why has this exception? Because CH safeguard / circuit braker check found lot of broken parts。

why parts are considered broken? bad checksum because some data was currupted on the disk.

Why data was corrupted?

1.most probably is the system has hard restart and data was not flushed to disk, because ClickHouse is not durable (in terms of ACID), it uses Linux file cache without fsync.

2.disk failure, maybe there are Bad Sectors or Bad Blocks on Hard Disk.

3.other reasons: manual intervention / bugs etc, for example, the data files or folders are removed by mistake or move to other folder.

## Action:

1.If you ok to accept the data loss: setup force_restrore_data flag and clickhouse will move the parts to detached. 

`sudo -u clickhouse touch /var/lib/clickhouse/flags/force_restore_data` 

then restart clickhouse, the table will be attached, and the broken parts will be detached, that means the data on those parts will loss.

or you can config the max_suspicious_broken_parts setting:

```
cat /etc/clickhouse-server/config.d/max_suspicious_broken_parts.xml
<?xml version="1.0"?>
<yandex>
     <merge_tree>
         <max_suspicious_broken_parts>50</max_suspicious_broken_parts>
     </merge_tree>
</yandex>
```
https://clickhouse.com/docs/en/operations/settings/merge-tree-settings/

this limit is set to 10 by default, we can set bigger value(50 or 100 or more), but the data will lose because the corruption.

2.If you can't accept the data loss - recover data from backups / re-insert it once again /etc


## scenario illustrating / testing

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
