"""Which skills and MCP servers were used, and in which slice: the recorder (PostToolUse) and the guard that protects what it wrote.
Run: python3 -m unittest discover -s sdd-pp/extension/sddpp-guard/tests"""
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts" / "python"
sys.path.insert(0, str(SCRIPTS))
import guard  # noqa: E402
import ledger  # noqa: E402
import record_answer  # noqa: E402


def used(tool_name, tool_input=None, **extra):
    """What Claude Code sends a PostToolUse hook after a tool ran (the shape seen on 2026-11-21: `Skill` carries the skill in
    `tool_input.skill`, a plugin's skill as `plugin:skill`, and an MCP tool carries `mcp_server`)."""
    return {"hook_event_name": "PostToolUse", "tool_name": tool_name, "tool_input": tool_input or {}, "tool_response": {"content": "RESPONSE-SECRET"},
            "session_id": "S1", "tool_use_id": "toolu_1", "permission_mode": "default", **extra}


class UsesTest(unittest.TestCase):
    def project(self, active=None, raw=None):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        root = Path(tmp.name)
        (root / ".sddpp").mkdir()
        if active is not None:
            (root / ".sddpp" / "active.json").write_text(json.dumps(active))
        if raw is not None:
            (root / ".sddpp" / "active.json").write_text(raw)
        return root

    def lines(self, root):
        file = root / ".sddpp" / "uses.jsonl"
        return [json.loads(l) for l in file.read_text().splitlines()] if file.exists() else []

    # ── what is recorded ─────────────────────────────────────────
    def test_a_skill_is_recorded_with_the_slice_in_progress(self):
        root = self.project({"slice": "SL-004", "phase": "build"})
        record_answer.record_use(used("Skill", {"skill": "frontend-design"}), root)
        (line,) = self.lines(root)
        self.assertEqual((line["kind"], line["name"], line["slice"], line["session_id"], line["tool_use_id"]), ("skill", "frontend-design", "SL-004", "S1", "toolu_1"))
        self.assertIsInstance(line["at"], float)

    def test_a_plugins_skill_keeps_the_name_the_skill_tool_gave_it(self):
        root = self.project()
        record_answer.record_use(used("Skill", {"skill": "probeplug:hello"}), root)
        self.assertEqual(self.lines(root)[0]["name"], "probeplug:hello")

    def test_an_mcp_tool_is_recorded_by_its_server(self):
        root = self.project({"slice": "SL-002", "phase": "red"})
        record_answer.record_use(used("mcp__codebase-memory-mcp__list_projects", {}, mcp_server={"name": "codebase-memory-mcp", "source": "user"}), root)
        (line,) = self.lines(root)
        self.assertEqual((line["kind"], line["name"], line["slice"]), ("mcp", "codebase-memory-mcp", "SL-002"))

    def test_an_mcp_tool_with_no_server_field_is_read_from_its_name(self):
        root = self.project()
        record_answer.record_use(used("mcp__postgres__query", {"sql": "select 1"}), root)
        self.assertEqual((self.lines(root)[0]["kind"], self.lines(root)[0]["name"]), ("mcp", "postgres"))

    def test_the_server_field_wins_over_the_name_of_the_tool(self):
        # a server's name in the tool's name is not always the server's own (a plugin's server is prefixed), so the field is what is trusted
        root = self.project()
        record_answer.record_use(used("mcp__plugin_probe_srv__q", {}, mcp_server={"name": "srv", "source": "plugin"}), root)
        self.assertEqual(self.lines(root)[0]["name"], "srv")

    def test_one_failing_record_does_not_stop_the_other(self):
        from unittest import mock
        import io
        root = self.project()
        payload = used("Skill", {"skill": "frontend-design"}, cwd=str(root))
        with mock.patch.object(record_answer, "record", side_effect=RuntimeError("boom")), mock.patch.object(sys, "stdin", io.StringIO(json.dumps(payload))):
            with self.assertRaises(SystemExit) as stopped:
                record_answer.main()
        self.assertEqual(stopped.exception.code, 0)
        self.assertEqual(self.lines(root)[0]["name"], "frontend-design")

    def test_without_an_active_slice_or_with_a_broken_state_the_slice_is_empty_and_nothing_fails(self):
        for root in (self.project(), self.project(raw="{ not json"), self.project(active=[1, 2]), self.project(active={"phase": "build"})):
            record_answer.record_use(used("Skill", {"skill": "x1"}), root)
            self.assertIsNone(self.lines(root)[0]["slice"])

    # ── what is not ──────────────────────────────────────────────
    def test_other_tools_are_not_recorded(self):
        root = self.project()
        for tool in ("Bash", "Edit", "Read", "Write", "AskUserQuestion", "Task", "WebFetch"):
            record_answer.record_use(used(tool, {"command": "ls", "skill": "frontend-design"}), root)
        self.assertEqual(self.lines(root), [])

    def test_only_names_are_kept_never_what_a_tool_was_given_or_answered(self):
        root = self.project()
        record_answer.record_use(used("mcp__postgres__query", {"sql": "SELECT * FROM SECRET-TABLE", "token": "ARG-SECRET"}, mcp_server={"name": "postgres", "source": "user", "url": "URL-SECRET"}), root)
        record_answer.record_use(used("Skill", {"skill": "frontend-design", "args": "ARG-SECRET"}), root)
        text = (root / ".sddpp" / "uses.jsonl").read_text()
        for secret in ("SECRET-TABLE", "ARG-SECRET", "URL-SECRET", "RESPONSE-SECRET"):
            self.assertNotIn(secret, text)

    def test_a_malformed_call_records_nothing_and_never_raises(self):
        root = self.project()
        for bad in (None, "text", [], {}, used("Skill", {}), used("Skill", {"skill": 7}), used("Skill", None), used("mcp__", {}), used("mcp____x", {})):
            record_answer.record_use(bad, root)
        self.assertEqual(self.lines(root), [])

    def test_the_panel_answers_are_still_recorded_by_the_same_hook(self):
        root = self.project()
        answers = {"Approve SL-001?": "Sí, aprobar — ppc approve SL-001"}
        payload = {"hook_event_name": "PostToolUse", "tool_name": "AskUserQuestion", "tool_use_id": "toolu_A", "session_id": "S1", "cwd": str(root),
                   "tool_input": {"answers": answers}, "tool_response": {"answers": answers}}
        record_answer.record(payload, root)
        record_answer.record_use(payload, root)
        self.assertEqual(self.lines(root), [])
        self.assertEqual(len((root / ".sddpp" / "answers.jsonl").read_text().splitlines()), 1)

    def test_the_hook_as_claude_code_runs_it_writes_both_and_exits_zero(self):
        root = self.project({"slice": "SL-003", "phase": "build"})
        env = {**os.environ, "CLAUDE_PROJECT_DIR": str(root)}
        for payload in (used("Skill", {"skill": "frontend-design"}), used("mcp__postgres__query", {}, mcp_server={"name": "postgres", "source": "user"})):
            done = subprocess.run([sys.executable, "-I", str(SCRIPTS / "record_answer.py")], input=json.dumps(payload), capture_output=True, text=True, env=env, cwd=str(root))
            self.assertEqual((done.returncode, done.stdout), (0, ""))
        self.assertEqual([(l["kind"], l["name"], l["slice"]) for l in self.lines(root)], [("skill", "frontend-design", "SL-003"), ("mcp", "postgres", "SL-003")])
        done = subprocess.run([sys.executable, "-I", str(SCRIPTS / "record_answer.py")], input="not json at all", capture_output=True, text=True, env=env, cwd=str(root))
        self.assertEqual(done.returncode, 0)

    # ── the guard keeps the record the recorder's ────────────────
    def test_the_agent_cannot_write_the_use_record(self):
        root = self.project()
        for data in (
            {"tool_name": "Write", "tool_input": {"file_path": ".sddpp/uses.jsonl", "content": "{}"}},
            {"tool_name": "Edit", "tool_input": {"file_path": str(root / ".sddpp" / "uses.jsonl"), "old_string": "a", "new_string": "b"}},
            {"tool_name": "Bash", "tool_input": {"command": "echo '{\"kind\":\"skill\"}' >> .sddpp/uses.jsonl"}},
            {"tool_name": "Bash", "tool_input": {"command": "sed -i 's/false/true/' .sddpp/uses.jsonl"}},
            {"tool_name": "Bash", "tool_input": {"command": "rm .sddpp/uses.jsonl"}},
        ):
            with self.subTest(data=data):
                code, message = guard.decide(data, root)
                self.assertEqual(code, 2)
                self.assertIn("uses.jsonl", message)
                self.assertIn("recorder", message)

    def test_the_use_record_can_be_read_and_the_answers_keep_their_own_message(self):
        root = self.project()
        for data in ({"tool_name": "Read", "tool_input": {"file_path": ".sddpp/uses.jsonl"}}, {"tool_name": "Bash", "tool_input": {"command": "cat .sddpp/uses.jsonl"}},
                     {"tool_name": "Bash", "tool_input": {"command": "wc -l .sddpp/uses.jsonl"}}):
            self.assertEqual(guard.decide(data, root)[0], 0)
        code, message = guard.decide({"tool_name": "Write", "tool_input": {"file_path": ".sddpp/answers.jsonl", "content": "{}"}}, root)
        self.assertEqual(code, 2)
        self.assertIn("answers.jsonl", message)


if __name__ == "__main__":
    unittest.main()
