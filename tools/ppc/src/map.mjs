import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// `ppc map`: the project as a picture. Nothing here is inferred from the code: the components, their dependencies, the capabilities,
// the slices, the screens and the debt are what the design and the slices already say, and `ppc validate` already checks. So the map
// cannot disagree with the design, and it is a pure function of the files: no clock, no network, the same text every time.
// `mapModel` reads the project, `renderMermaid` draws it as markdown that GitHub shows as diagrams.

export const MAP_DIR = '.sddpp/map';
export const MAP_MARKDOWN = `${MAP_DIR}/map.md`;

const UNSETTLED = new Set(['proposed', 'open', 'scheduled']);
const list = (value) => (Array.isArray(value) ? value : []);
const count = (slices) => ({ total: slices.length, done: slices.filter((s) => s.status === 'done').length });

/**
 * The data of the map. A component is `unplanned` when no slice touches it, `planned` while none of its slices is done, `building`
 * once some are, and `built` when all are; `active` says a slice that touches it is in progress. Dropped slices do not count.
 */
export function mapModel(model, findings = []) {
  const bp = model.blueprint.data;
  const slices = model.slices.map((s) => s.data).filter((s) => s.status !== 'dropped').sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const entries = model.debt.flatMap((d) => list(d.data?.entries));
  const components = list(bp.components).map((c) => {
    const own = slices.filter((s) => list(s.components).includes(c.id));
    const { total, done } = count(own);
    const mine = entries.filter((e) => e.component === c.id);
    let state = 'planned';
    if (!total) state = 'unplanned';
    else if (done === total) state = 'built';
    else if (done) state = 'building';
    return {
      id: c.id,
      name: c.name ?? c.id,
      kind: c.kind,
      responsibility: c.responsibility,
      state,
      active: own.some((s) => s.status === 'in_progress'),
      slices: { total, done },
      debt: { unsettled: mine.filter((e) => UNSETTLED.has(e.status)).length, total: mine.length },
    };
  });
  const known = new Set(components.map((c) => c.id));
  const edges = list(bp.components).flatMap((c) => list(c.may_depend_on).filter((to) => known.has(to)).map((to) => ({ from: c.id, to })));
  const capabilities = list(bp.capabilities).map((cap) => {
    const own = slices.filter((s) => s.capability === cap.id);
    const reach = new Set(own.flatMap((s) => list(s.components)));
    return { id: cap.id, name: cap.name ?? cap.id, priority: cap.priority, slices: { ...count(own), ids: own.map((s) => s.id) }, components: components.map((c) => c.id).filter((id) => reach.has(id)) };
  });
  const screens = list(model.ui?.data?.screens).map((s) => {
    const seen = model.uiFiles?.[s.mockup];
    const approved = Boolean(s.approved_by) && seen === s.mockup_sha256;
    return { id: s.id, name: s.name ?? s.id, capabilities: list(s.capabilities), mockup: s.mockup, approved, stale: Boolean(s.approved_by) && !approved };
  });
  const errors = findings.filter((f) => f.severity === 'error').length;
  const inProgress = slices.find((s) => s.status === 'in_progress');
  return {
    project: { name: bp.project?.name ?? bp.project?.id ?? 'project', revision: bp.revision },
    slices: { ...count(slices), inProgress: inProgress ? { id: inProgress.id, title: inProgress.title, phase: inProgress.phase } : null },
    components,
    edges,
    capabilities,
    screens,
    contract: { errors, warnings: findings.length - errors },
  };
}

const flat = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
/** Text inside a quoted mermaid label: its own entity codes, so a quote, a bracket or markup in a name cannot leave the label. */
const label = (value) => flat(value).replace(/#/g, '#35;').replace(/&/g, '#amp;').replace(/"/g, '#quot;').replace(/</g, '#lt;').replace(/>/g, '#gt;');
/** Text inside a markdown table cell or line. */
const cell = (value) => flat(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\|/g, '\\|');

const STATE_WORDS = { unplanned: 'no slice yet', planned: 'planned', building: 'building', built: 'built' };
const progress = ({ done, total }) => `${done}/${total} slices done`;

function componentsDiagram(map) {
  const id = new Map(map.components.map((c, i) => [c.id, `C${i + 1}`]));
  const out = ['flowchart TD'];
  for (const c of map.components) {
    const state = c.active ? `${STATE_WORDS[c.state]}, in progress` : STATE_WORDS[c.state];
    const lines = [label(c.name),`${label(c.kind)} · ${state}`, label(progress(c.slices))];
    if (c.debt.unsettled) lines.push(`debt: ${c.debt.unsettled} to decide or pay`);
    out.push(`  ${id.get(c.id)}["${lines.join('<br/>')}"]:::${c.state}`);
  }
  for (const e of map.edges) out.push(`  ${id.get(e.from)} --> ${id.get(e.to)}`);
  out.push(
    '  classDef unplanned stroke-dasharray: 2 6',
    '  classDef planned stroke-dasharray: 6 4',
    '  classDef building stroke-width: 3px',
    '  classDef built stroke-width: 3px',
  );
  return out;
}

function capabilitiesDiagram(map) {
  const id = new Map(map.components.map((c, i) => [c.id, `C${i + 1}`]));
  const out = ['flowchart LR'];
  map.capabilities.forEach((cap, i) => out.push(`  K${i + 1}(["${label(cap.id)}<br/>${label(cap.name)}<br/>${label(progress(cap.slices))}"])`));
  map.components.forEach((c) => out.push(`  ${id.get(c.id)}["${label(c.name)}"]`));
  map.capabilities.forEach((cap, i) => cap.components.forEach((c) => out.push(`  K${i + 1} --> ${id.get(c)}`)));
  return out;
}

/** The map as a markdown page: two mermaid diagrams and the tables behind them. */
export function renderMermaid(map) {
  const out = [`# ${cell(map.project.name)}: map`, '', '<!-- Generated by `ppc map` from the design and the slices. Do not edit: run it again. -->', ''];
  const s = map.slices;
  out.push(`Blueprint revision ${map.project.revision} · ${s.total} slices, ${s.done} done${s.inProgress ? ` · in progress: ${cell(s.inProgress.id)} "${cell(s.inProgress.title)}", phase ${cell(s.inProgress.phase)}` : ''} · contract: ${map.contract.errors} error(s), ${map.contract.warnings} warning(s)`, '');

  out.push('## Components', '', 'An arrow means "may depend on". A dashed border is a component with nothing built yet; the state is also written in each box.', '', '```mermaid', ...componentsDiagram(map), '```', '');
  out.push('| Component | Kind | State | Slices | Unsettled debt |', '|---|---|---|---|---|');
  for (const c of map.components) out.push(`| ${cell(c.id)} | ${cell(c.kind)} | ${STATE_WORDS[c.state]}${c.active ? ', in progress' : ''} | ${progress(c.slices)} | ${c.debt.unsettled} |`);

  out.push('', '## Capabilities', '', 'Each capability points at the components its slices build in.', '', '```mermaid', ...capabilitiesDiagram(map), '```', '');
  out.push('| Capability | Name | Priority | Progress | Slices |', '|---|---|---|---|---|');
  for (const cap of map.capabilities) out.push(`| ${cell(cap.id)} | ${cell(cap.name)} | ${cell(cap.priority)} | ${cap.slices.done}/${cap.slices.total} | ${cell(cap.slices.ids.join(', ')) || 'none'} |`);

  if (map.screens.length) {
    out.push('', '## Screens', '', '| Screen | Name | Capabilities | Mockup | Approval |', '|---|---|---|---|---|');
    for (const sc of map.screens) out.push(`| ${cell(sc.id)} | ${cell(sc.name)} | ${cell(sc.capabilities.join(', '))} | ${cell(sc.mockup)} | ${sc.approved ? 'approved' : sc.stale ? 'changed since it was approved' : 'not approved yet'} |`);
  }
  return out.join('\n') + '\n';
}

/** Write the markdown page under `.sddpp/map/`. Returns the files written, relative to the project. */
export function writeMap(root, map) {
  mkdirSync(join(root, MAP_DIR), { recursive: true });
  writeFileSync(join(root, MAP_MARKDOWN), renderMermaid(map));
  return [MAP_MARKDOWN];
}
