import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { parse as parseYaml } from 'yaml';
import { projectFacts } from './standards.mjs';

export const REQUIRED_FILES = [
  '.architect/blueprint.yaml',
  '.architect/architecture.md',
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
    reviews: [],
    debt: [],
    active: null,
    additions: null,
    standards: null,
    ui: null,
    uiFiles: {},
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
  markdown('.sddpp/reviews', 'reviews');
  markdown('.architect/decisions', 'adrs');
  markdown('.architect/evidence', 'evidence');

  // One register for the whole project; no file means no debt yet.
  if (existsSync(join(root, '.sddpp/debt.yaml'))) {
    try {
      model.debt.push({ file: '.sddpp/debt.yaml', data: parseYaml(read('.sddpp/debt.yaml')) });
    } catch (e) {
      fail('.sddpp/debt.yaml', `invalid YAML: ${e.message}`);
    }
  }

  if (existsSync(join(root, '.architect/additions.yaml'))) {
    try {
      model.additions = { file: '.architect/additions.yaml', data: parseYaml(read('.architect/additions.yaml')) };
    } catch (e) {
      fail('.architect/additions.yaml', `invalid YAML: ${e.message}`);
    }
  }

  // How the project handles security, observability, git and CI. The facts of the repository (its remote, a CI configuration)
  // are read only with the file, since only its triggers need them.
  if (existsSync(join(root, '.sddpp/standards.yaml'))) {
    try {
      model.standards = { file: '.sddpp/standards.yaml', data: parseYaml(read('.sddpp/standards.yaml')) };
    } catch (e) {
      fail('.sddpp/standards.yaml', `invalid YAML: ${e.message}`);
    }
    model.facts = projectFacts(root);
  }

  // The interface document, and a hash of every file its screens name, so the validator stays free of file access. null = missing.
  if (existsSync(join(root, '.architect/ui.md'))) {
    try {
      const { data, body } = splitFrontmatter(read('.architect/ui.md'));
      if (!data || typeof data !== 'object') fail('.architect/ui.md', 'missing YAML frontmatter');
      else model.ui = { file: '.architect/ui.md', data, body };
    } catch (e) {
      fail('.architect/ui.md', `invalid frontmatter: ${e.message}`);
    }
    for (const s of Array.isArray(model.ui?.data.screens) ? model.ui.data.screens : []) {
      for (const file of [s?.mockup, s?.image]) {
        if (typeof file !== 'string' || file in model.uiFiles || !file.startsWith('.architect/ui/') || file.includes('..')) continue;
        try {
          model.uiFiles[file] = createHash('sha256').update(readFileSync(join(root, file))).digest('hex');
        } catch {
          model.uiFiles[file] = null;
        }
      }
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
