---
title: "Codecs speed"
linkTitle: "Codecs speed"
description: >
    Codecs speed
---
```sql
create table test_codec_speed engine=MergeTree
ORDER BY tuple()
as select cast(now() + rand()%2000 + number, 'DateTime') as x from numbers(1000000000);

option 1: CODEC(LZ4) (same as default)
option 2: CODEC(DoubleDelta) (`alter table test_codec_speed modify column x DateTime CODEC(DoubleDelta)`);
option 3: CODEC(T64, LZ4) (`alter table test_codec_speed modify column x DateTime CODEC(T64, LZ4)`)
option 4: CODEC(Delta, LZ4) (`alter table test_codec_speed modify column x DateTime CODEC(Delta, LZ4)`)
option 5: CODEC(ZSTD(1)) (`alter table test_codec_speed modify column x DateTime CODEC(ZSTD(1))`)
option 6: CODEC(T64, ZSTD(1)) (`alter table test_codec_speed modify column x DateTime CODEC(T64, ZSTD(1))`)
option 7: CODEC(Delta, ZSTD(1)) (`alter table test_codec_speed modify column x DateTime CODEC(Delta, ZSTD(1))`)
option 8: CODEC(T64, LZ4HC(1)) (`alter table test_codec_speed modify column x DateTime CODEC(T64, LZ4HC(1))`)
option 9: CODEC(Gorilla) (`alter table test_codec_speed modify column x DateTime CODEC(Gorilla)`)

Result may be not 100% reliable (checked on my laptop, need to be repeated in lab environment)


OPTIMIZE TABLE test_codec_speed FINAL (second run - i.e. read + write the same data)
1) 17 sec.
2) 30 sec.
3) 16 sec
4) 17 sec
5) 29 sec
6) 24 sec
7) 31 sec
8) 35 sec
9) 19 sec

compressed size
1) 3181376881
2) 2333793699
3) 1862660307
4) 3408502757
5) 2393078266
6) 1765556173
7) 2176080497
8) 1810471247
9) 2109640716

select max(x) from test_codec_speed
1) 0.597
2) 2.756 :(
3) 1.168
4) 0.752
5) 1.362
6) 1.364
7) 1.752
8) 1.270
9) 1.607
```
