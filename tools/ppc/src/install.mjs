import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';

// Sets a project up for pp-suite. It reports first and changes nothing; `apply` runs only the project-level steps
// that are missing. Installing Spec Kit itself (a global tool, third-party code) is left to the person: the exact
// command is printed. All outside effects (running commands, probing the machine) are passed in, so this module is
// tested without installing anything.

export class InstallError extends Error {}
const fail = (message) => {
  throw new InstallError(message);
};

export const readPins = (suite) => JSON.parse(readFileSync(join(suite, 'install/versions.json'), 'utf8'));

// Where each extension lives in this repository. Architect.PP comes first: it is the first step of a project.
const EXTENSIONS = [
  { id: 'architect-pp', dir: 'architect-pp/extension' },
  { id: 'sddpp-guard', dir: 'sdd-pp/extension/sddpp-guard' },
  { id: 'sddpp-cycle', dir: 'sdd-pp/extension/sddpp-cycle' },
];
const PRESET = 'sddpp-slices';
const GUARD_SCRIPT = '.specify/extensions/sddpp-guard/scripts/python/guard.py';
const HOOK_NAME = 'speckit.sddpp-guard.pre-tool';

const manifestVersion = (suite, file, key) => String(parseYaml(readFileSync(join(suite, file), 'utf8'))[key].version);
const shimText = (suite) => `#!/bin/sh\nexec node "${join(suite, 'tools/ppc/bin/ppc.mjs')}" "$@"\n`;
const versionOf = (out) => /(\d+(?:\.\d+)+\S*)/.exec(out ?? '')?.[1];

/** Reads the current state of the machine and the project, and the steps that would fix what is missing. */
export function plan(root, env, { shim = false, allowUntested = false } = {}) {
  const { suite, probe, nodeVersion, pathDirs = [], home = '', specify = 'specify' } = env;
  const pins = readPins(suite);
  const checks = [];
  const blocked = [];
  const add = (check, { blocks = false } = {}) => {
    checks.push(check);
    if (blocks && check.status !== 'ok') blocked.push({ id: check.id, why: `${check.label}: ${check.status}${check.found ? ` (${check.found})` : ''}` });
  };

  // ── the machine ──
  const major = Number(String(nodeVersion).split('.')[0]);
  add({ id: 'node', label: 'Node.js', status: major >= pins.node.min ? 'ok' : 'differs', found: nodeVersion, wanted: `>= ${pins.node.min} (tested ${pins.node.tested})` }, { blocks: true });
  const git = probe('git', ['--version']);
  add({ id: 'git', label: 'git', status: git?.status === 0 ? 'ok' : 'missing', found: versionOf(git?.stdout) }, { blocks: true });
  const repo = probe('git', ['rev-parse', '--git-dir'], { cwd: root });
  add({ id: 'git-repo', label: 'the project is a git repository', status: repo?.status === 0 ? 'ok' : 'missing', fix: 'git init' }, { blocks: true });
  const python = probe('python3', ['--version']);
  add({ id: 'python', label: 'Python 3 (for the guard)', status: python?.status === 0 ? 'ok' : 'missing', found: versionOf(python?.stdout), wanted: `${pins.python.tested} is the tested version` }, { blocks: true });

  const spec = probe(specify, ['--version']);
  const specVersion = spec?.status === 0 ? versionOf(spec.stdout) : undefined;
  const specStatus = !specVersion ? 'missing' : specVersion === pins.speckit.version ? 'ok' : 'differs';
  const installCommand = `uv tool install specify-cli --from git+${pins.speckit.repository}.git@${pins.speckit.commit}`;
  checks.push({ id: 'specify', label: 'Spec Kit (specify)', status: specStatus, found: specVersion, wanted: `${pins.speckit.version} (commit ${pins.speckit.commit.slice(0, 7)})`, fix: installCommand });
  if (specStatus === 'missing' || (specStatus === 'differs' && !allowUntested)) blocked.push({ id: 'specify', why: `Spec Kit (specify) ${specStatus === 'missing' ? 'is not installed' : `is ${specVersion}, not ${pins.speckit.version}`}` });

  const claude = probe('claude', ['--version']);
  const claudeVersion = versionOf(claude?.stdout);
  add({ id: 'claude', label: 'Claude Code', status: !claudeVersion ? 'missing' : claudeVersion === pins.claude_code.tested ? 'ok' : 'differs', found: claudeVersion, wanted: `${pins.claude_code.tested} is the tested version` });

  // ── ppc itself ──
  const depsOk = existsSync(join(suite, 'tools/ppc/node_modules/ajv'));
  add({ id: 'ppc-deps', label: 'ppc dependencies installed', status: depsOk ? 'ok' : 'missing' });
  const onPath = pathDirs.map((d) => join(d, 'ppc')).find((f) => existsSync(f));
  const ours = onPath ? readFileSync(onPath, 'utf8').includes(join(suite, 'tools/ppc/bin/ppc.mjs')) : false;
  add({ id: 'ppc-on-path', label: 'ppc on the PATH (the agent commands call it)', status: !onPath ? 'missing' : ours ? 'ok' : 'differs', found: onPath, fix: 'ppc init --apply --shim' });

  // ── the project ──
  const hasSpecify = existsSync(join(root, '.specify'));
  add({ id: 'specify-project', label: 'Spec Kit initialized in the project', status: hasSpecify ? 'ok' : 'missing' });
  const listed = (kind) => {
    if (!hasSpecify || specStatus === 'missing') return [];
    const out = probe(specify, [kind, 'list', '--json'], { cwd: root });
    try {
      return out?.status === 0 ? JSON.parse(out.stdout) : [];
    } catch {
      return [];
    }
  };
  const piece = (kind, id, version) => {
    const found = listed(kind).find((x) => x.id === id);
    const status = !found ? 'missing' : found.version === version ? 'ok' : 'differs';
    add({ id: `${kind}-${id}`, label: `${kind} ${id}`, status, found: found?.version, wanted: version }, { blocks: status === 'differs' });
    return status === 'ok';
  };
  const extensionOk = Object.fromEntries(EXTENSIONS.map(({ id, dir }) => [id, piece('extension', id, manifestVersion(suite, `${dir}/extension.yml`, 'extension'))]));
  const presetOk = piece('preset', PRESET, manifestVersion(suite, `sdd-pp/preset/${PRESET}/preset.yml`, 'preset'));
  add({ id: 'guard-script', label: 'the guard script is present (without it the guard fails open)', status: existsSync(join(root, GUARD_SCRIPT)) ? 'ok' : 'missing' });
  let hook = false;
  try {
    hook = readFileSync(join(root, '.claude/settings.json'), 'utf8').includes(HOOK_NAME);
  } catch {
    // no settings file: no hook
  }
  add({ id: 'guard-hook', label: 'the guard is registered as a Claude Code hook', status: hook ? 'ok' : 'missing' });

  // ── the steps that would fix what is missing ──
  const steps = [
    { id: 'npm-ci', title: 'Install the dependencies of ppc', command: ['npm', 'ci'], cwd: join(suite, 'tools/ppc'), done: depsOk },
    { id: 'specify-init', title: 'Initialize Spec Kit for Claude Code', command: [specify, 'init', '--here', '--force', '--non-interactive', '--integration', 'claude'], cwd: root, done: hasSpecify },
    ...EXTENSIONS.map(({ id, dir }) => ({ id: `extension-${id}`, title: `Install the ${id} extension`, command: [specify, 'extension', 'add', join(suite, dir), '--dev'], cwd: root, done: extensionOk[id] })),
    { id: `preset-${PRESET}`, title: `Install the ${PRESET} preset`, command: [specify, 'preset', 'add', '--dev', join(suite, `sdd-pp/preset/${PRESET}`)], cwd: root, done: presetOk },
  ];
  if (shim) {
    const dir = pathDirs.find((d) => d === join(home, '.local/bin'));
    const status = checks.find((c) => c.id === 'ppc-on-path').status;
    if (status === 'differs') blocked.push({ id: 'ppc-shim', why: `another program called ppc is already on the PATH (${onPath}); it will not be overwritten` });
    else if (!dir && status === 'missing') blocked.push({ id: 'ppc-shim', why: '~/.local/bin is not on the PATH, so a shim there would not be found' });
    steps.push({ id: 'ppc-shim', title: 'Write the ppc shim', target: join(dir ?? join(home, '.local/bin'), 'ppc'), content: shimText(suite), done: status === 'ok' });
  }
  return { checks, steps, blocked };
}

/**
 * Runs the steps that are not done, in order, and stops at the first failure. Refuses a blocked machine and a project
 * with uncommitted changes, so that everything the install does shows up as a reviewable diff.
 */
export function apply(root, env, { run, shim = false, allowUntested = false } = {}) {
  const before = plan(root, env, { shim, allowUntested });
  if (before.blocked.length) fail(`cannot continue:\n${before.blocked.map((b) => `  - ${b.why}`).join('\n')}`);
  const pending = before.steps.filter((s) => !s.done);
  if (pending.length) {
    const status = env.probe('git', ['status', '--porcelain'], { cwd: root });
    if (status?.stdout?.trim()) fail('the project has uncommitted changes; commit or stash them first, so the install can be reviewed as a diff');
  }
  const ran = [];
  for (const step of pending) {
    if (step.target) {
      mkdirSync(join(step.target, '..'), { recursive: true });
      writeFileSync(step.target, step.content);
      chmodSync(step.target, 0o755);
    } else {
      const result = run(step.command, step.cwd);
      if (result.status !== 0) fail(`step ${step.id} failed (${step.command.join(' ')}):\n${String(result.stderr ?? '').trim()}`);
    }
    ran.push(step.id);
  }
  return { ran, plan: plan(root, env, { shim, allowUntested }) };
}

const MARK = { ok: 'ok     ', differs: 'DIFFERS', missing: 'MISSING' };

/** The report a person reads: what was found, what blocks, and the exact commands the steps would run. */
export function renderPlan(p, { applied = false } = {}) {
  const out = ['Checks:'];
  for (const c of p.checks) {
    const detail = [c.found && `found ${c.found}`, c.status !== 'ok' && c.wanted && `wanted ${c.wanted}`].filter(Boolean).join(', ');
    out.push(`  ${MARK[c.status]}  ${c.label}${detail ? ` (${detail})` : ''}`);
    if (c.status !== 'ok' && c.fix) out.push(`           fix: ${c.fix}`);
  }
  if (p.blocked.length) out.push('', 'Blocked:', ...p.blocked.map((b) => `  - ${b.why}`));
  const pending = p.steps.filter((s) => !s.done);
  out.push('', applied ? 'Steps still pending:' : 'Steps:');
  if (!pending.length) out.push('  none: the project is set up');
  for (const s of pending) out.push(`  ${applied ? 'pending' : 'would run'}: ${s.target ? `write ${s.target}` : s.command.join(' ')}${s.cwd ? `   (in ${s.cwd})` : ''}`);
  if (!applied && pending.length && !p.blocked.length) out.push('', 'Nothing was changed. `ppc init --apply` runs the steps above (`--shim` also writes ~/.local/bin/ppc).');
  return `${out.join('\n')}\n`;
}
