# Point 11 Pilot Acceptance

Use non-secret evidence references only. Do not place student, guardian, or
driver data, customer contracts, contact details, credentials, provider keys,
raw locations, or incident contents in GitHub, workflow logs, or test artifacts.

The same authorized person may hold multiple internal roles, but each role
still requires an explicit final decision. Customer Authority must be an
authorized representative of the participating school authority and cannot be
self-approved by SafeBus.

## Authorization review

- [ ] Confirm Points 4 through 10 are finally approved with evidence links.
- [ ] Confirm the pilot is one to three approved public-school-authority tenants,
      25 to 100 buses, selected schools and participants, and at least 60
      operating days.
- [ ] Confirm the customer agreement, privacy/legal approvals, provider terms,
      support model, training, and communications are signed.
- [ ] Confirm primary and backup authorities can suspend and roll back
      immediately without further commercial approval.
- [ ] Run `pnpm pilot:digest` only after release-controlled source is final.
- [ ] Confirm every JSON approval reference resolves in the approved evidence
      system and contains an affirmative decision and date.
- [ ] Confirm authorization expires within 180 days and cannot authorize more
      than 100 buses or three tenants.

## Release-gate drill

- [ ] With the committed `not_authorized` record, confirm `pnpm pilot:verify`
      fails closed without accessing Supabase.
- [ ] In a disposable branch with synthetic approval references, confirm an
      open gate, expired date, missing approval, changed source, ceiling breach,
      or missing rollback authority is rejected.
- [ ] Confirm the protected production workflow requires
      `AUTHORIZE_CR1_PILOT` and verifies authorization before migration or
      application deployment.
- [ ] Remove the disposable branch and retain only non-secret drill evidence.

## Operating acceptance

- [ ] Record start date, authorized scope, daily operating evidence, support
      coverage, incidents, suspensions, changes, and stop decisions.
- [ ] Exercise immediate application suspension and protected rollback without
      destructive database recovery testing.
- [ ] Review thresholds weekly and stop when any mandatory trigger is met.
- [ ] At 60 operating days or authorization expiry, record a signed stop,
      limited extension, or separately reviewed expansion decision.
- [ ] Obtain Platform Administrator, Product Owner, Security, Privacy,
      Operations, Accessibility/QA, and customer-authority final decisions.
