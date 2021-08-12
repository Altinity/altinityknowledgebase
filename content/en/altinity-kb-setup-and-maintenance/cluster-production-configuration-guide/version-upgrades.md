---
title: "Version Upgrades"
linkTitle: "Version Upgrades"
description: >
    Version Upgrades
---
Update itself is simple: update packages, restart clickhouse-server service afterwards.

1. Check if the version you want to upgrade to is stable. We highly recommend the Altinity ClickHouse Stable Releases.
   1. Review the changelog to ensure that no configuration changes are needed.
2. Update staging and test to verify all systems are working.
3. Prepare and test downgrade procedures so the server can be returned to the previous version if necessary.
4. Start with a “canary” update. This is one replica with one shard that is upgraded to make sure that the procedure works.
5. Test and verify that everything works properly. Check for any errors in the log files.
6. If everything is working well, update the rest of the cluster.

For small clusters, the [BlueGreenDeployment technique](https://martinfowler.com/bliki/BlueGreenDeployment.html) is also a good option.
****
