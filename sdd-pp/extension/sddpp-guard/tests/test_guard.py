"""Unit tests for the SDD.PP test-lock guard. Run: python3 -m unittest discover -s sdd-pp/extension/sddpp-guard/tests"""
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts" / "python"))
import guard  # noqa: E402


def payload(tool, **tool_input):
    return {"hook_event_name": "PreToolUse", "tool_name": tool, "tool_input": tool_input}


class GuardTest(unittest.TestCase):
    def project(self, state=None, raw=None):
        """A temporary project root, optionally with .sddpp/active.json."""
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        root = Path(tmp.name)
        (root / ".sddpp").mkdir()
        if state is not None:
            (root / ".sddpp" / "active.json").write_text(json.dumps(state))
        if raw is not None:
            (root / ".sddpp" / "active.json").write_text(raw)
        return root

    def code(self, root, data):
        return guard.decide(data, root)[0]

    # ── the lock follows the phase ───────────────────────────────
    def test_no_state_file_allows_everything(self):
        self.assertEqual(self.code(self.project(), payload("Edit", file_path="tests/a.test.js")), 0)

    def test_red_phase_allows_editing_tests(self):
        root = self.project({"slice": "SL-002", "phase": "red"})
        self.assertEqual(self.code(root, payload("Edit", file_path="tests/a.test.js")), 0)

    def test_refactor_phase_allows_editing_tests(self):
        root = self.project({"slice": "SL-002", "phase": "refactor"})
        self.assertEqual(self.code(root, payload("Edit", file_path="tests/a.test.js")), 0)

    def test_idle_state_allows_everything(self):
        root = self.project({"slice": None, "phase": None})
        self.assertEqual(self.code(root, payload("Edit", file_path="tests/a.test.js")), 0)

    # ── green phase: test files are locked ───────────────────────
    def test_green_blocks_every_file_tool_on_tests(self):
        root = self.project({"slice": "SL-002", "phase": "green"})
        for tool in ("Edit", "Write", "MultiEdit"):
            with self.subTest(tool=tool):
                self.assertEqual(self.code(root, payload(tool, file_path="tests/a.test.js")), 2)
        self.assertEqual(self.code(root, payload("NotebookEdit", notebook_path="tests/a.test.ipynb")), 2)

    def test_green_recognises_the_usual_test_layouts(self):
        root = self.project({"slice": "SL-002", "phase": "green"})
        for path in (
            "tests/math.test.js", "test/math.js", "src/__tests__/a.js", "src/user.spec.ts",
            "spec/models/user_spec.rb", "pkg/test_math.py", "/abs/project/tests/x.js", "tests\\win\\x.js",
        ):
            with self.subTest(path=path):
                self.assertEqual(self.code(root, payload("Write", file_path=path)), 2)

    def test_green_allows_production_code(self):
        root = self.project({"slice": "SL-002", "phase": "green"})
        for path in ("src/math.js", "src/contest.js", "src/latest.ts", "README.md"):
            with self.subTest(path=path):
                self.assertEqual(self.code(root, payload("Edit", file_path=path)), 0)

    def test_green_blocks_obvious_shell_writes_to_tests(self):
        root = self.project({"slice": "SL-002", "phase": "green"})
        for cmd in ("sed -i s/3/4/ tests/math.test.js", "echo x > tests/math.test.js", "rm tests/math.test.js",
                    "git checkout HEAD~1 -- tests/math.test.js", "tee tests/a.test.js"):
            with self.subTest(cmd=cmd):
                self.assertEqual(self.code(root, payload("Bash", command=cmd)), 2)

    def test_green_allows_reading_and_running_tests(self):
        root = self.project({"slice": "SL-002", "phase": "green"})
        for cmd in ("cat tests/math.test.js", "node --test tests/", "pytest tests/ -q", "grep -n add tests/math.test.js"):
            with self.subTest(cmd=cmd):
                self.assertEqual(self.code(root, payload("Bash", command=cmd)), 0)

    def test_green_allows_other_tools(self):
        root = self.project({"slice": "SL-002", "phase": "green"})
        self.assertEqual(self.code(root, payload("Read", file_path="tests/math.test.js")), 0)

    def test_block_message_tells_the_agent_what_to_do(self):
        root = self.project({"slice": "SL-002", "phase": "green"})
        message = guard.decide(payload("Edit", file_path="tests/a.test.js"), root)[1]
        self.assertIn("GREEN", message)
        self.assertIn("reopen the RED phase", message)

    # ── fail closed on a broken state file ───────────────────────
    def test_invalid_json_state_locks_tests(self):
        root = self.project(raw="{not json")
        self.assertEqual(self.code(root, payload("Edit", file_path="tests/a.test.js")), 2)
        self.assertEqual(self.code(root, payload("Edit", file_path="src/a.js")), 0)

    def test_non_object_state_locks_tests(self):
        root = self.project(raw="[1, 2]")
        self.assertEqual(self.code(root, payload("Write", file_path="tests/a.test.js")), 2)

    def test_unreadable_payload_is_blocked_while_locked(self):
        root = self.project({"slice": "SL-002", "phase": "green"})
        self.assertEqual(self.code(root, None), 2)

    # ── known limitations, pinned so that improving them is a deliberate change ──
    def test_known_limitation_shell_scripts_can_write_without_a_test_path_in_the_command(self):
        root = self.project({"slice": "SL-002", "phase": "green"})
        cmd = 'python3 -c "import pathlib; pathlib.Path(\'te\'+\'sts/math.test.js\').write_text(\'x\')"'
        self.assertEqual(self.code(root, payload("Bash", command=cmd)), 0)

    def test_known_limitation_writes_through_an_interpreter_are_not_recognised(self):
        root = self.project({"slice": "SL-002", "phase": "green"})
        cmd = 'node -e "require(\'fs\').writeFileSync(\'tests/math.test.js\',\'x\')"'
        self.assertEqual(self.code(root, payload("Bash", command=cmd)), 0)


if __name__ == "__main__":
    unittest.main()
