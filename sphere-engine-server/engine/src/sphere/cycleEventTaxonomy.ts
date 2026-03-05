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

export function cycleEventTypeToIntent(eventType: CycleEventType): string {
  return CYCLE_EVENT_INTENT_BY_TYPE[eventType];
}
