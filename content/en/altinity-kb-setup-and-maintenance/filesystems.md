---
title: "ClickHouse and different filesystems"
linkTitle: "ClickHouse and different filesystems"
weight: 100
description: >-
     ClickHouse and different filesystems.
---

## ClickHouse and different filesystems

### ext4 

no issues, fully supported. 

minimum kernel version required is 3.15 (newer are recommended)

### XFS

Performance issues reported by users, use on own risk. Old kernels are not recommened (4.0 or newer is recommended). 

According to the users feedback XFS behave worse with Clickhose under heavy load.
We don't have real real proofs/benchmarks though, example reports:
* In github there are [complaints about XFS](https://github.com/ClickHouse/ClickHouse/issues/520) from CloudFlare.
* Recently my colleague discovered that two of ClickHouse servers perform worse in a cluster than
others and they found that they accidentally setup those servers with XFS instead of Ext4.
* in system journal you can sometimes see reports like 'task XYZ blocked for more than 120 seconds' and stacktrace pointing to xfs code (example: https://gist.github.com/filimonov/85b894268f978c2ccc18ea69bae5adbd )
* system goes to 99% io kernel under load sometimes.
* we have XFS, sometimes clickhouse goes to "sleep" because XFS daemon is doing smth unknown

Maybe the above problem can be workarounded by some tuning / settings, but so far we do not have a working and confirmed way to do this.

### ZFS 

Limitations exists, extra tuning maybe needed, having more RAM is recommended. Old kernels are not recommened.

Memory usage control:
* It seems that the most important thing in our case is zfs_arc_max - you just need to limit the maximum size of the arc so that the sum of the maximum size of the arc + the CH itself does not exceed the size of the available RAM. For example, we set a limit of 80% RAM for Clickhouse and 10% for arc. 10% will remain for the system and other applications

Tuning:
* another potentially interesting setting is primarycache=metadata, see benchmark example: https://www.ikus-soft.com/en/blog/2018-05-23-proxmox-primarycache-all-metadata/
* examples of tuning ZFS for MySQL https://wiki.freebsd.org/ZFSTuningGuide - perhaps some of this can also be useful (atime, recordsize) but everything needs to be carefully checked with benchmarks (I have no way).
* best practices
  * https://efim360.ru/zfs-best-practices-guide/
  * https://pthree.org/2012/12/13/zfs-administration-part-viii-zpool-best-practices-and-caveats/

**important note**: ZFS does not support the `renameat2` command, which is used by the Atomic database engine, and
therefore some of the Atomic functionality will not be available. 

In old versions of clickhouse you can face issues with O_DIRECT mode.

Also there is a well-known (and controversional) Linus Torvalds opinion: "Don't Use ZFS on Linux" [[1]](https://www.realworldtech.com/forum/?threadid=189711&curpostid=189959), [[2]](https://arstechnica.com/gadgets/2020/01/linus-torvalds-zfs-statements-arent-right-heres-the-straight-dope/), [[3]](https://arstechnica.com/gadgets/2020/01/linus-torvalds-zfs-statements-arent-right-heres-the-straight-dope/).

### BTRFS

Not enough information. Some users [report](https://github.com/ClickHouse/ClickHouse/issues/2743#issuecomment-517845388) performance improvement for their usecase.

### ReiserFS

Not enough information. 

### Lustre

There are reports that some people successfully use it in their setups. 
Fast network is required.

There were some reports about data damage on the disks on older clickhouse versions, which could be caused by the issues with O_DIRECT or [async io support](https://lustre-discuss.lustre.narkive.com/zwcvyEEY/asynchronous-posix-i-o-with-lustre) on lustre.
