---
title: "Logging"
linkTitle: "Logging"
weight: 100
description: >-
     Logging configuration and issues
---
Q. I get errors:

```bash
File not found: /var/log/clickhouse-server/clickhouse-server.log.0.
File not found: /var/log/clickhouse-server/clickhouse-server.log.8.gz.

...

 File not found: /var/log/clickhouse-server/clickhouse-server.err.log.0, Stack trace (when copying this message, always include the lines below):
0. Poco::FileImpl::handleLastErrorImpl(std::__1::basic_string<char, std::__1::char_traits<char>, std::__1::allocator<char> > const&) @ 0x11c2b345 in /usr/bin/clickhouse
1. Poco::PurgeOneFileStrategy::purge(std::__1::basic_string<char, std::__1::char_traits<char>, std::__1::allocator<char> > const&) @ 0x11c84618 in /usr/bin/clickhouse
2. Poco::FileChannel::log(Poco::Message const&) @ 0x11c314cc in /usr/bin/clickhouse
3. DB::OwnFormattingChannel::logExtended(DB::ExtendedLogMessage const&) @ 0x8681402 in /usr/bin/clickhouse
4. DB::OwnSplitChannel::logSplit(Poco::Message const&) @ 0x8682fa8 in /usr/bin/clickhouse
5. DB::OwnSplitChannel::log(Poco::Message const&) @ 0x8682e41 in /usr/bin/clickhouse
```

A. Check if you have proper permission to a log files folder, and enough disk space \(& inode numbers\) on the block device used for logging.

```bash
ls -la /var/log/clickhouse-server/
df -Th
df -Thi
```

Q. How to configure logging in clickhouse?

A. See [https://github.com/ClickHouse/ClickHouse/blob/ceaf6d57b7f00e1925b85754298cf958a278289a/programs/server/config.xml\#L9-L62](https://github.com/ClickHouse/ClickHouse/blob/ceaf6d57b7f00e1925b85754298cf958a278289a/programs/server/config.xml#L9-L62)
