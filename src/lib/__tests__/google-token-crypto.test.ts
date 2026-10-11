import { randomBytes } from 'crypto';
import { decryptToken, encryptToken, getEncryptionKey, isTokenEncryptionConfigured } from '../google-token-crypto';

const KEY = randomBytes(32);

describe('google token encryption', () => {
  const original = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
  afterEach(() => {
    if (original === undefined) delete process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
    else process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = original;
  });

  it('round-trips and never stores the plaintext', () => {
    const token = 'ya29.a0AfH6SMB-secret-token';
    const encrypted = encryptToken(token, KEY);
    expect(encrypted).not.toContain(token);
    expect(encrypted.startsWith('v1:')).toBe(true);
    expect(decryptToken(encrypted, KEY)).toBe(token);
  });

  it('uses a fresh IV each time', () => {
    expect(encryptToken('same', KEY)).not.toBe(encryptToken('same', KEY));
  });

  it('rejects tampered ciphertext and the wrong key', () => {
    const encrypted = encryptToken('secret', KEY);
    const parts = encrypted.split(':');
    parts[3] = Buffer.from('tampered').toString('base64url');
    expect(() => decryptToken(parts.join(':'), KEY)).toThrow();
    expect(() => decryptToken(encrypted, randomBytes(32))).toThrow();
  });

  it('rejects unknown formats', () => {
    expect(() => decryptToken('plain-token', KEY)).toThrow(/format/);
  });

  it('reads the key from the environment (base64 or hex) and validates its length', () => {
    delete process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
    expect(isTokenEncryptionConfigured()).toBe(false);
    expect(() => getEncryptionKey()).toThrow(/not set/);

    process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = KEY.toString('base64');
    expect(getEncryptionKey().equals(KEY)).toBe(true);
    process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = KEY.toString('hex');
    expect(getEncryptionKey().equals(KEY)).toBe(true);
    expect(isTokenEncryptionConfigured()).toBe(true);

    process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = 'too-short';
    expect(() => getEncryptionKey()).toThrow(/32 bytes/);
  });
});
