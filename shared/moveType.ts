export const CANONICAL_MOVE_TYPES = ["DriverShift", "DriverDash"] as const;

export type CanonicalMoveType = (typeof CANONICAL_MOVE_TYPES)[number];

export function normalizeMoveType(value: unknown): CanonicalMoveType | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== "string") {
    throw new Error("Move Type must be DriverShift or DriverDash.");
  }

  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return null;
  }

  if ((CANONICAL_MOVE_TYPES as readonly string[]).includes(trimmedValue)) {
    return trimmedValue as CanonicalMoveType;
  }

  throw new Error("Move Type must be DriverShift or DriverDash.");
}