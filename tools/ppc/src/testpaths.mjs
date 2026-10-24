// Must agree with sdd-pp/extension/sddpp-guard/scripts/python/guard.py (TEST_PATH).
// Both are tested against contract/v0.1/test-path-cases.json.
const TEST_PATH = /(^|\/)(tests?|__tests__|spec)\/|[._-](test|spec)\.[a-z0-9]+$|(^|\/)test_[^/]+$/i;

export const isTestPath = (path) => TEST_PATH.test(String(path).replaceAll('\\', '/'));
