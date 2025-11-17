---
title: "Schema migration tools for ClickHouse®"
linkTitle: "Schema migration tools for ClickHouse®"
description: >
    Schema migration tools for ClickHouse®
---
* [atlas](https://atlasgo.io)
  * [https://atlasgo.io/guides/clickhouse](https://atlasgo.io/guides/clickhouse)
* golang-migrate tool - see [golang-migrate](./golang-migrate)
* liquibase
  * [https://github.com/mediarithmics/liquibase-clickhouse](https://github.com/mediarithmics/liquibase-clickhouse)
  * [https://johntipper.org/how-to-execute-liquibase-changesets-against-clickhouse/](https://johntipper.org/how-to-execute-liquibase-changesets-against-clickhouse/)
* HousePlant
  * New CLI migration tool (Dec2024) for ClickHouse developed by [June](https://june.so)
  * Documentation [https://houseplant.readthedocs.io/en/latest/index.html](https://houseplant.readthedocs.io/en/latest/index.html)
  * Github [https://github.com/juneHQ/houseplant](https://github.com/juneHQ/houseplant)
* ClickSuite
  * developed by [GameBeast](https://www.gamebeast.gg/)
  * A robust CLI tool for managing ClickHouse database migrations with environment-specific configurations and TypeScript support.
  * Github [https://github.com/GamebeastGG/clicksuite](https://github.com/GamebeastGG/clicksuite) 
* Flyway
  * [Official community supported plugin](https://documentation.red-gate.com/fd/clickhouse-database-277579307.html) [git](https://github.com/flyway/flyway-community-db-support/tree/main/flyway-database-clickhouse) https://github.com/flyway/flyway-community-db-support
  * Old pull requests (latest at the top):
    * [https://github.com/flyway/flyway/pull/3333](https://github.com/flyway/flyway/pull/3333) СlickHouse support
    * [https://github.com/flyway/flyway/pull/3134](https://github.com/flyway/flyway/pull/3134) СlickHouse support
    * [https://github.com/flyway/flyway/pull/3133](https://github.com/flyway/flyway/pull/3133) Add support ClickHouse
    * [https://github.com/flyway/flyway/pull/2981](https://github.com/flyway/flyway/pull/2981) ClickHouse replicated
    * [https://github.com/flyway/flyway/pull/2640](https://github.com/flyway/flyway/pull/2640) Yet another ClickHouse support
    * [https://github.com/flyway/flyway/pull/2166](https://github.com/flyway/flyway/pull/2166) ClickHouse support (\#1772)
    * [https://github.com/flyway/flyway/pull/1773](https://github.com/flyway/flyway/pull/1773) Fixed \#1772: Add support for ClickHouse ([https://clickhouse.yandex/](https://clickhouse.yandex/))
* [alembic](https://alembic.sqlalchemy.org/en/latest/)
  * see https://clickhouse-sqlalchemy.readthedocs.io/en/latest/migrations.html
* bytebase
  * [https://bytebase.com](https://bytebase.com)
* custom tool for ClickHouse for python
  * [https://github.com/delium/clickhouse-migrator](https://github.com/delium/clickhouse-migrator)
  * [https://github.com/zifter/clickhouse-migrations](https://github.com/zifter/clickhouse-migrations)
  * [https://github.com/trushad0w/clickhouse-migrate](https://github.com/trushad0w/clickhouse-migrate)
* phpMigrations
  * [https://github.com/smi2/phpMigrationsClickHouse](https://github.com/smi2/phpMigrationsClickhouse)
  * [https://habrahabr.ru/company/smi2/blog/317682/](https://habrahabr.ru/company/smi2/blog/317682/)
* dbmate
  * [https://github.com/amacneil/dbmate#clickhouse](https://github.com/amacneil/dbmate#clickhouse)

Want to know more?

https://clickhouse.com/docs/knowledgebase/schema_migration_tools

Article on migrations in ClickHouse
https://posthog.com/blog/async-migrations

<!-- The following is an AI Generated comparison with bibliography for reference -->
## ClickHouse Schema Migration Tools — Comparison Matrix & Bibliography

### Comparison Matrix

| Tool | Ecosystem / Style | ClickHouse support level | Notable strengths | Gotchas / pitfalls |
|------|-------------------|--------------------------|-------------------|---------------------|
| **Atlas** | Go CLI + schema-as-code (HCL/SQL) | First-class support; official CH guide available | Declarative schema mgmt, CI/GitOps friendly, strong diff/plan/apply model | Requires live DB for schema inspection; some DB objects not fully supported; CH non-transactional DDL means no rollback; heavy CH mutations still risky |
| **golang-migrate** | Go CLI/library, SQL migrations | Supported via ClickHouse drivers | Simple migration model, good for Go-native workflows | Connection issues (`driver: bad connection`); driver version mismatches; no CH-specific awareness (mutations, async ops) |
| **Liquibase (+ liquibase-clickhouse)** | Java-based XML/YAML/SQL changesets | Community extension provides support | Mature tooling, rollback system, large ecosystem | liquibase-clickhouse plugin often outdated; JDBC driver compatibility problems; classpath setup complexity |
| **Houseplant** | Python CLI, YAML migrations | Purpose-built for ClickHouse | CH-first design, YAML clarity, multi-environment mgmt | No async/backfill orchestration; young project; small ecosystem |
| **ClickSuite** | Node/TypeScript CLI | Built specifically for ClickHouse | Multi-env YAML config, multi-statement support, dry-run, rollback | Very new; minimal production history; requires Node toolchain |
| **Flyway (community plugin)** | Java CLI/library | Community plugin supports CH | Popular enterprise migration tool, structured versioning | Can re-apply migrations due to lack of CH locking; plugin behind CH versions; JDBC handler issues |
| **Alembic (via clickhouse-sqlalchemy)** | Python ORM-centric migrations | Supported through SQLAlchemy dialect | Works well if using SQLAlchemy models; autogenerate possible | Autogenerate breakage reported; CH DDL non-transactional; ORM-bound workflow may not suit raw SQL teams |
| **Bytebase** | Web UI + DevOps change management | Officially supports ClickHouse | GUI, reviews, policies, multi-env governance | CH support newer; still does not solve CH async/backfill limitations; requires running a server |
| **Python CH tools (migrations-clickhouse, clickhouse-migrate, etc.)** | Python CLI | Community support | Lightweight options; multi-statement support (varies) | Some tools abandoned; metadata tables not replicated across clusters; must manage ops manually |
| **phpMigrations** | PHP framework | Community support | Useful only in PHP-heavy ecosystems | Very little recent activity; outdated; CH DDL constraints still apply |
| **dbmate** | Go binary, SQL migrations | Supported via CH drivers | Simple, portable, framework-agnostic | Metadata table not replicated in cluster setups; CH DDL non-transactional |

---

### Bibliography

- Altinity KB – Schema Migration Tools: https://kb.altinity.com/altinity-kb-setup-and-maintenance/schema-migration-tools/
- Palark – Atlas Migration Article: https://palark.com/blog/atlas-for-mysql-postgresql-database-schema-migrations/
- Atlas Supported Objects Documentation: https://atlasgo.io/blog/2024/05/06/supported-objects/
- ClickHouse SQLAlchemy Docs (Non-Transactional DDL): https://clickhouse-sqlalchemy.readthedocs.io/en/latest/
- Tinybird – ClickHouse Schema Migrations: https://www.tinybird.co/blog/clickhouse-schema-migrations
- pyk.sh – golang-migrate ClickHouse Connection Issues: https://pyk.sh/blog/2024-02-15-fix-driver-bad-connection-in-golang-migrate-click-house/
- golang-migrate Driver/Connection Issues (GitHub): https://github.com/golang-migrate/migrate/issues
- liquibase-clickhouse Issues: https://github.com/MEDIARITHMICS/liquibase-clickhouse/issues
- Liquibase + ClickHouse Configuration Blog: https://blog.it-incubator.eu/2023/08/05/how-to-create-clickhouse-db-schema-with-liquibase/
- Houseplant Documentation: https://houseplant.readthedocs.io/en/latest/usage.html
- June – Houseplant Migration Article: https://www.june.so/blog/houseplant-database-migrations-for-clickhouse
- Houseplant Hacker News Discussion: https://news.ycombinator.com/item?id=42524493
- ClickSuite Documentation: https://github.com/GamebeastGG/clicksuite
- Flyway ClickHouse Plugin Issue (Missing Locking): https://github.com/flyway/flyway-community-db-support/issues/48
- Flyway ClickHouse Version Incompatibility: https://productsupport.red-gate.com/hc/en-us/community/posts/24974494619933
- Flyway JDBC Handler Issues: https://github.com/flyway/flyway/issues
- Alembic + ClickHouse SQLAlchemy Docs: https://clickhouse-sqlalchemy.readthedocs.io/en/latest/
- SQLAlchemy ClickHouse Autogenerate Issues: https://github.com/cloudflare/sqlalchemy-clickhouse/issues
- Bytebase Supported Databases: https://www.bytebase.com/docs/introduction/supported-databases/
- Bytebase ClickHouse Engine Request: https://github.com/bytebase/bytebase/issues/3082
- clickhouse-migrations README: https://github.com/Infinidat/migrations-clickhouse
- dbmate README & ClickHouse Notes: https://github.com/amacneil/dbmate
- dbmate ClickHouse Replication Issue: https://github.com/amacneil/dbmate/issues/265
- SMI2 PHP ClickHouse Migrations (Habr): https://habr.com/ru/post/331762/

