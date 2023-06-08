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
                  <hot>
                      <disk>default</disk>
                      <max_data_part_size_bytes>50000000000</max_data_part_size_bytes>   <!-- only for parts less than 50GB after they moved to s3 -->         
                  </hot>
                  <main>
                      <disk>cache</disk>  <!-- sandwitch cache plus s3disk -->
                  </main>
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
┌─policy_name─┬─volume_name─┬─volume_priority─┬─disks───────┬
│ default     │ default     │               1 │ ['default'] │
│ s3tiered    │ hot         │               1 │ ['default'] │
│ s3tiered    │ main        │               2 │ ['s3disk']  │
└─────────────┴─────────────┴─────────────────┴─────────────┴
```

## fun with a table

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
alter table test_s3 move partition '2023-01-01' to volume 'main';
0 rows in set. Elapsed: 98.979 sec.

alter table test_s3 move partition '2023-01-01' to volume 'hot';
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
alter table test_s3 move partition '2023-01-01' to volume 'main';
0 rows in set. Elapsed: 81.068 sec.

select disk_name, partition, sum(rows), formatReadableSize(sum(bytes_on_disk)) size, count() part_count from system.parts where table= 'test_s3' and active group by disk_name, partition;
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
