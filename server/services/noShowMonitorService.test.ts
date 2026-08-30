import { beforeEach, describe, expect, it, vi } from "vitest";

const { runEntitySync } = vi.hoisted(() => ({
  runEntitySync: vi.fn(),
}));

vi.mock("./wiwSyncService", () => ({ runEntitySync }));

import {
  buildNoShowMonitorRow,
  groupNoShowMonitorRows,
  refreshNoShowMonitorWiw,
} from "./noShowMonitorService";

const evaluatedAt = new Date("2026-08-24T14:03:00.000Z");

function sourceRow(overrides: Partial<Parameters<typeof buildNoShowMonitorRow>[0]> = {}) {
  return {
    shift_id: "shift-1",
    driver_id: "driver-1",
    driver_name: "Central Driver",
    worker_classification: "Independent Contractor",
    account_id: "account-1",
    account_name: "Central Account",
    network: "Central Network",
    wiw_location_id: "location-1",
    wiw_location_name: "Central Location",
    wiw_timezone: "America/Chicago",
    shift_start_utc: "2026-08-24T14:00:00.000Z",
    grace_period_end_utc: "2026-08-24T14:03:00.000Z",
    clock_in_utc: null,
    ...overrides,
  };
}

function row(overrides: Partial<Parameters<typeof buildNoShowMonitorRow>[0]> = {}) {
  return buildNoShowMonitorRow(sourceRow(overrides), evaluatedAt);
}

describe("No Show Monitor Phase 1", () => {
  beforeEach(() => {
    runEntitySync.mockReset();
  });

  it("uses Upcoming before the shift starts", () => {
    const result = buildNoShowMonitorRow(sourceRow({
      shift_start_utc: "2026-08-24T14:04:00.000Z",
      grace_period_end_utc: "2026-08-24T14:07:00.000Z",
    }), evaluatedAt);
    expect(result.attendance_status).toBe("Upcoming");
  });

  it("uses Grace Period from start through 2:59", () => {
    expect(row({ shift_start_utc: "2026-08-24T14:01:00.000Z", grace_period_end_utc: "2026-08-24T14:04:00.000Z" }).attendance_status).toBe("Grace Period");
    expect(row({ shift_start_utc: "2026-08-24T14:00:01.000Z", grace_period_end_utc: "2026-08-24T14:03:01.000Z" }).attendance_status).toBe("Grace Period");
  });

  it("uses Action Required at exactly three minutes without a clock-in", () => {
    expect(row().attendance_status).toBe("Not Clocked In / Action Required");
  });

  it("uses Clocked In Late at exactly three minutes when a valid late WIW clock-in exists", () => {
    expect(row({ clock_in_utc: "2026-08-24T14:02:00.000Z" }).attendance_status).toBe("Clocked In Late");
  });

  it("does not classify a missing clock-in as Action Required when WIW data is stale", () => {
    const result = buildNoShowMonitorRow(sourceRow(), evaluatedAt, { clockDataFresh: false });
    expect(result.attendance_status).toBe("Clock Data Delayed");
  });

  it("retains a valid clock-in status even while the WIW sync is stale", () => {
    const result = buildNoShowMonitorRow(
      sourceRow({ clock_in_utc: "2026-08-24T14:02:00.000Z" }),
      evaluatedAt,
      { clockDataFresh: false },
    );
    expect(result.attendance_status).toBe("Clocked In Late");
  });

  it("converts location timezones and groups equal instants across Central and Eastern", () => {
    const central = row();
    const eastern = buildNoShowMonitorRow(sourceRow({
      shift_id: "shift-2",
      driver_id: "driver-2",
      driver_name: "Eastern Driver",
      account_id: "account-2",
      account_name: "Eastern Account",
      wiw_location_id: "location-2",
      wiw_location_name: "Eastern Location",
      wiw_timezone: "America/New_York",
    }), evaluatedAt);

    expect(central.shift_start_local).toContain("9:00 AM");
    expect(eastern.shift_start_local).toContain("10:00 AM");
    const [group] = groupNoShowMonitorRows([central, eastern], evaluatedAt);
    expect(group.shift_start_utc).toBe("2026-08-24T14:00:00.000Z");
    expect(group.dispatch_start_time_et).toContain("10:00 AM");
    expect(group.distinct_local_start_times).toHaveLength(2);
    expect(group.timezones_represented).toEqual(["America/Chicago", "America/New_York"]);
    expect(group.assigned_driver_count).toBe(2);
  });

  it("does not fall back when the WIW location timezone is missing", () => {
    const result = row({ wiw_timezone: null });
    expect(result.wiw_timezone).toBeNull();
    expect(result.shift_start_local).toBeNull();
    expect(result.grace_period_end_local).toBeNull();
    expect(result.shift_start_et).toContain("10:00 AM");
  });

  it("refreshes current users, then the selected shifts and clock records", async () => {
    runEntitySync.mockImplementation(async (entity: string) => ({
      entity,
      fetched: 2,
      inserted: 1,
      updated: 1,
      errors: 0,
      errorMessages: [],
      syncedAt: "2026-08-24T14:03:00.000Z",
    }));

    const result = await refreshNoShowMonitorWiw({
      from: "2026-08-24T04:00:00.000Z",
      to: "2026-08-25T03:59:59.999Z",
    });

    expect(runEntitySync.mock.calls.map(([entity]) => entity)).toEqual(["users", "shifts", "times"]);
    expect(runEntitySync.mock.calls[0][2]).toEqual({
      start: "2026-08-24",
      end: "2026-08-25",
      includeDeletedUsers: false,
    });
    expect(result.window_start_date).toBe("2026-08-24");
    expect(result.window_end_date).toBe("2026-08-25");
  });

  it("stops the targeted refresh when WIW returns an entity error", async () => {
    runEntitySync.mockImplementation(async (entity: string) => ({
      entity,
      fetched: 0,
      inserted: 0,
      updated: 0,
      errors: entity === "shifts" ? 1 : 0,
      errorMessages: entity === "shifts" ? ["WIW unavailable"] : [],
      syncedAt: "2026-08-24T14:03:00.000Z",
    }));

    await expect(refreshNoShowMonitorWiw({
      from: "2026-08-24T04:00:00.000Z",
      to: "2026-08-25T03:59:59.999Z",
    })).rejects.toThrow("WIW shifts refresh failed");
    expect(runEntitySync.mock.calls.map(([entity]) => entity)).toEqual(["users", "shifts"]);
  });

  it("coalesces overlapping targeted refreshes into one WIW request sequence", async () => {
    let releaseUsers: (() => void) | undefined;
    runEntitySync.mockImplementation(async (entity: string) => {
      if (entity === "users") {
        await new Promise<void>((resolve) => { releaseUsers = resolve; });
      }
      return {
        entity,
        fetched: 0,
        inserted: 0,
        updated: 0,
        errors: 0,
        errorMessages: [],
        syncedAt: "2026-08-24T14:03:00.000Z",
      };
    });

    const first = refreshNoShowMonitorWiw({
      from: "2026-08-24T04:00:00.000Z",
      to: "2026-08-25T03:59:59.999Z",
    });
    const second = refreshNoShowMonitorWiw({
      from: "2026-08-24T04:00:00.000Z",
      to: "2026-08-25T03:59:59.999Z",
    });
    await vi.waitFor(() => expect(runEntitySync).toHaveBeenCalledTimes(1));
    releaseUsers?.();

    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    expect(runEntitySync.mock.calls.map(([entity]) => entity)).toEqual(["users", "shifts", "times"]);
  });
});