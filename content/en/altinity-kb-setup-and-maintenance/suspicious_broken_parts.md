# set max_suspicious_broken_parts to solve Suspiciously many broken parts to remove exception.


* Reproduce the exception:
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

* Reason

This exception is because the data files have been corrupted or the files/folders have been moved.

* Solution

`sudo -u clickhouse touch /var/lib/clickhouse/flags/force_restore_data` does not work

Change the max_suspicious_broken_parts parameter will work, this limit is set to 10 by default, we can set bigger value(50 or 100 or more), but the data will lose because the corruption.

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

> This setting is for all the tables, we can set on the table's metadata:
> cd /var/lib/clickhouse/metadata/default 
> add max_suspicious_broken_parts after the table structure in the t111.sql:
> ```
> SETTINGS max_suspicious_broken_parts = 10
> ```
> then :
> ```
> Attach table t111;
> ```
