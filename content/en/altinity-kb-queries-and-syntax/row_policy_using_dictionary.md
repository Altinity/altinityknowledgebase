---
title: "Row policies overhead (hiding 'removed' tenants)"
linkTitle: "Row policies overhead"
weight: 100
description: >
      One more approach to hide (delete) rows in ClickHouse®
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

INSERT INTO test_delete  -- multiple small tenants
SELECT
    number%5000,
    number,
    toDateTime('2020-01-01')+number/10,
    concat('some_looong_string', toString(number)), 
FROM numbers(1e8);
```

```sql
Q1) SELECT tenant, count() FROM test_delete GROUP BY tenant ORDER BY tenant LIMIT 6;
┌─tenant─┬──count()─┐
│      0 │ 20020000 │
│      1 │ 20020000 │
│      2 │ 20020000 │
│      3 │ 20020000 │
│      4 │ 20020000 │
│      5 │    20000 │
└────────┴──────────┘
6 rows in set. Elapsed: 0.285 sec. Processed 200.00 million rows, 1.60 GB (702.60 million rows/s., 5.62 GB/s.)

Q2) SELECT uniq(value_a) FROM test_delete where tenant = 4;
┌─uniq(value_a)─┐
│      20016427 │
└───────────────┘
1 row in set. Elapsed: 0.265 sec. Processed 20.23 million rows, 863.93 MB (76.33 million rows/s., 3.26 GB/s.)

Q3) SELECT max(ts) FROM test_delete where tenant = 4;
┌─────────────max(ts)─┐
│ 2020-04-25 17:46:39 │
└─────────────────────┘
1 row in set. Elapsed: 0.062 sec. Processed 20.23 million rows, 242.31 MB (324.83 million rows/s., 3.89 GB/s.)

Q4) SELECT max(ts) FROM test_delete where tenant = 4 and key = 444;
┌─────────────max(ts)─┐
│ 2020-01-01 00:00:44 │
└─────────────────────┘
1 row in set. Elapsed: 0.009 sec. Processed 212.99 thousand rows, 1.80 MB (24.39 million rows/s., 206.36 MB/s.)
```

## row policy using expression

```sql
CREATE ROW POLICY pol1 ON test_delete USING tenant not in (1,2,3) TO all;

Q1) SELECT tenant, count() FROM test_delete GROUP BY tenant ORDER BY tenant LIMIT 6;
┌─tenant─┬──count()─┐
│      0 │ 20020000 │
│      4 │ 20020000 │
│      5 │    20000 │
│      6 │    20000 │
│      7 │    20000 │
│      8 │    20000 │
└────────┴──────────┘
6 rows in set. Elapsed: 0.333 sec. Processed 140.08 million rows, 1.12 GB (420.59 million rows/s., 3.36 GB/s.)

Q2) SELECT uniq(value_a) FROM test_delete where tenant = 4;
┌─uniq(value_a)─┐
│      20016427 │
└───────────────┘
1 row in set. Elapsed: 0.287 sec. Processed 20.23 million rows, 863.93 MB (70.48 million rows/s., 3.01 GB/s.)

Q3) SELECT max(ts) FROM test_delete where tenant = 4;
┌─────────────max(ts)─┐
│ 2020-04-25 17:46:39 │
└─────────────────────┘
1 row in set. Elapsed: 0.080 sec. Processed 20.23 million rows, 242.31 MB (254.20 million rows/s., 3.05 GB/s.)

Q4) SELECT max(ts) FROM test_delete where tenant = 4 and key = 444;
┌─────────────max(ts)─┐
│ 2020-01-01 00:00:44 │
└─────────────────────┘
1 row in set. Elapsed: 0.011 sec. Processed 212.99 thousand rows, 3.44 MB (19.53 million rows/s., 315.46 MB/s.)

Q5) SELECT uniq(value_a) FROM test_delete where tenant = 1;
┌─uniq(value_a)─┐
│             0 │
└───────────────┘
1 row in set. Elapsed: 0.008 sec. Processed 180.22 thousand rows, 1.44 MB (23.69 million rows/s., 189.54 MB/s.)

DROP ROW POLICY pol1 ON test_delete;
```

## row policy using table subquery

```sql
create table deleted_tenants(tenant Int64) ENGINE=MergeTree order by tenant;

CREATE ROW POLICY pol1 ON test_delete USING tenant not in deleted_tenants TO all;

SELECT tenant, count() FROM test_delete GROUP BY tenant ORDER BY tenant LIMIT 6;
┌─tenant─┬──count()─┐
│      0 │ 20020000 │
│      1 │ 20020000 │
│      2 │ 20020000 │
│      3 │ 20020000 │
│      4 │ 20020000 │
│      5 │    20000 │
└────────┴──────────┘
6 rows in set. Elapsed: 0.455 sec. Processed 200.00 million rows, 1.60 GB (439.11 million rows/s., 3.51 GB/s.)

insert into deleted_tenants values(1),(2),(3);

Q1) SELECT tenant, count() FROM test_delete GROUP BY tenant ORDER BY tenant LIMIT 6;
┌─tenant─┬──count()─┐
│      0 │ 20020000 │
│      4 │ 20020000 │
│      5 │    20000 │
│      6 │    20000 │
│      7 │    20000 │
│      8 │    20000 │
└────────┴──────────┘
6 rows in set. Elapsed: 0.329 sec. Processed 140.08 million rows, 1.12 GB (426.34 million rows/s., 3.41 GB/s.)

Q2) SELECT uniq(value_a) FROM test_delete where tenant = 4;
┌─uniq(value_a)─┐
│      20016427 │
└───────────────┘
1 row in set. Elapsed: 0.287 sec. Processed 20.23 million rows, 863.93 MB (70.56 million rows/s., 3.01 GB/s.)

Q3) SELECT max(ts) FROM test_delete where tenant = 4;
┌─────────────max(ts)─┐
│ 2020-04-25 17:46:39 │
└─────────────────────┘
1 row in set. Elapsed: 0.080 sec. Processed 20.23 million rows, 242.31 MB (251.39 million rows/s., 3.01 GB/s.)

Q4) SELECT max(ts) FROM test_delete where tenant = 4 and key = 444;
┌─────────────max(ts)─┐
│ 2020-01-01 00:00:44 │
└─────────────────────┘
1 row in set. Elapsed: 0.010 sec. Processed 213.00 thousand rows, 3.44 MB (20.33 million rows/s., 328.44 MB/s.)

Q5) SELECT uniq(value_a) FROM test_delete where tenant = 1;
┌─uniq(value_a)─┐
│             0 │
└───────────────┘
1 row in set. Elapsed: 0.008 sec. Processed 180.23 thousand rows, 1.44 MB (22.11 million rows/s., 176.90 MB/s.)

DROP ROW POLICY pol1 ON test_delete;
DROP TABLE deleted_tenants;
```

## row policy using external dictionary (NOT dictHas)

```sql
create table deleted_tenants(tenant Int64, deleted UInt8 default 1) ENGINE=MergeTree order by tenant;

insert into deleted_tenants(tenant) values(1),(2),(3);

CREATE DICTIONARY deleted_tenants_dict (tenant UInt64, deleted UInt8) 
PRIMARY KEY tenant SOURCE(CLICKHOUSE(TABLE deleted_tenants)) 
LIFETIME(600) LAYOUT(FLAT());

CREATE ROW POLICY pol1 ON test_delete USING NOT dictHas('deleted_tenants_dict', tenant) TO all;

Q1) SELECT tenant, count() FROM test_delete GROUP BY tenant ORDER BY tenant LIMIT 6;
┌─tenant─┬──count()─┐
│      0 │ 20020000 │
│      4 │ 20020000 │
│      5 │    20000 │
│      6 │    20000 │
│      7 │    20000 │
│      8 │    20000 │
└────────┴──────────┘
6 rows in set. Elapsed: 0.388 sec. Processed 200.00 million rows, 1.60 GB (515.79 million rows/s., 4.13 GB/s.)

Q2) SELECT uniq(value_a) FROM test_delete where tenant = 4;
┌─uniq(value_a)─┐
│      20016427 │
└───────────────┘
1 row in set. Elapsed: 0.291 sec. Processed 20.23 million rows, 863.93 MB (69.47 million rows/s., 2.97 GB/s.)

Q3) SELECT max(ts) FROM test_delete where tenant = 4;
┌─────────────max(ts)─┐
│ 2020-04-25 17:46:39 │
└─────────────────────┘
1 row in set. Elapsed: 0.084 sec. Processed 20.23 million rows, 242.31 MB (240.07 million rows/s., 2.88 GB/s.)

Q4) SELECT max(ts) FROM test_delete where tenant = 4 and key = 444;
┌─────────────max(ts)─┐
│ 2020-01-01 00:00:44 │
└─────────────────────┘
1 row in set. Elapsed: 0.010 sec. Processed 212.99 thousand rows, 3.44 MB (21.45 million rows/s., 346.56 MB/s.)

Q5) SELECT uniq(value_a) FROM test_delete where tenant = 1;
┌─uniq(value_a)─┐
│             0 │
└───────────────┘
1 row in set. Elapsed: 0.046 sec. Processed 20.22 million rows, 161.74 MB (440.26 million rows/s., 3.52 GB/s.)

DROP ROW POLICY pol1 ON test_delete;
DROP DICTIONARY deleted_tenants_dict;
DROP TABLE deleted_tenants;
```

## row policy using external dictionary (dictHas)

```sql
create table deleted_tenants(tenant Int64, deleted UInt8 default 1) ENGINE=MergeTree order by tenant;

insert into deleted_tenants(tenant) select distinct tenant from test_delete where tenant not in (1,2,3);

CREATE DICTIONARY deleted_tenants_dict (tenant UInt64, deleted UInt8) 
PRIMARY KEY tenant SOURCE(CLICKHOUSE(TABLE deleted_tenants)) 
LIFETIME(600) LAYOUT(FLAT());

CREATE ROW POLICY pol1 ON test_delete USING dictHas('deleted_tenants_dict', tenant) TO all;

Q1) SELECT tenant, count() FROM test_delete GROUP BY tenant ORDER BY tenant LIMIT 6;
┌─tenant─┬──count()─┐
│      0 │ 20020000 │
│      4 │ 20020000 │
│      5 │    20000 │
│      6 │    20000 │
│      7 │    20000 │
│      8 │    20000 │
└────────┴──────────┘
6 rows in set. Elapsed: 0.399 sec. Processed 200.00 million rows, 1.60 GB (501.18 million rows/s., 4.01 GB/s.)

Q2) SELECT uniq(value_a) FROM test_delete where tenant = 4;
┌─uniq(value_a)─┐
│      20016427 │
└───────────────┘
1 row in set. Elapsed: 0.284 sec. Processed 20.23 million rows, 863.93 MB (71.30 million rows/s., 3.05 GB/s.)

Q3) SELECT max(ts) FROM test_delete where tenant = 4;
┌─────────────max(ts)─┐
│ 2020-04-25 17:46:39 │
└─────────────────────┘
1 row in set. Elapsed: 0.080 sec. Processed 20.23 million rows, 242.31 MB (251.88 million rows/s., 3.02 GB/s.)

Q4) SELECT max(ts) FROM test_delete where tenant = 4 and key = 444;
┌─────────────max(ts)─┐
│ 2020-01-01 00:00:44 │
└─────────────────────┘
1 row in set. Elapsed: 0.010 sec. Processed 212.99 thousand rows, 3.44 MB (22.01 million rows/s., 355.50 MB/s.)

Q5) SELECT uniq(value_a) FROM test_delete where tenant = 1;
┌─uniq(value_a)─┐
│             0 │
└───────────────┘
1 row in set. Elapsed: 0.034 sec. Processed 20.22 million rows, 161.74 MB (589.90 million rows/s., 4.72 GB/s.)

DROP ROW POLICY pol1 ON test_delete;
DROP DICTIONARY deleted_tenants_dict;
DROP TABLE deleted_tenants;
```

## row policy using engine=Set
```sql
create table deleted_tenants(tenant Int64) ENGINE=Set;

insert into deleted_tenants(tenant) values(1),(2),(3);

CREATE ROW POLICY pol1 ON test_delete USING tenant not in deleted_tenants TO all;

Q1) SELECT tenant, count() FROM test_delete GROUP BY tenant ORDER BY tenant LIMIT 6;
┌─tenant─┬──count()─┐
│      0 │ 20020000 │
│      4 │ 20020000 │
│      5 │    20000 │
│      6 │    20000 │
│      7 │    20000 │
│      8 │    20000 │
└────────┴──────────┘
6 rows in set. Elapsed: 0.322 sec. Processed 200.00 million rows, 1.60 GB (621.38 million rows/s., 4.97 GB/s.)

Q2) SELECT uniq(value_a) FROM test_delete where tenant = 4;
┌─uniq(value_a)─┐
│      20016427 │
└───────────────┘
1 row in set. Elapsed: 0.275 sec. Processed 20.23 million rows, 863.93 MB (73.56 million rows/s., 3.14 GB/s.)

Q3) SELECT max(ts) FROM test_delete where tenant = 4;
┌─────────────max(ts)─┐
│ 2020-04-25 17:46:39 │
└─────────────────────┘
1 row in set. Elapsed: 0.084 sec. Processed 20.23 million rows, 242.31 MB (240.07 million rows/s., 2.88 GB/s.)

Q4) SELECT max(ts) FROM test_delete where tenant = 4 and key = 444;
┌─────────────max(ts)─┐
│ 2020-01-01 00:00:44 │
└─────────────────────┘
1 row in set. Elapsed: 0.010 sec. Processed 212.99 thousand rows, 3.44 MB (20.69 million rows/s., 334.18 MB/s.)

Q5) SELECT uniq(value_a) FROM test_delete where tenant = 1;
┌─uniq(value_a)─┐
│             0 │
└───────────────┘
1 row in set. Elapsed: 0.030 sec. Processed 20.22 million rows, 161.74 MB (667.06 million rows/s., 5.34 GB/s.)

DROP ROW POLICY pol1 ON test_delete;
DROP TABLE deleted_tenants;
```



## results

expression: `CREATE ROW POLICY pol1 ON test_delete USING tenant not in (1,2,3) TO all;`

table subq: `CREATE ROW POLICY pol1 ON test_delete USING tenant not in deleted_tenants TO all;`

ext. dict. NOT dictHas : `CREATE ROW POLICY pol1 ON test_delete USING NOT dictHas('deleted_tenants_dict', tenant) TO all;`

ext. dict. dictHas : 

| Q  |  no policy      | expression      | table subq      | ext. dict. NOT  | ext. dict.      | engine=Set      |
|----|-----------------|-----------------|-----------------|-----------------|-----------------|-----------------|
| Q1 | 0.285 / 200.00m | 0.333 / 140.08m | 0.329 / 140.08m | 0.388 / 200.00m | 0.399 / 200.00m | 0.322 / 200.00m |
| Q2 | 0.265 / 20.23m  | 0.287 / 20.23m  | 0.287 / 20.23m  | 0.291 / 20.23m  | 0.284 / 20.23m  | 0.275 / 20.23m  |
| Q3 | 0.062 / 20.23m  | 0.080 / 20.23m  | 0.080 / 20.23m  | 0.084 / 20.23m  | 0.080 / 20.23m  | 0.084 / 20.23m  |
| Q4 | 0.009 / 212.99t | 0.011 / 212.99t | 0.010 / 213.00t | 0.010 / 212.99t | 0.010 / 212.99t | 0.010 / 212.99t |
| Q5 |                 | 0.008 / 180.22t | 0.008 / 180.23t | 0.046 / 20.22m  | 0.034 / 20.22m  | 0.030 / 20.22m  |

Expression in row policy seems to be fastest way (Q1, Q5).
