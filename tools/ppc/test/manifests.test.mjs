import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const SUITE = fileURLToPath(new URL('../../../', import.meta.url));
const dirs = (base) => readdirSync(join(SUITE, base), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => join(base, e.name));
const EXTENSIONS = [...dirs('sdd-pp/extension'), 'architect-pp/extension'];

for (const dir of EXTENSIONS) {
  test(`${dir}: every command in the manifest has its file, a name that starts with the extension id, and a description`, () => {
    assert.ok(existsSync(join(SUITE, dir, 'extension.yml')), `${dir}/extension.yml is missing`);
    const manifest = parse(readFileSync(join(SUITE, dir, 'extension.yml'), 'utf8'));
    const id = manifest.extension.id;
    for (const command of manifest.provides.commands) {
      assert.ok(command.name.startsWith(`speckit.${id}.`), `${command.name} should start with speckit.${id}.`);
      assert.ok(existsSync(join(SUITE, dir, command.file)), `${command.file} is missing`);
      assert.ok(command.description.length >= 10);
    }
  });

  test(`${dir}: every command file in commands/ is registered, so none is shipped by accident or left out`, () => {
    const manifest = parse(readFileSync(join(SUITE, dir, 'extension.yml'), 'utf8'));
    const listed = new Set(manifest.provides.commands.map((c) => c.file));
    const files = existsSync(join(SUITE, dir, 'commands')) ? readdirSync(join(SUITE, dir, 'commands')).map((f) => `commands/${f}`) : [];
    assert.deepEqual([...listed].sort(), files.sort());
  });
}

test('the Architect.PP extension offers the hand-off and the cut-applying step', () => {
  const manifest = parse(readFileSync(join(SUITE, 'architect-pp/extension/extension.yml'), 'utf8'));
  assert.deepEqual(manifest.provides.commands.map((c) => c.name).sort(), ['speckit.architect-pp.apply-cuts', 'speckit.architect-pp.handoff']);
});
