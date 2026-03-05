---
title: "How to Replicate ClickHouse RBAC Users and Grants with ZooKeeper/Keeper"
linkTitle: "Replicate RBAC with Keeper"
weight: 100
description: >-
     Practical guide to configure Keeper-backed RBAC replication for users, roles, grants, policies, quotas, and profiles across ClickHouse nodes, including migration and troubleshooting.
---

# How can I replicate CREATE USER and other RBAC commands automatically between servers?

This KB explains how to make SQL RBAC changes (`CREATE USER`, `CREATE ROLE`, `GRANT`, row policies, quotas, settings profiles, masking policies) automatically appear on all servers by storing access entities in ZooKeeper/ClickHouse Keeper.

`Keeper` below means either ClickHouse Keeper or ZooKeeper.

TL;DR:
- By default, SQL RBAC changes (`CREATE USER`, `GRANT`, etc.) are local to each server.
- Replicated access storage keeps RBAC entities in ZooKeeper/ClickHouse Keeper so changes automatically appear on all nodes.
- This guide shows how to configure replicated RBAC, validate it, and migrate existing users safely.

Before details, the core concept is:
- ClickHouse stores access entities in access storages configured by `user_directories`.
- By default, following the shared-nothing concept, SQL RBAC objects are local (`local_directory`), so changes done on one node do not automatically appear on another node unless you run `... ON CLUSTER ...`.
- With `user_directories.replicated`, ClickHouse stores the RBAC model in Keeper under a configured path (for example `/clickhouse/access`) and every node watches that path.
- Each node keeps a local in-memory mirror of replicated access entities and updates it from Keeper watch callbacks. This is why normal access checks are local-memory fast, while RBAC writes depend on Keeper availability.

Flow of this KB:
1. Why this model helps.
2. How to configure it on a new cluster.
3. How to validate and operate it.
4. How to migrate existing RBAC safely.
5. Advanced troubleshooting and internals.

## 1. ON CLUSTER vs Keeper-backed RBAC: when to use which

`ON CLUSTER` executes DDL on hosts that exist at execution time.
In practice, it fans out the query through the distributed DDL queue (also Keeper/ZooKeeper-dependent) to currently known cluster nodes.
It does not automatically replay old RBAC DDL for replicas/shards added later.

Keeper-backed RBAC solves that:
- one shared RBAC state for the cluster;
- new servers read the same RBAC state when they join;
- no need to remember `ON CLUSTER` for every RBAC statement.

Mental model: Keeper-backed RBAC replicates access state, while `ON CLUSTER` fans out DDL to currently known nodes.

### 1.1 Pros and Cons

Pros:
- Single source of truth for RBAC across nodes.
- No manual file sync of `users.xml` / local access files.
- Fast propagation through Keeper watch-driven refresh.
- Natural SQL RBAC workflow (`CREATE USER`, `GRANT`, `REVOKE`, etc.).
- Integrates with access-entity backup/restore.

Cons:
- Writes depend on Keeper availability. `CREATE/ALTER/DROP USER` and `CREATE/ALTER/DROP ROLE`, plus `GRANT/REVOKE`, fail if Keeper is unavailable, while existing authentication/authorization may continue from already loaded cache until restart.
- Operational complexity increases (Keeper health directly affects RBAC operations).
- Keeper data loss or accidental Keeper path damage can remove replicated RBAC state, and users may lose access; keep regular RBAC backups and test restore procedures.
- Can conflict with `ON CLUSTER` if both mechanisms are used without guard settings.
- Invalid/corrupted payload in Keeper can be skipped or be startup-fatal, depending on `throw_on_invalid_replicated_access_entities`.
- Very large RBAC sets (thousands of users/roles or very complex grants) can increase Keeper/watch pressure.
- If Keeper is unavailable during server startup and replicated RBAC storage is configured, startup can fail, so you may be unable to log in until startup succeeds.

## 2. Configure Keeper-backed RBAC on a new cluster

`user_directories` is the ClickHouse server configuration section that defines:
- where access entities are read from (`users.xml`, local SQL access files, Keeper, LDAP, etc.),
- and in which order those sources are checked (precedence).

In short: it is the access-storage routing configuration for users/roles/policies/profiles/quotas.

Apply on **every** ClickHouse node:

```xml
<clickhouse>
  <user_directories replace="replace">
    <users_xml>
      <path>/etc/clickhouse-server/users.xml</path>
    </users_xml>
    <replicated>
      <zookeeper_path>/clickhouse/access/</zookeeper_path>
    </replicated>
  </user_directories>
</clickhouse>
```

Why `replace="replace"` matters:
- without `replace="replace"`, your fragment can be merged with defaults;
- defaults include `local_directory`, so SQL RBAC may still be written locally;
- this can cause mixed behavior (some entities in Keeper, some in local files).

Recommended configuration for clusters using replicated RBAC:
- `users_xml`: bootstrap/break-glass admin users and static defaults.
- `replicated`: all SQL RBAC objects (`CREATE USER`, `CREATE ROLE`, `GRANT`, policies, profiles, quotas).
- avoid `local_directory` as an active writable SQL RBAC storage to prevent mixed write behavior.

### 2.1 Understand `user_directories`: defaults, precedence, coexistence

What can be configured in `user_directories`:
- `users_xml` (read-only config users),
- `local_directory` (SQL users/roles in local files),
- `replicated` (SQL users/roles in Keeper),
- `memory`,
- `ldap` (read-only remote auth source).

Defaults if `user_directories` is **not** specified:
- ClickHouse uses legacy settings (`users_config` and `access_control_path`).
- In typical default deployments this means `users_xml` + `local_directory`.

If `user_directories` **is** specified:
- ClickHouse uses storages from this section and ignores `users_config` / `access_control_path` paths for access storages.
- Order in `user_directories` defines precedence for lookup/auth.

When several storages coexist:
- reads/auth checks storages by precedence order;
- `CREATE USER/ROLE/...` without explicit `IN ...` goes to the first writable target by that order (and may conflict with entities found in higher-precedence storages).

There is special syntax to target a storage explicitly:

```sql
CREATE USER my_user IDENTIFIED BY '***' IN replicated;
```

This is supported, but for access control we usually do **not** recommend mixing storages intentionally.
For sensitive access rights, a single source of truth (typically `replicated`) is safer and easier to operate.

## 3. Altinity Operator (CHI) configuration example

```yaml
apiVersion: clickhouse.altinity.com/v1
kind: ClickHouseInstallation
metadata:
  name: rbac-replicated
spec:
  configuration:
    files:
      config.d/user_directories.xml: |
        <clickhouse>
          <user_directories replace="replace">
            <users_xml>
              <path>/etc/clickhouse-server/users.xml</path>
            </users_xml>
            <replicated>
              <zookeeper_path>/clickhouse/access/</zookeeper_path>
            </replicated>
          </user_directories>
        </clickhouse>
```

## 4. Validate the setup quickly

Check active storages and precedence:

```sql
SELECT name, type, params, precedence
FROM system.user_directories
ORDER BY precedence;
```

Example expected result (values can vary by version/config; precedence values are relative and order matters):

```text
name        type        precedence
users_xml   users_xml   0
replicated  replicated  1
```

Check where users are stored:

```sql
SELECT name, storage
FROM system.users
ORDER BY name;
```

Example expected result for SQL-created user:

```text
name         storage
kb_test      replicated
```

Smoke test:
1. On node A: `CREATE USER kb_test IDENTIFIED WITH no_password;`
2. On node B: `SHOW CREATE USER kb_test;`
3. On either node: `DROP USER kb_test;`

RBAC changes usually propagate within milliseconds to seconds, depending on Keeper latency and cluster load.

Check Keeper data exists:

```sql
SELECT *
FROM system.zookeeper
WHERE path = '/clickhouse/access';
```

## 5. Handle existing `ON CLUSTER` RBAC scripts safely

There are two independent propagation mechanisms:
- Replicated access storage: Keeper-based replication of RBAC entities.
- `ON CLUSTER`: query fan-out through the distributed DDL queue (also Keeper/ZooKeeper-dependent).

When replicated access storage is enabled, combining both can be redundant or problematic.

Recommended practice:
- Prefer RBAC SQL without `ON CLUSTER`, or enable ignore mode:

```sql
SET ignore_on_cluster_for_replicated_access_entities_queries = 1;
```

With this setting, existing RBAC scripts containing `ON CLUSTER` can still be used safely: the clause is rewritten away for replicated-access queries.

For production, prefer configuring this in a profile (for example `default` in `users.xml`) rather than relying on session-level `SET`:

```xml
<clickhouse>
  <profiles>
    <default>
      <ignore_on_cluster_for_replicated_access_entities_queries>1</ignore_on_cluster_for_replicated_access_entities_queries>
    </default>
  </profiles>
</clickhouse>
```

## 6. Migrate existing clusters/users

Before switching to Keeper-backed RBAC, treat this as a storage migration.

**Important:** replay/restore RBAC on one node only. Objects are written to Keeper and then reflected on all nodes.

Key facts before migration:
- Changing `user_directories` storage or changing `zookeeper_path` does **not** move existing SQL RBAC objects automatically.
- If path changes, old users/roles are not deleted, but become effectively hidden from the new storage path.
- `zookeeper_path` cannot be changed at runtime via SQL.

Recommended high-level steps:
1. Export/backup RBAC.
2. Apply the new `user_directories` config on all nodes.
3. Restart/reload as needed.
4. Restore/replay RBAC.
5. Validate from multiple nodes.

### 6.1 SQL-only migration (export/import RBAC DDL)

This path is useful when:
- RBAC DDL is already versioned in your repo, or
- you want to dump/replay access entities using SQL only.
- Replaying `SHOW ACCESS` output is idempotent only if you handle `IF NOT EXISTS`/cleanup; otherwise prefer restoring into an empty RBAC namespace.

Recommended SQL-only flow:
1. On source, check where entities are stored (local vs replicated):

```sql
SELECT name, storage FROM system.users ORDER BY name;
SELECT name, storage FROM system.roles ORDER BY name;
SELECT name, storage FROM system.settings_profiles ORDER BY name;
SELECT name, storage FROM system.quotas ORDER BY name;
SELECT name, storage FROM system.row_policies ORDER BY name;
SELECT name, storage FROM system.masking_policies ORDER BY name;
```

2. Export RBAC DDL from source:
- simplest full dump:

```sql
SHOW ACCESS;
```

Save output as SQL (for example `rbac_dump.sql`) in your repo/artifacts.

You can also export individual objects with `SHOW CREATE USER/ROLE/...` when needed.

3. Switch config to replicated `user_directories` on target cluster and restart/reload.
4. Replay exported SQL on one node (without `ON CLUSTER` in replicated mode).
5. Validate from another node (`SHOW CREATE USER ...`, `SHOW GRANTS FOR ...`).

### 6.2 Migration with `clickhouse-backup` (`--rbac-only`)

```bash
# backup local RBAC users/roles/etc.
clickhouse-backup create --rbac --rbac-only users_bkp_20260304

# restore (on node configured with replicated user directory)
clickhouse-backup restore --rbac-only users_bkp_20260304
```

Important:
- this applies to SQL/RBAC users (created with `CREATE USER ...`, `CREATE ROLE ...`, etc.);
- if your users are in `users.xml`, those are config-based (`--configs`) and this is not an automatic local->replicated RBAC conversion.
- run restore on one node only; entities will be replicated through Keeper.
- If `clickhouse-backup` is configured with `use_embedded_backup_restore: true`, it delegates to SQL `BACKUP/RESTORE` and follows embedded rules. (see below).

### 6.3 Migration with embedded SQL `BACKUP/RESTORE`

```sql
BACKUP
    TABLE system.users,
    TABLE system.roles,
    TABLE system.row_policies,
    TABLE system.quotas,
    TABLE system.settings_profiles,
    TABLE system.masking_policies
TO <backup_destination>;

-- after switching config
RESTORE
    TABLE system.users,
    TABLE system.roles,
    TABLE system.row_policies,
    TABLE system.quotas,
    TABLE system.settings_profiles,
    TABLE system.masking_policies
FROM <backup_destination>;
```

`allow_backup` behavior for embedded SQL backup/restore:
- Storage-level flag in `user_directories` (`<replicated>`, `<local_directory>`, `<users_xml>`) controls whether that storage participates in backup/restore.
- Entity-level setting `allow_backup` (for users/roles/settings profiles) can exclude specific RBAC objects from backup.

Defaults in ClickHouse code:
- `users_xml`: `allow_backup = false` by default.
- `local_directory`: `allow_backup = true` by default.
- `replicated`: `allow_backup = true` by default.

Operational implication:
- If you disable `allow_backup` for replicated storage, embedded `BACKUP TABLE system.users ...` may skip those entities (or fail if no backup-allowed access storage remains).

## 7. Troubleshooting: common support issues

| Symptom | Typical root cause | What to do |
|---|---|---|
| User created on node A is missing on node B | RBAC still stored in `local_directory` | Verify `system.user_directories`; ensure `replicated` is configured on all nodes and active |
| RBAC objects “disappeared” after config change/restart | `zookeeper_path` or storage source changed | Restore from backup or recreate RBAC in the new storage; keep path stable |
| New replica has no historical users/roles | Team used only `... ON CLUSTER ...` before scaling | Enable Keeper-backed RBAC so new nodes load shared state |
| `CREATE USER ... ON CLUSTER` throws "already exists in replicated" | Query fan-out + replicated storage both applied | Remove `ON CLUSTER` for RBAC or enable `ignore_on_cluster_for_replicated_access_entities_queries` |
| `CREATE USER`/`GRANT` fails with Keeper/ZooKeeper error | Keeper unavailable or connection lost | Check `system.zookeeper_connection`, `system.zookeeper_connection_log`, and server logs |
| RBAC writes still go local though `replicated` exists | `local_directory` remains first writable storage | Use `user_directories replace="replace"` and avoid writable local SQL storage in front of replicated |
| Server does not start when Keeper is down; no one can log in | Replicated access storage needs Keeper during initialization | Restore Keeper first, then restart; if needed use a temporary fallback config and keep a break-glass `users.xml` admin |
| Startup fails (or users are skipped) because of invalid RBAC payload in Keeper | Corrupted/invalid replicated entity and strict validation mode | Use `throw_on_invalid_replicated_access_entities` deliberately: `true` fail-fast, `false` skip+log; fix bad Keeper payload before re-enabling strict mode |
| Two independent clusters unexpectedly share the same users/roles | Both clusters point to the same Keeper ensemble and the same `zookeeper_path` | Use unique RBAC paths per cluster (recommended), or isolate with Keeper chroot (requires Keeper metadata repopulation/migration) |
| Cannot change RBAC keeper path with SQL at runtime | Not supported by design | Change config + controlled migration/restore |
| Trying to “sync” RBAC between independent clusters by pointing to another path | Wrong migration model | Use backup/restore or SQL export/import, not ad hoc path switching |
| Authentication errors from app/job, but local tests work | Network/IP/user mismatch, not replication itself | Check `system.query_log` and source IP; verify user host restrictions |
| Short window where user seems present/absent via load balancer | Propagation + node routing timing | Validate directly on each node; avoid assuming LB view is instantly consistent |
| Server fails after aggressive `user_directories` replacement | Required base users/profiles missing in config | Keep `users_xml` (or equivalent base definitions) intact |

## 8. Operational guardrails for production

- Keep the same `user_directories` config on all nodes.
- Keep `zookeeper_path` unique per cluster/tenant.
- Use a dedicated admin user for provisioning; avoid using `default` for automation.
- Track configuration rollouts (who/when/what) to avoid hidden behavior changes.
- Treat Keeper health as part of access-management SLO.
- Plan RBAC backup/restore before changing storage path or cluster topology.

## 9. Observability and debugging signals

### 9.1 Check Keeper connectivity

```sql
SELECT * FROM system.zookeeper_connection;
SELECT * FROM system.zookeeper_connection_log ORDER BY event_time DESC LIMIT 100;
SELECT * FROM system.zookeeper WHERE path = '/clickhouse/access';
```

### 9.2 Relevant server log patterns

You can find feature-related lines in the log, by those patterns:

```text
Access(replicated)
ZooKeeperReplicator
Can't have Replicated access without ZooKeeper
ON CLUSTER clause was ignored for query
```

### 9.3 Force RBAC reload

Force access reload:

```sql
SYSTEM RELOAD USERS;
```


## 10. Keeper path structure and semantics (advanced)

The following details are useful for advanced debugging or when inspecting Keeper paths manually.

If `zookeeper_path=/clickhouse/access`:

```text
/clickhouse/access
  /uuid/<entity_uuid>   -> serialized ATTACH statements for one entity
  /U/<escaped_name>     -> user name -> UUID
  /R/<escaped_name>     -> role name -> UUID
  /S/<escaped_name>     -> settings profile name -> UUID
  /P/<escaped_name>     -> row policy name -> UUID
  /Q/<escaped_name>     -> quota name -> UUID
  /M/<escaped_name>     -> masking policy name -> UUID
```

When these paths are accessed:
- startup/reconnect: ClickHouse syncs Keeper, creates roots if missing, loads all entities;
- `CREATE/ALTER/DROP` RBAC SQL: updates `uuid` and type/name index nodes in Keeper transactions;
- runtime: watch callbacks refresh changed entities into local in-memory mirror.

## 11. Low-level internals

Advanced note:
- each ClickHouse node keeps a local in-memory cache of all replicated access entities;
- cache is updated from Keeper watch notifications (list/entity watches), so auth/lookup paths use local memory and not direct Keeper reads on each request.
- watch patterns used:
  - list watch on `/uuid` children for create/delete detection;
  - per-entity watch on `/uuid/<id>` for payload changes.
- thread model:
  - dedicated watcher thread (`runWatchingThread`);
  - on errors: reset cached Keeper client, sleep, retry;
  - after refresh: send `AccessChangesNotifier` notifications.
- cache layers:
  - primary cache: `MemoryAccessStorage` inside replicated access storage;
  - higher-level caches in `AccessControl` (`RoleCache`, `RowPolicyCache`, `QuotaCache`, `SettingsProfilesCache`) are updated/invalidated via access change notifications.

- Read path is memory-backed (`MemoryAccessStorage` mirror), not direct Keeper reads per query.
- Write path requires Keeper availability; if Keeper is down, RBAC writes fail while some reads can continue from loaded state.
- Insert target is selected by storage order and writeability in `MultipleAccessStorage`; this is why leftover `local_directory` can hijack SQL user creation.
- `ignore_on_cluster_for_replicated_access_entities_queries` is implemented as AST rewrite that removes `ON CLUSTER` for access queries when replicated access storage is enabled.


## 12. Version and history highlights

| Date | Change | Why it matters |
|---|---|---|
| 2021-07-21 | `ReplicatedAccessStorage` introduced (`e33a2bf7bc9`, PR #27426) | First Keeper-backed RBAC replication |
| 2023-08-18 | Ignore `ON CLUSTER` for replicated access entities (`14590305ad0`, PR #52975) | Reduced duplicate/overlap behavior |
| 2023-12-12 | Extended ignore behavior to `GRANT/REVOKE` (`b33f1245559`, PR #57538) | Fixed common operational conflict with grants |
| 2025-06-03 | Keeper replication logic extracted to `ZooKeeperReplicator` (`39eb90b73ef`, PR #81245) | Cleaner architecture, shared replication core |
| 2026-01-24 | Optional strict mode on invalid replicated entities (`3d654b79853`) | Lets operators fail fast on corrupted Keeper payloads |

## 13. Code references for deep dives

- `src/Access/AccessControl.cpp`
- `src/Access/MultipleAccessStorage.cpp`
- `src/Access/ReplicatedAccessStorage.cpp`
- `src/Access/ZooKeeperReplicator.cpp`
- `src/Interpreters/removeOnClusterClauseIfNeeded.cpp`
- `src/Access/IAccessStorage.cpp`
- `src/Backups/BackupCoordinationOnCluster.cpp`
- `src/Backups/RestoreCoordinationOnCluster.cpp`
- `tests/integration/test_replicated_users/test.py`
- `tests/integration/test_replicated_access/test_invalid_entity.py`
