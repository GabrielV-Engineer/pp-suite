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
    else needsPerson.push({ ids, why: actions.size > 1 ? 'overlapping, and recommended differently' : 'recommended for the person to decide' });
  }
  return { settled, needsPerson };
}
