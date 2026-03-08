import { describe, expect, it } from 'vitest';
import {
  allowedCycleTransitionsFrom,
  cycleEventIntentToType,
  cycleEventTypeToIntent,
  isAllowedCycleTransition
} from './cycleEventTaxonomy.js';

describe('cycleEventTaxonomy', () => {
  it('maps event types and intents bidirectionally', () => {
    expect(cycleEventTypeToIntent('seat_taken')).toBe('SEAT_TAKEN');
    expect(cycleEventIntentToType('SEAT_TAKEN')).toBe('seat_taken');
    expect(cycleEventIntentToType(' perspective_submitted ')).toBe('perspective_submitted');
    expect(cycleEventIntentToType('PERSPECTIVE_SUBMITTED')).toBe('perspective_submitted');
    expect(cycleEventIntentToType('MISSION_REPORT')).toBeNull();
  });

  it('enforces frozen cycle phase transitions', () => {
    expect(allowedCycleTransitionsFrom(null)).toEqual(['seat_taken']);
    expect(allowedCycleTransitionsFrom('seat_taken')).toEqual(['perspective_submitted']);
    expect(allowedCycleTransitionsFrom('perspective_submitted')).toEqual(['synthesis_returned']);
    expect(allowedCycleTransitionsFrom('synthesis_returned')).toEqual(['lens_upgraded']);
    expect(allowedCycleTransitionsFrom('lens_upgraded')).toEqual([
      'seat_taken',
      'perspective_submitted'
    ]);

    expect(isAllowedCycleTransition(null, 'seat_taken')).toBe(true);
    expect(isAllowedCycleTransition('seat_taken', 'synthesis_returned')).toBe(false);
    expect(isAllowedCycleTransition('synthesis_returned', 'lens_upgraded')).toBe(true);
  });
});
