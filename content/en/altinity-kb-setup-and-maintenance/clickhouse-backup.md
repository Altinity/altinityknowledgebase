---
title: "clickhouse-backup"
linkTitle: "clickhouse-backup"
description: >
    clickhouse-backup + backblaze
---
### Installation and configuration

Download the latest `clickhouse-backup.tar.gz` from assets from [https://github.com/AlexAkulov/clickhouse-backup/releases](https://github.com/AlexAkulov/clickhouse-backup/releases)

This tar.gz contains a single binary of `clickhouse-backup` and an example of config file.

Backblaze has s3 compatible API but requires empty acl parameter `acl: ""`.

[https://www.backblaze.com/](https://www.backblaze.com/) has 15 days and free 10Gb S3 trial.

```bash
$ mkdir clickhouse-backup
$ cd clickhouse-backup
$ wget https://github.com/AlexAkulov/clickhouse-backup/releases/download/2.2.0/clickhouse-backup.tar.gz
$ tar zxf clickhouse-backup.tar.gz
$ rm clickhouse-backup.tar.gz
$ cat config.yml
```
```yaml
general:
  remote_storage: s3
  max_file_size: 1099511627776
  disable_progress_bar: false
  backups_to_keep_local: 0
  backups_to_keep_remote: 0
  log_level: info
  allow_empty_backups: false
clickhouse:
  username: default
  password: ""
  host: localhost
  port: 9000
  disk_mapping: {}
  skip_tables:
  - system.*
  timeout: 5m
  freeze_by_part: false
  secure: false
  skip_verify: false
  sync_replicated_tables: true
  log_sql_queries: false
s3:
  access_key: 0****1
  secret_key: K****1
  bucket: "mybucket"
  endpoint: https://s3.us-west-000.backblazeb2.com
  region: us-west-000
  acl: ""
  force_path_style: false
  path: clickhouse-backup
  disable_ssl: false
  part_size: 536870912
  compression_level: 1
  compression_format: tar
  sse: ""
  disable_cert_verification: false
  storage_class: STANDARD
```

I have a database `test` with table `test`

```sql
select count() from test.test;

┌─count()─┐
│  400000 │
└─────────┘
```

clickhouse-backup list should work without errors (it scans local and remote (s3) folders):

```bash
$ sudo ./clickhouse-backup list -c config.yml
$
```

### Backup

* create a local backup of database test
* upload this backup to remote
* remove the local backup
* drop the source database

```bash
$ sudo ./clickhouse-backup create --tables='test.*' bkp01 -c config.yml
2021/05/31 23:11:13  info done   backup=bkp01 operation=create table=test.test
2021/05/31 23:11:13  info done   backup=bkp01 operation=create

$ sudo ./clickhouse-backup upload bkp01 -c config.yml
 1.44 MiB / 1.44 MiB [=====================] 100.00% 2s
2021/05/31 23:12:13  info done   backup=bkp01 operation=upload table=test.test
2021/05/31 23:12:17  info done   backup=bkp01 operation=upload

$ sudo ./clickhouse-backup list -c config.yml
bkp01   1.44MiB   31/05/2021 23:11:13   local
bkp01   1.44MiB   31/05/2021 23:11:13   remote      tar

$ sudo ./clickhouse-backup delete local bkp01 -c config.yml
2021/05/31 23:13:29  info delete 'bkp01'
```

```sql
DROP DATABASE test;
```

### Restore

* download the remote backup
* restore database

```bash
$ sudo ./clickhouse-backup list -c config.yml
bkp01   1.44MiB   31/05/2021 23:11:13   remote      tar

$ sudo ./clickhouse-backup download bkp01 -c config.yml
2021/05/31 23:14:41  info done    backup=bkp01 operation=download table=test.test
 1.47 MiB / 1.47 MiB [=====================] 100.00% 0s
2021/05/31 23:14:43  info done    backup=bkp01 operation=download table=test.test
2021/05/31 23:14:43  info done    backup=bkp01 operation=download

$ sudo ./clickhouse-backup restore bkp01 -c config.yml
2021/05/31 23:16:04  info done    backup=bkp01 operation=restore table=test.test
2021/05/31 23:16:04  info done    backup=bkp01 operation=restore
```

```sql
SELECT count() FROM test.test;
┌─count()─┐
│  400000 │
└─────────┘
```

### Delete backups

```bash
$ sudo ./clickhouse-backup delete local bkp01 -c config.yml
2021/05/31 23:17:05  info delete 'bkp01'

$ sudo ./clickhouse-backup delete remote bkp01 -c config.yml
```
