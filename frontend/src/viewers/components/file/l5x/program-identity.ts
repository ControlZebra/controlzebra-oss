import type { NormalizedController } from 'ladder-visualizer';

type Program = NormalizedController['programs'][number];

/** Partial documents can retain duplicate UIDs. Never choose an arbitrary owner. */
export function findProgram(programs: Program[], identity: { name?: string; uid?: string; index?: number }, ambiguousUids?: ReadonlySet<string>): Program | undefined {
  if (identity.uid === undefined && identity.name === undefined) {
    return identity.index === undefined ? undefined : programs[identity.index];
  }
  const candidates = programs.filter(program => identity.uid !== undefined
    ? program.uid === identity.uid : program.name === identity.name);
  if (identity.uid !== undefined && ambiguousUids?.has(identity.uid) && identity.name === undefined) return undefined;
  const matches = identity.uid !== undefined && identity.name !== undefined && (candidates.length > 1 || ambiguousUids?.has(identity.uid))
    ? candidates.filter(program => program.name === identity.name) : candidates;
  return matches.length === 1 ? matches[0] : undefined;
}

/** A source UID supports rename tracking only when it uniquely identifies a program. */
export function programIdentity(programs: Program[], program: Program, ambiguousUids?: ReadonlySet<string>): { name: string; uid?: string } {
  return { name: program.name, uid: program.uid !== undefined && !ambiguousUids?.has(program.uid) && findProgram(programs, { uid: program.uid }) === program
    ? program.uid : undefined };
}

/** Once a UID has collided in this file, require names even if a later refresh removes the collision. */
export function collectAmbiguousProgramUids(programs: Program[], history: ReadonlySet<string>): ReadonlySet<string> {
  const seen = new Set<string>();
  const additions = new Set<string>();
  for (const program of programs) {
    if (program.uid === undefined) continue;
    if (seen.has(program.uid) && !history.has(program.uid)) additions.add(program.uid);
    seen.add(program.uid);
  }
  return additions.size ? new Set([...history, ...additions]) : history;
}
