// The tools a person chose for a project (`.sddpp/tools.yaml`): a role (what the tool is for) bound to a skill, a plugin or an
// MCP server. pp-suite does not recommend a tool; it makes sure a role that applies to the slices ahead is decided, and says
// which roles a slice calls for. A role applies from facts the project already records, never from a model's reading of text.
// See docs/tools.md.

import { hasTool } from './inventory.mjs';

/** What asks a deferred role again: the design gets a component of this kind. */
export const TRIGGERS = {
  frontend_component: 'the design gets a frontend component',
  backend_component: 'the design gets a backend component',
  database_component: 'the design gets a database component',
  infra_component: 'the design gets an infrastructure component',
};

const adopted = (standards, id) => standards.some((s) => s.id === id && s.decision === 'adopt');

/**
 * The fixed list. `applies` reads the facts of one slice: the kinds of the components it touches, its screens and the standards
 * of the project. A first guess from one project and one person: short on purpose, and revised when a second project asks.
 */
export const ROLES = [
  {
    id: 'ui-design',
    title: 'Interface design',
    why: 'it touches a frontend component or builds screens',
    applies: (f) => f.kinds.has('frontend') || f.screens.length > 0,
  },
  {
    id: 'ui-capture',
    title: 'Capture the real interface',
    why: 'it builds screens, and the real app has to be seen',
    applies: (f) => f.screens.length > 0,
  },
  {
    id: 'security-review',
    title: 'Security review',
    why: 'the security standard is adopted and it touches a backend or a database',
    applies: (f) => adopted(f.standards, 'security') && (f.kinds.has('backend') || f.kinds.has('database')),
  },
  {
    id: 'db-inspect',
    title: 'Look at the database',
    why: 'it touches a database',
    applies: (f) => f.kinds.has('database'),
  },
];

/** The roles that call for a tool in a slice with these facts (`{ kinds: Set, screens: [], standards: [] }`). */
export const rolesFor = (facts) => ROLES.filter((r) => r.applies(facts));

/** What a slice touches, read from the design, the slice and the project's standards. */
export function roleFacts(model, slice) {
  const kindOf = new Map((model.blueprint?.data.components ?? []).map((c) => [c.id, c.kind]));
  return {
    kinds: new Set((slice.components ?? []).map((c) => kindOf.get(c)).filter(Boolean)),
    screens: slice.screens ?? [],
    standards: model.standards?.data?.standards ?? [],
  };
}

/** Whether the design now has a component of the kind a trigger names. */
export const triggerFired = (trigger, bp) => (bp?.components ?? []).some((c) => `${c.kind}_component` === trigger);

/** The characters a tool's name may have (the schema says the same): letters, digits and `_ . : @ / -`, 2 to 80, no spaces. */
export const TOOL_NAME = /^[A-Za-z0-9][A-Za-z0-9_.:@/-]{1,79}$/;
export const TOOL_KINDS = ['skill', 'plugin', 'mcp'];

/**
 * The tool a person is asked to adopt, checked as the contract would check it, with a refusal that says what is missing (the schema
 * alone answers "must not be valid"). Shared by `ppc decide-tool` and by the panel question, so the person is never offered an option
 * that would fail. `fail` throws whatever error type the caller uses.
 */
export function toolFromFlags({ adopt, kind, source, pinned, access, accessReason }, fail) {
  if (!kind) fail(`--adopt needs --kind: skill, plugin or mcp (what is ${adopt}?)`);
  if (!TOOL_KINDS.includes(kind)) fail(`${kind} is not a kind of tool; the kinds are ${TOOL_KINDS.join(', ')}`);
  if (!TOOL_NAME.test(adopt)) fail(`${adopt} is not a name a tool can have here: letters, digits and _ . : @ / -, 2 to 80 characters, no spaces`);
  if (kind === 'mcp' && !access) fail('an MCP server needs --access read-only or read-write: it reaches data and credentials, so say whether it may change anything');
  if (kind !== 'mcp' && access) fail('--access is for an MCP server only');
  if (access === 'read-write' && !accessReason?.trim()) fail('--access read-write needs --access-reason <why the server has to change things>');
  if (access && access !== 'read-write' && accessReason) fail('--access-reason goes with --access read-write only');
  return { name: adopt, kind, ...(source ? { source } : {}), ...(pinned ? { pinned } : {}), ...(access ? { access } : {}), ...(accessReason ? { access_reason: accessReason } : {}) };
}

const decisionWords = (e) => (e.decision === 'adopt' ? `${e.tool.name} (${e.tool.kind}${e.tool.access ? `, ${e.tool.access}` : ''})` : e.decision === 'later' ? `later, when ${TRIGGERS[e.trigger]}` : e.decision === 'not_needed' ? `not needed: ${e.reason}` : 'no decision');

/**
 * `ppc tools`: each role, what a person decided, and the slices not yet closed that call for it. With an `inventory` (what the machine
 * has), a chosen tool is also said to be on it or not; without one nothing is claimed about the machine.
 */
export function renderTools(model, inventory) {
  const list = model.tools?.data?.tools ?? [];
  const ahead = (model.slices ?? []).map((s) => s.data).filter((sl) => ['planned', 'ready', 'in_progress'].includes(sl.status));
  const out = ['Tools for this project (.sddpp/tools.yaml)', ''];
  if (!model.tools) out.push('No tools are decided yet: the file does not exist yet. Decide one in the question panel with `ppc ask <role>`.', '');
  let missing = false;
  for (const role of ROLES) {
    const entry = list.find((e) => e.role === role.id);
    const calls = ahead.filter((sl) => rolesFor(roleFacts(model, sl)).some((r) => r.id === role.id)).map((sl) => sl.id);
    const where = calls.length ? `called for by ${calls.slice(0, 6).join(', ')}${calls.length > 6 ? ` and ${calls.length - 6} more` : ''}` : 'no slice calls for it';
    let there = '';
    if (inventory && entry?.decision === 'adopt') {
      const found = hasTool(inventory, entry.tool.kind, entry.tool.name);
      missing ||= !found;
      there = found ? ' — on this machine' : ' — not found on this machine';
    }
    out.push(`${role.id.padEnd(16)}${role.title}: ${entry ? decisionWords(entry) : 'no decision'}${there} — ${where}`);
  }
  if (missing) out.push('', 'A tool that was not found has to be installed first, and the session restarted to load it: one installed during a session does not load in it.');
  return `${out.join('\n')}\n`;
}
