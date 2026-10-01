import { describe, it, expect } from 'vitest';
import { encrypt, decrypt, isEncrypted } from './crypto';

describe('AES-256-GCM Crypto Module', () => {
  it('should encrypt and decrypt a message accurately', () => {
    const original = 'Mensagem confidencial entre usuários do Levicord';
    const encrypted = encrypt(original);

    expect(encrypted).not.toBeNull();
    expect(encrypted).not.toBe(original);
    expect(isEncrypted(encrypted)).toBe(true);

    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(original);
  });

  it('should generate different ciphertexts for the same plaintext due to random IVs', () => {
    const message = 'Mesmo texto repetido';
    const cipher1 = encrypt(message);
    const cipher2 = encrypt(message);

    expect(cipher1).not.toBe(cipher2);
    expect(decrypt(cipher1)).toBe(message);
    expect(decrypt(cipher2)).toBe(message);
  });

  it('should gracefully return legacy plaintext without error', () => {
    const legacyMessage = 'Texto gravado antes da migração de criptografia';
    expect(isEncrypted(legacyMessage)).toBe(false);
    expect(decrypt(legacyMessage)).toBe(legacyMessage);
  });

  it('should handle null and empty inputs correctly', () => {
    expect(encrypt(null)).toBeNull();
    expect(decrypt(null)).toBeNull();
    expect(encrypt('')).toBe('');
    expect(decrypt('')).toBe('');
  });

  it('should fail with error when ciphertext has been tampered with', () => {
    const original = 'Dados confidenciais que não podem ser alterados';
    const encrypted = encrypt(original)!;

    // Tamper with the last byte of the encrypted payload
    const tampered = encrypted.slice(0, -2) + (encrypted.endsWith('aa') ? 'bb' : 'aa');

    expect(() => decrypt(tampered)).toThrow();
  });

  it('should throw when payload structure is malformed', () => {
    expect(() => decrypt('enc:v1:corrupted-structure')).toThrow('Malformed encrypted payload format');
  });
});
