import { createCipheriv, createDecipheriv, randomBytes, createHash, randomUUID } from "crypto";

// ─── API Key Enclave / Vault ────────────────────────────────────────
// หากระบบต้องเก็บ API Credentials (เช่น Shodan Key, OpenAI Key, AWS Keys)
// ต้องใช้การดึงแบบ Encrypted at Rest เท่านั้น ห้าม Hardcode ลง DB ปกติ
//
// ระบบนี้ใช้ AES-256-GCM สำหรับ encrypt/decrypt secrets
// โดย master key มาจาก environment variable (VAULT_MASTER_KEY)
// และแต่ละ secret จะมี unique IV + auth tag

export type SecretType =
  | "openai"
  | "anthropic"
  | "shodan"
  | "aws"
  | "github"
  | "nuclei"
  | "custom";

export interface VaultSecret {
  id: string;
  name: string;
  type: SecretType;
  encryptedValue: string; // base64(iv + authTag + ciphertext)
  createdAt: Date;
  updatedAt: Date;
  metadata: Record<string, any>;
  lastAccessedAt?: Date;
}

// ─── Vault Manager ──────────────────────────────────────────────────

export class VaultManager {
  private secrets = new Map<string, VaultSecret>();
  private masterKey: Buffer;

  constructor(masterKey?: string) {
    // Master key from env var or generate a deterministic one for demo
    const keyMaterial = masterKey ?? process.env.VAULT_MASTER_KEY ?? "vektorsec-dev-master-key";
    this.masterKey = createHash("sha256").update(keyMaterial).digest();
  }

  // Encrypt a plaintext value
  private encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.masterKey, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()]);
    const authTag = cipher.getAuthTag();
    // Format: iv + authTag + ciphertext
    return Buffer.concat([iv, authTag, encrypted]).toString("base64");
  }

  // Decrypt an encrypted value
  private decrypt(encryptedValue: string): string {
    const data = Buffer.from(encryptedValue, "base64");
    const iv = data.subarray(0, 12);
    const authTag = data.subarray(12, 28);
    const ciphertext = data.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", this.masterKey, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf-8");
  }

  // Store a new secret
  store(params: {
    name: string;
    type: SecretType;
    value: string;
    metadata?: Record<string, any>;
  }): VaultSecret {
    const now = new Date();
    const secret: VaultSecret = {
      id: randomUUID(),
      name: params.name,
      type: params.type,
      encryptedValue: this.encrypt(params.value),
      createdAt: now,
      updatedAt: now,
      metadata: params.metadata ?? {},
    };
    this.secrets.set(secret.id, secret);
    return this.redact(secret);
  }

  // Retrieve a secret (decrypted)
  retrieve(id: string): { secret: VaultSecret; value: string } | null {
    const secret = this.secrets.get(id);
    if (!secret) return null;
    secret.lastAccessedAt = new Date();
    return {
      secret: this.redact(secret),
      value: this.decrypt(secret.encryptedValue),
    };
  }

  // Retrieve by name
  retrieveByName(name: string): { secret: VaultSecret; value: string } | null {
    const secret = Array.from(this.secrets.values()).find((s) => s.name === name);
    if (!secret) return null;
    secret.lastAccessedAt = new Date();
    return {
      secret: this.redact(secret),
      value: this.decrypt(secret.encryptedValue),
    };
  }

  // Update a secret value
  update(id: string, value: string): VaultSecret | null {
    const secret = this.secrets.get(id);
    if (!secret) return null;
    secret.encryptedValue = this.encrypt(value);
    secret.updatedAt = new Date();
    return this.redact(secret);
  }

  // Delete a secret
  delete(id: string): boolean {
    return this.secrets.delete(id);
  }

  // List all secrets (redacted - no values)
  list(): VaultSecret[] {
    return Array.from(this.secrets.values()).map((s) => this.redact(s));
  }

  // Get count
  getCount(): number {
    return this.secrets.size;
  }

  // Redact a secret (remove encrypted value for safe display)
  private redact(secret: VaultSecret): VaultSecret {
    return {
      ...secret,
      encryptedValue: "••••••••••••",
    };
  }

  // Verify a secret value matches
  verify(id: string, candidate: string): boolean {
    const secret = this.secrets.get(id);
    if (!secret) return false;
    try {
      const decrypted = this.decrypt(secret.encryptedValue);
      return decrypted === candidate;
    } catch {
      return false;
    }
  }
}

// ─── Singleton instance ─────────────────────────────────────────────

let vaultInstance: VaultManager | null = null;

export function getVault(): VaultManager {
  if (!vaultInstance) {
    vaultInstance = new VaultManager();
  }
  return vaultInstance;
}
