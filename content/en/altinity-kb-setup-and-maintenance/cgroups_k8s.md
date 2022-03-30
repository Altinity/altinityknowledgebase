---
title: "cgroups and kubernetes cloud providers"
linkTitle: "cgroups and k8s"
weight: 100
description: >-
     cgroups and kubernetes cloud providers.
---

## cgroups and kubernetes cloud providers

Why my Clichkouse is slow after upgrade to version 22.2 and higher?

The probable reason is that Clichkouse 22.2 started to respect cgroups (Respect cgroups limits in max_threads autodetection. [#33342](https://github.com/ClickHouse/ClickHouse/pull/33342) ([JaySon](https://github.com/JaySon-Huang)).

You can observe that `max_threads = 1`

```sql
SELECT
    name,
    value
FROM system.settings
WHERE name = 'max_threads'

┌─name────────┬─value─────┐
│ max_threads │ 'auto(1)' │
└─────────────┴───────────┘
```

This make Clichkouse to execute all queries with a single thread (normal behavior is half of available CPU cores, cores = 64, then 'auto(32)').

We observe this cgroups behavior with AWS EKS (Kubernetes) environment and [Altinity 
ClickHouse Operator](https://github.com/Altinity/clickhouse-operator) in case if requests.cpu and limits.cpu are not set for a resource.

We suggest to set requests.cpu = half of available CPU cores, and limits.cpu = CPU cores.

For example in case of 16 CPU cores

```xml
          resources:
            requests:
              memory: ...
              cpu: 8
            limits:
              memory: ....
              cpu: 16
```

Then you should get a new result:

```sql
SELECT
    name,
    value
FROM system.settings
WHERE name = 'max_threads'

┌─name────────┬─value─────┐
│ max_threads │ 'auto(8)' │
└─────────────┴───────────┘
```
