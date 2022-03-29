---
title: "recovery-after-complete-data-loss"
linkTitle: "recovery-after-complete-data-loss"
weight: 100
description: >-
     Recovery after complete data loss 
---

# Atomic & Ordinary databases.

srv1 -- good replica
srv2 -- lost replica / will restore it from srv1


## generate script which will recteate databases (create_database.sql).
srv1:
```sql
SELECT concat('ATTACH DATABASE "', name, '" UUID \'', toString(uuid), '\' ENGINE = ', engine, ' COMMENT \'', comment, '\';')
FROM system.databases
WHERE name NOT IN ('INFORMATION_SCHEMA', 'information_schema', 'system');

┌─concat('ATTACH DATABASE "', name, '" UUID \'', toString(uuid), '\' ENGINE = ', engine, ' COMMENT \'', comment, '\';')─┐
│ ATTACH DATABASE "default" UUID '7d660319-f56a-4b83-a1af-b84d88383710' ENGINE = Atomic COMMENT '';                     │
│ ATTACH DATABASE "test" UUID '9f2c5841-21f6-42e9-9f5a-cf477455876b' ENGINE = Atomic COMMENT '';                        │
└───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

transfer this create_database.sql to srv2 (scp / rsync)

## make a copy of schema sql files (metadata_schema.tar)
srv1:
```bash
cd /var/lib/clickhouse/
tar -cvhf /home/ubuntu/metadata_schema.tar metadata
```
`-h` - is important!

transfer this metadata_schema.tar to srv2 (scp / rsync)

## create databases at srv2

start service `/etc/init.d/clickhouse-server start` at empty srv2 server.

```sql
drop database default;
```
need to drop default database to create it back with UUID from srv1.

```bash
clickhouse-client < create_database.sql
/etc/init.d/clickhouse-server stop
```

## create tables at srv2

```bash
cd /var/lib/clickhouse/
tar xkfv /home/ubuntur/metadata_schema.tar
sudo -u clickhouse touch /var/lib/clickhouse/flags/force_restore_data
/etc/init.d/clickhouse-server start
```

`tar xkfv` `-k` is important to save folders/symlinks created with create database.
