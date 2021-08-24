---
title: "MySQL8 source for dictionaries"
linkTitle: "MySQL8 source for dictionaries"
description: >
    MySQL8 source for dictionaries
---
#### Authorization

MySQL8 used default authorization plugin `caching_sha2_password`. Unfortunately, `libmysql` which currently used (21.4-) in clickhouse is not.

You can fix it during create custom user with `mysql_native_password` authentication plugin.

```sql
CREATE USER IF NOT EXISTS 'clickhouse'@'%'
IDENTIFIED WITH mysql_native_password BY 'clickhouse_user_password';

CREATE DATABASE IF NOT EXISTS test;

GRANT ALL PRIVILEGES ON test.* TO 'clickhouse'@'%';
```

#### Table schema changes

As an example, in ClickHouse, run `SHOW TABLE STATUS LIKE 'table_name'` and try to figure out was table schema changed or not from MySQL response field `Update_time`.

By default, to properly data loading from MySQL8 source to dictionaries, please turn off the `information_schema` cache.

You can change default behavior with create `/etc/mysql/conf.d/information_schema_cache.cnf`with following content:

```ini
[mysqld]
information_schema_stats_expiry=0
```

Or setup it via SQL query:

```sql
SET GLOBAL information_schema_stats_expiry=0;
```
