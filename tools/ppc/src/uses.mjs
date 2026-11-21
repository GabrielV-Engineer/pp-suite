import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { rolesFor, roleFacts } from './tools.mjs';
import { bareName } from './inventory.mjs';

// Which skills and MCP servers were used, and in which slice, from `.sddpp/uses.jsonl`: written by the recorder hook (record_answer.py), local
// to a machine and never in git (`ppc init` ignores it, since it names the MCP servers a person uses). `ppc finish` reads it once, at the close,
// and writes the answer into the audit, which is versioned: that is what the rules read. See docs/tools.md.

/** The lines the hook wrote, in order; a missing file or a line that is not a record is nothing. */
export function readUses(root) {
  const file = join(root, '.sddpp/uses.jsonl');
  if (!existsSync(file)) return [];
  const out = [];
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    try {
      const entry = JSON.parse(line);
      if (entry && typeof entry === 'object' && !Array.isArray(entry) && typeof entry.kind === 'string' && typeof entry.name === 'string') out.push(entry);
    } catch {
      // not a record
    }
  }
  return out;
}

/** Whether one record is a use of the tool a person chose: a skill by its full or bare name, a plugin by any skill it brings, an MCP server by its name. */
function isUseOf(tool, entry) {
  if (tool.kind === 'skill') return entry.kind === 'skill' && (entry.name === tool.name || bareName(entry.name) === bareName(tool.name));
  if (tool.kind === 'plugin') return entry.kind === 'skill' && entry.name.startsWith(`${tool.name}:`);
  return entry.kind === 'mcp' && entry.name === tool.name;
}

/**
 * For each role the slice calls for that has a tool adopted: `{ role, tool, kind, used }`. `used` is true or false by the record of this slice,
 * and null when nothing was recorded for the slice at all (the hook may not have been running, and "not used" would be a claim nobody checked).
 */
export function toolsAccount(model, slice, entries) {
  if (!model.tools || !Array.isArray(model.tools.data?.tools)) return [];
  const mine = entries.filter((e) => e.slice === slice.id);
  const account = [];
  for (const role of rolesFor(roleFacts(model, slice))) {
    const chosen = model.tools.data.tools.find((e) => e.role === role.id && e.decision === 'adopt');
    if (!chosen) continue;
    account.push({ role: role.id, tool: chosen.tool.name, kind: chosen.tool.kind, used: mine.length ? mine.some((e) => isUseOf(chosen.tool, e)) : null });
  }
  return account;
}
