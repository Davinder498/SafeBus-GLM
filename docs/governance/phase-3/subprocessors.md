# SafeBus Supplier Register and Residency Review — Draft

**Status:** Inventory updated; actual vendor agreements, countries and approval pending
**Owner:** Business Privacy Lead / Product / Security
**Last updated:** 2026-10-13

## Register and role

The proposed [supplier disclosure](business-pack/supplier-disclosure.md) lists
Supabase, Netlify, Resend/selected email, Geoapify, Stripe, GitHub recovery-artifact
transfer, owner recovery storage and separately gated/optional services. It is
not an approved public statement. Differentiate transport subprocessors from
SafeBus own-business financial, inquiry and support suppliers. Record the actual
legal vendor and role in the executed appendix, not just a product brand.

| Service                       | Information/risks to inspect                                                                   | Current decision                                                                                        |
| ----------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Supabase database/Auth        | Customer records/sessions; primary region, backups, support/managed logs and downstream access | Canadian primary region intended; full evidence/agreement pending                                       |
| Netlify website/CDN/functions | Personal request content and IP/log metadata; execution/CDN/log countries and stored copies    | Country, contract and log/retention review pending; no blanket no-at-rest claim                         |
| Email vendor                  | Invites, event emails, business inquiries, recipient/content and provider delivery history     | Actual enabled service and country/DPA/retention decisions pending                                      |
| Geoapify                      | Viewport tile coordinates, IP/referrer/metadata, quota/key controls                            | Selected provider; contract, restricted key, paid SLA and privacy/country evidence pending              |
| Stripe                        | Contract/billing contact, PO/subscription/invoice/payment details and provider metadata        | Own-business/financial role review pending; SafeBus projection excludes card/bank details               |
| GitHub artifact transfer      | Encrypted database/role exports and schema evidence; repository/build/release metadata         | Restricted artifact/country/retention review pending; transfer is not durable Canadian recovery storage |
| Owner recovery storage        | Off-site encrypted copies and separate private key custody                                     | Reported Canadian copy/checksum; custody/window/full restoration evidence needs review                  |
| Google FCM                    | Optional token and privacy-limited push/metadata                                               | Outside CR1 activation; default off until separate approved gates                                       |
| Monitoring/support tools      | Potential diagnostic/ticket personal data and access                                           | Selection and review pending; no new tooling approved here                                              |

## Per-supplier evidence checklist

- [ ] Actual legal entity, services, role and downstream suppliers established.
- [ ] Contract/DPA, confidentiality, acceptable purpose, incidents, request/audit
      assistance and return/deletion terms reviewed and accepted.
- [ ] Processing, storage, backup/log countries and remote-support access verified
      from actual terms/settings/evidence, including vendor jurisdiction risks.
- [ ] Data categories, necessary fields, payload minimization, logs and enabled
      feature scope match the final inventory and release.
- [ ] Safeguards, privilege/key boundaries, access review and relevant security
      findings assessed; a vendor certification is not full SafeBus acceptance.
- [ ] Retention/hold/disposal and exit windows are compatible with customer and
      business obligations; immutable backups and local/provider copies addressed.
- [ ] Cross-border law, customer instructions, required notice and permitted
      exception decision recorded; encryption does not automatically remove them.
- [ ] Service quotas/plans/outage recovery and appropriate cost ownership accepted
      where relevant to contractual commitments.

Use real dated non-secret references in Git; executed terms, personal contacts,
accounts, credentials and confidential reports remain in restricted storage.
A supplier is not approved because it appears in code or this register.

## Countries and notices

CR1 requires approved Canadian production/backup evidence. Database-region
settings do not settle CDN, functions, maps, email, invoices, support, logs or
GitHub transfer artifacts. Determine each actual flow and any permitted
cross-border arrangement before claiming Canadian-only processing. Required
PIPA foreign-service-provider policies/notices describe actual countries,
purposes and an accessible information/contact route.
[Alberta guidance](https://www.alberta.ca/organization-responsibilities-for-protecting-personal-information).

The earlier blanket foreign-flow exceptions were not approvals. Country and
contract decisions are still pending. Do not treat core customer/QA data already
held by the existing production-designated system as proof of commercial vendor
acceptance. Preserve existing data and use only the separately approved workflow.

## Changes and publication

For a new supplier, country, purpose or expanded feature, review the inventory,
PIA, safeguards, retention and contractual/notice effects before activation.
Follow the accepted DPA notification/objection process and obtain actual approvals.
Publish a resolved supplier disclosure only after the owner and relevant customer
privacy decisions pass. Optional push/monitoring/tools need their own approval;
this register does not authorize them.
