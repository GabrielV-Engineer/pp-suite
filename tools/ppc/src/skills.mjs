import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';

// The commands a person sees in the `/` menu. Spec Kit installs each extension command as a skill named after its id
// (`speckit.sddpp-cycle.build` becomes `/speckit-sddpp-cycle-build`), which is long and says little. The owner chose
// (2026-11-12) short names in the style of Spec Kit's own (`/speckit-specify`, `-plan`, `-implement`): `ppc init` writes these
// skills from the same command files, so there is one source, and removes the long ones.

const CYCLE = 'sdd-pp/extension/sddpp-cycle/commands';
const ARCHITECT = 'architect-pp/extension/commands';
const part = (dir, name, extension, word, when) => ({ file: `${dir}/${name}.md`, command: `speckit-${extension}-${name}`, word, when });

export const SHORT_SKILLS = [
  {
    name: 'pp-design',
    description: "DESIGN: turn The Architect's blueprint into the checked design (.architect/), design the interface with the person (ui), or carry out the additions the person cut",
    parts: [
      part(ARCHITECT, 'handoff', 'architect-pp', 'handoff', 'there is no `.architect/blueprint.yaml` yet: turn the blueprint into the design'),
      part(ARCHITECT, 'apply-cuts', 'architect-pp', 'cuts', 'additions in `.architect/additions.yaml` are decided `cut` and not yet `applied`: remove them from the design'),
      part(ARCHITECT, 'ui', 'architect-pp', 'ui', 'the design has a `frontend` component and no `.architect/ui.md` or screens without an approved mockup, or the person asks to design or change the interface: interview them and draw the mockups'),
    ],
  },
  { name: 'pp-standards', parts: [part(CYCLE, 'standards', 'sddpp-cycle', 'standards')] },
  { name: 'pp-experience', parts: [part(CYCLE, 'experience', 'sddpp-cycle', 'experience')] },
  { name: 'pp-plan', parts: [part(CYCLE, 'slices', 'sddpp-cycle', 'slices')] },
  {
    name: 'pp-build',
    description: 'BUILD: write the tests and the code of the slice in progress (light cycle); on request, the prompts of a task',
    parts: [
      part(CYCLE, 'build', 'sddpp-cycle', 'build', 'a slice is in progress in the build phase (the usual case)'),
      part(CYCLE, 'prompts', 'sddpp-cycle', 'prompts', 'only when the person asks for the prompts of a task'),
    ],
  },
  {
    name: 'pp-check',
    description: 'CHECK: review before or after building (what is unclear, what contradicts, whether the code did only what the slice promised)',
    parts: [
      part(CYCLE, 'clarify', 'sddpp-cycle', 'clarify', 'before building: what in a planned slice or the design is vague enough to guess (the default when no slice has code yet)'),
      part(CYCLE, 'analyze', 'sddpp-cycle', 'analyze', 'read-only, any time: contradictions and vague criteria across the design and the slices'),
      part(CYCLE, 'converge', 'sddpp-cycle', 'converge', 'read-only, after building and before the audit: did the code do only what the slice promised (the default when the slice in progress has code)'),
    ],
  },
  { name: 'pp-audit', parts: [part(CYCLE, 'audit', 'sddpp-cycle', 'audit')] },
  { name: 'pp-change', parts: [part(ARCHITECT, 'apply-change', 'architect-pp', 'change')] },
  { name: 'pp-red', parts: [part(CYCLE, 'red', 'sddpp-cycle', 'red')] },
  { name: 'pp-green', parts: [part(CYCLE, 'green', 'sddpp-cycle', 'green')] },
  { name: 'pp-refactor', parts: [part(CYCLE, 'refactor', 'sddpp-cycle', 'refactor')] },
];

// Commands that only hooks run (Spec Kit's event dispatcher finds them in extension.yml, not in .claude/skills): no short
// name, and their long skills are removed too, since a person never types them.
export const HOOKS = ['speckit-sddpp-guard-pre-tool', 'speckit-sddpp-guard-record-answer', 'speckit-sddpp-cycle-session-start'];

const EXTENSION_FILES = ['architect-pp/extension/extension.yml', 'sdd-pp/extension/sddpp-guard/extension.yml', 'sdd-pp/extension/sddpp-cycle/extension.yml'];

/** The names Spec Kit gives the skills of our extensions (`speckit.sddpp-cycle.build` → `speckit-sddpp-cycle-build`). */
export function longSkillNames(suite) {
  return EXTENSION_FILES.flatMap((file) => parseYaml(readFileSync(join(suite, file), 'utf8')).provides.commands.map((c) => c.name.replaceAll('.', '-')));
}

const split = (text) => {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(text);
  return match ? { meta: parseYaml(match[1]), body: text.slice(match[0].length) } : { meta: {}, body: text };
};

/** Each short skill: its name and the full text of its SKILL.md. */
export function shortSkills(suite) {
  return SHORT_SKILLS.map((spec) => {
    const sources = spec.parts.map((p) => ({ ...p, ...split(readFileSync(join(suite, p.file), 'utf8')) }));
    const description = spec.description ?? sources[0].meta.description;
    const head = ['---', `name: ${spec.name}`, `description: ${JSON.stringify(description)}`];
    if (sources.length > 1) head.push(`argument-hint: ${JSON.stringify(`[${sources.map((p) => p.word).join(' | ')}]`)}`);
    head.push('---', '');
    if (sources.length === 1) return { name: spec.name, content: `${head.join('\n')}${sources[0].body.replace(/^\n+/, '')}` };
    const which = [
      '## Which part',
      '',
      `This command does one of ${sources.length} things. If the user input starts with one of these words, do that part; otherwise choose by`,
      'the state of the project (`ppc status`, `ppc next`). Do only one part.',
      '',
      ...sources.map((p) => `- \`${p.word}\`: ${p.when}.`),
      '',
    ];
    const parts = sources.map((p) => `# Part \`${p.word}\`: ${p.meta.description}\n\n${p.body.replace(/^\n+/, '').trimEnd()}\n`);
    return { name: spec.name, content: `${head.join('\n')}${which.join('\n')}\n${parts.join('\n')}` };
  });
}
