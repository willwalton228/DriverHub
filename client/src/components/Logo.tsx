import { useState, useEffect } from "react";
import type { CSSProperties } from "react";
import dhIconUrl from "@/assets/dh-icon-transparent.png";

interface LogoProps {
  variant?: "full" | "icon";
  className?: string;
}

function useDarkMode() {
  const [dark, setDark] = useState(() => {
    const stored = localStorage.getItem("theme");
    if (stored) return stored === "dark";
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
  });
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setDark(document.documentElement.classList.contains("dark"));
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);
  return dark;
}

export function BrandIcon({ className = "", style }: { className?: string; style?: CSSProperties }) {
  return (
    <img
      src={dhIconUrl}
      alt="DriverHub 360"
      className={className}
      draggable={false}
      style={style}
      data-testid="brand-icon"
    />
  );
}

export function Logo({ variant = "full", className = "" }: LogoProps) {
  return (
    <img
      src={dhIconUrl}
      alt="DriverHub 360"
      className={className || (variant === "icon" ? "h-8" : "h-10")}
      draggable={false}
      data-testid={variant === "icon" ? "logo-icon" : "logo-full"}
    />
  );
}

export function SidebarLogo({ className = "" }: { className?: string }) {
  const dark = useDarkMode();
  return (
    <img
      src={dark ? "/dh-icon-white.svg" : "/dh-icon-black.svg"}
      alt="DriverHub"
      className={className || "h-8 w-auto shrink-0"}
      draggable={false}
      data-testid="sidebar-logo"
    />
  );
}

export function HeaderLogo({ className = "h-10 w-auto shrink-0" }: { className?: string }) {
  const dark = useDarkMode();
  return (
    <img
      src={dark ? "/dh-logo-white.svg" : "/dh-logo-color.svg"}
      alt="DriverHub 360"
      className={className}
      draggable={false}
      data-testid="header-logo"
    />
  );
}

/** AMR screen sidebar variant — full-color logo in Day (light) mode, white icon in Night (dark) mode. */
export function SidebarLogoAMR({ className = "" }: { className?: string }) {
  const dark = useDarkMode();
  return (
    <img
      src={dark ? "/dh-icon-white.svg" : "/dh-logo-color.svg"}
      alt="DriverHub 360"
      className={className || "h-[186px] w-auto shrink-0"}
      draggable={false}
      data-testid="sidebar-logo-amr"
    />
  );
}
