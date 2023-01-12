---
title: "System tables ate my disk"
linkTitle: "System tables ate my disk"
description: >
    System tables ate my disk
---
> **Note 1:** System database stores virtual tables (**parts**, **tables,** **columns, etc.**) and \***_log** tables.
>
> Virtual tables do not persist on disk. They reflect ClickHouse memory (c++ structures). They cannot be changed or removed.
>
> Log tables are named with postfix \***_log** and have the MergeTree engine. Clickhouse does not use information stored in these tables, this data is for you only.
>
> You can drop / rename / truncate \***_log** tables at any time. ClickHouse will recreate them in about 7 seconds (flush period).

> **Note 2:** Log tables with numeric postfixes (_1 / 2 / 3 ...) `query_log_1 query_thread_log_3` are results of Clickhouse upgrades. When a new version of Clickhouse starts and discovers that a system log table's schema is incompatible with a new schema, then Clickhouse renames the old *_log table to the name with the prefix and creates a table with the new schema. You can drop such tables if you don't need such historic data.

## You can disable all / any of them

Do not create log tables at all (a restart is needed for these changes to take effect).

```markup
$ cat /etc/clickhouse-server/config.d/z_log_disable.xml
<?xml version="1.0"?>
<clickhouse>
    <asynchronous_metric_log remove="1"/>
    <metric_log remove="1"/>
    <query_thread_log remove="1" />  
    <query_log remove="1" />
    <query_views_log remove="1" />
    <part_log remove="1"/>
    <session_log remove="1"/>
    <text_log remove="1" />
    <trace_log remove="1"/>
    <crash_log remove="1"/>
    <opentelemetry_span_log remove="1"/>
    <zookeeper_log remove="1"/>
</clickhouse>
```

**We do not recommend removing `query_log` and `query_thread_log` as queries' (they have very useful information for debugging), and logging can be easily turned off without a restart through user profiles:**

```markup
$ cat /etc/clickhouse-server/users.d/z_log_queries.xml
<clickhouse>
    <profiles>
        <default>
            <log_queries>0</log_queries> <!-- normally it's better to keep it turned on! -->
            <log_query_threads>0</log_query_threads>
        </default>
    </profiles>
</clickhouse>
```

Hint: `z_log_disable.xml` is named with **z_** in the beginning, it means this config will be applied the last and will override all other config files with these sections (config are applied in alphabetical order).

You can also configure these settings to reduce the amount of data in the `system.query_log` table:

```markup
name                              | value       | description                                                                                                                                                       
----------------------------------+-------------+-------------------------------------------------------------------------------------------------------------------------------------------------------------------
log_queries_min_type              | QUERY_START | Minimal type in query_log to log, possible values (from low to high): QUERY_START, QUERY_FINISH, EXCEPTION_BEFORE_START, EXCEPTION_WHILE_PROCESSING.
log_queries_min_query_duration_ms | 0           | Minimal time for the query to run, to get to the query_log/query_thread_log.
log_queries_cut_to_length         | 100000      | If query length is greater than specified threshold (in bytes), then cut query when writing to query log. Also limit length of printed query in ordinary text log.
log_profile_events                | 1           | Log query performance statistics into the query_log and query_thread_log.
log_query_settings                | 1           | Log query settings into the query_log.
log_queries_probability           | 1           | Log queries with the specified probabality.
```

## You can configure TTL

Example for `query_log`. It drops partitions with data older than 14 days:

```markup
$ cat /etc/clickhouse-server/config.d/query_log_ttl.xml
<?xml version="1.0"?>
<clickhouse>
    <query_log>
        <database>system</database>
        <table>query_log</table>
        <engine>ENGINE = MergeTree PARTITION BY (event_date)
                ORDER BY (event_time)
                TTL event_date + INTERVAL 14 DAY DELETE
        </engine>
        <flush_interval_milliseconds>7500</flush_interval_milliseconds>
    </query_log>
</clickhouse>
```

After that you need to restart ClickHouse and drop or rename the existing system.query_log table, then CH creates a new table with these settings.

```sql
RENAME TABLE system.query_log TO system.query_log_1;
```

Important part here is a daily partitioning `PARTITION BY (event_date)` in this case TTL expression `event_date + INTERVAL 14 DAY DELETE` expires all rows at the same time. In this case ClickHouse drops whole partitions. Dropping of partitions is very easy operation for CPU / Disk I/O.

Usual TTL processing (when table partitioned by toYYYYMM and TTL by day) is heavy CPU / Disk I/O consuming operation which re-writes data parts without expired rows.

You can add TTL without ClickHouse restart (and table dropping or renaming):

```sql
ALTER TABLE system.query_log MODIFY TTL event_date + INTERVAL 14 DAY;
```

But in this case ClickHouse will drop only whole monthly partitions (will store data older than 14 days).

## One more way to configure TTL for system tables

This way just adds TTL to a table and leaves monthly (default) partitioning (will store data older than 14 days).

```markup
$ cat /etc/clickhouse-server/config.d/query_log_ttl.xml
<?xml version="1.0"?>
<clickhouse>
    <query_log>
        <database>system</database>
        <table>query_log</table>
        <ttl>event_date + INTERVAL 30 DAY DELETE</ttl>
    </query_log>
</clickhouse>
```

After that you need to restart ClickHouse and drop or rename the existing system.query_log table, then CH creates a new table with this TTL setting.

## You can disable logging on a session level or in user’s profile (for all or specific users)

But only for logs generated on session level (`query_log` / `query_thread_log`)

In this case a restart is not needed.

Let’s disable query logging for all users (profile = default, all other profiles inherit it).

```markup
cat /etc/clickhouse-server/users.d/log_queries.xml
<clickhouse>
    <profiles>
        <default>
            <log_queries>0</log_queries>
            <log_query_threads>0</log_query_threads>
        </default>
    </profiles>
</clickhouse>
```
