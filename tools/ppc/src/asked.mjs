// `ppc asked`: how the person's side of the flow went, in numbers, from the panel answers (`.sddpp/answers.jsonl`, git-ignored) and the
// slices. It reads and prints; nothing is written, and nothing leaves the machine. Its first use is pp-suite's own: the baseline that says
// whether the inbox and the "Why:" line change anything (first real project, 2026-11-23). Pure over the model and the parsed lines.

import { pendingGlances } from './glance.mjs';
import { localDay } from './inbox.mjs';

const daysBetween = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

/** The numbers. `entries` are the lines of the answers file, parsed (anything else is skipped); `today` is the person's local day. */
export function askedReport(model, entries, { today = localDay() } = {}) {
  const lines = entries.filter((e) => e && typeof e === 'object');
  const used = new Set(lines.filter((e) => typeof e.consumed === 'string').map((e) => e.consumed));
  const answers = lines.filter((e) => typeof e.id === 'string' && typeof e.at === 'number');
  const withCommand = answers.filter((e) => typeof e.command === 'string');
  const since = answers.length ? localDay(new Date(Math.min(...answers.map((e) => e.at)) * 1000)) : null;
  const panel = {
    answers: answers.length,
    carried_out: withCommand.filter((e) => used.has(e.id)).length,
    chose_a_command_not_carried_out: withCommand.filter((e) => !used.has(e.id)).length,
    option_without_command: answers.filter((e) => e.kind === 'option').length,
    own_words: answers.filter((e) => e.kind === 'own-words').length,
    unknown: answers.filter((e) => e.kind === 'unknown').length,
    since,
  };
  const own_words = answers.filter((e) => e.kind === 'own-words').map((e) => String(e.question ?? '').slice(0, 120)).slice(-5);

  const slicesData = model.slices.map((s) => s.data);
  const closed = slicesData.filter((s) => s.status === 'done' && s.closed_on);
  // the same window for both: from the later of the first answer and the first dated close (slices closed before `closed_on` existed have none)
  const firstClose = closed.map((s) => String(s.closed_on)).sort()[0];
  const from = since && firstClose ? (since > firstClose ? since : firstClose) : null;
  const closedSince = from ? closed.filter((s) => String(s.closed_on) >= from).length : 0;
  const answersSince = from ? answers.filter((e) => localDay(new Date(e.at * 1000)) >= from).length : 0;
  const slices = { from, closed_since: closedSince, answers_since: answersSince, answers_per_closed_slice: closedSince ? Math.round((answersSince / closedSince) * 10) / 10 : null };

  const looked = closed.filter((s) => s.glanced_by && !s.glance_skipped);
  const glances = {
    looked: looked.length,
    skipped: closed.filter((s) => s.glance_skipped).length,
    waiting: pendingGlances(model).map((s) => ({ id: s.id, days: daysBetween(String(s.closed_on), today) })),
    days_to_look: (() => {
      const days = looked.filter((s) => s.glanced_on).map((s) => daysBetween(String(s.closed_on), String(s.glanced_on)));
      return days.length ? { median: median(days), max: Math.max(...days) } : null;
    })(),
  };

  const budget = model.blueprint?.data.budgets?.max_slice_production_lines;
  const audited = slicesData.filter((s) => s.status === 'done' && s.audit);
  const budgetPart = {
    budget,
    closed: audited.length,
    over: audited.filter((s) => s.audit.production_lines > budget).map((s) => s.id),
    estimated: audited.filter((s) => s.estimate).map((s) => ({ id: s.id, estimate: s.estimate.production_lines, measured: s.audit.production_lines })),
  };
  return { panel, own_words, slices, glances, budget: budgetPart };
}

/** The report as text, one number a line, with what it cannot see. */
export function renderAsked(r) {
  const out = ['How the person\'s side went (read from this machine; nothing here leaves this machine, and nothing was written)', ''];
  const p = r.panel;
  if (!p.answers) out.push('No panel answers are recorded (.sddpp/answers.jsonl is missing or empty).');
  else {
    out.push(`${p.answers} panel answers since ${p.since}:`,
      `  ${p.carried_out} chose a command the guard then let through`,
      `  ${p.chose_a_command_not_carried_out} chose a command the guard never matched (run another way, after it expired, or not at all)`,
      `  ${p.option_without_command} chose an option that carries out nothing (not yet, no)`,
      `  ${p.own_words} in the person's own words (Other): the question did not hold the answer`,
      ...(p.unknown ? [`  ${p.unknown} whose kind the recorder could not tell (the panel sent no options)`] : []));
    if (r.own_words.length) out.push('  Answered in their own words (the last ones):', ...r.own_words.map((q) => `    - ${q}`));
    if (r.slices.answers_per_closed_slice !== null) out.push(`  ${r.slices.answers_per_closed_slice} answers per closed slice (${r.slices.answers_since} answers and ${r.slices.closed_since} closes since ${r.slices.from}; a close is dated only since pp-suite kept the day)`);
    out.push('  Answers recorded before the recorder noted the others (pp-suite, 2026-11-23) name a command only: older "not yet" and own words are not counted.');
  }
  const g = r.glances;
  out.push('', `Glances: ${g.looked} looked, ${g.skipped} skipped, ${g.waiting.length} waiting${g.days_to_look ? `; a look took ${g.days_to_look.median} days (median), ${g.days_to_look.max} at most` : ''}`);
  for (const w of g.waiting) out.push(`  ${w.id}: waiting ${w.days} day${w.days === 1 ? '' : 's'}`);
  const b = r.budget;
  out.push('', `Budget (${b.budget} production lines): ${b.over.length} of ${b.closed} closed slices went over${b.over.length ? ` (${b.over.join(', ')})` : ''}`);
  if (b.estimated.length) out.push(...b.estimated.map((e) => `  ${e.id}: estimated ${e.estimate}, measured ${e.measured}`));
  else out.push('  No closed slice carries an estimate yet.');
  return `${out.join('\n')}\n`;
}
