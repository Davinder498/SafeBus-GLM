import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Ban, Bus, GraduationCap, MapPin, ShieldCheck } from 'lucide-react';

const cards = [
  {
    title: 'Security at the core',
    description:
      'Role-based access helps keep transportation information visible only to the people authorized to see it.',
    icon: ShieldCheck,
  },
  {
    title: '5% for brighter futures',
    description: 'We commit 5% of our revenue to supporting children\u2019s education in Alberta.',
    icon: GraduationCap,
  },
  {
    title: 'Proudly Alberta-based',
    description: 'Built by an Alberta-based company, with local schools and families in mind.',
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
    description: 'A focused platform for the everyday needs of schools, drivers, and families.',
    icon: Bus,
  },
];

export function WhyChooseUsCarousel() {
  const regionRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [hasFocus, setHasFocus] = useState(false);
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

  const isRotating = !isHovered && !hasFocus && !reduceMotion && isVisible && isPageVisible;

  useEffect(() => {
    if (!isRotating) return;
    const timer = window.setTimeout(() => {
      setActiveIndex((index) => (index + 1) % cards.length);
    }, 3000);
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
      className="w-full min-w-0 max-w-md rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-8 focus-visible:outline-yellow-300"
    >
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
            className={`relative overflow-hidden rounded-2xl border border-white/30 bg-navy-950/45 p-6 shadow-[0_20px_70px_-20px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.2)] backdrop-blur-xl transition-opacity duration-500 [grid-area:1/1] motion-reduce:transition-none sm:p-7 ${index === activeIndex ? 'visible opacity-100' : 'invisible opacity-0'}`}
          >
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent"
            />
            <div className="relative">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-yellow-200/30 bg-yellow-400/15 text-yellow-300">
                <Icon className="h-6 w-6" aria-hidden="true" />
              </div>
              <h3 className="mt-5 text-2xl font-bold leading-tight tracking-tight text-yellow-300">
                {title}
              </h3>
              <p className="mt-3 text-base leading-7 text-white">{description}</p>
            </div>
          </article>
        ))}
      </div>
      <div className="mt-3">
        <div role="group" aria-label="Choose a reason" className="flex items-center gap-1">
          {cards.map((card, index) => (
            <button
              key={card.title}
              type="button"
              aria-label={`Show reason ${index + 1}: ${card.title}`}
              aria-current={index === activeIndex ? 'true' : undefined}
              aria-controls="why-choose-us-cards"
              onClick={() => setActiveIndex(index)}
              className="flex h-11 w-8 items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-yellow-300"
            >
              <span
                aria-hidden="true"
                className={`h-2 rounded-full transition-all motion-reduce:transition-none ${index === activeIndex ? 'w-7 bg-yellow-300' : 'w-2 bg-white/50 hover:bg-white'}`}
              />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
