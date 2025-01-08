---
title: "DR two DC"
linkTitle: "DR two DC"
weight: 100
description: >-
     Data Recovery by two DC.
---

Clickhouse uses Keeper (or ZooKeeper) to inform other cluster nodes about changes. Clickhouse nodes then fetch new parts directly from other nodes in the cluster. The Keeper cluster is a key for building a DR schema. You can consider Keeper a “true” cluster while clickhouse-server nodes as storage access instruments. 

To implement a disaster recovery (DR) setup for ClickHouse across two physically separated data centers (A and B), with only one side active at a time, you can create a single ClickHouse cluster spanning both data centers. This setup will address data synchronization, replication, and coordination needs.

## Cluster Configuration

1. Create a single ClickHouse cluster with nodes in both data centers.
2. Configure the appropriate number of replicas and shards based on your performance and redundancy requirements.
3. Use ClickHouse Keeper or ZooKeeper for cluster coordination (see Keeper flavors discussion below).

## Data Synchronization and Replication

1. ClickHouse replicas operate in a master-master configuration, eliminating the need for a separate slave approach.
2. Configure replicas across both data centers to ensure data synchronization.
3. While both DCs have active replicas, consider DC B replicas as "passive" from the application's perspective.

### Example Configuration:

```xml
<remote_servers>
    <company_cluster>
        <shard>
            <replica>
                <host>ch1.dc-a.company.com</host>
            </replica>
            <replica>
                <host>ch2.dc-a.company.com</host>
            </replica>
            <replica>
                <host>ch1.dc-b.company.com</host>
            </replica>
            <replica>
                <host>ch2.dc-b.company.com</host>
            </replica>
        </shard>
<!-- Add more shards as needed -->
    </company_cluster>
</remote_servers>
```

## Keeper Setup

1. In the active data center (DC A):
    - Deploy 3 active Keeper nodes
2. In the passive data center (DC B):
    - Deploy 1 Keeper node in observer role

### Failover Process:

In case of a failover:

1. Shut down the ClickHouse cluster in DC A completely
2. Manually switch Keeper in DC B from observer to active participant and add two additional nodes (they will replicate the state automatically).

## ClickHouse Keeper vs. ZooKeeper

While ClickHouse Keeper is generally preferable for very high-load scenarios, ZooKeeper remains a viable option for many deployments.

Considerations:

- ClickHouse Keeper is optimized for ClickHouse operations and can handle higher loads.
- ZooKeeper is well-established and works well for many clients.

The choice between ClickHouse Keeper and ZooKeeper is more about the overall system architecture and load patterns.

## Configuration Synchronization

To keep configurations in sync:

1. Use ON CLUSTER clause for DDL statements
2. Store RBAC objects in Keeper 
3. Implement a configuration management system (e.g., Ansible, Puppet) to simultaneously apply changes to clickhouse configuration files in config.d

   
