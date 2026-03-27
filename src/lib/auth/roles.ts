import { normalizeEmail } from "@/lib/auth/allowed-emails";

export type AppRole = "admin" | "trainer";

const EMAIL_ROLE_MAP: Record<string, AppRole> = {
  [normalizeEmail("jaanes79@gmail.com")]: "admin",
  [normalizeEmail("trennikas@gmail.com")]: "trainer",
};

const TRAINER_RESTRICTED_PREFIXES = ["/settings", "/activity"];

export function getRoleForEmail(email: string | null | undefined): AppRole | null {
  if (!email) {
    return null;
  }

  return EMAIL_ROLE_MAP[normalizeEmail(email)] ?? null;
}

export function canAccessPath(role: AppRole, pathname: string) {
  if (role === "admin") {
    return true;
  }

  return !TRAINER_RESTRICTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
