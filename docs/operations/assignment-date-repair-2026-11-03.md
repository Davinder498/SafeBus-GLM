# Date-effective driver plan repair

Acceptance defined before implementation:
- School authority admins see the driver effective today in Alberta, regardless
  of API row order. Future and expired plans must not count as current coverage.
- Scheduled plans remain visible with their start date and editable in route
  setup. Start and end dates are inclusive; missing bounds remain unbounded.
- Explicit references to another bus service never qualify as legacy fallback.
- No change to driver QR eligibility, guardian visibility, school-scoped access,
  platform privileges, MFA, recipient channels or opt-outs. Retired school-admin
  and unsupported transportation roles receive no new access.
- Missing current coverage displays Not assigned; requests and writes retain
  their existing server-side scope and failure checks.
