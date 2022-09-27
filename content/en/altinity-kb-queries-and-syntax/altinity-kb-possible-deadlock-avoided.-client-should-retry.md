---
title: "Possible deadlock avoided. Client should retry"
linkTitle: "Possible deadlock avoided. Client should retry"
description: >
    Possible deadlock avoided. Client should retry
---
In version 19.14 a serious issue was found: a race condition that can lead to server deadlock. The reason for that was quite fundamental, and a temporary workaround for that was added ("possible deadlock avoided").

Those locks are one of the fundamental things that the core team was actively working on in 2020.

In 20.3 some of the locks leading to that situation were removed as a part of huge refactoring.

In 20.4 more locks were removed, the check was made configurable (see `lock_acquire_timeout` ) so you can say how long to wait before returning that exception

In 20.5 heuristics of that check ("possible deadlock avoided") was improved.

In 20.6 all table-level locks which were possible to remove were removed, so alters are totally lock-free.

20.10 enables `database=Atomic` by default which allows running even DROP commands without locks.

Typically issue was happening when doing some concurrent select on `system.parts` / `system.columns` / `system.table` with simultaneous table manipulations (doing some kind of ALTERS / TRUNCATES / DROP)I

If that exception happens often in your use-case:
- use recent clickhouse versions
- ensure you use Atomic engine for the database (not Ordinary) (can be checked in system.databases)

Sometime you can try to workaround issue by finding the queries which uses that table concurenly (especially to system.tables / system.parts and other system tables) and  try killing them (or avoiding them).
