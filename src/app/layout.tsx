import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import { ThemeProvider, THEME_BOOTSTRAP_SCRIPT } from '@/components/theme-context';
import { SpotlightProvider } from '@/components/spotlight';
import { APP_DESCRIPTION, APP_NAME, APP_TITLE, getAppUrl } from '@/lib/brand';

/* Inter (variable, latin subset, SIL OFL) is self-hosted so there is no
   build-time or runtime request to Google Fonts. */
const inter = localFont({
  src: './fonts/InterVariable.woff2',
  variable: '--font-inter',
  display: 'swap',
  weight: '100 900',
});

export const metadata: Metadata = {
  metadataBase: new URL(getAppUrl()),
  verification: { google: 'YOflWQv8bKlrDezkUcS4FPJm-KO-M39FJGtVnTgo5_0' },
  title: {
    default: APP_TITLE,
    template: `%s · ${APP_NAME}`,
  },
  description: APP_DESCRIPTION,
  applicationName: APP_NAME,
  openGraph: {
    title: APP_TITLE,
    description: APP_DESCRIPTION,
    siteName: APP_NAME,
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: APP_TITLE,
    description: APP_DESCRIPTION,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#060910',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // suppressHydrationWarning: the inline script below adds the `dark`
    // class to <html> before React hydrates, which is intentional.
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        {/* Runs before paint to apply the right theme class immediately,
            avoiding a flash of light mode before React hydrates. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />
      </head>
      <body>
        <ThemeProvider>
          <SpotlightProvider />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
