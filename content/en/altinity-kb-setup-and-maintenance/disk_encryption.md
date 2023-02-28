---
title: "Clickhouse data/disk encryption (at rest)"
linkTitle: "disk encryption"
weight: 100
description: >-
     Example how to encrypt data in tables using storage policies.
---

## Create folder

```
mkdir /data/clickhouse_encrypted
chown clickhouse.clickhouse /data/clickhouse_encrypted
```

## Configure encrypted disk and storage

* https://clickhouse.com/docs/en/operations/storing-data/#encrypted-virtual-file-system
* https://clickhouse.com/docs/en/operations/server-configuration-parameters/settings/#server-settings-encryption


```xml
cat /etc/clickhouse-server/config.d/encrypted_storage.xml
<clickhouse>
    <storage_configuration>
        <disks>
            <disk1>
                <type>local</type>
                <path>/data/clickhouse_encrypted/</path>
            </disk1>
            <encrypted_disk>
                <type>encrypted</type>
                <disk>disk1</disk>
                <path>encrypted/</path>
                <algorithm>AES_128_CTR</algorithm>
                <key_hex id="0">00112233445566778899aabbccddeeff</key_hex>
                <current_key_id>0</current_key_id>
            </encrypted_disk>
        </disks>
        <policies>
            <encrypted>
                <volumes>
                    <encrypted_volume>
                        <disk>encrypted_disk</disk>
                    </encrypted_volume>
                </volumes>
            </encrypted>
        </policies>
    </storage_configuration>
</clickhouse>
```

```bash
systemctl restart clickhouse-server
```

```sql
select name, path, type, is_encrypted from system.disks;
┌─name───────────┬─path──────────────────────────────────┬─type──┬─is_encrypted─┐
│ default        │ /var/lib/clickhouse/                  │ local │            0 │
│ disk1          │ /data/clickhouse_encrypted/           │ local │            0 │
│ encrypted_disk │ /data/clickhouse_encrypted/encrypted/ │ local │            1 │
└────────────────┴───────────────────────────────────────┴───────┴──────────────┘

select * from system.storage_policies;
┌─policy_name─┬─volume_name──────┬─volume_priority─┬─disks──────────────┬─volume_type─┬─max_data_part_size─┬─move_factor─┬─prefer_not_to_merge─┐
│ default     │ default          │               1 │ ['default']        │ JBOD        │                  0 │           0 │                   0 │
│ encrypted   │ encrypted_volume │               1 │ ['encrypted_disk'] │ JBOD        │                  0 │           0 │                   0 │
└─────────────┴──────────────────┴─────────────────┴────────────────────┴─────────────┴────────────────────┴─────────────┴─────────────────────┘
```

## Create table

```sql
CREATE TABLE bench_encrypted(c_int Int64, c_str varchar(255), c_float Float64) 
engine=MergeTree order by c_int
settings storage_policy = 'encrypted';
```

```bash
cat /data/clickhouse_encrypted/encrypted/store/906/9061167e-d5f7-45ea-8e54-eb6ba3b678dc/format_version.txt
ENC�AdruM�˪h"��^�
```

# Compare performance of encrypted and not encrypted tables

```sql
CREATE TABLE bench_encrypted(c_int Int64, c_str varchar(255), c_float Float64) 
engine=MergeTree order by c_int
settings storage_policy = 'encrypted';

insert into bench_encrypted
select toInt64(cityHash64(number)), lower(hex(MD5(toString(number)))), number/cityHash64(number)*10000000 
from numbers_mt(100000000);

0 rows in set. Elapsed: 33.357 sec. Processed 100.66 million rows, 805.28 MB (3.02 million rows/s., 24.14 MB/s.)


CREATE TABLE bench_unencrypted(c_int Int64, c_str varchar(255), c_float Float64) 
engine=MergeTree order by c_int;

insert into bench_unencrypted
select toInt64(cityHash64(number)), lower(hex(MD5(toString(number)))), number/cityHash64(number)*10000000 
from numbers_mt(100000000);

0 rows in set. Elapsed: 31.175 sec. Processed 100.66 million rows, 805.28 MB (3.23 million rows/s., 25.83 MB/s.)


select avg(c_float) from bench_encrypted;
1 row in set. Elapsed: 0.195 sec. Processed 100.00 million rows, 800.00 MB (511.66 million rows/s., 4.09 GB/s.)

select avg(c_float) from bench_unencrypted;
1 row in set. Elapsed: 0.150 sec. Processed 100.00 million rows, 800.00 MB (668.71 million rows/s., 5.35 GB/s.)


select sum(c_int) from bench_encrypted;
1 row in set. Elapsed: 0.281 sec. Processed 100.00 million rows, 800.00 MB (355.74 million rows/s., 2.85 GB/s.)

select sum(c_int) from bench_unencrypted;
1 row in set. Elapsed: 0.193 sec. Processed 100.00 million rows, 800.00 MB (518.88 million rows/s., 4.15 GB/s.)


set max_threads=1;

select avg(c_float) from bench_encrypted;
1 row in set. Elapsed: 0.934 sec. Processed 100.00 million rows, 800.00 MB (107.03 million rows/s., 856.23 MB/s.)

select avg(c_float) from bench_unencrypted;
1 row in set. Elapsed: 0.874 sec. Processed 100.00 million rows, 800.00 MB (114.42 million rows/s., 915.39 MB/s.)
```

## read key_hex from environment variable

* https://clickhouse.com/docs/en/operations/server-configuration-parameters/settings/#server-settings-encryption
* https://serverfault.com/questions/413397/how-to-set-environment-variable-in-systemd-service

```xml
cat /etc/clickhouse-server/config.d/encrypted_storage.xml
<clickhouse>
    <storage_configuration>
        <disks>
            <disk1>
                <type>local</type>
                <path>/data/clickhouse_encrypted/</path>
            </disk1>
            <encrypted_disk>
                <type>encrypted</type>
                <disk>disk1</disk>
                <path>encrypted/</path>
                <algorithm>AES_128_CTR</algorithm>
                <key_hex from_env="DiskKey"/>
            </encrypted_disk>
        </disks>
        <policies>
            <encrypted>
                <volumes>
                    <encrypted_volume>
                        <disk>encrypted_disk</disk>
                    </encrypted_volume>
                </volumes>
            </encrypted>
        </policies>
    </storage_configuration>
</clickhouse>

cat /etc/default/clickhouse-server
DiskKey=00112233445566778899aabbccddeeff
```

```bash
systemctl restart clickhouse-server
```

