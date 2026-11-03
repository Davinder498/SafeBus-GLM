import { Link } from 'react-router';
import {
  ArrowRight,
  BellRing,
  Building2,
  CheckCircle2,
  Clock3,
  MapPin,
  RadioTower,
  Route,
  ShieldCheck,
  GraduationCap,
  Smartphone,
} from 'lucide-react';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { WhyChooseUsCarousel } from '@/components/marketing/WhyChooseUsCarousel';
import winterMorningHero from '@/assets/hero-winter-morning.webp';
import parkedBusesPhoto from '@/assets/why-choose-us-parked-buses.webp';
import managementPhoto from '@/assets/feature-management.webp';
import familyPhoto from '@/assets/feature-privacy.webp';
import arrivalPhoto from '@/assets/feature-eta.webp';

const audiences = [
  {
    title: 'For transportation teams',
    description:
      'Bring routes, buses, drivers and daily trip visibility together in one operational workspace.',
    icon: Building2,
    href: '#platform',
    linkLabel: 'Explore operations',
  },
  {
    title: 'For drivers',
    description:
      'Start an authorized run, report trip events and keep the transportation team informed from the road.',
    icon: Route,
    href: '#driver-trips',
    linkLabel: 'Explore the driver experience',
  },
  {
    title: 'For guardians',
    description:
      'View the assigned bus during an active run, with clear status and available arrival information.',
    icon: Smartphone,
    href: '#tracking',
    linkLabel: 'Explore the family experience',
  },
] as const;

const operationHighlights = [
  {
    icon: Route,
    title: 'Routes and assignments',
    description: 'Keep route details, buses and drivers organized in one place.',
  },
  {
    icon: RadioTower,
    title: 'Live operations',
    description: 'Monitor active runs and identify GPS information that needs attention.',
  },
  {
    icon: BellRing,
    title: 'Transportation updates',
    description: 'Support communication around pickup, drop-off and service activity.',
  },
] as const;

export function LandingPage() {
  return (
    <PublicLayout overlayHeader landingNavigation>
      <main>
        {/* Keep the hero photograph edge-to-edge while making the district value explicit. */}
        <section className="relative isolate overflow-hidden bg-navy-900 text-white">
          <img
            src={winterMorningHero}
            alt=""
            aria-hidden="true"
            fetchPriority="high"
            className="absolute inset-0 -z-20 h-full w-full object-cover object-[65%_center] lg:object-center"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 -z-10 bg-navy-950/75 lg:bg-gradient-to-r lg:from-navy-950/95 lg:via-navy-950/75 lg:to-navy-950/15 lg:bg-transparent"
          />
          <div className="mx-auto flex min-h-[39rem] max-w-7xl items-center px-4 pb-24 pt-36 sm:px-6 lg:min-h-[45rem] lg:px-8 lg:pb-28 lg:pt-36">
            <div className="max-w-2xl">
              <p className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-navy-950/40 px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] text-white">
                <span className="h-2 w-2 rounded-full bg-yellow-400" aria-hidden="true" />
                School authority transportation platform
              </p>
              <h1 className="mt-7 max-w-2xl text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
                Every bus. Every route. One clear view.
              </h1>
              <p className="mt-6 max-w-xl text-base leading-8 text-navy-100 sm:text-lg">
                Plan school transportation, see buses during active trips, and help families know
                what to expect—all from one connected platform for Alberta school authorities.
              </p>
              <div className="mt-9 flex flex-wrap items-center gap-3">
                <Link
                  to="/contact"
                  className="sb-primary-action inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-bold shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  Request a consultation <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
                <a
                  href="#platform"
                  className="inline-flex min-h-12 items-center justify-center rounded-xl border border-white/50 bg-navy-950/20 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  Explore the platform
                </a>
              </div>
              <p className="mt-7 text-sm font-medium text-navy-100">
                Built for district and school authority transportation teams—not separate school accounts.
              </p>
            </div>
          </div>
        </section>

        {/* Product-led operations story: intentionally an illustration, not invented live data. */}
        <section
          id="platform"
          aria-labelledby="platform-heading"
          className="scroll-mt-28 bg-white py-20 sm:py-24 lg:py-28"
        >
          <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16 lg:px-8">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700">
                One district-wide workspace
              </p>
              <h2
                id="platform-heading"
                className="mt-4 text-3xl font-extrabold leading-tight tracking-tight text-navy-900 sm:text-4xl lg:text-5xl"
              >
                A calmer way to run the day.
              </h2>
              <p className="mt-5 max-w-xl text-base leading-8 text-slate-600 sm:text-lg">
                Give transportation teams a clear starting point for the work that matters:
                planning routes, managing assignments and checking current operations.
              </p>
              <ul className="mt-8 space-y-6">
                {operationHighlights.map(({ icon: Icon, title, description }) => (
                  <li key={title} className="flex items-start gap-4">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                      <Icon className="h-5 w-5" aria-hidden />
                    </span>
                    <div>
                      <h3 className="text-base font-bold text-navy-900">{title}</h3>
                      <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div className="min-w-0 rounded-[1.75rem] border border-slate-200 bg-[#F5F7FA] p-3 shadow-[0_25px_70px_-35px_rgba(15,42,68,0.35)] sm:p-5">
              <div
                role="img"
                aria-label="Illustrative SafeBus district operations layout with trip, GPS, route and fleet panels. No actual operational data is shown."
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
              >
                <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-5">
                  <span className="font-extrabold tracking-tight text-navy-900">SafeBus</span>
                  <span className="rounded-full bg-blue-50 px-3 py-1 text-[11px] font-semibold text-blue-800">
                    District operations
                  </span>
                </div>
                <div className="p-4 sm:p-6">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                        Operations overview
                      </p>
                      <p className="mt-1 text-lg font-bold text-navy-900">Your transportation day</p>
                    </div>
                    <span className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600">
                      Live operations
                    </span>
                  </div>
                  <div className="mt-5 grid grid-cols-3 gap-2 sm:gap-3">
                    {[
                      { label: 'Active trips', icon: RadioTower },
                      { label: 'GPS attention', icon: MapPin },
                      { label: 'Fleet & routes', icon: Route },
                    ].map(({ label, icon: Icon }) => (
                      <div key={label} className="min-w-0 rounded-xl border border-slate-200 bg-[#F8FAFC] p-3 sm:p-4">
                        <Icon className="h-5 w-5 text-blue-700" aria-hidden />
                        <p className="mt-3 text-xs font-bold leading-5 text-navy-900">{label}</p>
                        <div className="mt-3 h-1.5 w-3/4 rounded-full bg-slate-200" aria-hidden="true" />
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-[1.4fr_1fr]">
                    <div className="relative min-h-44 overflow-hidden rounded-xl border border-[#D8E4EC] bg-[#EAF2F7]">
                      <div className="absolute left-[-10%] top-12 h-6 w-[125%] -rotate-12 bg-white/85" aria-hidden="true" />
                      <div className="absolute left-1/3 top-[-15%] h-[140%] w-5 rotate-[24deg] bg-white/80" aria-hidden="true" />
                      <div className="absolute right-[-20%] top-20 h-5 w-[100%] rotate-[30deg] bg-white/75" aria-hidden="true" />
                      <span className="absolute left-[38%] top-[38%] flex h-10 w-10 items-center justify-center rounded-full border-4 border-white bg-yellow-400 text-navy-900 shadow-lg">
                        <MapPin className="h-5 w-5" aria-hidden />
                      </span>
                      <span className="absolute bottom-3 left-3 rounded-lg bg-white/95 px-3 py-1.5 text-[11px] font-semibold text-navy-900 shadow-sm">
                        Fleet visibility
                      </span>
                    </div>
                    <div className="space-y-3 rounded-xl border border-slate-200 p-4">
                      <p className="text-xs font-bold text-navy-900">Connected operations</p>
                      {[
                        { label: 'Route planning', icon: CheckCircle2 },
                        { label: 'Bus visibility', icon: RadioTower },
                        { label: 'Trip activity', icon: Clock3 },
                      ].map(({ label, icon: Icon }) => (
                        <div key={label} className="flex items-center gap-2 border-t border-slate-100 pt-2">
                          <Icon className="h-4 w-4 shrink-0 text-blue-700" aria-hidden />
                          <span className="text-xs font-medium text-slate-600">{label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <p className="mt-3 px-1 text-center text-xs text-slate-500">
                Illustrative product layout—not a live account screenshot or live operational data.
              </p>
            </div>
          </div>
        </section>

        {/* Audiences describe one shared platform, not three separate customers. */}
        <section
          id="solutions"
          aria-labelledby="features-heading"
          className="scroll-mt-28 bg-[#F5F7FA] py-20 sm:py-24"
        >
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-3xl text-center">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700">
                One connected journey
              </p>
              <h2
                id="features-heading"
                className="mt-4 text-3xl font-extrabold tracking-tight text-navy-900 sm:text-4xl"
              >
                Built for everyone involved in the ride.
              </h2>
              <p className="mt-4 text-base leading-8 text-slate-600 sm:text-lg">
                School authorities manage transportation. Drivers operate their assigned trips.
                Guardians get a simpler view of the bus that matters to them.
              </p>
            </div>
            <div className="mt-11 grid gap-5 lg:grid-cols-3">
              {audiences.map(({ title, description, icon: Icon, href, linkLabel }) => (
                <article key={title} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
                  <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                    <Icon className="h-6 w-6" aria-hidden />
                  </span>
                  <h3 className="mt-6 text-xl font-bold text-navy-900">{title}</h3>
                  <p className="mt-3 flex-1 text-sm leading-7 text-slate-600">{description}</p>
                  <a href={href} className="mt-6 inline-flex min-h-11 items-center gap-2 self-start rounded text-sm font-bold text-blue-700 underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-700">
                    {linkLabel} <ArrowRight className="h-4 w-4" aria-hidden />
                  </a>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Alternate real-world context and functional value. */}
        <section id="tracking" aria-labelledby="tracking-heading" className="scroll-mt-28 bg-white py-20 sm:py-24">
          <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:px-8">
            <div className="overflow-hidden rounded-[1.75rem] bg-[#EAF2F7]">
              <img
                src={arrivalPhoto}
                alt="Illustrated family scene representing a guardian checking school-bus arrival information."
                width={1200}
                height={800}
                loading="lazy"
                decoding="async"
                className="h-80 w-full object-cover sm:h-[29rem]"
              />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700">For families</p>
              <h2 id="tracking-heading" className="mt-4 text-3xl font-extrabold tracking-tight text-navy-900 sm:text-4xl">
                See the bus. Know what to expect.
              </h2>
              <p className="mt-5 text-base leading-8 text-slate-600 sm:text-lg">
                Guardians see their assigned bus during an active school run, along with available
                arrival information. If location information is stale or unavailable, SafeBus makes
                that clear rather than presenting an unverified estimate.
              </p>
              <div className="mt-7 flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50/70 p-4">
                <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" aria-hidden />
                <p className="text-sm font-semibold leading-6 text-navy-900">
                  Bus-first visibility, with access limited to a guardian&apos;s linked students.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section
          id="notifications"
          aria-labelledby="notifications-heading"
          className="scroll-mt-28 bg-[#F5F7FA] py-20 sm:py-24"
        >
          <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:px-8">
            <div className="lg:order-2 overflow-hidden rounded-[1.75rem] bg-[#EAF2F7]">
              <img
                src={familyPhoto}
                alt="A parent checking transportation information on a phone at home."
                width={1200}
                height={900}
                loading="lazy"
                decoding="async"
                className="h-80 w-full object-cover sm:h-[29rem]"
              />
            </div>
            <div className="lg:order-1">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700">Pickup and drop-off</p>
              <h2 id="notifications-heading" className="mt-4 text-3xl font-extrabold tracking-tight text-navy-900 sm:text-4xl">
                Key moments, communicated clearly.
              </h2>
              <p className="mt-5 text-base leading-8 text-slate-600 sm:text-lg">
                Keep families informed when pickup or drop-off is confirmed. Transportation
                messages and available notifications are tied to authorized accounts and
                recipient preferences.
              </p>
              <p className="mt-5 text-sm font-medium leading-6 text-slate-600">
                The goal is a more predictable school day, not more screen time.
              </p>
            </div>
          </div>
        </section>

        <section id="driver-trips" aria-labelledby="driver-heading" className="scroll-mt-28 bg-white py-20 sm:py-24">
          <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:px-8">
            <div className="overflow-hidden rounded-[1.75rem] bg-[#EAF2F7]">
              <img
                src={managementPhoto}
                alt="Transportation staff working together at a computer in an office."
                width={1200}
                height={900}
                loading="lazy"
                decoding="async"
                className="h-80 w-full object-cover object-[center_15%] sm:h-[29rem]"
              />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700">District and driver coordination</p>
              <h2 id="driver-heading" className="mt-4 text-3xl font-extrabold tracking-tight text-navy-900 sm:text-4xl">
                From route planning to the active trip.
              </h2>
              <p className="mt-5 text-base leading-8 text-slate-600 sm:text-lg">
                Transportation teams can organize route and driver information while drivers
                manage authorized runs from their mobile experience. Trip and GPS states remain
                visible to the people responsible for operations.
              </p>
              <div id="driver-qr" className="mt-7 flex items-start gap-3 rounded-xl border border-slate-200 bg-[#F5F7FA] p-4">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" aria-hidden />
                <p className="text-sm font-medium leading-6 text-slate-700">
                  Existing driver trip-start, QR and pickup/drop-off workflows stay unchanged.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section id="privacy" aria-labelledby="privacy-heading" className="scroll-mt-28 bg-navy-900 py-20 text-white sm:py-24">
          <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-[1fr_0.9fr] lg:gap-16 lg:px-8">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-yellow-300">Privacy by design</p>
              <h2 id="privacy-heading" className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl">
                The right information, for the right people.
              </h2>
              <p className="mt-5 max-w-xl text-base leading-8 text-navy-100 sm:text-lg">
                SafeBus separates transportation administration from guardian and driver access.
                Guardians see only information connected to their linked students and assigned
                bus. School authorities keep the broader operational view.
              </p>
              <Link to="/privacy" className="mt-6 inline-flex min-h-11 items-center gap-2 rounded text-sm font-bold text-white underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">
                Read our privacy information <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
            <div className="rounded-2xl border border-white/20 bg-white/10 p-6 sm:p-8">
              <ShieldCheck className="h-9 w-9 text-yellow-300" aria-hidden />
              <h3 className="mt-5 text-xl font-bold">Designed around clear access boundaries</h3>
              <ul className="mt-6 space-y-4 text-sm leading-6 text-navy-100">
                <li className="flex gap-3"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-yellow-300" aria-hidden /> School authority controls for transportation operations</li>
                <li className="flex gap-3"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-yellow-300" aria-hidden /> Driver access tied to authorized activity</li>
                <li className="flex gap-3"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-yellow-300" aria-hidden /> Guardian access scoped to linked students</li>
              </ul>
            </div>
          </div>
        </section>

        {/* A sleek, readable glass carousel over the real parked-bus photograph. */}
        <section
          id="why-choose-us"
          aria-labelledby="why-choose-us-heading"
          className="relative isolate scroll-mt-28 overflow-hidden bg-navy-900 text-white"
        >
          <img
            src={parkedBusesPhoto}
            alt="Yellow school buses parked in an open-air parking area."
            width={1672}
            height={940}
            loading="lazy"
            decoding="async"
            className="absolute inset-0 -z-20 h-full w-full object-cover object-[65%_center]"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 -z-10 bg-gradient-to-r from-navy-950/90 via-navy-950/65 to-navy-950/35"
          />
          <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-20 sm:px-6 lg:min-h-[42rem] lg:grid-cols-[0.8fr_1.2fr] lg:gap-12 lg:px-8 lg:py-24">
            <div className="min-w-0">
              <p className="flex items-center gap-3 text-xs font-bold uppercase tracking-[0.18em] text-yellow-300 sm:text-sm">
                <span className="h-1 w-9 shrink-0 rounded-full bg-yellow-400" aria-hidden="true" />
                The SafeBus difference
              </p>
              <h2
                id="why-choose-us-heading"
                className="mt-6 text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl"
              >
                Why choose us
              </h2>
              <p className="mt-6 max-w-lg text-lg leading-8 text-white/90 sm:text-xl">
                Local roots. A clear purpose. School transportation built around the people who
                count on it every day.
              </p>
            </div>
            <WhyChooseUsCarousel />
          </div>
        </section>

        {/* Commitment refers to future profit allocations, not completed donations. */}
        <section
          id="education"
          aria-labelledby="education-heading"
          className="scroll-mt-28 bg-[#F5F7FA] py-20 sm:py-24"
        >
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid items-center gap-8 overflow-hidden rounded-[2rem] border border-slate-200 bg-white p-7 shadow-sm sm:p-10 lg:grid-cols-[1fr_auto] lg:gap-14 lg:p-14">
              <div className="max-w-3xl">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700">
                  Our commitment to education
                </p>
                <h2
                  id="education-heading"
                  className="mt-4 text-3xl font-extrabold leading-tight tracking-tight text-navy-900 sm:text-4xl"
                >
                  5% of profits. A brighter future.
                </h2>
                <p className="mt-5 text-base leading-8 text-slate-600 sm:text-lg">
                  SafeBus is committed to allocating 5% of its profits to initiatives that support
                  children&apos;s education. We believe every school journey should be part of a
                  bigger journey toward opportunity.
                </p>
              </div>
              <div
                aria-hidden="true"
                className="flex h-28 w-28 items-center justify-center rounded-[2rem] bg-yellow-100 text-navy-900 sm:h-36 sm:w-36"
              >
                <GraduationCap className="h-14 w-14 sm:h-16 sm:w-16" strokeWidth={1.5} />
              </div>
            </div>
          </div>
        </section>

        <section aria-labelledby="contact-heading" className="bg-white py-20 sm:py-24">
          <div className="mx-auto max-w-5xl px-4 text-center sm:px-6">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700">
              Connect with SafeBus
            </p>
            <h2 id="contact-heading" className="mt-4 text-3xl font-extrabold tracking-tight text-navy-900 sm:text-4xl">
              Let&apos;s talk school transportation.
            </h2>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-8 text-slate-600 sm:text-lg">
              Tell us about your school authority&apos;s transportation needs, pilot questions
              or procurement process.
            </p>
            <Link to="/contact" className="sb-primary-action mt-8 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-7 py-3 text-sm font-bold shadow-sm">
              Request a consultation <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </section>
      </main>
    </PublicLayout>
  );
}
