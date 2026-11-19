import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { SHORT_SKILLS, HOOKS, shortSkills, longSkillNames } from '../src/skills.mjs';

const SUITE = fileURLToPath(new URL('../../../', import.meta.url)).replace(/\/$/, '');
const frontmatter = (text) => parse(text.match(/^---\n([\s\S]*?)\n---\n/)[1]);
const body = (file) => readFileSync(join(SUITE, file), 'utf8').replace(/^---\n[\s\S]*?\n---\n/, '');

// The owner's decision (2026-11-12), option A: short names in the style of Spec Kit (/speckit-specify, -plan, -implement), one per
// phase, instead of /speckit-sddpp-cycle-build and the like.
test('the short commands are the nine of option A', () => {
  assert.deepEqual(shortSkills(SUITE).map((s) => s.name), ['pp-design', 'pp-standards', 'pp-plan', 'pp-build', 'pp-check', 'pp-audit', 'pp-change', 'pp-red', 'pp-green', 'pp-refactor']);
});

test('each short command is a skill whose body is the extension command it stands for, so there is one source', () => {
  for (const skill of shortSkills(SUITE)) {
    const meta = frontmatter(skill.content);
    assert.equal(meta.name, skill.name);
    assert.ok(meta.description.length > 20, `${skill.name} says what it does`);
    for (const part of SHORT_SKILLS.find((s) => s.name === skill.name).parts) {
      assert.ok(skill.content.includes(body(part.file).trim()), `${skill.name} carries ${part.file}`);
    }
  }
});

test('a command that does several things says which part to do, by the word passed or by the state', () => {
  for (const skill of shortSkills(SUITE).filter((s) => SHORT_SKILLS.find((x) => x.name === s.name).parts.length > 1)) {
    const spec = SHORT_SKILLS.find((x) => x.name === skill.name);
    assert.match(skill.content, /^## Which part$/m, skill.name);
    for (const part of spec.parts) assert.ok(skill.content.includes(`\`${part.word}\``), `${skill.name} names the word ${part.word}`);
    assert.match(frontmatter(skill.content)['argument-hint'], new RegExp(spec.parts.map((p) => p.word).join(' \\| ')));
  }
});

test('no short command names a long one: they point at each other by the short names', () => {
  for (const skill of shortSkills(SUITE)) assert.doesNotMatch(skill.content, /speckit-(sddpp|architect)/, skill.name);
});

test('every command of the extensions is in exactly one short command, except the hooks, which are in none', () => {
  const long = longSkillNames(SUITE);
  assert.ok(long.includes('speckit-sddpp-cycle-build') && long.includes('speckit-architect-pp-handoff') && long.includes('speckit-sddpp-guard-pre-tool'));
  const covered = SHORT_SKILLS.flatMap((s) => s.parts.map((p) => p.command));
  for (const name of long) {
    const hook = HOOKS.includes(name);
    assert.equal(covered.filter((c) => c === name).length, hook ? 0 : 1, name);
  }
  assert.equal(new Set(covered).size, covered.length);
});

// /pp runs the skill that `ppc next --json` names with the Skill tool, which takes a name without the slash and the arguments apart.
test('next --json names the skill without the slash, and passes the words after it as args', async () => {
  const { nextJson } = await import('../src/next.mjs');
  const step = (command) => nextJson({ headline: 'h', actions: [{ who: 'agent', what: 'x', command }], waiting: [], changes: [], blocked: [] });
  assert.deepEqual([step('/pp-design cuts').skill, step('/pp-design cuts').args], ['pp-design', 'cuts']);
  assert.deepEqual([step('/pp-build').skill, step('/pp-build').args], ['pp-build', null]);
  assert.deepEqual([step('/pp-change CR-0006').skill, step('/pp-change CR-0006').args], ['pp-change', 'CR-0006']);
  const names = shortSkills(SUITE).map((s) => s.name);
  for (const command of ['/pp-build', '/pp-audit', '/pp-red', '/pp-green', '/pp-refactor', '/pp-plan', '/pp-design', '/pp-change']) assert.ok(names.includes(step(command).skill), command);
});
