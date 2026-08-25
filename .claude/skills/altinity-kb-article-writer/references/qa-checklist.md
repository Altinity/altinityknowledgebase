# QA Checklist for Generated KB Articles

Run this checklist before returning output.

## Metadata

- [ ] Path is under `content/en/<section>/`.
- [ ] Filename uses lowercase kebab-case.
- [ ] Frontmatter has `title`, `linkTitle`, `description`.
- [ ] Optional fields are justified (`keywords`, `weight`).
- [ ] Uncommon fields are not present unless requested.

## Structure and readability

- [ ] Intro clearly states problem and scope.
- [ ] Headings are logical (`##` then `###`).
- [ ] Steps or examples are easy to follow.
- [ ] Caveats or assumptions are explicit.

## Technical quality

- [ ] SQL/commands are syntactically plausible.
- [ ] Code fences include language tags.
- [ ] Version-sensitive behavior is called out if relevant.
- [ ] No unsupported claims are presented as facts.

## Linking

- [ ] Includes relevant internal KB links when possible.
- [ ] Includes high-quality official external references when useful.

## Final output contract

- [ ] Output includes suggested path.
- [ ] Output includes full markdown draft.
- [ ] Output includes brief QA result (`PASS` or `FAIL` with reasons).
- [ ] If routing was ambiguous, one alternative path is included.

