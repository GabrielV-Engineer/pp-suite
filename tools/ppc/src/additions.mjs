// Pure helpers over the plain list of additions (`.architect/additions.yaml`). The decision command and the report both
// use them, so what `ppc additions` says can be accepted at once is exactly what `--accept-recommended` accepts.

const isPending = (a) => a.decision === 'pending';

/** The undecided additions that overlap `start`, in either direction and through other additions; `start` first. */
export function overlapGroup(additions, start) {
  const byId = new Map(additions.map((a) => [a.id, a]));
  const seen = new Set([start]);
  const queue = [start];
  while (queue.length) {
    const current = queue.shift();
    const links = new Set(byId.get(current)?.overlaps ?? []);
    for (const a of additions) if ((a.overlaps ?? []).includes(current)) links.add(a.id);
    for (const other of links) {
      if (byId.has(other) && isPending(byId.get(other)) && !seen.has(other)) {
        seen.add(other);
        queue.push(other);
      }
    }
  }
  return [...seen];
}

/**
 * Splits the undecided additions into groups of overlapping ones. A group is `settled` when every member was
 * recommended the same way, cut or keep; otherwise it `needsPerson`, because the recommendations disagree or ask the
 * person to decide.
 */
export function triage(additions) {
  const byId = new Map(additions.map((a) => [a.id, a]));
  const settled = [];
  const needsPerson = [];
  const done = new Set();
  for (const a of additions.filter(isPending)) {
    if (done.has(a.id)) continue;
    const ids = overlapGroup(additions, a.id);
    ids.forEach((id) => done.add(id));
    const actions = new Set(ids.map((id) => byId.get(id).recommendation.action));
    const [action] = actions;
    if (actions.size === 1 && (action === 'cut' || action === 'keep')) settled.push({ ids, action });
    else needsPerson.push({ ids, why: actions.size > 1 ? 'recommended differently' : 'recommended for the person to decide' });
  }
  return { settled, needsPerson };
}

// ── reading them: the report behind `ppc additions` ──────────────

const ORIGIN = {
  not_requested: 'you did not ask for this',
  stronger_than_asked: 'a stronger version of what you asked for',
  tool_added: 'added by the tool, not something you would see',
  implied_by_request: 'follows from something you asked for',
};
const EFFORT = { easy: 'easy to add later', needs_migration: 'needs a migration to add later', needs_redesign: 'needs a redesign to add later' };

const row = (label, text) => `      ${`${label}:`.padEnd(13)}${text}`;

function card(a) {
  const lines = [`    ${a.id}  ${a.what}`, row('Origin', ORIGIN[a.origin] ?? a.origin), row('Costs', a.cost), row('If cut', a.if_cut)];
  if (a.later) lines.push(row('Later', `${EFFORT[a.later.effort] ?? a.later.effort}; revisit when: ${a.later.revisit_when}`));
  lines.push(row('Recommended', `${a.recommendation.action} — ${a.recommendation.reason}`));
  return lines.join('\n');
}

/**
 * The additions in plain words: what needs the person first, then what a recommendation settles, then what is decided.
 * The split is the one `--accept-recommended` uses, so the report cannot promise more than the command does.
 */
export function renderAdditions(additions) {
  const byId = new Map(additions.map((a) => [a.id, a]));
  const decided = additions.filter((a) => !isPending(a));
  const { settled, needsPerson } = triage(additions);
  const out = [];

  if (!additions.some(isPending)) out.push('Every addition is decided.', '');
  else {
    const count = (groups) => groups.reduce((n, g) => n + g.ids.length, 0);
    out.push(`${additions.length} additions: ${count(settled)} settled by a recommendation, ${count(needsPerson)} need you${decided.length ? `, ${decided.length} already decided` : ''}.`, '');
  }

  if (needsPerson.length) {
    out.push(`NEED YOU (${needsPerson.reduce((n, g) => n + g.ids.length, 0)})`);
    for (const { ids, why } of needsPerson) {
      out.push(ids.length > 1 ? `  ${ids.join(', ')}  overlap, so decided together; ${why}` : `  ${ids[0]}  ${why}`);
      out.push(...ids.map((id) => card(byId.get(id))), '');
    }
  }
  for (const [action, title] of [['cut', 'RECOMMENDED: CUT'], ['keep', 'RECOMMENDED: KEEP']]) {
    const ids = settled.filter((g) => g.action === action).flatMap((g) => g.ids);
    if (!ids.length) continue;
    out.push(`${title} (${ids.length})`, ...ids.map((id) => card(byId.get(id))), '');
  }
  if (decided.length) {
    out.push(`DECIDED (${decided.length})`);
    for (const a of decided) out.push(`  ${a.id}  ${a.decision}${a.reason ? `  ${a.reason}` : ''}`);
    out.push('');
  }

  if (additions.some(isPending)) {
    out.push(
      'To settle it in one command (the recommended ones, plus what you name):',
      '  ppc decide-addition --accept-recommended --but-cut <ids> --but-keep <ids> --reason "<why>"',
      '  (--reason is needed only for what you keep.) Or tell your assistant which to cut or keep, and it runs it.',
    );
  } else if (decided.some((a) => a.decision === 'cut')) {
    out.push('Next: if the cuts are not applied to the design yet, run /pp-design cuts; then write the rules with `ppc constitution`.');
  } else {
    out.push('Next: write the rules with `ppc constitution`, then plan the slices (/pp-plan).');
  }
  return `${out.join('\n').replace(/\n+$/, '')}\n`;
}
