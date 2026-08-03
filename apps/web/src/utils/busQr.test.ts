import { describe, expect, it } from 'vitest';
import { BUS_QR_PREFIX, isLikelyBusQrToken, mapBusQrStartError } from './busQr';

describe('bus QR utilities', () => {
  it('accepts only opaque versioned bus tokens', () => {
    expect(isLikelyBusQrToken(`${BUS_QR_PREFIX}${'A'.repeat(43)}`)).toBe(true);
    expect(isLikelyBusQrToken(`  ${BUS_QR_PREFIX}${'a'.repeat(43)}  `)).toBe(true);
    expect(isLikelyBusQrToken('bus-id-or-json')).toBe(false);
    expect(isLikelyBusQrToken(`${BUS_QR_PREFIX}${'A'.repeat(39)}`)).toBe(false);
  });

  it('maps operational start failures without exposing internal identifiers', () => {
    expect(mapBusQrStartError('The selected route direction is not active today.')).toMatch(
      /no longer available/i,
    );
    expect(mapBusQrStartError('This bus already has an active trip.')).toMatch(/already/i);
    expect(
      mapBusQrStartError('The active bus run direction cannot be changed while resuming.'),
    ).toMatch(/resume/i);
    expect(mapBusQrStartError('database detail about credential row')).toBe(
      'This bus QR could not be verified or started.',
    );
  });
});
