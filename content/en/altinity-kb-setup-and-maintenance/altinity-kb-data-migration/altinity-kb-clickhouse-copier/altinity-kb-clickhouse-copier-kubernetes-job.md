---
title: "Kubernetes job for clickhouse-copier"
linkTitle: "Kubernetes job for clickhouse-copier"
description: >
    Kubernetes job for clickhouse-copier
---
# ClickHouse-copier deployment in kubernetes

`clickhouse-copier` can be deployed in a kubernetes environment to automate some simple backups or copy fresh data between clusters. 

Some documentation to read:
* https://kb.altinity.com/altinity-kb-setup-and-maintenance/altinity-kb-data-migration/altinity-kb-clickhouse-copier/
* https://clickhouse.com/docs/en/operations/utilities/clickhouse-copier/

## Deployment

Use a kubernetes job is recommended but a simple pod can be used if you only want to execute the copy one time.

Just edit/change all the ```yaml``` files to your needs.

### 1) Create the PVC:

First create a namespace in which all the pods and resources are going to be deployed

```bash
kubectl create namespace clickhouse-copier
```

Then create the PVC using a ```storageClass``` gp2-encrypted class or use any other storageClass from other providers:

```yaml
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: copier-logs
  namespace: clickhouse-copier
spec:
  storageClassName: gp2-encrypted
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 100Mi
```

and deploy:

```bash
kubectl -n clickhouse-copier create -f ./kubernetes/copier-pvc.yaml
```

### 2) Create the configmap:

The configmap has both files ```zookeeper.xml``` and ```task01.xml``` with the zookeeper node listing and the parameters for the task respectively.

```yaml
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: copier-config
  namespace: clickhouse-copier
data:
    task01.xml: |
        <clickhouse>
            <logger>
                <console>true</console>
                <log remove="remove"/>
                <errorlog remove="remove"/>
                <level>trace</level>
            </logger>
            <remote_servers>
                <all-replicated>
                    <shard>
                        <replica>
                            <host>clickhouse01.svc.cluster.local</host>
                            <port>9000</port>
                            <user>chcopier</user>
                            <password>pass</password>
                        </replica>
                        <replica>
                            <host>clickhouse02.svc.cluster.local</host>
                            <port>9000</port>
                            <user>chcopier</user>
                            <password>pass</password>
                        </replica>
                    </shard>
                </all-replicated>
                <all-sharded>
                    <!-- <secret></secret> -->
                    <shard>
                        <replica>
                            <host>clickhouse03.svc.cluster.local</host>
                            <port>9000</port>
                            <user>chcopier</user>
                            <password>pass</password>
                        </replica>
                    </shard>
                    <shard>
                        <replica>
                            <host>clickhouse03.svc.cluster.local</host>
                            <port>9000</port>
                            <user>chcopier</user>
                            <password>pass</password>
                        </replica>
                    </shard>
                </all-sharded>
            </remote_servers>
            <max_workers>1</max_workers>
            <settings_pull>
                <readonly>1</readonly>
            </settings_pull>
            <settings_push>
                <readonly>0</readonly>
            </settings_push>
            <settings>
                <connect_timeout>3</connect_timeout>
                <insert_distributed_sync>1</insert_distributed_sync>
            </settings>
            <tables>
                <table_sales>
                    <cluster_pull>all-replicated</cluster_pull>
                    <database_pull>default</database_pull>
                    <table_pull>fact_sales_event</table_pull>
                    <cluster_push>all-sharded</cluster_push>
                    <database_push>default</database_push>
                    <table_push>fact_sales_event</table_push>
                    <engine>
                        Engine=ReplicatedMergeTree('/clickhouse/{cluster}/tables/{shard}/fact_sales_event', '{replica}')
                        PARTITION BY toYYYYMM(timestamp)
                        ORDER BY (channel_id, product_id)
                        SETTINGS index_granularity = 8192
                    </engine>
                    <sharding_key>rand()</sharding_key>
                </table_ventas>
            </tables>
        </clickhouse>
    zookeeper.xml: |
        <clickhouse>
            <logger>
                <level>trace</level>
                <size>100M</size>
                <count>3</count>
            </logger>
            <zookeeper>
                <node>
                    <host>zookeeper1.svc.cluster.local</host>
                    <port>2181</port>
                </node>
                <node>
                    <host>zookeeper2.svc.cluster.local</host>
                    <port>2181</port>
                </node>
                <node>
                    <host>zookeeper3.svc.cluster.local</host>
                    <port>2181</port>
                </node>
            </zookeeper>
        </clickhouse>
```

and deploy:

```bash
kubectl -n clickhouse-copier create -f ./kubernetes/copier-configmap.yaml
```

The ```task01.xml``` file has many parameters to take into account explained in the [clickhouse-copier documentation](https://clickhouse.com/docs/en/operations/utilities/clickhouse-copier/). Important to note that it is needed a FQDN for the Zookeeper nodes and ClickHouse server that are valid for the cluster. As the deployment creates a new namespace, it is recommended to use a FQDN linked to a service. For example ```zookeeper01.svc.cluster.local```. This file should be adapted to both clusters topologies and to the needs of the user.

The ```zookeeper.xml``` file is pretty straightforward with a simple 3 node ensemble configuration.

### 3) Create the job:

Basically the job will download the official clickhouse image and will create a pod with 2 containers:
  
  - clickhouse-copier: This container will run the clickhouse-copier utility.
 
  - sidecar-logging: This container will be used to read the logs of the clickhouse-copier container for different runs (this part can be improved):

```yaml
---
apiVersion: batch/v1
kind: Job
metadata:
  name: clickhouse-copier-test
  namespace: clickhouse-copier
spec:
  # only for kubernetes 1.23
  # ttlSecondsAfterFinished: 86400
  template:
    spec:
      containers:
        - name: clickhouse-copier
          image: clickhouse/clickhouse-server:21.8
          command:
            - clickhouse-copier
            - --task-upload-force=1
            - --config-file=$(CH_COPIER_CONFIG)
            - --task-path=$(CH_COPIER_TASKPATH)
            - --task-file=$(CH_COPIER_TASKFILE)
            - --base-dir=$(CH_COPIER_BASEDIR)
          env:
            - name: CH_COPIER_CONFIG
              value: "/var/lib/clickhouse/tmp/zookeeper.xml"
            - name: CH_COPIER_TASKPATH
              value: "/clickhouse/copier/tasks/task01"
            - name: CH_COPIER_TASKFILE
              value: "/var/lib/clickhouse/tmp/task01.xml"
            - name: CH_COPIER_BASEDIR
              value: "/var/lib/clickhouse/tmp"
          resources:
            limits:
              cpu: "1"
              memory: 2048Mi
          volumeMounts:
            - name: copier-config
              mountPath: /var/lib/clickhouse/tmp/zookeeper.xml
              subPath: zookeeper.xml
            - name: copier-config
              mountPath: /var/lib/clickhouse/tmp/task01.xml
              subPath: task01.xml
            - name: copier-logs
              mountPath: /var/lib/clickhouse/tmp
        - name: sidecar-logger
          image: busybox:1.35
          command: ['/bin/sh', '-c', 'tail', '-n', '1000', '-f', '/tmp/copier-logs/clickhouse-copier*/*.log']
          resources:
            limits:
              cpu: "1"
              memory: 512Mi
          volumeMounts:
            - name: copier-logs
              mountPath: /tmp/copier-logs
      volumes:
        - name: copier-config
          configMap:
            name: copier-config
            items:
              - key: zookeeper.xml
                path: zookeeper.xml
              - key: task01.xml
                path: task01.xml
        - name: copier-logs
          persistentVolumeClaim:
            claimName: copier-logs
      restartPolicy: Never
  backoffLimit: 3
```

Deploy and watch progress checking the logs:

```bash
kubectl -n clickhouse-copier logs <podname> sidecar-logging
```
