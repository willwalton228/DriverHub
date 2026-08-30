import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  sendBulkSms: vi.fn(),
  sendEmail: vi.fn(),
}));

vi.mock("../db", () => ({
  pool: { query: mocks.query },
  db: { insert: vi.fn() },
}));

vi.mock("./communicationsService", () => ({
  sendBulkSms: mocks.sendBulkSms,
}));

vi.mock("./microsoftGraphService", () => ({
  sendEmail: mocks.sendEmail,
}));

import {
  getWeekendReminderExpectedSendAt,
  isWeekendReminderDue,
  runWeekendMondayReminders,
} from "./weekendMondayReminderService";

type Delivery = {
  id: string;
  driverId: string;
  mondayDate: string;
  channel: "sms" | "email";
  status: "pending" | "sending" | "sent" | "failed" | "skipped";
  sentAt: Date | null;
  externalId: string | null;
  error: string | null;
};

const mondayShift = {
  driver_id: "driver-1",
  driver_name: "Test Driver",
  driver_classification: "Employee",
  driver_email: "test-driver@example.test",
  phone_normalized: "+15555550101",
  shift_id: "shift-1",
  assignment_id: null,
  schedule_id: "location-1",
  account_name: "Test Account One",
  start_time: new Date("2026-08-24T13:00:00.000Z"),
  end_time: new Date("2026-08-24T21:00:00.000Z"),
  source_start_time: null,
  source_end_time: null,
  scheduling_timezone: "America/New_York",
};

describe("Weekend Monday reminder driver-cycle idempotency", () => {
  let deliveries: Delivery[];
  let nextId: number;
  let shifts: typeof mondayShift[];
  let attempts: Array<{ channel: string; outcome: string; skipReason: string | null }>;

  beforeEach(() => {
    deliveries = [];
    attempts = [];
    nextId = 1;
    shifts = [mondayShift];
    mocks.sendBulkSms.mockReset();
    mocks.sendEmail.mockReset();
    mocks.sendBulkSms.mockResolvedValue({
      recipientResults: [{ status: "sent", externalMessageId: "sms-1", error: null }],
    });
    mocks.sendEmail.mockResolvedValue({ ok: true, error: null });

    mocks.query.mockImplementation(async (query: string, params: unknown[] = []) => {
      if (query.includes("SELECT DISTINCT COALESCE(NULLIF(l.timezone")) {
        return { rows: [{ scheduling_timezone: "America/New_York" }] };
      }
      if (query.includes("FROM wiw_shifts s")) {
        return { rows: shifts };
      }
      if (query.includes("INSERT INTO weekend_monday_reminder_runs")) {
        return { rows: [] };
      }
      if (query.includes("INSERT INTO weekend_monday_comms")) {
        return { rows: [{ id: "comm-1" }] };
      }
      if (query.includes("INSERT INTO weekend_monday_driver_deliveries")) {
        const [, driverId, mondayDate, channel] = params as [string, string, string, "sms" | "email"];
        if (!deliveries.some((delivery) => delivery.driverId === driverId && delivery.mondayDate === mondayDate && delivery.channel === channel)) {
          deliveries.push({
            id: `delivery-${nextId++}`,
            driverId,
            mondayDate,
            channel,
            status: "pending",
            sentAt: null,
            externalId: null,
            error: null,
          });
        }
        return { rows: [] };
      }
      if (query.includes("SET status = 'sending'")) {
        const [driverId, mondayDate, channel] = params as [string, string, "sms" | "email"];
        const delivery = deliveries.find((candidate) =>
          candidate.driverId === driverId
          && candidate.mondayDate === mondayDate
          && candidate.channel === channel
          && ["pending", "failed", "skipped"].includes(candidate.status),
        );
        if (!delivery) return { rows: [] };
        delivery.status = "sending";
        return { rows: [{ id: delivery.id }] };
      }
      if (query.includes("SELECT id, status") && query.includes("weekend_monday_driver_deliveries")) {
        const [driverId, mondayDate, channel] = params as [string, string, "sms" | "email"];
        const delivery = deliveries.find((candidate) =>
          candidate.driverId === driverId && candidate.mondayDate === mondayDate && candidate.channel === channel,
        );
        return { rows: delivery ? [{ id: delivery.id, status: delivery.status }] : [] };
      }
      if (query.includes("SET status = $1") && query.includes("weekend_monday_driver_deliveries")) {
        const [status, externalId, error, , id] = params as [Delivery["status"], string | null, string | null, string | null, string];
        const delivery = deliveries.find((candidate) => candidate.id === id);
        if (delivery) {
          delivery.status = status;
          delivery.sentAt = status === "sent" ? new Date() : null;
          delivery.externalId = externalId;
          delivery.error = error;
        }
        return { rows: [] };
      }
      if (query.includes("INSERT INTO weekend_monday_reminder_attempts")) {
        const [, , , , , channel, outcome, skipReason] = params as [string, string | null, string, string, string, string, string, string | null];
        attempts.push({ channel, outcome, skipReason });
        return { rows: [] };
      }
      if (query.includes("SELECT channel, status, sent_at")) {
        const [driverId, mondayDate] = params as [string, string];
        return {
          rows: deliveries
            .filter((delivery) => delivery.driverId === driverId && delivery.mondayDate === mondayDate)
            .map((delivery) => ({
              channel: delivery.channel,
              status: delivery.status,
              sent_at: delivery.sentAt,
              external_id: delivery.externalId,
              error: delivery.error,
              last_run_id: "run",
            })),
        };
      }
      return { rows: [] };
    });
  });

  it("consolidates two Monday shifts into one SMS and one email", async () => {
    shifts = [
      mondayShift,
      {
        ...mondayShift,
        shift_id: "shift-2",
        account_name: "Test Account Two",
        start_time: new Date("2026-08-24T17:00:00.000Z"),
        end_time: new Date("2026-08-24T21:00:00.000Z"),
      },
    ];

    await runWeekendMondayReminders("2026-08-24", "manual");

    expect(mocks.sendBulkSms).toHaveBeenCalledTimes(1);
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
    expect(mocks.sendBulkSms.mock.calls[0][0].message).toContain("Test Account One");
    expect(mocks.sendBulkSms.mock.calls[0][0].message).toContain("Test Account Two");
    expect(deliveries).toHaveLength(2);
    expect(new Set(deliveries.map((delivery) => delivery.mondayDate))).toEqual(new Set(["2026-08-24"]));
  });

  it("skips a repeated run after both channels succeed and records the audit reason", async () => {
    await runWeekendMondayReminders("2026-08-24", "manual");
    await runWeekendMondayReminders("2026-08-24", "manual");

    expect(mocks.sendBulkSms).toHaveBeenCalledTimes(1);
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
    expect(attempts.filter((attempt) => attempt.skipReason === "already_sent")).toHaveLength(2);
  });

  it("allows concurrent runs but sends each channel once", async () => {
    await Promise.all([
      runWeekendMondayReminders("2026-08-24", "manual"),
      runWeekendMondayReminders("2026-08-24", "manual"),
    ]);

    expect(mocks.sendBulkSms).toHaveBeenCalledTimes(1);
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
    expect(deliveries).toHaveLength(2);
  });

  it("retries only a failed email channel", async () => {
    mocks.sendEmail
      .mockResolvedValueOnce({ ok: false, error: "temporary email failure" })
      .mockResolvedValueOnce({ ok: true, error: null });

    await runWeekendMondayReminders("2026-08-24", "manual");
    await runWeekendMondayReminders("2026-08-24", "manual");

    expect(mocks.sendBulkSms).toHaveBeenCalledTimes(1);
    expect(mocks.sendEmail).toHaveBeenCalledTimes(2);
    expect(deliveries.find((delivery) => delivery.channel === "sms")?.status).toBe("sent");
    expect(deliveries.find((delivery) => delivery.channel === "email")?.status).toBe("sent");
  });

  it("retries only a failed SMS channel", async () => {
    mocks.sendBulkSms
      .mockResolvedValueOnce({
        recipientResults: [{ status: "failed", externalMessageId: null, error: "temporary SMS failure" }],
      })
      .mockResolvedValueOnce({
        recipientResults: [{ status: "sent", externalMessageId: "sms-2", error: null }],
      });

    await runWeekendMondayReminders("2026-08-24", "manual");
    await runWeekendMondayReminders("2026-08-24", "manual");

    expect(mocks.sendBulkSms).toHaveBeenCalledTimes(2);
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
    expect(deliveries.find((delivery) => delivery.channel === "sms")?.status).toBe("sent");
    expect(deliveries.find((delivery) => delivery.channel === "email")?.status).toBe("sent");
  });

  it("calculates Saturday 2 PM in each scheduling timezone with DST-aware IANA zones", () => {
    expect(getWeekendReminderExpectedSendAt("2026-08-24", "America/New_York").toISOString())
      .toBe("2026-08-22T18:00:00.000Z");
    expect(getWeekendReminderExpectedSendAt("2026-08-24", "America/Chicago").toISOString())
      .toBe("2026-08-22T19:00:00.000Z");
    expect(getWeekendReminderExpectedSendAt("2026-08-24", "America/Denver").toISOString())
      .toBe("2026-08-22T20:00:00.000Z");
    expect(getWeekendReminderExpectedSendAt("2026-08-24", "America/Los_Angeles").toISOString())
      .toBe("2026-08-22T21:00:00.000Z");

    const easternTwoPm = new Date("2026-08-22T18:00:00.000Z");
    expect(isWeekendReminderDue("America/New_York", easternTwoPm)).toBe(true);
    expect(isWeekendReminderDue("America/Chicago", easternTwoPm)).toBe(false);
    expect(isWeekendReminderDue("America/Los_Angeles", easternTwoPm)).toBe(false);
  });
});