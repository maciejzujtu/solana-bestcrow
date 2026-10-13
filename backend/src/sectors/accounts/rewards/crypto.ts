import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const DEFAULT_SECRET = 'bestcrow-canonical-server-reward-secret-v1';

export function deriveServerRewardKey(secret: string = process.env.REWARD_SECRET ?? DEFAULT_SECRET): Buffer {
  return createHash('sha256').update(secret, 'utf8').digest();
}

/**
 * Encrypts digital reward secret content (e.g. Steam codes, beta keys) using AES-256-GCM.
 * Format: "enc:v1:<iv_hex>:<tag_hex>:<ciphertext_hex>"
 */
export function encryptRewardContent(plaintext: string, secretKey: Buffer = deriveServerRewardKey()): string {
  if (!plaintext) return plaintext;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', secretKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${iv.toString('hex')}:${tag.toString('hex')}:${ciphertext.toString('hex')}`;
}

/**
 * Decrypts digital reward content encrypted with AES-256-GCM.
 * Backward compatible: if plaintext does not start with "enc:v1:", returns as-is.
 */
export function decryptRewardContent(stored: string, secretKey: Buffer = deriveServerRewardKey()): string {
  if (!stored || !stored.startsWith('enc:v1:')) return stored;
  const parts = stored.split(':');
  if (parts.length !== 5) return stored;
  const ivHex = parts[2];
  const tagHex = parts[3];
  const dataHex = parts[4];
  if (!ivHex || !tagHex || !dataHex) return stored;
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const data = Buffer.from(dataHex, 'hex');
  const decipher = createDecipheriv('aes-256-gcm', secretKey, iv);
  decipher.setAuthTag(tag);
  return decipher.update(data) + decipher.final('utf8');
}
