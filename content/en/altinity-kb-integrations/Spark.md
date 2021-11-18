---
title: "Spark"
linkTitle: "Spark"
weight: 100
description: >-
     Spark
---

## ClickHouse + Spark 

### jdbc 

The trivial & natural way to talk to ClickHouse from Spark there is using jdbc. There are 2 jdbc drivers:
* https://github.com/ClickHouse/clickhouse-jdbc/
* https://github.com/housepower/ClickHouse-Native-JDBC#integration-with-spark

ClickHouse-Native-JDBC have some hints about integration with Spark even in the main README file. 

'Official' driver does support some conversion of complex data types (Roarring bitmaps) for Spark-Clickhouse integration: https://github.com/ClickHouse/clickhouse-jdbc/pull/596

But proper partitioning of the data (to spark partitions) may be tricky with jdbc.

Some example snippets:
* https://markelic.de/how-to-access-your-clickhouse-database-with-spark-in-python/
* https://stackoverflow.com/questions/60448877/how-can-i-write-spark-dataframe-to-clickhouse

### Connectors 

* https://github.com/DmitryBe/spark-clickhouse (looks dead)
* https://github.com/VaBezruchko/spark-clickhouse-connector (is not actively maintained).
* https://github.com/housepower/spark-clickhouse-connector  (actively developing connector from housepower - same guys as authors of ClickHouse-Native-JDBC)

## via Kafka

ClickHouse can produce / consume data from/to Kafka to exchange data with Spark.

## via hdfs 

You can load data into hadoop/hdfs using sequence of statements like `INSERT INTO FUNCTION hdfs(...) SELECT ... FROM clickhouse_table`
later process the data from hdfs by spark and do the same in reverse direction.

## via shell calls

You can call other commands from Spark. Those commands can be `clickhouse-client` and/or `clickhouse-local`.
