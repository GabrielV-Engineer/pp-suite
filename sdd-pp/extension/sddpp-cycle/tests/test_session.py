import os
import stat
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "python" / "session.py"
sys.path.insert(0, str(SCRIPT.parent))
import session  # noqa: E402


def fake_ppc(directory: Path, body: str) -> Path:
    path = directory / "ppc"
    path.write_text("#!/bin/sh\n" + body + "\n")
    path.chmod(path.stat().st_mode | stat.S_IEXEC)
    return path


class SessionStart(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())

    def run_script(self, path_dirs, stdin="{}"):
        env = {"PATH": os.pathsep.join(str(d) for d in path_dirs) + os.pathsep + "/usr/bin:/bin", "CLAUDE_PROJECT_DIR": str(self.tmp)}
        return subprocess.run([sys.executable, str(SCRIPT)], input=stdin, capture_output=True, text=True, env=env)

    def test_prints_what_ppc_session_prints_for_the_project(self):
        bin_dir = self.tmp / "bin"
        bin_dir.mkdir()
        fake_ppc(bin_dir, 'echo "pp-suite: Demo (blueprint revision 1)"; echo "args: $@"')
        result = self.run_script([bin_dir])
        self.assertEqual(result.returncode, 0)
        self.assertIn("pp-suite: Demo (blueprint revision 1)", result.stdout)
        self.assertIn(f"args: session {self.tmp}", result.stdout)

    def test_says_nothing_and_does_not_fail_when_ppc_is_not_installed(self):
        result = self.run_script([self.tmp / "empty"])
        self.assertEqual((result.returncode, result.stdout), (0, ""))

    def test_says_nothing_and_does_not_fail_when_ppc_fails(self):
        bin_dir = self.tmp / "bin"
        bin_dir.mkdir()
        fake_ppc(bin_dir, 'echo "half an answer"; exit 3')
        result = self.run_script([bin_dir])
        self.assertEqual((result.returncode, result.stdout), (0, ""))

    def test_accepts_any_payload_even_garbage_or_none(self):
        bin_dir = self.tmp / "bin"
        bin_dir.mkdir()
        fake_ppc(bin_dir, 'echo ok')
        for payload in ("", "not json", '{"source": "compact"}'):
            with self.subTest(payload=payload):
                self.assertEqual(self.run_script([bin_dir], stdin=payload).returncode, 0)

    def test_context_function_returns_text_or_empty(self):
        bin_dir = self.tmp / "bin"
        bin_dir.mkdir()
        exe = fake_ppc(bin_dir, 'echo hello')
        self.assertEqual(session.context(self.tmp, ppc=str(exe)).strip(), "hello")
        self.assertEqual(session.context(self.tmp, ppc=str(self.tmp / "missing")), "")


if __name__ == "__main__":
    unittest.main()
