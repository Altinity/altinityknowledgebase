---
title: "Schema migration tools for ClickHouse"
linkTitle: "Schema migration tools for ClickHouse"
description: >
    Schema migration tools for ClickHouse
---
* golang-migrate tool - see [golang-migrate](golang-migrate.md)
* Flyway - there are a lot of PRs introducing ClickHouse support, maintainer doesn't merge them (maybe he will change his mind soon), but's it's not hard to build flyway from one of those PRs (latest at the top)
  * [https://github.com/flyway/flyway/pull/3134](https://github.com/flyway/flyway/pull/3134) Сlickhouse support
  * [https://github.com/flyway/flyway/pull/3133](https://github.com/flyway/flyway/pull/3133) Add support clickhouse
  * [https://github.com/flyway/flyway/pull/2981](https://github.com/flyway/flyway/pull/2981) Clickhouse replicated
  * [https://github.com/flyway/flyway/pull/2640](https://github.com/flyway/flyway/pull/2640) Yet another ClickHouse support
  * [https://github.com/flyway/flyway/pull/2166](https://github.com/flyway/flyway/pull/2166) Clickhouse support (\#1772)
  * [https://github.com/flyway/flyway/pull/1773](https://github.com/flyway/flyway/pull/1773) Fixed \#1772: Add support for ClickHouse ([https://clickhouse.yandex/](https://clickhouse.yandex/))
* liquibase
  * [https://github.com/mediarithmics/liquibase-clickhouse](https://github.com/mediarithmics/liquibase-clickhouse)
  * [https://johntipper.org/how-to-execute-liquibase-changesets-against-clickhouse/](https://johntipper.org/how-to-execute-liquibase-changesets-against-clickhouse/)
* custom tool for ClickHouse
  * [https://github.com/delium/clickhouse-migrator](https://github.com/delium/clickhouse-migrator)
* phpMigrations
  * [https://github.com/smi2/phpMigrationsClickhouse](https://github.com/smi2/phpMigrationsClickhouse)
  * [https://habrahabr.ru/company/smi2/blog/317682/](https://habrahabr.ru/company/smi2/blog/317682/)

know more?
