// The inbox: what waits for a person's look and holds nothing up (glances, reviews of a whole, outside tests, tool roles), listed
// oldest first and put to the person several at a time. Found in the first real project: one line per item, each saying "it holds
// nothing up", piled up beside the work (eight glances from SL-047 on, none answered). Pure over the loaded model.

import { nextSteps, inboxOf, inboxSummary } from './next.mjs';
import { askFor } from './decisions.mjs';

/** The question panel takes at most this many questions in one call. */
export const INBOX_PANEL = 4;

// what each kind asks of the person, and where they read it first
const ACTION = {
  glance: (a) => `look at what it built, as a user would meet it (ppc show ${a.decision.id})`,
  review: (a) => `review it as a whole; choose how (ppc show ${a.decision.id})`,
  outside: (a) => `have someone other than you try it, or skip it (ppc show ${a.decision.id})`,
  tools: (a) => `decide a tool for ${a.roles.join(', ')}, or that none is needed: /pp-tools proposes from what you have, then ppc ask tools`,
  tool: (a) => `decide the ${a.decision.id} tool again (ppc tools)`,
};
// the kinds a panel can ask as they are; a tool role needs a proposal first (/pp-tools)
const ASKABLE = new Set(['glance', 'review', 'outside']);

/** The person's local day, as YYYY-MM-DD. */
export function localDay(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const daysBetween = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);

function waited(since, today) {
  if (!since) return '';
  const days = daysBetween(since, today);
  return days <= 0 ? ', since today' : `, waiting ${days} day${days === 1 ? '' : 's'}`;
}

/** The inbox as text: one line per item, oldest first, and how to answer several at once. */
export function renderInbox(items, { today = localDay() } = {}) {
  if (!items.length) return 'Nothing waits for your look.\n';
  const id = (a) => a.decision.id ?? a.decision.type;
  const title = (a) => /"[^"]*"/.exec(a.what)?.[0];
  const out = [`${items.length} ${items.length === 1 ? 'thing waits' : 'things wait'} for your look (${inboxSummary(items)}). None holds the work up; answer when you have time.`, ''];
  for (const a of items) out.push(`  ${id(a)}${title(a) ? ` ${title(a)}` : ''}${waited(a.since, today)}: ${ACTION[a.decision.type](a)}`);
  const askable = items.filter((a) => ASKABLE.has(a.decision.type)).length;
  if (askable) out.push('', `To answer up to ${INBOX_PANEL} in one question panel, oldest first: ppc ask inbox${askable > INBOX_PANEL ? ` (${askable - INBOX_PANEL} more after that)` : ''}`);
  return `${out.join('\n')}\n`;
}

/** Up to INBOX_PANEL questions for one panel call, oldest first, each the item's own question; null when there is nothing to ask. */
export function askInbox(model) {
  const askable = inboxOf(nextSteps(model, [], [])).filter((a) => ASKABLE.has(a.decision.type));
  const questions = [];
  for (const a of askable) {
    if (questions.length === INBOX_PANEL) break;
    const asked = askFor(model, a.decision.id);
    if (asked) questions.push({ ...asked.questions[0], header: a.decision.id.slice(0, 12) });
  }
  if (!questions.length) return null;
  return { questions, remaining: askable.length - questions.length };
}
