# Altinity KB Style Guide (Repository Baseline)

This guide captures the dominant style used under `content/en/**` in this repository.

## Frontmatter defaults for normal KB pages

Use:

```yaml
---
title: "Page title"
linkTitle: "Left nav title"
description: >
    One-sentence summary.
---
```

Optional:
- `keywords`: list of 2-5 useful search terms
- `weight`: only if explicit ordering in section navigation is needed

Avoid unless explicitly requested:
- `manualLink`, `alias`/`aliases`, redirect `type`/`target`, `draft`

## Content structure

- Start with a short practical intro (1-3 paragraphs).
- Use `##` for major sections and `###` for subsections.
- Keep sections task-oriented:
  - Context/problem
  - Steps or examples
  - Validation or expected outcome
  - Caveats / edge cases

## Code and command blocks

- Use fenced blocks with language tags:
  - `sql`, `bash`, `yaml`, `xml`, `json`, `text`
- Keep runnable snippets minimal and focused.
- Prefer realistic table/settings names.

## Length

KB articles are short. Median is ~430 words; 90% are under 1100.

- Target under 1000 words; over 1500 needs a clear reason.
- Cut mechanism write-ups, source-code walkthroughs, stack traces, and evidence
  tables — those belong in the PR description. Give the operational rule and its
  version scope, not the derivation.

See the length budget in `AGENTS.md` for the authoritative wording.

## Writing tone

- Technical and direct.
- Emphasize actionable guidance for operators and engineers.
- Prefer concrete examples over abstract descriptions.
- Use concise English; avoid marketing wording.

## Links

- Add internal KB links when relevant.
- Add official external links for docs/blog/release notes.
- End with a "Related resources" section when useful.

## Filename and slug

- Lowercase kebab-case filename.
- Prefer `altinity-kb-<topic>.md` where section convention suggests it.
- Place in best-fit section under `content/en`.

