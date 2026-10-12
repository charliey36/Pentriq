import { DEFAULT_APP_URL } from '@/lib/brand';

/** Canonical production origin. Used for canonicals, Open Graph URLs and structured data. */
export const SITE_URL = DEFAULT_APP_URL;

export const ORG = {
  name: 'Pentriq',
  url: SITE_URL,
  email: 'hello@pentriq.cloud',
  locality: 'Poole',
  region: 'Dorset',
  country: 'United Kingdom',
  countryCode: 'GB',
  logo: `${SITE_URL}/email-assets/logo-mark.png`,
} as const;

export const ORG_LOCATION = `${ORG.locality}, ${ORG.region}, ${ORG.country}`;
