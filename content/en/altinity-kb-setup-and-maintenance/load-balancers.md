---
title: "Load balancers"
linkTitle: "Load balancers"
description: >
    Load balancers
---
In general - one of the simplest option to do load balancing is to implement it on the client side.

I.e. list several endpoints for clickhouse connections and add some logic to pick one of the nodes.

Many client libraries support that.

## ClickHouse native protocol (port 9000)

Currently there are no protocol-aware proxies for clickhouse protocol, so the proxy / load balancer can work only on TCP level.

One of the best option for TCP load balancer is haproxy, also nginx can work in that mode.

Haproxy will pick one upstream when connection is established, and after that it will keep it connected to the same server until the client or server will disconnect (or some timeout will happen).

It can’t send different queries coming via a single connection to different servers, as he knows nothing about clickhouse protocol and doesn't know when one query ends and another start, it just sees the binary stream.

So for native protocol, there are only 3 possibilities:

1) close connection after each query client-side
2) close connection after each query server-side (currently there is only one setting for that - idle_connection_timeout=0, which is not exact what you need, but similar).
3) use a clickhouse server with Distributed table as a proxy.

## HTTP protocol (port 8123)

There are many more options and you can use haproxy / nginx / chproxy, etc.
chproxy give some extra clickhouse-specific features, you can find a list of them at [https://chproxy.org](https://chproxy.org)
