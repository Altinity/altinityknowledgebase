---
title: "Inferring Schema from AvroConfluent Messages in Kafka for ClickHouse"
linkTitle: "Schema Inference for Kafka"
weight: 100
description: >-
     Learn how to define Kafka table structures in ClickHouse by using Avro's schema registry & sample message.
---

## Inferring Schema from AvroConfluent Messages in Kafka for ClickHouse

To consume messages from Kafka within ClickHouse, you need to define the `ENGINE=Kafka` table structure with all the column names and types.
This task can be particularly challenging when dealing with complex Avro messages, as manually determining the exact schema for
ClickHouse is both tricky and time-consuming. This complexity is particularly frustrating in the case of Avro formats,
where the column names and their types are already clearly defined in the schema registry.

Although ClickHouse supports schema inference for files, it does not natively support this for Kafka streams.

Here’s a workaround to infer the schema using AvroConfluent messages:

### Step 1: Capture and Store a Raw Kafka Message

First, create a table in ClickHouse to consume a raw message from Kafka and store it as a file:

```sql
CREATE TABLE test_kafka (raw String) ENGINE = Kafka 
SETTINGS kafka_broker_list = 'localhost:29092', 
         kafka_topic_list = 'movies-raw', 
         kafka_format = 'RawBLOB', -- Don't try to parse the message, return it 'as is'
         kafka_group_name = 'tmp_test'; -- Using some dummy consumer group here.

INSERT INTO FUNCTION file('./avro_raw_sample.avro', 'RawBLOB') 
SELECT * FROM test_kafka LIMIT 1 
SETTINGS max_block_size=1, stream_like_engine_allow_direct_select=1;

DROP TABLE test_kafka;
```

### Step 2: Infer Schema Using the Stored File
Using the stored raw message, let ClickHouse infer the schema based on the AvroConfluent format and a specified schema registry URL:

```sql
CREATE TEMPORARY TABLE test AS 
SELECT * FROM file('./avro_raw_sample.avro', 'AvroConfluent') 
SETTINGS format_avro_schema_registry_url='http://localhost:8085';

SHOW CREATE TEMPORARY TABLE test\G;
```
The output from the `SHOW CREATE` command will display the inferred schema, for example:

```plaintext
Row 1:
──────
statement: CREATE TEMPORARY TABLE test
(
    `movie_id` Int64,
    `title` String,
    `release_year` Int64
)
ENGINE = Memory
```

### Step 3: Create the Kafka Table with the Inferred Schema
Now, use the inferred schema to create the Kafka table:

```sql
CREATE TABLE movies_kafka
(
    `movie_id` Int64,
    `title` String,
    `release_year` Int64
)
ENGINE = Kafka
SETTINGS kafka_broker_list = 'localhost:29092',
         kafka_topic_list = 'movies-raw',
         kafka_format = 'AvroConfluent',
         kafka_group_name = 'movies',
         kafka_schema_registry_url = 'http://localhost:8085';
```

This approach reduces manual schema definition efforts and enhances data integration workflows by utilizing the schema inference capabilities of ClickHouse for AvroConfluent messages.

### Appendix

**Avro** is a binary serialization format used within Apache Kafka for efficiently serializing data with a compact binary format. It relies on schemas, which define the structure of the serialized data, to ensure robust data compatibility and type safety.

**Schema Registry** is a service that provides a centralized repository for Avro schemas. It helps manage and enforce schemas across applications, ensuring that the data exchanged between producers and consumers adheres to a predefined format, and facilitates schema evolution in a safe manner.

In ClickHouse, the **Avro** format is used for data that contains the schema embedded directly within the file or message. This means the structure of the data is defined and included with the data itself, allowing for self-describing messages.

On the other hand, the **AvroConfluent** format in ClickHouse is specifically designed to work with the Confluent Schema Registry. This format expects the schema to be managed externally in a schema registry rather than being embedded within each message. It retrieves schema information from the Schema Registry, which allows for centralized schema management and versioning, facilitating easier schema evolution and enforcement across different applications using Kafka.
