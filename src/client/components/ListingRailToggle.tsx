import { SidebarIcon } from './Icons.js';

type ListingRailToggleProps = {
  open: boolean;
  onChange: (open: boolean) => void;
};

export function ListingRailToggle({ open, onChange }: ListingRailToggleProps) {
  return <button
    type="button"
    className="listing-rail-toggle"
    aria-pressed={open}
    onClick={() => onChange(!open)}
    title={open ? '隐藏信息栏' : '显示信息栏'}
  >
    <SidebarIcon /><span>信息栏</span>
  </button>;
}
