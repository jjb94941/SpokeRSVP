export function normalizeEmail(email?: string | null): string | null {
  const value = (email || "").trim().toLowerCase();
  return value ? value : null;
}

export function normalizePhone(phone?: string | null): string | null {
  const digits = (phone || "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits;
}

export function formatPhoneDisplay(phone?: string | null): string {
  const digits = normalizePhone(phone);
  if (!digits) return "";
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return digits;
}

export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || fullName;
}

export function csvEscape(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? "" : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}
