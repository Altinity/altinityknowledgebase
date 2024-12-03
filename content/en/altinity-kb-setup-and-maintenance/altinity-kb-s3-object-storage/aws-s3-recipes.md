---
title: "AWS S3 Recipes"
linkTitle: "AWS S3 Recipes"
weight: 100
description: >-
     AWS S3 Recipes
---

## Using AWS IAM — Identity and Access Management roles

For EC2 instance, there is an option to configure an IAM role:

![](/assets/select-ec2-iam-role.png)

Role shall contain a policy with permissions like:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "allow-put-and-get",
            "Effect": "Allow",
            "Action": [
                "s3:PutObject",
                "s3:GetObject"
            ],
            "Resource": "arn:aws:s3:::BUCKET_NAME/test_s3_disk/*"
        }
    ]
}
```

Corresponding configuration of ClickHouse®:

```xml
<clickhouse>
    <storage_configuration>
        <disks>
            <disk_s3>
                <type>s3</type>
                <endpoint>http://s3.us-east-1.amazonaws.com/BUCKET_NAME/test_s3_disk/</endpoint>
                <use_environment_credentials>true</use_environment_credentials>
            </disk_s3>
        </disks>
        <policies>
            <policy_s3_only>
                <volumes>
                    <volume_s3>
                        <disk>disk_s3</disk>
                    </volume_s3>
                </volumes>
            </policy_s3_only>
        </policies>
    </storage_configuration>
</clickhouse>
```

Small check:

```sql
CREATE TABLE table_s3 (number Int64) ENGINE=MergeTree() ORDER BY tuple() PARTITION BY tuple() SETTINGS storage_policy='policy_s3_only';
INSERT INTO table_s3 SELECT * FROM system.numbers LIMIT 100000000;
SELECT * FROM table_s3;
DROP TABLE table_s3;
```

## How to use AWS IRSA and IAM in the Altinity Kubernetes Operator for ClickHouse to allow S3 backup without Explicit credentials 

Install `clickhouse-operator` https://github.com/Altinity/clickhouse-operator/tree/master/docs/operator_installation_details.md

Create Role <ROLE NAME> and IAM Policy, look details in https://docs.aws.amazon.com/emr/latest/EMR-on-EKS-DevelopmentGuide/setting-up-enable-IAM.html

Create service account with annotations
```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: <SERVICE ACOUNT NAME>
  namespace: <NAMESPACE>
  annotations:
     eks.amazonaws.com/role-arn: arn:aws:iam::<ACCOUNT_ID>:role/<ROLE_NAME>
```

Link service account to podTemplate it will create `AWS_ROLE_ARN` and `AWS_WEB_IDENTITY_TOKEN_FILE` environment variables. 
```yaml
apiVersion: "clickhouse.altinity.com/v1"
kind: "ClickHouseInstallation"
metadata:
  name: <NAME>
  namespace: <NAMESPACE>
spec:
  defaults:
     templates:
       podTemplate: <POD_TEMPLATE_NAME>
  templates:
    podTemplates:
      - name: <POD_TEMPLATE_NAME>
        spec:
          serviceAccountName: <SERVICE ACCOUNT NAME>
          containers:
            - name: clickhouse-backup
```

For EC2 instances the same environment variables should be created:

```
AWS_ROLE_ARN=arn:aws:iam::<ACCOUNT_ID>:role/<ROLE_NAME>
AWS_WEB_IDENTITY_TOKEN_FILE=/var/run/secrets/eks.amazonaws.com/serviceaccount/token
```

