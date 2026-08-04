import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { stepShowcaseIndex, swipeShowcaseStep, type ShowcaseStep } from '../listingView.js';
import { ChevronLeftIcon, ChevronRightIcon } from './Icons.js';
import { ListingRailStage } from './ListingRailStage.js';

type ShowcaseTransition = {
  from: number;
  direction: 'forward' | 'backward';
  token: number;
};

type TouchStart = {
  pointerId: number;
  x: number;
  y: number;
};

type ShowcaseCarouselProps<T> = {
  items: T[];
  getKey: (item: T) => string;
  getLabel: (item: T) => string;
  renderItem: (item: T, index: number) => ReactNode;
  ariaLabel: string;
  resetKey?: string;
  rail?: ReactNode;
  railOpen?: boolean;
  railLabel?: string;
};

export function ShowcaseCarousel<T>({ items, getKey, getLabel, renderItem, ariaLabel, resetKey = '', rail, railOpen = false, railLabel = '浏览信息' }: ShowcaseCarouselProps<T>) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [transition, setTransition] = useState<ShowcaseTransition | null>(null);
  const transitionToken = useRef(0);
  const transitionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStart = useRef<TouchStart | null>(null);
  const suppressClick = useRef(false);

  const clearTransition = () => {
    if (transitionTimer.current) clearTimeout(transitionTimer.current);
    transitionTimer.current = null;
    setTransition(null);
  };

  useEffect(() => () => {
    if (transitionTimer.current) clearTimeout(transitionTimer.current);
  }, []);

  useEffect(() => {
    clearTransition();
    setActiveIndex(0);
  }, [resetKey]);

  useEffect(() => {
    if (items.length === 0) {
      clearTransition();
      setActiveIndex(0);
      return;
    }
    if (activeIndex >= items.length) {
      clearTransition();
      setActiveIndex(items.length - 1);
    }
  }, [activeIndex, items.length]);

  const move = (step: ShowcaseStep) => {
    if (transition || step === 0 || items.length < 2) return;
    const nextIndex = stepShowcaseIndex(activeIndex, step, items.length);
    if (nextIndex === activeIndex) return;
    if (transitionTimer.current) clearTimeout(transitionTimer.current);
    transitionToken.current += 1;
    setTransition({ from: activeIndex, direction: step > 0 ? 'forward' : 'backward', token: transitionToken.current });
    setActiveIndex(nextIndex);
    transitionTimer.current = setTimeout(() => {
      transitionTimer.current = null;
      setTransition(null);
    }, 420);
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'touch') return;
    touchStart.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start || start.pointerId !== event.pointerId) return;
    const step = swipeShowcaseStep(event.clientX - start.x, event.clientY - start.y);
    if (step === 0) return;
    suppressClick.current = true;
    event.preventDefault();
    move(step);
    window.setTimeout(() => { suppressClick.current = false; }, 0);
  };

  if (items.length === 0) return null;

  const activeItem = items[activeIndex];
  const previousItem = transition && transition.from < items.length ? items[transition.from] : null;
  const directionClass = transition ? ` direction-${transition.direction}` : '';

  return <section
    className="showcase-carousel"
    aria-label={ariaLabel}
    aria-roledescription="轮播"
    tabIndex={0}
    onKeyDown={(event) => {
      if (event.target !== event.currentTarget) return;
      if (event.key === 'ArrowLeft') { event.preventDefault(); move(-1); }
      if (event.key === 'ArrowRight') { event.preventDefault(); move(1); }
    }}
  >
    <div className="showcase-toolbar">
      <p className="showcase-position" aria-hidden="true"><strong>{String(activeIndex + 1).padStart(2, '0')}</strong><span>/</span>{String(items.length).padStart(2, '0')}</p>
      <div className="showcase-controls">
        <button type="button" className="icon-button" onClick={() => move(-1)} disabled={transition !== null || activeIndex === 0} aria-label="上一项"><ChevronLeftIcon /></button>
        <button type="button" className="icon-button" onClick={() => move(1)} disabled={transition !== null || activeIndex === items.length - 1} aria-label="下一项"><ChevronRightIcon /></button>
      </div>
    </div>
    <ListingRailStage rail={rail} railOpen={railOpen} railLabel={railLabel} variant="showcase">
      <div
        className={`showcase-viewport${directionClass}`}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => { touchStart.current = null; }}
        onClickCapture={(event) => {
          if (!suppressClick.current) return;
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        {previousItem && <div className="showcase-slide is-exiting" aria-hidden="true" key={`previous-${getKey(previousItem)}-${transition?.token}`}>{renderItem(previousItem, transition!.from)}</div>}
        <div className={`showcase-slide${transition ? ' is-entering' : ''}`} key={getKey(activeItem)}>{renderItem(activeItem, activeIndex)}</div>
      </div>
    </ListingRailStage>
    <p className="visually-hidden" aria-live="polite">第 {activeIndex + 1} 项，共 {items.length} 项：{getLabel(activeItem)}</p>
  </section>;
}
