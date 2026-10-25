// Must agree with sdd-pp/extension/sddpp-guard/scripts/python/guard.py (TEST_PATH).
// Both are tested against contract/v0.1/test-path-cases.json.
const TEST_PATH = /(^|\/)(tests?|__tests__|spec)\/|[._-](test|spec)\.[a-z0-9]+$|(^|\/)test_[^/]+$/i;

export const isTestPath = (path) => TEST_PATH.test(String(path).replaceAll('\\', '/'));

// Files a tool writes, not a person: counting them would punish adding a dependency. Lockfiles only.
const GENERATED_NAMES = new Set(['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'Cargo.lock', 'poetry.lock', 'go.sum', 'composer.lock', 'Gemfile.lock']);
export const isGeneratedPath = (path) => GENERATED_NAMES.has(String(path).replaceAll('\\', '/').split('/').pop());
