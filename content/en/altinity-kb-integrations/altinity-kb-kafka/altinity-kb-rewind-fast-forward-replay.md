---
title: "Rewind / fast-forward / replay"
linkTitle: "Rewind / fast-forward / replay"
description: >
    Rewind / fast-forward / replay
---

* Step 1: Detach Kafka tables in ClickHouse
* Step 2: `kafka-consumer-groups.sh --bootstrap-server kafka:9092 --topic topic:0,1,2 --group id1 --reset-offsets --to-latest --execute`
  * More samples: [https://gist.github.com/filimonov/1646259d18b911d7a1e8745d6411c0cc](https://gist.github.com/filimonov/1646259d18b911d7a1e8745d6411c0cc)
* Step: Attach Kafka tables back

See also these configuration settings:

```markup
<kafka>
  <auto_offset_reset>smallest</auto_offset_reset>
</kafka>
```

© 2021 Altinity Inc. All rights reserved.

