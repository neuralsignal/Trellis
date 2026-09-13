# Platform File Map

This page lists common Trellis file locations in a user project by platform. Whether a platform directory exists in an actual project depends on which `trellis init --<platform>` commands the user ran.

## Matrix

| Platform | CLI flag | Main directory | Skill directory | Agent directory | Hooks/extensions |
| --- | --- | --- | --- | --- | --- |
| Claude Code | `--claude` | `.claude/` | `.claude/skills/` | `.claude/agents/` | `.claude/hooks/` + `.claude/settings.json` |
| Cursor | `--cursor` | `.cursor/` | `.cursor/skills/` | `.cursor/agents/` | `.cursor/hooks.json` + `.cursor/hooks/` |
| OpenCode | `--opencode` | `.opencode/` | `.opencode/skills/` | `.opencode/agents/` | `.opencode/plugins/` |
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

Codex and Pi Agent write the shared `.agents/skills/` layer. Other tools that support agentskills.io can also read this directory. If the user wants multiple compatible tools to share one skill, consider `.agents/skills/` first, but do not assume every platform reads it.

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
