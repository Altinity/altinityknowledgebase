---
title: "Precreate parts using clickhouse-local"
linkTitle: "Precreate parts using clickhouse-local"
weight: 100
description: >-
     Precreate parts using clickhouse-local.
---

## Precreate parts using clickhouse-local

the code below were testes on 23.3

```
## 1. Imagine we want to process this file:

cat <<EOF > /tmp/data.csv
1,2020-01-01,"String"
2,2020-02-02,"Another string"
3,2020-03-03,"One more string"
4,2020-01-02,"String for first partition"
EOF

rm -rf /tmp/precreate_parts
mkdir -p /tmp/precreate_parts
cd /tmp/precreate_parts

## 2. that is the metadata for the table we want to fill
## schema should match the schema of the table from server
## (the easiest way is just to copy it from the server)

## I've added sleepEachRow(0.5) here just to mimic slow insert

clickhouse-local --path=. --query="CREATE DATABASE local"
clickhouse-local --path=. --query="CREATE TABLE local.test (id UInt64, d Date, s String, x MATERIALIZED sleepEachRow(0.5)) Engine=MergeTree ORDER BY id PARTITION BY toYYYYMM(d);"

## 3. we can insert the input file into that table in different manners:

## a) just plain insert
cat /tmp/data.csv | clickhouse-local --path=. --query="INSERT INTO local.test FORMAT CSV"

## b) use File on the top of stdin (allows to tune the types)
clickhouse-local --path=. --query="CREATE TABLE local.stdin (id UInt64, d Date, s String) Engine=File(CSV, stdin)"
cat /tmp/data.csv | clickhouse-local --path=. --query="INSERT INTO local.test SELECT * FROM local.stdin"

## c) Instead of stdin you can use file engine 
clickhouse-local --path=. --query "CREATE TABLE local.data_csv (id UInt64, d Date, s String) Engine=File(CSV, '/tmp/data.csv')"
clickhouse-local --path=. --query "INSERT INTO local.test SELECT * FROM local.data_csv" 

# 4. now we have already parts created
clickhouse-local --path=. --query "SELECT _part,* FROM local.test ORDER BY id"
ls -la data/local/test/

# if needed we can even preprocess them more agressively - by doing OPTIMIZE ON that 
clickhouse-local --path=. --query "OPTIMIZE TABLE local.test FINAL"

# that works, but clickhouse will keep inactive parts (those 'unmerged') in place.
ls -la data/local/test/

# we can use a bit hacky way to force it to remove inactive parts them
clickhouse-local --path=. --query "ALTER TABLE local.test MODIFY SETTING old_parts_lifetime=0, cleanup_delay_period=0, cleanup_delay_period_random_add=0"

## needed to give background threads time to clean inactive parts (max_block_size allows to stop that quickly if needed)
clickhouse-local --path=. --query "SELECT count() FROM numbers(100) WHERE sleepEachRow(0.1) SETTINGS max_block_size=1"

ls -la data/local/test/
clickhouse-local --path=. --query "SELECT _part,* FROM local.test ORDER BY id"
```

