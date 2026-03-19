# AGENTS.md

This repository contains overall-facing ClickHouse knowledge base articles. Optimize for correctness, safety, and reviewability. Do not optimize for large rewrites, cosmetic churn, or generic prose improvement.

## Mission

When modifying an article, do all of the following:

- preserve useful existing content;
- fix concrete factual, safety, or version-compatibility problems;
- add missing information only when it materially helps operators;
- keep the diff narrow enough that a maintainer can review it quickly.

Do **not** turn a focused article review into a full rewrite.

## Default workflow

1. Read the entire article before proposing any change.
2. Read related issues, PRs, and review comments for the same article.
3. Check upstream ClickHouse documentation and changelog for the version ranges that matter.
4. Search upstream GitHub issues/PRs only for rare or specific edge cases that deserve extra explanation.
5. Produce findings first, then a minimal patch.
6. Do not open a public issue or PR before a human has read the proposal, unless explicitly instructed.

If the article is mostly correct, prefer a precise issue note or a very small patch over a broad rewrite.

## Non-negotiable rules

- Prefer point fixes over rewrites.
- Keep existing structure unless the structure itself is broken.
- Do not remove useful operational detail unless it is wrong, obsolete, dangerous, or duplicate.
- Do not replace product documentation. Extend it only where the KB adds operational value.
- Every added paragraph, table, query, or command must answer a concrete operator question.
- Every non-obvious factual claim must have a source.
- Every behavior claim must have explicit version scope.
- Every recipe must be copy-pasteable and tested, or it should stay out of the article.
- Every destructive action must be preceded by an explicit warning.
- No public-facing PR should be generated automatically from an unreviewed draft.

## What a good KB edit looks like

A good edit usually does one or more of the following:

- corrects a factual statement;
- adds exact version boundaries;
- adds a tested, high-value recipe;
- adds a warning before a dangerous action;
- clarifies an edge case seen in upstream issues;
- shortens or improves references without changing meaning.

A bad edit usually does one or more of the following:

- rewrites most of the article without necessity;
- replaces specific operational detail with generic prose;
- adds queries that are not tested;
- adds queries that only work on newer versions without saying so;
- introduces claims based on behavior that was later reverted or rolled back;
- adds filler such as obvious prerequisites with no concrete payoff;
- adds monitoring queries that do not provide materially new information;
- adds recovery instructions without clearly stating corruption or duplication risks.

## Source hierarchy

Use sources in this order:

1. Upstream ClickHouse documentation.
2. Upstream ClickHouse changelog / release notes.
3. Upstream code or comments when documentation is insufficient.
4. Upstream GitHub issues and PRs for specific rare cases.
5. Existing KB issues/PRs for repository context.

Rules for using sources:

- Use GitHub issues/PRs to explain rare cases, not to redefine normal behavior.
- Treat issue comments as situational evidence unless corroborated.
- If a behavior changed and later changed back, document the exact historical window instead of presenting it as current behavior.
- If you cannot verify a claim, do not promote it into the article.

## Versioning rules

Every behavior claim must answer all three questions:

1. Which versions does this apply to?
2. Is this current behavior or historical behavior?
3. Was the behavior later reverted, replaced, or removed?

Version guidance:

- State explicit version ranges whenever compatibility matters.
- If a query relies on columns or functions added later, annotate the minimum supported version or provide a fallback query.
- If compatibility is messy and not worth documenting inline, keep the article on the main supported behavior and move the edge case to a note.
- Never silently mix examples from incompatible versions.

## Query and command rules

Only add a query or command if it satisfies all of the following:

- it solves a concrete operator task;
- it has a short explanation of what it detects or helps decide;
- it was tested on a representative ClickHouse version, or compatibility is explicitly documented;
- it does not rely on unsupported assumptions about schema, functions, or output columns.

For every recipe, include enough context to make it usable:

- purpose;
- version scope if needed;
- how to interpret the output;
- safety note if destructive or risky;
- fallback or limitation if known.

### Hard constraints for SQL examples

- Do not add a query that uses version-specific columns without noting that fact.
- Do not add a query that uses helper functions unavailable on common target versions.
- Do not add a helper query without explaining what it detects and why a reader would need it.
- Do not add a second query that merely repeats information already shown by a prior query unless it is explicitly framed as monitoring, alerting, or dashboard input.
- Prefer generating statements for review first; execution should be a separate, deliberate step.

### Compatibility policy

If a query is useful but not portable:

- add a minimum-version note; or
- provide an alternate query for older versions; or
- omit it from the article and keep it in review notes instead.

Untested queries do not belong in the KB.

## Safety rules for destructive operations

Destructive operations require extra care. This includes SQL commands such as `DROP DETACHED`, filesystem deletion, and recovery/attach flows that can duplicate or corrupt data when misused.

Rules:

- Put a warning block immediately before destructive or potentially destructive commands.
- State the concrete risk: data loss, duplication, replica divergence, or unsafe cleanup.
- Tell the reader to review generated commands before executing them.
- Prefer documented SQL workflows over ad-hoc filesystem deletion when the product supports them.
- If filesystem operations are still needed, present them as last-resort steps and explain why.
- Do not describe a risky recovery path as "safe" or "recovered" unless the preconditions are explicit.

Use this Hugo warning pattern:

```md
{{% alert title="Warning" color="warning" %}}
Review generated commands carefully before executing them. Destructive actions can cause data loss, duplication, or replica inconsistency if used incorrectly. Ensure you have a valid backup and understand why each target object is safe to remove or attach.
{{% /alert %}}
```

## Article-writing rules

- Keep the original article voice and purpose.
- Prefer dense, operational wording over "better sounding" prose.
- Remove empty words.
- Do not add text that only restates the obvious.
- If you add a prerequisite, explain the exact failure mode it prevents.
- Use tables only when they compress real information.
- Keep appendix/reference links readable; avoid dumping long raw URLs into the body when a shorter reference style works.

## Specific guidlines from other reviews (human add here)

These are repository-specific lessons and should guide similar edits:

- Do not turn a useful but imperfect article into a prettier, less useful rewrite.
- Do not add "problems" just because the prompt asked to find them; only report real defects.
- Do not add historical behavior as present-day guidance without exact version boundaries.
- Do not add queries that depend on later-added fields or functions unless the article is version-scoped.
- Do not add a query unless you can explain exactly what it detects.
- Do not add asynchronous-metric queries as if they add new investigative detail when they only repeat inventory information; they are valid mainly for dashboards and alerting.
- Do not include obvious prerequisites unless the article explains their concrete operational impact.
- Do not present `ATTACH` / recovery recipes in a way that could lead to duplicate data without a strong warning and explicit preconditions.
- Do not merge or publish a draft that the human owner has not read.

## Output format for article reviews

When asked to review or modify an article, return work in this order:

### 1. Findings

A compact list or table with:

- section / heading;
- exact problem;
- why it matters;
- source;
- proposed minimal fix.

### 2. Patch plan

Describe the smallest useful set of edits.

### 3. Patch

Provide a ready-to-apply Markdown diff or replacement blocks.

### 4. Validation notes

State explicitly:

- versions checked;
- sources used;
- queries tested;
- any assumptions not fully verified.

### 5. Risk notes

Call out anything destructive, compatibility-sensitive, or potentially misleading.

## Decision rules: issue vs patch vs no change

Choose the lightest valid outcome.

- **No change**: the article is already correct enough and proposed edits are cosmetic.
- **Issue / review notes**: there are factual questions or useful ideas, but they are not fully validated.
- **Small patch**: the change is narrow, source-backed, and tested.
- **Larger patch**: only when the article has real structural problems and the rewrite is justified with a reviewable rationale.

Default to smaller.

## Final checklist

Before finishing, verify all of the following:

- The full article was read.
- Related repo discussion was read.
- Version-sensitive claims are scoped.
- Historical behavior is labeled as historical.
- Added queries were tested or explicitly version-gated.
- Every query has a reason to exist.
- Destructive actions have warnings.
- Useful existing detail was not accidentally removed.
- The diff is reviewable.
- A human can verify each important claim quickly.

If any item above fails, reduce scope or stop at findings instead of forcing a patch.
