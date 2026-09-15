/**
 * Integration tests for the `compact` SessionStart source.
 *
 * A compaction happens mid-conversation, so `session-start.py` reloads the
 * payload only when a Trellis task is in flight, and writes nothing otherwise.
 * `startup` and `clear` are untouched: they inject unconditionally.
 *
 * Scripts are stamped into a fresh temp dir and exercised through the real
 * `python3` interpreter. `TRELLIS_CONTEXT_ID` pins session identity so the
 * ambient environment (an editor that exports its own session id) cannot
 * decide which session file the hook reads.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEMPLATE_SCRIPTS = path.resolve(
  __dirname,
  "../../src/templates/trellis/scripts",
);
const SHARED_HOOKS = path.resolve(
  __dirname,
  "../../src/templates/shared-hooks",
);
const CONTEXT_ID = "trellis-compact-test";

function hasPython(): boolean {
  try {
    execFileSync("python3", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function setupRepo(tmp: string): void {
  fs.mkdirSync(path.join(tmp, ".trellis", "scripts"), { recursive: true });
  fs.cpSync(TEMPLATE_SCRIPTS, path.join(tmp, ".trellis", "scripts"), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(tmp, ".trellis", "workflow.md"),
    ["# Workflow", "", "## Phase 1: Plan", ""].join("\n"),
  );
}

/** Create a task directory and point the session at it, as `task.py start` does. */
function startTask(tmp: string, name: string): void {
  const taskDir = path.join(tmp, ".trellis", "tasks", name);
  fs.mkdirSync(taskDir, { recursive: true });
  fs.writeFileSync(
    path.join(taskDir, "task.json"),
    JSON.stringify({ title: name, status: "in_progress" }),
  );
  pointSessionAt(tmp, `.trellis/tasks/${name}`);
}

/** Write the session pointer through the real resolver, not a hand-built path. */
function pointSessionAt(tmp: string, taskRef: string): void {
  const probe = path.join(tmp, "point_probe.py");
  fs.writeFileSync(
    probe,
    [
      "import sys",
      `sys.path.insert(0, ${JSON.stringify(path.join(tmp, ".trellis", "scripts"))})`,
      "from pathlib import Path",
      "from common.active_task import set_active_task",
      `result = set_active_task(${JSON.stringify(taskRef)}, Path(${JSON.stringify(tmp)}), {})`,
      "assert result is not None, 'no context key'",
      "",
    ].join("\n"),
    "utf-8",
  );
  const r = spawnSync("python3", [probe], {
    cwd: tmp,
    encoding: "utf-8",
    env: { ...process.env, TRELLIS_CONTEXT_ID: CONTEXT_ID },
  });
  if (r.status !== 0) {
    throw new Error(`pointing the session failed (rc=${r.status}): ${r.stderr}`);
  }
}

function runHook(
  tmp: string,
  source: string,
): { stdout: string; stderr: string; status: number | null } {
  const r = spawnSync("python3", [path.join(SHARED_HOOKS, "session-start.py")], {
    cwd: tmp,
    encoding: "utf-8",
    input: JSON.stringify({
      hook_event_name: "SessionStart",
      source,
      cwd: tmp,
      session_id: "test-session",
    }),
    env: {
      ...process.env,
      CLAUDE_PROJECT_DIR: tmp,
      TRELLIS_CONTEXT_ID: CONTEXT_ID,
    },
  });
  return { stdout: r.stdout, stderr: r.stderr, status: r.status };
}

const describeFn = hasPython() ? describe : describe.skip;

describeFn("SessionStart compact source", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-compact-"));
    setupRepo(tmp);
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("injects the full payload when a task is active", () => {
    startTask(tmp, "01-01-example");
    const { stdout, status } = runHook(tmp, "compact");
    expect(status).toBe(0);
    expect(stdout).toContain("<session-context>");
    expect(stdout).toContain("<trellis-workflow>");
    expect(stdout).toContain("<task-status>");
    expect(stdout).toContain(".trellis/tasks/01-01-example");
  });

  it("omits the first-reply notice when a task is active", () => {
    startTask(tmp, "01-01-example");
    const compact = runHook(tmp, "compact");
    expect(compact.stdout).not.toContain("<first-reply-notice>");
    // The notice is the only intended difference from a startup payload.
    const startup = runHook(tmp, "startup");
    expect(startup.stdout).toContain("<first-reply-notice>");
  });

  it("writes nothing when no task is active", () => {
    const { stdout, status } = runHook(tmp, "compact");
    expect(status).toBe(0);
    expect(stdout).toBe("");
  });

  it("writes nothing when the task directory has been removed", () => {
    // The real sequence: the task is started, then its directory goes away
    // (archived, deleted, a branch switch). That pointer is not work in flight.
    startTask(tmp, "01-01-gone");
    fs.rmSync(path.join(tmp, ".trellis", "tasks", "01-01-gone"), {
      recursive: true,
    });
    const { stdout, status } = runHook(tmp, "compact");
    expect(status).toBe(0);
    expect(stdout).toBe("");
  });

  it("writes nothing when the pointer escapes the repository", () => {
    // `set_active_task` refuses such a ref, so this is a hand-edited or legacy
    // runtime file. The directory exists, so only the resolver's containment
    // check (ActiveTask.stale) rejects it.
    startTask(tmp, "01-01-example");
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-outside-"));
    const sessionsDir = path.join(tmp, ".trellis", ".runtime", "sessions");
    const [sessionFile] = fs.readdirSync(sessionsDir);
    const session = path.join(sessionsDir, sessionFile);
    fs.writeFileSync(
      session,
      JSON.stringify({
        ...JSON.parse(fs.readFileSync(session, "utf-8")),
        current_task: outside,
      }),
    );
    try {
      const { stdout, status } = runHook(tmp, "compact");
      expect(status).toBe(0);
      expect(stdout).toBe("");
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it("writes nothing, without raising, when the active-task resolver throws", () => {
    // A hook error is noise mid-conversation. Stub the module the hook imports:
    // context-key resolution still works, resolving the task does not.
    const activeTask = path.join(tmp, ".trellis", "scripts", "common", "active_task.py");
    const original = fs.readFileSync(activeTask, "utf-8");
    fs.writeFileSync(
      activeTask,
      [
        original,
        "",
        "",
        "def resolve_active_task(*_args, **_kwargs):",
        "    raise RuntimeError('resolver is broken')",
        "",
      ].join("\n"),
      "utf-8",
    );
    startTask(tmp, "01-01-example");
    const { stdout, stderr, status } = runHook(tmp, "compact");
    expect(status).toBe(0);
    expect(stdout).toBe("");
    expect(stderr).not.toContain("Traceback");
  });

  it("still injects on startup when no task is active", () => {
    // Pins that the gate reads `source`, not task state alone.
    const { stdout, status } = runHook(tmp, "startup");
    expect(status).toBe(0);
    expect(stdout).toContain("<session-context>");
    expect(stdout).toContain("NO ACTIVE TASK");
  });
});
