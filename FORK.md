# FORK.md

`neuralsignal/Trellis` is a fork of [`mindfold-ai/Trellis`](https://github.com/mindfold-ai/Trellis).
`main` **is** the slim version — the divergence is the product, not a change waiting to land.
AGPL-3.0-only, unchanged.

## What diverges

| | Upstream | Here |
|---|---|---|
| Platforms | 22 | 5 — claude-code, cursor, opencode, codex, pi |
| Skills on disk | a private tree per platform | one real `.agents/skills/`; `.claude/skills` and `.opencode/skills` symlink onto it |
| Prompt language | bilingual English + Chinese | English only, enforced by `scripts/check-english-only.mjs` |
| SessionStart payload | ~16 KB | ~6.1 KB |
| Planning artifacts | `design.md` + `implement.md` for every "complex" task | PRD-only by default; both required only when a task crosses repositories or changes a contract |
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

`.github/workflows/publish.yml` is deleted here, so an upstream edit to it arrives as a
`modify/delete` conflict — resolve as `git rm`. It targets npmjs under `@mindfoldhq/*`, which
this fork cannot push to, and it also fires on `release: types: [published]`, which
`fork-release.yml` must trigger. Leaving it in place and trusting `publish-plan` to skip an
already-published version would go green by accident and attempt a real publish the moment the
version moved.

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
- **The dogfood *scripts* must stay byte-identical — the rest of the tree need not.**
  `.trellis/scripts/**/*.py` mirrors `packages/cli/src/templates/trellis/scripts/**/*.py`;
  `test/regression.test.ts` asserts that pair. Edit the template, then copy it across.

  Nothing asserts this repository's own `.claude/`, `.opencode/`, `.pi/` or `.agents/` install,
  and it is already stale — `.pi/skills/` still exists here although migration 0.6.8 retired it.
  Every test that looks at platform files reads `packages/cli/src/templates/**` instead. Do not
  regenerate the install to "fix" it: it is a large diff that conflicts on each upstream merge
  and proves nothing.
- **A skills symlink is not a template file.** `AI_TOOLS[id].sharedSkillsLink` names the path a
  platform reads when it will not read `.agents/skills/` directly, and `linkSharedSkills` points
  it there. No `collectTemplates` can describe a link, so it is not hash-tracked and both entry
  points assert it themselves: `configurePlatform` on init, and `update` before its
  "Already up to date!" exit — a clean tree is exactly the run that would otherwise skip a
  missing link forever. It never deletes a real directory found in that spot; it warns, because
  the directory may be the user's.

  Pi is deliberately absent from that map. It discovers `.agents/skills/` natively, and a second
  root makes it see every Trellis skill twice — the bug migration 0.6.8 removed (#447).
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
  hook writes. `test/regression.test.ts` `[#412]` pins one key per host.
- **The first-reply notice is written three times.** `shared-hooks/session-start.py`,
  `codex/hooks/session-start.py` and `pi/extensions/trellis/index.ts.txt` each carry their own
  copy, and `regression.test.ts` holds a fourth as a literal. Change one, change all four.

## Consuming it

The package keeps the `@mindfoldhq/trellis` name so `trellis update` still recognises
already-generated projects. Nothing is published to npmjs — the fork has no rights to
`@mindfoldhq/*`.

### For a consuming repository

Pin the release asset as a devDependency. `npm install` then makes `npx trellis` work with no
global install, no pnpm, no build step and no credentials:

```json
"devDependencies": {
  "@mindfoldhq/trellis": "https://github.com/neuralsignal/Trellis/releases/download/ns-0.6.17.1/mindfoldhq-trellis-0.6.17.tgz"
}
```

`package-lock.json` records that URL with an integrity hash, so every teammate resolves the
same bytes. Picking up a new fork release is one edit to that URL plus `npm install`.

### Cutting a release

Push a tag. `fork-release.yml` runs the english-only guard, typecheck, build, tests and
`verify-packed-cli`, packs the CLI, creates the release, and then downloads the asset with no
credentials to prove the consuming repositories can:

```bash
git tag ns-0.6.17.2 && git push origin ns-0.6.17.2
```

Tags are `ns-*`, never `v*`. Package versions stay at the upstream number, because `pnpm pack`
rewrites `workspace:*` to the exact shared version and that version must exist on public npm —
bumping the fork's version would pin core to something nobody published.

### For a maintainer iterating locally

A tag round-trip is not needed to test a template edit:

```bash
pnpm install && pnpm --filter @mindfoldhq/trellis build
# then, from the consuming repository:
npm install <path-to-fork>/packages/cli
```
