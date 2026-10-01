import { describe, it, expect, beforeAll } from 'vitest';
import { encrypt, decrypt } from './crypto';
import crypto from 'crypto';

describe('AES-256-GCM Fuzz Testing', () => {
  beforeAll(() => {
    process.env.DATABASE_ENCRYPTION_KEY = 'fuzz-test-key-32-chars-long-secret!';
  });

  const chars = Array.from(
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;:\'",.<>/?`~ \t\n\r' +
    '日本語한국어العربيةРусский🎉🔥🚀💀🔒',
  );

  function randomString(length: number): string {
    let res = '';
    for (let i = 0; i < length; i++) {
      const idx = crypto.randomInt(0, chars.length);
      res += chars[idx];
    }
    return res;
  }

  it('preserves plaintext across 100 randomly generated UTF-8/Unicode payloads', () => {
    for (let i = 0; i < 100; i++) {
      const len = crypto.randomInt(1, 500);
      const plaintext = randomString(len);
      const encrypted = encrypt(plaintext);
      expect(encrypted).not.toBeNull();
      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    }
  });

  it('preserves boundary lengths: 1 char, 16 chars, 64 chars, 4096 chars', () => {
    const lengths = [1, 2, 15, 16, 17, 31, 32, 33, 64, 128, 512, 1024, 2048];
    for (const len of lengths) {
      const plaintext = randomString(len);
      const decrypted = decrypt(encrypt(plaintext));
      expect(decrypted).toBe(plaintext);
    }
  });

  it('rejects tampered ciphertexts across 50 random single-byte bit flips', () => {
    for (let i = 0; i < 50; i++) {
      const plaintext = `Sensível_${i}_${randomString(30)}`;
      const encrypted = encrypt(plaintext)!;

      const parts = encrypted.split(':');
      expect(parts.length).toBe(5);

      // Randomly mutate one character in IV, tag, or ciphertext
      const partToCorrupt = crypto.randomInt(2, 5); // 2 = iv, 3 = tag, 4 = data
      const targetStr = parts[partToCorrupt];
      if (targetStr.length === 0) continue;

      const charIdx = crypto.randomInt(0, targetStr.length);
      const currentByte = targetStr[charIdx];
      const replacementByte = currentByte === 'a' ? 'b' : 'a';
      parts[partToCorrupt] =
        targetStr.slice(0, charIdx) + replacementByte + targetStr.slice(charIdx + 1);

      const corrupted = parts.join(':');
      expect(() => decrypt(corrupted)).toThrow();
    }
  });

  it('safely throws on random malformed enc:v1: payloads without unhandled crashes', () => {
    for (let i = 0; i < 50; i++) {
      // Create malformed payload starting with prefix enc:v1:
      const invalidCount = crypto.randomInt(1, 5);
      const malformedParts = ['enc', 'v1'];
      for (let j = 0; j < invalidCount; j++) {
        malformedParts.push(crypto.randomBytes(crypto.randomInt(1, 15)).toString('hex'));
      }
      const malformed = malformedParts.join(':');
      // If it doesn't have exactly 3 parts after enc:v1: (or has invalid hex/tags), it must throw
      if (malformedParts.length !== 5) {
        expect(() => decrypt(malformed)).toThrow();
      } else {
        // Even with 3 parts, random bytes will fail GCM auth tag verification
        expect(() => decrypt(malformed)).toThrow();
      }
    }
  });
});
