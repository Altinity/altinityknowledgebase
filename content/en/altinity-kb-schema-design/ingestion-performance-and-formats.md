---
title: "Ingestion performance and formats"
linkTitle: "Ingestion performance and formats"
---
```sql
clickhouse-client -q 'select toString(number) s, number n, number/1000 f from numbers(100000000) format TSV' > speed.tsv
clickhouse-client -q 'select toString(number) s, number n, number/1000 f from numbers(100000000) format RowBinary' > speed.RowBinary
clickhouse-client -q 'select toString(number) s, number n, number/1000 f from numbers(100000000) format Native' > speed.Native
clickhouse-client -q 'select toString(number) s, number n, number/1000 f from numbers(100000000) format CSV' > speed.csv
clickhouse-client -q 'select toString(number) s, number n, number/1000 f from numbers(100000000) format JSONEachRow' > speed.JSONEachRow
clickhouse-client -q 'select toString(number) s, number n, number/1000 f from numbers(100000000) format Parquet' > speed.parquet
clickhouse-client -q 'select toString(number) s, number n, number/1000 f from numbers(100000000) format Avro' > speed.avro

-- Engine=Null does not have I/O / sorting overhead
-- we test only formats parsing performance.

create table n (s String, n UInt64, f Float64) Engine=Null


-- clickhouse-client parses formats itself
-- it allows to see user CPU time -- time is used in a multithreaded application
-- another option is to disable parallelism `--input_format_parallel_parsing=0`
-- real -- wall / clock time.

time clickhouse-client -t -q 'insert into n format TSV' < speed.tsv
2.693  real  0m2.728s   user  0m14.066s

time clickhouse-client -t -q 'insert into n format RowBinary' < speed.RowBinary
3.744  real  0m3.773s   user  0m4.245s

time clickhouse-client -t -q 'insert into n format Native' < speed.Native
2.359  real  0m2.382s   user  0m1.945s

time clickhouse-client -t -q 'insert into n format CSV' < speed.csv
3.296  real  0m3.328s  user  0m18.145s

time clickhouse-client -t -q 'insert into n format JSONEachRow' < speed.JSONEachRow
8.872  real  0m8.899s  user  0m30.235s

time clickhouse-client -t -q 'insert into n format Parquet' < speed.parquet
4.905  real  0m4.929s   user  0m5.478s

time clickhouse-client -t -q 'insert into n format Avro' < speed.avro
11.491  real  0m11.519s  user  0m12.166s
```

As you can see the JSONEachRow is the worst format  (user 0m30.235s) for this synthetic dataset. Native is the best (user 0m1.945s). TSV / CSV are good in wall time but spend a lot of CPU (user time).
