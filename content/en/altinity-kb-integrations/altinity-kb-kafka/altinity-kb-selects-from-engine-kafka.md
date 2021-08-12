---
title: "SELECTs from engine=Kafka"
linkTitle: "SELECTs from engine=Kafka"
description: >
    SELECTs from engine=Kafka
---
## Question

What will happen, if we would run SELECT query from working Kafka table with MV attached? Would data showed in SELECT query appear later in MV destination table?

## Answer

1. Most likely SELECT query would show nothing.
2. If you lucky enough and something would show up, those rows **wouldn't appear** in MV destination table.

So it's not recommended to run SELECT queries on working Kafka tables.

In case of debug it's possible to use another Kafka table with different `consumer_group`, so it wouldn't affect your main pipeline.
