---
title: "AWS EBS"
linkTitle: "AWS EBS"
description: >
    AWS EBS
---
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

### GP2

In usual conditions ClickHouse being limited by throughput of volumes only and amount of provided IOPS doesn't make any big difference for performance. So the most native choice for clickhouse is gp2 and gp3 volumes.

‌Because gp2 volumes have a hard limit of 250 MiB/s per volume (for volumes bigger than 334 GB), it usually makes sense to split one big volume in multiple smaller volumes larger than 334GB in order to have maximum possible throughput.

‌EC2 instances also have an EBS throughput limit, it depends on the size of the EC2 instance. That means if you would attach multiple volumes which would have high potential throughput, you would be limited by your EC2 instance, so usually there is no reason to have more than 4-5 volumes per node.

It's pretty straightforward to set up a ClickHouse for using multiple EBS volumes with storage_policies.

### GP3

It's a new type of volume, which is 20% cheaper than gp2 per GB-month and has lower free throughput: only 125 MB/s vs 250 MB/s. But you can buy additional throughput for volume and gp3 pricing became comparable with multiple gp2 volumes starting from 1000-1500GB size.

[https://altinity.com/blog/2019/11/27/amplifying-clickhouse-capacity-with-multi-volume-storage-part-1](https://altinity.com/blog/2019/11/27/amplifying-clickhouse-capacity-with-multi-volume-storage-part-1)

[https://altinity.com/blog/2019/11/29/amplifying-clickhouse-capacity-with-multi-volume-storage-part-2](https://altinity.com/blog/2019/11/29/amplifying-clickhouse-capacity-with-multi-volume-storage-part-2)

[https://calculator.aws/\#/createCalculator/EBS?nc2=h_ql_pr_calc](https://calculator.aws/\#/createCalculator/EBS?nc2=h_ql_pr_calc)

[https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ebs-optimized.html](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ebs-optimized.html)

[https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ebs-volume-types.html](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ebs-volume-types.html)

[https://aws.amazon.com/ebs/general-purpose/](https://aws.amazon.com/ebs/general-purpose/)
