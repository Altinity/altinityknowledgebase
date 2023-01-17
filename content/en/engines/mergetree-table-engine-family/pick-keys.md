---
title: "How to pick an ORDER BY / PRIMARY KEY / PARTITION BY for the MergeTree-family table"
linkTitle: "Proper ordering and partitioning the MergeTree tables"
weight: 100
description: >-
     How to pick an ORDER BY / PRIMARY KEY / PARTITION BY for the MergeTree table.
---

## How to pick an ORDER BY / PRIMARY KEY

Good `order by` usually have 3 to 5 columns, from lowest cardinal on the left (and the most important for filtering) to highest cardinal (and less important for filtering).
 
Practical approach to create an good ORDER BY for a table:

1. Pick the columns you use in filtering always
2. The most important for filtering and the lowest cardinal should be the left-most. Typically it's something like `tenant_id`
3. Next column is more cardinal, less important. It can be rounded time sometimes, or `site_id`, or `source_id`, or `group_id` or something similar.
4. repeat p.3 once again (or few times)
5. if you added already all columns important for filtering and you still not addressing a single row with you pk - you can add more columns which can help to put similar records close to each other (to improve the compression)
6. if you have something like hierarchy / tree-like relations between the columns - put there the records from 'root' to 'leaves' for example (continent, country, cityname). This way clickhouse can do lookup by country / city even if continent is not specified (it will just 'check all continents')
special variants of MergeTree may require special ORDER BY to make the record unique etc.
7. For timeseries it usually make sense to put timestamp as latest column in ORDER BY, it helps with putting the same data near by for better locality. There is only 2 major patterns  for timestamps in ORDER BY: (..., toStartOf(Day|Hour|...)(timestamp), ..., timestamp) and (..., timestamp). First one is useful when your often query small part of table partition. (table partitioned by months and your read only 1-4 days 90% of times)

Some examples or good order by
```
ORDER BY (tenantid, site_id, utm_source, clientid, timestamp)
```

```
ORDER BY (site_id, toStartOfHour(timestamp), sessionid, timestamp )
PRIMARY KEY (site_id, toStartOfHour(timestamp), sessionid)
```



### For Summing / Aggregating

All dimensions go to ORDER BY, all metrics - outside of that. 

The most important for filtering columns with the lowest cardinality should be the left most.

If number of dimensions is high it's typically make sense to use a prefix of ORDER BY as a PRIMARY KEY to avoid polluting sparse index.

Examples:

```
ORDER BY (tenant_id, hour, country_code, team_id, group_id, source_id)
PRIMARY KEY (tenant_id, hour, country_code, team_id)
```

### For Replacing / Collapsing 

You need to keep all 'mutable' columns outside of ORDER BY, and have some unique id (a base to collapse duplicates) inside. 
Typically the right-most column is some row identifier. And it's often not needed in sparse index (so PRIMARY KEY can be a prefix of ORDER BY)
The rest consideration are the same. 

Examples:

```
ORDER BY (tenantid, site_id, eventid) --  utm_source is mutable, while tenantid, site_id is not
PRIMARY KEY (tenantid, site_id) -- eventid is not used for filtering, needed only for collapsing duplicates
```

### ORDER BY example


```sql
-- col1: high Cardinality
-- col2: low cardinality

CREATE TABLE tests.order_test
(    
     `col1` DateTime,    
     `col2` UInt8
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(col1)
ORDER BY (col1, col2)
--
SELECT count() 
┌───count()─┐ 
│ 126371225 │ 
└───────────┘ 
```

So let’s put the highest cardinal column to the left and the least to the right in the `ORDER BY` definition. This will impact in queries like:

```sql
SELECT * FROM order_test
WHERE col1 > toDateTime('2020-10-01')
ORDER BY col1, col2
FORMAT `Null`
```

Here for the filtering it will use the skipping index to select the parts `WHERE col1 > xxx` and the result wont be need to be ordered because the `ORDER BY` in the query aligns with the `ORDER BY` in the table and the data is already ordered in disk. 

```bash
executeQuery: (from [::ffff:192.168.11.171]:39428, user: admin) SELECT * FROM order_test WHERE col1 > toDateTime('2020-10-01') ORDER BY col1,col2 FORMAT Null; (stage: Complete)
ContextAccess (admin): Access granted: SELECT(col1, col2) ON tests.order_test
ContextAccess (admin): Access granted: SELECT(col1, col2) ON tests.order_test
InterpreterSelectQuery: FetchColumns -> Complete
tests.order_test (SelectExecutor): Key condition: (column 0 in [1601503201, +Inf))
tests.order_test (SelectExecutor): MinMax index condition: (column 0 in [1601503201, +Inf))
tests.order_test (SelectExecutor): Running binary search on index range for part 202010_367_545_8 (7612 marks)
tests.order_test (SelectExecutor): Running binary search on index range for part 202010_549_729_12 (37 marks)
tests.order_test (SelectExecutor): Running binary search on index range for part 202011_689_719_2 (1403 marks)
tests.order_test (SelectExecutor): Running binary search on index range for part 202012_550_730_12 (3 marks)
tests.order_test (SelectExecutor): Found (LEFT) boundary mark: 0
tests.order_test (SelectExecutor): Found (LEFT) boundary mark: 0
tests.order_test (SelectExecutor): Found (LEFT) boundary mark: 0
tests.order_test (SelectExecutor): Found (RIGHT) boundary mark: 37
tests.order_test (SelectExecutor): Found (RIGHT) boundary mark: 3
tests.order_test (SelectExecutor): Found (RIGHT) boundary mark: 1403
tests.order_test (SelectExecutor): Found continuous range in 11 steps
tests.order_test (SelectExecutor): Found continuous range in 3 steps
tests.order_test (SelectExecutor): Running binary search on index range for part 202011_728_728_0 (84 marks)
tests.order_test (SelectExecutor): Found continuous range in 21 steps
tests.order_test (SelectExecutor): Running binary search on index range for part 202011_725_725_0 (128 marks)
tests.order_test (SelectExecutor): Found (LEFT) boundary mark: 0
tests.order_test (SelectExecutor): Found (LEFT) boundary mark: 0
tests.order_test (SelectExecutor): Found (RIGHT) boundary mark: 84
tests.order_test (SelectExecutor): Running binary search on index range for part 202011_722_722_0 (128 marks)
tests.order_test (SelectExecutor): Found continuous range in 13 steps
tests.order_test (SelectExecutor): Found (RIGHT) boundary mark: 128
tests.order_test (SelectExecutor): Found continuous range in 14 steps
tests.order_test (SelectExecutor): Running binary search on index range for part 202011_370_686_19 (5993 marks)
tests.order_test (SelectExecutor): Found (LEFT) boundary mark: 0
tests.order_test (SelectExecutor): Found (RIGHT) boundary mark: 5993
tests.order_test (SelectExecutor): Found (LEFT) boundary mark: 0
tests.order_test (SelectExecutor): Found continuous range in 25 steps
tests.order_test (SelectExecutor): Found (RIGHT) boundary mark: 128
tests.order_test (SelectExecutor): Found continuous range in 14 steps
tests.order_test (SelectExecutor): Found (LEFT) boundary mark: 0
tests.order_test (SelectExecutor): Found (RIGHT) boundary mark: 7612
tests.order_test (SelectExecutor): Found continuous range in 25 steps
tests.order_test (SelectExecutor): Selected 8/9 parts by partition key, 8 parts by primary key, 15380/15380 marks by primary key, 15380 marks to read from 8 ranges
Ok.

0 rows in set. Elapsed: 0.649 sec. Processed 125.97 million rows, 629.86 MB (194.17 million rows/s., 970.84 MB/s.)
```

If we change the `ORDER BY` expression in the query, Clickhouse will need to retrieve the rows and reorder them:

```sql
SELECT * FROM order_test
WHERE col1 > toDateTime('2020-10-01')
ORDER BY col2, col1
FORMAT `Null`
```

As seen In the `MergingSortedTransform` message, the ORDER BY in the table definition is not aligned with the ORDER BY in the query, so ClickHouse has to reorder the resultset.

```bash
executeQuery: (from [::ffff:192.168.11.171]:39428, user: admin) SELECT * FROM order_test WHERE col1 > toDateTime('2020-10-01') ORDER BY col2,col1 FORMAT Null; (stage: Complete)
ContextAccess (admin): Access granted: SELECT(col1, col2) ON tests.order_test
ContextAccess (admin): Access granted: SELECT(col1, col2) ON tests.order_test
InterpreterSelectQuery: FetchColumns -> Complete
tests.order_test (SelectExecutor): Key condition: (column 0 in [1601503201, +Inf))
tests.order_test (SelectExecutor): MinMax index condition: (column 0 in [1601503201, +Inf))
tests.order_test (SelectExecutor): Running binary search on index range for part 202010_367_545_8 (7612 marks)
tests.order_test (SelectExecutor): Running binary search on index range for part 202012_550_730_12 (3 marks)
tests.order_test (SelectExecutor): Found (LEFT) boundary mark: 0
tests.order_test (SelectExecutor): Running binary search on index range for part 202011_725_725_0 (128 marks)
tests.order_test (SelectExecutor): Found (RIGHT) boundary mark: 3
tests.order_test (SelectExecutor): Running binary search on index range for part 202011_689_719_2 (1403 marks)
tests.order_test (SelectExecutor): Running binary search on index range for part 202010_549_729_12 (37 marks)
tests.order_test (SelectExecutor): Running binary search on index range for part 202011_728_728_0 (84 marks)
tests.order_test (SelectExecutor): Found (LEFT) boundary mark: 0
tests.order_test (SelectExecutor): Found continuous range in 3 steps
tests.order_test (SelectExecutor): Found (LEFT) boundary mark: 0
tests.order_test (SelectExecutor): Found (LEFT) boundary mark: 0
tests.order_test (SelectExecutor): Found (LEFT) boundary mark: 0
tests.order_test (SelectExecutor): Running binary search on index range for part 202011_722_722_0 (128 marks)
tests.order_test (SelectExecutor): Found (RIGHT) boundary mark: 7612
tests.order_test (SelectExecutor): Found (RIGHT) boundary mark: 37
tests.order_test (SelectExecutor): Found (LEFT) boundary mark: 0
tests.order_test (SelectExecutor): Found continuous range in 11 steps
tests.order_test (SelectExecutor): Found (RIGHT) boundary mark: 1403
tests.order_test (SelectExecutor): Found (RIGHT) boundary mark: 84
tests.order_test (SelectExecutor): Found continuous range in 25 steps
tests.order_test (SelectExecutor): Running binary search on index range for part 202011_370_686_19 (5993 marks)
tests.order_test (SelectExecutor): Found continuous range in 21 steps
tests.order_test (SelectExecutor): Found (RIGHT) boundary mark: 128
tests.order_test (SelectExecutor): Found continuous range in 13 steps
tests.order_test (SelectExecutor): Found (LEFT) boundary mark: 0
tests.order_test (SelectExecutor): Found continuous range in 14 steps
tests.order_test (SelectExecutor): Found (RIGHT) boundary mark: 128
tests.order_test (SelectExecutor): Found (LEFT) boundary mark: 0
tests.order_test (SelectExecutor): Found continuous range in 14 steps
tests.order_test (SelectExecutor): Found (RIGHT) boundary mark: 5993
tests.order_test (SelectExecutor): Found continuous range in 25 steps
tests.order_test (SelectExecutor): Selected 8/9 parts by partition key, 8 parts by primary key, 15380/15380 marks by primary key, 15380 marks to read from 8 ranges
tests.order_test (SelectExecutor): MergingSortedTransform: Merge sorted 1947 blocks, 125972070 rows in 1.423973879 sec., 88465155.05499662 rows/sec., 423.78 MiB/sec
Ok.

0 rows in set. Elapsed: 1.424 sec. Processed 125.97 million rows, 629.86 MB (88.46 million rows/s., 442.28 MB/s.)
```

## PARTITION BY 

* Good size for single partition is something like 1-300Gb.
* For Summing/Replacing a bit smaller (400Mb-40Gb)
* Better to avoid touching more that few dozens of partitions with typical SELECT query.
* Single insert should bring data to one or few partitions.
* The number of partitons in table - dozen or hundreds, not thousands.

The size of partitions you can check in system.parts table.

Examples:

```
-- for time-series:
PARTITION BY toYear(timestamp)          -- long retention, not too much data
PARTITION BY toYYYYMM(timestamp)        --  
PARTITION BY toMonday(timestamp)        -- 
PARTITION BY toDate(timestamp)          --
PARTITION BY toStartOfHour(timestamp)   -- short retention, lot of data

-- for table with some incremental (non time-bounded) counter

PARTITION BY intDiv(transaction_id, 1000000)

-- for some dimention tables (always requested with WHERE userid)
PARTITION BY userid % 16
```

For the small tables (smaller than few gigabytes) partitioning is usually not needed at all (just skip `PARTITION BY` expresssion when you create the table).

### ClickHouse Anti-Patterns. Learning from Users' Mistakes

A short talk by Mikhail Filimonov

https://youtu.be/DP7l6Swkskw?t=3777
