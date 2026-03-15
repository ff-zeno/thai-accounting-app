const BUDDHIST_ERA_OFFSET = 543;

export function toBuddhistYear(gregorianYear: number): number {
  return gregorianYear + BUDDHIST_ERA_OFFSET;
}

export function fromBuddhistYear(buddhistYear: number): number {
  return buddhistYear - BUDDHIST_ERA_OFFSET;
}
