---
title: "LowCardinality"
linkTitle: "LowCardinality"
description: >
    LowCardinality
---

## Settings

#### allow\_suspicious\_low\_cardinality\_types

In CREATE TABLE statement allows specifying LowCardinality modifier for types of small fixed size \(8 or less\). Enabling this may increase merge times and memory consumption.

**low\_cardinality\_max\_dictionary\_size**

default - 8192

Maximum size \(in rows\) of shared global dictionary for LowCardinality type.

**low\_cardinality\_use\_single\_dictionary\_for\_part**

LowCardinality type serialization setting. If is true, than will use additional keys when global dictionary overflows. Otherwise, will create several shared dictionaries.

**low\_cardinality\_allow\_in\_native\_format**

Use LowCardinality type in Native format. Otherwise, convert LowCardinality columns to ordinary for select query, and convert ordinary columns to required LowCardinality for insert query.

**output\_format\_arrow\_low\_cardinality\_as\_dictionary**

Enable output LowCardinality type as Dictionary Arrow type

