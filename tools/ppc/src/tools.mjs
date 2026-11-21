// The tools a person chose for a project (`.sddpp/tools.yaml`): a role (what the tool is for) bound to a skill, a plugin or an
// MCP server. pp-suite does not recommend a tool; it makes sure a role that applies to the slices ahead is decided, and says
// which roles a slice calls for. A role applies from facts the project already records, never from a model's reading of text.
// See docs/tools.md.

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
