---
title: "ClickHouse + Spark"
linkTitle: "Spark"
weight: 100
description: >-
     Spark
---

## ClickHouse + Spark 

### jdbc 

The trivial & natural way to talk to ClickHouse from Spark is using jdbc. There are 2 jdbc drivers:
* https://github.com/ClickHouse/clickhouse-jdbc/
* https://github.com/housepower/ClickHouse-Native-JDBC#integration-with-spark

ClickHouse-Native-JDBC has some hints about integration with Spark even in the main README file. 

'Official' driver does support some conversion of complex data types (Roarring bitmaps) for Spark-Clickhouse integration: https://github.com/ClickHouse/clickhouse-jdbc/pull/596

But proper partitioning of the data (to spark partitions) may be tricky with jdbc.

Some example snippets:
* https://markelic.de/how-to-access-your-clickhouse-database-with-spark-in-python/
* https://stackoverflow.com/questions/60448877/how-can-i-write-spark-dataframe-to-clickhouse

### Connectors 

* https://github.com/DmitryBe/spark-clickhouse (looks dead)
* https://github.com/VaBezruchko/spark-clickhouse-connector (is not actively maintained).
* https://github.com/housepower/spark-clickhouse-connector  (actively developing connector from housepower - same guys as authors of ClickHouse-Native-JDBC)

### via Kafka

ClickHouse can produce / consume data from/to Kafka to exchange data with Spark.

### via hdfs 

You can load data into hadoop/hdfs using sequence of statements like `INSERT INTO FUNCTION hdfs(...) SELECT ... FROM clickhouse_table`
later process the data from hdfs by spark and do the same in reverse direction.

### via s3

Similar to above but using s3.

### via shell calls

You can call other commands from Spark. Those commands can be `clickhouse-client` and/or `clickhouse-local`.

### do you really need Spark? :) 

In many cases you can do everything inside ClickHouse without Spark help :)
Arrays, Higher-order functions, machine learning, integration with lot of different things including the possibility to run some external code using executable dictionaries or UDF. 

## More info + some unordered links (mostly in Chinese / Russian)

* Spark + ClickHouse: not a fight, but a symbiosis https://github.com/ClickHouse/clickhouse-presentations/blob/master/meetup28/spark_and_clickhouse.pdf (russian)
* Using a bunch of ClickHouse and Spark in MFI Soft https://www.youtube.com/watch?v=ID8eTnmag0s (russian)
* Spark read and write ClickHouse https://yerias.github.io/2020/12/08/clickhouse/9/#Jdbc%E6%93%8D%E4%BD%9Cclickhouse
* Spark reads and writes ClickHouse through jdbc https://blog.katastros.com/a?ID=01800-e40e1b3c-5fa4-4ea0-a3a8-f5e89ef0ce14
* Spark JDBC write clickhouse operation summary https://www.jianshu.com/p/43f78c8a025b?hmsr=toutiao.io&utm_campaign=toutiao.io&utm_medium=toutiao.io&utm_source=toutiao.io  https://toutiao.io/posts/m63yw89/preview
* Spark-sql is based on Clickhouse's DataSourceV2 data source extension (russian)
https://www.cnblogs.com/mengyao/p/4689866.html  
* Alibaba integration instructions https://www.alibabacloud.com/help/doc-detail/191192.htm 
* Tencent integration instructions https://intl.cloud.tencent.com/document/product/1026/35884
* Yandex DataProc demo: loading files from S3 to ClickHouse with Spark https://www.youtube.com/watch?v=N3bZW0_rRzI
* Clickhouse official documentation_Spark JDBC writes some pits of ClickHouse  https://blog.csdn.net/weixin_39615984/article/details/111206050
* ClickHouse data import (Flink, Spark, Kafka, MySQL, Hive) https://zhuanlan.zhihu.com/p/299094269 
* Baifendian Big Data Technical Team: Practice of ClickHouse data synchronization solutionbased on multiple Spark tasks. https://www.6aiq.com/article/1635461873075
* SPARK-CLICKHOUSE-ES REAL-TIME PROJECT EIGHTH DAY-PRECISE ONE-TIME CONSUMPTION SAVE OFFSET. https://www.freesion.com/article/71421322524/
* Still struggling with real-time data warehouse selection, Spark + ClickHouse makes yoamazing! https://dbaplus.cn/news-73-3806-1.html 
* HDFS+ClickHouse+Spark: A lightweight big data analysis system from 0 to 1. https://juejin.cn/post/6850418114962653198
* ClickHouse Clustering for Spark Developer http://blog.madhukaraphatak.com/clickouse-clustering-spark-developer/
* «Иногда приходится заглядывать в код Spark»: Александр Морозов (SEMrush) об использовании Scala, Spark и ClickHouse.  https://habr.com/ru/company/jugru/blog/341288/
