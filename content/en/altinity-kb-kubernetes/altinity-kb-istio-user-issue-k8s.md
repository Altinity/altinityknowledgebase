# Istio Issues

This KB is here for listing issues where the ClickHouse Operator is installed on a cluster where Istio is used.

## What is Istio?

Per documentation on [Istio Project's website](https://istio.io/latest/docs/overview/what-is-istio/), Istio is "an open source service mesh that layers transparently onto existing distributed applications. Istio’s powerful features provide a uniform and more efficient way to secure, connect, and monitor services. Istio is the path to load balancing, service-to-service authentication, and monitoring – with few or no service code changes."

Istio works quite well at providing this functionality, and does so through controlling service-to-service communication in a Cluster, find-grained control of traffic behavior, routing rules, load-balancing, a policy layer and configuration API supporting access controls, rate limiting, etc. 

It also provides metrics about all traffic in a cluster. One can get an amazing amount of metrics from it. Datadog even has a provider that when turned on is a bit like a firehose of information.

Istio essentially uses a proxy to intercapt all network traffic and provides the ability to configured for providing a appliction-aware features.

## ClickHouse and Istio

The implications for ClickHouse need to be taken into consideration however, and this page will attempt to address this from real-life scenarios that Altinity devops, infrastructural, and support engineers have had to solve.

### Operator High Level Description

The Altinity ClickHouse Operator, when installed using a deployment, also creates four custom resources:

- clickhouseinstallations.clickhouse.altinity.com (chi)
- clickhousekeeperinstallations.clickhouse-keeper.altinity.com (chk)
- clickhouseinstallationtemplates.clickhouse.altinity.com (chit)
- clickhouseoperatorconfigurations.clickhouse.altinity.com (chopconf)

For the first two, it uses StatefullSets to run both Keeper and and ClickHouse clusters. For Keeper, it manages how many replicas specified, and for ClickHouse, it manages both how many replicas and shards are specified.

In managing `ClickHouseInstallations`, it requires that the operator can interact with the database running on clusters it creates using a specific `clickhouse_operator` user and needs network access rules that allow connection to the ClickHouse pods.

Many of the issues with Istio can pertain to issues where this can be a problem, particularly in the case where the IP address of the Operator pod changes and no longer is allowed to connect to it's ClickHouse clusters that it manages.

### Issue: Authentication error of clickhouse-operator

This was a ClickHouse cluster running in a Kubernetes setup with Istio.

- The clickhouse operator was unable to query the clickhouse pods because of authentication errors. After a period of time, the operator gave up yet the ClickHouse cluster (ClickHouseInstallation) worked normally.
- Errors showed `AUTHENTICATION_FAILED` and `connections from :ffff:127.0.0.6 are not allowed` as well as `IP_ADDRESS_NOT_ALLOWED`
- Also, the `clickhouse_operator` user correctly configured
- There was a recent issue that on the surface looked similar to a recent issue with  https://altinity.com/blog/deepseek-clickhouse-and-the-altinity-kubernetes-operator (disabled network access for default user due to issue with DeepSeek) and one idea seemed as if upgrading the operator (which would fix the issue if it were default user).
- However, the key to this issue is that the problem was with the `clickhouse_operator` user, not `default` user, hence not due to the aforementioned issue.
- More consiration was given in light of how Istio effects what services can connect which made it more obvious that it was an issue with using Istio in the operator vs. operator version
- The suggestion was given to remove istio from the clickhouse operator `ClickHouseInstallation` and references this issue https://github.com/Altinity/clickhouse-operator/issues/1261#issuecomment-1797895080
- The change required would be something of the sort:

```yaml
---

apiVersion: apps/v1
kind: Deployment
metadata:
  name: clickhouse-operator
spec:
  template:
    metadata:
      annotations:
        sidecar.istio.io/inject: "false"

---

apiVersion: [clickouse.altinity.com/v1](http://clickouse.altinity.com/v1)
kind: ClickHouseInstallation
metadata:
  name: your-chi
  annotations:
    sidecar.istio.io/inject: "false"

```

