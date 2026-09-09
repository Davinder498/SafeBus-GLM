import { Link } from 'react-router';
import { PublicLayout } from '@/components/layout/PublicLayout';

export function AccountDeletionPage() {
  return (
    <PublicLayout>
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
          <p className="text-sm font-semibold uppercase tracking-wider text-navy-600">
            Account and data request
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
            Request SafeBus account deletion
          </h1>
          <p className="mt-4 leading-7 text-slate-700">
            SafeBus accounts are created by invitation from a participating school authority. You
            can request deletion even if you no longer have the app or cannot sign in.
          </p>

          <ol className="mt-8 space-y-5">
            <li className="rounded-xl border border-slate-200 p-5">
              <p className="font-bold text-slate-950">1. Contact the issuing school authority</p>
              <p className="mt-2 leading-7 text-slate-700">
                Contact its privacy office, transportation office, or SafeBus administrator. State
                that you want the SafeBus account associated with your email address deleted. Do not
                include student health, home-address, custody, or other unnecessary sensitive
                information.
              </p>
            </li>
            <li className="rounded-xl border border-slate-200 p-5">
              <p className="font-bold text-slate-950">2. Complete identity verification</p>
              <p className="mt-2 leading-7 text-slate-700">
                The authority must verify that the request comes from the account holder or another
                authorized person before instructing SafeBus to act.
              </p>
            </li>
            <li className="rounded-xl border border-slate-200 p-5">
              <p className="font-bold text-slate-950">3. Receive confirmation</p>
              <p className="mt-2 leading-7 text-slate-700">
                The account, active sessions, device registrations, and personal information will be
                deleted or anonymized according to the approved retention process. The authority
                will explain any record that must be retained for transportation, audit, legal, or
                security obligations and will confirm when the request is complete.
              </p>
            </li>
          </ol>

          <div className="mt-8 rounded-xl bg-amber-50 p-5 text-sm leading-6 text-amber-950">
            If you cannot identify or reach the issuing authority, use the verified developer
            contact on the SafeBus Alberta Google Play listing. Include only your account email and
            school authority name so the request can be routed safely.
          </div>

          <Link
            to="/privacy"
            className="mt-8 inline-flex font-semibold text-navy-700 underline underline-offset-4"
          >
            Read the SafeBus Alberta privacy policy
          </Link>
        </div>
      </main>
    </PublicLayout>
  );
}
