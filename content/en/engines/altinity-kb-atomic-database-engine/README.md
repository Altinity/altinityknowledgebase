---
title: "Atomic Database Engine"
linkTitle: "Atomic Database Engine"
description: >
    Atomic Database Engine
---

In version 20.5 ClickHouse first introduced database engine=Atomic.

Since version 20.10 it is a default database engine \(before engine=Ordinary was used\).

Those 2 database engine differs in a way how they store data on a filesystem, and engine Atomic allows to resolve some of the issues existed in engine=Ordinary.  

engine=Atomic supports

* non-blocking drop table / rename table
* tables delete \(&detach\) async \(wait for selects finish but invisible for new selects\)
* atomic drop table \(all files / folders removed\)
* atomic table swap \(table swap by "EXCHANGE TABLES t1 AND t2;"\)
* rename dictionary / rename database
* unique automatic UUID paths in FS and ZK for Replicated



## FAQ

### **Q. Data is not removed immediately**

A. Use`DROP TABLE t SYNC;`

Or use parameter \(user level\) database\_atomic\_wait\_for\_drop\_and\_detach\_synchronously`:`

```sql
SET database_atomic_wait_for_drop_and_detach_synchronously = 1;
```

Also, you can decrease the delay used by Atomic for real table drop \(it’s 8 minutes by default\)

```bash
cat /etc/clickhouse-server/config.d/database_atomic_delay_before_drop_table.xml 
<yandex>
    <database_atomic_delay_before_drop_table_sec>1</database_atomic_delay_before_drop_table_sec>
</yandex>
```

### **Q. I cannot reuse zookeeper path after dropping the table.**

A. This happens because real table deletion occurs with a controlled delay. See the previous question to remove the table immediately.

With engine=Atomic it’s possible \(and is a good practice if you do it correctly\) to include UUID into zookeeper path, i.e. :

```sql
CREATE ... 
ON CLUSTER ... 
ENGINE=ReplicatedMergeTree('/clickhouse/tables/{uuid}/{shard}/', '{replica}')
```

See also: [https://github.com/ClickHouse/ClickHouse/issues/12135\#issuecomment-653932557](https://github.com/ClickHouse/ClickHouse/issues/12135#issuecomment-653932557)

It’s very important that the table will have the same UUID cluster-wide.

When the table is created using _ON CLUSTER_ - all tables will get the same UUID automatically.  
When it needs to be done manually \(for example - you need to add one more replica\), pick CREATE TABLE statement with UUID from one of the existing replicas.

```sql
set show_table_uuid_in_table_create_qquery_if_not_nil=1　;
SHOW CREATE TABLE xxx; /* or SELECT create_table_query FROM system.tables WHERE ... */
```

### Q. Should I use Atomic or Ordinary for new setups? <a id="Using-Ordinary-by-default-instead-of-Atomic-[hardBreak]"></a>

All things inside clickhouse itself should work smoothly with `Atomic`.

But some external tools - backup tools, things involving other kinds of direct manipulations with clickhouse files & folders may have issues with `Atomic`.

`Ordinary` layout on the filesystem is simpler. And the issues which address Atomic \(lock-free renames, drops, atomic exchange of table\) are not so critical in most cases.

<table>
  <thead>
    <tr>
      <th style="text-align:left"></th>
      <th style="text-align:left">Ordinary</th>
      <th style="text-align:left">Atomic</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="text-align:left">filesystem layout</td>
      <td style="text-align:left">very simple</td>
      <td style="text-align:left">more complicated</td>
    </tr>
    <tr>
      <td style="text-align:left">external tool support
        <br />(like clickhouse-backup)</td>
      <td style="text-align:left">good / mature</td>
      <td style="text-align:left">limited / beta</td>
    </tr>
    <tr>
      <td style="text-align:left">
        <p>some DDL queries (DROP / RENAME) may</p>
        <p>hang for a long time (waiting for some other things)</p>
      </td>
      <td style="text-align:left">yes &#x1F44E;</td>
      <td style="text-align:left">no &#x1F44D;</td>
    </tr>
    <tr>
      <td style="text-align:left">Possibility to swap 2 tables</td>
      <td style="text-align:left">
        <p>rename
          <br />a to a_old,
          <br />b to a,</p>
        <p>a_old to b;</p>
        <p>Operation is not atomic, and
          <br />can break in the middle (while chances are low).</p>
      </td>
      <td style="text-align:left">
        <p></p>
        <p>EXCHANGE TABLES t1 AND t2</p>
        <p>Atomic, have no intermediate states.</p>
      </td>
    </tr>
    <tr>
      <td style="text-align:left">uuid in zookeeper path</td>
      <td style="text-align:left">
        <p>Not possible to use.</p>
        <p>The typical pattern is to add version suffix to zookeeper path when you
          need to create
          <br />the new version of the same table.</p>
      </td>
      <td style="text-align:left">
        <p>You can use uuid in zookeeper paths.
          <br />That requires some extra care when you expand the cluster, and makes zookeeper
          paths harder to map to real table.</p>
        <p>But allows to to do any kind of manipulations on tables (rename, recreate
          with same name etc).</p>
      </td>
    </tr>
    <tr>
      <td style="text-align:left">
        <p>Materialized view without TO syntax</p>
        <p>(!we recommend using TO syntax always!)</p>
      </td>
      <td style="text-align:left">
        <p>.inner.mv_name</p>
        <p>The name is predictable, easy to match with MV.</p>
      </td>
      <td style="text-align:left">
        <p>.inner_id.{uuid}</p>
        <p>The name is unpredictable, hard to match with MV (maybe problematic for
          MV chains, and similar scenarios)</p>
      </td>
    </tr>
  </tbody>
</table>

## Using Ordinary by default instead of Atomic

```bash
---
title: "cat /etc/clickhouse-server/users.d/disable_atomic_database.xml "
linkTitle: "cat /etc/clickhouse-server/users.d/disable_atomic_database.xml "
description: >
    cat /etc/clickhouse-server/users.d/disable_atomic_database.xml 
---
<?xml version="1.0"?>
<yandex>
    <profiles>
        <default>
            <default_database_engine>Ordinary</default_database_engine>
        </default>
    </profiles>
</yandex>
```

## Other sources

Presentation [https://youtu.be/1LVJ\_WcLgF8?t=2744](https://youtu.be/1LVJ_WcLgF8?t=2744)

{% embed url="https://github.com/ClickHouse/clickhouse-presentations/blob/master/meetup46/database\_engines.pdf" %}



