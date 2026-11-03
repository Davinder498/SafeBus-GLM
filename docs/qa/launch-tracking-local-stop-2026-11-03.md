# Launch correction: immediate local location stop

Scope: the first launch-correction milestone fixes confirmed pause/end/cancel
requests that previously waited for the network before stopping this phone's
location collection. Queue/session rotation, retention, date-effective driver
selection, directory loading, password errors and Android publication remain
subsequent milestones. iOS remains separately scoped under DL-017.

## Acceptance defined before implementation

| User                   | Permitted behavior                                                             | Scope and failure behavior                                                                                                                                                                                                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Driver                 | Confirm pause/end/cancel; stop local collection even when the trip cannot load | Stop the phone's collector before any server fetch or mutation. Persist Android collection-off state. Keep queued locations. A server failure never resumes collection or reports a completed trip. A local-stop failure never reports that location is off. Optional MFA enrollment is unchanged. |
| Guardian               | View only linked students' assigned buses and authorized trip state            | No driver action or collector controls. An offline driver action is not advertised as a server-confirmed trip change. Existing recipient choices and channels remain.                                                                                                                              |
| School authority admin | Existing school-authority transportation visibility and permitted management   | No new driver endpoint or scope. Privileged MFA remains required.                                                                                                                                                                                                                                  |
| School-scoped admin    | Existing assigned-school visibility and permitted management                   | No new cross-school visibility or driver endpoint. Privileged MFA remains required.                                                                                                                                                                                                                |
| Transportation admin   | Existing permitted transportation actions within the school authority          | Server-authoritative action permissions remain; local phone stop does not grant trip mutation access. Privileged MFA remains required.                                                                                                                                                             |
| Platform admin         | Existing platform controls                                                     | No new driver data or trip action access. Privileged MFA remains required.                                                                                                                                                                                                                         |

Local collection stop is a privacy action, not a notification source. Only
successful existing server trip mutations can create their existing trip events;
this change must not fabricate an event, subscribe a recipient, bypass consent,
change delivery channels or send an external notification during QA.

## Verification cases

- Pause/end/cancel each stop locally before a delayed, failing or successful
  server preflight. Canceling the confirmation itself stops nothing.
- A failed local stop blocks the server mutation and displays an actionable
  error. A failed server action leaves collection off and supports explicit retry.
- A trip loading failure or indefinitely pending request does not hide local stop.
- Stop/pause cross the native bridge without awaiting a cached-session read or
  refresh. Resume/status still require the caller's authenticated scope.
- A stop cancels an older resume/activation awaiting Auth, device registration
  or binding. Only a new explicit start/resume can restart collection.
- Android persists collection off before acknowledging pause/stop. Pending
  locations remain stored; restarting the app must not resume collection. Recovery
  across credential/session rotation remains a separate unresolved correction.
- Existing account, role, tenant and school boundaries remain covered by the
  shared authorization tests. No production fixture writes or real notifications.

## Release boundary

Use a feature-branch PR and human merge review. No production database migration
is needed for this milestone. Physical-device airplane-mode, process-restart,
foreground-notice and queued-delivery acceptance must be recorded against the
reviewed signed Android candidate; local tests and Capacitor sync do not prove
those results.
