# Section Map for `content/en`

Select the section that best matches the user topic.

## Primary routing rules

- `altinity-kb-queries-and-syntax`
  - SQL syntax, query behavior, joins, window functions, TTL syntax, query semantics
- `altinity-kb-setup-and-maintenance`
  - Operational troubleshooting, replication operations, backup/restore, upgrades in practice, cluster setup
- `altinity-kb-schema-design`
  - `ORDER BY`, `PARTITION BY`, materialized views, table modeling, codecs, LowCardinality design
- `altinity-kb-integrations`
  - Kafka, MySQL, Spark, BI tools, external systems and connectors
- `altinity-kb-useful-queries`
  - Reusable diagnostics queries against `system.*` and operational SQL snippets
- `altinity-kb-dictionaries`
  - External dictionaries, layouts, dictionary performance and configuration
- `altinity-kb-functions`
  - Function behavior, function-specific examples, expression patterns
- `engines`
  - Engine internals and engine-specific behavior (MergeTree family, Atomic, etc.)
- `altinity-kb-kubernetes`
  - Altinity Operator, Kubernetes deployment and networking issues
- `upgrade`
  - Upgrade strategy, compatibility notes, known upgrade pitfalls

## Tie-break rules

1. If article is mostly query text and reusable snippets, prefer `altinity-kb-useful-queries`.
2. If article is mostly conceptual SQL behavior, prefer `altinity-kb-queries-and-syntax`.
3. If topic is schema/key design, prefer `altinity-kb-schema-design`.
4. If issue is runtime operations and incidents, prefer `altinity-kb-setup-and-maintenance`.
5. If still ambiguous, choose the section with the highest overlap and provide one alternative path.

## Path format

Use:
- `content/en/<section>/<slug>.md`

Where:
- `<slug>` is lowercase kebab-case
- Prefix with `altinity-kb-` when it fits section naming patterns

Examples:
- `content/en/altinity-kb-useful-queries/altinity-kb-find-heavy-merges.md`
- `content/en/altinity-kb-schema-design/altinity-kb-choosing-order-by-for-events.md`

