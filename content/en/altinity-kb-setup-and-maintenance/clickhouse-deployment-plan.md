---
title: "Successful ClickHouse deployment plan"
linkTitle: "Successful ClickHouse deployment plan"
weight: 100
description: >-
     Successful ClickHouse deployment plan.
---

## Successful ClickHouse deployment plan

### Stage 0. Build POC

1.  Install single node clickhouse
    - https://clickhouse.com/docs/en/getting-started/tutorial/
    - https://clickhouse.com/docs/en/getting-started/install/
    - https://docs.altinity.com/altinitystablebuilds/stablequickstartguide/
2.  Start with creating a single table (the biggest one), use MergeTree engine. Create 'some' schema (most probably it will be far from optimal). Prefer denormalized approach for all immutable dimensions, for mutable dimensions - consider dictionaries.
3.  Load some amount of data (at least 5 Gb, and 10 mln rows) - preferable the real one, or as close to real as possible. Usully the simplest options are either through CSV / TSV files (or `insert into clickhouse_table select * FROM mysql(...) where ...`)
4.  Create several representative queries.
5.  Check the columns cardinality, and appropriate types, use minimal needed type
6.  Review the partition by and order by. https://kb.altinity.com/engines/mergetree-table-engine-family/pick-keys/
7.  Create the schema(s) with better/promising order by / partitioning, load data in. Pick the best schema.
8.  consider different improvements of particular columns (codecs / better data types etc.) https://kb.altinity.com/altinity-kb-schema-design/codecs/altinity-kb-how-to-test-different-compression-codecs/
9.  Repeat 2-8 for next big table(s). Avoid scenarios when you need to join big tables.
10. Pick the clients library for you programming language (the most mature are python / golang / java / c++), build some pipeline - for inserts (low QPS, lot of rows in singe insert, check acknowledgements & retry the same block on failures), ETLs if needed, some reporting layer (https://kb.altinity.com/altinity-kb-integrations/bi-tools/) 

### Stage 1. Planning the production setup

1.  Collect more data / estimate insert speed, estimate the column sizes per day / month.
2.  Measure the speed of queries
3.  Consider improvement using materialized views / projections / dictionaries.
4.  Collect requirements (ha / number of simultaneous queries / insert pressure / 'exactly once' etc)
5.  Do a cluster sizing estimation, plan the hardware 
    - https://kb.altinity.com/altinity-kb-setup-and-maintenance/cluster-production-configuration-guide/hardware-requirements/
    - https://blog.cloudflare.com/clickhouse-capacity-estimation-framework/
7.  plan the network, if needed - consider using LoadBalancers etc.
     - https://kb.altinity.com/altinity-kb-setup-and-maintenance/cluster-production-configuration-guide/network-configuration/
9.  If you need sharding - consider different sharding approaches.

### Stage 2. Preprod setup & developement

1.  Install clickhouse in cluster - several nodes / VMs + zookeeper
    - https://kb.altinity.com/altinity-kb-setup-and-maintenance/cluster-production-configuration-guide/cluster-configuration-process/
	- https://kb.altinity.com/altinity-kb-setup-and-maintenance/altinity-kb-zookeeper/altinity-kb-proper-setup/
	- https://kb.altinity.com/altinity-kb-setup-and-maintenance/altinity-kb-zookeeper/install_ubuntu/
2.  Create good config & automate config / os / restarts (ansible / puppet etc)
	- https://kb.altinity.com/altinity-kb-setup-and-maintenance/altinity-kb-settings-to-adjust/
	- for docker: https://kb.altinity.com/altinity-kb-setup-and-maintenance/altinity-kb-clickhouse-in-docker/
	- for k8: https://kb.altinity.com/altinity-kb-kubernetes/altinity-kb-possible-issues-with-running-clickhouse-in-k8s/
3.  Set up monitoring / log processing / alerts etc.
    - https://kb.altinity.com/altinity-kb-setup-and-maintenance/altinity-kb-monitoring/#build-your-own-monitoring
4.  Set up users.
     - https://kb.altinity.com/altinity-kb-setup-and-maintenance/rbac/ 
5.  Think of schema management. Deploy the schema.
     - https://kb.altinity.com/altinity-kb-setup-and-maintenance/schema-migration-tools/
6.  Design backup / failover strategies:
	- https://clickhouse.com/docs/en/operations/backup/
	- https://github.com/AlexAkulov/clickhouse-backup
7.  Develop pipelines / queries, create test suite, CI/CD
8.  Do benchmark / stress tests 
9.  Test configuration changes / server restarts / failovers / version upgrades
10.  Review the security topics (tls, limits / restrictions, network, passwords)
11.  Document the solution for operations

### Stage 3. Production setup

1. Deploy the production setup (consider also canary / blue-greed deployments etc)
4. Schedule ClickHouse upgrades every 6 to 12 months (if possible)
