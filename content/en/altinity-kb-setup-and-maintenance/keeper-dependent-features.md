---
title: "Keeper-Dependent Features in ClickHouse"
linkTitle: "Keeper-Dependent Features in ClickHouse"
weight: 100
description: >-
     Keeper-Dependent Features in ClickHouse
---

# Keeper-Dependent Features in ClickHouse

This is a consolidated list of features that depend on ClickHouse Keeper (or ZooKeeper-compatible API).

`Keeper` below means either ClickHouse Keeper or Apache ZooKeeper, depending on deployment.

| # | Feature | How configured | Default path / example | Keeper structure (brief) |
|---|---|---|---|---|
| 1 | Replicated tables (`ReplicatedMergeTree` family) | Use `ENGINE = ReplicatedMergeTree(...)`, or omit args and rely on server defaults `default_replica_path`, `default_replica_name`. | Default path: `/clickhouse/tables/{uuid}/{shard}`; replica: `{replica}`. | `<table_path>/metadata`, `columns`, `log`, `blocks`, `async_blocks`, `deduplication_hashes`, `block_numbers`, `leader_election`, `replicas/<replica>/queue, parts, flags, ...`, `mutations`, `quorum`. |
| 2 | `S3Queue` | Table setting `keeper_path`; if omitted CH builds path from `s3queue_default_zookeeper_path` + DB UUID + table UUID. | Default prefix: `/clickhouse/s3queue/`. | `<keeper_path>/metadata`, `processed`, `failed`, `processing`, `persistent_processing`, `registry`; ordered mode may also use `buckets/...` subtrees. |
| 3 | `Kafka` Keeper-offset mode (`StorageKafka2`, experimental) | Enable setting `allow_experimental_kafka_offsets_storage_in_keeper=1` and set both `kafka_keeper_path`, `kafka_replica_name`. | No default keeper path (must be set), docs example: `/clickhouse/{database}/{uuid}`. | `<kafka_keeper_path>/topics/<topic>/partitions`, `topic_partition_locks`, `replicas/<replica>`, temporary `dropped` for drop coordination. |
| 4 | Distributed DDL queue (`ON CLUSTER`) | Server settings: `distributed_ddl.path`, `distributed_ddl.replicas_path`. | Defaults: `/clickhouse/task_queue/ddl/` and `/clickhouse/task_queue/replicas/`. | Queue entries as `query-XXXXXXXXXX` nodes. Each entry has status dirs: `active/<host_id>`, `finished/<host_id>`, optional `synced/<host_id>`, `shards/<shard>/...`. Replicas liveness is tracked under `<replicas_path>/<host_id>/active` (ephemeral). |
| 5 | `KeeperMap` table engine | Server config must define `keeper_map_path_prefix`; table uses engine arg `root_path`. | No built-in default (disabled if prefix is absent). Common example: `/keeper_map_tables`. | `<prefix>/<root_path>/metadata`, `metadata/tables/<table_unique_id>`, `data/<serialized_key>`, drop/cleanup coordination nodes under `metadata/...`. |
| 6 | Replicated databases (`ENGINE=Replicated`) | `ENGINE = Replicated(zoo_path, shard, replica)` or omit args and use DB-replicated defaults. | Default DB path: `/clickhouse/databases/{uuid}`. | `<db_path>/log/query-*`, `replicas/<full_replica_name>/log_ptr, digest, replica_group, ...`, `metadata/<table_name>`, `counter/cnt-*`, `max_log_ptr`, `logs_to_keep`. |
| 7 | Replicated access entities (users/roles/grants/quotas/policies) | Configure `user_directories` with `<replicated><zookeeper_path>...</zookeeper_path></replicated>`. | No mandatory default; common example: `/clickhouse/access`. | `<path>/uuid/<entity_uuid>` stores entity payload. Type maps: `U` (users), `R` (roles), `S` (settings profiles), `P` (row policies), `Q` (quotas), `M` (masking policies), each mapping name -> UUID. |
| 8 | Replicated SQL UDFs (`CREATE FUNCTION`) | Set server config `user_defined_zookeeper_path` (otherwise disk storage is used). | No default keeper path; common example: `/clickhouse/udf`. | Root node plus one znode per function, e.g. `function_<escaped_name>.sql` containing CREATE FUNCTION text. |
| 9 | Named collections in Keeper | Configure `named_collections_storage.type = keeper|zookeeper` (or encrypted variants) and set `named_collections_storage.path`. | Default storage type is `local`; no default keeper path when keeper mode is selected. | Root path with one znode per collection: `<path>/<escaped_collection_name>.sql` containing CREATE NAMED COLLECTION statement. |
| 10 | Workload scheduler definitions in Keeper (`CREATE WORKLOAD`, `CREATE RESOURCE`) | Set `workload_zookeeper_path` (if absent, disk `workload_path` is used). | No default keeper path; docs example: `/clickhouse/workload/definitions.sql`. | Single watched znode at the configured path, content is a serialized list of workload/resource CREATE statements. |
| 11 | Cluster discovery (experimental) | Enable `allow_experimental_cluster_discovery=1`; configure `<remote_servers>...<discovery><path>...`. | No default path; examples use `/clickhouse/discovery/<cluster>`. | Discovery root contains `shards/<server_uuid>` ephemeral nodes with JSON payload (`address`, `shard_id`, version). |
| 12 | `BACKUP/RESTORE ... ON CLUSTER` coordination | Server config `backups.zookeeper_path`. | Default: `/clickhouse/backups`. | Operation roots like `backup-<uuid>` / `restore-<uuid>` with coordination subtrees: stage sync, replicated objects acquisition, file mapping, keeper-map coordination, etc. |
| 13 | `AzureQueue` | Same object-storage queue keeper model as `S3Queue`, with `keeper_path` setting. | Uses the same queue metadata path logic (`s3queue_default_zookeeper_path` prefix if no explicit path). | Same pattern as `S3Queue`: `metadata`, `processed/failed/processing`, `registry`, optional `buckets` in ordered mode. |
| 14 | `generateSerialID()` function | Server setting `series_keeper_path`. | Default: `/clickhouse/series`. | One node per series: `<series_keeper_path>/<series_name>`, value is current counter. |
| 15 | Experimental transactions | Configure `transaction_log.zookeeper_path` (and enable related experimental transaction settings). | Default: `/clickhouse/txn`. | `<path>/tail_ptr` and `<path>/log/csn-*` sequential nodes storing commit sequence and transaction IDs. |
| 16 | `Shared` database engine (Cloud) | ClickHouse Cloud managed behavior (not typically user-configured in self-managed OSS). | Internal/cloud-managed. | Shared catalog is Keeper-backed; low-level path layout is internal and not documented as a stable public contract. |

## ON CLUSTER relation (important)

`ON CLUSTER` itself uses Keeper-backed distributed DDL queue (row 4).  
Some features above already replicate through Keeper, so `ON CLUSTER` can be redundant:

- Replicated database DDLs (row 6).
- Replicated access entities (row 7).
- Replicated UDFs (row 8).
- Keeper-backed named collections (row 9).

ClickHouse has dedicated settings like `ignore_on_cluster_for_replicated_*` to control this behavior.

## Notes

- For many rows, path names can be redirected to auxiliary Keeper clusters using `<auxiliary_zookeepers>` and `cluster_name:/path` notation where supported.
- Node names shown above are the stable conceptual layout from current source tree; some minor subnodes are version-specific.
