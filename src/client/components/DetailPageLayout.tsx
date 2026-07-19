import type { CSSProperties, ReactNode } from 'react';

type DetailPageLayoutProps = {
  side: 'left' | 'right';
  railWidth: number;
  primaryWidth: number;
  header?: ReactNode;
  aside: ReactNode;
  children: ReactNode;
};

export function DetailPageLayout({ side, railWidth, primaryWidth, header, aside, children }: DetailPageLayoutProps) {
  return <div
    className="detail-layout-frame"
    style={{
      '--detail-rail-width': `${railWidth}px`,
      '--detail-primary-width': `${primaryWidth}px`,
    } as CSSProperties}
  >
    {header && <div className="detail-layout-header">{header}</div>}
    <div
      className={`detail-layout detail-layout-${side}`}
      style={{ '--detail-shell-width': `${Math.max(1240, primaryWidth + railWidth + 20)}px` } as CSSProperties}
    >
      <div className="detail-primary">{children}</div>
      <aside className="information-bar-slot" aria-label="站点信息栏">{aside}</aside>
    </div>
  </div>;
}
