import { Link } from 'react-router';
import { Bus, ArrowRight } from 'lucide-react';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { WhyChooseUsCarousel } from '@/components/marketing/WhyChooseUsCarousel';
import winterMorningHero from '@/assets/hero-winter-morning.webp';
import notificationsPhoto from '@/assets/feature-notifications-app.webp';
import liveMapIllustration from '@/assets/feature-live-map.webp';
import privacyPhoto from '@/assets/feature-privacy.webp';
import managementPhoto from '@/assets/feature-management.webp';
import driverTripPhoto from '@/assets/feature-driver-trip.webp';
import driverQrPhoto from '@/assets/feature-driver-qr.webp';

interface FeatureSection {
  id: string;
  audience: 'For guardians' | 'For schools' | 'For drivers';
  title: string;
  body: string;
  image: string;
  imageAlt: string;
  imageHeight: number;
  imagePosition: string;
}

const sections: FeatureSection[] = [
  {
    id: 'notifications',
    audience: 'For guardians',
    title: 'Pickup & drop-off notifications',
    body: 'Receive a notification when your child\u2019s pickup or drop-off is confirmed. Stay informed about these key moments throughout the school journey.',
    image: notificationsPhoto,
    imageAlt: 'Illustration of a mother viewing a pickup confirmation in a school-bus app.',
    imageHeight: 800,
    imagePosition: 'object-center',
  },
  {
    id: 'tracking',
    audience: 'For guardians',
    title: 'See the school bus live',
    body: 'See where your assigned school bus is during an active trip. Follow its progress toward your stop and plan your morning with less uncertainty.',
    image: liveMapIllustration,
    imageAlt: 'Illustrative map showing a yellow school bus along a route to school.',
    imageHeight: 800,
    imagePosition: 'object-center',
  },
  {
    id: 'management',
    audience: 'For schools',
    title: 'One platform for management',
    body: 'Manage buses, routes, and driver assignments in one place. Keep daily transportation activity organized and give your school team a clear view of operations.',
    image: managementPhoto,
    imageAlt: 'Two transportation staff working together at a computer in an office.',
    imageHeight: 900,
    imagePosition: 'object-[center_15%]',
  },
  {
    id: 'privacy',
    audience: 'For guardians',
    title: 'Only your assigned bus',
    body: 'Access is limited to your assigned bus and linked transportation information. Other families\u2019 details stay private, so you see only what is relevant to you.',
    image: privacyPhoto,
    imageAlt: 'A parent checking transportation information on her phone at home.',
    imageHeight: 900,
    imagePosition: 'object-[center_40%]',
  },
  {
    id: 'driver-trips',
    audience: 'For drivers',
    title: 'Easy trip handling',
    body: 'Start your trip by scanning the bus QR, then manage the journey from your phone. End the trip in the app when the run is complete.',
    image: driverTripPhoto,
    imageAlt: 'Illustration of a driver showing the trip-start screen inside a parked school bus.',
    imageHeight: 800,
    imagePosition: 'object-center',
  },
  {
    id: 'driver-qr',
    audience: 'For drivers',
    title: 'QR scan based operation',
    body: 'Choose pickup or drop-off mode and scan a student\u2019s QR pass to confirm the event. Keep each stop organized with a simple workflow linked to your active trip.',
    image: driverQrPhoto,
    imageAlt: 'Illustration of a driver scanning a QR pass to record pickup beside a parked bus.',
    imageHeight: 800,
    imagePosition: 'object-center',
  },
];

const featureGroups = [
  { id: 'guardian', label: 'For guardians', audiences: ['For guardians'] },
  { id: 'operations', label: 'For schools & drivers', audiences: ['For schools', 'For drivers'] },
] as const;

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
              <div className="mt-8 flex flex-col sm:flex-row">
                <Link
                  to="/contact"
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-yellow-400 px-5 py-3 font-bold text-navy-900 shadow-lg shadow-yellow-400/20 transition-all hover:bg-yellow-300 hover:shadow-yellow-400/30"
                >
                  Request a consultation <ArrowRight className="h-4 w-4" />
                </Link>
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
        <section aria-labelledby="features-heading" className="bg-slate-50">
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
            <div className="mx-auto mb-10 max-w-3xl text-center lg:mb-12">
              <h2
                id="features-heading"
                className="text-3xl font-bold tracking-tight text-navy-800 sm:text-4xl"
              >
                A smoother school journey starts here.
              </h2>
              <p className="mt-4 text-base leading-7 text-slate-600 sm:text-lg">
                Keep families informed and school transportation organized, from pickup to drop-off.
              </p>
            </div>
            <div className="space-y-12 lg:space-y-16">
              {featureGroups.map((group) => (
                <section key={group.id} aria-labelledby={`${group.id}-features-heading`}>
                  <h3
                    id={`${group.id}-features-heading`}
                    className="mb-5 text-sm font-semibold uppercase tracking-[0.1em] text-navy-600"
                  >
                    {group.label}
                  </h3>
                  <div className="grid gap-5 lg:grid-cols-3 lg:gap-6">
                    {sections
                      .filter((section) =>
                        group.audiences.some((audience) => section.audience === audience),
                      )
                      .map((section) => (
                        <article
                          key={section.id}
                          id={section.id}
                          aria-labelledby={`${section.id}-heading`}
                          className="min-w-0 scroll-mt-24 overflow-hidden rounded-xl bg-navy-800"
                        >
                          <img
                            src={section.image}
                            alt={section.imageAlt}
                            width={1200}
                            height={section.imageHeight}
                            loading="lazy"
                            decoding="async"
                            className={`h-48 w-full object-cover ${section.imagePosition}`}
                          />
                          <div className="p-6 sm:p-7">
                            {group.id === 'operations' && (
                              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.1em] text-navy-100">
                                {section.audience}
                              </p>
                            )}
                            <h4
                              id={`${section.id}-heading`}
                              className="text-xl font-bold tracking-tight text-yellow-400"
                            >
                              {section.title}
                            </h4>
                            <p className="mt-3 text-lg leading-8 text-white">{section.body}</p>
                          </div>
                        </article>
                      ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </section>

        {/* Why choose us */}
        <section
          id="why-choose-us"
          aria-labelledby="why-choose-us-heading"
          className="bg-yellow-50"
        >
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
            <div className="mx-auto max-w-3xl text-center">
              <h2
                id="why-choose-us-heading"
                className="text-3xl font-bold tracking-tight text-navy-800 sm:text-4xl"
              >
                Why choose us
              </h2>
            </div>
            <WhyChooseUsCarousel />
          </div>
        </section>
      </main>
    </PublicLayout>
  );
}
