// Approved SafeBus CAD tariff; cents per active bus, including applicable GST/HST.
// Owner decision 2026-11-09. A change in amounts requires a new explicit
// business decision; administrative catalog forms are not price approval.
export const APPROVED_BUS_PRICE_CENTS = Object.freeze({ month: 199, year: 2029 });

export function isApprovedBusAmount(interval, cents) {
  return Object.hasOwn(APPROVED_BUS_PRICE_CENTS, interval) &&
    APPROVED_BUS_PRICE_CENTS[interval] === cents;
}

export function isApprovedInclusiveBusPrice(price) {
  return price?.currency === 'cad' &&
    price.tax_behavior === 'inclusive' &&
    isApprovedBusAmount(price.recurring?.interval, price.unit_amount);
}
