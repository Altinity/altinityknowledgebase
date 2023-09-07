---
title: "Row policies overhead (hiding 'removed' tenants)"
linkTitle: "Row policies overhead"
weight: 100
description: >
      one more approach how to hide (delete) rows in Clickhouse.
---

## No row policy

```sql
CREATE TABLE test_delete
(
    tenant Int64,
    key Int64,
    ts DateTime,
    value_a String
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(ts)
ORDER BY (tenant, key, ts);

INSERT INTO test_delete 
SELECT
    number%5,
    number,
    toDateTime('2020-01-01')+number/10,
    concat('some_looong_string', toString(number)),
FROM numbers(1e8);
```

```sql
Q1) SELECT tenant, count() FROM test_delete GROUP BY tenant ORDER BY tenant;
┌─tenant─┬──count()─┐
│      0 │ 20000000 │
│      1 │ 20000000 │
│      2 │ 20000000 │
│      3 │ 20000000 │
│      4 │ 20000000 │
└────────┴──────────┘
5 rows in set. Elapsed: 0.152 sec. Processed 100.00 million rows, 800.00 MB (659.95 million rows/s., 5.28 GB/s.)

Q2) SELECT uniq(value_a) FROM test_delete where tenant = 4;
┌─uniq(value_a)─┐
│      20016427 │
└───────────────┘
1 row in set. Elapsed: 0.288 sec. Processed 20.09 million rows, 861.52 MB (69.76 million rows/s., 2.99 GB/s.)

Q3) SELECT max(ts) FROM test_delete where tenant = 4;
┌─────────────max(ts)─┐
│ 2020-04-25 17:46:39 │
└─────────────────────┘
1 row in set. Elapsed: 0.068 sec. Processed 20.09 million rows, 241.04 MB (295.84 million rows/s., 3.55 GB/s.)

Q4) SELECT max(ts) FROM test_delete where tenant = 4 and key = 444;
┌─────────────max(ts)─┐
│ 2020-01-01 00:00:44 │
└─────────────────────┘
1 row in set. Elapsed: 0.013 sec. Processed 196.61 thousand rows, 3.93 MB (15.70 million rows/s., 314.06 MB/s.)
```

## row policy using expression

```sql
CREATE ROW POLICY pol1 ON test_delete USING tenant not in (1,2,3) TO all;

Q1) SELECT tenant, count() FROM test_delete GROUP BY tenant ORDER BY tenant;
┌─tenant─┬──count()─┐
│      0 │ 20000000 │
│      4 │ 20000000 │
└────────┴──────────┘
2 rows in set. Elapsed: 0.103 sec. Processed 40.57 million rows, 324.54 MB (392.89 million rows/s., 3.14 GB/s.)

Q2) SELECT uniq(value_a) FROM test_delete where tenant = 4;
┌─uniq(value_a)─┐
│      20016427 │
└───────────────┘
1 row in set. Elapsed: 0.316 sec. Processed 20.09 million rows, 861.52 MB (63.57 million rows/s., 2.73 GB/s.)

Q3) SELECT max(ts) FROM test_delete where tenant = 4;
┌─────────────max(ts)─┐
│ 2020-04-25 17:46:39 │
└─────────────────────┘
1 row in set. Elapsed: 0.087 sec. Processed 20.09 million rows, 241.04 MB (230.40 million rows/s., 2.76 GB/s.)

Q4) SELECT max(ts) FROM test_delete where tenant = 4 and key = 444;
┌─────────────max(ts)─┐
│ 2020-01-01 00:00:44 │
└─────────────────────┘
1 row in set. Elapsed: 0.011 sec. Processed 196.61 thousand rows, 3.93 MB (18.51 million rows/s., 370.24 MB/s.)

Q5) SELECT uniq(value_a) FROM test_delete where tenant = 1;
┌─uniq(value_a)─┐
│             0 │
└───────────────┘
1 row in set. Elapsed: 0.004 sec.

DROP ROW POLICY pol1 ON test_delete;
```

## row policy using table subquery

```sql
create table deleted_tenants(tenant Int64) ENGINE=MergeTree order by tenant;

CREATE ROW POLICY pol1 ON test_delete USING tenant not in deleted_tenants TO all;

SELECT tenant, count() FROM test_delete GROUP BY tenant ORDER BY tenant;
┌─tenant─┬──count()─┐
│      0 │ 20000000 │
│      1 │ 20000000 │
│      2 │ 20000000 │
│      3 │ 20000000 │
│      4 │ 20000000 │
└────────┴──────────┘
5 rows in set. Elapsed: 0.225 sec. Processed 100.00 million rows, 800.00 MB (443.53 million rows/s., 3.55 GB/s.)

insert into deleted_tenants values(1),(2),(3);

Q1) SELECT tenant, count() FROM test_delete GROUP BY tenant ORDER BY tenant;
┌─tenant─┬──count()─┐
│      0 │ 20000000 │
│      4 │ 20000000 │
└────────┴──────────┘
2 rows in set. Elapsed: 0.154 sec. Processed 100.00 million rows, 800.00 MB (651.12 million rows/s., 5.21 GB/s.)

Q2) SELECT uniq(value_a) FROM test_delete where tenant = 4;
┌─uniq(value_a)─┐
│      20016427 │
└───────────────┘
1 row in set. Elapsed: 0.296 sec. Processed 20.09 million rows, 861.52 MB (67.95 million rows/s., 2.91 GB/s.)

Q3) SELECT max(ts) FROM test_delete where tenant = 4;
┌─────────────max(ts)─┐
│ 2020-04-25 17:46:39 │
└─────────────────────┘
1 row in set. Elapsed: 0.085 sec. Processed 20.09 million rows, 241.04 MB (237.36 million rows/s., 2.85 GB/s.)

Q4) SELECT max(ts) FROM test_delete where tenant = 4 and key = 444;
┌─────────────max(ts)─┐
│ 2020-01-01 00:00:44 │
└─────────────────────┘
1 row in set. Elapsed: 0.012 sec. Processed 196.61 thousand rows, 3.93 MB (15.81 million rows/s., 316.17 MB/s.)

Q5) SELECT uniq(value_a) FROM test_delete where tenant = 1;
┌─uniq(value_a)─┐
│             0 │
└───────────────┘
1 row in set. Elapsed: 0.067 sec. Processed 20.25 million rows, 162.01 MB (301.32 million rows/s., 2.41 GB/s.)

DROP ROW POLICY pol1 ON test_delete;
DROP TABLE deleted_tenants;
```

## row policy using external dictionary

```sql
create table deleted_tenants(tenant Int64, deleted UInt8 default 1) ENGINE=MergeTree order by tenant;

insert into deleted_tenants(tenant) values(1),(2),(3);

CREATE DICTIONARY deleted_tenants_dict (tenant UInt64, deleted UInt8) 
PRIMARY KEY tenant SOURCE(CLICKHOUSE(TABLE deleted_tenants)) 
LIFETIME(600) LAYOUT(FLAT());

CREATE ROW POLICY pol1 ON test_delete USING NOT dictHas('deleted_tenants_dict', tenant) TO all;
-- btw, results are the same with inversed expression USING dictHas

Q1) SELECT tenant, count() FROM test_delete GROUP BY tenant ORDER BY tenant;
┌─tenant─┬──count()─┐
│      0 │ 20000000 │
│      4 │ 20000000 │
└────────┴──────────┘
2 rows in set. Elapsed: 0.172 sec. Processed 100.00 million rows, 800.00 MB (451.83 million rows/s., 3.61 GB/s.)

Q2) SELECT uniq(value_a) FROM test_delete where tenant = 4;
┌─uniq(value_a)─┐
│      20016427 │
└───────────────┘
1 row in set. Elapsed: 0.304 sec. Processed 20.09 million rows, 861.52 MB (66.09 million rows/s., 2.83 GB/s.)

Q3) SELECT max(ts) FROM test_delete where tenant = 4;
┌─────────────max(ts)─┐
│ 2020-04-25 17:46:39 │
└─────────────────────┘
1 row in set. Elapsed: 0.087 sec. Processed 20.09 million rows, 241.04 MB (230.84 million rows/s., 2.77 GB/s.)

Q4) SELECT max(ts) FROM test_delete where tenant = 4 and key = 444;
┌─────────────max(ts)─┐
│ 2020-01-01 00:00:44 │
└─────────────────────┘
1 row in set. Elapsed: 0.010 sec. Processed 196.61 thousand rows, 3.93 MB (19.34 million rows/s., 386.80 MB/s.)

Q5) SELECT uniq(value_a) FROM test_delete where tenant = 1;
┌─uniq(value_a)─┐
│             0 │
└───────────────┘
1 row in set. Elapsed: 0.034 sec. Processed 20.25 million rows, 162.00 MB (588.12 million rows/s., 4.70 GB/s.)
```

## results

expression: `CREATE ROW POLICY pol1 ON test_delete USING tenant not in (1,2,3) TO all;`
table subq: `CREATE ROW POLICY pol1 ON test_delete USING tenant not in deleted_tenants TO all;`
ext. dict.: `CREATE ROW POLICY pol1 ON test_delete USING NOT dictHas('deleted_tenants_dict', tenant) TO all;`

| Q  |  no policy | expression | table subq | ext. dict. |
|----|------------|------------|------------|------------|
| Q1 |   0.152    | 0.103      |  0.154     |  0.172     | 
| Q2 |   0.288    | 0.316      |  0.296     |  0.304     | 
| Q3 |   0.068    | 0.087      |  0.085     |  0.087     | 
| Q4 |   0.013    | 0.011      |  0.012     |  0.010     | 
| Q5 |            | 0.004      |  0.067     |  0.034     | 

Expression in row policy seems to be fastest way.
