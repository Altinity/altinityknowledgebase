---
title: "Server config files"
linkTitle: "Server config files"
description: >
    How to manage server config files in ClickHouse®
keywords:
  - clickhouse config.xml
  - clickhouse configuration
---

## Сonfig management (recommended structure)

ClickHouse® server config consists of two parts server settings (config.xml) and users settings (users.xml).

By default they are stored in the folder **/etc/clickhouse-server/** in two files config.xml & users.xml.

We suggest never change vendor config files and place your changes into separate .xml files in sub-folders. This way is easier to maintain and ease ClickHouse upgrades.

**/etc/clickhouse-server/users.d** – sub-folder for user settings (derived from `users.xml` filename).

**/etc/clickhouse-server/config.d** – sub-folder for server settings (derived from `config.xml` filename).

**/etc/clickhouse-server/conf.d** – sub-folder for any (both) settings.

If the root config (xml or yaml) has a different name, such as `keeper_config.xml` or `config_instance_66.xml`, then the `keeper_config.d` and `config_instance_66.d` folders will be used. But `conf.d` is always used and processed last.

File names of your xml files can be arbitrary but they are applied in alphabetical order.

Examples:

```markup
$ cat /etc/clickhouse-server/config.d/listen_host.xml
<?xml version="1.0" ?>
<clickhouse>
  <listen_host>::</listen_host>
</clickhouse>


$ cat /etc/clickhouse-server/config.d/macros.xml
<?xml version="1.0" ?>
<clickhouse>
  <macros>
    <cluster>test</cluster>
    <replica>host22</replica>
    <shard>0</shard>
    <server_id>41295</server_id>
    <server_name>host22.server.com</server_name>
  </macros>
</clickhouse>

cat /etc/clickhouse-server/config.d/zoo.xml
<?xml version="1.0" ?>
<clickhouse>
  <zookeeper>
    <node>
      <host>localhost</host>
      <port>2181</port>
    </node>
  </zookeeper>
  <distributed_ddl>
    <path>/clickhouse/test/task_queue/ddl</path>
  </distributed_ddl>
</clickhouse>

cat /etc/clickhouse-server/users.d/enable_access_management_for_user_default.xml
<?xml version="1.0" ?>
<clickhouse>
  <users>
    <default>
      <access_management>1</access_management>
    </default>
  </users>
</clickhouse>

cat /etc/clickhouse-server/users.d/memory_usage.xml
<?xml version="1.0" ?>
<clickhouse>
    <profiles>
        <default>
            <max_bytes_before_external_group_by>25290221568</max_bytes_before_external_group_by>
            <max_memory_usage>50580443136</max_memory_usage>
        </default>
    </profiles>
</clickhouse>
```

BTW, you can define any macro in your configuration and use them in Zookeeper paths

```xml
 ReplicatedMergeTree('/clickhouse/{cluster}/tables/my_table','{replica}')
```

or in your code using function getMacro:

```sql
CREATE OR REPLACE VIEW srv_server_info
SELECT (SELECT getMacro('shard')) AS shard_num,
       (SELECT getMacro('server_name')) AS server_name,
       (SELECT getMacro('server_id')) AS server_key
```

Settings can be appended to an XML tree (default behaviour) or replaced or removed.

Example how to delete **tcp_port** & **http_port** defined on higher level in the main config.xml (it disables open tcp & http ports if you configured secure ssl):

```markup
cat /etc/clickhouse-server/config.d/disable_open_network.xml
<?xml version="1.0"?>
<clickhouse>
  <http_port remove="1"/>
  <tcp_port remove="1"/>
</clickhouse>
```

Example how to replace **remote_servers** section defined on higher level in the main config.xml (it allows to remove default test clusters.

```markup
<?xml version="1.0" ?>
<clickhouse>
  <remote_servers replace="1">
    <mycluster>
      ....
    </mycluster>
  </remote_servers>
</clickhouse>
```

## Settings & restart

General 'rule of thumb':
* **server** settings (`config.xml` and `config.d`) changes **require restart**;
* **user** settings (`users.xml` and `users.d`) changes **don't require restart**.

But there are **exceptions** from those rules (see below).

### Server config (config.xml) sections which don't require restart

* `<max_server_memory_usage>` 
* `<max_server_memory_usage_to_ram_ratio>`
* `<max_table_size_to_drop>` (since 19.12)
* `<max_partition_size_to_drop>` (since 19.12)
* `<max_concurrent_queries>` (since 21.11, also for versions older than v24 system tables are not updated with the new config values) 
* `<macros>`
* `<remote_servers>`
* `<dictionaries_config>`
* `<user_defined_executable_functions_config>`
* `<models_config>`
* `<keeper_server>`
* `<zookeeper>` (but reconnect don't happen automatically)
* `<storage_configuration>` -- only if you add a new entity (disk/volume/policy), to modify these enitities restart is mandatory.
* `<user_directories>`
* `<access_control_path>`
* `<encryption_codecs>`
* `<logger>` (since 21.11)

Those sections (live in separate files):
* `<dictionaries>`
* `<functions>`
* `<models>`


See also https://github.com/ClickHouse/ClickHouse/blob/445b0ba7cc6b82e69fef28296981fbddc64cd634/programs/server/Server.cpp#L809-L883

### User settings which require restart. 

Most of user setting changes don't require restart, but they get applied at the connect time, so existing connection may still use old user-level settings.
That means that that new setting will be applied to new sessions / after reconnect.

The list of user setting which require server restart:

* `<background_buffer_flush_schedule_pool_size>`
* `<background_pool_size>`
* `<background_merges_mutations_concurrency_ratio>`
* `<background_move_pool_size>`
* `<background_fetches_pool_size>`
* `<background_common_pool_size>`
* `<background_schedule_pool_size>`
* `<background_message_broker_schedule_pool_size>`
* `<background_distributed_schedule_pool_size>`
* `<max_replicated_fetches_network_bandwidth_for_server>`
* `<max_replicated_sends_network_bandwidth_for_server>`

See also `select * from system.settings where description ilike '%start%'`

Also there are several 'long-running' user sessions which are almost never restarted and can keep the setting from the server start (it's DDLWorker, Kafka, and some other service things).

## Dictionaries

We suggest to store each dictionary description in a separate (own) file in a **/etc/clickhouse-server/dict** sub-folder.

```markup
$ cat /etc/clickhouse-server/dict/country.xml
<?xml version="1.0"?>
<dictionaries>
  <dictionary>
    <name>country</name>
    <source>
      <http>
      ...
  </dictionary>
</dictionaries>
```

and add to the configuration

```markup
$ cat /etc/clickhouse-server/config.d/dictionaries.xml
<?xml version="1.0"?>
<clickhouse>
  <dictionaries_config>dict/*.xml</dictionaries_config>
  <dictionaries_lazy_load>true</dictionaries_lazy_load>
</clickhouse>
```

**dict/\*.xml** – relative path, servers seeks files in the folder **/etc/clickhouse-server/dict**. More info in [Multiple ClickHouse instances](#Multiple-ClickHouse-instances-at-one-host).

## incl attribute & metrica.xml

**incl** attribute allows to include some XML section from a special **include** file multiple times.

By default **include** file is **/etc/metrika.xml**. You can use many include files for each XML section.

For example to avoid repetition of user/password for each dictionary you can create an XML file:

```markup
$ cat /etc/clickhouse-server/dict_sources.xml
<?xml version="1.0"?>
<clickhouse>
  <mysql_config>
      <port>3306</port>
      <user>user</user>
      <password>123</password>
      <replica>
        <host>mysql_host</host>
        <priority>1</priority>
      </replica>
      <db>my_database</db>
  </mysql_config>
</clickhouse>
```

Include this file:

```markup
$ cat /etc/clickhouse-server/config.d/dictionaries.xml
<?xml version="1.0"?>
<clickhouse>
  ...
  <include_from>/etc/clickhouse-server/dict_sources.xml</include_from>
</clickhouse>
```

And use in dictionary descriptions (**incl="mysql_config"**):

```markup
$ cat /etc/clickhouse-server/dict/country.xml
<?xml version="1.0"?>
<dictionaries>
  <dictionary>
    <name>country</name>
    <source>
        <mysql incl="mysql_config">
            <table>my_table</table>
            <invalidate_query>select max(id) from my_table</invalidate_query>
        </mysql>
    </source>
      ...
  </dictionary>
</dictionaries>
```

## Multiple ClickHouse instances at one host

By default ClickHouse server configs are in **/etc/clickhouse-server/** because clickhouse-server runs with a parameter **--config-file /etc/clickhouse-server/config.xml**

**config-file** is defined in startup scripts:

* **/etc/init.d/clickhouse-server** – init-V
* **/etc/systemd/system/clickhouse-server.service** – systemd

ClickHouse uses the path from **config-file** parameter as base folder and seeks for other configs by relative path. All sub-folders **users.d / config.d** are relative.

You can start multiple **clickhouse-server** each with own **--config-file.**

For example:

```bash
/usr/bin/clickhouse-server --config-file /etc/clickhouse-server-node1/config.xml
  /etc/clickhouse-server-node1/  config.xml ... users.xml
  /etc/clickhouse-server-node1/config.d/disable_open_network.xml
  /etc/clickhouse-server-node1/users.d/....

/usr/bin/clickhouse-server --config-file /etc/clickhouse-server-node2/config.xml
  /etc/clickhouse-server-node2/   config.xml ... users.xml
  /etc/clickhouse-server-node2/config.d/disable_open_network.xml
  /etc/clickhouse-server-node2/users.d/....
```

If you need to run multiple servers for CI purposes you can combine all settings in a single fat XML file and start ClickHouse without config folders/sub-folders.

```bash
/usr/bin/clickhouse-server --config-file /tmp/ch1.xml
/usr/bin/clickhouse-server --config-file /tmp/ch2.xml
/usr/bin/clickhouse-server --config-file /tmp/ch3.xml
```

Each ClickHouse instance must work with own **data-folder** and **tmp-folder**.

By default ClickHouse uses **/var/lib/clickhouse/**. It can be overridden in path settings

```xml
<path>/data/clickhouse-ch1/</path>

<tmp_path>/data/clickhouse-ch1/tmp/</tmp_path>

<user_files_path>/data/clickhouse-ch1/user_files/</user_files_path>
  <local_directory>
    <path>/data/clickhouse-ch1/access/</path>
  </local_directory>

<format_schema_path>/data/clickhouse-ch1/format_schemas/</format_schema_path>
```

## preprocessed_configs

ClickHouse server watches config files and folders. When you change, add or remove XML files ClickHouse immediately assembles XML files into a combined file. These combined files are stored in **/var/lib/clickhouse/preprocessed_configs/** folders.

You can verify that your changes are valid by checking **/var/lib/clickhouse/preprocessed_configs/config.xml**, **/var/lib/clickhouse/preprocessed_configs/users.xml**.

If something wrong with with your settings e.g. unclosed XML element or typo you can see alerts about this mistakes in **/var/log/clickhouse-server/clickhouse-server.log**

If you see your changes in **preprocessed_configs** it does not mean that changes are applied on running server, check Settings and restart.
