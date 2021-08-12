---
title: "Production Cluster Configuration Guide"
linkTitle: "Production Cluster Configuration Guide"
description: >
    Production Cluster Configuration Guide
---


Moving from a single ClickHouse server to a clustered format provides several benefits:

* Replication guarantees data integrity.
* Provides redundancy.
* Failover by being able to restart half of the nodes without encountering downtime.

Moving from an unsharded ClickHouse environment to a sharded cluster requires redesign of schema and queries. Starting with a sharded cluster from the beginning makes it easier in the future to scale the cluster up.

Setting up a ClickHouse cluster for a production environment requires the following stages:

* Hardware Requirements
* Network Configuration
* Create Host Names
* Monitoring Considerations
* Configuration Steps
* Setting Up Backups
* Staging Plans
* Upgrading The Cluster
