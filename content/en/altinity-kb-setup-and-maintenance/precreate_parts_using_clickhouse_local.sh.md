---
title: "Precreate parts using clickhouse-local"
linkTitle: "Precreate parts using clickhouse-local"
weight: 100
description: >-
     Precreate parts using clickhouse-local.
---

## Precreate parts using clickhouse-local

```
rm -rf /tmp/precreate_parts


mkdir -p /tmp/precreate_parts/metadata/local/

cd /tmp/precreate_parts

## 1. Imagine we want to process this file:

cat <<EOF > /tmp/data.csv
1,2020-01-01,"String"
2,2020-02-02,"Another string"
3,2020-03-03,"One more string"
4,2020-01-02,"String for first partition"
EOF

## 2. that is the metadata for the table we want to fill
## schema should match the schema of the table from server
## (the easiest way is just to copy it from the server)

## I've added sleepEachRow(0.5) here just to mimic slow insert

cat <<EOF > metadata/local/test.sql
ATTACH TABLE local.test (id UInt64, d Date, s String, x MATERIALIZED sleepEachRow(0.5)) Engine=MergeTree ORDER BY id PARTITION BY toYYYYMM(d);
EOF

## 3a. that is the metadata for the input file we want to read
## it should match the structure of source file

## use stdin to read from pipe 

cat <<EOF > metadata/local/stdin.sql 
ATTACH TABLE local.stdin (id UInt64, d Date, s String) Engine=File(CSV, stdin);
EOF

## 3b. Instead of stdin you can use file path 

cat <<EOF > metadata/local/data_csv.sql 
ATTACH TABLE local.data_csv (id UInt64, d Date, s String) Engine=File(CSV, '/tmp/data.csv');
EOF

## All preparations done,
## the rest is simple:

# option a (if 3a used) with pipe / reading stdin

cat /tmp/data.csv | clickhouse-local --query "INSERT INTO local.test SELECT * FROM local.stdin" -- --path=.

# option b (if 3b used) 0 with filepath 
cd /tmp/precreate_parts
clickhouse-local --query "INSERT INTO local.test SELECT * FROM local.data_csv" -- --path=.


# now you can check what was inserted (i did both options so i have doubled data)

clickhouse-local --query "SELECT _part,* FROM local.test ORDER BY id" -- --path=.
202001_4_4_0	1	2020-01-01	String
202001_1_1_0	1	2020-01-01	String
202002_5_5_0	2	2020-02-02	Another string
202002_2_2_0	2	2020-02-02	Another string
202003_6_6_0	3	2020-03-03	One more string
202003_3_3_0	3	2020-03-03	One more string
202001_4_4_0	4	2020-01-02	String for first partition
202001_1_1_0	4	2020-01-02	String for first partition

# But you can't do OPTIMIZE (local will die with coredump) :) That would be too good
# clickhouse-local --query "OPTIMIZE TABLE local.test FINAL" -- --path=.

## now you can upload those parts to a server (in detached subfolder) and attach them.

mfilimonov@laptop5591:/tmp/precreate_parts$ ls -la data/local/test/
total 40
drwxrwxr-x 9 mfilimonov mfilimonov 4096 paź 15 11:15 .
drwxrwxr-x 3 mfilimonov mfilimonov 4096 paź 15 11:15 ..
drwxrwxr-x 2 mfilimonov mfilimonov 4096 paź 15 11:15 202001_1_1_0
drwxrwxr-x 2 mfilimonov mfilimonov 4096 paź 15 11:15 202001_4_4_0
drwxrwxr-x 2 mfilimonov mfilimonov 4096 paź 15 11:15 202002_2_2_0
drwxrwxr-x 2 mfilimonov mfilimonov 4096 paź 15 11:15 202002_5_5_0
drwxrwxr-x 2 mfilimonov mfilimonov 4096 paź 15 11:15 202003_3_3_0
drwxrwxr-x 2 mfilimonov mfilimonov 4096 paź 15 11:15 202003_6_6_0
drwxrwxr-x 2 mfilimonov mfilimonov 4096 paź 15 11:15 detached
-rw-rw-r-- 1 mfilimonov mfilimonov    1 paź 15 11:15 format_version.txt


mfilimonov@laptop5591:/tmp/precreate_parts$ ls -la data/local/test/202001_1_1_0/
total 44
drwxrwxr-x 2 mfilimonov mfilimonov 4096 paź 15 11:15 .
drwxrwxr-x 9 mfilimonov mfilimonov 4096 paź 15 11:15 ..
-rw-rw-r-- 1 mfilimonov mfilimonov  250 paź 15 11:15 checksums.txt
-rw-rw-r-- 1 mfilimonov mfilimonov   79 paź 15 11:15 columns.txt
-rw-rw-r-- 1 mfilimonov mfilimonov    1 paź 15 11:15 count.txt
-rw-rw-r-- 1 mfilimonov mfilimonov  155 paź 15 11:15 data.bin
-rw-rw-r-- 1 mfilimonov mfilimonov  144 paź 15 11:15 data.mrk3
-rw-rw-r-- 1 mfilimonov mfilimonov   10 paź 15 11:15 default_compression_codec.txt
-rw-rw-r-- 1 mfilimonov mfilimonov    4 paź 15 11:15 minmax_d.idx
-rw-rw-r-- 1 mfilimonov mfilimonov    4 paź 15 11:15 partition.dat
-rw-rw-r-- 1 mfilimonov mfilimonov   16 paź 15 11:15 primary.idx
```
