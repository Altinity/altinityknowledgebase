---
title: "Using the Altinity Kubernetes Operator for ClickHouse®"
linkTitle: "Using the Altinity Kubernetes Operator for ClickHouse®"
keywords:
- clickhouse in kubernetes
- kubernetes issues
- ALtinity Kubernetes operator for ClickHouse
description: >
    Run ClickHouse® in Kubernetes without any issues.
weight: 8
aliases: 
  /altinity-kb-kubernetes/altinity-kb-possible-issues-with-running-clickhouse-in-k8s/
---

## Useful links

The Altinity Kubernetes Operator for ClickHouse® repo has very useful documentation: 

- [Quick Start Guide](https://github.com/Altinity/clickhouse-operator/blob/master/docs/quick_start.md)
- [Operator Custom Resource Definition explained](https://github.com/Altinity/clickhouse-operator/blob/master/docs/custom_resource_explained.md)
- [Examples - YAML files to deploy the operator in many common configurations](https://github.com/Altinity/clickhouse-operator/tree/master/docs/chi-examples)
- [Main documentation](https://github.com/Altinity/clickhouse-operator/tree/master/docs#table-of-contents)

## ClickHouse Operator ip filter

- In the current version of operator default user is limited to IP addresses of the cluster pods. We plan to have a password option for 0.20.0 and use a 'secret' authentication for distributed queries

## Start/Stop cluster

- Don't delete the operator using:

```bash
kubectl delete -f https://raw.githubusercontent.com/Altinity/clickhouse-operator/master/deploy/operator/clickhouse-operator-install-bundle.yaml
```

- kubectl delete chi cluster-name # chi is the name of the CRD clickhouseInstallation

## DELETE PVCs

https://altinity.com/blog/preventing-clickhouse-storage-deletion-with-the-altinity-kubernetes-operator-reclaimpolicy

## Scaling

Best way is to scale down the deployments to 0 replicas, after that reboot the node and scale up again:

1. first check that all your PVCs have the retain policy:

```bash
kubectl get pv -o=custom-columns=PV:.metadata.name,NAME:.spec.claimRef.name,POLICY:.spec.persistentVolumeReclaimPolicy
# Patch it if you need
kubectl patch pv <pv_id> -p '{"spec":{"persistentVolumeReclaimPolicy":"Retain"}}'
```

```yaml
spec:
 templates:
    volumeClaimTemplates:
       - name: XXX
         reclaimPolicy: Retain
```

2. After that just create a stop.yaml and `kubectl apply -f stop.yaml`

```yaml
kind: ClickHouseInstallation
spec:
 stop: yes
```

3. Reboot kubernetes node
4. Scale up deployment changing the stop property to no and do an `kubectl apply -f stop.yml`

```yaml
kind: ClickHouseInstallation
spec:
 stop: no
```

## Check where pods are executing

```bash
kubectl get pod -o=custom-columns=NAME:.metadata.name,STATUS:.status.phase,NODE:.spec.nodeName -n zk
# Check which hosts in which AZs
kubectl get node -o=custom-columns=NODE:.metadata.name,ZONE:.metadata.labels.'failure-domain\.beta\.kubernetes\.io/zone'
```

## Check node instance types:

```sql
kubectl get nodes -o json|jq -Cjr '.items[] | .metadata.name," ",.metadata.labels."beta.kubernetes.io/instance-type"," ",.metadata.labels."beta.kubernetes.io/arch", "\n"'|sort -k3 -r

ip-10-3-9-2.eu-central-1.compute.internal t4g.large arm64
ip-10-3-9-236.eu-central-1.compute.internal t4g.large arm64
ip-10-3-9-190.eu-central-1.compute.internal t4g.large arm64
ip-10-3-9-138.eu-central-1.compute.internal t4g.large arm64
ip-10-3-9-110.eu-central-1.compute.internal t4g.large arm64
ip-10-3-8-39.eu-central-1.compute.internal t4g.large arm64
ip-10-3-8-219.eu-central-1.compute.internal t4g.large arm64
ip-10-3-8-189.eu-central-1.compute.internal t4g.large arm64
ip-10-3-13-40.eu-central-1.compute.internal t4g.large arm64
ip-10-3-12-248.eu-central-1.compute.internal t4g.large arm64
ip-10-3-12-216.eu-central-1.compute.internal t4g.large arm64
ip-10-3-12-170.eu-central-1.compute.internal t4g.large arm64
ip-10-3-11-229.eu-central-1.compute.internal t4g.large arm64
ip-10-3-11-188.eu-central-1.compute.internal t4g.large arm64
ip-10-3-11-175.eu-central-1.compute.internal t4g.large arm64
ip-10-3-10-218.eu-central-1.compute.internal t4g.large arm64
ip-10-3-10-160.eu-central-1.compute.internal t4g.large arm64
ip-10-3-10-145.eu-central-1.compute.internal t4g.large arm64
ip-10-3-9-57.eu-central-1.compute.internal m5.large amd64
ip-10-3-8-146.eu-central-1.compute.internal m5.large amd64
ip-10-3-13-1.eu-central-1.compute.internal m5.xlarge amd64
ip-10-3-11-52.eu-central-1.compute.internal m5.xlarge amd64
ip-10-3-11-187.eu-central-1.compute.internal m5.xlarge amd64
ip-10-3-10-217.eu-central-1.compute.internal m5.xlarge amd64
```

## Search for missing affinity rules:

```bash
kubectl get pods -o json -n zk |\
jq -r "[.items[] | {name: .metadata.name,\
 affinity: .spec.affinity}]"
[
  {
    "name": "zookeeper-0",
    "affinity": null
  },
  . . .
]
```

## Storage classes

```bash
kubectl get pvc -o=custom-columns=NAME:.metadata.name,SIZE:.spec.resources.requests.storage,CLASS:.spec.storageClassName,VOLUME:.spec.volumeName
...
NAME                         SIZE   CLASS   VOLUME
datadir-volume-zookeeper-0   25Gi   gp2     pvc-9a3...9ee

kubectl get storageclass/gp2 
...
NAME            PROVISIONER       RECLAIMPOLICY...   
gp2 (default)   ebs.csi.aws.com   Delete
```

## Using CSI driver to protect storage:

```yaml
allowVolumeExpansion: true
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: gp2-protected
parameters:
  encrypted: "true"
  type: gp2
provisioner: ebs.csi.aws.com
reclaimPolicy: Retain
volumeBindingMode: WaitForFirstConsumer
```

## Enable Resize of Volumes

Operator does not delete volumes, so those were probably deleted by Kubernetes. In some new versions there is a feature flag that deletes PVCs attached to STS when STS is deleted.

Please try do the following: Use operator 0.20.3. Add the following to the defaults:
``

```yaml
 defaults:
    storageManagement:
      provisioner: Operator
```

That enables storage management by operator, instead of STS. It allows to extend volumes without re-creating STS, and us increase Volume size without restart of clickhouse statefulset pods for CSI drivers which support `allowVolumeExpansion` in storage classes because statefulset template don't change and we don't need delete/create statefulset

## Change server settings:

https://github.com/Altinity/clickhouse-operator/issues/828

```yaml
kind: ClickHouseInstallation
spec:
  configuration:
    settings:
        max_concurrent_queries: 150
```

Or **edit ClickHouseInstallation:**

```bash
kubectl -n <namespace> get chi

NAME              CLUSTERS   HOSTS   STATUS      HOSTS-COMPLETED   AGE
dnieto-test       1          4       Completed                     211d
mbak-test         1          1       Completed                     44d
rory-backupmar8   1          4       Completed                     42h

kubectl -n <namespace> edit ClickHouseInstallation dnieto-test
```

## Clickhouse-backup for CHOP

Examples for use clickhouse-backup + clickhouse-operator for EKS cluster which not managed by `altinity.cloud`

Main idea: second container in clickhouse pod +  CronJob which will insert and poll `system.backup_actions` commands to execute clickhouse-backup commands

https://github.com/AlexAkulov/clickhouse-backup/blob/master/Examples.md#how-to-use-clickhouse-backup-in-kubernetes

## Configurations:

How to modify yaml configs:

https://github.com/Altinity/clickhouse-operator/blob/dc6cdc6f2f61fc333248bb78a8f8efe792d14ca2/tests/e2e/manifests/chi/test-016-settings-04.yaml#L26

## clickhouse-operator install Example:

use latest release if possible
https://github.com/Altinity/clickhouse-operator/releases

- No. Nodes/replicas: 2 to 3 nodes with 500GB per node minimum
- Zookeeper: 3 node ensemble
- Type of instances: m6i.x4large to start with and you can go up to m6i.16xlarge
- Persistent Storage/volumes: EBS gp2 for data and logs and gp3 for zookeeper

### Install operator in namespace

```bash
#!/bin/bash

# Namespace to install operator into
OPERATOR_NAMESPACE="${OPERATOR_NAMESPACE:-dnieto-test-chop}"
# Namespace to install metrics-exporter into
METRICS_EXPORTER_NAMESPACE="${OPERATOR_NAMESPACE}"
# Operator's docker image
OPERATOR_IMAGE="${OPERATOR_IMAGE:-altinity/clickhouse-operator:latest}"
# Metrics exporter's docker image
METRICS_EXPORTER_IMAGE="${METRICS_EXPORTER_IMAGE:-altinity/metrics-exporter:latest}"

# Setup clickhouse-operator into specified namespace
kubectl apply --namespace="${OPERATOR_NAMESPACE}" -f <( \
    curl -s https://raw.githubusercontent.com/Altinity/clickhouse-operator/master/deploy/operator/clickhouse-operator-install-template.yaml | \
        OPERATOR_IMAGE="${OPERATOR_IMAGE}" \
        OPERATOR_NAMESPACE="${OPERATOR_NAMESPACE}" \
        METRICS_EXPORTER_IMAGE="${METRICS_EXPORTER_IMAGE}" \
        METRICS_EXPORTER_NAMESPACE="${METRICS_EXPORTER_NAMESPACE}" \
        envsubst \
)
```

### Install zookeeper ensemble

zookeepers will be named like zookeeper-0.zoons

```bash
> kubectl create ns zoo3ns
> kubectl -n zoo3ns apply -f https://raw.githubusercontent.com/Altinity/clickhouse-operator/master/deploy/zookeeper/quick-start-persistent-volume/zookeeper-3-nodes-1GB-for-tests-only.yaml

# check names they should be like:
# zookeeper.zoo3ns if using a new namespace
# If using the same namespace zookeeper.<localnamespace>
# zookeeper must be accessed using the service like service_name.namespace
```

### Deploy test cluster

```bash
> kubectl -n dnieto-test-chop apply -f dnieto-test-chop.yaml
```

```yaml
# dnieto-test-chop.yaml
apiVersion: "clickhouse.altinity.com/v1"
kind: "ClickHouseInstallation"
metadata:
  name: "dnieto-dev"
spec:
  configuration:
    settings:
	    max_concurrent_queries: "200"
			merge_tree/ttl_only_drop_parts: "1"
		profiles:
	    default/queue_max_wait_ms: "10000"
			readonly/readonly: "1"
		users:
      admin/networks/ip:
        - 0.0.0.0/0
        - '::/0'
			admin/password_sha256_hex: ""
      admin/profile: default
      admin/access_management: 1
	  zookeeper:  
			nodes:
        - host: zookeeper.dnieto-test-chop
          port: 2181
		clusters:
      - name: dnieto-dev
        templates:
          podTemplate: pod-template-with-volumes
          serviceTemplate: chi-service-template
        layout:
          shardsCount: 1
          # put the number of desired nodes 3 by default
          replicasCount: 2
  templates:
    podTemplates:
      - name: pod-template-with-volumes
        spec:
          containers:
            - name: clickhouse
              image: clickhouse/clickhouse-server:22.3
              # separate data from logs 
              volumeMounts:
                - name: data-storage-vc-template
                  mountPath: /var/lib/clickhouse
                - name: log-storage-vc-template
                  mountPath: /var/log/clickhouse-server
    serviceTemplates:
      - name: chi-service-template
        generateName: "service-{chi}"
        # type ObjectMeta struct from k8s.io/meta/v1
        metadata:
          annotations:
						# https://kubernetes.io/docs/concepts/services-networking/service/#internal-load-balancer
						# this tags for elb load balancer
            #service.beta.kubernetes.io/aws-load-balancer-backend-protocol: tcp
				    #service.beta.kubernetes.io/aws-load-balancer-cross-zone-load-balancing-enabled: "true"
						#https://kubernetes.io/docs/concepts/services-networking/service/#aws-nlb-support
				    service.beta.kubernetes.io/aws-load-balancer-internal: "true"
					  service.beta.kubernetes.io/aws-load-balancer-type: nlb
				spec:
          ports:
            - name: http
              port: 8123
            - name: client
              port: 9000
          type: LoadBalancer
    volumeClaimTemplates:
      - name: data-storage-vc-template
        spec:
        # no storageClassName - means use default storageClassName
        # storageClassName: default
        # here if you have a storageClassName defined for gp2 you can use it.
        # kubectl get storageclass
          accessModes:
            - ReadWriteOnce
          resources:
            requests:
              storage: 50Gi
        reclaimPolicy: Retain
      - name: log-storage-vc-template
        spec:
          accessModes:
            - ReadWriteOnce
          resources:
            requests:
              storage: 2Gi
```

### Install monitoring:

In order to setup prometheus as a backend for all the asynchronous_metric_log / metric_log tables and also set up grafana dashboards:

- https://github.com/Altinity/clickhouse-operator/blob/master/docs/prometheus_setup.md
- https://github.com/Altinity/clickhouse-operator/blob/master/docs/grafana_setup.md
- [clickhouse-operator/monitoring_setup.md at master · Altinity/clickhouse-operator](https://github.com/Altinity/clickhouse-operator/blob/master/docs/monitoring_setup.md)

## Extra configs

There is an admin user by default in the deployment that is used to admin stuff

## KUBECTL chi basic comands:

```bash
*> kubectl get crd*

NAME                                                       CREATED AT
clickhouseinstallations.clickhouse.altinity.com            2021-10-11T13:46:43Z
clickhouseinstallationtemplates.clickhouse.altinity.com    2021-10-11T13:46:44Z
clickhouseoperatorconfigurations.clickhouse.altinity.com   2021-10-11T13:46:44Z
eniconfigs.crd.k8s.amazonaws.com                           2021-10-11T13:41:23Z
grafanadashboards.integreatly.org                          2021-10-11T13:54:37Z
grafanadatasources.integreatly.org                         2021-10-11T13:54:38Z
grafananotificationchannels.integreatly.org                2022-05-17T14:27:48Z
grafanas.integreatly.org                                   2021-10-11T13:54:37Z
provisioners.karpenter.sh                                  2022-05-17T14:27:49Z
securitygrouppolicies.vpcresources.k8s.aws                 2021-10-11T13:41:27Z
volumesnapshotclasses.snapshot.storage.k8s.io              2022-04-22T13:34:20Z
volumesnapshotcontents.snapshot.storage.k8s.io             2022-04-22T13:34:20Z
volumesnapshots.snapshot.storage.k8s.io                    2022-04-22T13:34:20Z

> *kubectl -n test-clickhouse-operator-dnieto2 get chi*
NAME        CLUSTERS   HOSTS   STATUS   HOSTS-COMPLETED   AGE
simple-01                                                 70m

> *kubectl -n test-clickhouse-operator-dnieto2 describe chi simple-01*
Name:         simple-01
Namespace:    test-clickhouse-operator-dnieto2
Labels:       <none>
Annotations:  <none>
API Version:  clickhouse.altinity.com/v1
Kind:         ClickHouseInstallation
Metadata:
  Creation Timestamp:  2023-01-09T20:38:06Z
  Generation:          1
  Managed Fields:
    API Version:  clickhouse.altinity.com/v1
    Fields Type:  FieldsV1
    fieldsV1:
      f:metadata:
        f:annotations:
          .:
          f:kubectl.kubernetes.io/last-applied-configuration:
      f:spec:
        .:
        f:configuration:
          .:
          f:clusters:
    Manager:         kubectl-client-side-apply
    Operation:       Update
    Time:            2023-01-09T20:38:06Z
  Resource Version:  267483138
  UID:               d7018efa-2b13-42fd-b1c5-b798fc6d0098
Spec:
  Configuration:
    Clusters:
      Name:  simple
Events:      <none>

> *kubectl get chi --all-namespaces*

NAMESPACE                          NAME                             CLUSTERS   HOSTS   STATUS      HOSTS-COMPLETED   AGE
andrey-dev                         source                           1          1       Completed                     38d
eu                                 chi-dnieto-test-common-configd   1          1       Completed                     161d
eu                                 dnieto-test                      1          4       Completed                     151d
laszlo-dev                         node-rescale-2                   1          4       Completed                     5d13h
laszlo-dev                         single                           1          1       Completed                     5d13h
laszlo-dev2                        zk2                              1          1       Completed                     52d
test-clickhouse-operator-dnieto2   simple-01

> *kubectl -n test-clickhouse-operator-dnieto2 edit clickhouseinstallations.clickhouse.altinity.com simple-01

# Troubleshoot operator stuff
> kubectl -n test-clickhouse-operator-ns edit chi
> kubectl -n test-clickhouse-operator describe chi
> kubectl -n test-clickhouse-operator get chi -o yaml

# Check operator logs usually located in kube-system or specific namespace
> kubectl -n test-ns logs chi-operator-pod -f

# Check output to yaml
> kubectl -n test-ns get services -o yaml*
```

## Problem with DELETE finalizers:

https://github.com/Altinity/clickhouse-operator/issues/830

There's a problem with stuck finalizers that can cause old CHI installations to hang. The sequence of operations looks like this.

1. You delete the existing ClickHouse operator using `kubectl delete -f operator-installation.yaml` with running CHI clusters.
2. You then drop the namespace where the CHI clusters are running, e.g., `kubectl delete ns my-namespace`
3. This hangs. You run `kubectl get ns my-namespace -o yaml` and you'll see a message like the following: "message: 'Some content in the namespace has finalizers remaining: [finalizer.clickhouseinstallation.altinity.com](http://finalizer.clickhouseinstallation.altinity.com/)"

That means the CHI can't delete because its finalizer was deleted out from under it.

The fix is to figure out the chi name which should still be visible and edit it to remove the finalizer reference.

1. `kubectl -n my-namespace get chi`
2. `kubectl -n my-namespace edit [clickhouseinstallations.clickhouse.altinity.com](http://clickhouseinstallations.clickhouse.altinity.com/) my-clickhouse-cluster`

Remove the finalizer from the spec, save it, and everything will delete properly.

**`TIP: if you delete the ns too and there is no ns just create it and apply the above method`**

## Karpenter scaler

```sql
> kubectl -n karpenter get all
NAME                             READY   STATUS    RESTARTS   AGE
pod/karpenter-75c8b7667b-vbmj4   1/1     Running   0          16d
pod/karpenter-75c8b7667b-wszxt   1/1     Running   0          16d

NAME                TYPE        CLUSTER-IP       EXTERNAL-IP   PORT(S)            AGE
service/karpenter   ClusterIP   172.20.129.188   <none>        8080/TCP,443/TCP   16d

NAME                        READY   UP-TO-DATE   AVAILABLE   AGE
deployment.apps/karpenter   2/2     2            2           16d

NAME                                   DESIRED   CURRENT   READY   AGE
replicaset.apps/karpenter-75c8b7667b   2         2         2       16d

> kubectl -n karpenter logs pod/karpenter-75c8b7667b-vbmj4

2023-02-06T06:33:44.269Z	DEBUG	Successfully created the logger.
2023-02-06T06:33:44.269Z	DEBUG	Logging level set to: debug
{"level":"info","ts":1675665224.2755454,"logger":"fallback","caller":"injection/injection.go:63","msg":"Starting informers..."}
2023-02-06T06:33:44.376Z	DEBUG	controller	waiting for configmaps	{"commit": "f60dacd", "configmaps": ["karpenter-global-settings"]}
2023-02-06T06:33:44.881Z	DEBUG	controller	karpenter-global-settings config "karpenter-global-settings" config was added or updated: settings.Settings{BatchMaxDuration:v1.Duration{Duration:10000000000}, BatchIdleDuration:v1.Duration{Duration:1000000000}}	{"commit": "f60dacd"}
2023-02-06T06:33:44.881Z	DEBUG	controller	karpenter-global-settings config "karpenter-global-settings" config was added or updated: settings.Settings{ClusterName:"eu", ClusterEndpoint:"https://79974769E264251E43B18AF4CA31CE8C.gr7.eu-central-1.eks.amazonaws.com", DefaultInstanceProfile:"KarpenterNodeInstanceProfile-eu", EnablePodENI:false, EnableENILimitedPodDensity:true, IsolatedVPC:false, NodeNameConvention:"ip-name", VMMemoryOverheadPercent:0.075, InterruptionQueueName:"Karpenter-eu", Tags:map[string]string{}}	{"commit": "f60dacd"}
2023-02-06T06:33:45.001Z	DEBUG	controller.aws	discovered region	{"commit": "f60dacd", "region": "eu-central-1"}
2023-02-06T06:33:45.003Z	DEBUG	controller.aws	unable to detect the IP of the kube-dns service, services "kube-dns" is forbidden: User "system:serviceaccount:karpenter:karpenter" cannot get resource "services" in API group "" in the namespace "kube-system"	{"commit": "f60dacd"}
2023/02/06 06:33:45 Registering 2 clients
2023/02/06 06:33:45 Registering 2 informer factories
2023/02/06 06:33:45 Registering 3 informers
2023/02/06 06:33:45 Registering 6 controllers
2023-02-06T06:33:45.080Z	DEBUG	controller.aws	discovered version	{"commit": "f60dacd", "version": "v0.20.0"}
2023-02-06T06:33:45.082Z	INFO	controller	Starting server	{"commit": "f60dacd", "path": "/metrics", "kind": "metrics", "addr": "[::]:8080"}
2023-02-06T06:33:45.082Z	INFO	controller	Starting server	{"commit": "f60dacd", "kind": "health probe", "addr": "[::]:8081"}
I0206 06:33:45.182600       1 leaderelection.go:248] attempting to acquire leader lease karpenter/karpenter-leader-election...
2023-02-06T06:33:45.226Z	INFO	controller	Starting informers...	{"commit": "f60dacd"}
2023-02-06T06:33:45.417Z	INFO	controller.aws.pricing	updated spot pricing with instance types and offerings	{"commit": "f60dacd", "instance-type-count": 607, "offering-count": 1400}
2023-02-06T06:33:47.670Z	INFO	controller.aws.pricing	updated on-demand pricing	{"commit": "f60dacd", "instance-type-count": 505}
```

## Operator Affinities:

![Screenshot from 2023-02-21 11-26-36.png](https://s3-us-west-2.amazonaws.com/secure.notion-static.com/90052686-7c87-413f-95f7-41c12d233190/Screenshot_from_2023-02-21_11-26-36.png)

## Deploy operator with clickhouse-keeper

https://github.com/Altinity/clickhouse-operator/issues/959
[setup-example.yaml](https://github.com/Altinity/clickhouse-operator/blob/eb3fc4e28514d0d6ea25a40698205b02949bcf9d/docs/chi-examples/03-persistent-volume-07-do-not-chown.yaml)

## Possible issues with running ClickHouse in K8s

The biggest problem with running ClickHouse® in K8s, happens when clickhouse-server can't start for some reason and pod is falling in CrashloopBackOff, so you can't easily get in the pod and check/fix/restart ClickHouse.

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
3. Some cloud providers (GKE) can have slow unlink command, which is important for ClickHouse because it's needed for parts management. (`max_part_removal_threads` setting)

Useful commands:

```bash
kubectl logs chi-chcluster-2-1-0 -c clickhouse-pod -n chcluster --previous
kubectl describe pod chi-chcluster-2-1-0 -n chcluster
```

Q. ClickHouse is caching the Kafka pod's IP and trying to connect to the same ip even when there is a new Kafka pod running and the old one is deprecated. Is there some setting where we could refresh the connection

`<disable_internal_dns_cache>1</disable_internal_dns_cache>` in config.xml

### ClickHouse init process failed

It's due to low value for env `CLICKHOUSE_INIT_TIMEOUT` value. Consider increasing it up to 1 min.
[https://github.com/ClickHouse/ClickHouse/blob/9f5cd35a6963cc556a51218b46b0754dcac7306a/docker/server/entrypoint.sh\#L120](https://github.com/ClickHouse/ClickHouse/blob/9f5cd35a6963cc556a51218b46b0754dcac7306a/docker/server/entrypoint.sh#L120)
