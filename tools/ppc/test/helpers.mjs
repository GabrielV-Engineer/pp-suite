import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const EXAMPLE = fileURLToPath(new URL('../../../examples/todo-app/', import.meta.url));
export const CLI = fileURLToPath(new URL('../bin/ppc.mjs', import.meta.url));

export const lines = (n) => Array.from({ length: n }, (_, i) => `line ${i}`).join('\n') + '\n';

/**
 * A real git repository holding a copy of the example, so checks run against real history. The example's slices name the screen
 * they build to, so closing one needs a check of the real app (ui_check); most tests are about something else, so the copy drops
 * `screens` unless `{ screens: true }` asks to keep them (a slice without screens is only a U06 warning).
 */
export function repo(t, { screens = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'ppc-git-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  cpSync(EXAMPLE, dir, { recursive: true });
  if (!screens) {
    const slices = join(dir, '.sddpp/slices');
    for (const f of readdirSync(slices)) writeFileSync(join(slices, f), readFileSync(join(slices, f), 'utf8').replace(/^screens: .*\n/m, ''));
  }
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
