import { butterfly } from './butterfly';
import { dog } from './dog';
import { rabbit } from './rabbit';
import { RiggedCreature, type CreatureDef } from './rig';
import { swan } from './swan';
import type { Spawn } from './types';

export const DEFS: Record<CreatureDef['kind'], CreatureDef> = { dog, rabbit, butterfly, swan };

export function createCreature(kind: CreatureDef['kind'], spawn: Spawn, seed?: number): RiggedCreature {
  return new RiggedCreature(DEFS[kind], spawn, seed);
}
