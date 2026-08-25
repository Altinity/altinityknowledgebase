---
name: altinity-kb-article-writer
description: Write new Altinity Knowledge Base articles in the repository's established style, including section selection, target markdown file path, Hugo frontmatter, and full draft content. Use when asked to create or draft KB articles for ClickHouse topics in this repository.
---

# Altinity KB Article Writer

Write a complete KB-ready draft that matches this repository's style.

## Use this workflow

1. Identify article intent from the prompt:
- Problem statement or topic
- Target audience (operator, developer, data engineer, mixed)
- Desired depth (`quick how-to`, `troubleshooting`, `deep explanation`)
- Environment constraints (Cloud, Kubernetes, replication, version constraints)

2. Select the best section using `references/section-map.md`.

3. Propose the destination path in this format:
- `content/en/<section>/<slug>.md`

4. Build frontmatter using the defaults in `references/kb-style-guide.md`:
- Required: `title`, `linkTitle`, `description`
- Optional: `keywords`, `weight` (only when explicitly needed for ordering)

5. Draft the article using `references/article-template.md` and style rules:
- Short practical intro
- Clear `##` and `###` headings
- Language-tagged code fences (`sql`, `bash`, `yaml`, `xml`, etc.)
- Actionable examples and caveats
- Related resources at the end

6. Run a self-review using `references/qa-checklist.md`.

7. Return output in this order:
- Suggested path
- Full markdown (frontmatter + body)
- QA checklist result (pass/fail bullets)
- If section routing is ambiguous, include one alternative path

## Authoring rules

- Prefer practical, operator-useful guidance over theory.
- Use concise technical English.
- Preserve ClickHouse naming and SQL syntax exactly.
- Do not add uncommon frontmatter fields (`alias`, `manualLink`, redirects) unless explicitly requested.
- Avoid unsupported claims; if unsure, state assumptions.

## File and slug rules

- Use lowercase kebab-case slugs.
- Prefer `altinity-kb-<topic>.md` in sections where that convention is common.
- If a likely collision exists, append a disambiguator (for example `-v2` or `-on-kubernetes`).

