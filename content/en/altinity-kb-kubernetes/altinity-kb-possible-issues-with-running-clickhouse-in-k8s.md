---
title: "Possible issues with running ClickHouse in k8s"
linkTitle: "Possible issues with running ClickHouse in k8s"
description: >
    Possible issues with running ClickHouse in k8s
---
The biggest problem with running ClickHouse in k8s, happens when clickhouse-server can't start for some reason and pod is falling in CrashloopBackOff, so you can't easily get in the pod and check/fix/restart ClickHouse.

There is multiple possible reasons for this, some of them can be fixed without manual intervention in pod:

1. Wrong configuration files Fix: Check templates which are being used for config file generation and fix them.
2. While upgrade some backward incompatible changes prevents ClickHouse from start. Fix: Downgrade and check backward incompatible changes for all versions in between.

Next reasons would require to have manual intervention in pod/volume.
There is two ways, how you can get access to data:

1. Change entry point of ClickHouse pod to something else, so pod wouldn’t be terminated due ClickHouse error.
2. Attach ClickHouse data volume to some generic pod (like Ubuntu).
3. Unclear restart which produced broken files and/or state on disk is differs too much from state in zookeeper for replicated tables. Fix: Create `force_restore_data` flag.
4. Wrong file permission for ClickHouse files in pod. Fix: Use chown to set right ownership for files and directories.
5. Errors in ClickHouse table schema prevents ClickHouse from start. Fix: Rename problematic `table.sql` scripts to `table.sql.bak`
6. Occasional failure of distributed queries because of wrong user/password. Due nature of k8s with dynamic ip allocations, it's possible that ClickHouse would cache wrong ip-> hostname combination and disallow connections because of mismatched hostname. Fix: run `SYSTEM DROP DNS CACHE;` `<disable_internal_dns_cache>1</disable_internal_dns_cache>` in config.xml.

Caveats:

1. Not all configuration/state folders are being covered by persistent volumes. ([geobases](https://clickhouse.tech/docs/en/sql-reference/functions/ym-dict-functions/#multiple-geobases))
2. Page cache belongs to k8s node and pv are being mounted to pod, in case of fast shutdown there is possibility to loss some data(needs to be clarified)
3. Some cloud providers (GKE) can have slow unlink command, which is important for clickhouse because it's needed for parts management. (`max_part_removal_threads` setting)

Useful commands:

```bash
kubectl logs chi-chcluster-2-1-0 -c clickhouse-pod -n chcluster --previous
kubectl describe pod chi-chcluster-2-1-0 -n chcluster
```

Q. Clickhouse is caching the Kafka pod's IP and trying to connect to the same ip even when there is a new Kafka pod running and the old one is deprecated. Is there some setting where we could refresh the connection

`<disable_internal_dns_cache>1</disable_internal_dns_cache>` in config.xml

### ClickHouse init process failed

It's due to low value for env `CLICKHOUSE_INIT_TIMEOUT` value. Consider increasing it up to 1 min.
[https://github.com/ClickHouse/ClickHouse/blob/9f5cd35a6963cc556a51218b46b0754dcac7306a/docker/server/entrypoint.sh\#L120](https://github.com/ClickHouse/ClickHouse/blob/9f5cd35a6963cc556a51218b46b0754dcac7306a/docker/server/entrypoint.sh#L120)