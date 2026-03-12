# Guidance for AI Agents Extending Altinity KB Articles

Your job is to extend and refresh existing KB articles with newer ClickHouse features and behavior changes, not to rewrite them from scratch. The target outcome is a page that still feels like the same Altinity KB article, but now covers missing modern ClickHouse details.

## Primary Goal

- Preserve the existing article's structure, scope, examples, and voice.
- Add missing coverage for newer ClickHouse features, settings, system tables, syntax, version-specific behavior, bugfixes, and operational caveats.
- Keep the article recognizable. Readers should feel it was maintained, not replaced.

## How to Work

- Read the full target article first.
- Read 2-3 nearby articles in the same section to match the local style.
- Identify what is already good and keep it.
- Research only the deltas: what changed in newer ClickHouse versions since the article was written.
- Prefer small, surgical edits: add a paragraph, add a new section, update one example, add a version note, add references.
- If the article is badly outdated, still start by extending it. Only propose a rewrite if the old structure is impossible to salvage without misleading readers.

## What to Check in ClickHouse

- Use gh CLI when possible to find any relevant information in merged PRs, issues, release notes, and source code.
- Official ClickHouse docs for the current syntax and semantics.
- Merged ClickHouse PRs and issues for exact feature introduction, bugfixes, and edge cases.
- Release notes/changelogs for version boundaries.
- Source code or tests when you need exact names of settings, tables, metrics, or behavior.
- Whether new system tables, metrics, logs, commands, or settings now exist for observability or control.
- Whether an old workaround is obsolete in newer versions but still needed for older ones.

## Preferred Patch Style

- Add sections like Overview, Versions, features/improvements, bugfixes, observability/introspection, and References only if they fit the article's existing style.
- Keep older guidance for older versions if it still matters.
- Put the modern path first when appropriate, then keep the legacy workaround below it.
- Add exact version markers such as `Since 24.3`, `23.8+`, `pre-23.1`, or `older versions`.
- Keep examples practical and executable.
- Keep links to authoritative sources for every important new claim.

## Tone and Vibe

- Match the KB's practical, terse, engineer-to-engineer style.
- Be example-heavy and operationally useful.
- Do not turn the page into polished marketing copy.
- Do not over-normalize the prose. Some KB articles are intentionally direct and compact.
- Keep the same vibe as surrounding articles: pragmatic, version-aware, and grounded in real usage.

## Do Not Do This

- Do not rewrite the whole article just because you can write a cleaner version.
- Do not remove valid historical context that helps users on older versions.
- Do not replace working examples with generic textbook examples.
- Do not make unsupported claims about stability, defaults, or version support.
- Do not "improve" the article by changing its scope.
- Do not add filler text that does not help an operator or developer.

## Quality Bar

- Every new feature mention should have a source or clear provenance.
- Every new syntax example should match current ClickHouse behavior.
- Version boundaries should be explicit.
- Old and new behavior should be clearly separated when they differ.
- The final page should look like an updated Altinity KB article, not a fresh AI-generated rewrite.

## Simple Rule

If the edit makes the article feel newer but still familiar, it is probably correct. If it makes the article feel like a different author replaced it, it is wrong.
