// Must agree with sdd-pp/extension/sddpp-guard/scripts/python/guard.py (TEST_PATH).
// Both are tested against contract/v0.1/test-path-cases.json.
const TEST_PATH = /(^|\/)(tests?|__tests__|spec)\/|[._-](test|spec)\.[a-z0-9]+$|(^|\/)test_[^/]+$/i;

import { matchesGlob } from './globs.mjs';
export const isTestPath = (path) => TEST_PATH.test(String(path).replaceAll('\\', '/'));

// Files a tool writes, not a person: counting them would punish adding a dependency. Lockfiles by name, and whatever else the
// project declares in `budgets.generated_paths` of the blueprint (a lock it writes itself, a cache folder).
const GENERATED_NAMES = new Set([
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lock', 'bun.lockb', 'deno.lock', // JavaScript
  'Cargo.lock', 'go.sum', 'composer.lock', 'Gemfile.lock', 'Podfile.lock', 'pubspec.lock', 'mix.lock', // other ecosystems
  'poetry.lock', 'uv.lock', 'Pipfile.lock', 'pdm.lock', // Python
]);
export const isGeneratedPath = (path, globs = []) => {
  const normal = String(path).replaceAll('\\', '/');
  return GENERATED_NAMES.has(normal.split('/').pop()) || globs.some((pattern) => matchesGlob(pattern, normal));
};
/** The generated-file globs a blueprint declares. */
export const generatedGlobs = (blueprint) => blueprint?.budgets?.generated_paths ?? [];
