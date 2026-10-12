import { ImageResponse } from 'next/og';

export const alt = 'Pentriq Blog: Google Reviews & Reputation Management Guides';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function Image() {
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
        <div style={{ fontSize: 30, fontWeight: 600, opacity: 0.9, display: 'flex' }}>The Pentriq blog</div>
        <div style={{ fontSize: 72, fontWeight: 700, lineHeight: 1.1, letterSpacing: -2, display: 'flex' }}>
          Google reviews and reputation management guides
        </div>
        <div style={{ fontSize: 34, fontWeight: 700, display: 'flex' }}>Pentriq · pentriq.cloud</div>
      </div>
    ),
    size
  );
}
