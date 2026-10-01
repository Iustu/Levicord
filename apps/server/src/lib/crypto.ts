import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits recommended for GCM
const PREFIX = 'enc:v1:';

/**
 * Derives a deterministic 256-bit encryption key from environment secrets.
 * Prefers DATABASE_ENCRYPTION_KEY; falls back to JWT_SECRET only as a last
 * resort. Throws at startup if neither variable is set — a hardcoded fallback
 * key would defeat the entire encryption scheme.
 * (Building Secure and Reliable Systems — Cap. 5 Least Privilege, Cap. 14 Deploying)
 */
export function getEncryptionKey(): Buffer {
  const secret = process.env.DATABASE_ENCRYPTION_KEY || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      'FATAL: DATABASE_ENCRYPTION_KEY (or JWT_SECRET as fallback) environment variable is not set. ' +
      'Refusing to start — a missing key would encrypt all messages with a public hardcoded string.',
    );
  }
  return crypto.createHash('sha256').update(secret).digest();
}

/**
 * Derives a dedicated 256-bit subkey for a specific server using HKDF (RFC 5869).
 * Guarantees cryptographic domain separation between different servers.
 */
export function deriveServerKey(serverId: string | null | undefined): Buffer {
  const masterKey = getEncryptionKey();
  const salt = Buffer.from(serverId ? `levicord-server-${serverId}` : 'levicord-global-server');
  const info = Buffer.from('channel-message-encryption-v1');
  return Buffer.from(crypto.hkdfSync('sha256', masterKey, salt, info, 32));
}

/**
 * Checks if a string is encrypted in the expected Levicord enc:v1 format.
 */
export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

/**
 * Encrypts sensitive plaintext using authenticated AES-256-GCM.
 * Stored format: `enc:v1:<iv_hex>:<tag_hex>:<ciphertext_hex>`
 */
export function encrypt(plaintext: string | null | undefined, customKey?: Buffer): string | null {
  if (plaintext === null || plaintext === undefined) return null;
  if (plaintext === '') return '';

  const key = customKey || getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);

  const tag = cipher.getAuthTag();

  return `${PREFIX}${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypts an authenticated AES-256-GCM ciphertext.
 * Gracefully handles legacy unencrypted text (zero downtime / migration friendly).
 */
export function decrypt(ciphertext: string | null | undefined, customKey?: Buffer): string | null {
  if (ciphertext === null || ciphertext === undefined) return null;
  if (ciphertext === '') return '';

  if (!isEncrypted(ciphertext)) {
    // Legacy plaintext: return as-is for backward compatibility
    return ciphertext;
  }

  const parts = ciphertext.slice(PREFIX.length).split(':');
  if (parts.length !== 3) {
    throw new Error('Malformed encrypted payload format');
  }

  const [ivHex, tagHex, encryptedHex] = parts;
  const key = customKey || getEncryptionKey();
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');
  if (tag.length !== 16) {
    throw new Error('Invalid authentication tag length: expected 16 bytes');
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: 16 });
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

/**
 * Encrypts channel message plaintext using the specific server key (or global server key).
 */
export function encryptForServer(plaintext: string | null | undefined, serverId?: string | null): string | null {
  const serverKey = deriveServerKey(serverId);
  return encrypt(plaintext, serverKey);
}

/**
 * Decrypts channel message ciphertext using the specific server key.
 * If decryption with server key fails (e.g. legacy master key encryption), falls back gracefully.
 */
export function decryptForServer(ciphertext: string | null | undefined, serverId?: string | null): string | null {
  if (ciphertext === null || ciphertext === undefined) return null;
  if (ciphertext === '') return '';

  if (!isEncrypted(ciphertext)) {
    return ciphertext;
  }

  const serverKey = deriveServerKey(serverId);
  try {
    return decrypt(ciphertext, serverKey);
  } catch {
    // Fallback to master key in case the message was encrypted with master key
    try {
      return decrypt(ciphertext, getEncryptionKey());
    } catch {
      throw new Error('Falha na autenticação da mensagem criptografada (chave de servidor incompatível ou corrompida).');
    }
  }
}
