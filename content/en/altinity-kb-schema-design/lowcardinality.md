---
title: "LowCardinality"
linkTitle: "LowCardinality"
description: >
    LowCardinality
---
## Settings

#### allow_suspicious_low_cardinality_types

In CREATE TABLE statement allows specifying LowCardinality modifier for types of small fixed size (8 or less). Enabling this may increase merge times and memory consumption.

#### low_cardinality_max_dictionary_size

default - 8192

Maximum size (in rows) of shared global dictionary for LowCardinality type.

#### low_cardinality_use_single_dictionary_for_part

LowCardinality type serialization setting. If is true, than will use additional keys when global dictionary overflows. Otherwise, will create several shared dictionaries.

#### low_cardinality_allow_in_native_format

Use LowCardinality type in Native format. Otherwise, convert LowCardinality columns to ordinary for select query, and convert ordinary columns to required LowCardinality for insert query.

#### output_format_arrow_low_cardinality_as_dictionary

Enable output LowCardinality type as Dictionary Arrow type
