---
title: "Best schema for storing many metrics registered from the single source"
linkTitle: "Best schema for storing many metrics registered from the single source"
description: >
    Best schema for storing many metrics registered from the single source
---
Picking the best schema for storing many metrics registered from single source is quite a common problem.

## 1 One row per metric

i.e.: timestamp, sourceid, metric_name, metric_value

Pros and cons:

* Pros:
  * simple
  * well normalized schema
  * easy to extend
  * that is quite typical pattern for timeseries databases
* Cons
  * different metrics values stored in same columns (worse compression)
  * to use values of different datatype you need to cast everything to string or introduce few columns for values of different types.
  * not always nice as you need to repeat all 'common' fields for each row
  * if you need to select all data for one time point you need to scan several ranges of data.

## 2 Each measurement (with lot of metrics) in it's own row

In that way you need to put all the metrics in one row (i.e.: timestamp, sourceid, ....)
That approach is usually a source of debates about how to put all the metrics in one row.

### 2a Every metric in it's own column

i.e.: timestamp, sourceid, metric1_value, ... , metricN_value

Pros and cons:

* Pros
  * simple
  * really easy to access / scan for rows with particular metric
  * specialized and well adjusted datatypes for every metric.
  * good for dense recording (each time point can have almost 100% of all the possible metrics)
* Cons
  * adding new metric = changing the schema (adding new column). not suitable when set of metric changes dynamically
  * not applicable when there are too many metrics (when you have more than 100-200)
  * when each timepoint have only small subset of metrics recorded - if will create a lot of sparse filled columns.
  * you need to store 'lack of value' somehow (NULLs or default values)
  * to read full row - you need to read a lot of column files.

### 2b Using arrays / Nested / Map

i.e.: timestamp, sourceid, array_of_metric_names, array_of_metric_values

Pros and cons:

* Pros
  * easy to extend, you can have very dynamic / huge number of metrics.
  * you can use Array(LowCardinality(String)) for storing metric names efficiently
  * good for sparse recording (each time point can have only 1% of all the possible metrics)
* Cons
  * you need to extract all metrics for row to reach a single metric
  * not very handy / complicated non-standard syntax
  * different metrics values stored in single array (bad compression)
  * to use values of different datatype you need to cast everything to string or introduce few arrays for values of different types.

### 2c Using JSON

i.e.: timestamp, sourceid, metrics_data_json

Pros and cons:

* Pros
  * easy to extend, you can have very dynamic / huge number of metrics.
  * the only option to store hierarchical / complicated data structures, also with arrays etc. inside.
  * good for sparse recording (each time point can have only 1% of all the possible metrics)
  * ClickHouse® has efficient API to work with JSON
  * nice if your data originally came in JSON (don't need to reformat)
* Cons
  * uses storage non efficiently
  * different metrics values stored in single array (bad compression)
  * you need to extract whole JSON field to reach single metric
  * slower than arrays

### 2d Using querystring-format URLs

i.e.: timestamp, sourceid, metrics_querystring
Same pros/cons as raw JSON, but usually bit more compact than JSON

Pros and cons:

* Pros
  * ClickHouse has efficient API to work with URLs (extractURLParameter etc)
  * can have sense if you data came in such format (i.e. you can store GET / POST request data directly w/o reprocessing)
* Cons
  * slower than arrays

### 2e Several 'baskets' of arrays

i.e.: timestamp, sourceid, metric_names_basket1, metric_values_basker1, ..., metric_names_basketN, metric_values_basketN
The same as 2b, but there are several key-value arrays ('basket'), and metric go to one particular basket depending on metric name (and optionally by metric type)

Pros and cons:

* Pros
  * address some disadvantages of 2b (you need to read only single, smaller basket for reaching a value, better compression - less unrelated metrics are mixed together)
* Cons
  * complex

### 2f Combined approach

In real life Pareto principle is correct for many fields.

For that particular case: usually you need only about 20% of metrics 80% of the time. So you can pick the metrics which are used intensively, and which have a high density, and extract them into separate columns (like in option 2a), leaving the rest in a common 'trash bin' (like in variants 2b-2e).

With that approach you can have as many metrics as you need and they can be very dynamic. At the same time the most used metrics are stored in special, fine-tuned columns.

At any time you can decide to move one more metric to a separate column `ALTER TABLE ... ADD COLUMN metricX Float64 MATERIALIZED metrics.value[indexOf(metrics.names,'metricX')];`

### 2e Subcolumns [future]

[https://github.com/ClickHouse/ClickHouse/issues/23516](https://github.com/ClickHouse/ClickHouse/issues/23516)

WIP currently, ETA of first beta = autumn 2021

Related links:

[There is one article on our blog on this subject with some benchmarks.](https://www.altinity.com/blog/2019/5/23/handling-variable-time-series-efficiently-in-clickhouse)

[Slides from Percona Live](https://www.percona.com/sites/default/files/ple19-slides/day1-pm/clickhouse-for-timeseries.pdf")

