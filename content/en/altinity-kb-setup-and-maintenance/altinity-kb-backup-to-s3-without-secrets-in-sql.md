---
title: "ClickHouse® BACKUP to S3 without credentials in SQL"
linkTitle: "BACKUP to S3 without credentials in SQL"
description: >
    Keep S3 keys out of ClickHouse® BACKUP and RESTORE statements with a named collection or a backup disk, and grant a backup user only what it needs.
keywords:
  - backup
  - s3
  - named collection
  - credentials
---

The documented form of a native ClickHouse® backup to S3 puts the keys in the statement:

```sql
BACKUP TABLE db.events TO S3('https://bucket.s3.amazonaws.com/backups/events', '<access_key_id>', '<secret_access_key>');
```

The server hides the secret in `system.query_log` and its own logs, but the literal statement still sits wherever it was written: the backup script, a CronJob spec, CI configuration, shell history, or the process list when it is passed with `clickhouse-client --query`. Move the keys into server configuration instead, so backup statements carry only a name.

## Option 1: named collection in server config

Works with `BACKUP`/`RESTORE ... S3(...)` on every version tested (24.8, 25.3, 25.8, 26.3, 26.8, 26.10, and Altinity Stable 25.3).

```xml
<!-- /etc/clickhouse-server/config.d/s3_backups.xml -->
<clickhouse>
  <named_collections>
    <s3_backups>
      <url>https://bucket.s3.amazonaws.com/backups/</url>
      <access_key_id from_env="S3_BACKUP_ACCESS_KEY_ID"/>
      <secret_access_key from_env="S3_BACKUP_SECRET_ACCESS_KEY"/>
    </s3_backups>
  </named_collections>
</clickhouse>
```

`from_env` reads the value from the server's environment, so the file itself holds no secret. On Kubernetes, set the two variables from a Secret in the pod template.

```sql
BACKUP TABLE db.events TO S3(s3_backups, 'events/2026-11-17');

-- incremental, based on the previous backup
BACKUP TABLE db.events TO S3(s3_backups, 'events/2026-11-18')
SETTINGS base_backup = S3(s3_backups, 'events/2026-11-17');

RESTORE TABLE db.events AS db.events_restored FROM S3(s3_backups, 'events/2026-11-18');
```

The second argument is appended to the collection's `url`.

SQL-defined collections (`CREATE NAMED COLLECTION`) work in `BACKUP`/`RESTORE` only from 26.1, backported to 25.8.16, 25.10.6, 25.11.8 and 25.12.5 ([#94605](https://github.com/ClickHouse/ClickHouse/pull/94605)). On older versions use the config file, and avoid the SQL form anyway if the goal is keeping the key out of statements: `CREATE NAMED COLLECTION` contains it.

## Option 2: backup disk

Declare an S3 disk and allow it as a backup destination:

```xml
<clickhouse>
  <storage_configuration>
    <disks>
      <backups_s3>
        <type>s3</type>
        <endpoint>https://bucket.s3.amazonaws.com/backups/disk/</endpoint>
        <access_key_id from_env="S3_BACKUP_ACCESS_KEY_ID"/>
        <secret_access_key from_env="S3_BACKUP_SECRET_ACCESS_KEY"/>
      </backups_s3>
    </disks>
  </storage_configuration>
  <backups>
    <allowed_disk>backups_s3</allowed_disk>
  </backups>
</clickhouse>
```

```sql
BACKUP TABLE db.events TO Disk('backups_s3', 'events/2026-11-17');
RESTORE TABLE db.events AS db.events_restored FROM Disk('backups_s3', 'events/2026-11-17');
```

Use a disk when several tools or users must share one destination; use a named collection when you need several buckets or prefixes, since one collection can be overridden per statement (for example `S3(s3_backups, url = '...')`).

## Grants for a dedicated backup user

The privileges a user with `BACKUP` needs changed twice. Tested with a user holding only `BACKUP, SELECT ON db.*`:

| Version | Named collection destination | `Disk()` destination |
|---|---|---|
| 25.3 – 25.7 | nothing more | nothing more |
| 25.8 – 26.3 | `NAMED COLLECTION ON s3_backups` | nothing more |
| 26.8 LTS and later | `NAMED COLLECTION ON s3_backups` and `WRITE ON S3` | `WRITE ON DISK` |

For 26.8 and later:

```sql
GRANT BACKUP, SELECT ON db.* TO backup_user;
GRANT NAMED COLLECTION ON s3_backups TO backup_user;
GRANT WRITE ON S3 TO backup_user;   -- WRITE ON DISK for Disk()

GRANT CREATE TABLE, INSERT ON db.* TO restore_user;
GRANT NAMED COLLECTION ON s3_backups TO restore_user;
GRANT READ ON S3 TO restore_user;   -- READ ON DISK for Disk()
```

`WRITE`/`READ ON S3` come from [#114405](https://github.com/ClickHouse/ClickHouse/pull/114405) and `ON DISK` from [#117406](https://github.com/ClickHouse/ClickHouse/pull/117406). Before upgrading to 26.8, add these grants first, or scheduled backups fail with `ACCESS_DENIED`.

## Validation

```sql
SELECT name, collection FROM system.named_collections WHERE name = 's3_backups';
```

The values show as `[HIDDEN]`.

```sql
SELECT status, error, start_time, end_time
FROM system.backups
ORDER BY start_time DESC
LIMIT 5;
```

A backup is only proven by a restore. Restore into a new table or a separate server and compare row counts or a checksum such as `SELECT count(), sum(cityHash64(*)) FROM db.events`.

## Related resources

- [Backup and restore (ClickHouse docs)](https://clickhouse.com/docs/concepts/features/backup-restore/overview)
- [Named collections (ClickHouse docs)](https://clickhouse.com/docs/concepts/features/configuration/server-config/named-collections)
- [Altinity Backup for ClickHouse®](/altinity-kb-setup-and-maintenance/clickhouse-backup/)
