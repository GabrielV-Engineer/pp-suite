import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const EXAMPLE = fileURLToPath(new URL('../../../examples/todo-app/', import.meta.url));
export const CLI = fileURLToPath(new URL('../bin/ppc.mjs', import.meta.url));

export const lines = (n) => Array.from({ length: n }, (_, i) => `line ${i}`).join('\n') + '\n';

/** A real git repository holding a copy of the example, so checks run against real history. */
export function repo(t) {
  const dir = mkdtempSync(join(tmpdir(), 'ppc-git-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  cpSync(EXAMPLE, dir, { recursive: true });
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'Test');
  git('config', 'commit.gpgsign', 'false');
  git('add', '-A');
  git('commit', '-q', '-m', 'base');
  const write = (files) => {
    for (const [path, content] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), content);
    }
  };
  const commit = (message, files) => {
    write(files);
    git('add', '-A');
    git('commit', '-q', '-m', message);
    return git('rev-parse', 'HEAD');
  };
  return { dir, git, write, commit };
}
