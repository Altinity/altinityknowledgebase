---
title: "MSSQL bcp pipe to clickhouse-client"
linkTitle: "Export from MSSQL to ClickHouse"
weight: 100
description: >-
     Export from MSSQL to ClickHouse
---

## How to pipe data from bcp export tool for MSSQL database

### Prepare tables

```bash
LAPTOP.localdomain :) CREATE TABLE tbl(key UInt32) ENGINE=MergeTree ORDER BY key;

root@LAPTOP:/home/user# sqlcmd -U sa -P Password78
1> WITH t0(i) AS (SELECT 0 UNION ALL SELECT 0), t1(i) AS (SELECT 0 FROM t0 a, t0 b), t2(i) AS (SELECT 0 FROM t1 a, t1 b), t3(i) AS (SELECT 0 FROM t2 a, t2 b), t4(i) AS (SELECT 0 FROM t3 a, t3 b), t5(i) AS (SELECT 0 FROM t4 a, t3 b),n(i) AS (SELECT ROW_NUMBER() OVER(ORDER BY (SELECT 0)) FROM t5) SELECT i INTO tbl FROM n WHERE i BETWEEN 1 AND 16777216
2> GO

(16777216 rows affected)

root@LAPTOP:/home/user# sqlcmd -U sa -P Password78 -Q "SELECT count(*) FROM tbl"

-----------
   16777216

(1 rows affected)
```

### Piping

```bash
root@LAPTOP:/home/user# mkfifo import_pipe
root@LAPTOP:/home/user# bcp "SELECT * FROM tbl" queryout import_pipe -t, -c -b 200000 -U sa -P Password78 -S localhost &
[1] 6038
root@LAPTOP:/home/user#
Starting copy...
1000 rows successfully bulk-copied to host-file. Total received: 1000
1000 rows successfully bulk-copied to host-file. Total received: 2000
1000 rows successfully bulk-copied to host-file. Total received: 3000
1000 rows successfully bulk-copied to host-file. Total received: 4000
1000 rows successfully bulk-copied to host-file. Total received: 5000
1000 rows successfully bulk-copied to host-file. Total received: 6000
1000 rows successfully bulk-copied to host-file. Total received: 7000
1000 rows successfully bulk-copied to host-file. Total received: 8000
1000 rows successfully bulk-copied to host-file. Total received: 9000
1000 rows successfully bulk-copied to host-file. Total received: 10000
1000 rows successfully bulk-copied to host-file. Total received: 11000
1000 rows successfully bulk-copied to host-file. Total received: 12000
1000 rows successfully bulk-copied to host-file. Total received: 13000
1000 rows successfully bulk-copied to host-file. Total received: 14000
1000 rows successfully bulk-copied to host-file. Total received: 15000
1000 rows successfully bulk-copied to host-file. Total received: 16000
1000 rows successfully bulk-copied to host-file. Total received: 17000
1000 rows successfully bulk-copied to host-file. Total received: 18000
1000 rows successfully bulk-copied to host-file. Total received: 19000
1000 rows successfully bulk-copied to host-file. Total received: 20000
1000 rows successfully bulk-copied to host-file. Total received: 21000
1000 rows successfully bulk-copied to host-file. Total received: 22000
1000 rows successfully bulk-copied to host-file. Total received: 23000
-- Enter
root@LAPTOP:/home/user# cat import_pipe | clickhouse-client --query "INSERT INTO tbl FORMAT CSV" &
...
1000 rows successfully bulk-copied to host-file. Total received: 16769000
1000 rows successfully bulk-copied to host-file. Total received: 16770000
1000 rows successfully bulk-copied to host-file. Total received: 16771000
1000 rows successfully bulk-copied to host-file. Total received: 16772000
1000 rows successfully bulk-copied to host-file. Total received: 16773000
1000 rows successfully bulk-copied to host-file. Total received: 16774000
1000 rows successfully bulk-copied to host-file. Total received: 16775000
1000 rows successfully bulk-copied to host-file. Total received: 16776000
1000 rows successfully bulk-copied to host-file. Total received: 16777000
16777216 rows copied.
Network packet size (bytes): 4096
Clock Time (ms.) Total     : 11540  Average : (1453831.5 rows per sec.)

[1]-  Done                    bcp "SELECT * FROM tbl" queryout import_pipe -t, -c -b 200000 -U sa -P Password78 -S localhost
[2]+  Done                    cat import_pipe | clickhouse-client --query "INSERT INTO tbl FORMAT CSV"
```

### Another shell

```bash
root@LAPTOP:/home/user# for i in `seq 1 600`; do clickhouse-client -q "select count() from tbl";sleep 1;  done
0
0
0
0
0
0
1048545
4194180
6291270
9436905
11533995
13631085
16777216
16777216
16777216
16777216
```
