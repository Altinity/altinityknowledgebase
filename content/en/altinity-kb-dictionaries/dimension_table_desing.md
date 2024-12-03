---
title: "Dimension table design "
linkTitle: "Dimension table design "
description: >
    Dimension table design 
---
## Dimension table design considerations

### Choosing storage Engine

To optimize the performance of reporting queries, dimensional tables should be loaded into RAM as ClickHouse Dictionaries whenever feasible. It's becoming increasingly common to allocate 100-200GB of RAM per server specifically for these Dictionaries. Implementing sharding by tenant can further reduce the size of these dimension tables, enabling a greater portion of them to be stored in RAM and thus enhancing query speed.

Different Dictionary Layouts can take more or less RAM (in trade for speed).  

- The cached dictionary layout is ideal for minimizing the amount of RAM required to store dimensional data when the hit ratio is high. This layout allows frequently accessed data to be kept in RAM while less frequently accessed data is stored on disk, thereby optimizing memory usage without sacrificing performance.
- HASHED_ARRAY or SPARSE_HASHED dictionary layouts take less RAM than HASHED. See tests [here](https://kb.altinity.com/altinity-kb-dictionaries/altinity-kb-sparse_hashed-vs-hashed/).
- Normalization techniques can be used to lower RAM usage (see below)

If the amount of data is so high that it does not fit in the RAM even after suitable sharding, a disk-based table with an appropriate engine and its parameters can be used for accessing dimensional data in report queries.

MergeTree engines (including Replacing or Aggregating) are not tuned by default for point queries due to the high index granularity (8192) and the necessity of using FINAL (or GROUP BY) when accessing mutated data.  

When using the MergeTree engine for Dimensions, the table’s index granularity should be lowered to 256. More RAM will be used for PK, but it’s a reasonable price for reading less data from the disk and making report queries faster, and that amount can be lowered by lightweight PK design (see below).

The `EmbeddedRocksDB` engine could be used as an alternative. It performs much better than ReplacingMergeTree for highly mutated data, as it is tuned by design for random point queries and high-frequency updates. However, EmbeddedRocksDB does not support Replication, so INSERTing data to such tables should be done over a Distributed table with `internal_replication` set to false, which is vulnerable to different desync problems. Some “sync” procedures should be designed, developed, and applied after serious data ingesting incidents (like ETL crashes). 

When the Dimension table is built on several incoming event streams, `AggregatingMergeTree` is preferable to `ReplacingMergeTree`, as it allows putting data from different event streams without external ETL processes:

```sql
CREATE TABLE table_C (
    id      UInt64,
    colA    SimpleAggregatingFunction(any,Nullable(UInt32)),
    colB    SimpleAggregatingFunction(max, String)
) ENGINE = AggregatingMergeTree()
PARTITION BY intDiv(id, 0x800000000000000) /* 32 bucket*/
ORDER BY id;

CREATE MATERIALIZED VIEW mv_A TO table_C AS SELECT id,colA FROM Kafka_A;
CREATE MATERIALIZED VIEW mv_B TO table_C AS SELECT id,colB FROM Kafka_B;
```

EmbeddedRocksDB natively supports UPDATEs without any complications with AggregatingFunctions.

For dimensions where some “start date” column is used in filtering, the [Range_Hashed](https://kb.altinity.com/altinity-kb-dictionaries/altinity-kb-range_hashed-example-open-intervals/) dictionary layout can be used if it is acceptable for RAM usage. For MergeTree variants, ASOF JOIN in queries is needed.  Such types of dimensions are the first candidates for placement into RAM. 

EmbeddedRocksDB is not suitable here.

### Primary Key

To increase query performance, I recommend using a single UInt64 (not String) column for PK, where the upper 32 bits are reserved for tenant_id (shop_id) and the lower 32 bits for actual object_id (like customer_id, product_id, etc.) 

That benefits both EmbeddedRocksDB Engine (it can have only one Primary Key column) and ReplacingMergeTree, as FINAL processing will work much faster with a light ORDER BY column of a single UInt64 value. 

### Direct Dictionary and UDFs

To make the SQL code of report queries more readable and manageable, I recommend always using Dictionaries to access dimensions. A `direct dictionary layout` should be used for disk-stored dimensions (EmbeddedRocksDB or *MergeTree).

When Clickhouse builds a query to Direct Dictionary, it automatically creates a filter with a list of all needed ID values. There is no need to write code to filter necessary dimension rows to reduce the hash table for the right join table.

Another trick for code manageability is creating an interface function for every dimension to place here all the complexity of managing IDs by packing several values into a single PK value: 

```sql
create or replace function getCustomer as (shop, id, attr) ->
    dictGetOrNull('dict_Customers', attr, bitOr((bitShiftLeft(toUInt64(shop),32)),id));
```

It also allows the flexibility of changing dictionary names when testing different types of Engines or can be used to spread dimensional data to several dictionaries. F.e. most active tenants can be served by expensive in-RAM dictionary, while others (not active) tenants will be served from disk.  

```sql
create or replace function getCustomer as (shop, id, attr) ->
    dictGetOrDefault('dict_Customers_RAM', attr, bitOr((bitShiftLeft(toUInt64(shop),32)),id) as key,
    dictGetOrNull('dict_Customers_MT', attr, key));
```

We always recommended DENORMALIZATION for Fact tables.  However, NORMALIZATION is still a usable approach for taking less RAM for Dimension data stored as dictionaries. 

Example of storing a long company name (String) in a separate dictionary:

```sql
create or replace function getCustomer as (shop, id, attr) ->
    if(attr='company_name', 
        dictGetOrDefault('dict_Company_name', 'name',
         dictGetOrNull('dict_Customers', 'company_id', 
            bitOr((bitShiftLeft(toUInt64(shop),32)),id)) as key),
        dictGetOrNull('dict_Customers', attr, key)
    );
```

Example of combining Hash and Direct Dictionaries. Allows to increase lifetime without losing consistency.

```sql
CREATE OR REPLACE FUNCTION getProduct AS (product_id, attr) ->
    dictGetOrDefault('hashed_dictionary', attr,(shop_id, product_id),
        dictGet('direct_dictionary',attr,(shop_id, product_id) )
    );
```

### Tests/Examples

EmbeddedRocksDB

```sql
CREATE TABLE Dim_Customers (
    id UInt64,
    name String,
    new_or_returning bool
) ENGINE = EmbeddedRocksDB()
PRIMARY KEY (id);

INSERT INTO Dim_Customers
SELECT bitShiftLeft(3648061509::UInt64,32)+number,
  ['Customer A', 'Customer B', 'Customer C', 'Customer D', 'Customer E'][number % 5 + 1],
  number % 2 = 0
FROM numbers(100);

CREATE DICTIONARY dict_Customers
(
    id UInt64,
    name String,
    new_or_returning bool
)
PRIMARY KEY id
LAYOUT(DIRECT())
SOURCE(CLICKHOUSE(TABLE 'Dim_Customers'));

select dictGetOrNull('dict_Customers', 'name', 
  bitOr((bitShiftLeft(toUInt64(shop_id),32)),customer_id));
```

ReplacingMergeTree

```sql
CREATE TABLE Dim_Customers (
    id UInt64, 
    name String,
    new_or_returning bool
) ENGINE = ReplacingMergeTree()
ORDER BY id
PARTITION BY intDiv(id, 0x800000000000000) /* 32 buckets by shop_id */
settings index_granularity=256;

CREATE DICTIONARY dict_Customers
(
    id UInt64,
    name String,
    new_or_returning bool
)
PRIMARY KEY id
LAYOUT(DIRECT())
SOURCE(CLICKHOUSE(query 'select * from Dim_Customers FINAL'));

set do_not_merge_across_partitions_select_final=1; -- or place it to profile
select dictGet('dict_Customers','name',bitShiftLeft(3648061509::UInt64,32)+1);
```

Tests 1M random reads over 10M entries per shop_id in the Dimension table

- [EmbeddedRocksDB](https://fiddle.clickhouse.com/c304d0cc-f1c2-4323-bd65-ab82165aecb6) - 0.003s
- [ReplacingMergeTree](https://fiddle.clickhouse.com/093fc133-0685-4c97-aa90-d38200f93f9f)- 0.003s

There is no difference in SELECT on that synthetic test with all MergeTree optimizations applied. The test must be rerun on actual data with the expected update volume. The difference could be seen on a table with high-volume real-time updates.
