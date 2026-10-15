const sectionClass = 'scroll-mt-24 rounded-xl border border-slate-200 p-5';

/** Public explanations: no account or transportation query is needed. */
export function RolePrivacyNotices() {
  return (
    <>
      <nav aria-label="Privacy notice sections" className="rounded-xl bg-slate-50 p-5">
        <h2 className="font-bold text-slate-950">Find your privacy notice</h2>
        <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-3 font-semibold text-navy-700">
          <li>
            <a className="underline underline-offset-4" href="#tenant-administrators">
              Tenant administrators
            </a>
          </li>
          <li>
            <a className="underline underline-offset-4" href="#guardians">
              Guardians
            </a>
          </li>
          <li>
            <a className="underline underline-offset-4" href="#drivers">
              Drivers
            </a>
          </li>
          <li>
            <a className="underline underline-offset-4" href="#contact">
              Privacy questions
            </a>
          </li>
        </ul>
      </nav>
      <section
        id="tenant-administrators"
        className={sectionClass}
        aria-labelledby="tenant-privacy-heading"
      >
        <h2 id="tenant-privacy-heading" className="text-xl font-bold text-slate-950">
          Tenant administrator privacy notice
        </h2>
        <p className="mt-2">
          We use your name, email, role, organization, account/session information and necessary
          audit records to administer authorized transportation access. Billing contacts,
          subscription and invoice information support the business relationship; payment methods
          are handled by Stripe.
        </p>
        <p className="mt-3">
          Your organization directs its transportation records and determines the lawful purpose,
          collection notice, authorized staff and verified guardian relationships. SafeBus provides
          the software and processes those records on its instructions. Ownership of SafeBus does
          not transfer ownership of your organization or its records.
        </p>
        <p className="mt-3">
          Use only the minimum information needed, keep assignments and access current, and remove
          access when responsibilities change. Do not place student health, home-address or custody
          information in rosters, notes or support messages. Route transportation record requests to
          your organization's privacy office; contact SafeBus about its own business records or
          privacy practices. Reading this notice does not replace your organization's agreement or
          legal authority to use the service.
        </p>
      </section>
      <section id="guardians" className={sectionClass} aria-labelledby="guardian-privacy-heading">
        <h2 id="guardian-privacy-heading" className="text-xl font-bold text-slate-950">
          Guardian privacy notice
        </h2>
        <p className="mt-2">
          Your account name, email, authorized student links, session information and notification
          choices let us show the assigned bus and the minimum linked-student transportation
          information. Your organization supplies or verifies the student name, school, grade and
          transport assignment. Guardians do not receive other families' student lists or a driver's
          complete location history.
        </p>
        <p className="mt-3">
          You do not need to share your phone's GPS to see the bus. The map represents the bus, not
          your child's phone or current whereabouts. A pickup/drop-off entry records an operational
          action; it is not continuous child tracking. If you enable event emails, they may include
          your student's first name, the recorded event and its time.
        </p>
        <p className="mt-3">
          Manage optional notifications in settings. Ask the issuing organization's privacy office
          to correct a student link or transportation record, or to handle an access or deletion
          request. SafeBus can assist with routing and handles requests about its own business
          information. You can read this notice and deletion instructions without signing in.
        </p>
      </section>
      <section id="drivers" className={sectionClass} aria-labelledby="driver-privacy-heading">
        <h2 id="driver-privacy-heading" className="text-xl font-bold text-slate-950">
          Driver privacy notice
        </h2>
        <p className="mt-2">
          We use your account identity, role, assignments, session/device information and trip
          records to operate your assigned bus service. The authorized driver phone supplies precise
          location, timestamps, accuracy and movement information during collection for an active
          trip. This can identify your work location, even though the bus is the tracked unit.
          Authorized staff and linked guardians receive their permitted view.
        </p>
        <p className="mt-3">
          Android collection can continue in the background or with the screen locked, with the
          foreground-service notification. Pausing or ending collection stops new fixes; previously
          collected records may still be sent from the protected offline queue when delivery is
          authorized. Removing network access is not the same as deleting queued records. An offline
          phone cannot be assumed to receive revocation immediately.
        </p>
        <p className="mt-3">
          Camera access supports scanning a bus QR code. Manage permissions in your phone's
          settings; withdrawing location access interrupts tracking. Discuss work requirements, a
          personal-phone alternative and privacy questions with your employer or transport
          organization. SafeBus supplies the software and does not become your employer. Report a
          lost or compromised device promptly. Never operate the app while driving.
        </p>
        <p className="mt-3">
          Your organization handles requests about its driver/transportation records; SafeBus
          handles its own business information and can help route concerns. We do not use trip
          location for advertising or unrelated off-shift monitoring.
        </p>
      </section>
    </>
  );
}
