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

ClickHouse® records query activity in `system.query_log` and authentication activity in `system.session_log`. There is no separate "audit log file" switch for these structured logs — they are system tables, not files. Getting them into S3, an HTTP collector, or a SIEM therefore means exporting the tables.

There are two ways to do it:

1. keep the normal local system log table and attach an incremental materialized view (MV) that sends each flushed block to an external target; or
2. replace the system log table engine with an external engine such as `S3` or `URL`.

**Use the first pattern.** It keeps a local queryable copy. But it is not free of risk either: a broken export can destroy local log data, for reasons explained below.

Everything here was tested on 26.7.5.10, 26.4.5.143, 26.3.21.7 (LTS), 25.8.32.4, and 24.10.1.2812 against MinIO and a local HTTP collector. Observed object names, paths, and error text are pasted verbatim.

{{% alert title="Warning" color="warning" %}}
A materialized view pointing at an `S3` target can permanently delete rows from your local `system.query_log`. This is not theoretical: with a misconfigured S3 target, **1 of 20 test queries survived** in the local table; with an unreachable S3 endpoint, **0 of 10**. See [When the export destroys the local log](#when-the-export-destroys-the-local-log) before deploying this pattern.
{{% /alert %}}

## How system log flushing works

System logs are buffered in memory and flushed to their system tables in batches. For `query_log` the default `flush_interval_milliseconds` is 7500 ms; size thresholds can trigger an earlier flush, and `SYSTEM FLUSH LOGS` forces one.

Two properties of the flush loop matter for auditing:

- A system-log table can be given a full table `engine` expression in the server config. By default the persistent system logs use `MergeTree`.
- **A failed flush is not retried.** There is no retry mechanism at all — not one that gets skipped on error. `SystemLogQueue::pop()` detaches the batch from the queue before the flush is attempted (`result.logs.swap(queue)` after `queue_front_index += queue_size`, in [`SystemLogBase.cpp`](https://github.com/ClickHouse/ClickHouse/blob/master/src/Common/SystemLogBase.cpp)), so those rows are already unrecoverable by the time the insert runs. `SystemLog<T>::flushImpl` then catches any exception, increments `SystemLogErrorOnFlush`, and logs `Failed to flush system log ...`; `queue->confirm()` afterwards only advances the counter that `SYSTEM FLUSH LOGS` waits on. A batch that fails to flush is simply gone.

For query auditing, also check the effective settings for the audited users: `log_queries=1` enables query logging and `log_queries_probability=1` avoids sampling.

`system.session_log` is **off by default** in self-managed ClickHouse. Verified on 26.7.5.10 and 25.8.32.4: without the config section, `EXISTS TABLE system.session_log` returns `0`. Enable it before relying on it:

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

## Recommended pattern: local system log plus materialized view

```text
query/session event
      |
      v
system-log in-memory buffer
      |
      | flush interval / size threshold
      v
system.query_log or system.session_log  (local MergeTree)
      |
      | incremental materialized view
      v
external target (S3 / HTTP / file)
```

The MV must be created **after** the system log table exists. On a freshly started server the table is created only on the first flush, and the MV DDL fails:

```text
Code: 60. DB::Exception: Unknown table expression identifier 'system.query_log'
in scope SELECT ... FROM system.query_log. (UNKNOWN_TABLE)
```

Run `SYSTEM FLUSH LOGS` once first.

### When the export destroys the local log

Since 23.3 the system-log flush sets `materialized_views_ignore_errors=true`, and this is usually described as making MV export failures harmless to the local table. That is the stated intent — the setting is applied with the comment *"We always want to deliver the data to the original table regardless of the MVs"* — but it is only half true, and the half that is false loses data.

`materialized_views_ignore_errors` covers exceptions thrown while **pushing rows** through an already-built view chain. It does not cover exceptions thrown while **building the target sink**. The S3 sink checks whether the destination object already exists at construction time, so its errors are raised early and escape the guard. The captured stack trace on 26.7.5.10 is:

```text
DB::checkAndGetNewFileOnInsertIfNeeded(...)
DB::StorageObjectStorage::write(...)
DB::InsertDependenciesBuilder::createSink(...)
DB::InsertDependenciesBuilder::createPostSink(...)
DB::InterpreterInsertQuery::execute()
```

The exception therefore fails the whole system-log flush, and because a failed flush is not retried, the batch never reaches the local `MergeTree` table either.

Measured on 26.7.5.10, 20 marker queries with one flush each:

| MV target state | Markers surviving in local `system.query_log` |
|---|---|
| No MV at all (control) | 20 / 20 |
| MV to a working S3 target (control) | 20 / 20 |
| MV to S3, `s3_create_new_file_on_insert` not effective | **1 / 20** |
| MV to S3, endpoint unreachable | **0 / 10** |

The same loss reproduces on 26.3.21.7 and 25.8.32.4. `SystemLogErrorOnFlush` incremented on every failed flush, and the server log shows:

```text
<Error> ... SystemLog<DB::QueryLogElement>::flushImpl(...): Failed to flush system log
system.query_log with 2 entries up to offset 14: Code: 36. DB::Exception: Object in bucket
audit with key node-a/query-log.ndjson already exists. If you want to overwrite it, enable
setting s3_truncate_on_insert, if you want to create a new file on each insert, enable
setting s3_create_new_file_on_insert. (BAD_ARGUMENTS)
```

`URL` targets behave differently and better. With the collector returning HTTP 503, and again with the collector refusing connections, all 10 of 10 markers survived locally on 26.7.5.10, 26.3.21.7, and 25.8.32.4, and `SystemLogErrorOnFlush` stayed at 0 — those errors occur at row-push time and are correctly ignored. The rows were simply absent from the collector, which is the intended best-effort behavior.

On 24.10.1.2812, which predates [PR #75679](https://github.com/ClickHouse/ClickHouse/pull/75679), the same connection-refused test left **0 of 10** markers in the local table — every batch was lost — with the exception escaping through `DB::buildPushingToViewsChain(...)`. The fix was backported to 24.12.6.70 and 25.1.6.34 and is in 25.2.1.3085 and later.

{{% alert title="Warning" color="warning" %}}
Before enabling an S3-backed MV export in production, verify the target actually accepts a second insert. Test it, confirm `SystemLogErrorOnFlush` stays at zero, and monitor it afterwards. An export that starts failing silently takes your local query history with it.
{{% /alert %}}

```sql
SELECT value
FROM system.events
WHERE event = 'SystemLogErrorOnFlush';
```

An empty result means the event has never incremented, which is the healthy state. The event was added in **25.2** ([PR #75466](https://github.com/ClickHouse/ClickHouse/pull/75466); the changelog lists it under 25.3, since changelogs are written after the tag is cut). On earlier releases this query returns no row regardless of health — verified absent in 24.10.1.2812, present in 25.8.32.4.

{{% alert title="Note" color="info" %}}
The event's own description in `system.events` reads *"Number of times any of the system logs have failed to flush to the corresponding system table. Attempts to flush are repeated."* The final sentence is wrong for this path: the failed batch is never re-flushed. Do not treat a non-zero value as a transient condition that will resolve itself — every increment is lost log data.
{{% /alert %}}

## Example: export query logs to S3 as JSONEachRow

Two settings decisions have to be right, and the obvious placements for one of them do not work.

S3 objects are not appendable. The S3 engine refuses an insert into an object that already exists, so every flush after the first fails unless `s3_create_new_file_on_insert=1` makes each insert create a new object with a numeric suffix.

That setting must be applied **in a settings profile**, in `users.d`. Verified on 26.7.5.10:

- `CREATE TABLE ... ENGINE = S3(...) SETTINGS s3_create_new_file_on_insert = 1` — the clause is **silently dropped**. It does not appear in `SHOW CREATE TABLE`, and the second flush fails.
- `CREATE MATERIALIZED VIEW ... AS SELECT ... SETTINGS s3_create_new_file_on_insert = 1` — the clause is preserved in `SHOW CREATE TABLE` but has **no effect** on the write into the target table. The second flush still fails. The MV `SETTINGS` clause applies to the view's `SELECT`, not to the insert into its target.
- A profile default **works**.

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

{{% alert title="Note" color="info" %}}
This is a profile-wide default: it changes behavior for every S3 insert made by users on that profile, not just the audit export. Apply it to the profile the audit export runs under and review the effect on other S3 writes. Do not substitute `s3_truncate_on_insert`, which overwrites the previous object instead of adding one.
{{% /alert %}}

For credentials, use a named collection so keys stay out of the DDL:

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

The example exports a stable subset of `system.query_log` rather than `SELECT *`: system-log schemas change across releases, and selecting only the audited fields reduces coupling. Replace `NODE_ID` with a value unique to each server.

```sql
CREATE DATABASE IF NOT EXISTS audit;

CREATE TABLE audit.query_log_s3
(
    hostname String,
    type String,
    event_time_microseconds DateTime64(6),
    query_id String,
    initial_query_id String,
    is_initial_query UInt8,
    user String,
    address String,
    query String,
    exception_code Int32,
    exception String
)
ENGINE = S3(audit_s3, filename = 'NODE_ID/query-log.ndjson', format = 'JSONEachRow');

CREATE MATERIALIZED VIEW audit.query_log_to_s3 TO audit.query_log_s3
AS SELECT
    toString(hostname) AS hostname,
    toString(type) AS type,
    event_time_microseconds,
    query_id,
    initial_query_id,
    is_initial_query,
    user,
    toString(address) AS address,
    query,
    exception_code,
    exception
FROM system.query_log;
```

Each flush produces one object, with the suffix inserted before the extension:

```text
NODE_ID/query-log.ndjson
NODE_ID/query-log.1.ndjson
NODE_ID/query-log.2.ndjson
```

Read the whole export back with a glob:

```sql
SELECT count()
FROM s3(audit_s3, filename = 'NODE_ID/query-log*', format = 'JSONEachRow',
        structure = 'query String, type String');
```

{{% alert title="Warning" color="warning" %}}
Never point two servers at the same object-name sequence. Two ClickHouse servers inserting concurrently into one S3 key sequence silently lose rows: in a test on 26.7.5.10, two servers made **300 inserts that were all acknowledged with zero errors, but only 267 objects existed afterwards** — 33 rows vanished. Per the analysis in [issue #112419](https://github.com/ClickHouse/ClickHouse/issues/112419) (open as of 26.7.5.10), the free-suffix probe is a check-then-act race, so both writers settle on the same `key.N` and one overwrites the other. `s3_create_new_file_on_insert` does not protect against this — it is the mechanism that races. Give every server its own prefix, which is required anyway since system logs are per-server.
{{% /alert %}}

## Example: export session logs to S3

```sql
CREATE TABLE audit.session_log_s3
(
    hostname String,
    type String,
    event_time_microseconds DateTime64(6),
    user String,
    auth_type String,
    client_address String,
    client_port UInt16,
    interface String,
    failure_reason String
)
ENGINE = S3(audit_s3, filename = 'NODE_ID/session-log.ndjson', format = 'JSONEachRow');

CREATE MATERIALIZED VIEW audit.session_log_to_s3 TO audit.session_log_s3
AS SELECT
    toString(hostname) AS hostname,
    toString(type) AS type,
    event_time_microseconds,
    ifNull(user, '') AS user,
    ifNull(toString(auth_type), '') AS auth_type,
    toString(client_address) AS client_address,
    client_port,
    toString(interface) AS interface,
    failure_reason
FROM system.session_log;
```

Tested on 26.7.5.10 and 25.8.32.4: `LoginSuccess`, `LoginFailure`, and `Logout` all export, with `failure_reason` populated for failures.

The `ifNull()` calls are not cosmetic. `system.session_log.user` and `auth_type` are `Nullable`. The MV will accept the DDL without them — ClickHouse converts `Enum8`, `IPv6`, `LowCardinality(String)`, and `Nullable(String)` to `String` implicitly — but a row with an actual `NULL` then raises:

```text
Code: 349. DB::Exception: Cannot convert NULL value to non-Nullable type: ...
while pushing to view audit.session_log_to_s3. (CANNOT_INSERT_NULL_IN_ORDINARY_COLUMN)
```

That is a push-time error, so the flush is ignored and the local table is safe — but the row disappears from the export with no error surfaced to anyone. Keep the `ifNull()` calls, or declare the target columns `Nullable`.

## HTTP/HTTPS target

The `URL` engine maps an `INSERT` to an HTTP `POST`. The receiver must accept the posted format and handle `Transfer-Encoding: chunked`, which is what ClickHouse sends.

```sql
CREATE TABLE audit.query_log_url
(
    query String,
    type String,
    event_time_microseconds DateTime64(6)
)
ENGINE = URL('https://audit-collector.example/clickhouse/query-log', 'JSONEachRow');

CREATE MATERIALIZED VIEW audit.query_log_to_url TO audit.query_log_url
AS SELECT query, toString(type) AS type, event_time_microseconds
FROM system.query_log;
```

Verified on 26.7.5.10 against a test collector; each row arrives as one JSON object:

```json
{"query":"SELECT 'URLMARKER-1'","type":"QueryStart","event_time_microseconds":"2026-08-25 12:09:05.651860"}
```

This is the safer of the two external targets: as shown above, both a 503 response and a refused connection leave the local `system.query_log` intact on 25.8.32.4 and later. Confirm your release line contains PR #75679 (24.12.6.70, 25.1.6.34, 25.2.1.3085+).

## Local flat-file target

The `File` engine can write newline-delimited JSON. Its path handling is more capable than it first appears.

With no path, ClickHouse writes inside the table's own data directory, which for an `Atomic` database is a UUID path that is not stable across a table recreation:

```text
/var/lib/clickhouse/store/ee3/ee356d26-9a82-4ac2-a16e-9f028bb60e7e/data.JSONEachRow
```

An arbitrary absolute path is rejected:

```sql
CREATE TABLE audit.f (a String) ENGINE = File(JSONEachRow, '/var/log/audit.jsonl');
```

```text
Code: 291. DB::Exception: File `/var/log/audit.jsonl` is not inside
`/var/lib/clickhouse/user_files`. (DATABASE_ACCESS_DENIED)
```

But a path **inside `user_files` is accepted**, which does give a stable, shipper-friendly filename. Verified on 26.7.5.10 — the file is appended across flushes:

```sql
CREATE TABLE audit.query_log_file
(
    query String,
    type String,
    event_time_microseconds DateTime64(6)
)
ENGINE = File(JSONEachRow, '/var/lib/clickhouse/user_files/query-audit.jsonl');

CREATE MATERIALIZED VIEW audit.query_log_to_file TO audit.query_log_file
AS SELECT query, toString(type) AS type, event_time_microseconds
FROM system.query_log;
```

Point Filebeat or Fluent Bit at `/var/lib/clickhouse/user_files/query-audit.jsonl`. Note that the file grows without bound — ClickHouse does not rotate it, so external rotation is your responsibility, and rotating it out from under the engine requires care.

## Advanced pattern: make the system log itself remote

Instead of a local MergeTree plus an MV, the system-log config can name an external engine directly.

{{% alert title="Warning" color="warning" %}}
With this pattern the external engine *is* the storage for the system log. There is no local copy for reconciliation, and remote availability becomes part of the flush path. Combined with the no-retry behavior below, an outage means permanent audit gaps.
{{% /alert %}}

S3-backed system logs need `skip_alias_columns`, added in **26.4** ([PR #102669](https://github.com/ClickHouse/ClickHouse/pull/102669), shipped in v26.4.1.1141). Without it the flush fails on every version tested:

```text
Code: 36. DB::Exception: Special columns like MATERIALIZED, ALIAS or EPHEMERAL
are not supported for s3 storage. (BAD_ARGUMENTS)
```

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

Tested: works with zero flush errors on 26.7.5.10 and 26.4.5.143. `system.query_log` then reports `engine = S3` and remains readable through `SELECT`. On 26.3.21.7 and 25.8.32.4 the same config still fails with the ALIAS error — and **the unknown `skip_alias_columns` element is ignored without any warning**, so the only symptom is the flush error in the log.

`replace="replace"` matters: the shipped `config.xml` already defines `<query_log>` with `<partition_by>`, and config.d merging would otherwise combine them. Specifying `engine` alongside `partition_by`, `order_by`, or `ttl` makes the **server refuse to start** (exit code 36):

```text
Code: 36. DB::Exception: If 'engine' is specified for system table, PARTITION BY
parameters should be specified directly inside 'engine' and 'partition_by' setting
doesn't make sense. (BAD_ARGUMENTS)
```

Put any such clauses inside the engine expression instead.

### Direct-engine failure behavior

A failed flush increments `SystemLogErrorOnFlush` — and drops the batch. There is no retry, and recovery of the endpoint does not bring the missed rows back.

Reproduced on 26.7.5.10 with a direct S3-backed `query_log`: marker queries were run while the endpoint was healthy, then the S3 endpoint was cut, then eight more markers were run, then the endpoint was restored and logs flushed again.

| Phase | Rows reaching S3 |
|---|---|
| A — endpoint healthy | 6 |
| B — endpoint down (8 markers, 16 rows) | **2** |
| C — endpoint restored | 2 |

Fourteen of the sixteen phase-B rows were lost permanently. The two that survived were still buffered when the endpoint came back; every batch whose flush had already been *attempted* was gone. `SystemLogErrorOnFlush` reached 6.

An in-memory system-log pipeline is not a durable queue. For a compliance trail, treat external availability, restarts, and crash behavior as part of the delivery design rather than assuming a remote table engine delivers reliably.

## Stronger delivery: separate fast export from reconciliation

If missing external records are unacceptable, keep the local system logs and add a repair path:

```text
system.query_log ------------------> local retained history
      |
      +-- MV ----------------------> low-latency external export
      |
      +-- periodic reconciliation -> repair external gaps
```

A reconciler can checkpoint on `hostname`, `event_time_microseconds`, `query_id`, and `type`, then re-export rows that did not reach the destination.

Alternatively, put a buffered sender between the MV and the final destination. ClickHouse upstream CI exports system logs through an MV into a `Distributed` sender table, which queues delivery to a remote cluster, and explicitly flushes those queues before teardown because pending rows can otherwise remain unsent.

Neither makes the sink exactly-once, but both separate local persistence from remote delivery and give the export path an observable queue.

## Upgrade and schema-change check

When a system-log schema changes after an upgrade, ClickHouse renames the existing table and creates a new one. **The materialized view follows the renamed table**, so the export stops silently.

Reproduced by starting 25.8.32.4 with a working MV export, then booting 26.7.5.10 on the same data directory:

```text
<Debug> SystemLog (system.query_log): Existing table system.query_log for system log
has obsolete or different structure. Renaming it to query_log_0.
```

After the upgrade, marker queries produced **0 exported rows**. No error was logged and `SystemLogErrorOnFlush` never incremented. `SHOW CREATE TABLE` still read `FROM system.query_log`, because the MV tracks its source by UUID, not by name — and that UUID now belongs to `query_log_0`.

Detect it by checking which table actually carries the dependency:

```sql
SELECT name, dependencies_database, dependencies_table
FROM system.tables
WHERE database = 'system' AND name LIKE 'query_log%';
```

Broken state — the dependency sits on the renamed table, and the live table has none (the export view was named `mv` in this test):

```text
query_log       []          []
query_log_0     ['audit']   ['mv']
```

The fix is to recreate the view, after which exports resume immediately:

```sql
DROP TABLE audit.query_log_to_s3;

CREATE MATERIALIZED VIEW audit.query_log_to_s3 TO audit.query_log_s3
AS SELECT ... FROM system.query_log;
```

Run this check after **every** upgrade, together with an end-to-end smoke test:

```sql
SELECT 'audit-export-smoke-test';
SYSTEM FLUSH LOGS;
```

Then confirm the record appears both in `system.query_log` and at the external destination.

## Version notes

| ClickHouse version | Relevant behavior |
|---|---|
| 23.3+ | System-log flushes set `materialized_views_ignore_errors=true`. This covers row-push errors only; sink-construction errors, including the S3 object-exists and endpoint checks, still fail the flush. |
| 24.12.6.70, 25.1.6.34, 25.2.1.3085+ | Contain PR #75679, so `URL`-target connectivity errors are ignored as intended. Tested: 24.10.1.2812 loses local rows, 25.8.32.4 does not. |
| 25.2+ | `SystemLogErrorOnFlush` profile event added (PR #75466; listed in the 25.3 changelog). Verified absent in 24.10.1.2812, present in 25.8.32.4. Its description claims flushes are repeated; they are not. |
| 26.4+ | Adds `default_system_log_flush_policy.skip_alias_columns`, required for S3-backed system logs. Earlier versions ignore the element silently. Verified working on 26.4.5.143 and 26.7.5.10; still failing on 26.3.21.7 and 25.8.32.4. |
| Open as of 26.7.5.10 | Issue #112419: concurrent writers on the same S3 key sequence lose rows with no error. Reproduced here on 26.7.5.10, the newest stable tested; the reporter reproduced it on a prestable 26.8 build. No fix is released, so treat every current line as affected and keep object namespaces unique per server. |

Verify backports against your exact release before relying on any boundary above.

## Related resources

- [System tables eat my disk](/altinity-kb-setup-and-maintenance/altinity-kb-system-tables-eat-my-disk/) — retention and TTL for the local system log tables that this export reads from.
- [Logging](/altinity-kb-setup-and-maintenance/logging/) — the server's text log files, which are a separate concern from these system tables.

## References

- [ClickHouse system tables overview](https://clickhouse.com/docs/reference/system-tables/overview)
- [`system.query_log`](https://clickhouse.com/docs/reference/system-tables/query_log)
- [`system.session_log`](https://clickhouse.com/docs/reference/system-tables/session_log)
- [Materialized views](https://clickhouse.com/docs/reference/statements/create/view)
- [S3 table engine](https://clickhouse.com/docs/reference/engines/table-engines/integrations/s3)
- [URL table engine](https://clickhouse.com/docs/reference/engines/table-engines/special/url)
- [File table engine](https://clickhouse.com/docs/reference/engines/table-engines/special/file)
- [Named collections](https://clickhouse.com/docs/concepts/features/configuration/server-config/named-collections)
- [`SystemLog.cpp`](https://github.com/ClickHouse/ClickHouse/blob/master/src/Interpreters/SystemLog.cpp) — flush loop and error handling
- [`SystemLogBase.cpp`](https://github.com/ClickHouse/ClickHouse/blob/master/src/Common/SystemLogBase.cpp) — queue `pop()`/`confirm()`, showing no retry path
- [PR #75466: add `SystemLogErrorOnFlush`](https://github.com/ClickHouse/ClickHouse/pull/75466)
- [23.3 changelog: `materialized_views_ignore_errors` for system logs](https://github.com/ClickHouse/ClickHouse/blob/master/docs/changelogs/archive/v23.3.1.2823-lts.md)
- [PR #75679: respect `materialized_views_ignore_errors` for URL-engine MVs](https://github.com/ClickHouse/ClickHouse/pull/75679)
- [PR #102669: `skip_alias_columns` for S3-backed system logs](https://github.com/ClickHouse/ClickHouse/pull/102669)
- [Issue #112419: concurrent writes to the same S3 object key](https://github.com/ClickHouse/ClickHouse/issues/112419)
- [Upstream system-log export used by ClickHouse CI](https://github.com/ClickHouse/ClickHouse/blob/master/ci/jobs/scripts/functional_tests/setup_log_cluster.sh)
