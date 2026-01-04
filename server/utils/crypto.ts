import { randomBytes, createCipheriv, createDecipheriv } from "crypto";

// NIST SP 800-38D: 96-bit IV is required for AES-GCM to prevent GHASH collisions.
// DO NOT CHANGE: Using any other IV length breaks NIST compliance.
const IV_BYTES = 12;
const IV_HEX_LENGTH = 24; // 12 bytes = 24 hex characters
const KEY_BYTES = 32; // AES-256 requires exactly 32 bytes
const ALGORITHM = "aes-256-gcm";

/**
 * CriticalSecurityError: Thrown when cryptographic invariants are violated.
 * These errors indicate configuration or implementation bugs that must be fixed.
 */
export class CriticalSecurityError extends Error {
  constructor(message: string) {
    super(`[CRITICAL_SECURITY] ${message}`);
    this.name = "CriticalSecurityError";
  }
}

interface EncryptionResult {
  encryptedData: string;
  iv: string;
  tag: string;
}

function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  
  if (!key) {
    throw new CriticalSecurityError("ENCRYPTION_KEY environment variable is not set");
  }
  
  if (key.length < KEY_BYTES) {
    throw new CriticalSecurityError(`ENCRYPTION_KEY must be at least ${KEY_BYTES} characters long`);
  }
  
  // Use first 32 bytes of the key for AES-256
  return Buffer.from(key.slice(0, KEY_BYTES), "utf-8");
}

/**
 * Encrypt plaintext using AES-256-GCM with NIST-compliant 96-bit IV.
 * @param plaintext - The string to encrypt
 * @param customKey - Optional key buffer for key rotation support (defaults to env ENCRYPTION_KEY)
 * @returns EncryptionResult with hex-encoded ciphertext, IV, and auth tag
 * @throws CriticalSecurityError if key length is invalid
 */
export function encrypt(plaintext: string, customKey?: Buffer): EncryptionResult {
  const key = customKey ?? getEncryptionKey();
  
  // Runtime key length validation - prevents silent failures from misconfiguration
  if (key.length !== KEY_BYTES) {
    throw new CriticalSecurityError(`Encryption key must be exactly ${KEY_BYTES} bytes, got ${key.length}`);
  }
  
  // NIST SP 800-38D: Generate exactly 12 random bytes for IV
  const iv = randomBytes(IV_BYTES);
  
  const cipher = createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  
  const tag = cipher.getAuthTag();
  
  return {
    encryptedData: encrypted,
    iv: iv.toString("hex"),
    tag: tag.toString("hex"),
  };
}

/**
 * Decrypt ciphertext using AES-256-GCM.
 * @param encryptedData - Hex-encoded ciphertext
 * @param ivHex - Hex-encoded IV (must be exactly 24 hex chars / 12 bytes for NIST compliance)
 * @param tagHex - Hex-encoded authentication tag
 * @param customKey - Optional key buffer for key rotation support (defaults to env ENCRYPTION_KEY)
 * @returns Decrypted plaintext string
 * @throws CriticalSecurityError if IV length is invalid
 */
export function decrypt(encryptedData: string, ivHex: string, tagHex: string, customKey?: Buffer): string {
  // NIST SP 800-38D: Validate IV is exactly 12 bytes (24 hex characters)
  if (ivHex.length !== IV_HEX_LENGTH) {
    throw new CriticalSecurityError(`IV must be exactly ${IV_HEX_LENGTH} hex characters (${IV_BYTES} bytes), got ${ivHex.length}`);
  }
  
  const key = customKey ?? getEncryptionKey();
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  
  let decrypted = decipher.update(encryptedData, "hex", "utf8");
  decrypted += decipher.final("utf8");
  
  return decrypted;
}

export function selfTest(): boolean {
  try {
    const testString = "PHANTOM_VAULT_SELF_TEST_" + Date.now();
    
    const { encryptedData, iv, tag } = encrypt(testString);
    const decrypted = decrypt(encryptedData, iv, tag);
    
    if (decrypted !== testString) {
      console.error("[SECURITY] Vault self-test FAILED: Decryption mismatch");
      return false;
    }
    
    console.log("[SECURITY] Vault self-test passed: AES-256-GCM Active");
    return true;
  } catch (error) {
    console.error("[SECURITY] Vault self-test FAILED:", error);
    return false;
  }
}

export function runSecurityCheck(): void {
  if (!selfTest()) {
    console.error("[SECURITY] Critical security failure - shutting down");
    process.exit(1);
  }
}

/**
 * Log Sanitization: Redact PII for safe logging
 * Transforms "user@example.com" to "use***@***.com"
 * Preserves debugging utility while preventing PII exposure in logs
 */
export function redactEmail(email: string): string {
  if (!email || typeof email !== 'string') return '[INVALID]';
  
  const atIndex = email.indexOf('@');
  if (atIndex < 1) return '[MALFORMED]';
  
  const localPart = email.substring(0, atIndex);
  const domainPart = email.substring(atIndex + 1);
  const dotIndex = domainPart.lastIndexOf('.');
  
  const visibleLocal = localPart.substring(0, Math.min(3, localPart.length));
  const tld = dotIndex > 0 ? domainPart.substring(dotIndex) : '';
  
  return `${visibleLocal}***@***${tld}`;
}

/**
 * Log Sanitization: Redact customer name for safe logging
 * Transforms "John Smith" to "Joh*** S***"
 */
export function redactName(name: string): string {
  if (!name || typeof name !== 'string') return '[INVALID]';
  
  const parts = name.trim().split(/\s+/);
  return parts.map(part => {
    if (part.length <= 1) return part[0] + '***';
    return part.substring(0, Math.min(3, part.length)) + '***';
  }).join(' ');
}

/**
 * VaultDiagnostic: Pre-flight integrity check for Ghost Hunter
 * Encrypts/decrypts a known test string and measures timing
 * @returns Object with success status and encryption timing in ms
 * @throws Error with CRITICAL_VAULT_ERROR if integrity check fails
 */
export function vaultDiagnostic(): { success: boolean; encryptMs: number; decryptMs: number } {
  const testString = "PHANTOM_INTEGRITY_TEST";
  
  const encryptStart = performance.now();
  let encrypted: EncryptionResult;
  try {
    encrypted = encrypt(testString);
  } catch (error: any) {
    throw new Error(`CRITICAL_VAULT_ERROR: Encryption failed - ${error.message}`);
  }
  const encryptMs = performance.now() - encryptStart;
  
  const decryptStart = performance.now();
  let decrypted: string;
  try {
    decrypted = decrypt(encrypted.encryptedData, encrypted.iv, encrypted.tag);
  } catch (error: any) {
    throw new Error(`CRITICAL_VAULT_ERROR: Decryption failed - ${error.message}`);
  }
  const decryptMs = performance.now() - decryptStart;
  
  if (decrypted !== testString) {
    throw new Error(`CRITICAL_VAULT_ERROR: Integrity mismatch - decrypted value does not match original`);
  }
  
  return {
    success: true,
    encryptMs: Math.round(encryptMs * 100) / 100,
    decryptMs: Math.round(decryptMs * 100) / 100,
  };
}
