import assert from 'node:assert/strict';
import test from 'node:test';
import { isApprovedBusAmount, isApprovedInclusiveBusPrice } from '../../apps/web/netlify/functions/approved-bus-pricing.mjs';

test('owner-approved monthly and annual amounts are immutable in code and tax inclusive', () => {
  assert.equal(isApprovedBusAmount('month', 199), true);
  assert.equal(isApprovedBusAmount('year', 2029), true);
  for (const [interval, amount] of [['month', 198], ['month', 200], ['year', 199], ['year', 2030], ['week', 199]]) {
    assert.equal(isApprovedBusAmount(interval, amount), false);
  }
  assert.equal(isApprovedInclusiveBusPrice({ currency: 'cad', tax_behavior: 'inclusive', unit_amount: 199, recurring: {interval:'month'} }),true);
  assert.equal(isApprovedInclusiveBusPrice({ currency: 'cad', tax_behavior: 'unspecified', unit_amount: 199, recurring: {interval:'month'} }),false);
  assert.equal(isApprovedInclusiveBusPrice({ currency: 'cad', tax_behavior: 'exclusive', unit_amount: 2029, recurring: {interval:'year'} }),false);
});
