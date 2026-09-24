# CLAUDE.md

**[`AGENTS.md`](AGENTS.md) is the source of truth for working in this repository.**
Read it before making any change. This file only points at it and repeats the few
rules that are most often broken, so keep additions here to a minimum — anything
substantive belongs in `AGENTS.md`, which every agent tool reads.

## Before writing or rewriting an article

Read `.claude/skills/altinity-kb-article-writer/` — the `SKILL.md` workflow and all
four files under `references/`. Under 300 lines in total. Claude Code loads this
directory as a skill automatically, but read the files directly if it has not been
surfaced to you; do not assume it fired.

Do not calibrate style by grepping neighbouring articles. That gives you the
frontmatter shape and none of the tone or length norms.

## The three rules most often broken

1. **Keep it short.** Target under 1000 words; over 1500 needs a clear reason. The
   median article is ~430 words. Mechanism write-ups, source-code walkthroughs,
   stack traces, and evidence tables belong in the PR description, not the article.
   State the operational rule and its version scope; leave out the derivation.

2. **Every recipe must be tested.** Untested queries and commands do not belong in
   the KB. If you cannot test one, version-gate it or leave it out.

3. **Prefer point fixes over rewrites.** Keep diffs narrow enough to review quickly.

## Repository specifics

- Content lives in `content/en/<section>/`; Hugo's `contentDir` is `content/en`, so
  root-level files like this one are not published.
- The site builds only with the CI-pinned Hugo version in
  `.github/workflows/gh-pages.yml`. Newer Hugo fails on pre-existing config issues.
- Contributors must sign the CLA before a PR can merge.
- Keep `ClickHouse®` on first use in title, description, and body.
