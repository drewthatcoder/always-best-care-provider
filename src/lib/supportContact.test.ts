import { describe, expect, it } from 'vitest';
import {
  ALWAYS_BEST_CARE_PHONE_DISPLAY,
  ALWAYS_BEST_CARE_PHONE_E164,
  alwaysBestCareTelHref,
} from './supportContact';

describe('Always Best Care phone', () => {
  it('uses one E.164 number and the (916) display form', () => {
    expect(ALWAYS_BEST_CARE_PHONE_E164).toBe('+19168841983');
    expect(ALWAYS_BEST_CARE_PHONE_DISPLAY).toBe('(916) 884-1983');
    expect(alwaysBestCareTelHref).toBe('tel:+19168841983');
    expect(alwaysBestCareTelHref).toContain(ALWAYS_BEST_CARE_PHONE_E164);
  });
});
