import type { ReactNode } from 'react';

type ListingRailStageProps = {
  children: ReactNode;
  rail: ReactNode;
  railOpen: boolean;
  railLabel: string;
  variant?: 'feed' | 'grid' | 'showcase';
};

export function ListingRailStage({ children, rail, railOpen, railLabel, variant = 'grid' }: ListingRailStageProps) {
  return <div className={`listing-rail-stage listing-rail-stage-${variant}${railOpen ? ' has-listing-rail' : ''}`}>
    <aside className="listing-info-rail" aria-label={railLabel} aria-hidden={!railOpen}>{rail}</aside>
    {children}
  </div>;
}
