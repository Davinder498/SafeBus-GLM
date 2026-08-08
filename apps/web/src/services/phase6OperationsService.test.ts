import { describe, expect, it } from 'vitest';
import { operationalTextContainsProhibitedInformation } from './phase6OperationsService';

describe('Phase 6 controlled operational text', () => {
  it('accepts ordinary transportation facts', () => {
    expect(
      operationalTextContainsProhibitedInformation('Bus held at railway crossing for 6 minutes'),
    ).toBe(false);
    expect(operationalTextContainsProhibitedInformation('Replacement vehicle dispatched')).toBe(
      false,
    );
  });

  it.each([
    'Student ASN is 123456789',
    'Asthma medication is on board',
    'Custody instructions changed',
    'Home address is 123 Main Street',
    'Date of birth is recorded here',
    'Guardian phone number is 555-0100',
  ])('rejects prohibited content: %s', (value) => {
    expect(operationalTextContainsProhibitedInformation(value)).toBe(true);
  });
});
