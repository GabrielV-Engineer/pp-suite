import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// How a project handles security, observability, git and CI (`.sddpp/standards.yaml`). pp-suite does not prescribe the
// answer: it makes sure each one is asked, recorded, and read by the rest of the flow. See docs/standards.md.

/** The fixed list. `product` standards also belong in the design, as a quality attribute of kind `attribute` (rule S03). */
export const STANDARDS = [
  {
    id: 'security',
    title: 'Security',
    product: true,
    attribute: 'security',
    components: ['backend', 'database'],
    choices: {
      basic: 'Secrets stay out of the repository, input from outside is validated, and dependencies are checked for known vulnerabilities',
      strict: 'Basic, plus a threat model for each component that handles data, authentication and permissions reviewed in every audit, and security tests',
    },
  },
  {
    id: 'observability',
    title: 'Observability',
    product: true,
    attribute: 'operability',
    components: ['backend', 'infra'],
    choices: {
      errors: 'Errors are logged with enough context to find their cause',
      'logs-metrics': 'Structured logs, plus basic metrics: requests, failures and how long they take',
    },
  },
  {
    id: 'git',
    title: 'Git and pull requests',
    product: false,
    choices: {
      trunk: 'Commit straight to the main branch',
      'branch-per-slice': 'One branch per slice (slice/<id>), merged with a merge commit or a fast-forward; never squashed, so ppc check-git still finds each commit',
      'branch-per-slice-pr': 'One branch per slice, merged through a pull request whose description is the slice\'s audit; never squashed',
    },
  },
  {
    id: 'ci',
    title: 'CI',
    product: false,
    choices: {
      local: 'No CI: ppc validate --strict and ppc check-git are run by hand before a slice closes',
      github: 'A GitHub Actions workflow runs ppc validate --strict and ppc check-git on every push',
      gitlab: 'A GitLab CI pipeline runs ppc validate --strict and ppc check-git on every push',
    },
  },
  {
    id: 'experience',
    title: 'Experience',
    product: true,
    attribute: 'usability',
    components: ['frontend', 'backend', 'library'],
    choices: {
      glance: 'After a slice, a person looks at what a user would meet (screens, command output, error messages) next to the captures the audit records; it never holds the slice up',
      review: 'Glance, plus a review of the whole against a short rubric when a capability is complete or when asked, where a fresh agent session proposes each finding as debt and the person decides on it',
      external: 'Review, plus a guide for someone other than the builder to try it, where the person decides who and whether, and skipping it blocks nothing',
    },
  },
];
export const BY_ID = new Map(STANDARDS.map((s) => [s.id, s]));
export const CUSTOM = 'custom';

export const TRIGGERS = {
  git_remote: 'the repository gets a remote',
  ci_config: 'a CI configuration appears (.github/workflows or .gitlab-ci.yml)',
  backend_component: 'the design gets a backend component',
  database_component: 'the design gets a database component',
  infra_component: 'the design gets an infra component',
};

/** Whether `choice` is valid for the standard: one of its own, or custom. */
export const validChoice = (id, choice) => choice === CUSTOM || Object.hasOwn(BY_ID.get(id)?.choices ?? {}, choice);
/** Product standards may be not needed; every project uses git and runs its checks somewhere. */
export const mayBeNotNeeded = (id) => BY_ID.get(id)?.product === true;

/** What the project's own files say, for the triggers and the recommendations. Reads git; never throws. */
export function projectFacts(root) {
  let gitRemote = null;
  try {
    const remotes = execFileSync('git', ['remote', '-v'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    gitRemote = remotes.split('\n').find(Boolean)?.split(/\s+/)[1] ?? null;
  } catch {
    // not a git repository
  }
  const ciConfig = [];
  const workflows = join(root, '.github/workflows');
  if (existsSync(workflows) && readdirSync(workflows).some((f) => /\.ya?ml$/.test(f))) ciConfig.push('.github/workflows');
  if (existsSync(join(root, '.gitlab-ci.yml'))) ciConfig.push('.gitlab-ci.yml');
  return { gitRemote, ciConfig };
}

const kinds = (bp) => new Set((bp?.components ?? []).map((c) => c.kind));

/** Whether a trigger has happened, from the design and the facts. */
export function triggerFired(trigger, bp, facts = {}) {
  if (trigger === 'git_remote') return Boolean(facts.gitRemote);
  if (trigger === 'ci_config') return (facts.ciConfig ?? []).length > 0;
  const kind = /^(backend|database|infra)_component$/.exec(trigger)?.[1];
  return Boolean(kind && kinds(bp).has(kind));
}

const host = (remote) => (/github\.com/i.test(remote ?? '') ? 'github' : /gitlab/i.test(remote ?? '') ? 'gitlab' : null);

/** The recommended answer for each standard, with the reason, from the design and the repository. */
export function recommend(bp, facts = {}) {
  const has = kinds(bp);
  const named = (list) => list.filter((k) => has.has(k)).join(' and ');
  const security = has.has('backend') || has.has('database')
    ? { decision: 'adopt', choice: 'basic', why: `The design has a ${named(['backend', 'database'])} component: data crosses a boundary or is stored` }
    : { decision: 'not_needed', reason: 'The design has no backend and no database component', why: 'The design has no backend and no database component: nothing stores data or takes it from outside' };
  const observability = has.has('backend') || has.has('infra')
    ? { decision: 'adopt', choice: 'errors', why: `The design has a ${named(['backend', 'infra'])} component: something runs where a failure is not seen` }
    : { decision: 'not_needed', reason: 'The design has no backend and no infra component', why: 'The design has no backend and no infra component: failures show where the person is looking' };
  const git = { decision: 'adopt', choice: 'trunk', why: 'The simplest, and the way ppc check-git was tried on a real project; choose a branch per slice if more than one person works on it' };
  const platform = host(facts.gitRemote);
  const ci = platform
    ? { decision: 'adopt', choice: platform, why: `The remote is on ${platform === 'github' ? 'GitHub' : 'GitLab'}: a pipeline there runs ppc validate and ppc check-git on every push` }
    : facts.gitRemote
      ? { decision: 'adopt', choice: 'local', why: 'The remote is neither on GitHub nor on GitLab: run the checks by hand, or describe your CI as a custom choice' }
      : { decision: 'later', trigger: 'git_remote', why: 'The repository has no remote yet, and CI needs one: ask again when it gets one' };
  const experience = has.has('frontend')
    ? { decision: 'adopt', choice: 'review', why: 'The design has a frontend component: people meet it on screens, and what the whole looks like matters more than each piece' }
    : has.has('backend') || has.has('library')
      ? { decision: 'adopt', choice: 'glance', why: `The design has a ${named(['backend', 'library'])} component: a person meets it through its API, its output or its errors` }
      : { decision: 'not_needed', reason: 'The design has no frontend, backend or library component', why: 'The design has no frontend, backend or library component: nothing a person uses directly' };
  return { security, observability, git, ci, experience };
}

/** One answer in a few words: "basic", "later: when the repository gets a remote", "not needed: <reason>". */
export function describeAnswer(a) {
  if (!a || a.decision === 'pending') return 'undecided';
  if (a.decision === 'adopt') return a.choice === CUSTOM ? `custom: ${a.details}` : a.choice;
  if (a.decision === 'later') return `later, when ${TRIGGERS[a.trigger] ?? a.trigger}`;
  return `not needed: ${a.reason}`;
}

const row = (label, text) => `    ${`${label}:`.padEnd(15)}${text}`;

/** The standards in plain words: what was decided, or what is recommended and why, and how to decide. */
export function renderStandards(list = [], recommended = {}, { bp, facts, only } = {}) {
  const byId = new Map(list.map((s) => [s.id, s]));
  const out = [];
  const undecided = STANDARDS.filter((s) => !byId.get(s.id) || byId.get(s.id).decision === 'pending');
  if (!only) out.push(undecided.length ? `${STANDARDS.length - undecided.length} of ${STANDARDS.length} standards decided.` : 'Every standard is decided.', '');
  for (const s of STANDARDS.filter((x) => !only || x.id === only)) {
    const own = byId.get(s.id);
    const decided = own && own.decision !== 'pending';
    out.push(`  ${s.id}  ${s.title}`);
    if (decided) {
      out.push(row('Decided', `${describeAnswer(own)} (${own.decided_by}, ${own.decided_on})`));
      if (own.decision === 'adopt' && own.choice !== CUSTOM) out.push(row('Means', s.choices[own.choice]));
      if (s.id === 'experience' && own.decision === 'adopt') {
        out.push(row('Measures with', own.measure_command ?? 'not declared: the quality targets are declared, not measured. To give a command:  ppc ask experience --measure "<command>"'));
        out.push(row('Tools allowed', own.allowed_tools?.length ? own.allowed_tools.join(', ') : 'none authorized. To authorize some:  ppc ask experience --tools "<a,b>"'));
      }
      if (own.decision === 'later' && bp && triggerFired(own.trigger, bp, facts)) out.push(row('Ask again', `${TRIGGERS[own.trigger]} has happened`));
    }
    const r = recommended[s.id];
    if (r && !decided) out.push(row('Recommended', `${describeAnswer(r)} — ${r.why}`));
    out.push(row('Choices', [...Object.keys(s.choices), CUSTOM].join(', ') + `; or later${s.product ? ', or not needed' : ''}`));
    out.push(`    To decide it in the panel:  ppc ask ${s.id}`, '');
  }
  if (!only && undecided.length) out.push('To take every recommendation for what is undecided:  ppc ask standards');
  return `${out.join('\n').replace(/\n+$/, '')}\n`;
}

/**
 * The adopted standards in one line, for the constitution; null when none is adopted. A custom rule is named, not quoted: the
 * block is loaded into every session and stays under 2,000 characters, and the card and `ppc standards` show the person's words.
 */
export function standardsLine(list = []) {
  const adopted = STANDARDS.map((s) => list.find((x) => x.id === s.id)).filter((x) => x?.decision === 'adopt');
  if (!adopted.length) return null;
  return `- Standards (\`ppc standards\` explains them, \`/pp-standards\` changes them): ${adopted.map((a) => `${a.id} ${a.choice}`).join(', ')}. Follow them in every slice.`;
}

/** The adopted standards that apply to a slice touching components of these kinds: [{ id, text }]. */
export function standardsFor(list = [], sliceKinds = new Set()) {
  const out = [];
  for (const s of STANDARDS) {
    const own = list.find((x) => x.id === s.id);
    if (own?.decision !== 'adopt') continue;
    if (s.id === 'git' && own.choice === 'trunk') continue;
    if (s.components && !s.components.some((k) => sliceKinds.has(k))) continue;
    if (!s.components && s.id !== 'git') continue;
    out.push({ id: s.id, text: own.choice === CUSTOM ? `custom: ${own.details}` : `${own.choice}: ${s.choices[own.choice]}` });
  }
  return out;
}
