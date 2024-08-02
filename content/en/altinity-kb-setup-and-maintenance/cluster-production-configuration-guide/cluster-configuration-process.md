---
title: "Cluster Configuration Process"
linkTitle: "Cluster Configuration Process"
description: >
    Cluster Configuration Process
---
So you set up 3 nodes with zookeeper (zookeeper1, zookeeper2, zookeeper3 - [How to install zookeer?](https://docs.altinity.com/operationsguide/clickhouse-zookeeper/)),  and  and 4 nodes with ClickHouse® (clickhouse-sh1r1,clickhouse-sh1r2,clickhouse-sh2r1,clickhouse-sh2r2 - [how to install ClickHouse?](https://docs.altinity.com/altinitystablerelease/stablequickstartguide/)). Now we need to make them work together.

Use ansible/puppet/salt or other systems to control the servers’ configurations.

1. Configure ClickHouse access to Zookeeper by adding the file zookeeper.xml in /etc/clickhouse-server/config.d/ folder. This file must be placed on all ClickHouse servers.

```markup
<yandex>
    <zookeeper>
        <node>
            <host>zookeeper1</host>
            <port>2181</port>
        </node>
        <node>
            <host>zookeeper2</host>
            <port>2181</port>
        </node>
        <node>
            <host>zookeeper3</host>
            <port>2181</port>
        </node>
    </zookeeper>
</yandex>
```

1. On each server put the file macros.xml in `/etc/clickhouse-server/config.d/` folder.

```markup
<yandex>
    <!--
        That macros are defined per server,
        and they can be used in DDL, to make the DB schema cluster/server neutral
    -->
    <macros>
        <cluster>prod_cluster</cluster>
        <shard>01</shard>
        <replica>clickhouse-sh1r1</replica> <!-- better - use the same as hostname  -->
    </macros>
</yandex>
```

1. On each server place the file cluster.xml in /etc/clickhouse-server/config.d/ folder. Before 20.10  ClickHouse will use default user to connect to other nodes (configurable, other users can be used), since 20.10 we recommend to use passwordless intercluster authentication based on common secret (HMAC auth)

```markup
<yandex>
    <remote_servers>
        <prod_cluster> <!-- you need to give a some name for a cluster -->

            <!--
                <secret>some_random_string, same on all cluster nodes, keep it safe</secret>
            -->
            <shard>
                <internal_replication>true</internal_replication>
                <replica>
                    <host>clickhouse-sh1r1</host>
                    <port>9000</port>
                </replica>
                <replica>
                    <host>clickhouse-sh1r2</host>
                    <port>9000</port>
                </replica>
            </shard>
            <shard>
                <internal_replication>true</internal_replication>
                <replica>
                    <host>clickhouse-sh2r1</host>
                    <port>9000</port>
                </replica>
                <replica>
                    <host>clickhouse-sh2r2</host>
                    <port>9000</port>
                </replica>
            </shard>
        </prod_cluster>
    </remote_servers>
</yandex>
```

1. A good practice is to create 2 additional cluster configurations similar to prod_cluster above with the following distinction: but listing all nodes of single shard (all are replicas) and as nodes of 6 different shards (no replicas)
   1. all-replicated: All nodes are listed as replicas in a single shard.
   2. all-sharded: All nodes are listed as separate shards with no replicas.

Once this is complete, other queries that span nodes can be performed. For example:

```sql
CREATE TABLE test_table_local ON CLUSTER '{cluster}'
(
  id UInt8
)
Engine=ReplicatedMergeTree('/clickhouse/tables/{database}/{table}/{shard}', '{replica}')
ORDER BY (id);
```

That will create a table on all servers in the cluster. You can insert data into this table and it will be replicated automatically to the other shards.To store the data or read the data from all shards at the same time, create a Distributed table that links to the replicatedMergeTree table.

```sql
CREATE TABLE test_table ON CLUSTER '{cluster}'
Engine=Distributed('{cluster}', 'default', '
```

#### **Hardening ClickHouse Security**

**See** [https://docs.altinity.com/operationsguide/security/](https://docs.altinity.com/operationsguide/security/)

### Additional Settings

See [altinity-kb-settings-to-adjust]({{<ref "altinity-kb-settings-to-adjust" >}})

#### Users

Disable or add password for the default users default and readonly if your server is accessible from non-trusted networks.

If you add password to the default user, you will need to adjust cluster configuration, since the other servers need to know the default user’s should know the default user’s to connect to each other.

If you’re inside a trusted network, you can leave default user set to nothing to allow the ClickHouse nodes to communicate with each other.

#### Engines & ClickHouse building blocks

For general explanations of roles of different engines - check the post [Distributed vs Shard vs Replicated ahhh, help me!!!](https://github.com/yandex/ClickHouse/issues/2161).

#### Zookeeper Paths

Use conventions  for zookeeper paths.  For example, use:

ReplicatedMergeTree('/clickhouse/{cluster}/tables/{shard}/table_name', '{replica}')

for:

SELECT \* FROM system.zookeeper WHERE path='/ ...';

#### Configuration Best Practices

<table>
  <thead>
    <tr>
      <th style="text-align:left">
        <p>Attribution</p>
        <p>Modified by a post [on GitHub by Mikhail Filimonov](https://github.com/ClickHouse/ClickHouse/issues/3607#issuecomment-440235298).</p>
      </th>
    </tr>
  </thead>
  <tbody></tbody>
</table>

The following are recommended Best Practices when it comes to setting up a ClickHouse Cluster with Zookeeper:

1. Don’t edit/overwrite default configuration files. Sometimes a newer version of ClickHouse introduces some new settings or changes the defaults in config.xml and users.xml.
   1. Set configurations via the extra files in conf.d directory. For example, to overwrite the interface save the file config.d/listen.xml, with the following:

```markup
<?xml version="1.0"?>
<yandex>
    <listen_host replace="replace">::</listen_host>
</yandex>
```

1. The same is true for users. For example, change the default profile by putting the file in users.d/profile_default.xml:

```markup
<?xml version="1.0"?>
<yandex>
    <profiles>
        <default replace="replace">
            <max_memory_usage>15000000000</max_memory_usage>
            <max_bytes_before_external_group_by>12000000000</max_bytes_before_external_group_by>
            <max_bytes_before_external_sort>12000000000</max_bytes_before_external_sort>
            <distributed_aggregation_memory_efficient>1</distributed_aggregation_memory_efficient>
            <use_uncompressed_cache>0</use_uncompressed_cache>
            <load_balancing>random</load_balancing>
            <log_queries>1</log_queries>
            <max_execution_time>600</max_execution_time>
        </default>
    </profiles>
</yandex>
```

1. Or you can create a user by putting a file users.d/user_xxx.xml (since 20.5 you can also use CREATE USER)

```markup
<?xml version="1.0"?>
<yandex>
    <users>
        <xxx>
            <!-- PASSWORD=$(base64 < /dev/urandom | head -c8); echo "$PASSWORD"; echo -n "$PASSWORD" | sha256sum | tr -d '-' -->
            <password_sha256_hex>...</password_sha256_hex>
            <networks incl="networks" />
            <profile>readonly</profile>
            <quota>default</quota>
            <allow_databases incl="allowed_databases" />
        </xxx>
    </users>
</yandex>
```

1. Some parts of configuration will contain repeated elements (like allowed ips for all the users). To avoid repeating that - use substitutions file. By default its /etc/metrika.xml, but you can change it for example to /etc/clickhouse-server/substitutions.xml with the <include_from> section of the main config. Put the repeated parts into substitutions file, like this:

```markup
<?xml version="1.0"?>
<yandex>
    <networks>
        <ip>::1</ip>
        <ip>127.0.0.1</ip>
        <ip>10.42.0.0/16</ip>
        <ip>192.168.0.0/24</ip>
    </networks>
</yandex>

```

These files can be common for all the servers inside the cluster or can be individualized per server. If you choose to use one substitutions file per cluster, not per node, you will also need to generate the file with macros, if macros are used.

This way you have full flexibility; you’re not limited to the settings described in the template. You can change any settings per server or data center just by assigning files with some settings to that server or server group. It becomes easy to navigate, edit, and assign files.

### Other Configuration Recommendations

Other configurations that should be evaluated:

* <listen> in config.xml: Determines which IP addresses and ports the ClickHouse servers listen for incoming communications.
* <max_memory_..> and <max_bytes_before_external_...> in users.xml. These are part of the profile <default>.
* <max_execution_time>
* <log_queries>

The following extra debug logs should be considered:

* part_log
* text_log

### Understanding The Configuration

ClickHouse configuration stores most of its information in two files:

* config.xml: Stores [Server configuration parameters](https://clickhouse.yandex/docs/en/operations/server_settings/). They are server wide, some are hierarchical , and most of them can’t be changed in runtime. The list of settings to apply without a restart changes from version to version. Some settings can be verified using system tables, for example:
  * macros (system.macros)
  * remote_servers (system.clusters)
* users.xml: Configure users, and user level / session level [settings](https://clickhouse.yandex/docs/en/operations/settings/settings/).
  * Each user can change these during their session by:
    * Using parameter in http query
    * By using parameter for clickhouse-client
    * Sending query like set allow_experimental_data_skipping_indices=1.
  * Those settings and their current values are visible in system.settings. You can make some settings global by editing default profile in users.xml, which does not need restart.
  * You can forbid users to change their settings by using readonly=2 for that user, or using [setting constraints](https://clickhouse.yandex/docs/en/operations/settings/constraints_on_settings/).
  * Changes in users.xml are applied w/o restart.

For both config.xml and users.xml, it’s preferable to put adjustments in the config.d and users.d subfolders instead of editing config.xml and users.xml directly.

You can check if the config file was reread by checking /var/lib/clickhouse/preprocessed_configs/ folder.
