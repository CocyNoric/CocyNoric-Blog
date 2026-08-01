type ListingInfoRailProps = {
  kind: 'article' | 'gallery';
  total: number;
  visible?: number;
  context?: string;
};

export function ListingInfoRail({ kind, total, visible = total, context = '' }: ListingInfoRailProps) {
  const article = kind === 'article';
  return <div className="listing-info-rail-content">
    <div className="listing-rail-heading">
      <span className="showcase-info-label">Overview</span>
      <h3>概览</h3>
    </div>
    <p className="listing-rail-summary">
      <strong>{total}</strong>
      <span>{article ? '篇文章' : '张图片'} <b aria-hidden="true">·</b> 当前显示 {visible}</span>
    </p>
    {context && <div className="listing-rail-context"><span>当前范围</span><strong>{context}</strong></div>}
    <div className="listing-rail-reserved">
      <span className="showcase-info-label">Categories</span>
      <strong>分类</strong>
      <p>分类功能将在后续补充。</p>
    </div>
  </div>;
}
