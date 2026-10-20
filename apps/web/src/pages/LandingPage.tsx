import { Link } from 'react-router';
import { Bus, ArrowRight } from 'lucide-react';
import { PublicLayout } from '@/components/layout/PublicLayout';
import winterMorningHero from '@/assets/hero-winter-morning.webp';
import notificationsPhoto from '@/assets/feature-notifications.webp';
import etaPhoto from '@/assets/feature-eta.webp';
import trackingPhoto from '@/assets/feature-tracking.webp';
import privacyPhoto from '@/assets/feature-privacy.webp';
import managementPhoto from '@/assets/feature-management.webp';

interface FeatureSection {
  id: string;
  title: string;
  body: string;
  image: string;
  imageAlt: string;
}

const sections: FeatureSection[] = [
  {
    id: 'notifications',
    title: 'Pickup and drop-off notifications',
    body: 'Receive notifications when pickup and drop-off events are confirmed, helping your family stay informed throughout the school journey.',
    image: notificationsPhoto,
    imageAlt: 'A parent checking a phone beside a parked yellow school bus.',
  },
  {
    id: 'eta',
    title: 'Estimated arrival times',
    body: 'See an estimated arrival time for your assigned bus, helping you plan for pickup with less uncertainty.',
    image: etaPhoto,
    imageAlt: 'A parent checking a phone at a bus stop on a spring morning.',
  },
  {
    id: 'tracking',
    title: 'Live bus tracking',
    body: 'View your assigned bus\u2019s location during active trips and follow its progress toward your stop.',
    image: trackingPhoto,
    imageAlt: 'An elevated view of a yellow school bus on an Alberta prairie road in autumn.',
  },
  {
    id: 'privacy',
    title: 'Access limited to your assigned bus',
    body: 'Parents can only view their assigned bus and linked transportation information, keeping other families\u2019 details private.',
    image: privacyPhoto,
    imageAlt: 'A parent using a phone privately at a kitchen table in natural daylight.',
  },
  {
    id: 'management',
    title: 'Easier transportation management',
    body: 'Manage buses, routes, driver assignments, and daily transportation activity from one place.',
    image: managementPhoto,
    imageAlt:
      'Transportation coordinators working together in a dispatch office overlooking parked buses.',
  },
];

export function LandingPage() {
  return (
    <PublicLayout>
      <main>
        {/* Hero */}
        <section className="relative overflow-hidden bg-navy-900 text-white">
          <img
            src={winterMorningHero}
            alt=""
            aria-hidden="true"
            fetchPriority="high"
            className="absolute inset-0 h-full w-full object-cover object-[65%_center] lg:object-center"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-navy-950/70 lg:bg-gradient-to-r lg:from-navy-950/95 lg:via-navy-950/65 lg:to-navy-950/10 lg:bg-transparent"
          />
          <div className="relative mx-auto flex max-w-7xl px-4 py-20 sm:px-6 lg:min-h-[42rem] lg:px-8 lg:py-12">
            <div className="flex max-w-xl flex-col justify-center">
              <span className="inline-flex w-fit items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold text-yellow-300 backdrop-blur">
                <Bus className="h-3.5 w-3.5" /> School transportation visibility
              </span>
              <h1 className="mt-5 text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
                <span className="text-yellow-400">SafeBus</span>
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-8 text-navy-100">
                A transportation operations platform that helps Alberta schools reduce parent
                uncertainty, confirm bus events, and give administrators live operational
                visibility.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  to="/contact"
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-yellow-400 px-5 py-3 font-bold text-navy-900 shadow-lg shadow-yellow-400/20 transition-all hover:bg-yellow-300 hover:shadow-yellow-400/30"
                >
                  Request a consultation <ArrowRight className="h-4 w-4" />
                </Link>
                <a
                  href="#capabilities"
                  className="inline-flex items-center justify-center rounded-lg border border-white/25 px-5 py-3 font-semibold text-white backdrop-blur transition-colors hover:bg-white/10"
                >
                  Explore capabilities
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* Problem statement */}
        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-navy-600">
              The problem
            </p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              Transportation teams need a calmer source of truth
            </h2>
            <p className="mt-4 text-base leading-7 text-slate-500">
              SafeBus focuses on bus operations, parent confidence, and confirmation events. It is
              not a full school management system and does not replace existing student information
              workflows.
            </p>
          </div>
        </section>

        {/* Features */}
        <section
          id="capabilities"
          aria-labelledby="features-heading"
          className="scroll-mt-24 bg-slate-50"
        >
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
            <h2
              id="features-heading"
              className="mx-auto mb-12 max-w-3xl text-center text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl lg:mb-16"
            >
              Features built for school transportation
            </h2>
            <div className="space-y-8 lg:space-y-10">
              {sections.map((section, index) => (
                <article
                  key={section.id}
                  id={section.id}
                  aria-labelledby={`${section.id}-heading`}
                  className="grid scroll-mt-24 overflow-hidden bg-white lg:grid-cols-2"
                >
                  <div
                    className={`relative aspect-[16/10] bg-navy-50 lg:aspect-auto ${index % 2 === 1 ? 'lg:order-2' : ''}`}
                  >
                    <img
                      src={section.image}
                      alt={section.imageAlt}
                      width={1200}
                      height={900}
                      loading="lazy"
                      decoding="async"
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  </div>
                  <div
                    className={`flex min-w-0 flex-col justify-center px-6 py-8 sm:p-10 lg:p-12 ${index % 2 === 1 ? 'lg:order-1' : ''}`}
                  >
                    <h3
                      id={`${section.id}-heading`}
                      className="max-w-xl text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl"
                    >
                      {section.title}
                    </h3>
                    <p className="mt-4 max-w-xl text-lg leading-8 text-slate-600">{section.body}</p>
                  </div>
                </article>
              ))}
            </div>
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
                Evaluate the admin, driver, and parent experience. Commercial operation remains
                gated by security, privacy, reliability, and pilot approval.
              </p>
              <Link
                to="/contact"
                className="mt-6 inline-flex items-center gap-2 rounded-lg bg-white px-5 py-3 font-bold text-navy-900 shadow-lg transition-colors hover:bg-navy-50"
              >
                Discuss a pilot <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>
      </main>
    </PublicLayout>
  );
}
