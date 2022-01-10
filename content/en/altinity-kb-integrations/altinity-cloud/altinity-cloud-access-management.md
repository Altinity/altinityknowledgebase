---
title: "Altinity Cloud Access Management"
linkTitle: "Altinity Cloud Access Management"
description: >
    Enabling access_management for Altinity.Cloud databases.
weight: 5
---
Organizations that want to enable administrative users in their Altinity.Cloud ClickHouse servers can do so by enabling `access_management` manually.  This allows for administrative users to be created on the specific ClickHouse Cluster.

{{% alert title="WARNING" color="warning" %}}
Modifying the ClickHouse cluster settings manually can lead to the cluster not loading or other issues.  Change settings only with full consultation with an Altinity.Cloud support team member, and be ready to remove settings if they cause any disruption of service.
{{% /alert %}}

To add the `access_management` setting to an Altinity.Cloud ClickHouse Cluster:

1. Log into your Altinity.Cloud account.
1. For the cluster to modify, select **Configure -> Settings**.

    {{< figure src="/assets/altinity-cloud-cluster-settings-configure.png" width="400" title="Cluster setting configure" >}}

1. From the Settings page, select **+ADD SETTING**.

    {{< figure src="/assets/altinity-cloud-cluster-add-setting.png" title="Add cluster setting" >}}

1. Set the following options:
    1. **Setting Type**:  Select **users.d file**.
    1. **Filename**: `access_management.xml`
    1. **Contents**:  Enter the following to allow the `clickhouse_operator` that controls the cluster through the `clickhouse-operator` the ability to set administrative options:

        ```xml
        <yandex>
            <users>
                <admin>
                    <access_management>1</access_management>
                </admin>
                <clickhouse_operator>
                    <access_management>1</access_management>
                </clickhouse_operator>
            </users>
        </yandex>
        ```

1. Select **OK**.  The cluster will restart, and users can now be created in the cluster that can be granted administrative access.
