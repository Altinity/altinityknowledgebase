---
title: "Access Control and Account Management example (RBAC)"
linkTitle: "RBAC example"
weight: 100
description: >-
     Access Control and Account Management example (RBAC).
---

Documentation https://clickhouse.com/docs/en/operations/access-rights/

## Example: 3 roles (dba, dashboard_ro, ingester_rw)

You need to create an .xml file at each node to allow user `default` to manage access using SQL.

```xml
cat /etc/clickhouse-server/users.d/access_management.xml
<?xml version="1.0"?>
<yandex>
    <users>
        <default>
            <access_management>1</access_management>
        </default>
    </users>
</yandex>
```

```sql
create role dba on cluster '{cluster}';
grant all on *.* to dba on cluster '{cluster}';
create user `user1` identified  by 'pass1234' on cluster '{cluster}';
grant dba to user1 on cluster '{cluster}';
set default role dba TO user1;  -- run on all nodes (on_cluster is not imlemented)



create role dashboard_ro on cluster '{cluster}';
grant select on default.* to dashboard_ro on cluster '{cluster}';
grant dictGet on *.*  to dashboard_ro on cluster '{cluster}';

create settings profile or replace profile_dashboard_ro on cluster '{cluster}'
settings max_concurrent_queries_for_user = 10 READONLY, 
         max_threads = 16 READONLY, 
         max_memory_usage_for_user = '30G' READONLY,
         max_memory_usage = '30G' READONLY,
         max_execution_time = 60 READONLY,
         max_rows_to_read = 1000000000 READONLY,
         max_bytes_to_read = '5000G' READONLY
TO dashboard_ro;

create user `dash1` identified  by 'pass1234' on cluster '{cluster}';

grant dashboard_ro to dash1 on cluster '{cluster}';
set default role dashboard_ro TO dash1;  // run on all nodes (on_cluster is not imlemented)



create role ingester_rw on cluster '{cluster}';
grant select,insert on default.* to ingester_rw on cluster '{cluster}';

create settings profile or replace profile_ingester_rw on cluster '{cluster}'
settings max_concurrent_queries_for_user = 40 READONLY,    -- user can run 40 queries (select, insert ...) simultaneously  
         max_threads = 10 READONLY,                        -- each query can use up to 10 cpu (READONLY means user cannot override a value)
         max_memory_usage_for_user = '30G' READONLY,       -- all queries of the user can use up to 30G RAM
         max_memory_usage = '25G' READONLY,                -- each query can use up to 25G RAM
         max_execution_time = 200 READONLY,                -- each query can executes no longer 200 seconds
         max_rows_to_read = 1000000000 READONLY,           -- each query can read up to 1 billion rows
         max_bytes_to_read = '5000G' READONLY              -- each query can read up to 5 TB from a MergeTree
TO ingester_rw;

create user `ingester_app1` identified  by 'pass1234'　on cluster '{cluster}';

grant ingester_rw to ingester_app1 on cluster '{cluster}';
set default role ingester_rw TO ingester_app1; // run on all nodes (on_cluster is not imlemented)
```

## check

```bash
$ clickhouse-client -u dash1 --password pass1234

create table test ( A Int64) Engine=Log;
   DB::Exception: dash1: Not enough privileges
   
   
$ clickhouse-client -u user1 --password pass1234

create table test ( A Int64) Engine=Log;
Ok.

drop table test;
Ok.


$ clickhouse-client -u ingester_app1 --password pass1234

select count() from system.numbers limit 1000000000000;
   DB::Exception: Received from localhost:9000. DB::Exception: Limit for rows or bytes to read exceeded, max rows: 1.00 billion
```
