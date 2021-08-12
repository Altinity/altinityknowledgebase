---
title: "ClickHouse in Docker"
linkTitle: "ClickHouse in Docker"
description: >
    ClickHouse in Docker
---
> Do you have documentation on Docker deployments?

Check

* [https://hub.docker.com/r/yandex/clickhouse-server/](https://hub.docker.com/r/yandex/clickhouse-server/)
* [https://docs.altinity.com/clickhouseonkubernetes/](https://docs.altinity.com/clickhouseonkubernetes/)
* sources of entry point - [https://github.com/ClickHouse/ClickHouse/blob/master/docker/server/entrypoint.sh](https://github.com/ClickHouse/ClickHouse/blob/master/docker/server/entrypoint.sh)

Important things:

* use concrete version tag (avoid using latest)
* if possible use `--network=host` (due to performance reasons)
* you need to mount the folder `/var/lib/clickhouse` to have persistency.
* you MAY also mount the folder `/var/log/clickhouse-server` to have logs accessible outside of the container.
* Also, you may mount in some files or folders in the configuration folder:
  * `/etc/clickhouse-server/config.d/listen_ports.xml`
* `--ulimit nofile=262144:262144`
* You can also set on some linux capabilities to enable some of extra features of ClickHouse (not obligatory): `SYS_PTRACE NET_ADMIN IPC_LOCK SYS_NICE`
* you may also mount in the folder `/docker-entrypoint-initdb.d/` - all SQL or bash scripts there will be executed during container startup.
* there are several ENV switches, see: [https://github.com/ClickHouse/ClickHouse/blob/master/docker/server/entrypoint.sh](https://github.com/ClickHouse/ClickHouse/blob/master/docker/server/entrypoint.sh)

TLDR version: use it as a starting point:

```bash
docker run -d \
   --name some-clickhouse-server \
   --ulimit nofile=262144:262144 \
   --volume=$(pwd)/data:/var/lib/clickhouse \
   --volume=$(pwd)/logs:/var/log/clickhouse-server \
   --volume=$(pwd)/configs/memory_adjustment.xml:/etc/clickhouse-server/config.d/memory_adjustment.xml \
   --cap-add=SYS_NICE \
   --cap-add=NET_ADMIN \
   --cap-add=IPC_LOCK \
   --cap-add=SYS_PTRACE \
   --network=host \
   yandex/clickhouse-server:21.1.7

docker exec -it some-clickhouse-server clickhouse-client
docker exec -it some-clickhouse-server bash
```
