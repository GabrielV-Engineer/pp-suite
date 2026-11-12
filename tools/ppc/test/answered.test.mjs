import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { loadProject } from '../src/load.mjs';
import { nextSteps, nextJson, renderNext } from '../src/next.mjs';
import { panelAnswers, sessionContext } from '../src/session.mjs';
import { approve } from '../src/lifecycle.mjs';
import { CLI, repo } from './helpers.mjs';

// Found in the first real project (F-L1): the owner answered two debt questions in the panel, the session ended before the commands
// ran, and the answers expired after 30 minutes without anyone knowing. ppc next now says so, and /pp acts on it.
const NOW = 1_800_000_000;
const answer = (command, minutesAgo, id = `toolu_${command.length}_${minutesAgo}#0`) => ({ id, at: NOW - minutesAgo * 60, session_id: 'S', tool_use_id: id.split('#')[0], question: 'Q?', label: `Pay it later — ${command}`, command });
const ledger = (lines) => `${lines.map((l) => JSON.stringify(l)).join('\n')}\n`;

test('next: a panel answer for a decision still waiting is listed, fresh while it can still run, expired after 30 minutes', (t) => {
  const m = loadProject(repo(t).dir);
  const fresh = nextSteps(m, [], [], { answers: [answer('ppc approve DEBT-BE-001', 10)], now: NOW });
  assert.deepEqual(fresh.answered.map((a) => [a.decision.id, a.command, a.fresh]), [['DEBT-BE-001', 'ppc approve DEBT-BE-001', true]]);
  const old = nextSteps(m, [], [], { answers: [answer('ppc approve DEBT-BE-001', 40)], now: NOW });
  assert.equal(old.answered[0].fresh, false);
});

test('next: an answer whose command carries a quoted reason matches its decision', (t) => {
  const m = loadProject(repo(t).dir);
  const r = nextSteps(m, [], [], { answers: [answer('ppc approve DEBT-BE-001 --accept accepted in the panel', 5)], now: NOW });
  assert.equal(r.answered[0]?.decision.id, 'DEBT-BE-001');
});

test('next: an answer for something no longer waiting, or for no decision at all, is not listed', (t) => {
  const r = repo(t);
  approve(r.dir, 'DEBT-BE-001', { by: 'owner' });
  const m = loadProject(r.dir);
  const out = nextSteps(m, [], [], { answers: [answer('ppc approve DEBT-BE-001', 5), answer('ppc approve SL-099', 5)], now: NOW });
  assert.deepEqual(out.answered, []);
  assert.deepEqual(nextSteps(m, []).answered, [], 'and nothing without a ledger');
});

test('next: the text and the JSON both say it, with the time and what to do', (t) => {
  const m = loadProject(repo(t).dir);
  const r = nextSteps(m, [], [], { answers: [answer('ppc approve DEBT-BE-001', 40)], now: NOW });
  const text = renderNext(r);
  assert.match(text, /Answered in the panel but not carried out/);
  assert.match(text, /DEBT-BE-001/);
  assert.match(text, /ask again/i);
  const json = nextJson(r);
  assert.deepEqual(json.answered.map((a) => [a.decision.id, a.fresh, a.label]), [['DEBT-BE-001', false, 'Pay it later — ppc approve DEBT-BE-001']]);
});

test('panelAnswers: reads the ledger, leaves out the answers already used and the lines it cannot read', (t) => {
  const r = repo(t);
  const used = answer('ppc approve SL-001', 1, 'toolu_A#0');
  const unused = answer('ppc approve DEBT-BE-001', 1, 'toolu_B#0');
  r.write({ '.sddpp/answers.jsonl': ledger([used, unused, { consumed: 'toolu_A#0', by: 'toolu_x', at: NOW }]) + 'not json\n' });
  assert.deepEqual(panelAnswers(r.dir).map((a) => a.id), ['toolu_B#0']);
  assert.deepEqual(panelAnswers(join(r.dir, 'nowhere')), []);
});

test('CLI: ppc next --json lists the answer that was not carried out', (t) => {
  const r = repo(t);
  r.write({ '.sddpp/answers.jsonl': ledger([{ ...answer('ppc approve DEBT-BE-001', 0, 'toolu_C#0'), at: Date.now() / 1000 - 60 }]) });
  const out = JSON.parse(spawnSync('node', [CLI, 'next', '--json'], { cwd: r.dir, encoding: 'utf8' }).stdout);
  assert.deepEqual(out.answered.map((a) => [a.decision.id, a.fresh]), [['DEBT-BE-001', true]]);
});

test('session: the hook at the start of a session says it too, so the next session knows', (t) => {
  const r = repo(t);
  r.write({ '.sddpp/answers.jsonl': ledger([{ ...answer('ppc approve DEBT-BE-001', 0, 'toolu_D#0'), at: Date.now() / 1000 - 3600 }]) });
  assert.match(sessionContext(r.dir), /Answered in the panel but not carried out[\s\S]*DEBT-BE-001[\s\S]*expired: ask again/);
});
