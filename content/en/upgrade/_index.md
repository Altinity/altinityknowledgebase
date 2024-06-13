---
aliases:
- /https://kb.altinity.com/altinity-kb-setup-and-maintenance/cluster-production-configuration-guide/version-upgrades/
title: "Upgrade"
linkTitle: "Upgrade"
keywords:
- clickhouse upgrade
description: >
    Upgrade notes.
weight: 10
---

# ClickHouse Version Upgrade Procedure

## Step-by-Step Guide:

Normally the upgrade procedure looks like that:

1) **Pick the release to upgrade**
   - If you upgrade the existing installation with a lot of legacy queries, please pick mature versions with extended lifetime for upgrade (use [Altinity Stable Builds](https://docs.altinity.com/altinitystablebuilds/) or LTS releases from the upstream).
2) **Review Release Notes/Changelog**
   - Compare the release notes/changelog between your current release and the target release.
   - For Altinity Stable Builds: check the release notes of the release you do upgrade to (if you going from some older release - you may need to read several of them for every release in between: [23.8](https://docs.altinity.com/releasenotes/altinity-stable-release-notes/23.8/), ... older versions ... )
   - For upstream releases check the [changelog](https://github.com/ClickHouse/ClickHouse/blob/master/CHANGELOG.md)
   - Also ensure that no configuration changes are needed.
       - Sometimes, you may need to adjust configuration settings for better compatibility.
       - or to opt-out some new features you don’t need (maybe needed to to make the downgrade path possible, or to make it possible for 2 versions to work together)
3) **Prepare Upgrade Checklist**
   - Upgrade the package (note that this does not trigger an automatic restart of the clickhouse-server).
   - Restart the clickhouse-server service.
   - Check health checks and logs.
   - Repeat the process on other nodes.
4) **Prepare “Canary” Update Checklist**
   - Mixing several versions in the same cluster can lead to different degradations. It is usually not recommended to have a significant delay between upgrading different nodes in the same cluster.
   - (If needed / depends on use case) stop ingestion into odd replicas / remove them for load-balancer etc.
   - Perform the upgrade on the odd replicas first. Once they are back online, repeat same on the even replicas.
   - Test and verify that everything works properly. Check for any errors in the log files.
5) **Upgrade Dev/Staging Environment**
   - Follow 6th and 7th checklist and perform Upgrade the Dev/Staging environment. 
   - Ensure your schema/queries work properly in the Dev/staging environment.
   - Perform testing before plan for production upgrade
6) **Upgrade Production**
    - Once the Dev/Staging environment is verified, proceed with the production upgrade.

> **Note:**  Prepare and test downgrade procedures on staging so the server can be returned to the previous version if necessary.

In some upgrade scenarios (depending on which version you are upgrading from and to), when different replicas use different ClickHouse versions, you may encounter the following issues:

1. Replication doesn’t work at all, and delays grow.
2. Errors about 'checksum mismatch' occur, and traffic between replicas increases as they need to resync merge results.
Both problems will be resolved once all replicas are upgraded.

To know more you can Download our free upgrade guide here : https://altinity.com/clickhouse-upgrade-overview/

