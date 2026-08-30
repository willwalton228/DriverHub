const PASSWORD_RESET_EXPIRES_AT_KEY = "driverhub.passwordResetExpiresAt";
const PASSWORD_RESET_CHANGE_EVENT = "driverhub:password-reset-session-change";

function readStoredExpiration(): number | null {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(PASSWORD_RESET_EXPIRES_AT_KEY);
  if (!raw) return null;

  const expiresAt = Number(raw);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    window.sessionStorage.removeItem(PASSWORD_RESET_EXPIRES_AT_KEY);
    return null;
  }
  return expiresAt;
}

export function getPasswordResetExpiration(): number | null {
  return readStoredExpiration();
}

export function setPasswordResetExpiration(expiresAt: number): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(PASSWORD_RESET_EXPIRES_AT_KEY, String(expiresAt));
  window.dispatchEvent(new Event(PASSWORD_RESET_CHANGE_EVENT));
}

export function clearPasswordResetExpiration(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(PASSWORD_RESET_EXPIRES_AT_KEY);
  window.dispatchEvent(new Event(PASSWORD_RESET_CHANGE_EVENT));
}

export function subscribeToPasswordResetSession(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(PASSWORD_RESET_CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(PASSWORD_RESET_CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}