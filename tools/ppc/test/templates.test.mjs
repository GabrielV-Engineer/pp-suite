import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const AUDIT = fileURLToPath(new URL('../../../sdd-pp/extension/sddpp-cycle/commands/audit.md', import.meta.url));

// Found in the first real project (F-D6): the debt template wrote `cost_of_delay: { level: low, rationale: <why> }` and a rationale with a
// comma split the mapping into a new key, which the schema then refused; a title with ": " would have broken the file the same way.
test('the debt entry template survives free text with commas, colons, hashes, quotes and braces', () => {
  const block = readFileSync(AUDIT, 'utf8').match(/```yaml\n([\s\S]*?)```/)?.[1];
  assert.ok(block, 'audit.md has a yaml template for a debt entry');
  const text = "it wraps: one, two # three 'four' {five} [six]";
  // the template shows where the text goes; the agent puts it between the quotes it finds there
  const filled = block.replace('<today, YYYY-MM-DD>', '2026-01-01').replace('<slice id>', 'SL-001').replace(/<[^>\n]+>/g, text);
  const entry = parse(filled)[0];
  for (const [field, value] of [['title', entry.title], ['description', entry.description], ['trigger', entry.trigger], ['rationale', entry.cost_of_delay?.rationale]]) {
    assert.equal(value, text, `${field} keeps the text as written`);
  }
  assert.deepEqual(Object.keys(entry.cost_of_delay).sort(), ['level', 'rationale'], 'the mapping has no extra keys');
});

test('the template tells the agent to quote free text', () => {
  assert.match(readFileSync(AUDIT, 'utf8'), /double quotes/i);
});

// Found in the first real project: three times the agent told the person to type `ppc decide-change` or `ppc approve` "in VS Code's
// terminal", because only /pp knew how to ask in the question panel. Every skill that can meet a decision now carries the same text.
const SUITE = fileURLToPath(new URL('../../../', import.meta.url));
const DECIDES = readFileSync(`${SUITE}sdd-pp/shared/when-the-person-decides.md`, 'utf8').trim();
const CYCLE = (name) => `${SUITE}sdd-pp/extension/sddpp-cycle/commands/${name}.md`;
const ARCHITECT = (name) => `${SUITE}architect-pp/extension/commands/${name}.md`;
const MEETS_DECISIONS = [...['build', 'red', 'green', 'refactor', 'audit', 'slices', 'clarify'].map(CYCLE), ARCHITECT('apply-change'), ARCHITECT('ui')];
const ALL_SKILLS = [...['build', 'red', 'green', 'refactor', 'audit', 'slices', 'clarify', 'analyze', 'converge', 'prompts', 'session-start'].map(CYCLE),
  ...['handoff', 'apply-cuts', 'apply-change', 'ui'].map(ARCHITECT), `${SUITE}sdd-pp/skills/pp/SKILL.md`];

test('every skill that can meet a decision says how to put it to the person, in the same words', () => {
  for (const file of MEETS_DECISIONS) assert.ok(readFileSync(file, 'utf8').includes(DECIDES), `${file} carries "When the person decides" verbatim`);
});

test('no skill sends the person to a terminal to approve or decide', () => {
  for (const file of ALL_SKILLS) {
    const text = readFileSync(file, 'utf8').replace(DECIDES, '');
    assert.doesNotMatch(text, /terminal/i, `${file} mentions a terminal`);
    assert.doesNotMatch(text, /prefix it with/i, `${file} tells the person to prefix a command`);
    assert.doesNotMatch(text, /`ppc (approve|approve-slice|approve-red|approve-debt|decide-change|reread)[^`]*--by <[^>]+>`/, `${file} gives the person an approval command to type`);
  }
});

// The owner's decision (2026-11-12): /pp goes on by itself until the next decision is the person's, instead of one step per /pp.
const PP = () => readFileSync(`${SUITE}sdd-pp/skills/pp/SKILL.md`, 'utf8');
test('/pp keeps going through the agent steps and stops only for the person, a failure, a closed slice or nothing left', () => {
  const text = PP();
  assert.doesNotMatch(text, /Never chain two/i, 'the old one-step rule is gone');
  assert.match(text, /go back to step 1/i);
  for (const stop of [/decision is the person's/i, /fails|refuses/i, /slice (was )?closed|closes a slice/i, /`none`/]) assert.match(text, stop);
  assert.match(text, /two lines/i, 'it ends with a short summary');
});

test('no skill stops the run to offer the prompts for the next task', () => {
  for (const file of ALL_SKILLS.filter((f) => !f.endsWith('/prompts.md'))) {
    assert.doesNotMatch(readFileSync(file, 'utf8'), /whether they want the prompts/i, file);
  }
});

// F-L1: an answer the person gave in the panel and nothing ran. /pp runs it while it is valid, and otherwise asks again, saying so.
test('/pp acts on panel answers that were not carried out, and every skill runs the chosen command at once', () => {
  const text = PP();
  assert.match(text, /`answered`/);
  assert.match(text, /`fresh`/);
  assert.match(text, /ask that decision again/i);
  assert.match(DECIDES, /right away/i);
});
