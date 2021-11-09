---
title: "CollapsingMergeTree vs ReplacingMergeTree"
linkTitle: "CollapsingMergeTree vs ReplacingMergeTree"
weight: 100
description: >-
     CollapsingMergeTree vs ReplacingMergeTree.
---

## CollapsingMergeTree vs ReplacingMergeTree

| ReplacingMergeTree | CollapsingMergeTree |
|:-|:-|
| + very easy to use (always replace) | - more complex (accounting-alike, put 'rollback' records to fix something) |
| + you don't need to store the previous state of the row | - you need to the store (somewhere) the previous state of the row, OR extract it from the table itself (point queries is not nice for ClickHouse) |
| - no deletes | + support deletes |
| - w/o FINAL - you can can always see duplicates, you need always to 'pay' FINAL performance penalty | + properly crafted query can give correct results without final (i.e. `sum(amount * sign)` will be correct, no matter of you have duplicated or not) |
| - only `uniq()`-alike things can be calculated in materialied views | + you can do basic counts & sums in materialized views |
