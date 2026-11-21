// The rubric a review applies (docs/standards.md, "Experience"): a short list of criteria for each surface a person meets.
//
// A criterion either cites its source with the words the source uses (`source.quote`, a few words each, copied from the page on the
// day in `source.read`), or says it is pp-suite's own question (`ours: true`, `source: null`). Where pp-suite moved a principle to
// another surface (a user-interface heuristic read as a rule for an API's errors), `source.adapted` says what it changed: the source
// did not say that. Pages: Nielsen Norman Group, W3C WAI and clig.dev. For clig.dev only the first part of the page was read.

export const SURFACES = {
  screen: { title: 'Screens', meets: 'a person looks at a screen' },
  api: { title: 'An API or a library', meets: 'a caller meets its responses, its errors and its names' },
  cli: { title: 'A command line', meets: 'a person types a command and reads what comes back' },
  docs: { title: 'Documentation', meets: 'a person reads it to get something done' },
};

const NN = (heuristic, quote, adapted) => ({
  name: `Nielsen Norman Group, "10 Usability Heuristics for User Interface Design" (Jakob Nielsen), heuristic "${heuristic}"`,
  url: 'https://www.nngroup.com/articles/ten-usability-heuristics/',
  read: '2026-11-20',
  quote,
  ...(adapted ? { adapted } : {}),
});
const CLIG = (rule, quote) => ({
  name: `Command Line Interface Guidelines, "${rule}"`,
  url: 'https://clig.dev/',
  read: '2026-11-20',
  quote,
});
const OURS = { source: null, ours: true };

export const CRITERIA = [
  // ── screens ──
  { id: 'S-01', surface: 'screen', name: 'It says what is going on', ask: 'After an action, does the screen show that something happened, and while it works, that it is working?',
    source: NN('Visibility of System Status', ['The design should always keep users informed about what is going on,', 'through appropriate feedback within a reasonable amount of time.']) },
  { id: 'S-02', surface: 'screen', name: 'The same thing looks and reads the same', ask: 'Do the same words, controls and places mean the same thing on every screen, and do they follow what people expect of an app like this?',
    source: NN('Consistency and Standards', ['Users should not have to wonder whether different words, situations, or actions mean the same thing.', 'Follow platform and industry conventions.']) },
  { id: 'S-03', surface: 'screen', name: 'Nothing that is not needed', ask: 'Is there anything on the screen that nobody needs, competing with what they came to do?',
    source: NN('Aesthetic and Minimalist Design', ['Interfaces should not contain information that is irrelevant or rarely needed.']) },
  { id: 'S-04', surface: 'screen', name: 'Errors say what happened and what to do', ask: 'When something goes wrong, does the message use plain words, say what the problem is, and suggest what to do?',
    source: NN('Help Users Recognize, Diagnose, and Recover from Errors', ['Error messages should be expressed in plain language (no error codes), precisely indicate the problem,', 'and constructively suggest a solution.']) },
  { id: 'S-05', surface: 'screen', name: 'Text can be read', ask: 'Is the contrast between text and its background enough to read it, on every screen and in every state?',
    source: { name: 'W3C WAI, WCAG 2.2, "Understanding Success Criterion 1.4.3: Contrast (Minimum)"', url: 'https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html', read: '2026-11-20',
      quote: ['The visual presentation of text and images of text has a contrast ratio of at least 4.5:1, except for the following:', 'Large-scale text and images of large-scale text have a contrast ratio of at least 3:1;'] } },
  { id: 'S-06', surface: 'screen', name: 'It feels current and quick', ask: 'Does it look dated, or feel slower or less alive than what people use every day for the same job? Say what, and where.', ...OURS },
  // ── an API or a library ──
  { id: 'A-01', surface: 'api', name: 'Errors say what happened and what to do', ask: 'When a call fails, does the error say in plain words what the problem is and how to fix it, and not only a code?',
    source: NN('Help Users Recognize, Diagnose, and Recover from Errors', ['Error messages should be expressed in plain language (no error codes), precisely indicate the problem,', 'and constructively suggest a solution.'],
      'It is a rule for the messages of a user interface; pp-suite reads it as a rule for the errors an API or a library returns to the person calling it') },
  { id: 'A-02', surface: 'api', name: 'The same word means the same thing', ask: 'Do the names, fields and statuses mean the same thing in every call, and do they follow the conventions of the language or protocol?',
    source: NN('Consistency and Standards', ['Users should not have to wonder whether different words, situations, or actions mean the same thing.', 'Follow platform and industry conventions.'],
      'It is a rule for a user interface; pp-suite reads it as a rule for the names and shapes of an API or a library') },
  { id: 'A-03', surface: 'api', name: 'Success and failure have one shape', ask: 'Does every call answer in the same shape when it works and in the same shape when it fails, and is anything slow enough that the caller would wonder if it hung?', ...OURS },
  // ── a command line ──
  { id: 'C-01', surface: 'cli', name: 'Output goes to stdout, messages to stderr', ask: 'Does the result of the command go to stdout, and the logs and errors to stderr, so that a pipe gets only the result?',
    source: CLIG('Send output to `stdout`. / Send messaging to `stderr`.', ['The primary output for your command should go to `stdout`.', 'Log messages, errors, and so on should all be sent to `stderr`.']) },
  { id: 'C-02', surface: 'cli', name: 'The exit code tells the truth', ask: 'Does the command exit with zero when it worked and non-zero when it did not?',
    source: CLIG('Return zero exit code on success, non-zero on failure.', ['Return zero exit code on success, non-zero on failure.']) },
  { id: 'C-03', surface: 'cli', name: 'Errors are written for people', ask: 'When something fails, is the message rewritten for a person, with what to try next, and not a raw stack trace or internal name?',
    source: CLIG('Catch errors and rewrite them for humans.', ['Catch errors and rewrite them for humans.']) },
  { id: 'C-04', surface: 'cli', name: 'People first, machines second', ask: 'Is the default output made to be read by a person, with a way to get it for a program where that does not hurt the person?',
    source: CLIG('Human-readable output is paramount.', ['Human-readable output is paramount.', 'Have machine-readable output where it does not impact usability.']) },
  // ── documentation ──
  { id: 'D-01', surface: 'docs', name: 'It helps finish the task', ask: 'Where the thing needs explaining, does the documentation say how to complete the task, and is the rest clear without it?',
    source: NN('Help and Documentation', ['It’s best if the system doesn’t need any additional explanation.', 'However, it may be necessary to provide documentation to help users understand how to complete their tasks.']) },
  { id: 'D-02', surface: 'docs', name: 'A stranger gets to a result', ask: 'Can someone who has never seen the project go from nothing to a working result using only these pages, without asking anyone?', ...OURS },
];

// the kind of component the design names, and the surface a person meets through it
const SURFACE_OF_KIND = { frontend: 'screen', backend: 'api', library: 'api' };

/** The surfaces to review for components of these kinds, plus any the person adds (`cli` and `docs` are not a component kind). */
export function surfacesFor(kinds = [], extra = []) {
  for (const s of extra) if (!Object.hasOwn(SURFACES, s)) throw new Error(`unknown surface ${s}; the surfaces are ${Object.keys(SURFACES).join(', ')}`);
  const found = new Set([...kinds].map((k) => SURFACE_OF_KIND[k]).filter(Boolean));
  for (const s of extra) found.add(s);
  return Object.keys(SURFACES).filter((s) => found.has(s));
}

/** The criteria of these surfaces in plain words, each with where it comes from. The same text every time. */
export function renderRubric(surfaces = Object.keys(SURFACES)) {
  const out = [];
  for (const surface of Object.keys(SURFACES).filter((s) => surfaces.includes(s))) {
    out.push(`${SURFACES[surface].title}: ${SURFACES[surface].meets}`, '');
    for (const c of CRITERIA.filter((x) => x.surface === surface)) {
      out.push(`  ${c.id}  ${c.name}`, `        ${c.ask}`);
      if (c.source) {
        out.push(`        Source: ${c.source.name}, read ${c.source.read}`, `                ${c.source.url}`, ...c.source.quote.map((q) => `                "${q}"`));
        if (c.source.adapted) out.push(`        Changed by pp-suite: ${c.source.adapted}`);
      } else {
        out.push("        pp-suite's own question; no source.");
      }
      out.push('');
    }
  }
  return `${out.join('\n').replace(/\n+$/, '')}\n`;
}
