'use client';

import dynamic from 'next/dynamic';

/**
 * The Recharts bundle (~100 kB) is only needed on the Reviews analytics tab, after the page shell has
 * rendered. Loading it lazily keeps it out of the initial JavaScript; a same-size skeleton holds the space
 * so nothing jumps when the chart arrives.
 */
function ChartSkeleton({ height = 240 }: { height?: number }) {
  return (
    <div role="status" aria-label="Loading chart" className="skeleton w-full rounded-xl" style={{ height }}>
      <span className="sr-only">Loading chart…</span>
    </div>
  );
}

export const ReviewGrowthChart = dynamic(() => import('./review-charts').then((m) => m.ReviewGrowthChart), {
  ssr: false,
  loading: () => <ChartSkeleton height={300} />,
});
export const RatingTrendChart = dynamic(() => import('./review-charts').then((m) => m.RatingTrendChart), {
  ssr: false,
  loading: () => <ChartSkeleton />,
});
export const RatingDistributionChart = dynamic(() => import('./review-charts').then((m) => m.RatingDistributionChart), {
  ssr: false,
  loading: () => <ChartSkeleton height={200} />,
});
export const MonthlyGainedChart = dynamic(() => import('./review-charts').then((m) => m.MonthlyGainedChart), {
  ssr: false,
  loading: () => <ChartSkeleton />,
});
export const VelocityTrendChart = dynamic(() => import('./review-charts').then((m) => m.VelocityTrendChart), {
  ssr: false,
  loading: () => <ChartSkeleton />,
});
