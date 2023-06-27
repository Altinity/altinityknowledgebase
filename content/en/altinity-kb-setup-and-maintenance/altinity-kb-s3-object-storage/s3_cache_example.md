---
title: "Example of the table at s3 with remote cache"
linkTitle: "s3 cached table"
weight: 100
description: >-
     s3 disk and s3 cache.
---

## Storage configuration
```xml
cat /etc/clickhouse-server/config.d/s3.xml
<clickhouse>
    <storage_configuration>
        <disks>
            <s3disk>
                <type>s3</type>
                <endpoint>https://s3.us-east-1.amazonaws.com/mybucket/test/s3cached/</endpoint>
                <use_environment_credentials>1</use_environment_credentials>  <!-- use IAM AWS role -->
                    <!--access_key_id>xxxx</access_key_id>
                    <secret_access_key>xxx</secret_access_key-->
            </s3disk>
            <cache>
                <type>cache</type>
                <disk>s3disk</disk>
                <path>/var/lib/clickhouse/disks/s3_cache/</path>
                <max_size>50Gi</max_size>  <!-- 50GB local cache to cache remote data -->
            </cache>
        </disks>
        <policies>
          <s3tiered>
              <volumes>
                  <default>
                      <disk>default</disk>
                      <max_data_part_size_bytes>50000000000</max_data_part_size_bytes>   <!-- only for parts less than 50GB after they moved to s3 during merges -->         
                  </default>
                  <s3cached>
                      <disk>cache</disk>  <!-- sandwich cache plus s3disk -->
                      <!-- prefer_not_to_merge>true</prefer_not_to_merge>
                      <perform_ttl_move_on_insert>false</perform_ttl_move_on_insert-->
                  </s3cached>
              </volumes>
          </s3tiered>
        </policies>
    </storage_configuration>
</clickhouse>
```

```sql
select * from system.disks
┌─name────┬─path──────────────────────────────┬───────────free_space─┬──────────total_space─┬
│ cache   │ /var/lib/clickhouse/disks/s3disk/ │ 18446744073709551615 │ 18446744073709551615 │
│ default │ /var/lib/clickhouse/              │         149113987072 │         207907635200 │
│ s3disk  │ /var/lib/clickhouse/disks/s3disk/ │ 18446744073709551615 │ 18446744073709551615 │
└─────────┴───────────────────────────────────┴──────────────────────┴──────────────────────┴

select * from system.storage_policies;
┌─policy_name─┬─volume_name─┬─volume_priority─┬─disks───────┬─volume_type─┬─max_data_part_size─┬─move_factor─┬─prefer_not_to_merge─┐
│ default     │ default     │               1 │ ['default'] │ JBOD        │                  0 │           0 │                   0 │
│ s3tiered    │ default     │               1 │ ['default'] │ JBOD        │        50000000000 │         0.1 │                   0 │
│ s3tiered    │ s3cached    │               2 │ ['s3disk']  │ JBOD        │                  0 │         0.1 │                   0 │
└─────────────┴─────────────┴─────────────────┴─────────────┴─────────────┴────────────────────┴─────────────┴─────────────────────┘
```

## example with a new table

```sql
CREATE TABLE test_s3
(
    `A` Int64,
    `S` String,
    `D` Date
)
ENGINE = MergeTree
PARTITION BY D
ORDER BY A
SETTINGS storage_policy = 's3tiered';

insert into test_s3 select number, number, '2023-01-01' from numbers(1e9);

0 rows in set. Elapsed: 270.285 sec. Processed 1.00 billion rows, 8.00 GB (3.70 million rows/s., 29.60 MB/s.)
```

Table size is 7.65 GiB and it at the default disk (EBS):
```sql
select disk_name, partition, sum(rows), formatReadableSize(sum(bytes_on_disk)) size, count() part_count 
from system.parts where table= 'test_s3' and active 
group by disk_name, partition;
┌─disk_name─┬─partition──┬──sum(rows)─┬─size─────┬─part_count─┐
│ default   │ 2023-01-01 │ 1000000000 │ 7.65 GiB │          8 │
└───────────┴────────────┴────────────┴──────────┴────────────┘
```

It seems my EBS write speed is slower than S3 write speed:
```sql
alter table test_s3 move partition '2023-01-01' to volume 's3cached';
0 rows in set. Elapsed: 98.979 sec.

alter table test_s3 move partition '2023-01-01' to volume 'default';
0 rows in set. Elapsed: 127.741 sec.
```

Queries performance against EBS:
```sql
select * from test_s3 where A = 443;
1 row in set. Elapsed: 0.002 sec. Processed 8.19 thousand rows, 71.64 KB (3.36 million rows/s., 29.40 MB/s.)

select uniq(A) from test_s3;
1 row in set. Elapsed: 11.439 sec. Processed 1.00 billion rows, 8.00 GB (87.42 million rows/s., 699.33 MB/s.)

select count() from test_s3 where S like '%4422%'
1 row in set. Elapsed: 17.484 sec. Processed 1.00 billion rows, 17.89 GB (57.20 million rows/s., 1.02 GB/s.)
```

Let's move data to S3
```sql
alter table test_s3 move partition '2023-01-01' to volume 's3cached';
0 rows in set. Elapsed: 81.068 sec.

select disk_name, partition, sum(rows), formatReadableSize(sum(bytes_on_disk)) size, count() part_count 
from system.parts where table= 'test_s3' and active 
group by disk_name, partition;
┌─disk_name─┬─partition──┬──sum(rows)─┬─size─────┬─part_count─┐
│ s3disk    │ 2023-01-01 │ 1000000000 │ 7.65 GiB │          8 │
└───────────┴────────────┴────────────┴──────────┴────────────┘
```

The first query execution against S3, the second against the cache (local EBS):
```sql
select * from test_s3 where A = 443;
1 row in set. Elapsed: 0.458 sec. Processed 8.19 thousand rows, 71.64 KB (17.88 thousand rows/s., 156.35 KB/s.)
1 row in set. Elapsed: 0.003 sec. Processed 8.19 thousand rows, 71.64 KB (3.24 million rows/s., 28.32 MB/s.)

select uniq(A) from test_s3;
1 row in set. Elapsed: 26.601 sec. Processed 1.00 billion rows, 8.00 GB (37.59 million rows/s., 300.74 MB/s.)
1 row in set. Elapsed: 8.675 sec. Processed 1.00 billion rows, 8.00 GB (115.27 million rows/s., 922.15 MB/s.)

select * from test_s3 where A = 443;
1 row in set. Elapsed: 33.586 sec. Processed 1.00 billion rows, 17.89 GB (29.77 million rows/s., 532.63 MB/s.)
1 row in set. Elapsed: 16.551 sec. Processed 1.00 billion rows, 17.89 GB (60.42 million rows/s., 1.08 GB/s.)
```

Cache introspection
```sql
select cache_base_path, formatReadableSize(sum(size)) from system.filesystem_cache group by 1;
┌─cache_base_path─────────────────────┬─formatReadableSize(sum(size))─┐
│ /var/lib/clickhouse/disks/s3_cache/ │ 7.64 GiB                      │
└─────────────────────────────────────┴───────────────────────────────┘

system drop FILESYSTEM cache;

select cache_base_path, formatReadableSize(sum(size)) from system.filesystem_cache group by 1;
0 rows in set. Elapsed: 0.005 sec.

select * from test_s3 where A = 443;
1 row in set. Elapsed: 0.221 sec. Processed 8.19 thousand rows, 71.64 KB (37.10 thousand rows/s., 324.47 KB/s.)

select cache_base_path, formatReadableSize(sum(size)) from system.filesystem_cache group by 1;
┌─cache_base_path─────────────────────┬─formatReadableSize(sum(size))─┐
│ /var/lib/clickhouse/disks/s3_cache/ │ 105.95 KiB                    │
└─────────────────────────────────────┴───────────────────────────────┘
```

No data is stored locally (except system log tables).
```sql
select name, formatReadableSize(free_space) free_space, formatReadableSize(total_space) total_space from system.disks;
┌─name────┬─free_space─┬─total_space─┐
│ cache   │ 16.00 EiB  │ 16.00 EiB   │
│ default │ 48.97 GiB  │ 49.09 GiB   │
│ s3disk  │ 16.00 EiB  │ 16.00 EiB   │
└─────────┴────────────┴─────────────┘
```

## example with an existing table

The `mydata` table is created without the explicitly defined `storage_policy`, it means that implicitly `storage_policy=default` / `volume=default` / `disk=default`.

```sql
select disk_name, partition, sum(rows), formatReadableSize(sum(bytes_on_disk)) size, count() part_count 
from system.parts where table='mydata' and active 
group by disk_name, partition
order by partition;
┌─disk_name─┬─partition─┬─sum(rows)─┬─size───────┬─part_count─┐
│ default   │ 202201    │ 516666677 │ 4.01 GiB   │         13 │
│ default   │ 202202    │ 466666657 │ 3.64 GiB   │         13 │
│ default   │ 202203    │  16666666 │ 138.36 MiB │         10 │
│ default   │ 202301    │ 516666677 │ 4.01 GiB   │         10 │
│ default   │ 202302    │ 466666657 │ 3.64 GiB   │         10 │
│ default   │ 202303    │  16666666 │ 138.36 MiB │         10 │
└───────────┴───────────┴───────────┴────────────┴────────────┘

-- Let's change the storage policy, this command instant and changes only metadata of the table, and possible because the new storage policy and the old has the volume `default`.

alter table mydata modify setting storage_policy = 's3tiered';

0 rows in set. Elapsed: 0.057 sec.
```

### straightforward (heavy) approach

```sql
-- Let's add TTL, it's a heavy command and takes a lot time and creates the performance impact, because it reads `D` column and moves parts to s3.
alter table mydata modify TTL D + interval 1 year to volume 's3cached';

0 rows in set. Elapsed: 140.661 sec.

┌─disk_name─┬─partition─┬─sum(rows)─┬─size───────┬─part_count─┐
│ s3disk    │ 202201    │ 516666677 │ 4.01 GiB   │         13 │
│ s3disk    │ 202202    │ 466666657 │ 3.64 GiB   │         13 │
│ s3disk    │ 202203    │  16666666 │ 138.36 MiB │         10 │
│ default   │ 202301    │ 516666677 │ 4.01 GiB   │         10 │
│ default   │ 202302    │ 466666657 │ 3.64 GiB   │         10 │
│ default   │ 202303    │  16666666 │ 138.36 MiB │         10 │
└───────────┴───────────┴───────────┴────────────┴────────────┘
```

### gentle (manual) approach

```sql
-- alter modify TTL changes only metadata of the table and applied to only newly insterted data.
set materialize_ttl_after_modify=0;
alter table mydata modify TTL D + interval 1 year to volume 's3cached';
0 rows in set. Elapsed: 0.049 sec.

-- move data slowly partition by partition

alter table mydata move partition id '202201' to volume 's3cached';
0 rows in set. Elapsed: 49.410 sec.

alter table mydata move partition id '202202' to volume 's3cached';
0 rows in set. Elapsed: 36.952 sec.

alter table mydata move partition id '202203' to volume 's3cached';
0 rows in set. Elapsed: 4.808 sec.

-- data can be optimized to reduce number of parts before moving it to s3
optimize table mydata partition id '202301' final;
0 rows in set. Elapsed: 66.551 sec.

alter table mydata move partition id '202301' to volume 's3cached';
0 rows in set. Elapsed: 33.332 sec.

┌─disk_name─┬─partition─┬─sum(rows)─┬─size───────┬─part_count─┐
│ s3disk    │ 202201    │ 516666677 │ 4.01 GiB   │         13 │
│ s3disk    │ 202202    │ 466666657 │ 3.64 GiB   │         13 │
│ s3disk    │ 202203    │  16666666 │ 138.36 MiB │         10 │
│ s3disk    │ 202301    │ 516666677 │ 4.01 GiB   │          1 │ -- optimized partition
│ default   │ 202302    │ 466666657 │ 3.64 GiB   │         13 │
│ default   │ 202303    │  16666666 │ 138.36 MiB │         10 │
└───────────┴───────────┴───────────┴────────────┴────────────┘
```

## S3 and Clickhouse start time

Let's create a table with 1000 parts and move them to s3.
```sql
CREATE TABLE test_s3( A Int64, S String, D Date)
ENGINE = MergeTree PARTITION BY D ORDER BY A
SETTINGS storage_policy = 's3tiered';

insert into test_s3 select number, number, toDate('2000-01-01') + intDiv(number,1e6) from numbers(1e9);
optimize table test_s3 final settings optimize_skip_merged_partitions = 1;

select disk_name, sum(rows), formatReadableSize(sum(bytes_on_disk)) size, count() part_count 
from system.parts where table= 'test_s3' and active group by disk_name;
┌─disk_name─┬──sum(rows)─┬─size─────┬─part_count─┐
│ default   │ 1000000000 │ 7.64 GiB │       1000 │
└───────────┴────────────┴──────────┴────────────┘

alter table test_s3 modify ttl D + interval 1 year to disk 's3disk';

select disk_name, sum(rows), formatReadableSize(sum(bytes_on_disk)) size, count() part_count 
from system.parts where table= 'test_s3' and active 
group by disk_name;
┌─disk_name─┬─sum(rows)─┬─size─────┬─part_count─┐
│ default   │ 755000000 │ 5.77 GiB │        755 │
│ s3disk    │ 245000000 │ 1.87 GiB │        245 │
└───────────┴───────────┴──────────┴────────────┘

----  several minutes later ----

┌─disk_name─┬──sum(rows)─┬─size─────┬─part_count─┐
│ s3disk    │ 1000000000 │ 7.64 GiB │       1000 │
└───────────┴────────────┴──────────┴────────────┘
```

### start time

```text
select name, value from system.merge_tree_settings where name = 'max_part_loading_threads';
┌─name─────────────────────┬─value─────┐
│ max_part_loading_threads │ 'auto(4)' │
└──────────────────────────┴───────────┘

systemctl stop clickhouse-server
time systemctl start clickhouse-server  / real	4m26.766s
systemctl stop clickhouse-server
time systemctl start clickhouse-server  / real	4m24.263s

cat /etc/clickhouse-server/config.d/max_part_loading_threads.xml
<?xml version="1.0"?>
<clickhouse>
    <merge_tree>
       <max_part_loading_threads>128</max_part_loading_threads>
    </merge_tree>
</clickhouse>

systemctl stop clickhouse-server
time systemctl start clickhouse-server / real	0m11.225s
systemctl stop clickhouse-server
time systemctl start clickhouse-server / real	0m10.797s

       <max_part_loading_threads>256</max_part_loading_threads>

systemctl stop clickhouse-server
time systemctl start clickhouse-server / real	0m8.474s
systemctl stop clickhouse-server
time systemctl start clickhouse-server / real	0m8.130s
```
