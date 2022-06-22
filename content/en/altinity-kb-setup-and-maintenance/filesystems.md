---
title: "ClickHouse and different filesystems"
linkTitle: "ClickHouse and different filesystems"
weight: 100
description: >-
     ClickHouse and different filesystems.
---

## ClickHouse and different filesystems

In general ClickHouse should work with any POSIX-compatible filesystem.

* hard links and soft links support is mandatory.
* clickhouse can use O_DIRECT mode to bypass the cache (and async io)
* clickhouse can use renameat2 command for some atomic operations (not all the filesystems support that).
* depending on the schema and details of the usage the filesystem load can vary between the setup. The most natural load - is high throughput, with low or moderate IOPS. 
* data is compressed in clickhouse (LZ4 by default), while indexes / marks / metadata files  - no. Enabling disk-level compression can sometimes improve the compression, but can affect read / write speed.

### ext4 

no issues, fully supported. 

The minimum kernel version required is 3.15 (newer are recommended)

### XFS

Performance issues reported by users, use on own risk. Old kernels are not recommended (4.0 or newer is recommended). 

According to the users' feedback, XFS behaves worse with ClickHouse under heavy load.
We don't have real proofs/benchmarks though, example reports:
* In GitHub there are [complaints about XFS](https://github.com/ClickHouse/ClickHouse/issues/520) from Cloudflare.
* Recently my colleague discovered that two of ClickHouse servers perform worse in a cluster than
others and they found that they accidentally set up those servers with XFS instead of Ext4.
* in the system journal you can sometimes see reports like 'task XYZ blocked for more than 120 seconds' and stack trace pointing to XFS code (example: https://gist.github.com/filimonov/85b894268f978c2ccc18ea69bae5adbd )
* system goes to 99% io kernel under load sometimes.
* we have XFS, sometimes clickhouse goes to "sleep" because XFS daemon is doing smth unknown

Maybe the above problem can be workaround by some tuning/settings, but so far we do not have a working and confirmed way to do this.

### ZFS 

Limitations exist, extra tuning may be needed, and having more RAM is recommended. Old kernels are not recommended.

Memory usage control - ZFS adaptive replacement cache (ARC) can take a lot of RAM.  It can be the reason of out-of-memory issues when memory is also requested by the ClickHouse.

* It seems that the most important thing is zfs_arc_max - you just need to limit the maximum size of the ARC so that the sum of the maximum size of the arc + the CH itself does not exceed the size of the available RAM. For example, we set a limit of 80% RAM for Clickhouse and 10% for ARC. 10% will remain for the system and other applications

Tuning:
* another potentially interesting setting is primarycache=metadata, see benchmark example: https://www.ikus-soft.com/en/blog/2018-05-23-proxmox-primarycache-all-metadata/
* examples of tuning ZFS for MySQL https://wiki.freebsd.org/ZFSTuningGuide - perhaps some of this can also be useful (atime, recordsize) but everything needs to be carefully checked with benchmarks (I have no way).
* best practices
  * https://efim360.ru/zfs-best-practices-guide/
  * https://pthree.org/2012/12/13/zfs-administration-part-viii-zpool-best-practices-and-caveats/

**important note**: ZFS does not support the `renameat2` command, which is used by the Atomic database engine, and
therefore some of the Atomic functionality will not be available. 

In old versions of clickhouse, you can face issues with the O_DIRECT mode.

Also there is a well-known (and controversional) Linus Torvalds opinion: "Don't Use ZFS on Linux" [[1]](https://www.realworldtech.com/forum/?threadid=189711&curpostid=189841), [[2]](https://arstechnica.com/gadgets/2020/01/linus-torvalds-zfs-statements-arent-right-heres-the-straight-dope/), [[3]](https://arstechnica.com/gadgets/2020/01/linus-torvalds-zfs-statements-arent-right-heres-the-straight-dope/).

### BTRFS

Not enough information. Some users [report](https://github.com/ClickHouse/ClickHouse/issues/2743#issuecomment-517845388) performance improvement for their use case.

### ReiserFS

Not enough information. 

### Lustre

There are reports that some people successfully use it in their setups. 
A fast network is required.

There were some reports about data damage on the disks on older clickhouse versions, which could be caused by the issues with O_DIRECT or [async io support](https://lustre-discuss.lustre.narkive.com/zwcvyEEY/asynchronous-posix-i-o-with-lustre) on Lustre.

### NFS (and EFS)

Accouding to the reports - it works, throughput depends a lot on the network speed. IOPS / number of file operations per seconds can be super low (due to the locking mechanism).

https://github.com/ClickHouse/ClickHouse/issues/31113

### MooseFS

There are installations using that. No extra info.

### GlusterFS

There are installations using that. No extra info.

### Ceph

There are installations using that. Some information: https://github.com/ClickHouse/ClickHouse/issues/8315 
