try {
  const theme = localStorage.getItem("theme");
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
  if (theme === "dark" || (!theme && prefersDark)) {
    document.documentElement.classList.add("dark");
  }
} catch {
  // Theme detection is non-critical; continue with the default theme.
}
