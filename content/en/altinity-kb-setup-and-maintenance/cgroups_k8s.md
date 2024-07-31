---
title: "cgroups and kubernetes cloud providers"
linkTitle: "cgroups and k8s"
weight: 100
description: >-
     cgroups and kubernetes cloud providers.
---

Why my ClickHouse® is slow after upgrade to version 22.2 and higher?

The probable reason is that ClickHouse 22.2 started to respect cgroups (Respect cgroups limits in max_threads autodetection. [#33342](https://github.com/ClickHouse/ClickHouse/pull/33342) ([JaySon](https://github.com/JaySon-Huang)).

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

This makes ClickHouse to execute all queries with a single thread (normal behavior is half of available CPU cores, cores = 64, then 'auto(32)').

We observe this cgroups behavior with AWS EKS (Kubernetes) environment and [Altinity 
ClickHouse Operator](https://github.com/Altinity/clickhouse-operator) in case if requests.cpu and limits.cpu are not set for a resource.

## Workaround

We suggest to set requests.cpu = `half of available CPU cores`, and limits.cpu = `CPU cores`.


For example in case of 16 CPU cores:

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

## in depth

For some reason AWS EKS sets cgroup kernel parameters in case of empty requests.cpu & limits.cpu into these:

```bash
# cat /sys/fs/cgroup/cpu/cpu.cfs_quota_us
-1

# cat /sys/fs/cgroup/cpu/cpu.cfs_period_us
100000

# cat /sys/fs/cgroup/cpu/cpu.shares
2
```

This makes ClickHouse to set `max_threads = 1` because of 

```text
cgroup_share = /sys/fs/cgroup/cpu/cpu.shares (2)
PER_CPU_SHARES = 1024
share_count = ceil( cgroup_share / PER_CPU_SHARES ) ---> ceil(2 / 1024) ---> 1
```

## Fix

Incorrect calculation was fixed in https://github.com/ClickHouse/ClickHouse/pull/35815 and will work correctly on newer releases.
