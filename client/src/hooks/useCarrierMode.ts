import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "claims_carrier_mode";
const EVENT_NAME = "carrier-mode-changed";

export function useCarrierMode() {
  const [carrierMode, setCarrierMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        setCarrierMode(e.newValue === "true");
      }
    };
    const handleCustomEvent = (e: Event) => {
      setCarrierMode((e as CustomEvent<boolean>).detail);
    };
    window.addEventListener("storage", handleStorageChange);
    window.addEventListener(EVENT_NAME, handleCustomEvent as EventListener);
    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener(EVENT_NAME, handleCustomEvent as EventListener);
    };
  }, []);

  const toggleCarrierMode = useCallback(() => {
    setCarrierMode((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, String(next));
        window.dispatchEvent(new CustomEvent<boolean>(EVENT_NAME, { detail: next }));
      } catch {}
      return next;
    });
  }, []);

  return { carrierMode, toggleCarrierMode };
}
