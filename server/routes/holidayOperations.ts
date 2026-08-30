import { Router } from "express";
import { isAuthenticated } from "../replitAuth";
import { storage } from "../storage";
import { hasCorporateAccess } from "../services/payrollPermissions";
import {
  HOLIDAYS, acceptHolidayResponse, createSpecialHoliday, ensureHolidayOperations, getHolidayMetadata,
  getResponseToken, listAccountHolidayHistory, listHolidayOperations, sendHolidayConfirmation, updateHolidayStatus,
} from "../services/holidayOperationsService";
import { pool } from "../db";

const router = Router();
const actorId = (req: any) => req.session?.userId || req.user?.claims?.sub || null;
async function requireHolidayOperationsAccess(req: any, res: any, next: Function) {
  try {
    const userId = req.session?.userId || req.user?.claims?.sub;
    const claimsEmail = req.user?.claims?.email;
    let user = userId ? await storage.getUser(userId) : undefined;
    if (!user && claimsEmail) user = await storage.getUserByEmail(claimsEmail);
    if (!user) return res.status(401).json({ message: "Authentication required" });
    if (!hasCorporateAccess(user.role)) return res.status(403).json({ message: "Corporate access required" });
    req.currentUser = user;
    next();
  } catch (error) {
    console.error("[HolidayOperations] access check failed", error);
    res.status(401).json({ message: "Authentication required" });
  }
}
const yearParam = (value: unknown) => {
  const year = Number(value);
  if (!Number.isInteger(year) || year < 2020 || year > 2100) throw new Error("A valid holiday year is required");
  return year;
};

router.get("/metadata", isAuthenticated, requireHolidayOperationsAccess, async (req, res) => {
  try {
    res.json(await getHolidayMetadata(yearParam(req.query.year ?? new Date().getFullYear())));
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.post("/generate", isAuthenticated, requireHolidayOperationsAccess, async (req, res) => {
  try {
    const year = yearParam(req.body?.year ?? new Date().getFullYear());
    const holiday = req.body?.holiday;
    if (holiday && !HOLIDAYS.some((item) => item.code === holiday)) return res.status(400).json({ message: "Unsupported holiday" });
    await ensureHolidayOperations(year, holiday);
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.post("/special-dates", isAuthenticated, requireHolidayOperationsAccess, async (req: any, res) => {
  try {
    const year = yearParam(req.body?.year);
    const result = await createSpecialHoliday({
      name: req.body?.name,
      date: req.body?.date,
      year,
      appliesToAllAccounts: req.body?.appliesToAllAccounts !== false,
      accountIds: Array.isArray(req.body?.accountIds) ? req.body.accountIds : [],
      notes: req.body?.notes,
      createdByUserId: actorId(req),
    });
    res.status(201).json(result);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.get("/records", isAuthenticated, requireHolidayOperationsAccess, async (req, res) => {
  try {
    const result = await listHolidayOperations({
      year: yearParam(req.query.year ?? new Date().getFullYear()),
      holiday: typeof req.query.holiday === "string" ? req.query.holiday : undefined,
      network: typeof req.query.network === "string" ? req.query.network : undefined,
      accountId: typeof req.query.accountId === "string" ? req.query.accountId : undefined,
      status: typeof req.query.status === "string" ? req.query.status : undefined,
      confirmationStatus: typeof req.query.confirmationStatus === "string" ? req.query.confirmationStatus : undefined,
      communicationStatus: typeof req.query.communicationStatus === "string" ? req.query.communicationStatus : undefined,
      schedulingConflict: typeof req.query.schedulingConflict === "string" ? req.query.schedulingConflict : undefined,
      exception: typeof req.query.exception === "string" ? req.query.exception : undefined,
    });
    res.json(result);
  } catch (error: any) {
    console.error("[HolidayOperations] records failed", error);
    res.status(500).json({ message: error.message || "Failed to load Holiday Operations" });
  }
});

router.patch("/records/:id/status", isAuthenticated, requireHolidayOperationsAccess, async (req: any, res) => {
  try {
    const record = await updateHolidayStatus({
      operationId: req.params.id,
      status: req.body.status,
      openingTime: req.body.openingTime,
      closingTime: req.body.closingTime,
      notes: req.body.notes,
      source: req.body.source === "Other Authorized Source" ? "Other Authorized Source" : "DriverHub User",
      actorUserId: actorId(req),
    });
    res.json({ record });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.get("/records/:id/history", isAuthenticated, requireHolidayOperationsAccess, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT a.*, CONCAT_WS(' ', u.first_name, u.last_name) AS actor_name,
         CONCAT_WS(' ', c.first_name, c.last_name) AS contact_name
       FROM holiday_operations_audit a
       LEFT JOIN users u ON u.id = a.actor_user_id
       LEFT JOIN account_contacts c ON c.id = a.responding_contact_id
       WHERE a.holiday_operation_id = $1 ORDER BY a.created_at DESC`,
      [req.params.id],
    );
    res.json({ history: rows });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.post("/records/:id/send", isAuthenticated, requireHolidayOperationsAccess, async (req, res) => {
  try {
    const origin = `${req.protocol}://${req.get("host")}`;
    const outcome = await sendHolidayConfirmation(req.params.id, origin, req.body?.contactId ?? null);
    res.status(outcome.sent ? 200 : outcome.reason === "delivery_disabled" ? 409 : 422).json({
      ...outcome,
      ...(outcome.sent ? {} : {
        message: outcome.reason === "delivery_disabled"
          ? "Holiday Operations email delivery is not enabled."
          : outcome.reason === "missing_recipient"
            ? "No valid Account contact email is available."
            : "The confirmation request could not be delivered.",
      }),
    });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.get("/export", isAuthenticated, requireHolidayOperationsAccess, async (req, res) => {
  try {
    const result = await listHolidayOperations({
      year: yearParam(req.query.year ?? new Date().getFullYear()),
      holiday: typeof req.query.holiday === "string" ? req.query.holiday : undefined,
      network: typeof req.query.network === "string" ? req.query.network : undefined,
      accountId: typeof req.query.accountId === "string" ? req.query.accountId : undefined,
      status: typeof req.query.status === "string" ? req.query.status : undefined,
      confirmationStatus: typeof req.query.confirmationStatus === "string" ? req.query.confirmationStatus : undefined,
      communicationStatus: typeof req.query.communicationStatus === "string" ? req.query.communicationStatus : undefined,
      schedulingConflict: typeof req.query.schedulingConflict === "string" ? req.query.schedulingConflict : undefined,
      exception: typeof req.query.exception === "string" ? req.query.exception : undefined,
    });
    const esc = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const columns = ["Network", "Account", "Holiday", "Holiday Date", "Operating Status", "Operating Hours", "Confirmation Source", "Confirmed By", "Confirmed Date", "Communication Status", "Scheduled Drivers", "Scheduled Shifts", "Scheduling Conflict"];
    const csv = [
      columns.join(","),
      ...result.records.map((row: any) => [
        row.network, row.customer_name, row.holiday_name, row.holiday_date, row.operating_status,
        row.opening_time && row.closing_time ? `${row.opening_time}-${row.closing_time}` : "",
        row.confirmation_source, row.confirmed_by_user_name || row.confirmed_by_contact_name, row.confirmed_at, row.communication_status,
        row.scheduled_drivers, row.scheduled_shifts, row.exception_type,
      ].map(esc).join(",")),
    ].join("\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="holiday-operations-${req.query.year}.csv"`);
    res.send(csv);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/accounts/:accountId/history", isAuthenticated, requireHolidayOperationsAccess, async (req, res) => {
  try {
    res.json({ records: await listAccountHolidayHistory(req.params.accountId) });
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to load holiday history" });
  }
});

router.get("/response/:token", async (req, res) => {
  const record = await getResponseToken(req.params.token);
  if (!record) return res.status(404).json({ message: "This holiday response link is invalid or has expired." });
  res.json({
    accountName: record.customer_name, holidayName: record.holiday_name, holidayDate: record.holiday_date,
    contactName: record.contact_name, timezone: record.timezone,
  });
});

router.post("/response/:token", async (req, res) => {
  try {
    await acceptHolidayResponse(req.params.token, req.body);
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

export default router;