---
title: "How much data are written to S3 during mutations"
linkTitle: "s3 and mutations"
weight: 100
description: >-
     Example of how much data Clickhouse reads and writes to s3 during mutations.
---

## Configuration

S3 disk with disabled merges

```xml
<clickhouse>
    <storage_configuration>
        <disks>
            <s3disk>
                <type>s3</type>
                <endpoint>https://s3.us-east-1.amazonaws.com/mybucket/test/test/</endpoint>
                <use_environment_credentials>1</use_environment_credentials>  <!-- use IAM AWS role -->
                    <!--access_key_id>xxxx</access_key_id>
                    <secret_access_key>xxx</secret_access_key-->
            </s3disk>
        </disks>
        <policies>
          <s3tiered>
              <volumes>
                  <default>
                      <disk>default</disk>
                  </default>
                  <s3disk>
                      <disk>s3disk</disk>  
                      <prefer_not_to_merge>true</prefer_not_to_merge>
                  </s3disk>
              </volumes>
          </s3tiered>
        </policies>
    </storage_configuration>
</clickhouse>
```

Let's create a table and load some synthetic data.

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

insert into test_s3 select number, number, today() - intDiv(number, 10000000) from numbers(7e8);
0 rows in set. Elapsed: 98.091 sec. Processed 700.36 million rows, 5.60 GB (7.14 million rows/s., 57.12 MB/s.)


select disk_name, partition, sum(rows), formatReadableSize(sum(bytes_on_disk)) size, count() part_count 
from system.parts where table= 'test_s3' and active 
group by disk_name, partition
order by partition;

┌─disk_name─┬─partition──┬─sum(rows)─┬─size──────┬─part_count─┐
│ default   │ 2023-05-06 │  10000000 │ 78.23 MiB │          5 │
│ default   │ 2023-05-07 │  10000000 │ 78.31 MiB │          6 │
│ default   │ 2023-05-08 │  10000000 │ 78.16 MiB │          5 │
....
│ default   │ 2023-07-12 │  10000000 │ 78.21 MiB │          5 │
│ default   │ 2023-07-13 │  10000000 │ 78.23 MiB │          6 │
│ default   │ 2023-07-14 │  10000000 │ 77.39 MiB │          5 │
└───────────┴────────────┴───────────┴───────────┴────────────┘
70 rows in set. Elapsed: 0.023 sec.
```

## Perfomance of mutations for a local EBS (throughput: 500 MB/s)

```sql
select * from test_s3 where A=490000000;
1 row in set. Elapsed: 0.020 sec. Processed 8.19 thousand rows, 92.67 KB (419.17 thousand rows/s., 4.74 MB/s.)

select * from test_s3 where S='490000000';
1 row in set. Elapsed: 14.117 sec. Processed 700.00 million rows, 12.49 GB (49.59 million rows/s., 884.68 MB/s.)

delete from test_s3 where S = '490000000';
0 rows in set. Elapsed: 22.192 sec.

delete from test_s3 where A = '490000001';
0 rows in set. Elapsed: 2.243 sec.

alter table test_s3 delete where S = 590000000 settings mutations_sync=2;
0 rows in set. Elapsed: 21.387 sec.

alter table test_s3 delete where A = '590000001' settings mutations_sync=2;
0 rows in set. Elapsed: 3.372 sec.

alter table test_s3 update S='' where S = '690000000' settings mutations_sync=2;
0 rows in set. Elapsed: 20.265 sec.

alter table test_s3 update S='' where A = '690000001' settings mutations_sync=2;
0 rows in set. Elapsed: 1.979 sec.
```

## Let's move data to S3

```sql
alter table test_s3 modify TTL D + interval 10 day to disk 's3disk';

-- 10 minutes later
┌─disk_name─┬─partition──┬─sum(rows)─┬─size──────┬─part_count─┐
│ s3disk    │ 2023-05-06 │  10000000 │ 78.23 MiB │          5 │
│ s3disk    │ 2023-05-07 │  10000000 │ 78.31 MiB │          6 │
│ s3disk    │ 2023-05-08 │  10000000 │ 78.16 MiB │          5 │
│ s3disk    │ 2023-05-09 │  10000000 │ 78.21 MiB │          6 │
│ s3disk    │ 2023-05-10 │  10000000 │ 78.21 MiB │          6 │
...
│ s3disk    │ 2023-07-02 │  10000000 │ 78.22 MiB │          5 │
...
│ default   │ 2023-07-11 │  10000000 │ 78.20 MiB │          6 │
│ default   │ 2023-07-12 │  10000000 │ 78.21 MiB │          5 │
│ default   │ 2023-07-13 │  10000000 │ 78.23 MiB │          6 │
│ default   │ 2023-07-14 │  10000000 │ 77.40 MiB │          5 │
└───────────┴────────────┴───────────┴───────────┴────────────┘
70 rows in set. Elapsed: 0.007 sec.
```

### Sizes of a table on S3 and a size of each column
```
select sum(rows), formatReadableSize(sum(bytes_on_disk)) size 
from system.parts where table= 'test_s3' and active and disk_name = 's3disk';
┌─sum(rows)─┬─size─────┐
│ 600000000 │ 4.58 GiB │
└───────────┴──────────┘

SELECT
    database,
    table,
    column,
    formatReadableSize(sum(column_data_compressed_bytes) AS size) AS compressed
FROM system.parts_columns
WHERE (active = 1) AND (database LIKE '%') AND (table LIKE 'test_s3') AND (disk_name = 's3disk')
GROUP BY
    database,
    table,
    column
ORDER BY column ASC

┌─database─┬─table───┬─column─┬─compressed─┐
│ default  │ test_s3 │ A      │ 2.22 GiB   │
│ default  │ test_s3 │ D      │ 5.09 MiB   │
│ default  │ test_s3 │ S      │ 2.33 GiB   │
└──────────┴─────────┴────────┴────────────┘
```

## S3 Statistics of selects

```sql
select *, _part from test_s3 where A=100000000;
┌─────────A─┬─S─────────┬──────────D─┬─_part──────────────────┐
│ 100000000 │ 100000000 │ 2023-07-08 │ 20230708_106_111_1_738 │
└───────────┴───────────┴────────────┴────────────────────────┘
1 row in set. Elapsed: 0.104 sec. Processed 8.19 thousand rows, 65.56 KB (79.11 thousand rows/s., 633.07 KB/s.)

┌─S3GetObject─┬─S3PutObject─┬─ReadBufferFromS3─┬─WriteBufferFromS3─┐
│           6 │           0 │ 70.58 KiB        │ 0.00 B            │
└─────────────┴─────────────┴──────────────────┴───────────────────┘
```

Select by primary key read only 70.58 KiB from S3

Size of this part

```sql
SELECT
    database, table, column,
    formatReadableSize(sum(column_data_compressed_bytes) AS size) AS compressed
FROM system.parts_columns
WHERE (active = 1) AND (database LIKE '%') AND (table LIKE 'test_s3') AND (disk_name = 's3disk')
    and name = '20230708_106_111_1_738'
GROUP BY database, table, column ORDER BY column ASC

┌─database─┬─table───┬─column─┬─compressed─┐
│ default  │ test_s3 │ A      │ 22.51 MiB  │
│ default  │ test_s3 │ D      │ 51.47 KiB  │
│ default  │ test_s3 │ S      │ 23.52 MiB  │
└──────────┴─────────┴────────┴────────────┘
```

```sql
select * from test_s3 where S='100000000';
┌─────────A─┬─S─────────┬──────────D─┐
│ 100000000 │ 100000000 │ 2023-07-08 │
└───────────┴───────────┴────────────┘
1 row in set. Elapsed: 86.745 sec. Processed 700.00 million rows, 12.49 GB (8.07 million rows/s., 144.04 MB/s.)

┌─S3GetObject─┬─S3PutObject─┬─ReadBufferFromS3─┬─WriteBufferFromS3─┐
│         947 │           0 │ 2.36 GiB         │ 0.00 B            │
└─────────────┴─────────────┴──────────────────┴───────────────────┘
```
Select using fullscan of S column read only 2.36 GiB from S3, the whole S column (2.33 GiB) plus parts of A and D.


```

delete from test_s3 where A=100000000;
0 rows in set. Elapsed: 17.429 sec.

┌─q──┬─S3GetObject─┬─S3PutObject─┬─ReadBufferFromS3─┬─WriteBufferFromS3─┐
│ Q3 │        2981 │           6 │ 23.06 MiB        │ 27.25 KiB         │
└────┴─────────────┴─────────────┴──────────────────┴───────────────────┘

insert into test select 'Q3' q, event,value  from system.events where event like '%S3%';


delete from test_s3 where S='100000001';
0 rows in set. Elapsed: 31.417 sec.
┌─q──┬─S3GetObject─┬─S3PutObject─┬─ReadBufferFromS3─┬─WriteBufferFromS3─┐
│ Q4 │        4209 │           6 │ 2.39 GiB         │ 27.25 KiB         │
└────┴─────────────┴─────────────┴──────────────────┴───────────────────┘
insert into test select 'Q4' q, event,value  from system.events where event like '%S3%';



alter table test_s3 delete where A=110000000 settings mutations_sync=2;
0 rows in set. Elapsed: 19.521 sec.

┌─q──┬─S3GetObject─┬─S3PutObject─┬─ReadBufferFromS3─┬─WriteBufferFromS3─┐
│ Q5 │        2986 │          15 │ 42.27 MiB        │ 41.72 MiB         │
└────┴─────────────┴─────────────┴──────────────────┴───────────────────┘
insert into test select 'Q5' q, event,value  from system.events where event like '%S3%';


alter table test_s3 delete where S='110000001' settings mutations_sync=2;
0 rows in set. Elapsed: 29.650 sec.

┌─q──┬─S3GetObject─┬─S3PutObject─┬─ReadBufferFromS3─┬─WriteBufferFromS3─┐
│ Q6 │        4212 │          15 │ 2.42 GiB         │ 41.72 MiB         │
└────┴─────────────┴─────────────┴──────────────────┴───────────────────┘
insert into test select 'Q6' q, event,value  from system.events where event like '%S3%';
```
