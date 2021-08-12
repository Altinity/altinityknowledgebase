---
title: "IPs/masks"
linkTitle: "IPs/masks"
description: >
    IPs/masks
---
### How do I Store IPv4 and IPv6 Address In One Field?

There is a clean and simple solution for that. Any IPv4 has its unique IPv6 mapping:

* IPv4 IP address: 191.239.213.197
* IPv4-mapped IPv6 address: ::ffff:191.239.213.197

#### Find IPs matching CIDR/network mask (IPv4)

```sql
WITH IPv4CIDRToRange( toIPv4('10.0.0.1'), 8 ) as range
SELECT
  *
FROM values('ip IPv4',
               toIPv4('10.2.3.4'),
               toIPv4('192.0.2.1'),
               toIPv4('8.8.8.8'))
WHERE
   ip BETWEEN range.1 AND range.2;
```

#### Find IPs matching CIDR/network mask (IPv6)

```sql
WITH IPv6CIDRToRange
     (
       toIPv6('2001:0db8:0000:85a3:0000:0000:ac1f:8001'),
       32
      ) as range
SELECT
  *
FROM values('ip IPv6',
               toIPv6('2001:db8::8a2e:370:7334'),
               toIPv6('::ffff:192.0.2.1'),
               toIPv6('::'))
WHERE
   ip BETWEEN range.1 AND range.2;
```
