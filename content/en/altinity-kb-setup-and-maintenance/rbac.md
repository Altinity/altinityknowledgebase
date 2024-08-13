---
title: "ClickHouse® Access Control and Account Management (RBAC)"
linkTitle: "ClickHouse® RBAC example"
weight: 100
description: >-
     Access Control and Account Management (RBAC).
---

Documentation https://clickhouse.com/docs/en/operations/access-rights/

## Enable ClickHouse® RBAC and create admin user

Create an ```admin``` user like (root in MySQL or postgres in PostgreSQL) to do the DBA/admin ops in the `user.xml` file and [set the access management property for the admin user](https://clickhouse.com/docs/en/operations/access-rights/#enabling-access-control)

```xml
<clickhouse>
<users>
  <default>
  ....
  </default>
  <admin>
      <!--    
        Password could be specified in plaintext or in SHA256 (in hex format).

        If you want to specify password in plaintext (not recommended), place it in 'password' element.
        Example: <password>qwerty</password>.
        Password could be empty.

        If you want to specify SHA256, place it in 'password_sha256_hex' element.
        Example: <password_sha256_hex>65e84be33532fb784c48129675f9eff3a682b27168c0ea744b2cf58ee02337c5</password_sha256_hex>
        Restrictions of SHA256: impossibility to connect to ClickHouse using MySQL JS client (as of July 2019).

        If you want to specify double SHA1, place it in 'password_double_sha1_hex' element.
        Example: <password_double_sha1_hex>e395796d6546b1b65db9d665cd43f0e858dd4303</password_double_sha1_hex>
      -->
      <password></password> 
      <networks>
          <ip>::/0</ip>
      </networks>
      <!-- Settings profile for user. -->
      <profile>default</profile>
      <!-- Quota for user. -->
      <quota>default</quota>
      <!-- Set This parameter to Enable RBAC
      Admin user can create other users and grant rights to them. -->
      <access_management>1</access_management>
  </admin>
...
</clickhouse>
```

## default user

As `default` is used for many internal and background operations, so it is not convenient to set it up with a password, because you would have to change it in many configs/parts. Best way to secure the default user is only allow localhost or trusted network connections like this in `users.xml`:

```xml
<clickhouse>
<users>
    <default>
    ......    
        <networks>
            <ip>127.0.0.1/8</ip>
            <ip>10.10.10.0/24</ip>
        </networks>
    
    ......
    </default>
</clickhouse>
```

## replication user

The replication user is defined by `interserver_http_credential` tag. It does not relate to a ClickHouse client credentials configuration. **If this tag is ommited then authentication is not used during replication.** Ports 9009 and 9010(tls) provide low-level data access between servers. This ports should not be accessible from untrusted networks. You can specify credentials for authentication between replicas. This is required when `interserver_https_port` is accessible from untrusted networks. You can do so by defining user and password to the interserver credentials. Then replication protocol will use basic access authentication when connecting by HTTP/HTTPS to other replicas:

```xml
  <interserver_http_credentials>
      <user>replication</user>
      <password>password</password>
  </interserver_http_credentials>
```

## Create users and roles

Now we can setup users/roles using a generic best-practice approach for RBAC from other databases, like using roles, granting permissions to roles, creating users for different applications, etc...

see [User Hardening article](https://docs.altinity.com/operationsguide/security/clickhouse-hardening-guide/user-hardening/)


## Example: 3 roles (dba, dashboard_ro, ingester_rw)

```sql
create role dba on cluster '{cluster}';
grant all on *.* to dba on cluster '{cluster}';
create user `user1` identified  by 'pass1234' on cluster '{cluster}';
grant dba to user1 on cluster '{cluster}';


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

## clean up

```sql
show profiles;
┌─name─────────────────┐
│ default              │
│ profile_dashboard_ro │
│ profile_ingester_rw  │
│ readonly             │
└──────────────────────┘

drop profile if exists readonly on cluster '{cluster}';
drop profile if exists profile_dashboard_ro on cluster '{cluster}';
drop profile if exists profile_ingester_rw on cluster '{cluster}';


show roles;
┌─name─────────┐
│ dashboard_ro │
│ dba          │
│ ingester_rw  │
└──────────────┘

drop role if exists dba on cluster '{cluster}';
drop role if exists dashboard_ro on cluster '{cluster}';
drop role if exists ingester_rw on cluster '{cluster}';


show users;
┌─name──────────┐
│ dash1         │
│ default       │
│ ingester_app1 │
│ user1         │
└───────────────┘

drop user if exists ingester_app1 on cluster '{cluster}';
drop user if exists user1 on cluster '{cluster}';
drop user if exists dash1 on cluster '{cluster}';
