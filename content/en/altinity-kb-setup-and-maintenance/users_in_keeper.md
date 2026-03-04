---
title: "ClickHouse Users/Grants in ZooKeeper or ClickHouse Keeper"
linkTitle: "ClickHouse Users/Grants in ZooKeeper or ClickHouse Keeper"
weight: 100
description: >-
     ClickHouse Users/Grants in ZooKeeper or ClickHouse Keeper.
---

# ClickHouse Users/Grants in ZooKeeper or ClickHouse Keeper

## 1. What this feature is

ClickHouse can store access control entities in ZooKeeper/ClickHouse Keeper instead of (or together with) local files.

Access entities include:
- users
- roles
- grants/revokes
- row policies
- quotas
- settings profiles
- masking policies

In config this is the `replicated` access storage inside `user_directories`.

```xml
<user_directories>
    <replicated>
        <zookeeper_path>/clickhouse/access</zookeeper_path>
        <allow_backup>true</allow_backup>
    </replicated>
</user_directories>
```

From here on, this article uses **Keeper** as a short name for ZooKeeper/ClickHouse Keeper.

## 2. Basic concepts (quick glossary)

- `Access entity`: one RBAC object (for example one user or one role).
- `ReplicatedAccessStorage`: access storage implementation that persists entities in Keeper.
- `ZooKeeperReplicator`: low-level component that does Keeper reads/writes/watches and maintains local mirror state.
- `ON CLUSTER`: distributed DDL mechanism (queue-based fan-out) for running a query on many hosts.
- `system.user_directories`: system table that shows configured access storages and precedence.

## 3. Why teams use it (pros/cons)

### Pros
- Single source of truth for RBAC across nodes.
- No manual file sync of `users.xml`/local access files.
- Immediate propagation through Keeper watches.
- Works naturally with SQL RBAC workflows (`CREATE USER`, `GRANT`, etc.).
- Integrates with backup/restore of access entities.

### Cons
- Writes depend on Keeper availability (reads continue from local cache, writes fail when Keeper unavailable).
- Operational complexity increases (Keeper health now affects auth/RBAC changes).
- Potential confusion with `ON CLUSTER` (two replication mechanisms can overlap).
- Corrupted entity payload in Keeper can be ignored or fail startup, depending on settings.

## 4. Where data is stored in Keeper

Assume:
- configured path is `/clickhouse/access`

Tree layout:

```text
/clickhouse/access
  /uuid
    /<entity_uuid>                       -> serialized ATTACH statements of one entity
  /U
    /<escaped_user_name>                 -> "<entity_uuid>"
  /R
    /<escaped_role_name>                 -> "<entity_uuid>"
  /S
    /<escaped_settings_profile_name>     -> "<entity_uuid>"
  /P
    /<escaped_row_policy_name>           -> "<entity_uuid>"
  /Q
    /<escaped_quota_name>                -> "<entity_uuid>"
  /M
    /<escaped_masking_policy_name>       -> "<entity_uuid>"
```

Type-letter mapping is from `AccessEntityTypeInfo`:
- `U` user
- `R` role
- `S` settings profile
- `P` row policy
- `Q` quota
- `M` masking policy

Important detail:
- names are escaped with `escapeForFileName()`.
- `zookeeper_path` is normalized on startup: trailing `/` removed, leading `/` enforced.

## 5. What value format is stored under `/uuid/<id>`

Each entity is serialized as one or more one-line `ATTACH ...` statements:
- first statement is entity definition (`ATTACH USER`, `ATTACH ROLE`, and so on)
- users/roles can include attached grant statements (`ATTACH GRANT ...`)

So Keeper stores SQL-like payload, not a binary protobuf/json object.

## 6. How reads/writes happen (from basic to advanced)

## 6.1 Startup and initialization

On startup (or reconnect), `ZooKeeperReplicator`:
1. gets Keeper client
2. executes `sync(zookeeper_path)` to reduce stale reads after reconnect
3. creates root nodes if missing (`/uuid`, `/U`, `/R`, ...)
4. loads all entities into an internal `MemoryAccessStorage`
5. starts watch thread

## 6.2 Insert/update/remove behavior

- Insert uses Keeper `multi` to create both:
  - `/uuid/<id>` with serialized entity
  - `/<TYPE>/<name>` with value `<id>`
- Update uses versioned `set`/`multi`; rename updates type/name node too.
- Remove deletes both uuid node and type/name node in one `multi`.

This dual-index model enforces:
- uniqueness by UUID (`/uuid`)
- uniqueness by (type, name) (`/<TYPE>/<name>`)

## 6.3 Read/find behavior

Reads from SQL path (`find`, `read`, `exists`) go to the in-memory mirror (`MemoryAccessStorage`), not directly to Keeper.

Keeper is the persistent source; memory is the fast serving layer.

## 7. Watches, refresh, and caches

Two watch patterns are used:
- list watch on `/uuid` children: detects new/deleted entities
- per-entity watch on `/uuid/<id>`: detects changes of that entity payload

Refresh queue:
- `Nil` marker means “refresh entity list”
- concrete UUID means “refresh this entity”

Thread model:
- dedicated watcher thread (`runWatchingThread`)
- on errors: reset cached Keeper client, sleep, retry
- after successful refresh: sends `AccessChangesNotifier` notifications

Cache layers to know:
- primary replicated-access cache: `MemoryAccessStorage` inside `ReplicatedAccessStorage`
- higher-level RBAC caches in `AccessControl`:
  - `RoleCache`
  - `RowPolicyCache`
  - `QuotaCache`
  - `SettingsProfilesCache`
- these caches subscribe to access-entity change notifications and recalculate/invalidate accordingly

## 8. Settings that strongly affect behavior

## 8.1 `ignore_on_cluster_for_replicated_access_entities_queries`

If enabled and replicated access storage exists:
- access-control queries with `ON CLUSTER` are rewritten to local query (ON CLUSTER removed).

Why:
- replicated access storage already replicates through Keeper.
- additional distributed DDL fan-out may cause duplicate/conflicting execution.

Coverage includes grants/revokes too (`ASTGrantQuery` is included).

## 8.2 `access_control_improvements.throw_on_invalid_replicated_access_entities`

If enabled:
- parse errors in Keeper entity payload are fatal during full load (can fail server startup).

If disabled:
- invalid entity is logged and skipped.

This is tested by injecting invalid `ATTACH GRANT ...` into `/uuid/<id>`.

## 8.3 `access_control_improvements.on_cluster_queries_require_cluster_grant`

Controls whether `CLUSTER` grant is required for `ON CLUSTER`.

## 8.4 `distributed_ddl_use_initial_user_and_roles` (server setting)

For `ON CLUSTER`, remote execution can preserve initiator user/roles.
This is relevant when mixing distributed DDL with access management.

## 9. Relationship with `ON CLUSTER` (important)

There are two independent propagation mechanisms:
- Replicated access storage: Keeper-based data replication.
- `ON CLUSTER`: distributed DDL queue execution.

When replicated access storage is used, combining both can be redundant or problematic.

Recommended practice:
- for access-entity SQL in replicated storage deployments, enable `ignore_on_cluster_for_replicated_access_entities_queries`.
- then you may keep existing `... ON CLUSTER ...` statements, but they are safely rewritten locally.

## 10. Backup/restore behavior

## 10.1 Access entities backup in replicated mode

In `IAccessStorage::backup()`:
- non-replicated storage writes backup entry directly.
- replicated storage registers file path in backup coordination by:
  - replication id = `zookeeper_path`
  - access entity type

Then backup coordination chooses a single host deterministically to store unified replicated-access files.

## 10.2 Keeper structure for `BACKUP ... ON CLUSTER`

Under backup coordination root:

```text
<backups_zk_root>/backup-<backup_uuid>/repl_access/
  <escaped_access_storage_zk_path>/
    <AccessEntityTypeName>/
      <host_id> -> "<file_path>"
```

## 10.3 Restore coordination lock

During restore:

```text
<backups_zk_root>/restore-<restore_uuid>/repl_access_storages_acquired/
  <escaped_access_storage_zk_path> -> "<host_index>"
```

Only the host that acquires this node restores that replicated access storage.

## 11. Introspection and debugging

Start here:

```sql
SELECT name, type, params, precedence
FROM system.user_directories
ORDER BY precedence;
```

Inspect Keeper paths:

```sql
SELECT path, name, value
FROM system.zookeeper
WHERE path IN (
    '/clickhouse/access',
    '/clickhouse/access/uuid',
    '/clickhouse/access/U',
    '/clickhouse/access/R',
    '/clickhouse/access/S',
    '/clickhouse/access/P',
    '/clickhouse/access/Q',
    '/clickhouse/access/M'
);
```

Map user name to UUID then to payload:

```sql
SELECT value AS uuid
FROM system.zookeeper
WHERE path = '/clickhouse/access/U' AND name = 'alice';

SELECT value
FROM system.zookeeper
WHERE path = '/clickhouse/access/uuid' AND name = '<uuid>';
```

Keeper connection and request visibility:

```sql
SELECT *
FROM system.zookeeper_connection;

SELECT *
FROM system.zookeeper_connection_log
ORDER BY event_time DESC
LIMIT 50;

SELECT event_time, type, op_num, path, error
FROM system.zookeeper_log
WHERE path LIKE '/clickhouse/access/%'
ORDER BY event_time DESC
LIMIT 200;
```

Aggregated Keeper operations (if table is enabled):

```sql
SELECT event_time, session_id, parent_path, operation, count, errors, average_latency
FROM system.aggregated_zookeeper_log
WHERE parent_path LIKE '/clickhouse/access/%'
ORDER BY event_time DESC
LIMIT 100;
```

Operational metrics:

```sql
SELECT metric, value
FROM system.metrics
WHERE metric IN (
    'ZooKeeperSession',
    'ZooKeeperSessionExpired',
    'ZooKeeperConnectionLossStartedTimestampSeconds',
    'ZooKeeperWatch',
    'ZooKeeperRequest',
    'DDLWorkerThreads',
    'DDLWorkerThreadsActive',
    'DDLWorkerThreadsScheduled'
)
ORDER BY metric;

SELECT event, value
FROM system.events
WHERE event LIKE 'ZooKeeper%'
ORDER BY event;

SELECT metric, value
FROM system.asynchronous_metrics
WHERE metric = 'ZooKeeperClientLastZXIDSeen';
```

`ON CLUSTER` queue debugging:

```sql
SELECT cluster, entry, host, status, query, exception_code, exception_text
FROM system.distributed_ddl_queue
ORDER BY query_create_time DESC
LIMIT 100;
```

Force reload of all user directories:

```sql
SYSTEM RELOAD USERS;
```

## 12. Troubleshooting patterns

- Symptom: writes fail, reads still work.
  - Likely Keeper unavailable; replicated storage serves cached in-memory entities for reads.
- Symptom: startup failure after corrupted Keeper payload.
  - Check `throw_on_invalid_replicated_access_entities`.
  - Fix offending `/uuid/<id>` payload in Keeper.
- Symptom: duplicate/“already exists in replicated” around `... ON CLUSTER ...`.
  - Enable `ignore_on_cluster_for_replicated_access_entities_queries`.
- Symptom: grants seem stale after changes.
  - Check watcher/connection metrics and `system.zookeeper_log`.
  - Run `SYSTEM RELOAD USERS` as a recovery action.

## 13. Developer-level internals

- `ReplicatedAccessStorage` is now mostly a wrapper; Keeper logic is in `ZooKeeperReplicator`.
- On reconnect, code explicitly calls `sync(zookeeper_path)` to mitigate stale reads after session switch.
- Watch queue is unbounded and can accumulate work under churn; refresh loop drains it.
- Entity parse failures are wrapped with path context (`Could not parse <path>`).
- Updates use optimistic versions via Keeper `set`/`multi`; conflicts become retryable or explicit exceptions.
- Backup integration uses `isReplicated()` and `getReplicationID()` hooks in `IAccessStorage`.
- Restore of replicated access uses explicit distributed lock (`acquireReplicatedAccessStorage`) to avoid duplicate restore writers.

## 14. Important history and increments (Git timeline)

| Date | Commit / PR | Change | Why it matters |
|---|---|---|---|
| 2020-04-06 | [`42b8ed3ec64`](https://github.com/ClickHouse/ClickHouse/commit/42b8ed3ec64) | `ON CLUSTER` support for access control SQL | Foundation for distributed RBAC DDL. |
| 2021-07-21 | [`e33a2bf7bc9`](https://github.com/ClickHouse/ClickHouse/commit/e33a2bf7bc9) | Added `ReplicatedAccessStorage` | Initial Keeper-backed replicated access entities. |
| 2021-09-26 (plus later backports) | [`13db65f47c3`](https://github.com/ClickHouse/ClickHouse/commit/13db65f47c3), [`29388`](https://github.com/ClickHouse/ClickHouse/pull/29388) | Shutdown/misconfiguration fixes | Safer lifecycle when Keeper is unavailable/misconfigured. |
| 2022-01-25 | [`0105f7e0bcc`](https://github.com/ClickHouse/ClickHouse/commit/0105f7e0bcc), [`33988`](https://github.com/ClickHouse/ClickHouse/pull/33988) | Startup fix when replicated access depends on keeper | Removed critical startup dead path. |
| 2022-03-30 | [`01e1c5345a2`](https://github.com/ClickHouse/ClickHouse/commit/01e1c5345a2) | Separate `CLUSTER` grant + `on_cluster_queries_require_cluster_grant` | Better security model for `ON CLUSTER`. |
| 2022-06-15 | [`a0c558a17e8`](https://github.com/ClickHouse/ClickHouse/commit/a0c558a17e8) | Backup/restore for ACL system tables | Made access entities first-class in backup/restore flows. |
| 2022-08-08 | [`8f9f5c69daf`](https://github.com/ClickHouse/ClickHouse/commit/8f9f5c69daf) | Simplified with `MemoryAccessStorage` mirror | Clearer in-memory serving model and cleaner replication loop. |
| 2022-08-09 | [`646cd556905`](https://github.com/ClickHouse/ClickHouse/commit/646cd556905), [`39977`](https://github.com/ClickHouse/ClickHouse/pull/39977) | Recovery improvements after errors | Better resilience on Keeper issues. |
| 2022-09-16 | [`69996c960c8`](https://github.com/ClickHouse/ClickHouse/commit/69996c960c8) | Init retries for replicated access | Fewer startup failures on transient network/hardware errors. |
| 2022-09-16 | [`5365b105ccc`](https://github.com/ClickHouse/ClickHouse/commit/5365b105ccc), [`45198`](https://github.com/ClickHouse/ClickHouse/pull/45198) | `SYSTEM RELOAD USERS` | Explicit operator tool for reloading all access storages. |
| 2023-08-18 | [`14590305ad0`](https://github.com/ClickHouse/ClickHouse/commit/14590305ad0), [`52975`](https://github.com/ClickHouse/ClickHouse/pull/52975) | Added ignore settings for replicated-entity queries | Reduced conflict between Keeper replication and `ON CLUSTER`. |
| 2023-12-12 | [`b33f1245559`](https://github.com/ClickHouse/ClickHouse/commit/b33f1245559), [`57538`](https://github.com/ClickHouse/ClickHouse/pull/57538) | Extended ignore behavior to `GRANT/REVOKE` | Closed major practical gap for replicated RBAC management. |
| 2024-09-04 | [`1ccd461c97d`](https://github.com/ClickHouse/ClickHouse/commit/1ccd461c97d) | Fix restoring dependent access entities | More reliable restore ordering/conflict handling. |
| 2024-09-06 | [`3c4d6509f3d`](https://github.com/ClickHouse/ClickHouse/commit/3c4d6509f3d) | Backup/restore refactor for access entities | Cleaner architecture and fewer edge-case restore issues. |
| 2024-09-18 | [`712a7261a9c`](https://github.com/ClickHouse/ClickHouse/commit/712a7261a9c) | Backup filenames changed to `access-<UUID>.txt` | Deterministic naming across hosts for replicated access backups. |
| 2025-06-16 | [`d58a00754af`](https://github.com/ClickHouse/ClickHouse/commit/d58a00754af), [`81245`](https://github.com/ClickHouse/ClickHouse/pull/81245) | Split Keeper replication into `ZooKeeperReplicator` | Reusable replication core and cleaner separation of concerns. |
| 2025-09-12 | [`efa4d2b605e`](https://github.com/ClickHouse/ClickHouse/commit/efa4d2b605e) | ID/tag based watches in ZooKeeper client path | Lower watch/cache complexity and better correctness under churn. |
| 2025-09-12 | [`2bf08fc9a62`](https://github.com/ClickHouse/ClickHouse/commit/2bf08fc9a62) | Watch leftovers fix | Better long-run stability under frequent watch activity. |
| 2026-01-27 | [`21644efa780`](https://github.com/ClickHouse/ClickHouse/commit/21644efa780), [`95032`](https://github.com/ClickHouse/ClickHouse/pull/95032) | Option to throw on invalid replicated entities | Lets strict deployments fail fast on Keeper data corruption. |

## 15. Practical guidance

For most production clusters using replicated access entities:
1. Use replicated access storage as the RBAC source of truth.
2. Enable `ignore_on_cluster_for_replicated_access_entities_queries`.
3. Decide explicitly on strictness for invalid entities (`throw_on_invalid...`).
4. Monitor Keeper connection + request metrics and `system.zookeeper_*` logs.
5. Use `SYSTEM RELOAD USERS` as a controlled recovery tool.

## 16. Key files (for engineers reading source)

- `src/Access/ReplicatedAccessStorage.{h,cpp}`
- `src/Access/ZooKeeperReplicator.{h,cpp}`
- `src/Access/Common/AccessEntityType.{h,cpp}`
- `src/Access/AccessEntityIO.cpp`
- `src/Access/AccessControl.cpp`
- `src/Access/AccessChangesNotifier.{h,cpp}`
- `src/Access/IAccessStorage.cpp`
- `src/Backups/BackupCoordinationReplicatedAccess.{h,cpp}`
- `src/Backups/BackupCoordinationOnCluster.cpp`
- `src/Backups/RestoreCoordinationOnCluster.cpp`
- `src/Interpreters/removeOnClusterClauseIfNeeded.cpp`
- `src/Interpreters/Access/InterpreterGrantQuery.cpp`
- `tests/integration/test_replicated_users/test.py`
- `tests/integration/test_replicated_access/test.py`
- `tests/integration/test_replicated_access/test_invalid_entity.py`
- `tests/integration/test_access_control_on_cluster/test.py`
