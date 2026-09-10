import { Link } from 'react-router';
import { PublicLayout } from '@/components/layout/PublicLayout';

const effectiveDate = 'September 9, 2026';

export function PrivacyPolicyPage() {
  return (
    <PublicLayout>
      <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
          <p className="text-sm font-semibold uppercase tracking-wider text-navy-600">
            Public privacy notice
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
            BusSafe Alberta privacy policy
          </h1>
          <p className="mt-3 text-sm text-slate-500">Effective {effectiveDate}</p>

          <div className="mt-8 space-y-8 text-base leading-7 text-slate-700">
            <section>
              <h2 className="text-xl font-bold text-slate-950">What BusSafe does</h2>
              <p className="mt-2">
                BusSafe Alberta supports school transportation operations and gives authorized
                guardians narrow visibility of the bus assigned to their student. Our governing
                principle is simple: track the bus, not the child. We do not track a student phone,
                wearable, or personal GPS device.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-950">Information we handle</h2>
              <ul className="mt-2 list-disc space-y-2 pl-6">
                <li>Account identity, role, name, email, and optional work contact details.</li>
                <li>
                  The minimum student transportation record supplied by a school authority,
                  including name, grade, school, route, stop, and authorized guardian links.
                </li>
                <li>Bus, route, assignment, trip, pickup, drop-off, and security audit records.</li>
                <li>
                  Bus location reported by an authorized driver during an active trip, including
                  required offline recovery. Collection stops when the trip ends or is cancelled.
                </li>
                <li>
                  Notification choices and, after opt-in, an Android installation identifier, device
                  model, permission state, and Firebase Cloud Messaging token.
                </li>
              </ul>
              <p className="mt-3">
                BusSafe does not require an Alberta Student Number, student home address, student
                health data, custody narrative, contacts, photos, messages, microphone content, or
                information from other apps.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-950">Why we use it</h2>
              <p className="mt-2">
                We use the information only to authenticate invited users, operate transportation,
                maintain authorized bus visibility, deliver notifications users have enabled,
                support the service, and meet security, audit, and legal obligations. We do not sell
                personal information, serve advertising, or build advertising profiles.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-950">Who processes it</h2>
              <p className="mt-2">
                The issuing school authority and its authorized transportation staff use BusSafe.
                Service providers support hosting and authentication (Supabase), application
                delivery (Netlify), map tiles (Geoapify), transactional email, and opt-in Android
                push delivery (Google Firebase Cloud Messaging). Access is limited to what is needed
                to provide each service. Push previews exclude names, routes, stops, coordinates,
                driver identity, tenant identifiers, and internal identifiers.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-950">Location and retention</h2>
              <p className="mt-2">
                Core application records are intended to be stored in Canada. Some supporting
                providers may process limited request or delivery metadata outside Canada. Raw bus
                location history is scheduled for deletion after 30 days, notifications after 90
                days, and operational identity or trip records according to the issuing school
                authority&apos;s approved retention schedule. Records may be retained longer when
                required by law, an active investigation, or a legal hold.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-950">Your choices and requests</h2>
              <p className="mt-2">
                Android push and guardian email notifications are off until enabled. You can turn
                them off and revoke registered devices from notification settings. To access,
                correct, or delete an account or associated information, start with the school
                authority that issued the invitation. BusSafe assists the authority after identity
                and legal-retention requirements are verified.
              </p>
              <Link
                to="/account-deletion"
                className="mt-4 inline-flex font-semibold text-navy-700 underline underline-offset-4"
              >
                Account deletion instructions
              </Link>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-950">Security and changes</h2>
              <p className="mt-2">
                BusSafe uses encryption in transit, role-based access, tenant isolation, restricted
                administrative access, and audit records. We will update this notice when material
                practices change and will communicate significant changes through the issuing school
                authority or the app.
              </p>
            </section>

            <section id="contact" className="scroll-mt-24 rounded-xl bg-slate-50 p-5">
              <h2 className="text-xl font-bold text-slate-950">Contact</h2>
              <p className="mt-2">
                Contact the privacy office or transportation office of the school authority that
                issued your BusSafe account. If that channel is unavailable, use the verified
                developer contact displayed on the BusSafe Alberta Google Play listing and include
                the name of your school authority. Do not send student health, address, custody, or
                other unnecessary sensitive information.
              </p>
            </section>
          </div>
        </div>
      </main>
    </PublicLayout>
  );
}
