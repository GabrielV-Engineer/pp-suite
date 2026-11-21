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
const MEETS_DECISIONS = [...['build', 'red', 'green', 'refactor', 'audit', 'slices', 'clarify', 'experience'].map(CYCLE), ARCHITECT('apply-change'), ARCHITECT('ui')];
const ALL_SKILLS = [...['build', 'red', 'green', 'refactor', 'audit', 'slices', 'clarify', 'experience', 'analyze', 'converge', 'prompts', 'session-start'].map(CYCLE),
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

// Found by reading the 9 `fix` slices of the first real project (2026-11-19): a fix slice carried its symptom in free prose, and
// whether its test failed before the fix was checked by hand in only some audits (SL-024). The contract does not change; the text
// the agent follows asks for the same three things every time, and `/pp-check analyze` reads for them.
const text = (file) => readFileSync(file, 'utf8');

test('/pp-plan asks a fix slice for its symptom, a severity and how it was reproduced', () => {
  const slices = text(CYCLE('slices'));
  assert.match(slices, /fix.{0,40}slice/i);
  assert.match(slices, /## Reproduction/);
  for (const level of ['critical', 'high', 'medium', 'low']) assert.match(slices, new RegExp(level));
  assert.match(slices, /not reproduced yet/i, 'an unreproduced bug says so instead of inventing steps');
});

test('/pp-build makes a fix slice start from a test seen failing, and says how it was seen in the audit', () => {
  const build = text(CYCLE('build'));
  assert.match(build, /\*\*A `fix` slice starts from the bug\.\*\*/);
  assert.match(build, /watch it fail/i);
  assert.match(build, /deviations/);
  assert.match(build, /not reproduced yet/i, 'it stops and asks when the bug cannot be reproduced');
});

test('/pp-check analyze reads fix slices for the same block', () => {
  assert.match(text(CYCLE('analyze')), /\*\*Fix slice without a reproduction\.\*\*/);
});

// Decided 2026-11-19 (issues #3 and #4, delegated by the owner).
// #3 (F-H2): a proposal the person accepted in the interview is asked, not an addition, so it is not flagged; but the hand-off names them
// in its report, because the interview showed no cost and the person can still ask to review one.
test('the hand-off treats an accepted interview proposal as asked, and names those in its report', () => {
  const handoff = text(ARCHITECT('handoff'));
  assert.match(handoff, /accepted in the interview/i);
  assert.match(handoff, /counts? as asked/i);
  assert.match(handoff, /treated as asked/i, 'the report lists them');
});

// #4 (F-S1): T06 stays. A capability a later phase builds is planned too: a slice stays `planned` until a person approves it, and T06 asks only
// that a live slice exists. No field to defer a capability: it would weaken "no requirement without a slice" for one project's complaint.
test('/pp-plan says to plan every capability and approve only the ones to build now', () => {
  const slices = text(CYCLE('slices'));
  assert.match(slices, /plan every\s+capability/i);
  assert.match(slices, /stays `planned`/);
  assert.match(slices, /`T06`/);
});

// Issue #2 (F-H1): the hand-off was told to "carry over the risks" without being told where. Both real runs wrote a `## Risks` section in
// architecture.md on their own. The prompt now names it and asks for a count in the report, so a dropped risk is visible. No rule: nothing
// in the contract has a field for risks, and 50 of 63 rules never fired in the first real project.
test('the hand-off puts every risk in architecture.md under "## Risks" and counts them in its report', () => {
  const handoff = text(ARCHITECT('handoff'));
  assert.match(handoff, /## Risks/);
  assert.match(handoff, /every (row|risk)/i);
  assert.match(handoff, /how many risks.{0,80}(blueprint|lists)/is);
});

test('both real hand-off runs kept their risks in architecture.md under "## Risks", which is what the prompt now asks', () => {
  for (const run of ['handoff-output', 'handoff-output-run3']) {
    assert.match(text(`${SUITE}architect-pp/fixtures/${run}/.architect/architecture.md`), /^## Risks$/m, run);
  }
});
