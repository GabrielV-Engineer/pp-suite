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
