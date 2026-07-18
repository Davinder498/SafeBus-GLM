import { Link } from 'react-router-dom';
import {
  Bus,
  Eye,
  Navigation,
  ShieldCheck,
  ClipboardCheck,
  UserCircle,
  ArrowRight,
  CheckCircle2,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { Card } from '@/components/ui/Card';

interface FeatureSection {
  id: string;
  title: string;
  body: string;
  icon: ReactNode;
}

const sections: FeatureSection[] = [
  {
    id: 'parents',
    title: 'Parent visibility without exposing the full route',
    body: 'Parents see only their assigned bus during active trips, with simple pickup, delay, and drop-off status.',
    icon: <UserCircle className="h-6 w-6" />,
  },
  {
    id: 'drivers',
    title: 'A parked-bus friendly driver app',
    body: 'Drivers get a focused trip screen with large actions, assigned stops, GPS status placeholders, and delay reporting.',
    icon: <Navigation className="h-6 w-6" />,
  },
  {
    id: 'admins',
    title: 'Operational control for transportation teams',
    body: 'Admins can monitor active trips, delayed buses, stale GPS status, confirmations, alerts, and route operations from one dashboard.',
    icon: <Eye className="h-6 w-6" />,
  },
  {
    id: 'confirmations',
    title: 'Pickup and drop-off confirmation',
    body: 'The MVP is designed around confirming transportation events while keeping student data limited and purposeful.',
    icon: <ClipboardCheck className="h-6 w-6" />,
  },
  {
    id: 'privacy',
    title: 'Privacy-first by design',
    body: 'SafeBus Alberta tracks the bus, not the child. It works alongside existing systems and does not replace PowerSchool.',
    icon: <ShieldCheck className="h-6 w-6" />,
  },
];

const heroSteps = ['Trip started', 'Pickup confirmed', 'Approaching school'];

export function LandingPage() {
  return (
    <PublicLayout>
      <main>
        {/* Hero */}
        <section className="relative overflow-hidden bg-navy-900 text-white">
          <div className="absolute inset-0 bg-gradient-to-br from-navy-900 via-navy-800 to-navy-950" />
          <div
            className="absolute inset-0 opacity-30"
            style={{
              backgroundImage:
                'radial-gradient(at 20% 20%, rgb(37 99 235 / 0.4) 0px, transparent 50%), radial-gradient(at 80% 10%, rgb(250 204 21 / 0.25) 0px, transparent 50%)',
            }}
          />
          <div className="relative mx-auto grid max-w-7xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:py-28">
            <div className="flex flex-col justify-center">
              <span className="inline-flex w-fit items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold text-yellow-300 backdrop-blur">
                <Bus className="h-3.5 w-3.5" /> School transportation visibility
              </span>
              <h1 className="mt-5 text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
                SafeBus <span className="text-yellow-400">Alberta</span>
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-8 text-navy-100">
                A transportation operations platform that helps Alberta schools reduce parent
                uncertainty, confirm bus events, and give administrators live operational visibility.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  to="/login"
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-yellow-400 px-5 py-3 font-bold text-navy-900 shadow-lg shadow-yellow-400/20 transition-all hover:bg-yellow-300 hover:shadow-yellow-400/30"
                >
                  Open demo <ArrowRight className="h-4 w-4" />
                </Link>
                <a
                  href="#pilot"
                  className="inline-flex items-center justify-center rounded-lg border border-white/25 px-5 py-3 font-semibold text-white backdrop-blur transition-colors hover:bg-white/10"
                >
                  Discuss pilot
                </a>
              </div>
            </div>

            {/* Floating mock card */}
            <div className="relative flex items-center justify-center">
              <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-white/10 p-4 shadow-2xl backdrop-blur-md">
                <div className="rounded-xl bg-white p-5 text-slate-900 shadow-xl">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Live trip</p>
                      <p className="text-2xl font-bold text-slate-900">Bus 12</p>
                    </div>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-success-50 px-3 py-1 text-xs font-semibold text-success-700 ring-1 ring-inset ring-success-200">
                      <span className="h-1.5 w-1.5 rounded-full bg-success-500" /> On route
                    </span>
                  </div>
                  <div className="mt-5 space-y-4">
                    {heroSteps.map((item, index) => (
                      <div key={item} className="flex items-center gap-3">
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-navy-50 text-sm font-bold text-navy-700 ring-1 ring-inset ring-navy-100">
                          {index + 1}
                        </span>
                        <p className="text-sm font-semibold text-slate-700">{item}</p>
                        {index === heroSteps.length - 1 && (
                          <CheckCircle2 className="ml-auto h-4 w-4 text-success-500" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Problem statement */}
        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-navy-600">The problem</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              Transportation teams need a calmer source of truth
            </h2>
            <p className="mt-4 text-base leading-7 text-slate-500">
              SafeBus Alberta focuses on bus operations, parent confidence, and confirmation events. It is
              not a full school management system and does not replace existing student information workflows.
            </p>
          </div>
        </section>

        {/* Feature grid */}
        <section className="bg-slate-50">
          <div className="mx-auto grid max-w-7xl gap-5 px-4 py-16 sm:px-6 md:grid-cols-2 lg:px-8">
            {sections.map((section) => (
              <Card key={section.id} id={section.id} interactive className="p-6">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-navy-50 text-navy-600 ring-1 ring-inset ring-navy-100">
                    {section.icon}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-lg font-bold text-slate-900">{section.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-500">{section.body}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section id="pilot" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-2xl bg-navy-800 p-8 text-white shadow-xl sm:p-12">
            <div
              className="absolute inset-0 opacity-40"
              style={{
                backgroundImage:
                  'radial-gradient(at 90% 10%, rgb(37 99 235 / 0.5) 0px, transparent 50%)',
              }}
            />
            <div className="relative">
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                Pilot the transportation visibility workflow
              </h2>
              <p className="mt-3 max-w-2xl text-navy-100">
                Use this demo foundation to evaluate the admin, driver, and parent experience before adding
                real authentication, GPS, scanning, notifications, or integrations in later milestones.
              </p>
              <Link
                to="/login"
                className="mt-6 inline-flex items-center gap-2 rounded-lg bg-white px-5 py-3 font-bold text-navy-900 shadow-lg transition-colors hover:bg-navy-50"
              >
                View demo portals <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>
      </main>
    </PublicLayout>
  );
}