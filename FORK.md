# FORK.md

`neuralsignal/Trellis` is a fork of [`mindfold-ai/Trellis`](https://github.com/mindfold-ai/Trellis).
`main` **is** the slim version — the divergence is the product, not a change waiting to land.
AGPL-3.0-only, unchanged.

## What diverges

| | Upstream | Here |
|---|---|---|
| Platforms | 22 | 5 — claude-code, cursor, opencode, codex, pi |
| Prompt language | bilingual English + Chinese | English only, enforced by `scripts/check-english-only.mjs` |
| SessionStart payload | ~16 KB | ~6.8 KB |
| SessionStart matchers | `startup`, `clear`, `compact` | `startup`, `clear` |
| Context-injection limits | 32768 / 65536 / 131072 | 8192 / 16384 / 32768 |
| Submodules | `marketplace/`, `docs-site/` | none |

## Syncing with upstream

```bash
git fetch upstream && git merge upstream/main
```

**Merge, never rebase.** A rebase rewrites every fork SHA, which invalidates the submodule
pin in any consuming repo and forces a push with lease on each sync. A merge keeps history
append-only and resolves each conflict once instead of once per replayed commit. Conflicts
inside a directory this fork deleted resolve as `git rm -r <dir>`.

A release touching the 17 removed configurators or the Phase Index will conflict. That is
the design, not a defect.

## English-only

`scripts/check-english-only.mjs` runs in `ci.yml` before the install step. It scans tracked
files under `packages/cli/src/templates/`, `packages/core/src/`, `packages/cli/src/migrations/`,
`.github/`, and root `*.md`.

Out of scope on purpose, and encoded in the script's own `EXCLUDE` list rather than here:

- **Tests.** They pin strings, so a shipped string that changes still forces a test edit — but
  a Chinese fixture reaches no user.
- **`.trellis/tasks/archive/**`.** Upstream's task history. Deleting 396 files would conflict on
  every `git merge upstream/main`, and buys a consumer nothing.

One exception is deliberate: `packages/core/src/mem/dialogue.ts` keeps a `\u4e00-\u9fa5`
range, written as escapes so the guard passes. This fork's prose is English; the repositories it
reads are not necessarily, and `trellis mem` must still find a paragraph break in a Chinese
`AGENTS.md`.

## Things that bite

- **Templates are plain files.** `scripts/copy-templates.js` copies `src/templates/` to
  `dist/` verbatim at build time. There is no codegen, so every template change is a plain
  file edit — and every template change needs `pnpm --filter @mindfoldhq/trellis build`
  before a consuming project sees it.
- **The dogfood tree must stay byte-identical.** `.trellis/scripts/**/*.py` mirrors
  `packages/cli/src/templates/trellis/scripts/**/*.py`; `test/regression.test.ts` asserts it.
  Edit the template, then copy it across.
- **`PLATFORM_IDS` is exported from `src/configurators/index.ts`**, not `src/types/ai-tools.ts`.
  `AI_TOOLS` in `ai-tools.ts` is the single source of truth the id list derives from.
- **Marker blocks are filtered in only one of the two consumers.**
  `get_context.py --mode phase` runs `workflow_phase.filter_platform`, which drops the
  `[Platform, …] … [/Platform, …]` blocks that do not match. `session-start.py` does not: its
  `_strip_breadcrumb_tag_blocks` removes the marker *lines* and leaves every body inline. So
  a platform-gated block inside `## Phase Index` reaches the model in all its variants at
  once. Do not put variant prose there.
- **`## Phase Index` is the injected prompt.** `session-start.py` extracts it from
  `templates/trellis/workflow.md` and injects it verbatim, minus `[workflow-state:*]` blocks
  and HTML comments. Prose length in that one section is the whole lever on session cost.
  Measure it, do not guess:
  ```bash
  echo '{"hook_event_name":"SessionStart","source":"startup","cwd":"'$PWD'"}' \
    | python3 .claude/hooks/session-start.py | wc -c
  ```
- **One payload key per host.** Cursor reads the top-level `additional_context`; Claude Code
  reads `hookSpecificOutput.additionalContext`. Emitting both doubles the largest thing the
  hook writes.

## Consuming it

The package keeps the `@mindfoldhq/trellis` name so `trellis update` still recognises
already-generated projects. Nothing is published to npm.

```bash
pnpm install && pnpm --filter @mindfoldhq/trellis build
npm i -g ./packages/cli
```
