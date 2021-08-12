---
title: "ZooKeeper cluster migration"
linkTitle: "ZooKeeper cluster migration"
description: >
    ZooKeeper cluster migration
---
Here is a plan for ZK 3.4.9 (no dynamic reconfiguration):

1. Add the 3 new ZK nodes to the old cluster. No changes needed for the 3 old ZK nodes at this time.
   1. Configure one of the new ZK nodes as a cluster of 4 nodes (3 old + 1 new), start it.
   2. Configure the other two new ZK nodes as a cluster of 6 nodes (3 old + 3 new), start them.
2. Make sure the 3 new ZK nodes connected to the old ZK cluster as followers (run `echo stat | nc localhost 2181` on the 3 new ZK nodes)
3. Confirm that the leader has 5 synced followers (run `echo mntr | nc localhost 2181` on the leader, look for `zk_synced_followers`)
4. Stop data ingestion in CH (this is to minimize errors when CH loses ZK).
5. Change the zookeeper section in the configs on the CH nodes (remove the 3 old ZK servers, add the 3 new ZK servers)
6. Make sure that there are no connections from CH to the 3 old ZK nodes (run `echo stat | nc localhost 2181` on the 3 old nodes, check their `Clients` section). Restart all CH nodes if necessary (In some cases CH can reconnect to different ZK servers without a restart).
7. Remove the 3 old ZK nodes from `zoo.cfg` on the 3 new ZK nodes.
8. Restart the 3 new ZK nodes. They should form a cluster of 3 nodes.
9. When CH reconnects to ZK, start data loading.
10. Turn off the 3 old ZK nodes.

This plan works, but it is not the only way to do this, it can be changed if needed.
