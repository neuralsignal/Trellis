# Platform File Map

This page lists common Trellis file locations in a user project by platform. Whether a platform directory exists in an actual project depends on which `trellis init --<platform>` commands the user ran.

## Matrix

| Platform | CLI flag | Main directory | Skill directory | Agent directory | Hooks/extensions |
| --- | --- | --- | --- | --- | --- |
| Claude Code | `--claude` | `.claude/` | `.claude/skills/` → `.agents/skills/` | `.claude/agents/` | `.claude/hooks/` + `.claude/settings.json` |
| Cursor | `--cursor` | `.cursor/` | `.cursor/skills/` | `.cursor/agents/` | `.cursor/hooks.json` + `.cursor/hooks/` |
| OpenCode | `--opencode` | `.opencode/` | `.opencode/skills/` → `.agents/skills/` | `.opencode/agents/` | `.opencode/plugins/` |
| Codex | `--codex` | `.codex/` | `.agents/skills/` | `.codex/agents/` | `.codex/hooks/` + `.codex/hooks.json` |
| Pi Agent | `--pi` | `.pi/` | `.agents/skills/` | `.pi/agents/` | `.pi/extensions/trellis/` (native `trellis_subagent` tool) + `.pi/settings.json` |

## Capability Groups

### Trellis Sub-Agent Support

Every platform above ships `trellis-research`, `trellis-implement`, and `trellis-check` files. When changing implementation/check/research behavior, look for the corresponding platform agent files first.

### Native Trellis Sub-Agent Tool

Some platforms expose a first-class tool that the host runtime understands. The model calls it like any other tool and the host renders progress cards, validates the agent name against `.<platform>/agents/`, and enforces dispatch modes.

- Pi Agent — `trellis_subagent` tool, defined in `.pi/extensions/trellis/index.ts`. Supports `single` / `parallel` / `chain` dispatch modes and emits live `trellis-subagent-progress` events.

When changing sub-agent dispatch behavior on these platforms, edit the extension file, **not** the agent markdown — the agent markdown defines responsibilities, but the host extension owns dispatch, validation, and progress rendering.

### Shared `.agents/skills/`

`.agents/skills/` is the one real skills tree. Codex and Pi Agent read it natively. Claude Code and OpenCode only read their own `.<platform>/skills/`, so Trellis creates that path as a relative symlink onto the shared tree — the arrows in the matrix above.

Edit a skill once, under `.agents/skills/`. Editing through a symlinked path writes the same file, which is fine; creating a real directory where a symlink belongs is not, because the platform then reads a private copy that no longer receives updates. `trellis update` re-creates a missing link, and warns rather than deleting a real directory it finds in that spot.

Cursor keeps its own `.cursor/skills/`. Other tools that support agentskills.io can read `.agents/skills/` too, but do not assume every platform does.

## Decision Rules When Modifying Platform Files

1. User specified a platform: modify only that platform directory unless shared workflow/spec files must also change.
2. User says "all platforms should do this": synchronize equivalent entry points platform by platform; do not modify only one directory.
3. User only says "my AI": inspect the configuration directories that actually exist in the project and infer the current AI platform.
4. User wants project rules: prefer `.trellis/spec/` or a project-local skill.
5. User wants Trellis behavior: edit `.trellis/workflow.md` plus platform hooks/agents/skills/commands.

## When Paths Differ

Platform ecosystems change, and user projects may already be customized. If this table disagrees with local files, use the actual settings/config in the user project as authoritative:

- Check the hook that settings registers.
- Check the script that a command/prompt/workflow points to.
- Judge behavior by the read rules currently written in the agent file.

Do not delete a custom file just because it is not listed in this path table.
