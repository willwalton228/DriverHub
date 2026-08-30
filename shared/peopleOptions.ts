// Controlled operational people lists shared across Driver and Recruiting UI.
// Current display names belong here so individual screens never maintain
// divergent copies of a person's name.
export const DIRECT_MANAGER_VALUES = [
  "Anthony Montenegro",
  "Louis Pinargote",
  "Luis Valdez",
  "Hugo Garzon",
  "Lisa Parkhurst",
  "Susanne Beebe",
] as const;

export type DirectManagerValue = typeof DIRECT_MANAGER_VALUES[number];

export const CERTIFIED_BY_VALUES = [
  "Anthony Montenegro",
  "Eric Sanchez",
  "Hugo Garzon",
  "Lisa Parkhurst",
  "Susanne Beebe",
] as const;

export type CertifiedByValue = typeof CERTIFIED_BY_VALUES[number];

export const CERT_LIAISON_VALUES = [
  "Hugo Garzon",
  "Anthony Montenegro",
  "Lisa Parkhurst",
  "Susanne Beebe",
  "Louis Pinargote",
] as const;

export type CertLiaisonValue = typeof CERT_LIAISON_VALUES[number];