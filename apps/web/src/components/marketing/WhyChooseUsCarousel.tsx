import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ArrowLeft, ArrowRight, Ban, Bus, GraduationCap, MapPin, Pause, Play, ShieldCheck } from 'lucide-react';

const cards = [
  {
    title: 'Security at the core',
    description:
      'Role-based access helps keep transportation information visible only to the people authorized to see it.',
    icon: ShieldCheck,
  },
  {
    title: '5% of profits for brighter futures',
    description:
      'SafeBus is committed to allocating 5% of its profits to initiatives that support children\u2019s education.',
    icon: GraduationCap,
  },
  {
    title: 'Proudly Alberta-based',
    description:
      'Built by an Alberta-based company, with school authorities and the families they serve in mind.',
    icon: MapPin,
  },
  {
    title: 'No ads. No data sales.',
    description:
      'We don\u2019t sell personal information or build advertising profiles. Our focus stays on school transportation.',
    icon: Ban,
  },
  {
    title: 'Built around school transportation',
    description:
      'A focused platform for the everyday needs of school authorities, drivers, and families.',
    icon: Bus,
  },
];

const ROTATION_INTERVAL = 6000;

export function WhyChooseUsCarousel() {
  const regionRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [hasFocus, setHasFocus] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [isPageVisible, setIsPageVisible] = useState(!document.hidden);
  const [reduceMotion, setReduceMotion] = useState(
    () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
  );

  useEffect(() => {
    const preference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const updateMotion = () => setReduceMotion(preference?.matches ?? false);
    const updateVisibility = () => setIsPageVisible(!document.hidden);
    preference?.addEventListener('change', updateMotion);
    document.addEventListener('visibilitychange', updateVisibility);
    return () => {
      preference?.removeEventListener('change', updateMotion);
      document.removeEventListener('visibilitychange', updateVisibility);
    };
  }, []);

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') {
      setIsVisible(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => setIsVisible(entry.isIntersecting), {
      threshold: 0.25,
    });
    if (regionRef.current) observer.observe(regionRef.current);
    return () => observer.disconnect();
  }, []);

  const isRotating =
    !userPaused && !isHovered && !hasFocus && !reduceMotion && isVisible && isPageVisible;

  useEffect(() => {
    if (!isRotating) return;
    const timer = window.setTimeout(() => {
      setActiveIndex((index) => (index + 1) % cards.length);
    }, ROTATION_INTERVAL);
    return () => window.clearTimeout(timer);
  }, [activeIndex, isRotating]);

  const navigate = (direction: number) => {
    setActiveIndex((index) => (index + direction + cards.length) % cards.length);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || event.altKey || event.ctrlKey || event.metaKey)
      return;
    switch (event.key) {
      case 'ArrowLeft':
        navigate(-1);
        break;
      case 'ArrowRight':
        navigate(1);
        break;
      case 'Home':
        setActiveIndex(0);
        break;
      case 'End':
        setActiveIndex(cards.length - 1);
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  return (
    <div
      ref={regionRef}
      role="region"
      aria-roledescription="carousel"
      aria-labelledby="why-choose-us-heading"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocusCapture={() => setHasFocus(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setHasFocus(false);
      }}
      className="w-full min-w-0 rounded-[2rem] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-nav-focus)]"
    >
      <div className="relative">
        <div
          id="why-choose-us-cards"
          aria-live={isRotating ? 'off' : 'polite'}
          aria-atomic="true"
          className="grid"
        >
          {cards.map(({ title, description, icon: Icon }, index) => (
            <article
              key={title}
              role="group"
              aria-roledescription="slide"
              aria-label={title}
              aria-hidden={index !== activeIndex}
              className={
                'relative col-start-1 row-start-1 flex min-h-[22rem] flex-col justify-center overflow-hidden rounded-[2rem] border border-white/35 bg-[#101D2B]/75 px-14 py-9 text-white ' +
                'shadow-[0_32px_90px_-30px_rgba(0,0,0,0.65),inset_0_1px_0_rgba(255,255,255,0.16)] backdrop-blur-2xl ' +
                'transition-opacity duration-500 motion-reduce:transition-none sm:min-h-[25rem] sm:px-20 sm:py-12 ' +
                (index === activeIndex ? 'visible z-10 opacity-100' : 'invisible pointer-events-none opacity-0')
              }
            >
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/15 via-white/[0.025] to-transparent"
              />
              <div className="relative">
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-yellow-200 to-yellow-400 text-navy-950 shadow-[0_7px_22px_rgba(246,187,55,0.24)] sm:h-16 sm:w-16">
                  <Icon className="h-7 w-7 sm:h-8 sm:w-8" aria-hidden />
                </span>
                <h3 className="mt-7 text-[1.65rem] font-extrabold leading-[1.14] tracking-tight text-white sm:text-3xl">
                  {title}
                </h3>
                <p className="mt-5 max-w-lg text-base leading-7 text-white/90 sm:text-lg sm:leading-8">
                  {description}
                </p>
              </div>
            </article>
          ))}
        </div>

        <button
          type="button"
          aria-label="Previous reason"
          aria-controls="why-choose-us-cards"
          onClick={() => navigate(-1)}
          className="absolute left-2 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/35 bg-navy-950/30 text-white shadow-sm transition-colors hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:left-4 sm:h-11 sm:w-11"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden />
        </button>
        <button
          type="button"
          aria-label="Next reason"
          aria-controls="why-choose-us-cards"
          onClick={() => navigate(1)}
          className="absolute right-2 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/35 bg-navy-950/30 text-white shadow-sm transition-colors hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:right-4 sm:h-11 sm:w-11"
        >
          <ArrowRight className="h-5 w-5" aria-hidden />
        </button>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-center gap-4">
        <div role="group" aria-label="Choose a reason" className="flex items-center gap-1">
          {cards.map((card, index) => (
            <button
              key={card.title}
              type="button"
              aria-label={\`Show reason \${index + 1}: \${card.title}\`}
              aria-current={index === activeIndex ? 'true' : undefined}
              aria-controls="why-choose-us-cards"
              onClick={() => setActiveIndex(index)}
              className="flex h-11 w-9 items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-nav-focus)]"
            >
              <span
                aria-hidden="true"
                className={
                  'h-2.5 rounded-full transition-all duration-300 motion-reduce:transition-none ' +
                  (index === activeIndex
                    ? 'w-8 bg-yellow-300'
                    : 'w-2.5 bg-white/55 hover:bg-white/90')
                }
              />
            </button>
          ))}
        </div>
        <button
          type="button"
          aria-label={userPaused ? 'Resume automatic rotation' : 'Pause automatic rotation'}
          aria-pressed={userPaused}
          aria-controls="why-choose-us-cards"
          onClick={() => setUserPaused((paused) => !paused)}
          className="flex h-11 w-11 items-center justify-center rounded-full border border-white/30 bg-navy-950/25 text-white transition-colors hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-nav-focus)]"
        >
          {userPaused ? <Play className="h-4 w-4" aria-hidden /> : <Pause className="h-4 w-4" aria-hidden />}
        </button>
      </div>
    </div>
  );
}
