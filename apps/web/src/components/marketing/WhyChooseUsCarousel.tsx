import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import {
  Ban,
  Bus,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  MapPin,
  ShieldCheck,
} from 'lucide-react';

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

const keyboardDirections: Record<string, number | 'first' | 'last'> = {
  ArrowLeft: -1,
  ArrowRight: 1,
  Home: 'first',
  End: 'last',
};

function getMetrics(viewport: HTMLDivElement) {
  const first = viewport.children[0] as HTMLElement | undefined;
  const second = viewport.children[1] as HTMLElement | undefined;
  if (!first?.offsetWidth || !second || !viewport.clientWidth) return null;

  const step = second.offsetLeft - first.offsetLeft;
  if (step <= 0) return null;

  const visible = Math.min(
    cards.length,
    Math.max(1, Math.round(viewport.clientWidth / first.offsetWidth)),
  );
  const maxStart = cards.length - visible;
  const start = Math.min(maxStart, Math.max(0, Math.round(viewport.scrollLeft / step)));
  return { step, visible, maxStart, start };
}

export function WhyChooseUsCarousel() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const pendingStartRef = useRef<number | null>(null);
  const rangeRef = useRef({ start: 0, visible: 1 });
  const [range, setRange] = useState(rangeRef.current);

  const updateRange = useCallback((start: number, visible: number) => {
    rangeRef.current = { start, visible };
    setRange((previous) =>
      previous.start === start && previous.visible === visible ? previous : { start, visible },
    );
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const handleResize = () => {
      const metrics = getMetrics(viewport);
      if (!metrics) return;
      pendingStartRef.current = null;
      const start = Math.min(rangeRef.current.start, metrics.maxStart);
      const left = start * metrics.step;
      if (Math.abs(viewport.scrollLeft - left) > 1) {
        viewport.scrollTo({ left, behavior: 'auto' });
      }
      updateRange(start, metrics.visible);
    };

    handleResize();
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(handleResize);
      observer.observe(viewport);
      return () => observer.disconnect();
    }

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [updateRange]);

  const syncScroll = () => {
    const viewport = viewportRef.current;
    const metrics = viewport && getMetrics(viewport);
    if (metrics && viewport) {
      if (
        pendingStartRef.current !== null &&
        Math.abs(viewport.scrollLeft - pendingStartRef.current * metrics.step) < 2
      ) {
        pendingStartRef.current = null;
      }
      updateRange(metrics.start, metrics.visible);
    }
  };

  const navigate = (direction: number | 'first' | 'last') => {
    const viewport = viewportRef.current;
    const metrics = viewport && getMetrics(viewport);
    if (!viewport || !metrics) return;
    const start = pendingStartRef.current ?? metrics.start;
    const target =
      direction === 'first'
        ? 0
        : direction === 'last'
          ? metrics.maxStart
          : Math.min(metrics.maxStart, Math.max(0, start + direction));
    pendingStartRef.current = target;
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    viewport.scrollTo({ left: target * metrics.step, behavior: reduceMotion ? 'auto' : 'smooth' });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || event.altKey || event.ctrlKey || event.metaKey)
      return;
    const direction = keyboardDirections[event.key];
    if (direction === undefined) return;
    event.preventDefault();
    navigate(direction);
  };

  const end = Math.min(cards.length, range.start + range.visible);
  const position = range.visible === 1 ? `${range.start + 1}` : `${range.start + 1}\u2013${end}`;

  return (
    <div
      role="region"
      aria-roledescription="carousel"
      aria-labelledby="why-choose-us-heading"
      className="mt-10"
    >
      <div
        ref={viewportRef}
        id="why-choose-us-cards"
        role="group"
        aria-label="Reasons to choose SafeBus"
        tabIndex={0}
        onScroll={syncScroll}
        onKeyDown={handleKeyDown}
        onPointerDown={() => {
          pendingStartRef.current = null;
        }}
        onWheel={() => {
          pendingStartRef.current = null;
        }}
        className="relative flex snap-x snap-mandatory gap-6 overflow-x-auto rounded-xl pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {cards.map(({ title, description, icon: Icon }, index) => (
          <article
            key={title}
            role="group"
            aria-roledescription="slide"
            aria-label={`${index + 1} of ${cards.length}`}
            className="w-full min-w-0 shrink-0 snap-start rounded-xl border border-yellow-200 bg-white p-6 shadow-sm md:w-[calc((100%_-_1.5rem)/2)] lg:w-[calc((100%_-_3rem)/3)] lg:p-8"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-yellow-100 text-navy-800">
              <Icon className="h-6 w-6" aria-hidden="true" />
            </div>
            <h3 className="mt-5 text-xl font-bold leading-7 tracking-tight text-navy-800">
              {title}
            </h3>
            <p className="mt-3 text-base leading-7 text-slate-600">{description}</p>
          </article>
        ))}
      </div>
      <div className="mt-6 flex items-center justify-between gap-4">
        <p role="status" aria-live="polite" aria-atomic="true" className="text-sm text-navy-600">
          <span className="sr-only">Cards </span>
          {position} of {cards.length}
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            aria-label="Previous cards"
            aria-controls="why-choose-us-cards"
            disabled={range.start === 0}
            onClick={() => navigate(-1)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-navy-200 bg-white text-navy-800 transition-colors hover:bg-yellow-100 disabled:pointer-events-none disabled:opacity-40"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Next cards"
            aria-controls="why-choose-us-cards"
            disabled={end === cards.length}
            onClick={() => navigate(1)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-navy-200 bg-white text-navy-800 transition-colors hover:bg-yellow-100 disabled:pointer-events-none disabled:opacity-40"
          >
            <ChevronRight className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
