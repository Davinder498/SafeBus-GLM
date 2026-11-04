import { MobileAppLinks } from '@/components/ui/MobileAppLinks';
import { CheckCircle2, Smartphone } from 'lucide-react';

interface MobileAccountReadyProps {
  passwordReset?: boolean;
}

export function MobileAccountReady({ passwordReset = false }: MobileAccountReadyProps) {
  return (
    <div className="mt-6 space-y-4" role="status" data-ui="mobile-account-ready">
      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-success-50 text-success-700">
        <CheckCircle2 className="h-6 w-6" aria-hidden />
      </span>
      <h2 className="text-2xl font-bold tracking-tight text-navy-900">
        {passwordReset ? 'Your password is updated' : 'Your account is ready'}
      </h2>
      <p className="text-gray-600">
        {passwordReset
          ? 'Your password has been saved.'
          : 'Your SafeBus account has been activated successfully.'}
        {' '}Open the SafeBus mobile app to sign in.
      </p>
      <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-navy-700" aria-hidden />
        <div>
          <p className="font-semibold text-navy-900">Continue in the SafeBus mobile app</p>
          <p className="mt-1 text-sm text-slate-600">
            Open the app installed on your phone and sign in using your invited email address
            and the password you just created. Drivers see the driver dashboard; parents and
            guardians see their family dashboard.
          </p>
        </div>
      </div>
      <p className="text-sm text-slate-600">
        Do not have the app installed? Contact your school authority for the approved SafeBus
        app installation instructions.
      </p>
      <MobileAppLinks />
    </div>
  );
}
