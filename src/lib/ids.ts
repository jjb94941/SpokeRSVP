import { createHash, randomBytes, randomUUID } from "node:crypto";

export function newId(): string {
  return randomUUID();
}

export function newShareToken(): string {
  return randomBytes(9).toString("base64url");
}

export function newSecretToken(bytes = 24): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
