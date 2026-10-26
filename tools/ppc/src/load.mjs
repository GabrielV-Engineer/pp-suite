import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';

export const REQUIRED_FILES = [
  '.architect/blueprint.yaml',
  '.architect/brief.md',
  '.architect/architecture.md',
  '.architect/glossary.md',
];

export function splitFrontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!m) return { data: null, body: text };
  return { data: parseYaml(m[1]), body: m[2] };
}

function listFiles(root, dir, ext) {
  const abs = join(root, dir);
  if (!existsSync(abs)) return [];
  return readdirSync(abs).filter((f) => f.endsWith(ext)).sort().map((f) => `${dir}/${f}`);
}

export function loadProject(root) {
  const model = {
    root,
    errors: [],
    missingFiles: [],
    blueprint: null,
    slices: [],
    adrs: [],
    evidence: [],
    changeRequests: [],
    debt: [],
    active: null,
    specs: {},
    additions: null,
  };
  const fail = (file, message) => model.errors.push({ rule: 'PARSE', severity: 'error', file, message });
  const read = (file) => readFileSync(join(root, file), 'utf8');

  for (const f of REQUIRED_FILES) if (!existsSync(join(root, f))) model.missingFiles.push(f);

  if (!model.missingFiles.includes('.architect/blueprint.yaml')) {
    try {
      model.blueprint = { file: '.architect/blueprint.yaml', data: parseYaml(read('.architect/blueprint.yaml')) };
    } catch (e) {
      fail('.architect/blueprint.yaml', `invalid YAML: ${e.message}`);
    }
  }

  const markdown = (dir, target) => {
    for (const file of listFiles(root, dir, '.md')) {
      try {
        const { data, body } = splitFrontmatter(read(file));
        if (!data || typeof data !== 'object') fail(file, 'missing YAML frontmatter');
        else model[target].push({ file, data, body });
      } catch (e) {
        fail(file, `invalid frontmatter: ${e.message}`);
      }
    }
  };
  markdown('.sddpp/slices', 'slices');
  markdown('.sddpp/change-requests', 'changeRequests');
  markdown('.architect/decisions', 'adrs');
  markdown('.architect/evidence', 'evidence');

  for (const file of listFiles(root, '.sddpp/debt', '.yaml')) {
    try {
      model.debt.push({ file, data: parseYaml(read(file)) });
    } catch (e) {
      fail(file, `invalid YAML: ${e.message}`);
    }
  }

  // Spec files that slices point at, read here so the validator stays free of file access. null = unreadable.
  for (const { data } of model.slices) {
    const file = data.spec?.file;
    if (typeof file !== 'string' || file in model.specs || file.startsWith('/') || file.includes('..')) continue;
    try {
      model.specs[file] = read(file);
    } catch {
      model.specs[file] = null;
    }
  }

  if (existsSync(join(root, '.architect/additions.yaml'))) {
    try {
      model.additions = { file: '.architect/additions.yaml', data: parseYaml(read('.architect/additions.yaml')) };
    } catch (e) {
      fail('.architect/additions.yaml', `invalid YAML: ${e.message}`);
    }
  }

  if (existsSync(join(root, '.sddpp/active.json'))) {
    try {
      model.active = { file: '.sddpp/active.json', data: JSON.parse(read('.sddpp/active.json')) };
    } catch (e) {
      fail('.sddpp/active.json', `invalid JSON: ${e.message}`);
    }
  }
  return model;
}
