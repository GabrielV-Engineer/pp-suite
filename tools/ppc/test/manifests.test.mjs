import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const SUITE = fileURLToPath(new URL('../../../', import.meta.url));
const dirs = (base) => readdirSync(join(SUITE, base), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => join(base, e.name));
const EXTENSIONS = [...dirs('sdd-pp/extension'), 'architect-pp/extension'];

for (const dir of EXTENSIONS) {
  test(`${dir}: every command in the manifest has its file, a name that starts with the extension id, and a description`, () => {
    assert.ok(existsSync(join(SUITE, dir, 'extension.yml')), `${dir}/extension.yml is missing`);
    const manifest = parse(readFileSync(join(SUITE, dir, 'extension.yml'), 'utf8'));
    const id = manifest.extension.id;
    for (const command of manifest.provides.commands) {
      assert.ok(command.name.startsWith(`speckit.${id}.`), `${command.name} should start with speckit.${id}.`);
      assert.ok(existsSync(join(SUITE, dir, command.file)), `${command.file} is missing`);
      assert.ok(command.description.length >= 10);
    }
  });

  test(`${dir}: every command file in commands/ is registered, so none is shipped by accident or left out`, () => {
    const manifest = parse(readFileSync(join(SUITE, dir, 'extension.yml'), 'utf8'));
    const listed = new Set(manifest.provides.commands.map((c) => c.file));
    const files = existsSync(join(SUITE, dir, 'commands')) ? readdirSync(join(SUITE, dir, 'commands')).map((f) => `commands/${f}`) : [];
    assert.deepEqual([...listed].sort(), files.sort());
  });
}

test('the Architect.PP extension offers the hand-off, the cut-applying step and the change-applying step', () => {
  const manifest = parse(readFileSync(join(SUITE, 'architect-pp/extension/extension.yml'), 'utf8'));
  assert.deepEqual(manifest.provides.commands.map((c) => c.name).sort(), ['speckit.architect-pp.apply-change', 'speckit.architect-pp.apply-cuts', 'speckit.architect-pp.handoff']);
});

// ── the three reviews that replace Spec Kit's clarify, analyze and converge ─────
const cycle = (name) => readFileSync(join(SUITE, 'sdd-pp/extension/sddpp-cycle/commands', `${name}.md`), 'utf8');
const manifestCommands = () => parse(readFileSync(join(SUITE, 'sdd-pp/extension/sddpp-cycle/extension.yml'), 'utf8')).provides.commands.map((c) => c.name);

test('the cycle extension offers clarify, analyze and converge, adapted to slices and the design', () => {
  for (const name of ['clarify', 'analyze', 'converge']) assert.ok(manifestCommands().includes(`speckit.sddpp-cycle.${name}`), name);
});

test('analyze and converge only read: they say so, and tell the agent not to edit files or approve', () => {
  for (const name of ['analyze', 'converge']) {
    const text = cycle(name);
    assert.match(text, /read-only/i, name);
    assert.match(text, /never (edit|modify|write|change)/i, name);
    assert.match(text, /ppc/, `${name} starts from what ppc already checks`);
  }
});

test('clarify writes answers only where the owner allows: planned slices directly, the design through a change request', () => {
  const text = cycle('clarify');
  assert.match(text, /planned/);
  assert.match(text, /ppc change-request/);
  assert.match(text, /The design \(`\.architect\/`\) is Architect\.PP's: \*\*never edit it\*\*/);
  assert.match(text, /5 questions|five questions/i);
  assert.match(text, /one (question )?at a time/i);
});

test('analyze looks for what the validator cannot: contradictions in prose, vague criteria, drift between slices and the design', () => {
  const text = cycle('analyze');
  for (const phrase of [/non-goal/i, /contradict/i, /vague|ambig/i, /terminology|glossary|names/i, /does not repeat|already checks|do not repeat/i]) assert.match(text, phrase, String(phrase));
});

test('converge classifies code against the slice as missing, partial, contradicts or unrequested', () => {
  const text = cycle('converge');
  for (const kind of ['missing', 'partial', 'contradicts', 'unrequested']) assert.match(text, new RegExp(`\`${kind}\``), kind);
  assert.match(text, /out of scope/i);
  assert.match(text, /file:line|file and line/i);
});
