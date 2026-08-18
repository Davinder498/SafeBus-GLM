# Point 10 Accessibility Acceptance

**Status:** Automated baseline implemented; manual acceptance pending

## Automated gate

Run:

```bash
pnpm test:accessibility
```

The gate uses axe-core with WCAG 2.0 A/AA, WCAG 2.1 A/AA, and WCAG 2.2 AA
rules. It runs against desktop and mobile Chromium with reduced motion enabled
and fails when a scanned surface contains an automated A/AA violation.

Representative CR1 coverage includes:

- public landing and sign-in;
- tenant-admin transportation overview and trip history;
- driver bus scan and active trip; and
- guardian live bus status.

All Supabase traffic is intercepted with deterministic browser fixtures. The
gate never uses production credentials, calls the hosted database, or writes
customer data.

## Manual acceptance still required

Automated tools cannot establish WCAG conformance. Before Point 10 approval,
record evidence for all CR1 workflows using:

- keyboard-only navigation at 320 CSS pixels and 200% zoom;
- NVDA with current Chrome on Windows;
- VoiceOver with current Safari on an approved Apple test device;
- focus order, focus visibility, dialog focus containment and restoration;
- form instructions, errors, status announcements, tables, maps, and timeout
  behavior; and
- a human WCAG 2.2 AA review with every finding resolved or assigned an
  approved owner and deadline.

Point 10 remains open until this manual evidence and the separate authenticated
end-to-end, resilience, and load evidence are approved.
