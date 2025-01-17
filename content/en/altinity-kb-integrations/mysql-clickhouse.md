---
title: "MySQL"
linkTitle: "Integrating ClickHouse® with MySQL"
weight: 100
---

### Replication using MaterializeMySQL.

- https://clickhouse.com/docs/en/engines/database-engines/materialized-mysql
- https://translate.google.com/translate?sl=auto&tl=en&u=https://www.jianshu.com/p/d0d4306411b3
- https://raw.githubusercontent.com/ClickHouse/clickhouse-presentations/master/meetup47/materialize_mysql.pdf

It reads mysql binlog directly and transform queries into something which ClickHouse® can support. Supports updates and deletes (under the hood implemented via something like ReplacingMergeTree with enforced FINAL and 'deleted' flag). Status is 'experimental', there are quite a lot of known limitations and issues, but some people use it. The original author of that went to another project, and the main team don't have a lot of resource to improve that for now (more important thing in the backlog)

The replication happens on the mysql database level.

### Replication using debezium + Kafka (+ Altinity Sink Connector for ClickHouse)

Debezium can read the binlog and transform it to Kafka messages. 

You can later capture the stream of message on ClickHouse side and process it as you like.
Please remember that currently Kafka engine supports only at-least-once delivery guarantees.
It's used by several companies, quite nice & flexible. But initial setup may require some efforts.

#### Altinity Sink Connector for ClickHouse

Can handle transformation of debezium messages (with support for DELETEs and UPDATEs) and exactly-once delivery for you. 

Links:
* https://altinity.com/blog/fast-mysql-to-clickhouse-replication-announcing-the-altinity-sink-connector-for-clickhouse
* https://altinity.com/mysql-to-clickhouse/
* https://github.com/Altinity/clickhouse-sink-connector

#### Same as above but using https://maxwells-daemon.io/ instead of debezium.

Have no experience / feedback there, but should be very similar to debezium.

### Replication using clickhouse-mysql

See https://altinity.com/blog/2018/6/30/realtime-mysql-clickhouse-replication-in-practice

That was done long time ago in altinity for one use-case, and it seem like it was never used outside of that.
It's a python application with lot of switches which can copy a schema or read binlog from mysql and put it to ClickHouse.
Not supported currently. But it's just a python, so maybe can be adjusted to different needs.

### Accessing MySQL data via integration engines from inside ClickHouse.

MySQL [table engine](https://clickhouse.com/docs/en/engines/table-engines/integrations/mysql/) / [table function](https://clickhouse.com/docs/en/sql-reference/table-functions/mysql/), or [MySQL database engine](https://clickhouse.com/docs/en/engines/database-engines/mysql/) - ClickHouse just connects to mysql server as a client, and can do normal selects.

We had webinar about that a year ago: https://www.youtube.com/watch?v=44kO3UzIDLI

Using that you can easily create some ETL script which will copy the data from mysql to ClickHouse regularly, i.e. something like

```sql
INSERT INTO clickhouse_table SELECT * FROM mysql_table WHERE id > ...
```

Works great if you have append only table in MySQL.

In newer ClickHouse versions you can query this was also sharded / replicated MySQL cluster - see [ExternalDistributed](https://clickhouse.com/docs/en/engines/table-engines/integrations/ExternalDistributed/)


### MySQL dictionaries

There are also MySQL dictionaries, which can be very nice alternative for storing some dimensions information in star schema.

- https://clickhouse.com/docs/en/sql-reference/dictionaries/external-dictionaries/external-dicts-dict-sources/#dicts-external_dicts_dict_sources-mysql
- https://github.com/ClickHouse/ClickHouse/blob/9f5cd35a6963cc556a51218b46b0754dcac7306a/tests/testflows/aes_encryption/tests/compatibility/mysql/dictionary.py#L35-L51
