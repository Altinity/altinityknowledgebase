---
title: "Exporting ClickHouse® query and session logs to files, S3, or HTTP"
linkTitle: "Export query and session logs"
weight: 100
description: >-
     Export system.query_log and system.session_log to files, S3, or HTTP while retaining local system log tables.
keywords:
  - clickhouse audit log
  - clickhouse query_log export
  - clickhouse session_log
---

`system.query_log` and `system.session_log` are tables, not log files, so shipping them to S3, an HTTP collector, or a SIEM means exporting the table.

Keep the local system log and attach a materialized view (MV) that writes to an external target. Do not replace the system log engine itself unless you accept losing the local copy — see [Direct external engine](#direct-external-engine).

Tested on 26.7.5.10, 26.4.5.143, 26.3.21.7 (LTS), 25.8.32.4 and 24.10.1.2812 against MinIO.

{{% alert title="Warning" color="warning" %}}
A **broken S3 export deletes rows from your local `system.query_log`.** The failing insert kills the whole flush, and failed flushes are never retried. Measured on 26.7.5.10: with a working target 20 of 20 test queries were logged locally; with a misconfigured S3 target only **1 of 20**; with an unreachable S3 endpoint **0 of 10**. Same on 26.3 and 25.8.

`URL` targets do not have this problem — a dead collector loses nothing locally (25.8+).
{{% /alert %}}

## Before you start

`system.session_log` is disabled by default. Enable it, then restart:

```xml
<clickhouse>
    <session_log>
        <database>system</database>
        <table>session_log</table>
        <partition_by>toYYYYMM(event_date)</partition_by>
        <flush_interval_milliseconds>7500</flush_interval_milliseconds>
    </session_log>
</clickhouse>
```

Create the MV only after the system log table exists — on a fresh server it appears at the first flush, so run `SYSTEM FLUSH LOGS` once, or the DDL fails with `UNKNOWN_TABLE`.

Also confirm the audited users have `log_queries=1` and `log_queries_probability=1`.

## Export to S3

S3 objects cannot be appended, so each flush must create a new object. `s3_create_new_file_on_insert=1` does that — but **only from a settings profile**:

```xml
<!-- /etc/clickhouse-server/users.d/audit-export.xml -->
<clickhouse>
    <profiles>
        <default>
            <s3_create_new_file_on_insert>1</s3_create_new_file_on_insert>
        </default>
    </profiles>
</clickhouse>
```

{{% alert title="Warning" color="warning" %}}
Putting this setting anywhere else silently fails and triggers the data loss above:

* `CREATE TABLE ... ENGINE = S3(...) SETTINGS s3_create_new_file_on_insert = 1` — dropped without error, absent from `SHOW CREATE TABLE`.
* `CREATE MATERIALIZED VIEW ... SETTINGS s3_create_new_file_on_insert = 1` — kept in `SHOW CREATE TABLE`, but ignored for the write into the target.

The setting is a profile-wide default, so it affects other S3 inserts by users on that profile. Do not use `s3_truncate_on_insert` instead — it overwrites the previous object.
{{% /alert %}}

Keep credentials in a named collection:

```xml
<clickhouse>
    <named_collections>
        <audit_s3>
            <url>https://audit-bucket.s3.example.com/clickhouse/</url>
            <access_key_id>...</access_key_id>
            <secret_access_key>...</secret_access_key>
        </audit_s3>
    </named_collections>
</clickhouse>
```

Export a fixed column list rather than `SELECT *` — system log schemas change between releases. Replace `NODE_ID` with a per-server value.

```sql
CREATE DATABASE IF NOT EXISTS audit;

CREATE TABLE audit.query_log_s3
(
    hostname String, type String, event_time_microseconds DateTime64(6),
    query_id String, initial_query_id String, is_initial_query UInt8,
    user String, address String, query String,
    exception_code Int32, exception String
)
ENGINE = S3(audit_s3, filename = 'NODE_ID/query-log.ndjson', format = 'JSONEachRow');

CREATE MATERIALIZED VIEW audit.query_log_to_s3 TO audit.query_log_s3
AS SELECT
    toString(hostname) AS hostname, toString(type) AS type, event_time_microseconds,
    query_id, initial_query_id, is_initial_query,
    user, toString(address) AS address, query, exception_code, exception
FROM system.query_log;
```

Each flush adds an object: `query-log.ndjson`, `query-log.1.ndjson`, `query-log.2.ndjson`, ... Read them back with a glob:

```sql
SELECT count() FROM s3(audit_s3, filename = 'NODE_ID/query-log*',
                       format = 'JSONEachRow', structure = 'query String, type String');
```

{{% alert title="Warning" color="warning" %}}
Never point two servers at the same object name. Concurrent writers on one key sequence lose rows silently: two servers made 300 inserts, all acknowledged with no errors, and left only 267 objects ([issue #112419](https://github.com/ClickHouse/ClickHouse/issues/112419), open as of 26.7.5.10). Give every server its own prefix.
{{% /alert %}}

### Session log

```sql
CREATE TABLE audit.session_log_s3
(
    hostname String, type String, event_time_microseconds DateTime64(6),
    user String, auth_type String, client_address String, client_port UInt16,
    interface String, failure_reason String
)
ENGINE = S3(audit_s3, filename = 'NODE_ID/session-log.ndjson', format = 'JSONEachRow');

CREATE MATERIALIZED VIEW audit.session_log_to_s3 TO audit.session_log_s3
AS SELECT
    toString(hostname) AS hostname, toString(type) AS type, event_time_microseconds,
    ifNull(user, '') AS user, ifNull(toString(auth_type), '') AS auth_type,
    toString(client_address) AS client_address, client_port,
    toString(interface) AS interface, failure_reason
FROM system.session_log;
```

Exports `LoginSuccess`, `LoginFailure` and `Logout`. Keep the `ifNull()` calls — `user` and `auth_type` are `Nullable`, and a `NULL` reaching a non-`Nullable` column drops that row from the export without any error.

## Export to HTTP

The `URL` engine turns each flush into a `POST`; the collector must accept chunked transfer encoding.

```sql
CREATE TABLE audit.query_log_url (query String, type String, event_time_microseconds DateTime64(6))
ENGINE = URL('https://audit-collector.example/clickhouse/query-log', 'JSONEachRow');

CREATE MATERIALIZED VIEW audit.query_log_to_url TO audit.query_log_url
AS SELECT query, toString(type) AS type, event_time_microseconds FROM system.query_log;
```

Delivery is best effort: if the collector is down those rows never arrive, but the local table is unaffected on 25.8 and later. On older lines confirm the release contains [PR #75679](https://github.com/ClickHouse/ClickHouse/pull/75679) (24.12.6.70, 25.1.6.34, 25.2.1.3085+) — without it a dead collector also wipes local rows.

## Export to a file

The `File` engine only writes inside `/var/lib/clickhouse/user_files` — any other path is rejected with `DATABASE_ACCESS_DENIED`. With no path at all it writes to an unpredictable UUID directory, so always give one:

```sql
CREATE TABLE audit.query_log_file (query String, type String, event_time_microseconds DateTime64(6))
ENGINE = File(JSONEachRow, '/var/lib/clickhouse/user_files/query-audit.jsonl');

CREATE MATERIALIZED VIEW audit.query_log_to_file TO audit.query_log_file
AS SELECT query, toString(type) AS type, event_time_microseconds FROM system.query_log;
```

Point Filebeat or Fluent Bit at that file. ClickHouse never rotates it — rotation is up to you.

## Monitoring

Any non-zero value means log rows were lost and will not come back:

```sql
SELECT value FROM system.events WHERE event = 'SystemLogErrorOnFlush';
```

An empty result is healthy. The event exists from 25.2 onwards. Its built-in description says failed flushes are repeated — they are not.

## Check the export after every upgrade

When an upgrade changes the log schema, ClickHouse renames `system.query_log` to `query_log_0` and creates a new table. **The MV stays attached to the renamed table and the export stops** — with no error, and `SHOW CREATE TABLE` still showing `FROM system.query_log`.

```sql
SELECT name, dependencies_table
FROM system.tables
WHERE database = 'system' AND name LIKE 'query_log%';
```

Broken — the dependency sits on the old table:

```text
query_log       []
query_log_0     ['query_log_to_s3']
```

Fix by recreating the view:

```sql
DROP TABLE audit.query_log_to_s3;
CREATE MATERIALIZED VIEW audit.query_log_to_s3 TO audit.query_log_s3 AS SELECT ... FROM system.query_log;
```

## Direct external engine

The system log can use an external engine directly, dropping the local MergeTree copy entirely. A flush that fails is not retried, so any outage becomes a permanent gap in the audit trail — with a dead S3 endpoint, 14 of 16 rows were lost and never reappeared after recovery. Prefer the MV pattern.

S3-backed system logs need `skip_alias_columns`, added in **26.4**. Earlier versions ignore the setting silently and every flush fails with `Special columns like MATERIALIZED, ALIAS or EPHEMERAL are not supported for s3 storage`.

```xml
<clickhouse>
    <default_system_log_flush_policy>
        <skip_alias_columns>true</skip_alias_columns>
    </default_system_log_flush_policy>

    <query_log replace="replace">
        <database>system</database>
        <table>query_log</table>
        <engine>ENGINE = S3(audit_s3, filename = 'NODE_ID/query-log.ndjson', format = 'JSONEachRow')</engine>
        <flush_interval_milliseconds>7500</flush_interval_milliseconds>
    </query_log>
</clickhouse>
```

`replace="replace"` is required, otherwise this merges with the shipped `<query_log>` section. Never combine `<engine>` with `<partition_by>`, `<order_by>` or `<ttl>` — **the server refuses to start**; put those clauses inside the engine expression.

## Version notes

| Version | Behavior |
|---|---|
| 24.12.6.70, 25.1.6.34, 25.2.1.3085+ | Contain PR #75679. Earlier releases lose local rows when a `URL` target is unreachable. |
| 25.2+ | `SystemLogErrorOnFlush` available. |
| 26.4+ | `skip_alias_columns` available, required for S3-backed system logs. |
| Open as of 26.7.5.10 | Issue #112419 — concurrent writers on one S3 key lose rows silently. |

## Related resources

- [System tables eat my disk](/altinity-kb-setup-and-maintenance/altinity-kb-system-tables-eat-my-disk/) — retention and TTL for the local system log tables.
- [Logging](/altinity-kb-setup-and-maintenance/logging/) — the server text log files, a separate concern.
- [S3 table engine](https://clickhouse.com/docs/reference/engines/table-engines/integrations/s3), [URL table engine](https://clickhouse.com/docs/reference/engines/table-engines/special/url), [File table engine](https://clickhouse.com/docs/reference/engines/table-engines/special/file), [Named collections](https://clickhouse.com/docs/concepts/features/configuration/server-config/named-collections)
- [`system.query_log`](https://clickhouse.com/docs/reference/system-tables/query_log), [`system.session_log`](https://clickhouse.com/docs/reference/system-tables/session_log)
