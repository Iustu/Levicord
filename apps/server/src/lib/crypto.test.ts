import { describe, it, expect, beforeAll } from 'vitest';
import { encrypt, decrypt, isEncrypted, deriveServerKey, encryptForServer, decryptForServer } from './crypto';

describe('AES-256-GCM Crypto Module', () => {
  beforeAll(() => {
    process.env.DATABASE_ENCRYPTION_KEY = 'test-key-32-chars-long-secret!!';
  });

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

  describe('Server-scoped Encryption (HKDF domain separation)', () => {
    it('should derive consistent keys for the same server and distinct keys for different servers', () => {
      const key1 = deriveServerKey('server-alpha');
      const key1Again = deriveServerKey('server-alpha');
      const key2 = deriveServerKey('server-beta');
      const keyGlobal = deriveServerKey(null);

      expect(key1).toEqual(key1Again);
      expect(key1).not.toEqual(key2);
      expect(key1).not.toEqual(keyGlobal);
      expect(key1.length).toBe(32);
      expect(key2.length).toBe(32);
    });

    it('should encrypt and decrypt accurately with serverId', () => {
      const original = 'Mensagem restrita ao canal do Servidor Alpha';
      const encrypted = encryptForServer(original, 'server-alpha');

      expect(encrypted).not.toBeNull();
      expect(isEncrypted(encrypted)).toBe(true);

      const decrypted = decryptForServer(encrypted, 'server-alpha');
      expect(decrypted).toBe(original);
    });

    it('should support global channels when serverId is null', () => {
      const original = 'Mensagem em canal global';
      const encrypted = encryptForServer(original, null);
      const decrypted = decryptForServer(encrypted, null);

      expect(decrypted).toBe(original);
    });

    it('should fail when decrypting with an incorrect server key', () => {
      const original = 'Segredo do Servidor A';
      const encrypted = encryptForServer(original, 'server-a')!;

      expect(() => decryptForServer(encrypted, 'server-b')).toThrow(
        'Falha na autenticação da mensagem criptografada',
      );
    });
  });
});
