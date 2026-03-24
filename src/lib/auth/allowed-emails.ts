export const ALLOWED_EMAILS = ["jaanes79@gmail.com", "trennikas@gmail.com"] as const;
const ALLOWED_EMAIL_SET = new Set<string>(ALLOWED_EMAILS);

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function isAllowedEmail(email: string | null | undefined) {
  if (!email) {
    return false;
  }

  return ALLOWED_EMAIL_SET.has(normalizeEmail(email));
}
