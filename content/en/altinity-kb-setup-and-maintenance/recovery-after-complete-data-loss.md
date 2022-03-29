---
title: "recovery-after-complete-data-loss"
linkTitle: "recovery-after-complete-data-loss"
weight: 100
description: >-
     Recovery after complete data loss 
---

# Atomic & Ordinary databases.

srv1 -- good replica

srv2 -- lost replica / we will restore it from srv1

## test data (3 tables (atomic & ordinary databases))

srv1

```sql
create database testatomic on cluster '{cluster}' engine=Atomic;
create table testatomic.test on cluster '{cluster}' (A Int64, D Date, s String)
Engine = ReplicatedMergeTree('/clickhouse/{cluster}/tables/{database}/{table}','{replica}')
partition by toYYYYMM(D)
order by A;
insert into testatomic.test select number, today(), '' from numbers(1000000);


create database testordinary on cluster '{cluster}' engine=Ordinary;
create table testordinary.test on cluster '{cluster}' (A Int64, D Date, s String)
Engine = ReplicatedMergeTree('/clickhouse/{cluster}/tables/{database}/{table}','{replica}')
partition by toYYYYMM(D)
order by A;
insert into testordinary.test select number, today(), '' from numbers(1000000);


create table default.test on cluster '{cluster}' (A Int64, D Date, s String)
Engine = ReplicatedMergeTree('/clickhouse/{cluster}/tables/{database}/{table}','{replica}')
partition by toYYYYMM(D)
order by A;
insert into default.test select number, today(), '' from numbers(1000000);
```

## destroy srv2

srv2

```
/etc/init.d/clickhouse-server stop
rm -rf /var/lib/clickhouse/*
```

## generate script to re-create databases (create_database.sql).

srv1

```sql
$ cat /home/ubuntu/generate_schema.sql
SELECT concat('CREATE DATABASE "', name, '" ENGINE = ', engine, ' COMMENT \'', comment, '\';')
FROM system.databases
WHERE name NOT IN ('INFORMATION_SCHEMA', 'information_schema', 'system', 'default');

clickhouse-client < /home/denis.zhuravlev/generate_schema.sql > create_database.sql
```

check the result
```bash
$ cat create_database.sql
CREATE DATABASE "testatomic" ENGINE = Atomic COMMENT '';
CREATE DATABASE "testordinary" ENGINE = Ordinary COMMENT '';
```

transfer this create_database.sql to srv2 (scp / rsync)

## make a copy of schema sql files (metadata_schema.tar)

srv1

```bash
cd /var/lib/clickhouse/
tar -cvhf /home/ubuntu/metadata_schema.tar metadata
```
`-h` - is important! (-h, --dereference Follow symlinks; archive and dump the files they point to.)

transfer this metadata_schema.tar to srv2 (scp / rsync)

## create databases at srv2

srv2

```bash
/etc/init.d/clickhouse-server start
clickhouse-client < create_database.sql
/etc/init.d/clickhouse-server stop
```

## create tables at srv2

srv2

```bash
cd /var/lib/clickhouse/
tar xkfv /home/ubuntu/metadata_schema.tar
sudo -u clickhouse touch /var/lib/clickhouse/flags/force_restore_data
/etc/init.d/clickhouse-server start
```

`tar xkfv` `-k` is important! To save folders/symlinks created with create database ( -k, --keep-old-files Don't replace existing files when extracting )

## check a recovery

srv2

```sql
SELECT count() FROM testatomic.test;
┌─count()─┐
│ 1000000 │
└─────────┘

SELECT count() FROM testordinary.test;
┌─count()─┐
│ 1000000 │
└─────────┘

SELECT count() FROM default.test;
┌─count()─┐
│ 1000000 │
└─────────┘
```
