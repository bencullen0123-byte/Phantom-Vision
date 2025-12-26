import { randomBytes, createCipheriv, createDecipheriv } from "crypto";

// NIST recommended IV length for AES-GCM is 12 bytes (96 bits)
const IV_LENGTH = 12;
const ALGORITHM = "aes-256-gcm";

interface EncryptionResult {
  encryptedData: string;
  iv: string;
  tag: string;
}

function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  
  if (!key) {
    console.error("[SECURITY] ENCRYPTION_KEY environment variable is not set");
    process.exit(1);
  }
  
  if (key.length < 32) {
    console.error("[SECURITY] ENCRYPTION_KEY must be at least 32 characters long");
    process.exit(1);
  }
  
  // Use first 32 bytes of the key for AES-256
  return Buffer.from(key.slice(0, 32), "utf-8");
}

export function encrypt(plaintext: string): EncryptionResult {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  
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

export function decrypt(encryptedData: string, ivHex: string, tagHex: string): string {
  const key = getEncryptionKey();
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
