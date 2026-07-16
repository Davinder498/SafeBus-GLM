# Phase 16A — Secure Student QR Boarding Foundation

Implemented for review on `phase-16a-secure-student-qr-boarding-foundation`.

Repository findings: driver event recording already uses `mark_student_picked_up_for_active_trip` / `mark_student_dropped_off_for_active_trip`, which delegate to the secured active-trip event workflow and enqueue existing guardian notification outbox rows. The manifest is loaded through `get_driver_active_trip_student_manifest`. No active QR credential table existed in current migrations; older docs treated QR as future scope.

Design: `student_qr_credentials` stores tenant id, student id, SHA-256 token hash, lifecycle status, creator/revoker, timestamps, and replacement linkage. It stores no student names, guardian data, route/stop/bus/driver data, QR image, or raw token. One active credential per student is enforced. Tenant operational admins can generate, rotate, and revoke; Platform Super Admin, guardians, and drivers are denied.

Scan model: `resolve_student_qr_for_active_trip(token)` hashes the opaque token, requires an authenticated active driver trip, verifies same tenant, active credential, active student, active assignment on the trip route/bus, and returns only manifest-level context plus the next valid event. The UI requires driver confirmation and then reuses the existing secured event RPC, so duplicate/drop-off-before-pickup and notification behavior remain unchanged.

Camera: the driver UI uses browser-native `BarcodeDetector` with `getUserMedia`, rear-camera preference, secure-context checks, permission/no-camera states, cleanup on close/unmount, and debounce. No frames are uploaded or stored. DEV/manual token entry is present only for QA/accessibility fallback.

Known limitation: reusable printed QR badges can be copied. Phase 16A does not add anti-copy physical security, NFC/RFID, offline sync, badge designer, analytics, or later-phase scan history.

Hosted-DEV, Netlify deploy-preview, and manual acceptance remain pending product-owner validation.
