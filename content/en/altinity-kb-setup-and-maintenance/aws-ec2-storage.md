---
title: "AWS EC2 Storage"
linkTitle: "AWS EC2 Storage"
description: >
    AWS EBS, EFS, FSx, Lustre
aliases:
    - "/altinity-kb-setup-and-maintenance/aws-ebs/"
---

# EBS

Most native choose for ClickHouse as fast storage, because it usually guarantees best throughput, IOPS, latency for reasonable price.

[https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ebs-optimized.html](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ebs-optimized.html)

[https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ebs-volume-types.html](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ebs-volume-types.html)


## General Purpose SSD volumes

In usual conditions ClickHouse being limited by throughput of volumes and amount of provided IOPS doesn't make any big difference for performance starting from a certain number. So the most native choice for clickhouse is gp3 and gp2 volumes.

‌EC2 instances also have an EBS throughput limit, it depends on the size of the EC2 instance. That means if you would attach multiple volumes which would have high potential throughput, you would be limited by your EC2 instance, so usually there is no reason to have more than 1-3 GP3 volume or 4-5 GP2 volume per node.

It's pretty straightforward to set up a ClickHouse for using multiple EBS volumes with jbod storage_policies.

[general purpose](https://aws.amazon.com/ebs/general-purpose/)

<table>
  <thead>
    <tr>
      <th style="text-align:left"> <b>Volume type</b>
      </th>
      <th style="text-align:center">gp3</th>
      <th style="text-align:center">gp2</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="text-align:left"> <b>Max throughput per volume</b>
      </td>
      <td style="text-align:center">1000 MiB/s</td>
      <td style="text-align:center">250 MiB/s</td>
    </tr>
    <tr>
      <td style="text-align:left"><b>Price</b>
      </td>
      <td style="text-align:center">
        <p>$0.08/GB-month</p>
        <p>3,000 IOPS free and</p>
        <p>$0.005/provisioned IOPS-month over 3,000;</p>
        <p>125 MB/s free and</p>
        <p>$0.04/provisioned MB/s-month over 125</p>
      </td>
      <td style="text-align:center">$0.10/GB-month</td>
    </tr>
  </tbody>
</table>


### GP3

It's **recommended option**, as it allow you to have only one volume, for instances which have less than 10 Gbps EBS Bandwidth (nodes =<32 VCPU usually) and still have maximum performance.
For bigger instances, it make sense to look into option of having several GP3 volumes.

It's a new type of volume, which is 20% cheaper than gp2 per GB-month and has lower free throughput: only 125 MiB/s vs 250 MiB/s. But you can buy additional throughput and IOPS for volume. It also works better if most of your queries read only one or several parts, because in that case you are not being limited by performance of a single EBS disk, as parts can be located only on one disk at once.

Because, you need to have less GP3 volumes compared to GP2 option, it's suggested approach for now.  

For best performance, it's suggested to buy:
* 7000 IOPS
* Throughput up to the limit of your EC2 instance (1000 MiB/s is safe option)


### GP2

‌GP2 volumes have a hard limit of 250 MiB/s per volume (for volumes bigger than 334 GB), it usually makes sense to split one big volume in multiple smaller volumes larger than 334GB in order to have maximum possible throughput. 

## Throughput Optimized HDD volumes

### ST1

Looks like a good candidate for cheap cold storage for old data with decent maximum throughput 500 MiB/s. But it achieved only for big volumes >5 TiB.

[Throughput credits and burst performance](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/hdd-vols.html#EBSVolumeTypes_st1)

## Provisioned IOPS SSD volumes

### IO2 Block Express, IO2, IO1

In 99.99% cases doesn't give any benefit for ClickHouse compared to GP3 option and perform worse because maximum throughput is limited to 500 MiB/s per volume if you buy less than 32 000 IOPS, which is really expensive (compared to other options) and unneded for ClickHouse. And if you have spare money, it's better to spend them on better EC2 instance.

# S3

Best option for cold data, it can give considerably good throughput and really good price, but latencies and IOPS much worse than EBS option.
Another intresting point is, for EC2 instance throughput limit for EBS and S3 calculated separately, so if you access your data both from EBS and S3, you can get double throughput.

It's stated in AWS documentation, that S3 can fully utilize network capacity of EC2 instance. (up to 100 Gb/s)
Latencies or (first-byte-out) estimated to be 100-200 milliseconds withing single region.

It also recommended to enable [gateway endpoint for s3](https://docs.aws.amazon.com/vpc/latest/privatelink/vpc-endpoints-s3.html#create-gateway-endpoint-s3), it can push throughput even futher (up to 800 Gb/s) 

[S3 best practices](https://docs.aws.amazon.com/AmazonS3/latest/userguide/optimizing-performance.html)

# EFS

Works over NFSv4.1 version.
We have clients, which run their ClickHouse installations over NFS. It works considerabely well as cold storage, so it's recommended to have EBS disks for hot data. A fast network is required.

ClickHouse doesn't have any native option to reuse the same data on durable network disk via several replicas. You either need to store the same data twice or build custom tooling around ClickHouse and use it without Replicated*MergeTree tables. 

# FSx

## Lustre

We have several clients, who use Lustre (some of them use AWS FSx Lustre, another is self managed Lustre) without any big issue. Fast network is requered.
There were known problems with data damage on older versions caused by issues with O_DIRECT or [async IO](https://lustre-discuss.lustre.narkive.com/zwcvyEEY/asynchronous-posix-i-o-with-lustre) support on Lustre.

ClickHouse doesn't have any native option to reuse the same data on durable network disk via several replicas. You either need to store the same data twice or build custom tooling around ClickHouse and use it without Replicated*MergeTree tables. 

[https://altinity.com/blog/2019/11/27/amplifying-clickhouse-capacity-with-multi-volume-storage-part-1](https://altinity.com/blog/2019/11/27/amplifying-clickhouse-capacity-with-multi-volume-storage-part-1)

[https://altinity.com/blog/2019/11/29/amplifying-clickhouse-capacity-with-multi-volume-storage-part-2](https://altinity.com/blog/2019/11/29/amplifying-clickhouse-capacity-with-multi-volume-storage-part-2)

[https://calculator.aws/\#/createCalculator/EBS?nc2=h_ql_pr_calc](https://calculator.aws/\#/createCalculator/EBS?nc2=h_ql_pr_calc)



