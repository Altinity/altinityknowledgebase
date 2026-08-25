# KB Article Template

Use this template as the baseline shape, then adjust to topic.

```markdown
---
title: "<Human title>"
linkTitle: "<Navigation title>"
description: >
    <One sentence summary of the page purpose.>
keywords:
  - <optional-keyword-1>
  - <optional-keyword-2>
---

<Short practical intro: what this solves, when to use it.>

## Problem

<Describe symptom, failure mode, or task objective.>

## Solution

<Explain approach and why it works.>

### Step 1: <Name>

```sql
-- or bash/yaml/etc
```

<Explain expected output or interpretation.>

### Step 2: <Name>

```sql
-- or bash/yaml/etc
```

<Explain expected output or interpretation.>

## Validation

<How to confirm the fix/design works. Include checks and thresholds if relevant.>

## Caveats

- <Version caveat>
- <Performance caveat>
- <Operational caveat>

## Related resources

- [<Internal KB link>](</altinity-kb-.../>)
- [<Official docs link>](https://clickhouse.com/docs/)
```

## Minimal variant

For short pages (for example function or setting notes), keep:
- frontmatter
- short intro
- one or two focused sections
- at least one example block

