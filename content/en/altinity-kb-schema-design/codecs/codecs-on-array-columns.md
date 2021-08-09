---
title: "Codecs on array columns"
linkTitle: "Codecs on array columns"
description: >
    Codecs on array columns
---



{% hint style="info" %}
Supported since 20.10 \(PR [\#15089](https://github.com/ClickHouse/ClickHouse/pull/15089)\). On older versions you will get exception:  
`DB::Exception: Codec Delta is not applicable for Array(UInt64) because the data type is not of fixed size.`
{% endhint %}

```sql
DROP TABLE IF EXISTS array_codec_test SYNC

create table array_codec_test( number UInt64, arr Array(UInt64) ) Engine=MergeTree ORDER BY number;
INSERT INTO array_codec_test SELECT number,  arrayMap(i -> number + i, range(100)) from numbers(10000000);


/****  Default LZ4  *****/

OPTIMIZE TABLE array_codec_test FINAL;
--- Elapsed: 3.386 sec. 


SELECT * FROM system.columns WHERE (table = 'array_codec_test') AND (name = 'arr')
/*
Row 1:
──────
database:                default
table:                   array_codec_test
name:                    arr
type:                    Array(UInt64)
position:                2
default_kind:            
default_expression:      
data_compressed_bytes:   173866750
data_uncompressed_bytes: 8080000000
marks_bytes:             58656
comment:                 
is_in_partition_key:     0
is_in_sorting_key:       0
is_in_primary_key:       0
is_in_sampling_key:      0
compression_codec:       
*/



/****** Delta, LZ4 ******/

ALTER TABLE array_codec_test MODIFY COLUMN arr Array(UInt64) CODEC (Delta, LZ4);

OPTIMIZE TABLE array_codec_test FINAL
--0 rows in set. Elapsed: 4.577 sec.

SELECT * FROM system.columns WHERE (table = 'array_codec_test') AND (name = 'arr')

/*
Row 1:
──────
database:                default
table:                   array_codec_test
name:                    arr
type:                    Array(UInt64)
position:                2
default_kind:            
default_expression:      
data_compressed_bytes:   32458310
data_uncompressed_bytes: 8080000000
marks_bytes:             58656
comment:                 
is_in_partition_key:     0
is_in_sorting_key:       0
is_in_primary_key:       0
is_in_sampling_key:      0
compression_codec:       CODEC(Delta(8), LZ4)
*/
```

