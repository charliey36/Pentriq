import { PageFrame } from '@/components/marketing/page-frame';
import { pageMetadata } from '@/lib/seo';
import { ReviewGapCalculator } from './calculator';

export const metadata = pageMetadata({
  title: 'Review Gap Calculator',
  description: 'How many Google reviews is your business missing every month? Enter your customers, reviews and rating to see the gap and what automatic review requests could add.',
  path: '/tools/review-gap-calculator',
});

export default function ReviewGapCalculatorPage() {
  return (
    <PageFrame
      wide
      eyebrow="Free tool"
      title="How many reviews are you missing?"
      intro="Most happy customers never leave a review because nobody asks at the right moment. See the size of the gap for your business in ten seconds."
    >
      <ReviewGapCalculator />
    </PageFrame>
  );
}
