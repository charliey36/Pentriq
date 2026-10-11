import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

/**
 * AES-256-GCM encryption for Google OAuth tokens at rest.
 *
 * The key lives in GOOGLE_TOKEN_ENCRYPTION_KEY (never in the database), so a
 * leaked database backup or a mis-scoped read cannot be replayed against
 * Google. Stored format: "v1:<iv>:<auth tag>:<ciphertext>" (all base64url).
 * GCM is authenticated, so tampered values fail to decrypt rather than
 * returning garbage.
 *
 * Generate a key with: openssl rand -base64 32
 */

const VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';

export function getEncryptionKey(): Buffer {
  const raw = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY?.trim();
  if (!raw) {
    throw new Error('GOOGLE_TOKEN_ENCRYPTION_KEY is not set (generate one with: openssl rand -base64 32).');
  }
  // Accept 64 hex chars or 32 bytes of base64/base64url.
  const key = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error('GOOGLE_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes.');
  }
  return key;
}

export function encryptToken(plaintext: string, key: Buffer = getEncryptionKey()): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join(':');
}

export function decryptToken(payload: string, key: Buffer = getEncryptionKey()): string {
  const [version, iv, tag, ciphertext] = payload.split(':');
  if (version !== VERSION || !iv || !tag || !ciphertext) {
    throw new Error('Unrecognised encrypted token format.');
  }
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()]).toString('utf8');
}

/** True when the server is configured to store Google tokens. */
export function isTokenEncryptionConfigured(): boolean {
  try {
    getEncryptionKey();
    return true;
  } catch {
    return false;
  }
}
