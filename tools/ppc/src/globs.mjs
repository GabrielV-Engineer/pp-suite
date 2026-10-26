// The small glob the blueprint's component `paths` use: `**` crosses folders, `*` stays inside one, everything else is literal.
const escape = (text) => text.replace(/[.+?^${}()|[\]\\]/g, '\\$&');

export function matchesGlob(pattern, path) {
  const source = pattern.split('**').map((part) => part.split('*').map(escape).join('[^/]*')).join('.*');
  return new RegExp(`^${source}$`).test(path);
}
