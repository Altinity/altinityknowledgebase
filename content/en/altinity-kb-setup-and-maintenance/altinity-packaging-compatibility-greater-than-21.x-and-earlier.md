---
title: "Altinity packaging compatibility &gt;21.x and earlier"
linkTitle: "Altinity packaging compatibility &gt;21.x and earlier"
description: >
    Altinity packaging compatibility &gt;21.x and earlier
---

## Working with Altinity & Yandex packaging together

Since version 21.1 Altinity switches to the same packaging as used by Yandex. That is needed for syncing things and introduces several improvements \(like adding systemd service file\).

Unfortunately, that change leads to compatibility issues - automatic dependencies resolution gets confused by the conflicting package names: both when you update ClickHouse to the new version \(the one which uses older packaging\) and when you want to install older altinity packages \(20.8 and older\).

### Installing old clickhouse version \(with old packaging schema\)

When you try to install versions 20.8 or older from Altinity repo -

```text
version=20.8.12.2-1.el7 
yum install clickhouse-client-${version} clickhouse-server-${version}
```

yum outputs smth like

```text
yum install clickhouse-client-${version} clickhouse-server-${version} 
Loaded plugins: fastestmirror, ovl
Loading mirror speeds from cached hostfile
 * base: centos.hitme.net.pl
 * extras: centos1.hti.pl
 * updates: centos1.hti.pl
Altinity_clickhouse-altinity-stable/x86_64/signature                                                                                                                                |  833 B  00:00:00     
Altinity_clickhouse-altinity-stable/x86_64/signature                                                                                                                                | 1.0 kB  00:00:01 !!! 
Altinity_clickhouse-altinity-stable-source/signature                                                                                                                                |  833 B  00:00:00     
Altinity_clickhouse-altinity-stable-source/signature                                                                                                                                |  951 B  00:00:00 !!! 
Resolving Dependencies
--> Running transaction check
---> Package clickhouse-client.x86_64 0:20.8.12.2-1.el7 will be installed
---> Package clickhouse-server.x86_64 0:20.8.12.2-1.el7 will be installed
--> Processing Dependency: clickhouse-server-common = 20.8.12.2-1.el7 for package: clickhouse-server-20.8.12.2-1.el7.x86_64
Package clickhouse-server-common is obsoleted by clickhouse-server, but obsoleting package does not provide for requirements
--> Processing Dependency: clickhouse-common-static = 20.8.12.2-1.el7 for package: clickhouse-server-20.8.12.2-1.el7.x86_64
--> Running transaction check
---> Package clickhouse-common-static.x86_64 0:20.8.12.2-1.el7 will be installed
---> Package clickhouse-server.x86_64 0:20.8.12.2-1.el7 will be installed
--> Processing Dependency: clickhouse-server-common = 20.8.12.2-1.el7 for package: clickhouse-server-20.8.12.2-1.el7.x86_64
Package clickhouse-server-common is obsoleted by clickhouse-server, but obsoleting package does not provide for requirements
--> Finished Dependency Resolution
Error: Package: clickhouse-server-20.8.12.2-1.el7.x86_64 (Altinity_clickhouse-altinity-stable)
           Requires: clickhouse-server-common = 20.8.12.2-1.el7
           Available: clickhouse-server-common-1.1.54370-2.x86_64 (clickhouse-stable)
               clickhouse-server-common = 1.1.54370-2
           Available: clickhouse-server-common-1.1.54378-2.x86_64 (clickhouse-stable)
               clickhouse-server-common = 1.1.54378-2
...
           Available: clickhouse-server-common-20.8.11.17-1.el7.x86_64 (Altinity_clickhouse-altinity-stable)
               clickhouse-server-common = 20.8.11.17-1.el7
           Available: clickhouse-server-common-20.8.12.2-1.el7.x86_64 (Altinity_clickhouse-altinity-stable)
               clickhouse-server-common = 20.8.12.2-1.el7
 You could try using --skip-broken to work around the problem
 You could try running: rpm -Va --nofiles --nodigest
```

As you can see yum has an issue with resolving `clickhouse-server-common` dependency, which marked as obsoleted by newer packages.

#### Solution

add `--setopt=obsoletes=0` flag to the yum call.

```text
version=20.8.12.2-1.el7 
yum install --setopt=obsoletes=0 clickhouse-client-${version} clickhouse-server-${version}
---
title: "installation succeeded"
linkTitle: "installation succeeded"
description: >
    installation succeeded
---
```

Alternatively, you can add `obsoletes=0` into `/etc/yum.conf`.

### To update to new ClickHouse version \(from old packaging schema to new packaging schema\)

```text
version=21.1.7.1-2
yum install clickhouse-client-${version} clickhouse-server-${version}
```

```text
Loaded plugins: fastestmirror, ovl
Loading mirror speeds from cached hostfile
 * base: centos.hitme.net.pl
 * extras: centos1.hti.pl
 * updates: centos1.hti.pl
Altinity_clickhouse-altinity-stable/x86_64/signature                                                                                                                                |  833 B  00:00:00     
Altinity_clickhouse-altinity-stable/x86_64/signature                                                                                                                                | 1.0 kB  00:00:01 !!! 
Altinity_clickhouse-altinity-stable-source/signature                                                                                                                                |  833 B  00:00:00     
Altinity_clickhouse-altinity-stable-source/signature                                                                                                                                |  951 B  00:00:00 !!! 
Nothing to do
```

It is caused by wrong dependencies resolution.

#### Solution

To update to the latest available version - just add `clickhouse-server-common`:

```text
yum install clickhouse-client clickhouse-server clickhouse-server-common
```

This way the latest available version will be installed \(even if you will request some other version explicitly\).

To install some specific version remove old packages first, then install new ones.

```text
yum erase clickhouse-client clickhouse-server clickhouse-server-common clickhouse-common-static 
version=21.1.7.1
yum install clickhouse-client-${version} clickhouse-server-${version}
```

### Downgrade from new version to old one

```text
version=20.8.12.2-1.el7
yum downgrade  clickhouse-client-${version} clickhouse-server-${version}
```

will not work:

```text
Loaded plugins: fastestmirror, ovl
Loading mirror speeds from cached hostfile
 * base: ftp.agh.edu.pl
 * extras: ftp.agh.edu.pl
 * updates: centos.wielun.net
Resolving Dependencies
--> Running transaction check
---> Package clickhouse-client.x86_64 0:20.8.12.2-1.el7 will be a downgrade
---> Package clickhouse-client.noarch 0:21.1.7.1-2 will be erased
---> Package clickhouse-server.x86_64 0:20.8.12.2-1.el7 will be a downgrade
--> Processing Dependency: clickhouse-server-common = 20.8.12.2-1.el7 for package: clickhouse-server-20.8.12.2-1.el7.x86_64
Package clickhouse-server-common-20.8.12.2-1.el7.x86_64 is obsoleted by clickhouse-server-21.1.7.1-2.noarch which is already installed
--> Processing Dependency: clickhouse-common-static = 20.8.12.2-1.el7 for package: clickhouse-server-20.8.12.2-1.el7.x86_64
---> Package clickhouse-server.noarch 0:21.1.7.1-2 will be erased
--> Finished Dependency Resolution
Error: Package: clickhouse-server-20.8.12.2-1.el7.x86_64 (Altinity_clickhouse-altinity-stable)
           Requires: clickhouse-common-static = 20.8.12.2-1.el7
           Installed: clickhouse-common-static-21.1.7.1-2.x86_64 (@clickhouse-stable)
               clickhouse-common-static = 21.1.7.1-2
           Available: clickhouse-common-static-1.1.54378-2.x86_64 (clickhouse-stable)
               clickhouse-common-static = 1.1.54378-2
Error: Package: clickhouse-server-20.8.12.2-1.el7.x86_64 (Altinity_clickhouse-altinity-stable)
...
           Available: clickhouse-server-common-20.8.12.2-1.el7.x86_64 (Altinity_clickhouse-altinity-stable)
               clickhouse-server-common = 20.8.12.2-1.el7
 You could try using --skip-broken to work around the problem
 You could try running: rpm -Va --nofiles --nodigest
```

#### Solution

Remove packages first, then install older versions:

```text
yum erase clickhouse-client clickhouse-server clickhouse-server-common clickhouse-common-static
version=20.8.12.2-1.el7
yum install --setopt=obsoletes=0 clickhouse-client-${version} clickhouse-server-${version}
```

