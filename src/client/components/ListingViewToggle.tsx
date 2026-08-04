import type { ListingViewMode } from '../listingView.js';
import { GridViewIcon, ShowcaseViewIcon } from './Icons.js';

type ListingViewToggleProps = {
  mode: ListingViewMode;
  onChange: (mode: ListingViewMode) => void;
  label: string;
};

export function ListingViewToggle({ mode, onChange, label }: ListingViewToggleProps) {
  return <div className="listing-view-toggle" role="group" aria-label={label}>
    <button type="button" aria-pressed={mode === 'grid'} onClick={() => onChange('grid')} title="网格视图">
      <GridViewIcon /><span>网格</span>
    </button>
    <button type="button" aria-pressed={mode === 'showcase'} onClick={() => onChange('showcase')} title="展示视图">
      <ShowcaseViewIcon /><span>展示</span>
    </button>
  </div>;
}
