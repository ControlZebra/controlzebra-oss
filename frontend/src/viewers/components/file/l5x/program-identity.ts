import type { NormalizedController } from 'ladder-visualizer';

type Program = NormalizedController['programs'][number];

/** Partial documents can retain duplicate UIDs. Never choose an arbitrary owner. */
export function findProgram(programs: Program[], identity: { name?: string; uid?: string; index?: number }): Program | undefined {
  if (identity.uid === undefined && identity.name === undefined) {
    return identity.index === undefined ? undefined : programs[identity.index];
  }
  const candidates = programs.filter(program => identity.uid !== undefined
    ? program.uid === identity.uid : program.name === identity.name);
  const matches = candidates.length > 1 && identity.uid !== undefined && identity.name !== undefined
    ? candidates.filter(program => program.name === identity.name) : candidates;
  return matches.length === 1 ? matches[0] : undefined;
}

/** A source UID supports rename tracking only when it uniquely identifies a program. */
export function programIdentity(programs: Program[], program: Program): { name: string; uid?: string } {
  return { name: program.name, uid: program.uid !== undefined && findProgram(programs, { uid: program.uid }) === program
    ? program.uid : undefined };
}
