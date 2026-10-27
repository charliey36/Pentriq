import { acuity } from './acuity';
import { calendly } from './calendly';
import { square } from './square';
import type { BookingProvider, ProviderId } from './types';

export const PROVIDERS: Record<ProviderId, BookingProvider> = { square, acuity, calendly };
export const PROVIDER_LIST: BookingProvider[] = [square, acuity, calendly];

export const isProviderId = (v: string): v is ProviderId => v in PROVIDERS;
