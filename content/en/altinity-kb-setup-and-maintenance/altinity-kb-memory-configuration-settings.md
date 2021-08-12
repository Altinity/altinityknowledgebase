---
title: "memory configuration settings"
linkTitle: "memory configuration settings"
description: >
    memory configuration settings
---
## max_memory_usage. Single query memory usage

max_memory_usage - the maximum amount of memory allowed for **a single query** to take. By default, it's 10Gb. The default value is good, don't adjust it in advance.

There are scenarios when you need to relax the limit for particular queries (if you hit 'Memory limit (for query) exceeded'), or use a lower limit if you need to discipline the users or increase the number of simultaneous queries.

## Server memory usage

Server memory usage = constant memory footprint (used by different caches, dictionaries, etc) + sum of memory temporary used by running queries (a theoretical limit is a number of simultaneous queries multiplied by max_memory_usage).

Since 20.4 you can set up a global limit using the `max_server_memory_usage` setting. If **something** will hit that limit you will see 'Memory limit (total) exceeded' in **random places**.

By default it 90% of the physical RAM of the server.
[https://clickhouse.tech/docs/en/operations/server-configuration-parameters/settings/\#max_server_memory_usage](https://clickhouse.tech/docs/en/operations/server-configuration-parameters/settings/#max_server_memory_usage)
[https://github.com/ClickHouse/ClickHouse/blob/e5b96bd93b53d2c1130a249769be1049141ef386/programs/server/config.xml\#L239-L250](https://github.com/ClickHouse/ClickHouse/blob/e5b96bd93b53d2c1130a249769be1049141ef386/programs/server/config.xml#L239-L250)

You can decrease that in some scenarios (like you need to leave more free RAM for page cache or to some other software).

### How to check what is using my RAM?

[altinity-kb-who-ate-my-memory.md" ]({{<ref "altinity-kb-who-ate-my-memory.md" >}})

### Mark cache

[https://github.com/ClickHouse/clickhouse-presentations/blob/master/meetup39/mark-cache.pdf](https://github.com/ClickHouse/clickhouse-presentations/blob/master/meetup39/mark-cache.pdf)
