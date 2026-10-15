# Owner Decisions Before Signing or Publication

**Status:** Decision worksheet; no choices below are accepted by this document
**Prepared:** 2026-10-13

The owner requested placeholders for public business identity and contact
details. Use the same resolved values throughout the final pack; keep
customer-specific values and signed copies outside Git.

| Input                                                                   | Draft treatment                                                                     | Required decision/evidence                                                                                                                |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `[PROVIDER_LEGAL_NAME]`, `[PROVIDER_BUSINESS_ADDRESS]`                  | Unfilled                                                                            | Exact contracting entity or proprietor/trade-name formulation, registration and signing authority                                         |
| `[PRIVACY_EMAIL]`, `[SUPPORT_EMAIL]`, `[NOTICE_EMAIL]`                  | Unfilled                                                                            | Working, monitored business channels and backup routing                                                                                   |
| `[PRIVACY_LEAD]`, `[PRIVACY_BACKUP]`                                    | Role placeholders                                                                   | Owner's explicit appointment and capable backup; personal details outside Git                                                             |
| `[EFFECTIVE_DATE]`, `[PUBLIC_POLICY_URL]`, `[DELETION_URL]`             | No effective or publication date                                                    | Approved wording, working public HTTPS pages and contact paths                                                                            |
| `[CUSTOMER_LEGAL_NAME]`, customer privacy contacts and signatory        | Unfilled                                                                            | Customer onboarding inputs; not needed to write the business drafts                                                                       |
| `[ANNUAL_PER_BUS_CAD]`, `[CONTRACTED_BUS_COUNT]`                        | Annual per-bus CAD model from the Stripe runbook                                    | Price, definition of billable bus and allowance; avoid confusing registered users with licensed buses                                     |
| Tax registration, `[APPLICABLE_TAXES]`, exemptions                      | No assumed tax rate or exemption                                                    | Finance/tax review, invoice configuration and applicable customer documentation                                                           |
| Invoice/payment period                                                  | Proposed 30 calendar days                                                           | Owner approval and customer acceptance; align with Stripe collection terms                                                                |
| Initial term and renewal                                                | Proposed 12 months; renewal election in order form                                  | Auto-renewal choice, notice period, price-change notice and Stripe configuration                                                          |
| Bus-count changes/proration                                             | Written change order before billing change                                          | Define effective date, approved credit/debit method and evidence of customer authorization                                                |
| Non-payment                                                             | Written escalation; no automated operational suspension                             | Approved suspension notice/process; billing state never automatically disables a tenant                                                   |
| `[GENERAL_LIABILITY_CAP]`, `[PRIVACY_LIABILITY_CAP]`                    | No selected amounts                                                                 | Owner risk/insurance review, customer negotiation and legal review of exclusions                                                          |
| Insurance                                                               | No certification or policy assertion                                                | Required types/limits, policy evidence and contractual representations                                                                    |
| `[SUPPORT_HOURS]`, timezone and holidays                                | Unfilled                                                                            | Staffed hours, emergency channel and backup coverage; do not promise 24/7 service by default                                              |
| Availability, latency, GPS freshness and notification targets | All unapproved; recovery commitments excluded from this launch review | Evidence for any selected promise; architecture review does not establish measured capacity |
| Credit rates/cap                                                        | Unfilled                                                                            | Commercial remedy and claim process after service targets are approved                                                                    |
| Incident notification                                                   | Proposed initial customer notice within 24 hours of awareness, sooner when required | Operational capability and applicable legal/contract deadlines; never wait for final forensics or counsel appointment to contain/escalate |
| Supplier/cross-border list                                              | Known/proposed suppliers; locations unverified                                      | Actual agreements, countries, retention/logging, security review, customer approval and required notices                                  |
| Retention                                                               | Existing proposed periods; not activated                                            | Purpose, legal duties/holds, approved schedule, enforcement tests and separate backup windows                                             |
| Return/deletion                                                         | Proposed 30-day return request and 60-day primary deletion windows                  | Tested export/deletion workflow, feasible supplier cleanup and approved backup handling                                                   |
| Customer PIA/signatures                                                 | Deferred until onboarding                                                           | Public-body status, collection authority, deployment scope and head/delegate sign-off where required                                      |

## Review order

1. Review the business privacy policy and identity/contact inputs.
2. Review service scope, annual per-bus price, tax treatment, renewal and payment.
3. Review data-processing, security, liability and exit terms together.
4. Complete service targets only after operational evidence supports them.
5. Adapt the PIA and participant notices for each customer; review supplier and
   retention decisions before signing or publication.
6. Record approvals with real evidence. Under DL-023 a sourced legal assessment
   replaces blanket counsel signoff; any customer-specific specialist-review term
   is addressed at onboarding.

Owner approval of a draft business position does not record a customer signature,
make a technical safeguard pass, or activate the Point 6 launch record.
