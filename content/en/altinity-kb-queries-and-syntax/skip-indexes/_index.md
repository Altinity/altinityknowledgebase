---
title: "Skip indexes"
linkTitle: "Skip indexes"
description: >
    Skip indexes
---
ClickHouse® provides a type of index that in specific circumstances can significantly improve query speed. These structures are labeled "skip" indexes because they enable ClickHouse to skip reading significant chunks of data that are guaranteed to have no matching values.