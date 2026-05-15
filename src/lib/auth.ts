const KEY = "stats_umami_auth_v1";

export function isAuthed(): boolean {
  if (typeof window === "undefined") return false;
  return true; // TEMP DEBUG
}

export function tryLogin(password: string): boolean {
  const expected = import.meta.env.VITE_DASHBOARD_PASSWORD as string | undefined;
  if (!expected) return false;
  if (password === expected) {
    sessionStorage.setItem(KEY, "1");
    return true;
  }
  return false;
}

export function logout() {
  sessionStorage.removeItem(KEY);
}
