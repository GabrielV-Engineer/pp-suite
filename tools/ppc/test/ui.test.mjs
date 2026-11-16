import test from 'node:test';
import assert from 'node:assert/strict';
import { loadProject } from '../src/load.mjs';
import { validateModel, designFindings } from '../src/validate.mjs';
import { EXAMPLE } from './helpers.mjs';

// Found in the first real project (F-U1): the hand-off dropped The Architect's design system, the interface was a few lines in
// architecture.md that nothing read, and the navigation arrived after 22 slices. `.architect/ui.md` holds the screens, each tied to
// its capabilities and states, and the mockup a person approved; the U rules check it.

const base = () => loadProject(EXAMPLE);
const found = (m, rule) => validateModel(m).filter((f) => f.rule === rule);
const screen = (m) => m.ui.data.screens[0];
const MOCKUP = '.architect/ui/mockups/SCR-01.html';

test('load: ui.md is read with its frontmatter and body, and every file a screen names is hashed', () => {
  const m = base();
  assert.equal(m.ui.file, '.architect/ui.md');
  assert.equal(screen(m).id, 'SCR-01');
  assert.match(m.ui.body, /^## Navigation$/m);
  assert.match(m.uiFiles[MOCKUP], /^[0-9a-f]{64}$/);
  assert.equal(m.uiFiles[MOCKUP], screen(m).mockup_sha256, 'the example mockup is the one approved');
});

test('U01: a design with a frontend component and no ui.md is flagged, as a warning, and only then', () => {
  const m = base();
  m.ui = null;
  const u01 = found(m, 'U01');
  assert.equal(u01.length, 1);
  assert.equal(u01[0].severity, 'warning');
  assert.match(u01[0].message, /\/pp-design ui/);
  m.blueprint.data.components.find((c) => c.kind === 'frontend').kind = 'other';
  assert.deepEqual(found(m, 'U01'), [], 'no frontend, no interface document needed');
});

test('U02: a capability the design puts in a frontend component needs a screen', () => {
  const m = base();
  screen(m).capabilities = ['CAP-002'];
  const u02 = found(m, 'U02');
  assert.equal(u02.length, 1);
  assert.equal(u02[0].severity, 'error');
  assert.match(u02[0].message, /CAP-001/);
});

test('U03: the body has the sections a builder reads', () => {
  const m = base();
  m.ui.body = m.ui.body.replace(/^## Accessibility$/m, '## Access');
  const u03 = found(m, 'U03');
  assert.equal(u03.length, 1);
  assert.match(u03[0].message, /Accessibility/);
});

test('U04: a screen names only capabilities and files that exist', () => {
  const unknown = base();
  screen(unknown).capabilities.push('CAP-099');
  assert.ok(found(unknown, 'U04').some((f) => /CAP-099/.test(f.message) && f.severity === 'error'));
  const missing = base();
  missing.uiFiles[MOCKUP] = null;
  assert.ok(found(missing, 'U04').some((f) => /SCR-01.*mockup.*does not exist/.test(f.message)));
});

test('U05: a mockup nobody approved, or one changed after its approval, is flagged as a warning', () => {
  const unapproved = base();
  delete screen(unapproved).approved_by;
  delete screen(unapproved).mockup_sha256;
  const u05 = found(unapproved, 'U05');
  assert.equal(u05.length, 1);
  assert.equal(u05[0].severity, 'warning');
  assert.match(u05[0].message, /SCR-01 .*not approved.*ppc ask SCR-01/);
  const changed = base();
  changed.uiFiles[MOCKUP] = '0'.repeat(64);
  assert.match(found(changed, 'U05')[0].message, /SCR-01 .*changed after/);
  const image = base();
  Object.assign(screen(image), { image: '.architect/ui/SCR-01.png', image_sha256: 'a'.repeat(64) });
  image.uiFiles['.architect/ui/SCR-01.png'] = 'b'.repeat(64);
  assert.match(found(image, 'U05')[0].message, /SCR-01 .*image.*changed after/);
});

test('SCHEMA: a screen without states, or an approval without its hash, is malformed', () => {
  const m = base();
  screen(m).states = [];
  assert.ok(validateModel(m).some((f) => f.rule === 'SCHEMA' && f.file === '.architect/ui.md'));
  const half = base();
  delete screen(half).mockup_sha256;
  assert.ok(validateModel(half).some((f) => f.rule === 'SCHEMA' && f.file === '.architect/ui.md'));
});

test('the U rules judge the design, so validate --design reports them', () => {
  const m = base();
  screen(m).capabilities = ['CAP-002'];
  assert.ok(designFindings(validateModel(m)).some((f) => f.rule === 'U02'));
});

// ── approving a screen: a person, in the panel ────────────────────
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { approve, LifecycleError } from '../src/lifecycle.mjs';
import { askFor, renderDecision } from '../src/decisions.mjs';
import { repo, CLI } from './helpers.mjs';

/** The example with SCR-01 not approved yet. */
function unapproved(t) {
  const r = repo(t);
  const text = readFileSync(join(r.dir, '.architect/ui.md'), 'utf8').replace(/^ {4}approved_by: .*\n/m, '').replace(/^ {4}mockup_sha256: .*\n/m, '');
  r.write({ '.architect/ui.md': text });
  r.git('commit', '-q', '-am', 'SCR-01 not approved');
  return r;
}

test('approve SCR-NN: records who approved the mockup and its hash, and U05 goes away', (t) => {
  const r = unapproved(t);
  assert.equal(found(loadProject(r.dir), 'U05').length, 1);
  assert.deepEqual(approve(r.dir, 'SCR-01', { by: 'owner' }), { screen: 'SCR-01', approved_by: 'owner' });
  const s = screen(loadProject(r.dir));
  assert.equal(s.approved_by, 'owner');
  assert.equal(s.mockup_sha256, loadProject(r.dir).uiFiles[MOCKUP]);
  assert.deepEqual(found(loadProject(r.dir), 'U05'), []);
  assert.match(readFileSync(join(r.dir, '.architect/ui.md'), 'utf8'), /^## Navigation$/m, 'the body is kept');
});

test('approve SCR-NN: an unknown screen, a missing mockup, or one already approved as it is, is refused', (t) => {
  const r = repo(t);
  const refused = (id, pattern) => assert.throws(() => approve(r.dir, id, { by: 'owner' }), (e) => e instanceof LifecycleError && pattern.test(e.message), id);
  refused('SCR-09', /unknown screen SCR-09/);
  refused('SCR-01', /already approved/);
  r.write({ [MOCKUP]: '<!doctype html><p>changed</p>\n' });
  assert.deepEqual(approve(r.dir, 'SCR-01', { by: 'owner' }).screen, 'SCR-01', 'a changed mockup can be approved again');
});

test('show and ask SCR-NN: the card links the mockup, and the panel approves it with the exact command', (t) => {
  const r = unapproved(t);
  const m = loadProject(r.dir);
  const card = renderDecision(m, 'SCR-01');
  assert.match(card, /SCR-01 +Tasks/);
  assert.match(card, /Shows: +CAP-001, CAP-002, CAP-003, CAP-004/);
  assert.match(card, /States: +ready, loading, empty, error/);
  assert.match(card, new RegExp(`\\[${MOCKUP}\\]\\(${MOCKUP}\\)`));
  const ask = askFor(m, 'SCR-01');
  assert.match(ask.questions[0].question, /SCR-01 "Tasks"/);
  assert.deepEqual(ask.questions[0].options.filter((o) => o.label.includes(' — ppc ')).map((o) => o.label.split(' — ').at(-1)), [`ppc approve SCR-01 --mockup ${m.uiFiles[MOCKUP].slice(0, 12)}`]);
  assert.equal(askFor(loadProject(repo(t).dir), 'SCR-01'), null, 'an approved, unchanged mockup has nothing to ask');
  const cli = spawnSync('node', [CLI, 'approve', 'SCR-01', '--by', 'owner', r.dir], { encoding: 'utf8' });
  assert.equal(cli.status, 0, cli.stderr);
});

// ── ppc next offers the interface step, and the screens to approve ──
import { nextSteps } from '../src/next.mjs';

test('next: before planning, a design with a frontend and no ui.md is designed first, then its mockups are approved', () => {
  const m = base();
  m.slices = [];
  m.ui = null;
  assert.deepEqual(nextSteps(m, []).actions.map((a) => a.command), ['/pp-design ui']);
  const drawn = base();
  drawn.slices = [];
  delete screen(drawn).approved_by;
  delete screen(drawn).mockup_sha256;
  const action = nextSteps(drawn, []).actions[0];
  assert.deepEqual([action.who, action.command, action.decision], ['human', 'ppc approve SCR-01', { type: 'screen', id: 'SCR-01' }]);
  assert.equal(nextSteps(base(), []).actions.some((a) => a.command === '/pp-design ui'), false, 'an approved interface lets the work go on');
});

test('next: once slices exist, a missing interface or an unapproved mockup waits for the person without stopping the work', () => {
  const missing = base();
  missing.ui = null;
  const steps = nextSteps(missing, []);
  assert.ok(steps.waiting.some((w) => w.command === '/pp-design ui'));
  assert.ok(!steps.actions.some((a) => a.command === '/pp-design ui'), 'the slices go on');
  const changed = base();
  changed.uiFiles[MOCKUP] = '0'.repeat(64);
  assert.ok(nextSteps(changed, []).waiting.some((w) => w.decision?.type === 'screen' && w.decision.id === 'SCR-01'));
});

// ── slices name the screens they build to ──────────────────────────
const sl = (m, id) => m.slices.find((s) => s.data.id === id).data;

test('U06: an unfinished work slice on a frontend component names the screens it builds to, and only screens that exist', () => {
  const none = base();
  delete sl(none, 'SL-002').screens;
  const u06 = found(none, 'U06');
  assert.equal(u06.length, 1);
  assert.equal(u06[0].severity, 'warning');
  assert.match(u06[0].message, /SL-002 .*frontend.*names no screen/);
  const unknown = base();
  sl(unknown, 'SL-002').screens = ['SCR-09'];
  assert.ok(found(unknown, 'U06').some((f) => f.severity === 'error' && /SCR-09/.test(f.message)));
  const done = base();
  delete sl(done, 'SL-002').screens;
  sl(done, 'SL-002').status = 'dropped';
  assert.deepEqual(found(done, 'U06'), [], 'a slice no longer to be built is not asked');
  const backendOnly = base();
  Object.assign(sl(backendOnly, 'SL-002'), { components: ['backend', 'database'] });
  delete sl(backendOnly, 'SL-002').screens;
  assert.deepEqual(found(backendOnly, 'U06'), [], 'a slice that does not touch the interface names no screen');
  const noUi = base();
  noUi.ui = null;
  delete sl(noUi, 'SL-002').screens;
  assert.deepEqual(found(noUi, 'U06'), [], 'without ui.md, U01 says what to do');
});

// Found in the end-to-end trial: before any slice is planned T06 fires for every capability, which is normal at that stage, and
// it stopped the approval of a screen, the step that comes before planning.
test('approve SCR-NN: works before any slice exists, judged on the design alone', (t) => {
  const r = unapproved(t);
  r.git('rm', '-q', '-r', '.sddpp');
  r.git('commit', '-q', '-m', 'no slices yet');
  assert.deepEqual(approve(r.dir, 'SCR-01', { by: 'owner' }), { screen: 'SCR-01', approved_by: 'owner' });
  const broken = unapproved(t);
  broken.write({ '.architect/ui.md': readFileSync(join(broken.dir, '.architect/ui.md'), 'utf8').replace('## Accessibility', '## Access') });
  assert.throws(() => approve(broken.dir, 'SCR-01', { by: 'owner' }), (e) => e instanceof LifecycleError && /U03/.test(e.message), 'a design error still stops it');
});

// Found in the first real project (F-D15): the owner approved SCR-01 in the panel, the mockup then changed with CR-0015, and
// `ppc next` still offered to run that answer. The approval names the mockup it was about, so an answer about an older one fails.
test('ask and approve SCR-NN: the answer names the mockup it saw, and is refused once the mockup changed', (t) => {
  const r = unapproved(t);
  const sha = loadProject(r.dir).uiFiles[MOCKUP];
  const label = askFor(loadProject(r.dir), 'SCR-01').questions[0].options[0].label;
  assert.match(label, new RegExp(`— ppc approve SCR-01 --mockup ${sha.slice(0, 12)}$`));
  r.write({ [MOCKUP]: '<!doctype html><p>a new version</p>\n' });
  const before = readFileSync(join(r.dir, '.architect/ui.md'), 'utf8');
  assert.throws(() => approve(r.dir, 'SCR-01', { by: 'owner', mockup: sha.slice(0, 12) }), (e) => e instanceof LifecycleError && /changed since/.test(e.message));
  assert.equal(readFileSync(join(r.dir, '.architect/ui.md'), 'utf8'), before, 'nothing was approved');
  const now = loadProject(r.dir).uiFiles[MOCKUP];
  assert.equal(approve(r.dir, 'SCR-01', { by: 'owner', mockup: now.slice(0, 12) }).screen, 'SCR-01');
  assert.throws(() => approve(r.dir, 'SL-002', { by: 'owner', mockup: now.slice(0, 12) }), (e) => e instanceof LifecycleError && /--mockup applies to a screen/.test(e.message));
});

// Found in the first real project (SL-021): with no app.check, the audit wrote a throwaway script outside the repository to open the
// real window and grab it, so every slice on the interface would write its own. U07 asks for the command once slices build to screens.
test('U07: slices build to screens and the interface document names no command that opens the real app', () => {
  const m = base();
  delete m.ui.data.app;
  const u07 = found(m, 'U07');
  assert.equal(u07.length, 1);
  assert.equal(u07[0].severity, 'warning');
  assert.match(u07[0].message, /app\.check/);
  assert.deepEqual(found(base(), 'U07'), [], 'the example names one');
  const noScreens = base();
  delete noScreens.ui.data.app;
  for (const s of noScreens.slices) delete s.data.screens;
  assert.deepEqual(found(noScreens, 'U07'), [], 'before any slice builds to a screen, it is not needed yet');
});
