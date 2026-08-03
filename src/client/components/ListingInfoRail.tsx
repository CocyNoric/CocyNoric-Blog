import type { CSSProperties } from 'react';
import type { CategorySummary } from '../../shared/categories.js';

type ListingInfoRailProps = {
  kind: 'article' | 'gallery';
  total: number;
  visible?: number;
  context?: string;
  categories?: CategorySummary[];
  activeCategory?: string;
  onCategoryChange?: (category: string) => void;
};

export function ListingInfoRail({ kind, total, visible = total, context = '', categories = [], activeCategory = '', onCategoryChange }: ListingInfoRailProps) {
  const article = kind === 'article';
  return <div className="listing-info-rail-content">
    <div className="listing-rail-heading">
      <span className="showcase-info-label">Overview</span>
      <h3>概览</h3>
    </div>
    <p className="listing-rail-summary">
      <strong>{total}</strong>
      <span>{article ? '篇文章' : '个展示'} <b aria-hidden="true">·</b> 当前显示 {visible}</span>
    </p>
    {context && <div className="listing-rail-context"><span>当前范围</span><strong>{context}</strong></div>}
    {categories.length > 0 && <div className="listing-rail-reserved">
      <span className="showcase-info-label">Categories</span>
      <strong>分类</strong>
      <div className="listing-rail-categories" aria-label="按分类筛选">
        <button type="button" aria-pressed={!activeCategory} onClick={() => onCategoryChange?.('')}><span>全部</span><small>{total}</small></button>
        {categories.map((category) => <button
          type="button"
          aria-pressed={activeCategory === category.path}
          aria-label={`${category.path.replaceAll('/', ' / ')}，${category.count} 项`}
          onClick={() => onCategoryChange?.(activeCategory === category.path ? '' : category.path)}
          style={{ '--category-depth': category.depth } as CSSProperties}
          key={category.path}
        ><span>{category.label}</span><small>{category.count}</small></button>)}
      </div>
    </div>}
  </div>;
}
