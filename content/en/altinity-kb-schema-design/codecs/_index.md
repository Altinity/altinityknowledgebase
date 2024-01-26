---
title: "Codecs"
linkTitle: "Codecs"
description: >
    Codecs
---

| Codec Name       | Recommended Data Types               | Performance Notes |
|------------------|--------------------------------------|-------------------|
| LZ4              | Any                                  | Used by default. Extremely fast; good compression; balanced speed and efficiency |
| ZSTD(level)      | Any                                  | Good compression; pretty fast; best for high compression needs. Don't use levels highter than 3. |
| LZ4HC(level)     | Any                                  | LZ4 High Compression algorithm with configurable level; slower but better compression than LZ4, but decmpression is still fast. |
| Delta            | Integer Types, Time Series Data      | Preprocessor (should be followed by some compression coded). Stores difference between neighboring values; good for monotonically increasing data.  |
| DoubleDelta      | Integer Types, Time Series Data      | Stores difference between neighboring delta values; suitable for time series data |
| Gorilla          | Floating Point Types                 | Calculates XOR between current and previous value; suitable for slowly changing numbers |
| T64              | Integer, Enum, Date, DateTime        | Preprocessor (should be followed by some compression coded). Crops unused high bits; puts them into a 64x64 bit matrix; optimized for 64-bit data types |
| GCD              | Integer Numbers                      | Preprocessor (should be followed by some compression coded). Greatest common divisor compression; divides values by a common divisor; effective for divisible integer sequences |
| FPC              | Floating Point Numbers               | Designed for Float64; Algorithm detailed in [FPC paper](https://userweb.cs.txstate.edu/~burtscher/papers/dcc07a.pdf), [ClickHouse PR #37553](https://github.com/ClickHouse/ClickHouse/pull/37553) |
| ZSTD_QAT         | Any                                  | Requires hardware support for QuickAssist Technology (QAT) hardware; provides accelerated compression tasks |
| DEFLATE_QPL      | Any                                  | Requires hardware support for Intel’s QuickAssist Technology for DEFLATE compression; enhanced performance for specific hardware |
| LowCardinality   | String                               | It's not a codec, but a datatype modifuer Reduces representation size; effective for columns with low cardinality |
| NONE             | Non-compressable data with very high entropy, like some random string, or some AggregateFunction states              | No compression at all. Can be used on the columns that can not be compressed anyway. |



See

[How to test different compression codecs](altinity-kb-how-to-test-different-compression-codecs)

[https://altinity.com/blog/2019/7/new-encodings-to-improve-clickhouse](https://altinity.com/blog/2019/7/new-encodings-to-improve-clickhouse)

[https://www.percona.com/sites/default/files/ple19-slides/day1-pm/clickhouse-for-timeseries.pdf](https://www.percona.com/sites/default/files/ple19-slides/day1-pm/clickhouse-for-timeseries.pdf)
