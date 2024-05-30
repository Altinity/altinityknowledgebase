---
title: "Upgrade"
linkTitle: "Upgrade"
keywords:
- clickhouse upgrade
description: >
    Upgrade notes.
weight: 10
---

# ClickHouse Upgrade Procedure

## Step-by-Step Guide:

Normally the upgrade procedure looks like that:

1) **Pick the release to upgrade**
   - Check if the version you want to upgrade to is stable. We highly recommend the Altinity ClickHouse Stable Releases.
2) **Review Release Notes/Changelog**
   - Compare the release notes/changelog between your current release and the target release.
   - Ensure that no configuration changes are needed. Sometimes, you may need to adjust configuration settings for better compatibility.
6) **Perform the Upgrade:**
   - Upgrade the package (note that this does not trigger an automatic restart of the clickhouse-server).
   - Restart the clickhouse-server service.
   - Check health checks and logs.
   - Repeat the process on other nodes.
7) **Start with a “Canary” Update**
   - Mixing several versions in the same cluster can lead to different degradations. It is usually not recommended to have a significant delay between upgrading different nodes in the same cluster.
   - Perform the upgrade on the odd replicas first. Once they are back online, restart the even replicas.
   - Test and verify that everything works properly. Check for any errors in the log files.
9) **Upgrade Dev/Staging Environment**
   - Upgrade the Dev/Staging environment first to ensure your schema/queries work properly in the staging environment.
11) **Upgrade Production**
    - Once the Dev/Staging environment is verified, proceed with the production upgrade.

> **Note:**  Prepare and test downgrade procedures so the server can be returned to the previous version if necessary.

To know more you can Download our free upgrade guide here : https://altinity.com/clickhouse-upgrade-overview/
