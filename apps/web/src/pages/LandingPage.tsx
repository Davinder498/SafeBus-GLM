import { Link } from 'react-router-dom';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';

const sections = [
  {
    id: 'parents',
    title: 'Parent visibility without exposing the full route',
    body: 'Parents see only their assigned bus during active trips, with simple pickup, delay, and drop-off status.',
  },
  {
    id: 'drivers',
    title: 'A parked-bus friendly driver app',
    body: 'Drivers get a focused trip screen with large actions, assigned stops, GPS status placeholders, and delay reporting.',
  },
  {
    id: 'admins',
    title: 'Operational control for transportation teams',
    body: 'Admins can monitor active trips, delayed buses, stale GPS status, confirmations, alerts, and route operations from one dashboard.',
  },
  {
    id: 'confirmations',
    title: 'Pickup and drop-off confirmation',
    body: 'The MVP is designed around confirming transportation events while keeping student data limited and purposeful.',
  },
  {
    id: 'privacy',
    title: 'Privacy-first by design',
    body: 'SafeBus Alberta tracks the bus, not the child. It works alongside existing systems and does not replace PowerSchool.',
  },
];

export function LandingPage() {
  return (
    <PublicLayout>
      <main>
        <section className="bg-navy-900 text-white">
          <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:py-20">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.08em] text-yellow-300">
                School transportation visibility
              </p>
              <h1 className="mt-4 text-4xl font-bold tracking-normal sm:text-5xl lg:text-6xl">
                SafeBus Alberta
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-navy-100">
                A transportation operations platform that helps Alberta schools reduce parent
                uncertainty, confirm bus events, and give administrators live operational
                visibility.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  to="/login"
                  className="rounded-lg bg-yellow-400 px-5 py-3 text-center font-bold text-navy-900 hover:bg-yellow-300"
                >
                  Open demo
                </Link>
                <a
                  href="#pilot"
                  className="rounded-lg border border-white/30 px-5 py-3 text-center font-semibold text-white hover:bg-white/10"
                >
                  Discuss pilot
                </a>
              </div>
            </div>
            <div className="rounded-lg border border-white/15 bg-white/10 p-5 shadow-2xl">
              <div className="rounded-lg bg-white p-5 text-navy-900">
                <div className="flex items-center justify-between border-b border-gray-200 pb-4">
                  <div>
                    <p className="text-sm font-semibold text-gray-500">Live trip</p>
                    <p className="text-2xl font-bold">Bus 12</p>
                  </div>
                  <span className="rounded-full bg-success-50 px-3 py-1 text-sm font-semibold text-success-700">
                    On route
                  </span>
                </div>
                <div className="mt-5 space-y-4">
                  {['Trip started', 'Pickup confirmed', 'Approaching school'].map((item, index) => (
                    <div key={item} className="flex items-center gap-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-navy-100 text-sm font-bold text-navy-800">
                        {index + 1}
                      </span>
                      <p className="font-semibold">{item}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
          <PageHeader
            eyebrow="Problem"
            title="Transportation teams need a calmer source of truth"
            description="SafeBus Alberta focuses on bus operations, parent confidence, and confirmation events. It is not a full school management system and does not replace existing student information workflows."
          />
        </section>

        <section className="bg-gray-50">
          <div className="mx-auto grid max-w-7xl gap-5 px-4 py-14 sm:px-6 md:grid-cols-2 lg:px-8">
            {sections.map((section) => (
              <Card key={section.id} id={section.id} className="p-6">
                <h2 className="text-xl font-bold text-navy-900">{section.title}</h2>
                <p className="mt-3 leading-7 text-gray-600">{section.body}</p>
              </Card>
            ))}
          </div>
        </section>

        <section id="pilot" className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
          <div className="rounded-lg bg-navy-800 p-8 text-white sm:p-10">
            <h2 className="text-3xl font-bold tracking-normal">
              Pilot the transportation visibility workflow
            </h2>
            <p className="mt-3 max-w-3xl text-navy-100">
              Use this demo foundation to evaluate the admin, driver, and parent experience before
              adding real authentication, GPS, scanning, notifications, or integrations in later
              milestones.
            </p>
            <Link
              to="/login"
              className="mt-6 inline-flex rounded-lg bg-white px-5 py-3 font-bold text-navy-900 hover:bg-navy-50"
            >
              View demo portals
            </Link>
          </div>
        </section>
      </main>
    </PublicLayout>
  );
}
