export const CYCLE_EVENT_TYPES = [
  'seat_taken',
  'perspective_submitted',
  'synthesis_returned',
  'lens_upgraded'
] as const;

export type CycleEventType = (typeof CYCLE_EVENT_TYPES)[number];

const CYCLE_EVENT_INTENT_BY_TYPE: Record<CycleEventType, string> = {
  seat_taken: 'SEAT_TAKEN',
  perspective_submitted: 'PERSPECTIVE_SUBMITTED',
  synthesis_returned: 'SYNTHESIS_RETURNED',
  lens_upgraded: 'LENS_UPGRADED'
};

const CYCLE_EVENT_TYPE_BY_INTENT: Record<string, CycleEventType> = Object.fromEntries(
  Object.entries(CYCLE_EVENT_INTENT_BY_TYPE).map(([eventType, intent]) => [
    intent,
    eventType as CycleEventType
  ])
) as Record<string, CycleEventType>;

const CYCLE_EVENT_ALLOWED_TRANSITIONS: Record<CycleEventType | 'start', readonly CycleEventType[]> = {
  start: ['seat_taken'],
  seat_taken: ['perspective_submitted'],
  perspective_submitted: ['synthesis_returned'],
  synthesis_returned: ['lens_upgraded'],
  lens_upgraded: ['seat_taken', 'perspective_submitted']
};

export function cycleEventTypeToIntent(eventType: CycleEventType): string {
  return CYCLE_EVENT_INTENT_BY_TYPE[eventType];
}

export function cycleEventIntentToType(intent: string): CycleEventType | null {
  const normalized = intent.trim().toUpperCase();
  return CYCLE_EVENT_TYPE_BY_INTENT[normalized] ?? null;
}

export function allowedCycleTransitionsFrom(previous: CycleEventType | null): readonly CycleEventType[] {
  return previous === null
    ? CYCLE_EVENT_ALLOWED_TRANSITIONS.start
    : CYCLE_EVENT_ALLOWED_TRANSITIONS[previous];
}

export function isAllowedCycleTransition(
  previous: CycleEventType | null,
  next: CycleEventType
): boolean {
  return allowedCycleTransitionsFrom(previous).includes(next);
}
