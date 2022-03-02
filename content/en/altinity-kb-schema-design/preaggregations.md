---
title: "Pre-Aggregation approaches"
linkTitle: "Pre-Aggregation approaches"
weight: 100
description: >-
      ETL vs Materialized Views vs Projections in ClickHouse.
---

## Pre-Aggregation approaches: ETL vs Materialized Views vs Projections


|  | ETL | MV | Projections | 
|:-|:-|:-|:-|
| Realtime | no | yes | yes |
| How complex queries can be used to build the preaggregaton | any | complex | very simple |
| Impacts the insert speed | no | yes | yes |
| Are inconsistancies possible | Depends on ETL. If it process the errors properly - no. | yes (no transactions / atomicity) | no |
| Lifetime of aggregation | any | any | Same as the raw data |
| Requirements | need external tools/scripting | is a part of database schema | is a part of table schema |
| How complex to use in queries | Depends on aggregation, usually simple, quering a separate table | Depends on aggregation, sometimes quite complex, quering a separate table | Very simple, quering the main table |
| Can work correctly with ReplacingMergeTree as a source | Yes | No | No |
| Can work correctly with CollapsingMergeTree as a source | Yes | For simple aggregations | For simple aggregations |
| Can be chained | Yes (Usually with DAGs / special scripts) | Yes (but may be not straightforward, and often is a bad idea) | No |
| Resources needed to calculate the increment | May be signigicant | Usually tiny | Usually tiny |
