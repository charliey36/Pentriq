import { ImageResponse } from 'next/og';
import { POSTS, getPost } from '@/lib/blog';

export const alt = 'Pentriq blog article';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export function generateStaticParams() {
  return POSTS.map((p) => ({ slug: p.slug }));
}

export default function Image({ params }: { params: { slug: string } }) {
  const post = getPost(params.slug);
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 72,
          color: 'white',
          background: 'linear-gradient(135deg, #064e3b 0%, #065f46 28%, #0f766e 66%, #0e7490 100%)',
        }}
      >
        <div style={{ fontSize: 30, fontWeight: 600, letterSpacing: 1, opacity: 0.9, display: 'flex' }}>
          {post?.category ?? 'Pentriq Blog'}
        </div>
        <div style={{ fontSize: 66, fontWeight: 700, lineHeight: 1.1, letterSpacing: -1.5, display: 'flex' }}>
          {post?.title ?? 'Pentriq Blog'}
        </div>
        <div style={{ fontSize: 34, fontWeight: 700, display: 'flex' }}>Pentriq · pentriq.cloud</div>
      </div>
    ),
    size
  );
}
