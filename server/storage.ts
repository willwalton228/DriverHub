// Based on javascript_database and javascript_log_in_with_replit blueprints
import {
  users,
  drivers,
  employees,
  customers,
  payRecords,
  payPeriods,
  trips,
  expenses,
  expenseApprovals,
  invoices,
  invoiceLineItems,
  invoiceStatusHistory,
  invoiceAuditLog,
  invoiceApprovalActions,
  billingEntities,
  billingLocations,
  billingEntityAuditLog,
  driverNotes,
  driverComments,
  driverDocuments,
  notifications,
  userInvitations,
  safetyIncidents,
  accidents,
  accidentAttachments,
  accidentCategoryMeta,
  workLocations,
  shiftTemplates,
  shifts,
  shiftAssignments,
  shiftSwapRequests,
  availabilityWindows,
  timeOffRequests,
  timeClockEvents,
  timesheets,
  laborRules,
  schedulingEntities,
  userSchedulingEntityAccess,
  unionCbaRuleSets,
  unionCbaViolations,
  schedulingClientConfigs,
  schedulingInsuranceReports,
  schedulingAiFeatureConfigs,
  schedulingAiDecisionLogs,
  schedulingSlaDefinitions,
  schedulingSlaEvents,
  crossLocationMobilityConfigs,
  crossLocationTravelLogs,
  schedulingJustifications,
  jobRequisitions,
  candidates,
  applications,
  interviews,
  interviewScorecards,
  offers,
  recruitingCommunications,
  applicationActivities,
  billableCharges,
  customerBillingProfiles,
  payments,
  paymentApplications,
  depositBatches,
  arLedgerEntries,
  creditMemos,
  creditMemoApplications,
  customerStatements,
  customerPaymentMetrics,
  paymentEvents,
  invoiceEmailLog,
  invoiceDeliveryHistory,
  invoiceActivities,
  reminderSchedules,
  integrationQueue,
  invoiceDisputes,
  socialPlatformConnections,
  socialPosts,
  socialPublishLogs,
  socialPostTemplates,
  hubspotFieldMappings,
  markets,
  zones,
  payrollExceptions,
  exportAuditLog,
  payPeriodAuditEvents,
  feedbackTickets,
  feedbackComments,
  feedbackAuditLog,
  moveSnapshots,
  driverSafetyFlags,
  customerNotificationPreferences,
  customerUsers,
  CUSTOMER_NOTIFICATION_EVENT_TYPES,
  type User,
  type UpsertUser,
  type Driver,
  type InsertDriver,
  type Employee,
  type InsertEmployee,
  type Customer,
  type InsertCustomer,
  type PayRecord,
  type InsertPayRecord,
  type Trip,
  type InsertTrip,
  type Expense,
  type InsertExpense,
  type ExpenseApproval,
  type InsertExpenseApproval,
  type Invoice,
  type InsertInvoice,
  type InvoiceLineItem,
  type InsertInvoiceLineItem,
  type BillingEntity,
  type InsertBillingEntity,
  type BillingLocation,
  type InsertBillingLocation,
  type BillingEntityAuditLog,
  type InsertBillingEntityAuditLog,
  type UserInvoicingPermission,
  type InsertUserInvoicingPermission,
  type MfaSsoSettings,
  type InsertMfaSsoSettings,
  type InvoicingActionAuditLog,
  type InsertInvoicingActionAuditLog,
  userInvoicingPermissions,
  mfaSsoSettings,
  invoicingActionAuditLog,
  type DriverNote,
  type InsertDriverNote,
  type DriverComment,
  type InsertDriverComment,
  type DriverDocument,
  type InsertDriverDocument,
  type Notification,
  type InsertNotification,
  type UserInvitation,
  type InsertUserInvitation,
  type DriverWithUser,
  type DriverNoteWithAuthor,
  type DriverCommentWithAuthor,
  type DriverDocumentWithUploader,
  type Accident,
  type InsertAccident,
  type AccidentAttachment,
  type InsertAccidentAttachment,
  type AccidentCategoryMeta,
  type MoveSnapshot,
  type InsertMoveSnapshot,
  type DriverSafetyFlag,
  type InsertDriverSafetyFlag,
  claimAuditLogs,
  type ClaimAuditLog,
  type InsertClaimAuditLog,
  moveIncidents,
  type MoveIncident,
  type InsertMoveIncident,
  claimEvents,
  type ClaimEvent,
  type InsertClaimEvent,
  type BillableCharge,
  type InsertBillableCharge,
  type CustomerBillingProfile,
  type InsertCustomerBillingProfile,
  type InsertInvoiceActivity,
  type InvoiceActivity,
  type InsertReminderSchedule,
  type ReminderSchedule,
  type Payment,
  type InsertPayment,
  type PaymentApplication,
  type InsertPaymentApplication,
  type DepositBatch,
  type InsertDepositBatch,
  depositBatchAuditLog,
  type DepositBatchAuditEntry,
  type ArLedgerEntry,
  type InsertArLedgerEntry,
  type CreditMemo,
  type InsertCreditMemo,
  type CreditMemoApplication,
  type InsertCreditMemoApplication,
  type CustomerPaymentMetrics,
  type InsertCustomerPaymentMetrics,
  type CustomerStatement,
  type InsertCustomerStatement,
  type PaymentEvent,
  type InsertPaymentEvent,
  type InvoiceEmailLog,
  type InsertInvoiceEmailLog,
  type IntegrationQueueItem,
  type InsertIntegrationQueue,
  type InvoiceDispute,
  type InsertInvoiceDispute,
  type AgingBucket,
  type SocialPlatformConnection,
  type InsertSocialPlatformConnection,
  type SocialPost,
  type InsertSocialPost,
  type SocialPublishLog,
  type InsertSocialPublishLog,
  type SocialPostTemplate,
  type InsertSocialPostTemplate,
  type HubspotFieldMapping,
  type InsertHubspotFieldMapping,
  type FeedbackTicket,
  type InsertFeedbackTicket,
  type FeedbackComment,
  type InsertFeedbackComment,
  type FeedbackAuditLogEntry,
  type CustomerNotificationPreference,
  type InsertCustomerNotificationPreference,
  type CustomerNotificationEventType,
  type CustomerUser,
  type InsertCustomerUser,
  type CustomerUserRole,
  moveMedia,
  type MoveMedia,
  type InsertMoveMedia,
  photoGateOverrides,
  type PhotoGateOverride,
  type InsertPhotoGateOverride,
  riskMitigationActions,
  type RiskMitigationAction,
  type InsertRiskMitigationAction,
  carrierNarratives,
  type CarrierNarrative,
  type InsertCarrierNarrative,
  accountDocuments,
  type AccountDocument,
  type InsertAccountDocument,
  standardDocuments,
  type StandardDocument,
  type InsertStandardDocument,
  documentPacketLogs,
  savedAccountViews,
  userViewPreferences,
  accountActivities,
  accountActivityEvents,
  playbooks,
  playbookExecutions,
  type DocumentPacketLog,
  type InsertDocumentPacketLog,
  type AccountActivity,
  type InsertAccountActivity,
  type AccountActivityEvent,
  type InsertAccountActivityEvent,
  type Playbook,
  type InsertPlaybook,
  type PlaybookExecution,
  type InsertPlaybookExecution,
  drugTestNotifications,
  type DrugTestNotification,
  type InsertDrugTestNotification,
  accountDecisions,
  type AccountDecision,
  type InsertAccountDecision,
  decisionAddendums,
  type DecisionAddendum,
  type InsertDecisionAddendum,
  healthCalculationLogs,
  type HealthCalculationLog,
  type InsertHealthCalculationLog,
  healthOverrides,
  type HealthOverride,
  type InsertHealthOverride,
  accountKnowledge,
  accountKnowledgeHistory,
  type AccountKnowledge,
  type InsertAccountKnowledge,
  type AccountKnowledgeHistory,
  type InsertAccountKnowledgeHistory,
  accountReadiness,
  type AccountReadiness,
  type InsertAccountReadiness,
  READINESS_ITEMS,
  quickbooksSettings,
  type InsertQuickbooksSettings,
  type QuickbooksSettings,
  collectionsNotes,
  collectionsCustomerFlags,
  type InsertCollectionsNote,
  type CollectionsNote,
  type InsertCollectionsCustomerFlag,
  type CollectionsCustomerFlag,
  invoiceSlaRules,
  invoiceSlaBreaches,
  invoiceConsolidationSources,
  type InsertInvoiceSlaRule,
  type InvoiceSlaRule,
  type InsertInvoiceSlaBreach,
  type InvoiceSlaBreach,
  type InvoiceConsolidationSource,
  invoiceSavedViews,
  type InsertInvoiceSavedView,
  type InvoiceSavedView,
  idempotencyKeys,
  type InsertIdempotencyKey,
  type IdempotencyKey,
  resilienceLog,
  type InsertResilienceLog,
  type ResilienceLog,
  paymentRetryConfig,
  paymentRetryAttempts,
  customerPaymentMethods,
  autopayAttempts,
  driverOverrunPatterns,
  otRiskForecasts,
  schedulingSchedules,
  schedulingShifts,
  schedulingAssignments,
  overtimeAlertThresholds,
  tieredOtAlertConfigs,
  otAlertLogs,
  breakRuleConfigs,
  breakRecords,
  breakAlertLogs,
  type DriverOverrunPattern,
  type InsertDriverOverrunPattern,
  type OtRiskForecast,
  type InsertOtRiskForecast,
  type TieredOtAlertConfig,
  type InsertTieredOtAlertConfig,
  type OtAlertLog,
  type InsertOtAlertLog,
  type BreakRuleConfig,
  type InsertBreakRuleConfig,
  type BreakRecord,
  type InsertBreakRecord,
  type BreakAlertLog,
  type InsertBreakAlertLog,
  rebalancingSuggestions,
  type RebalancingSuggestion,
  type InsertRebalancingSuggestion,
  timeEntries,
  userRecruitingMarkets,
  systemIntegrationUsers,
  recruitingPermissionAuditLog,
  type UserRecruitingMarket,
  type InsertUserRecruitingMarket,
  type SystemIntegrationUser,
  type InsertSystemIntegrationUser,
  type RecruitingPermissionAuditLog,
  lineItemCategoryMappings,
  type LineItemCategoryMapping,
  type InsertLineItemCategoryMapping,
  invoiceAttachments,
  type InvoiceAttachment,
  type InsertInvoiceAttachment,
  recruitingTasks,
  type RecruitingTask,
  type InsertRecruitingTask,
  recruitingHealthThresholds,
  type RecruitingHealthThreshold,
  type InsertRecruitingHealthThreshold,
  recruitingHealthSnapshots,
  type RecruitingHealthSnapshot,
  type InsertRecruitingHealthSnapshot,
  type InsertSchedulingSlaDefinition,
  type SchedulingSlaDefinition,
  type InsertSchedulingSlaEvent,
  type SchedulingSlaEvent,
  type InsertCrossLocationMobilityConfig,
  type CrossLocationMobilityConfig,
  type InsertCrossLocationTravelLog,
  type CrossLocationTravelLog,
  type InsertSchedulingJustification,
  type SchedulingJustification,
  accountNotes,
  type AccountNote,
  type InsertAccountNote,
  driverAccounts,
  amrDeclineNotifications,
  driverReturnEntries,
} from "@shared/schema";
import { normalizeMoveType } from "@shared/moveType";
import { enhanceDriverWithComputedFields, type DriverWithComputedFields } from "@shared/driverUtils";
import { encryptSsnOrEin, decryptSsnOrEin, extractLast4Digits, maskSsnOrEin } from "./driverEncryption";
import { db } from "./db";
import { eq, desc, asc, and, gte, lte, lt, gt, or, ilike, sql, isNull, isNotNull, inArray, aliasedTable } from "drizzle-orm";
import {
  prepareIdentityUpdate,
  writeIdentityAudits,
  type IdentityUpdateContext,
} from "./services/userIdentityIntegrityService";

function parseDurationToHours(duration: string): number {
  let totalHours = 0;
  const hoursMatch = duration.match(/(\d+(?:\.\d+)?)\s*h/i);
  const minsMatch = duration.match(/(\d+)\s*m/i);
  
  if (hoursMatch) {
    totalHours += parseFloat(hoursMatch[1]);
  }
  if (minsMatch) {
    totalHours += parseInt(minsMatch[1]) / 60;
  }
  
  if (!hoursMatch && !minsMatch) {
    const numericValue = parseFloat(duration);
    if (!isNaN(numericValue)) {
      totalHours = numericValue;
    }
  }
  
  return totalHours;
}

export type InvoiceSearchFilters = {
  billingEntityId?: string;
  locationId?: string;
  customerId?: string;
  status?: string;
  searchQuery?: string;
  statuses?: string[];
  amountMin?: number;
  amountMax?: number;
  dateField?: string;
  dateStart?: string;
  dateEnd?: string;
  agingBucket?: string;
  collectionsTier?: string;
  includeConsolidated?: boolean;
};

export interface IStorage {
  // User operations - Required for Replit Auth
  getUser(id: string): Promise<User | undefined>;

  getUserByEmail(email: string): Promise<User | undefined>;

  upsertUser(user: UpsertUser, context?: IdentityUpdateContext): Promise<User>;

  createUser(user: UpsertUser, context?: IdentityUpdateContext): Promise<User>; // Alias for upsertUser

  updateUserRole(id: string, role: string): Promise<User>;

  updateUser(id: string, updates: Partial<{
    profileImageUrl: string | null;
    heymarketMemberId: number | null;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
  }>, context?: IdentityUpdateContext): Promise<User | undefined>;

  // Driver operations - returns enhanced data with computed fields

  getDriver(id: string, includeSensitiveData?: boolean): Promise<DriverWithComputedFields | undefined>;

  getDriverByUserId(userId: string, includeSensitiveData?: boolean): Promise<DriverWithComputedFields | undefined>;

  getDriverIdByUserId(userId: string): Promise<string | undefined>;

  getDriverWithUser(id: string): Promise<DriverWithUser | undefined>;

  getAllDriversWithUsers(includeArchived?: boolean): Promise<DriverWithUser[]>;

  getAllDriversWithStats(includeArchived?: boolean): Promise<(DriverWithUser & { movesToday: number; hoursThisWeek: number })[]>;

  createDriver(driver: InsertDriver): Promise<DriverWithComputedFields>;

  updateDriver(id: string, driver: Partial<InsertDriver>): Promise<DriverWithComputedFields | undefined>;

  // Market operations (INCREMENT 25B)

  getMarket(marketId: string): Promise<typeof markets.$inferSelect | null>;

  getMarketByCode(code: string): Promise<typeof markets.$inferSelect | null>;

  getAllMarkets(): Promise<typeof markets.$inferSelect[]>;
  
  // Zone operations

  getZone(zoneId: string): Promise<typeof zones.$inferSelect | null>;

  // Employee operations

  getAllEmployees(): Promise<Employee[]>;

  getEmployee(id: string): Promise<Employee | undefined>;

  getEmployeeByUserId(userId: string): Promise<Employee | undefined>;

  getNextEmployeeId(): Promise<string>;

  createEmployee(employee: InsertEmployee): Promise<Employee>;

  updateEmployee(id: string, employee: Partial<InsertEmployee>): Promise<Employee | undefined>;

  // Customer operations

  getAllCustomers(): Promise<Customer[]>;

  getCustomer(id: string): Promise<Customer | undefined>;

  getCustomerByHubspotId(hubspotId: string): Promise<Customer | undefined>;

  createCustomer(customer: InsertCustomer): Promise<Customer>;

  updateCustomer(id: string, customer: Partial<InsertCustomer>): Promise<Customer | undefined>;

  deleteCustomer(id: string): Promise<void>;

  getCustomerPerformance(customerId: string): Promise<{
    movesLast12Months: { month: string; moves: number }[];
    movesVsPriorYear: { current: number; prior: number; change: number; changePercent: number };
    movesByType: { type: string; count: number }[];
    driversCount: number;
    driversByType: { type: string; count: number }[];
    grossProfit: number;
    avgMoveLength: number;
    accidents: number;
    customerTickets: number;
    openCustomerTickets: number;
    driverTickets: number;
    openDriverTickets: number;
    creditPaymentScore: number;

  }>;

  // Account Decisions

  getPayRecordsByDriverId(driverId: string): Promise<PayRecord[]>;

  createPayRecord(payRecord: InsertPayRecord): Promise<PayRecord>;

  getAllPayPeriods(): Promise<any[]>;

  createPayPeriod(data: { payGroup: string; periodType?: string; periodStart: string; periodEnd: string; status?: string; createdBy?: string }): Promise<any>;

  updatePayPeriod(id: number | string, data: Partial<{ status: string; lockedAt: Date; lockedBy: string; exportedAt: Date; exportType: string; exportStatus: string }>): Promise<any>;

  createExportAuditLog(data: { payPeriodId: string; exportType: 'ADP_CSV' | 'OPENFORCE_CSV'; fileName: string; fileHash: string; rowCount: number; totalAmountCents: number; createdBy?: string }): Promise<any>;

  getExportAuditLogsByPayPeriodId(payPeriodId: string): Promise<any[]>;
  
  // Pay Period Audit Events (append-only)

  createPayPeriodAuditEvent(data: { action: string; userId?: string; payPeriodId?: string; metadata?: Record<string, any> }): Promise<any>;

  getPayPeriodAuditEvents(limit?: number): Promise<any[]>;

  getPayPeriodAuditEventsByPayPeriodId(payPeriodId: string): Promise<any[]>;

  // Trip operations

  getTripsByDriverId(driverId: string): Promise<Trip[]>;

  getTripsByCustomerId(customerId: string): Promise<Trip[]>;

  getTripWithRelations(id: string): Promise<any | undefined>;

  getAllTrips(filters?: {
    moveNumber?: string;
    driver?: string;
    customer?: string;
    startDate?: string;
    endDate?: string;
    importBatchId?: string;
    status?: string;
    moveType?: string;
    sourceSystem?: string;

  }): Promise<any[]>;

  getTripsPage(filters: {
    moveNumber?: string;
    driver?: string;
    customer?: string;
    startDate?: string;
    endDate?: string;
    importBatchId?: string;
    status?: string;
    moveType?: string;
    sourceSystem?: string;
    limit?: number;
    offset?: number;
    sortBy?: string;
    sortDir?: string;

  }): Promise<{ trips: any[]; total: number }>;

  getTripsForExport(filters: {
    moveNumber?: string;
    driver?: string;
    customer?: string;
    startDate?: string;
    endDate?: string;
    importBatchId?: string;
    status?: string;
    moveType?: string;
    sourceSystem?: string;
    sortBy?: string;
    sortDir?: string;
    limit?: number;
  }): Promise<{ rows: any[]; truncated: boolean; totalMatched: number; cap: number }>;

  getTripsStats(): Promise<{
    totalToday: number;
    completedToday: number;
    activeNow: number;
    exceptions: number;
    thisWeek: number;
  }>;

  getTrip(id: string): Promise<Trip | undefined>;

  createTrip(trip: InsertTrip): Promise<Trip>;

  updateTrip(id: string, trip: Partial<InsertTrip>): Promise<Trip | undefined>;

  getTripsWithoutEligibility(): Promise<Trip[]>;

  // Move Saved Views (per-user filter presets)
  getMoveSavedViews(userId: string): Promise<any[]>;
  createMoveSavedView(view: any): Promise<any>;
  updateMoveSavedView(id: string, userId: string, updates: any): Promise<any | undefined>;
  deleteMoveSavedView(id: string, userId: string): Promise<void>;
  initializeDefaultMoveViewsForUser(userId: string): Promise<void>;
  setMoveDefaultView(viewId: string, userId: string): Promise<any | undefined>;
  unsetMoveDefaultView(userId: string): Promise<void>;

  // Move Team Presets (Task #87)
  getMoveTeamPresets(): Promise<any[]>;
  createMoveTeamPreset(preset: any): Promise<any>;
  updateMoveTeamPreset(id: string, ownerUserId: string, updates: any): Promise<any | undefined>;
  deleteMoveTeamPreset(id: string, ownerUserId: string): Promise<void>;

  // Move Export Schedules (Task #85)
  getMoveExportSchedules(userId: string): Promise<any[]>;
  createMoveExportSchedule(schedule: any): Promise<any>;
  updateMoveExportSchedule(id: string, userId: string, updates: any): Promise<any | undefined>;
  deleteMoveExportSchedule(id: string, userId: string): Promise<void>;
  getMoveExportRunLog(scheduleId: string, limit?: number): Promise<any[]>;
  appendMoveExportRunLog(entry: { scheduleId: string; status: string; rowCount?: number; truncated?: boolean; recipients?: string; errorMessage?: string }): Promise<any>;
  getAllEnabledMoveExportSchedules(): Promise<any[]>;

  // Policy Version operations

  getActivePolicyVersion(): Promise<PolicyVersion | undefined>;

  createPolicyVersion(data: InsertPolicyVersion): Promise<PolicyVersion>;

  deactivateAllPolicyVersions(): Promise<void>;

  getPolicyVersion(id: string): Promise<PolicyVersion | undefined>;

  // Expense operations

  createExpenses(expenses: InsertExpense[]): Promise<Expense[]>;

  createExpense(expense: InsertExpense): Promise<Expense>;

  getExpensesByDriverId(driverId: string): Promise<Expense[]>;

  getExpensesByEmployeeId(employeeId: string): Promise<Expense[]>;

  getExpensesByType(expenseType: 'driver' | 'employee'): Promise<Expense[]>;

  getExpensesBySubmitter(userId: string): Promise<Expense[]>;

  getDraftExpensesByUser(userId: string): Promise<Expense[]>;

  getAllExpenses(filters?: { expenseType?: 'driver' | 'employee'; status?: string; startDate?: string; endDate?: string }): Promise<Expense[]>;

  getExpense(id: string): Promise<Expense | undefined>;

  updateExpense(id: string, data: Partial<InsertExpense>): Promise<Expense | undefined>;

  updateExpenseStatus(id: string, status: string, approvedBy?: string): Promise<Expense | undefined>;

  deleteExpense(id: string): Promise<void>;
  
  // Expense approval workflow operations

  createExpenseApproval(approval: InsertExpenseApproval): Promise<ExpenseApproval>;

  getExpenseApprovalsByExpenseId(expenseId: string): Promise<ExpenseApproval[]>;

  getExpensesPendingApprovalByUser(userId: string): Promise<Expense[]>;

  approveExpense(expenseId: string, approvalId: string, userId: string, notes?: string): Promise<ExpenseApproval | undefined>;

  rejectExpense(expenseId: string, approvalId: string, userId: string, notes?: string): Promise<ExpenseApproval | undefined>;

  advanceExpenseToNextStage(expenseId: string): Promise<Expense | undefined>;

  getCOOEmployee(): Promise<Employee | undefined>;

  getWillWaltonEmployee(): Promise<Employee | undefined>;

  // AMR Decline Notifications (persistent executive alerts for Will Walton)

  createAmrDeclineNotification(data: {
    ticketId: string;
    amrNumber: string;
    amrTitle: string;
    submittedByName: string | null;
    declinedByUserId: string;
    declinedByName: string;
    declineComment: string | null;

  }): Promise<void>;

  getActiveAmrDeclineNotifications(): Promise<any[]>;

  clearAmrDeclineNotificationsForTicket(ticketId: string, clearedByName: string): Promise<void>;

  // Recruiting Approval Settings

  getRecruitingApprovalSettings(orgId: string): Promise<any>;

  upsertRecruitingApprovalSettings(orgId: string, data: any, changedBy: string, changedByName: string): Promise<any>;

  getRecruitingApprovalSettingsAudit(orgId: string, limit?: number): Promise<any[]>;

  getActiveRecruitingApprover(orgId: string): Promise<{ userId: string | null; name: string | null; isDelegate: boolean }>;

  // Billing Entity operations

  getAllBillingEntities(): Promise<BillingEntity[]>;

  getBillingEntity(id: string): Promise<BillingEntity | undefined>;

  getBillingEntityByCode(code: string): Promise<BillingEntity | undefined>;

  getDefaultBillingEntity(): Promise<BillingEntity | undefined>;

  createBillingEntity(entity: InsertBillingEntity): Promise<BillingEntity>;

  updateBillingEntity(id: string, updates: Partial<InsertBillingEntity>): Promise<BillingEntity | undefined>;

  deleteBillingEntity(id: string): Promise<void>;

  generateInvoiceNumberForEntity(entityId: string): Promise<string>;

  logBillingEntityAction(data: InsertBillingEntityAuditLog): Promise<void>;

  getBillingEntityAuditLog(entityId?: string): Promise<BillingEntityAuditLog[]>;
  
  // Invoicing Permissions operations

  getUserInvoicingPermissions(userId: string): Promise<UserInvoicingPermission[]>;

  grantInvoicingPermission(data: InsertUserInvoicingPermission): Promise<UserInvoicingPermission>;

  revokeInvoicingPermission(permissionId: string): Promise<void>;

  logInvoicingAction(data: InsertInvoicingActionAuditLog): Promise<void>;

  getInvoicingAuditLog(filters?: { userId?: string; action?: string; resourceType?: string; resourceId?: string; limit?: number }): Promise<InvoicingActionAuditLog[]>;

  getMfaSsoSettings(orgId?: string): Promise<MfaSsoSettings | undefined>;

  updateMfaSsoSettings(id: string, data: Partial<InsertMfaSsoSettings>): Promise<MfaSsoSettings | undefined>;
  
  // Billing Location operations

  getAllBillingLocations(entityId?: string): Promise<BillingLocation[]>;

  getBillingLocation(id: string): Promise<BillingLocation | undefined>;

  createBillingLocation(location: InsertBillingLocation): Promise<BillingLocation>;

  updateBillingLocation(id: string, updates: Partial<InsertBillingLocation>): Promise<BillingLocation | undefined>;

  deleteBillingLocation(id: string): Promise<void>;

  // Invoice operations

  createInvoice(invoice: InsertInvoice): Promise<Invoice>;

  getAllInvoices(filters?: InvoiceSearchFilters): Promise<Invoice[]>;

  getInvoice(id: string): Promise<Invoice | undefined>;

  updateInvoice(id: string, updates: Partial<InsertInvoice>): Promise<Invoice | undefined>;

  deleteInvoice(id: string): Promise<void>;

  // Invoice Saved Views

  getInvoiceSavedViews(userId: string): Promise<InvoiceSavedView[]>;

  getInvoiceSavedView(id: string): Promise<InvoiceSavedView | undefined>;

  createInvoiceSavedView(view: InsertInvoiceSavedView): Promise<InvoiceSavedView>;

  updateInvoiceSavedView(id: string, updates: Partial<InsertInvoiceSavedView>): Promise<InvoiceSavedView | undefined>;

  deleteInvoiceSavedView(id: string): Promise<void>;

  // Idempotency & Resilience operations

  getIdempotencyKey(scope: string, key: string): Promise<IdempotencyKey | undefined>;

  createIdempotencyKey(entry: InsertIdempotencyKey): Promise<IdempotencyKey>;

  finalizeIdempotencyKey(scope: string, key: string, responseStatus: number, responseBody: any, entityId?: string): Promise<IdempotencyKey | undefined>;

  cleanupExpiredIdempotencyKeys(): Promise<number>;

  logResilienceEvent(entry: InsertResilienceLog): Promise<ResilienceLog>;

  getResilienceLogs(filters?: { context?: string; entityType?: string; entityId?: string; status?: string }): Promise<ResilienceLog[]>;

  // Driver note operations

  getNotesByDriverId(driverId: string): Promise<DriverNoteWithAuthor[]>;

  createDriverNote(note: InsertDriverNote): Promise<DriverNote>;

  getDriverNote(id: string): Promise<DriverNote | undefined>;

  softDeleteDriverNote(id: string, userId: string, reason: string): Promise<void>;

  editDriverNote(id: string, userId: string, newText: string, reason: string): Promise<DriverNote | undefined>;

  // Driver comment operations

  getCommentsByDriverId(driverId: string): Promise<DriverCommentWithAuthor[]>;

  getComment(id: string): Promise<DriverComment | undefined>;

  createDriverComment(comment: InsertDriverComment): Promise<DriverComment>;

  softDeleteDriverComment(id: string, userId: string, reason: string): Promise<void>;

  deleteDriverComment(id: string): Promise<void>;

  // Driver document operations

  getDocumentsByDriverId(driverId: string): Promise<DriverDocumentWithUploader[]>;

  getDocument(id: string): Promise<DriverDocument | undefined>;

  createDocument(document: InsertDriverDocument): Promise<DriverDocument>;

  deleteDocument(id: string, userId?: string): Promise<void>;

  archiveDriver(driverId: string, userId: string, reason?: string): Promise<void>;

  restoreDriver(driverId: string, userId: string): Promise<void>;

  // Driver Resource operations

  getDriverResources(audience?: string): Promise<import('../shared/schema').DriverResource[]>;

  getAllDriverResources(): Promise<import('../shared/schema').DriverResource[]>;

  createDriverResource(data: import('../shared/schema').InsertDriverResource): Promise<import('../shared/schema').DriverResource>;

  updateDriverResource(id: string, data: Partial<import('../shared/schema').InsertDriverResource>): Promise<import('../shared/schema').DriverResource | undefined>;

  deactivateDriverResource(id: string): Promise<void>;

  // Notification operations

  getNotificationsByUserId(userId: string): Promise<Notification[]>;

  createNotification(notification: InsertNotification): Promise<Notification>;

  markNotificationAsRead(id: string, userId: string): Promise<boolean>;

  markAllNotificationsAsRead(userId: string): Promise<void>;

  // User invitation operations (admin/super_user only)

  getAllUsers(): Promise<User[]>;

  createUserInvitation(invitation: InsertUserInvitation): Promise<UserInvitation>;

  getInvitationByCode(code: string): Promise<UserInvitation | undefined>;

  getInvitationByEmail(email: string): Promise<UserInvitation | undefined>;

  getAllInvitations(): Promise<UserInvitation[]>;

  markInvitationAsUsed(id: string, userId: string): Promise<void>;

  deleteInvitation(id: string): Promise<void>;

  // Analytics operations

  getDriverStats(driverId: string): Promise<any>;

  getCorporateStats(): Promise<any>;

  // Accident operations

  getAllAccidents(): Promise<any[]>;

  getAccidentsByDriverId(driverId: string): Promise<any[]>;

  getAccidentById(id: string): Promise<any>;

  createAccident(accident: InsertAccident): Promise<Accident>;

  updateAccident(id: string, accident: Partial<InsertAccident>): Promise<Accident | undefined>;
  
  // Accident attachment operations

  getAttachmentsByAccidentId(accidentId: string): Promise<AccidentAttachment[]>;

  getAttachmentCountByAccidentId(accidentId: string): Promise<number>;

  createAccidentAttachment(attachment: InsertAccidentAttachment): Promise<AccidentAttachment>;

  getAccidentAttachmentById(id: string): Promise<AccidentAttachment | undefined>;

  updateAccidentAttachment(id: string, data: Partial<InsertAccidentAttachment>): Promise<AccidentAttachment>;

  deleteAccidentAttachment(id: string): Promise<void>;

  getCategoryMetaByAccidentId(accidentId: string): Promise<AccidentCategoryMeta[]>;

  upsertCategoryMeta(accidentId: string, category: string, data: { metadata?: any; notes?: string | null; updatedBy: string }): Promise<AccidentCategoryMeta>;
  
  // Accident insurance comments - atomic append

  addAccidentInsuranceComment(accidentId: string, comment: { id: string; text: string; createdAt: string; createdBy: string }): Promise<Accident | undefined>;
  
  // Accident incident comments - atomic append

  addAccidentIncidentComment(accidentId: string, comment: { id: string; text: string; createdAt: string; createdBy: string }): Promise<Accident | undefined>;

  // Move Snapshot operations (immutable snapshots for claims)

  createMoveSnapshot(snapshot: InsertMoveSnapshot): Promise<MoveSnapshot>;

  getMoveSnapshotById(id: string): Promise<MoveSnapshot | null>;

  getMoveSnapshotsByMoveId(moveId: string): Promise<MoveSnapshot[]>;

  getMoveSnapshotForClaim(accidentId: string): Promise<MoveSnapshot | null>;

  // Claim-Move Traceability

  getClaimsByMoveId(moveId: string): Promise<any[]>;

  getMoveByClaimId(claimId: string): Promise<Trip | null>;

  // Claim Audit Log operations (immutable)

  createClaimAuditLog(log: InsertClaimAuditLog): Promise<ClaimAuditLog>;

  getClaimAuditLogs(claimId: string): Promise<ClaimAuditLog[]>;

  // Move Incident operations (damage, accident, injury, etc.)

  createMoveIncident(incident: InsertMoveIncident): Promise<MoveIncident>;

  getMoveIncidentsByMoveId(moveId: string): Promise<MoveIncident[]>;

  getMoveIncidentById(id: string): Promise<MoveIncident | null>;

  linkIncidentToClaim(incidentId: string, accidentId: string): Promise<MoveIncident | null>;

  // Claim Event operations (audit trail for claim lifecycle)

  createClaimEvent(event: InsertClaimEvent): Promise<ClaimEvent>;

  getClaimEventsByClaimId(claimId: string): Promise<ClaimEvent[]>;

  transitionClaimStatus(claimId: string, toStatus: string, userId: string, userName: string, note?: string): Promise<{ accident: Accident; event: ClaimEvent } | null>;

  // Move Media (Photo Compliance) operations

  getMoveMediaByMoveId(moveId: string): Promise<MoveMedia[]>;

  getMoveMediaByStage(moveId: string, stage: string): Promise<MoveMedia[]>;

  createMoveMedia(media: InsertMoveMedia): Promise<MoveMedia>;

  deleteMoveMedia(id: string): Promise<void>;

  updateMovePhotoComplianceStatus(moveId: string): Promise<void>;
  
  // Photo Gate Override operations (audit trail)

  createPhotoGateOverride(override: InsertPhotoGateOverride): Promise<PhotoGateOverride>;

  getPhotoGateOverridesByMoveId(moveId: string): Promise<PhotoGateOverride[]>;

  // Driver Safety Flag operations

  getDriverSafetyFlags(driverId: string): Promise<DriverSafetyFlag[]>;

  getActiveDriverSafetyFlags(driverId: string): Promise<DriverSafetyFlag[]>;

  createDriverSafetyFlag(flag: InsertDriverSafetyFlag): Promise<DriverSafetyFlag>;

  resolveDriverSafetyFlag(flagId: string, userId: string, userName: string, note?: string): Promise<DriverSafetyFlag | null>;

  checkAndTriggerSafetyFlags(driverId: string): Promise<DriverSafetyFlag[]>;

  // Safety incident operations

  getSafetyIncidents(driverId: string): Promise<any[]>;

  // Customer Notification Preferences operations

  getCustomerNotificationPreferences(customerUserId: string): Promise<CustomerNotificationPreference[]>;

  initializeCustomerNotificationPreferences(customerUserId: string): Promise<CustomerNotificationPreference[]>;

  updateCustomerNotificationPreference(customerUserId: string, eventType: string, enabled: boolean): Promise<CustomerNotificationPreference | null>;

  isNotificationEnabled(customerUserId: string, eventType: CustomerNotificationEventType): Promise<boolean>;

  // Customer Users (Multi-user customer accounts) operations

  getCustomerUsersByCustomerId(customerId: string): Promise<CustomerUser[]>;

  getCustomerUserById(id: string): Promise<CustomerUser | null>;

  getCustomerUserByEmail(customerId: string, email: string): Promise<CustomerUser | null>;

  getCustomerUserByUserId(userId: string): Promise<CustomerUser | null>;

  createCustomerUser(data: InsertCustomerUser): Promise<CustomerUser>;

  updateCustomerUserRole(id: string, role: CustomerUserRole): Promise<CustomerUser | null>;

  updateCustomerUserStatus(id: string, status: string, userId?: string): Promise<CustomerUser | null>;

  deleteCustomerUser(id: string): Promise<void>;

  // ==========================================
  // SCHEDULING & TIME MANAGEMENT OPERATIONS
  // ==========================================
  
  // Scheduling Entity operations

  getAllSchedulingEntities(): Promise<any[]>;

  getSchedulingEntity(id: string): Promise<any>;

  createSchedulingEntity(entity: any): Promise<any>;

  updateSchedulingEntity(id: string, updates: any): Promise<any>;

  deleteSchedulingEntity(id: string): Promise<void>;

  getUserSchedulingEntityAccess(userId: string): Promise<any[]>;

  grantSchedulingEntityAccess(access: any): Promise<any>;

  revokeSchedulingEntityAccess(id: string): Promise<void>;

  // Union / CBA Rule Set operations

  getUnionCbaRuleSets(entityId?: string): Promise<any[]>;

  getUnionCbaRuleSet(id: string): Promise<any>;

  createUnionCbaRuleSet(ruleSet: any): Promise<any>;

  updateUnionCbaRuleSet(id: string, updates: any): Promise<any>;

  deleteUnionCbaRuleSet(id: string): Promise<void>;

  getUnionCbaViolations(scheduleId?: string, ruleSetId?: string): Promise<any[]>;

  createUnionCbaViolation(violation: any): Promise<any>;

  acknowledgeUnionCbaViolation(id: string, userId: string): Promise<any>;

  clearUnionCbaViolations(scheduleId: string): Promise<void>;

  // Scheduling Client Config operations (White-Label)

  getSchedulingClientConfig(entityId: string): Promise<any>;

  upsertSchedulingClientConfig(config: any): Promise<any>;

  // Insurance Report operations

  getSchedulingInsuranceReports(entityId?: string, periodType?: string): Promise<any[]>;

  getSchedulingInsuranceReport(id: string): Promise<any>;

  createSchedulingInsuranceReport(report: any): Promise<any>;

  // AI Governance operations

  getAiFeatureConfigs(entityId: string): Promise<any[]>;

  getAiFeatureConfig(id: string): Promise<any>;

  upsertAiFeatureConfig(config: any): Promise<any>;

  toggleAiFeature(id: string, isEnabled: boolean, disabledReason?: string, disabledBy?: string): Promise<any>;

  getAiDecisionLogs(entityId: string, featureKey?: string, limit?: number): Promise<any[]>;

  createAiDecisionLog(log: any): Promise<any>;

  reviewAiDecision(id: string, reviewedBy: string, status: string, notes?: string, actionTaken?: string): Promise<any>;

  // Work Location operations

  getAllWorkLocations(entityId?: string): Promise<any[]>;

  getWorkLocation(id: string): Promise<any>;

  createWorkLocation(location: any): Promise<any>;

  updateWorkLocation(id: string, updates: any): Promise<any>;

  deleteWorkLocation(id: string): Promise<void>;
  
  // Shift Template operations

  getAllShiftTemplates(entityId?: string): Promise<any[]>;

  getShiftTemplate(id: string): Promise<any>;

  createShiftTemplate(template: any): Promise<any>;

  updateShiftTemplate(id: string, updates: any): Promise<any>;

  deleteShiftTemplate(id: string): Promise<void>;
  
  // Shift operations

  getAllShifts(filters?: { startDate?: string; endDate?: string; locationId?: string; status?: string }): Promise<any[]>;

  getShift(id: string): Promise<any>;

  getShiftWithAssignments(id: string): Promise<any>;

  createShift(shift: any): Promise<any>;

  updateShift(id: string, updates: any): Promise<any>;

  deleteShift(id: string): Promise<void>;

  publishShifts(shiftIds: string[], publishedBy: string): Promise<void>;
  
  // Shift Assignment operations

  getShiftAssignments(shiftId: string): Promise<any[]>;

  getAssignmentsByUserId(userId: string, startDate?: string, endDate?: string): Promise<any[]>;

  createShiftAssignment(assignment: any): Promise<any>;

  updateShiftAssignment(id: string, updates: any): Promise<any>;

  deleteShiftAssignment(id: string): Promise<void>;
  
  // Shift Swap Request operations

  getShiftSwapRequests(filters?: { status?: string; userId?: string }): Promise<any[]>;

  createShiftSwapRequest(request: any): Promise<any>;

  updateShiftSwapRequest(id: string, updates: any): Promise<any>;
  
  // Availability Window operations

  getAvailabilityByUserId(userId: string): Promise<any[]>;

  createAvailabilityWindow(availability: any): Promise<any>;

  updateAvailabilityWindow(id: string, updates: any): Promise<any>;

  deleteAvailabilityWindow(id: string): Promise<void>;
  
  // Time-Off Request operations

  getAllTimeOffRequests(filters?: { status?: string; startDate?: string; endDate?: string }): Promise<any[]>;

  getTimeOffRequestsByUserId(userId: string): Promise<any[]>;

  getTimeOffRequest(id: string): Promise<any>;

  createTimeOffRequest(request: any): Promise<any>;

  updateTimeOffRequest(id: string, updates: any): Promise<any>;
  
  // Time Clock Event operations

  getTimeClockEvents(userId: string, startDate?: string, endDate?: string): Promise<any[]>;

  getLatestClockEvent(userId: string): Promise<any>;

  createTimeClockEvent(event: any): Promise<any>;

  updateTimeClockEvent(id: string, updates: any): Promise<any>;
  
  // Timesheet operations

  getAllTimesheets(filters?: { status?: string; periodStart?: string; periodEnd?: string }): Promise<any[]>;

  getTimesheetsByUserId(userId: string): Promise<any[]>;

  getTimesheet(id: string): Promise<any>;

  createTimesheet(timesheet: any): Promise<any>;

  updateTimesheet(id: string, updates: any): Promise<any>;
  
  // Labor Rule operations

  getAllLaborRules(entityId?: string): Promise<any[]>;

  getLaborRule(id: string): Promise<any>;

  createLaborRule(rule: any): Promise<any>;

  updateLaborRule(id: string, updates: any): Promise<any>;

  deleteLaborRule(id: string): Promise<void>;
  
  // OT Risk Forecasting operations

  getDriverOverrunPattern(driverId: string): Promise<any | null>;

  updateDriverOverrunPattern(driverId: string, completedShiftData: { scheduledMinutes: number; actualMinutes: number }): Promise<any>;

  calculateOTRiskForecast(driverId: string, scheduleId: string | null, weekStartDate: Date): Promise<any>;

  getOTRiskForecastsForSchedule(scheduleId: string): Promise<any[]>;

  getOTRiskForecastsForWeek(weekStartDate: Date): Promise<any[]>;

  getOTRiskSummary(scheduleId: string): Promise<{ low: number; medium: number; high: number; total: number }>;
  
  // Tiered OT Alerts & Escalation

  getTieredOtAlertConfigs(locationId?: string, accountId?: number): Promise<TieredOtAlertConfig[]>;

  getTieredOtAlertConfig(id: string): Promise<TieredOtAlertConfig | null>;

  createTieredOtAlertConfig(config: InsertTieredOtAlertConfig): Promise<TieredOtAlertConfig>;

  updateTieredOtAlertConfig(id: string, updates: Partial<InsertTieredOtAlertConfig>): Promise<TieredOtAlertConfig | null>;

  deleteTieredOtAlertConfig(id: string): Promise<void>;

  processOtAlerts(driverId: string, scheduleId: string | null, hoursWorked: number, weeklyOtThreshold: number): Promise<OtAlertLog[]>;

  getOtAlertLogs(filters?: { driverId?: string; scheduleId?: string; status?: string; limit?: number }): Promise<OtAlertLog[]>;

  acknowledgeOtAlert(id: string, userId: string): Promise<OtAlertLog | null>;
  
  // Break Intelligence & Compliance

  getBreakRuleConfigs(locationId?: string, accountId?: number): Promise<BreakRuleConfig[]>;

  getBreakRuleConfig(id: string): Promise<BreakRuleConfig | null>;

  createBreakRuleConfig(config: InsertBreakRuleConfig): Promise<BreakRuleConfig>;

  updateBreakRuleConfig(id: string, updates: Partial<InsertBreakRuleConfig>): Promise<BreakRuleConfig | null>;

  deleteBreakRuleConfig(id: string): Promise<void>;

  getBreakRecords(filters?: { driverId?: string; shiftId?: string; status?: string }): Promise<BreakRecord[]>;

  createBreakRecord(record: InsertBreakRecord): Promise<BreakRecord>;

  updateBreakRecord(id: string, updates: Partial<InsertBreakRecord>): Promise<BreakRecord | null>;

  processBreakAlerts(driverId: string, shiftId: string, hoursWorked: number): Promise<BreakAlertLog[]>;

  getBreakAlertLogs(filters?: { driverId?: string; status?: string; limit?: number }): Promise<BreakAlertLog[]>;

  acknowledgeBreakAlert(id: string, userId: string): Promise<BreakAlertLog | null>;
  
  // Rebalancing Suggestions

  getRebalancingSuggestions(filters?: { scheduleId?: string; status?: string; priority?: string; limit?: number }): Promise<RebalancingSuggestion[]>;

  getRebalancingSuggestion(id: string): Promise<RebalancingSuggestion | null>;

  createRebalancingSuggestion(suggestion: InsertRebalancingSuggestion): Promise<RebalancingSuggestion>;

  applyRebalancingSuggestion(id: string, userId: string): Promise<RebalancingSuggestion | null>;

  dismissRebalancingSuggestion(id: string, userId: string, reason?: string): Promise<RebalancingSuggestion | null>;

  generateRebalancingSuggestions(scheduleId: string): Promise<RebalancingSuggestion[]>;
  
  // Driver Weekly Summary

  getDriverWeeklySummary(driverId: string, weekStart?: Date): Promise<{
    weekStart: Date;
    weekEnd: Date;
    scheduledHours: number;
    actualHours: number;
    remainingBeforeOT: number;
    otThreshold: number;
    breakCompliance: { eligible: number; taken: number; overdue: number; status: 'compliant' | 'at_risk' | 'violation' };
    upcomingShifts: Array<{ id: string; date: string; startTime: string; endTime: string; location: string | null; hours: number }>;
  }>;

  getAllRequisitions(filters?: { status?: string; department?: string; recruiterId?: string }): Promise<any[]>;

  getRequisition(id: string): Promise<any>;

  getRequisitionWithStats(id: string): Promise<any>;

  createRequisition(requisition: any): Promise<any>;

  updateRequisition(id: string, updates: any): Promise<any>;

  deleteRequisition(id: string): Promise<void>;
  
  // Candidate operations

  getAllCandidates(filters?: { search?: string; source?: string; inTalentPool?: boolean }): Promise<any[]>;

  getCandidate(id: string): Promise<any>;

  getCandidateWithApplications(id: string): Promise<any>;

  createCandidate(candidate: any): Promise<any>;

  updateCandidate(id: string, updates: any): Promise<any>;

  deleteCandidate(id: string): Promise<void>;
  
  // Application operations

  getAllApplications(filters?: { requisitionId?: string; status?: string; stage?: string }): Promise<any[]>;

  getApplication(id: string): Promise<any>;

  getApplicationWithDetails(id: string): Promise<any>;

  getApplicationsByRequisitionId(requisitionId: string): Promise<any[]>;

  getApplicationsByCandidateId(candidateId: string): Promise<any[]>;

  createApplication(application: any): Promise<any>;

  updateApplication(id: string, updates: any): Promise<any>;

  updateApplicationStatus(id: string, status: string, rejectionReason?: string, rejectedBy?: string): Promise<any>;

  deleteApplication(id: string): Promise<void>;
  
  // Interview operations

  getAllInterviews(filters?: { applicationId?: string; status?: string; startDate?: string; endDate?: string }): Promise<any[]>;

  getInterview(id: string): Promise<any>;

  getInterviewsByApplicationId(applicationId: string): Promise<any[]>;

  createInterview(interview: any): Promise<any>;

  updateInterview(id: string, updates: any): Promise<any>;

  deleteInterview(id: string): Promise<void>;
  
  // Interview Scorecard operations

  getScorecardsByInterviewId(interviewId: string): Promise<any[]>;

  getScorecard(id: string): Promise<any>;

  createScorecard(scorecard: any): Promise<any>;

  updateScorecard(id: string, updates: any): Promise<any>;
  
  // Offer operations

  getAllOffers(filters?: { status?: string; applicationId?: string }): Promise<any[]>;

  getOffer(id: string): Promise<any>;

  getOfferByApplicationId(applicationId: string): Promise<any>;

  createOffer(offer: any): Promise<any>;

  updateOffer(id: string, updates: any): Promise<any>;

  deleteOffer(id: string): Promise<void>;
  
  // Recruiting Communication operations

  getCommunicationsByCandidateId(candidateId: string): Promise<any[]>;

  getCommunicationsByApplicationId(applicationId: string): Promise<any[]>;

  createCommunication(communication: any): Promise<any>;
  
  // Application Activity Log operations

  getActivitiesByApplicationId(applicationId: string): Promise<any[]>;

  createApplicationActivity(activity: any): Promise<any>;
  
  // Recruiting Analytics

  getRecruitingStats(): Promise<{
    openRequisitions: number;
    totalCandidates: number;
    activeApplications: number;
    pendingInterviews: number;
    pendingOffers: number;
    hiredThisMonth: number;
    avgTimeToHire: number;
    pipelineByStage: { stage: string; count: number }[];
    sourceEffectiveness: { source: string; count: number; hiredCount: number }[];
  }>;

  getAllBillableCharges(filters?: { 
    customerId?: string; 
    status?: string; 
    startDate?: string; 
    endDate?: string;
    sourceType?: string;

  }): Promise<BillableCharge[]>;

  getBillableCharge(id: string): Promise<BillableCharge | undefined>;

  getBillableChargesByCustomer(customerId: string): Promise<BillableCharge[]>;

  getBillableChargesForInvoicing(customerId: string): Promise<BillableCharge[]>;

  createBillableCharge(charge: InsertBillableCharge): Promise<BillableCharge>;

  createBillableCharges(charges: InsertBillableCharge[]): Promise<BillableCharge[]>;

  updateBillableCharge(id: string, updates: Partial<InsertBillableCharge>): Promise<BillableCharge | undefined>;

  approveBillableCharge(id: string, approvedBy: string, notes?: string): Promise<BillableCharge | undefined>;

  deleteBillableCharge(id: string): Promise<void>;
  
  // Generate charges from timesheets

  generateChargesFromTimesheets(customerId: string, periodStart: string, periodEnd: string, createdBy: string): Promise<BillableCharge[]>;
  
  // Customer Billing Profile operations

  getCustomerBillingProfile(customerId: string): Promise<CustomerBillingProfile | undefined>;

  createCustomerBillingProfile(profile: InsertCustomerBillingProfile): Promise<CustomerBillingProfile>;

  updateCustomerBillingProfile(customerId: string, updates: Partial<InsertCustomerBillingProfile>): Promise<CustomerBillingProfile | undefined>;
  
  // Invoice Activity Timeline

  getInvoiceActivities(invoiceId: string): Promise<InvoiceActivity[]>;

  createInvoiceActivity(data: InsertInvoiceActivity): Promise<InvoiceActivity>;
  
  // Reminder Schedules

  getReminderSchedules(): Promise<ReminderSchedule[]>;

  getReminderSchedule(id: string): Promise<ReminderSchedule | undefined>;

  createReminderSchedule(data: InsertReminderSchedule): Promise<ReminderSchedule>;

  updateReminderSchedule(id: string, updates: Partial<InsertReminderSchedule>): Promise<ReminderSchedule | undefined>;

  deleteReminderSchedule(id: string): Promise<boolean>;

  seedDefaultReminderSchedules(): Promise<void>;
  
  // Extended Invoice operations  

  getInvoiceWithLineItems(id: string): Promise<(Invoice & { lineItems: InvoiceLineItem[] }) | undefined>;

  getInvoicesByCustomer(customerId: string): Promise<Invoice[]>;

  getInvoicesForAging(): Promise<Invoice[]>;

  generateInvoiceNumber(): Promise<string>;

  generateDraftInvoiceNumber(): Promise<{ invoiceNumber: string; draftSequence: number }>;

  createInvoiceWithLineItems(invoice: InsertInvoice, lineItems: InsertInvoiceLineItem[]): Promise<Invoice & { lineItems: InvoiceLineItem[] }>;

  updateInvoiceStatus(id: string, status: string, updates?: Partial<InsertInvoice>, userId?: string): Promise<Invoice | undefined>;
  
  // Invoice Versioning & Revision operations

  createInvoiceRevision(invoiceId: string, userId: string, reason: string, revisionType: string): Promise<Invoice>;

  getInvoiceVersions(invoiceId: string): Promise<Invoice[]>;

  financeApproveRevision(invoiceId: string, userId: string, approved: boolean, notes?: string): Promise<Invoice | undefined>;

  // Invoice SLA Rules & Breaches

  getInvoiceSlaRules(): Promise<InvoiceSlaRule[]>;

  createInvoiceSlaRule(data: InsertInvoiceSlaRule): Promise<InvoiceSlaRule>;

  updateInvoiceSlaRule(id: string, data: Partial<InsertInvoiceSlaRule>): Promise<InvoiceSlaRule | undefined>;

  deleteInvoiceSlaRule(id: string): Promise<boolean>;

  evaluateInvoiceSlaBreaches(): Promise<{ created: number; cleared: number }>;

  getInvoiceSlaBreaches(filters?: { invoiceId?: string; status?: string }): Promise<InvoiceSlaBreach[]>;

  acknowledgeInvoiceSlaBreach(id: string, userId: string): Promise<InvoiceSlaBreach | undefined>;

  assignInvoiceToCollections(invoiceId: string, ownerId: string, userId: string): Promise<Invoice | undefined>;

  // Invoice Consolidation operations

  consolidateCharges(customerId: string, chargeIds: string[], invoiceData: Partial<InsertInvoice>, userId: string): Promise<Invoice & { lineItems: InvoiceLineItem[] }>;

  consolidateDraftInvoices(invoiceIds: string[], invoiceData: Partial<InsertInvoice>, userId: string): Promise<Invoice & { lineItems: InvoiceLineItem[] }>;

  getConsolidationDetail(invoiceId: string): Promise<{ sources: any[]; totalAmount: string } | undefined>;

  // Invoice Dispute operations

  markInvoiceAsDisputed(id: string, data: { reasonCategory: string; notes?: string; createdBy: string }): Promise<Invoice | undefined>;

  resolveInvoiceDispute(id: string, resolvedBy: string, resolution: string, resolvedAmount?: string): Promise<InvoiceDispute | undefined>;
  
  // QuickBooks Integration

  voidInvoice(id: string, voidedBy: string, reason: string): Promise<Invoice | undefined>;

  writeOffInvoice(id: string, amount: string, reason: string, notes: string, performedBy: string): Promise<Invoice | undefined>;

  sendInvoice(id: string, sentBy: string, toEmails: string[], ccEmails?: string[]): Promise<Invoice | undefined>;

  getInvoiceStatusHistory(invoiceId: string): Promise<any[]>;

  getInvoiceAuditLog(invoiceId: string): Promise<any[]>;

  logInvoiceAction(invoiceId: string, action: string, performedBy?: string, previousValues?: any, newValues?: any, notes?: string): Promise<void>;
  
  // Invoice Approval Workflow operations

  submitInvoiceForApproval(id: string, submittedBy: string): Promise<Invoice | undefined>;

  approveInvoice(id: string, approvedBy: string): Promise<Invoice | undefined>;

  rejectInvoice(id: string, rejectedBy: string, reason: string, comment: string): Promise<Invoice | undefined>;

  returnInvoiceToDraft(id: string, performedBy: string): Promise<Invoice | undefined>;

  getInvoiceApprovalHistory(invoiceId: string): Promise<any[]>;

  getInvoicesPendingApproval(): Promise<Invoice[]>;
  
  // Invoice Line Item operations

  getInvoiceLineItems(invoiceId: string): Promise<InvoiceLineItem[]>;

  getInvoiceLineItem(id: string): Promise<InvoiceLineItem | undefined>;

  createInvoiceLineItem(lineItem: InsertInvoiceLineItem): Promise<InvoiceLineItem>;

  updateInvoiceLineItem(id: string, updates: Partial<InsertInvoiceLineItem>): Promise<InvoiceLineItem | undefined>;

  deleteInvoiceLineItem(id: string): Promise<void>;
  
  // Line Item Category Mappings

  getLineItemCategoryMappings(billingEntityId?: string): Promise<LineItemCategoryMapping[]>;

  getLineItemCategoryMapping(id: string): Promise<LineItemCategoryMapping | undefined>;

  createLineItemCategoryMapping(mapping: InsertLineItemCategoryMapping): Promise<LineItemCategoryMapping>;

  updateLineItemCategoryMapping(id: string, updates: Partial<InsertLineItemCategoryMapping>): Promise<LineItemCategoryMapping | undefined>;

  deleteLineItemCategoryMapping(id: string): Promise<void>;
  
  // Invoice Attachments

  getInvoiceAttachments(invoiceId: string): Promise<InvoiceAttachment[]>;

  getInvoiceAttachment(id: string): Promise<InvoiceAttachment | undefined>;

  getCustomerVisibleAttachments(invoiceId: string): Promise<InvoiceAttachment[]>;

  createInvoiceAttachment(attachment: InsertInvoiceAttachment): Promise<InvoiceAttachment>;

  deleteInvoiceAttachment(id: string): Promise<void>;
  
  // Payment operations

  getAllPayments(filters?: { 
    customerId?: string; 
    status?: string; 
    paymentMethod?: string;
    startDate?: string; 
    endDate?: string 

  }): Promise<Payment[]>;

  getPayment(id: string): Promise<Payment | undefined>;

  getPaymentByStripeId(stripePaymentIntentId: string): Promise<Payment | undefined>;

  getPaymentsByCustomer(customerId: string): Promise<Payment[]>;

  generatePaymentNumber(): Promise<string>;

  createPayment(payment: InsertPayment): Promise<Payment>;

  updatePayment(id: string, updates: Partial<InsertPayment>): Promise<Payment | undefined>;

  updatePaymentStatus(id: string, status: string, processorDetails?: any): Promise<Payment | undefined>;
  
  // Payment Application operations

  getPaymentApplications(paymentId: string): Promise<PaymentApplication[]>;

  getPaymentApplicationsByInvoice(invoiceId: string): Promise<PaymentApplication[]>;

  applyPaymentToInvoice(paymentId: string, invoiceId: string, amount: string, appliedBy: string): Promise<PaymentApplication>;

  createManualPayment(payment: InsertPayment & { allocations?: Array<{ invoiceId: string; amount: string }> }, enteredBy: string): Promise<Payment>;

  unapplyPayment(applicationId: string): Promise<void>;
  
  // Deposit Batch operations

  getAllDepositBatches(filters?: { status?: string; startDate?: string; endDate?: string }): Promise<DepositBatch[]>;

  getDepositBatch(id: string): Promise<DepositBatch | undefined>;

  getDepositBatchWithPayments(id: string): Promise<(DepositBatch & { payments: Payment[] }) | undefined>;

  generateBatchNumber(): Promise<string>;

  createDepositBatch(batch: InsertDepositBatch): Promise<DepositBatch>;

  updateDepositBatch(id: string, updates: Partial<InsertDepositBatch>): Promise<DepositBatch | undefined>;

  addPaymentToDepositBatch(batchId: string, paymentId: string): Promise<{ reverted: boolean }>;

  removePaymentFromDepositBatch(paymentId: string): Promise<{ reverted: boolean; batchId?: string }>;

  closeDepositBatch(id: string, closedBy: string): Promise<DepositBatch | undefined>;

  reconcileDepositBatch(id: string, reconciledBy: string, actualAmount: string, notes?: string): Promise<DepositBatch | undefined>;

  logDepositBatchAudit(batchId: string, action: string, fromStatus: string | null, toStatus: string | null, performedBy: string, performedByName: string, metadata?: any): Promise<DepositBatchAuditEntry>;

  getDepositBatchAuditLog(batchId: string): Promise<DepositBatchAuditEntry[]>;

  deleteDepositBatch(id: string): Promise<void>;
  
  // A/R Ledger operations

  getArLedgerByCustomer(customerId: string): Promise<ArLedgerEntry[]>;

  createArLedgerEntry(entry: InsertArLedgerEntry): Promise<ArLedgerEntry>;

  getCustomerBalance(customerId: string): Promise<string>;

  getCustomerArSummary(customerId: string): Promise<{
    totalOutstanding: string;
    currentBalance: string;
    overdue30: string;
    overdue60: string;
    overdue90Plus: string;
  }>;

  getAgingReport(): Promise<AgingBucket[]>;

  getAgingReportByCustomer(customerId: string): Promise<AgingBucket>;
  
  // Credit Memo operations

  getAllCreditMemos(filters?: { customerId?: string; status?: string }): Promise<CreditMemo[]>;

  getCreditMemo(id: string): Promise<CreditMemo | undefined>;

  getCreditMemosByCustomer(customerId: string): Promise<CreditMemo[]>;

  generateCreditMemoNumber(): Promise<string>;

  createCreditMemo(creditMemo: InsertCreditMemo): Promise<CreditMemo>;

  updateCreditMemo(id: string, updates: Partial<InsertCreditMemo>): Promise<CreditMemo | undefined>;

  applyCreditMemoToInvoice(creditMemoId: string, invoiceId: string, amount: string, appliedBy: string): Promise<CreditMemoApplication>;
  
  // Payment Event operations (for AI timeliness signals)

  createPaymentEvent(event: InsertPaymentEvent): Promise<PaymentEvent>;

  getPaymentEventsByCustomer(customerId: string, startDate?: Date, endDate?: Date): Promise<PaymentEvent[]>;

  getPaymentEventsByInvoice(invoiceId: string): Promise<PaymentEvent[]>;
  
  // Customer Payment Metrics operations

  getCustomerPaymentMetrics(customerId: string): Promise<CustomerPaymentMetrics | undefined>;

  upsertCustomerPaymentMetrics(customerId: string, metrics: Partial<InsertCustomerPaymentMetrics>): Promise<CustomerPaymentMetrics>;

  calculateAndUpdateCustomerPaymentMetrics(customerId: string): Promise<CustomerPaymentMetrics>;
  
  // AI Scoring v1 - Payment Timeliness & Collections Risk

  calculatePaymentTimelinessScore(customerId: string): Promise<{
    score: number;
    tier: 'healthy' | 'watchlist' | 'at_risk' | 'collections_candidate';
    explanation: string[];
    hasEnoughData: boolean;
  }>;

  updateCustomerAIScore(customerId: string): Promise<Customer | undefined>;

  getCustomersWithAIScores(filters?: { tier?: string; minScore?: number; maxScore?: number }): Promise<Customer[]>;
  
  // Customer Statement operations

  getCustomerStatements(customerId: string): Promise<CustomerStatement[]>;

  getCustomerStatement(id: string): Promise<CustomerStatement | undefined>;

  generateStatementNumber(): Promise<string>;

  generateCustomerStatement(customerId: string, periodStartDate: Date, periodEndDate: Date, createdBy: string): Promise<CustomerStatement>;
  
  // Invoice Email Log operations

  getInvoiceEmailLog(invoiceId: string): Promise<InvoiceEmailLog[]>;

  createInvoiceEmailLogEntry(entry: InsertInvoiceEmailLog): Promise<InvoiceEmailLog>;

  updateInvoiceEmailLogStatus(id: string, status: string, details?: any): Promise<InvoiceEmailLog | undefined>;
  
  // Invoice Delivery History operations

  getInvoiceDeliveryHistory(invoiceId: string): Promise<any[]>;

  createInvoiceDeliveryEvent(event: { invoiceId: string; eventType: string; recipientEmail?: string; sentBy?: string; ipAddress?: string; userAgent?: string; metadata?: any }): Promise<any>;

  markInvoiceViewed(invoiceId: string, ipAddress?: string, userAgent?: string): Promise<any>;
  
  // Integration Queue operations

  getIntegrationQueue(filters?: { integrationType?: string; status?: string; entityType?: string }): Promise<IntegrationQueueItem[]>;

  getIntegrationQueueItem(id: string): Promise<IntegrationQueueItem | undefined>;

  createIntegrationQueueItem(item: InsertIntegrationQueue): Promise<IntegrationQueueItem>;

  updateIntegrationQueueItem(id: string, updates: Partial<InsertIntegrationQueue>): Promise<IntegrationQueueItem | undefined>;

  processIntegrationQueueItem(id: string, status: string, response?: any, error?: string): Promise<IntegrationQueueItem | undefined>;

  retryIntegrationQueueItem(id: string): Promise<IntegrationQueueItem | undefined>;
  
  // Invoice Dispute operations

  getInvoiceDisputes(filters?: { invoiceId?: string; status?: string }): Promise<InvoiceDispute[]>;

  getInvoiceDispute(id: string): Promise<InvoiceDispute | undefined>;

  createInvoiceDispute(dispute: InsertInvoiceDispute): Promise<InvoiceDispute>;

  updateInvoiceDispute(id: string, updates: Partial<InsertInvoiceDispute>): Promise<InvoiceDispute | undefined>;

  getQuickbooksSettings(): Promise<QuickbooksSettings | undefined>;

  upsertQuickbooksSettings(settings: Partial<InsertQuickbooksSettings> & { updatedBy?: string }): Promise<QuickbooksSettings>;

  updateQuickbooksSyncStatus(entityType: 'invoice' | 'payment' | 'credit_memo' | 'deposit', entityId: string, status: string, error?: string, externalId?: string): Promise<void>;

  queueQuickbooksSync(entityType: string, entityId: string, operationType: string, queuedBy?: string): Promise<void>;

  getQuickbooksSyncQueue(status?: string): Promise<any[]>;

  // Payment Retry Configuration

  getPaymentRetryConfig(orgId?: string): Promise<any[]>;

  getPaymentRetryConfigByMethod(paymentMethod: string, orgId?: string): Promise<any | undefined>;

  createPaymentRetryConfig(config: any): Promise<any>;

  updatePaymentRetryConfig(id: string, updates: any): Promise<any | undefined>;

  deletePaymentRetryConfig(id: string): Promise<void>;

  // Payment Retry Attempts

  getPaymentRetryAttempts(paymentId: string): Promise<any[]>;

  getScheduledRetryAttempts(beforeDate?: Date): Promise<any[]>;

  createPaymentRetryAttempt(attempt: any): Promise<any>;

  updatePaymentRetryAttempt(id: string, updates: any): Promise<any | undefined>;

  schedulePaymentRetry(paymentId: string, retryAt: Date, attemptNumber: number): Promise<any>;

  processPaymentRetry(attemptId: string, status: string, processorResponse?: string, failureCode?: string, failureMessage?: string): Promise<any | undefined>;

  cancelPendingRetries(paymentId: string): Promise<number>;

  // Customer Payment Methods (vault tokens)

  getCustomerPaymentMethods(customerId: string): Promise<any[]>;

  getCustomerPaymentMethod(id: string): Promise<any | undefined>;

  createCustomerPaymentMethod(method: any): Promise<any>;

  updateCustomerPaymentMethod(id: string, updates: any): Promise<any | undefined>;

  deleteCustomerPaymentMethod(id: string): Promise<void>;

  setDefaultPaymentMethod(customerId: string, paymentMethodId: string): Promise<void>;

  // Autopay Management

  getAutopayEligibleInvoices(trigger: 'on_send' | 'on_due_date'): Promise<any[]>;

  createAutopayAttempt(attempt: any): Promise<any>;

  updateAutopayAttempt(id: string, updates: any): Promise<any | undefined>;

  getAutopayAttemptsByInvoice(invoiceId: string): Promise<any[]>;

  getAutopayAttemptsByCustomer(customerId: string): Promise<any[]>;

  processAutopay(invoiceId: string, paymentMethodId: string, trigger: string): Promise<any>;

  disableCustomerAutopay(customerId: string, disabledBy: string, reason?: string): Promise<void>;

  // Late Fee Management

  getInvoicesEligibleForLateFee(): Promise<Invoice[]>;

  applyLateFeeToInvoice(invoiceId: string, appliedBy: string): Promise<{ invoice: Invoice; lineItem: InvoiceLineItem } | null>;

  reverseLateFee(invoiceId: string, reversedBy: string, reason: string): Promise<Invoice | null>;

  getLateFeeLineItem(invoiceId: string): Promise<InvoiceLineItem | undefined>;

  // Collections Workbench

  getCollectionsQueue(filters?: {
    overdueBucket?: string;
    customerId?: string;
    minBalance?: number;
    maxBalance?: number;
    isDisputed?: boolean;
    assignedToUserId?: string;
    lastReminderBefore?: string;
    lastReminderAfter?: string;
    riskTier?: string;
  }): Promise<any[]>;

  getCollectionsCustomerRollup(customerId: string): Promise<any>;

  getCollectionsNotesByCustomer(customerId: string): Promise<CollectionsNote[]>;

  getCollectionsNotesByInvoice(invoiceId: string): Promise<CollectionsNote[]>;

  createCollectionsNote(note: InsertCollectionsNote): Promise<CollectionsNote>;

  updateCollectionsNote(id: string, updates: Partial<InsertCollectionsNote>): Promise<CollectionsNote | undefined>;

  getCollectionsCustomerFlags(customerId: string): Promise<CollectionsCustomerFlag | undefined>;

  upsertCollectionsCustomerFlags(flags: Partial<InsertCollectionsCustomerFlag> & { customerId: string }): Promise<CollectionsCustomerFlag>;

  calculateNextBestAction(customerId: string): Promise<{ action: string; reason: string; priority: string }>;

  // Invoicing Analytics

  getInvoicingStats(): Promise<{
    totalOutstanding: string;
    overdueAmount: string;
    pendingCharges: string;
    pendingChargesCount: number;
    invoicesSentThisMonth: number;
    paymentsReceivedThisMonth: string;
    averageDaysToPayment: number;
    agingSummary: {
      current: string;
      days1to30: string;
      days31to60: string;
      days61to90: string;
      over90: string;
    };
  }>;

  getDsoTrend(filters?: { startDate?: string; endDate?: string; customerId?: string }): Promise<{
    month: string;
    dso: number;
    totalAr: string;
    avgDailySales: string;

  }[]>;

  getOverdueExposure(filters?: { startDate?: string; endDate?: string; customerId?: string }): Promise<{
    bucket: string;
    bucketLabel: string;
    count: number;
    amount: string;
    percentage: number;
  }[]>;

  getTopOverdueCustomers(filters?: { startDate?: string; endDate?: string; customerId?: string; limit?: number }): Promise<{
    customerId: string;
    customerName: string;
    overdueAmount: string;
    overdueInvoiceCount: number;
    oldestInvoiceDays: number;
    oldestInvoiceDate: string;
  }[]>;

  getReminderEffectiveness(filters?: { startDate?: string; endDate?: string; customerId?: string }): Promise<{
    totalRemindersSent: number;
    paidWithin7Days: number;
    paidWithin7DaysPercent: number;
    avgDaysToPayment: number;
    byReminderType: {
      reminderType: string;
      count: number;
      paidWithin7Days: number;
      paidWithin7DaysPercent: number;
      avgDaysToPayment: number;
    }[];
  }>;

  getAllSocialConnections(): Promise<SocialPlatformConnection[]>;

  getSocialConnection(id: string): Promise<SocialPlatformConnection | undefined>;

  getSocialConnectionByPlatform(platform: string): Promise<SocialPlatformConnection | undefined>;

  getActiveSocialConnections(): Promise<SocialPlatformConnection[]>;

  createSocialConnection(connection: InsertSocialPlatformConnection): Promise<SocialPlatformConnection>;

  updateSocialConnection(id: string, updates: Partial<InsertSocialPlatformConnection>): Promise<SocialPlatformConnection | undefined>;

  deleteSocialConnection(id: string): Promise<void>;

  // Social Post operations

  getAllSocialPosts(filters?: { status?: string; postType?: string; platform?: string }): Promise<SocialPost[]>;

  getSocialPost(id: string): Promise<SocialPost | undefined>;

  getSocialPostWithLogs(id: string): Promise<(SocialPost & { publishLogs: SocialPublishLog[] }) | undefined>;

  getScheduledSocialPosts(): Promise<SocialPost[]>;

  getDraftSocialPosts(): Promise<SocialPost[]>;

  createSocialPost(post: InsertSocialPost): Promise<SocialPost>;

  updateSocialPost(id: string, updates: Partial<InsertSocialPost>): Promise<SocialPost | undefined>;

  deleteSocialPost(id: string): Promise<void>;

  // Social Publish Log operations

  getSocialPublishLogs(postId: string): Promise<SocialPublishLog[]>;

  createSocialPublishLog(log: InsertSocialPublishLog): Promise<SocialPublishLog>;

  updateSocialPublishLog(id: string, updates: Partial<InsertSocialPublishLog>): Promise<SocialPublishLog | undefined>;

  // Social Post Template operations

  getAllSocialTemplates(): Promise<SocialPostTemplate[]>;

  getSocialTemplate(id: string): Promise<SocialPostTemplate | undefined>;

  getSocialTemplatesByType(templateType: string): Promise<SocialPostTemplate[]>;

  createSocialTemplate(template: InsertSocialPostTemplate): Promise<SocialPostTemplate>;

  updateSocialTemplate(id: string, updates: Partial<InsertSocialPostTemplate>): Promise<SocialPostTemplate | undefined>;

  deleteSocialTemplate(id: string): Promise<void>;

  // Social Media Stats

  getSocialMediaStats(): Promise<{
    totalPosts: number;
    scheduledPosts: number;
    publishedPosts: number;
    draftPosts: number;
    connectedPlatforms: number;
    postsThisMonth: number;
    postsByPlatform: { platform: string; count: number }[];
  }>;

  getAllHubspotFieldMappings(): Promise<HubspotFieldMapping[]>;

  getHubspotFieldMapping(id: string): Promise<HubspotFieldMapping | undefined>;

  getHubspotFieldMappingByDriverHubField(driverHubField: string): Promise<HubspotFieldMapping | undefined>;

  createHubspotFieldMapping(mapping: InsertHubspotFieldMapping): Promise<HubspotFieldMapping>;

  updateHubspotFieldMapping(id: string, updates: Partial<InsertHubspotFieldMapping>): Promise<HubspotFieldMapping | undefined>;

  deleteHubspotFieldMapping(id: string): Promise<void>;

  upsertHubspotFieldMappings(mappings: InsertHubspotFieldMapping[]): Promise<HubspotFieldMapping[]>;

  // Feedback System operations (INCREMENT 28)

  createFeedbackTicket(ticket: InsertFeedbackTicket): Promise<FeedbackTicket>;

  getFeedbackTicket(id: string): Promise<FeedbackTicket | undefined>;

  getFeedbackTicketsByUser(userId: string): Promise<FeedbackTicket[]>;

  getAllFeedbackTickets(filters?: { status?: string; priority?: string; type?: string; area?: string; ticketSource?: string }): Promise<FeedbackTicket[]>;

  updateFeedbackTicket(id: string, updates: Partial<{ status: string; priority: string; assignedToUserId: string | null }>): Promise<FeedbackTicket | undefined>;

  createFeedbackComment(comment: InsertFeedbackComment): Promise<FeedbackComment>;

  getFeedbackComments(ticketId: string, visibility?: string): Promise<FeedbackComment[]>;

  createFeedbackAuditLog(entry: { ticketId: string; actorUserId: string; actorName: string; action: string; fromValue?: string; toValue?: string }): Promise<FeedbackAuditLogEntry>;

  getFeedbackAuditLogs(ticketId: string): Promise<FeedbackAuditLogEntry[]>;

  getNextFeedbackTicketNumber(): Promise<number>;

  // ==========================================
  // CARRIER-READY CLAIMS INTELLIGENCE OPERATIONS
  // ==========================================
  
  // Risk Mitigation Action operations

  getAllRiskMitigationActions(filters?: { status?: string; actionType?: string }): Promise<RiskMitigationAction[]>;

  getRiskMitigationAction(id: string): Promise<RiskMitigationAction | undefined>;

  createRiskMitigationAction(action: InsertRiskMitigationAction): Promise<RiskMitigationAction>;

  updateRiskMitigationAction(id: string, updates: Partial<InsertRiskMitigationAction>): Promise<RiskMitigationAction | undefined>;

  deleteRiskMitigationAction(id: string): Promise<void>;
  
  // Carrier Narrative operations

  getAllCarrierNarratives(filters?: { status?: string; narrativeType?: string }): Promise<CarrierNarrative[]>;

  getCarrierNarrative(id: string): Promise<CarrierNarrative | undefined>;

  createCarrierNarrative(narrative: InsertCarrierNarrative): Promise<CarrierNarrative>;

  updateCarrierNarrative(id: string, updates: Partial<InsertCarrierNarrative>): Promise<CarrierNarrative | undefined>;

  deleteCarrierNarrative(id: string): Promise<void>;

  approveCarrierNarrative(id: string, userId: string): Promise<CarrierNarrative | undefined>;
  
  // Carrier Dashboard Analytics

  getCarrierDashboardMetrics(periodDays?: number): Promise<any>;

  getCarrierTrendData(periodDays?: number): Promise<any>;
  
  // Account Documents Hub

  getAccountDocuments(customerId: string): Promise<AccountDocument[]>;

  getAccountDocument(id: string): Promise<AccountDocument | undefined>;

  createAccountDocument(doc: InsertAccountDocument): Promise<AccountDocument>;

  deleteAccountDocument(id: string): Promise<void>;

  updateAccountDocument(id: string, updates: Record<string, any>): Promise<AccountDocument | undefined>;
  
  // Standard Documents (global library)

  getStandardDocuments(activeOnly?: boolean): Promise<StandardDocument[]>;

  getStandardDocument(id: string): Promise<StandardDocument | undefined>;

  createStandardDocument(doc: InsertStandardDocument): Promise<StandardDocument>;

  updateStandardDocument(id: string, updates: Partial<InsertStandardDocument>): Promise<StandardDocument | undefined>;

  deleteStandardDocument(id: string): Promise<void>;
  
  // Document Packet Logs

  getDocumentPacketLogs(customerId: string): Promise<DocumentPacketLog[]>;

  createDocumentPacketLog(log: InsertDocumentPacketLog): Promise<DocumentPacketLog>;
  
  // Account Activity Events (unified timeline)

  getAccountActivityEvents(accountId: string, category?: string): Promise<AccountActivityEvent[]>;

  createAccountActivityEvent(event: InsertAccountActivityEvent): Promise<AccountActivityEvent>;
  
  // Health Engine

  calculateAccountHealth(accountId: string): Promise<{ health: string; healthTrend: string; healthReasons: string[] }>;

  recalculateAllAccountHealth(): Promise<{ processed: number; errors: number }>;
  
  // Health Governance & Explainability

  createHealthCalculationLog(data: InsertHealthCalculationLog): Promise<HealthCalculationLog>;

  getHealthCalculationLogs(accountId: string, limit?: number): Promise<HealthCalculationLog[]>;

  createHealthOverride(data: InsertHealthOverride): Promise<HealthOverride>;

  getActiveHealthOverride(accountId: string): Promise<HealthOverride | undefined>;

  getHealthOverrides(accountId: string): Promise<HealthOverride[]>;

  deactivateHealthOverride(id: string, deactivatedBy: string, reason: string): Promise<HealthOverride | undefined>;

  expireHealthOverrides(): Promise<number>;

  getHealthExplanation(accountId: string): Promise<{
    currentHealth: string;
    healthTrend: string;
    calculatedAt: Date | null;
    reasons: string[];
    subScores: Record<string, any>;
    hasActiveOverride: boolean;
    override?: HealthOverride;
    recentLogs: HealthCalculationLog[];
  }>;

  getAccountVolumeMomentum(accountId: string): Promise<{
    score: number;
    label: 'Growing' | 'Stable' | 'Declining';
    yoyChange: number;
    qoqChange: number;
    volatility: number;
    currentYearMoves: number;
    priorYearMoves: number;
    currentQuarterMoves: number;
    priorQuarterMoves: number;
    monthlyVolumes: { month: string; moves: number }[];
  }>;

  getChildAccounts(parentId: string): Promise<Customer[]>;

  getParentAccount(childId: string): Promise<Customer | null>;

  isParentAccount(accountId: string): Promise<boolean>;
  // Drug Test Notifications

  getDrugTestNotifications(filters?: { status?: string; driverId?: string; claimId?: string }): Promise<DrugTestNotification[]>;

  getDrugTestNotificationById(id: string): Promise<DrugTestNotification | undefined>;

  getDrugTestNotificationsByClaimId(claimId: string): Promise<DrugTestNotification[]>;

  createDrugTestNotification(data: InsertDrugTestNotification): Promise<DrugTestNotification>;

  updateDrugTestNotification(id: string, data: Partial<InsertDrugTestNotification>): Promise<DrugTestNotification | undefined>;

  getDrugTestStats(): Promise<{
    total: number;
    pending: number;
    notified: number;
    scheduled: number;
    completed: number;
    cancelled: number;
    expired: number;
    byTriggerType: Record<string, number>;
    testResults: Record<string, number>;
  }>;

  getParentRollupMetrics(parentId: string): Promise<{
    totalRevenue30: number;
    totalRevenue90: number;
    totalCosts30: number;
    totalCosts90: number;
    totalMargin: number;
    openAR: number;
    childCount: number;
    rolledUpHealth: string;
    rolledUpHealthTrend: string;
    claimsMetrics: {
      totalClaims30: number;
      totalClaims90: number;
      totalClaimsCost30: number;
      totalClaimsCost90: number;
      totalMoves30: number;
      totalMoves90: number;
      claimsPer1000Moves30: number;
      claimsPer1000Moves90: number;
      claimDollarPerMove30: number;
      claimDollarPerMove90: number;
      childConcentration: { childId: string; childName: string; claimsCount: number; claimsCost: number; percentage: number }[];
    };
  }>;

  getAccountDecisions(accountId: string): Promise<(AccountDecision & { addendums: DecisionAddendum[] })[]>;

  getAccountDecisionById(id: string): Promise<(AccountDecision & { addendums: DecisionAddendum[] }) | undefined>;

  createAccountDecision(data: InsertAccountDecision): Promise<AccountDecision>;

  createDecisionAddendum(data: InsertDecisionAddendum): Promise<DecisionAddendum>;

  // Account Knowledge Base

  getAccountKnowledge(accountId: string): Promise<AccountKnowledge | undefined>;

  getAccountKnowledgeHistory(accountId: string): Promise<AccountKnowledgeHistory[]>;

  upsertAccountKnowledge(accountId: string, data: Partial<InsertAccountKnowledge>, userId: string, userName: string): Promise<AccountKnowledge>;

  // Recruiting Task Management

  getRecruitingTasks(filters: { ownerId?: string; status?: string; type?: string; overdue?: boolean; entityType?: string; entityId?: string }): Promise<RecruitingTask[]>;

  getRecruitingTaskById(id: string): Promise<RecruitingTask | undefined>;

  createRecruitingTask(task: InsertRecruitingTask): Promise<RecruitingTask>;

  updateRecruitingTask(id: string, updates: Partial<{ status: string; completedAt: Date; completedBy: string }>): Promise<RecruitingTask | undefined>;

  getRecruitingTaskCountsByEntity(entityType: string, entityIds: string[]): Promise<Record<string, number>>;

  // Recruiting Health Dashboard

  getRecruitingHealthThresholds(): Promise<RecruitingHealthThreshold[]>;

  updateRecruitingHealthThreshold(metricKey: string, updates: Partial<InsertRecruitingHealthThreshold>): Promise<RecruitingHealthThreshold | undefined>;

  createRecruitingHealthSnapshot(snapshot: InsertRecruitingHealthSnapshot): Promise<RecruitingHealthSnapshot>;

  getRecruitingHealthSnapshots(limit?: number): Promise<RecruitingHealthSnapshot[]>;

  getRecruitingHealthSnapshotByDate(date: string): Promise<RecruitingHealthSnapshot | undefined>;

  // Scheduling SLA Tracking

  getSchedulingSlaDefinitions(entityId?: string): Promise<SchedulingSlaDefinition[]>;

  getSchedulingSlaDefinition(id: string): Promise<SchedulingSlaDefinition | undefined>;

  createSchedulingSlaDefinition(def: InsertSchedulingSlaDefinition): Promise<SchedulingSlaDefinition>;

  updateSchedulingSlaDefinition(id: string, updates: Partial<InsertSchedulingSlaDefinition>): Promise<SchedulingSlaDefinition | undefined>;

  deleteSchedulingSlaDefinition(id: string): Promise<void>;

  getSchedulingSlaEvents(filters?: { slaDefinitionId?: string; startDate?: string; endDate?: string; status?: string; locationId?: string }): Promise<SchedulingSlaEvent[]>;

  createSchedulingSlaEvent(event: InsertSchedulingSlaEvent): Promise<SchedulingSlaEvent>;

  updateSchedulingSlaEvent(id: string, updates: Partial<InsertSchedulingSlaEvent>): Promise<SchedulingSlaEvent | undefined>;

  assessSchedulingSlaRisk(shiftIds: string[]): Promise<any[]>;

  // Cross-Location Mobility Controls

  getCrossLocationMobilityConfigs(entityId?: string): Promise<CrossLocationMobilityConfig[]>;

  getCrossLocationMobilityConfig(id: string): Promise<CrossLocationMobilityConfig | undefined>;

  createCrossLocationMobilityConfig(config: InsertCrossLocationMobilityConfig): Promise<CrossLocationMobilityConfig>;

  updateCrossLocationMobilityConfig(id: string, updates: Partial<InsertCrossLocationMobilityConfig>): Promise<CrossLocationMobilityConfig | undefined>;

  deleteCrossLocationMobilityConfig(id: string): Promise<void>;

  getCrossLocationTravelLogs(filters?: { driverId?: string; userId?: string; startDate?: string; endDate?: string; riskLevel?: string }): Promise<CrossLocationTravelLog[]>;

  createCrossLocationTravelLog(log: InsertCrossLocationTravelLog): Promise<CrossLocationTravelLog>;

  createSchedulingJustification(justification: InsertSchedulingJustification): Promise<SchedulingJustification>;

  getSchedulingJustifications(filters?: { category?: string; scheduleId?: string; driverId?: string; createdById?: string; search?: string; startDate?: string; endDate?: string }): Promise<SchedulingJustification[]>;

  getSchedulingJustification(id: string): Promise<SchedulingJustification | undefined>;

  assessCrossLocationMobilityRisk(driverId: string, targetLocationId: string, targetShiftDate: string, targetShiftStartTime: string): Promise<any>;

  // Account Notes

  getAccountNotes(customerId: string, filters?: { noteType?: string; submittedByUserId?: string; startDate?: string; endDate?: string }): Promise<AccountNote[]>;

  getAccountNote(noteId: string): Promise<AccountNote | undefined>;

  createAccountNote(data: InsertAccountNote): Promise<AccountNote>;

  updateAccountNote(noteId: string, editedByUserId: string, updates: { content?: string; noteType?: string; noteDate?: string; tripId?: string | null; zendeskId?: string | null }, reason: string): Promise<AccountNote | undefined>;

  softDeleteAccountNote(noteId: string, deletedByUserId: string, reason: string): Promise<AccountNote | undefined>;

  getTripsForExport(filters: {
    moveNumber?: string;
    driver?: string;
    customer?: string;
    startDate?: string;
    endDate?: string;
    importBatchId?: string;
    status?: string;
    moveType?: string;
    sourceSystem?: string;
    sortBy?: string;
    sortDir?: string;
  }): Promise<any[]>;
}

export class DatabaseStorage implements IStorage {
  // User operations - Required for Replit Auth
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async upsertUser(userData: UpsertUser, context: IdentityUpdateContext = { source: "storage_upsert" }): Promise<User> {
    const normalizedEmail = typeof userData.email === "string" && userData.email.trim()
      ? userData.email.trim().toLowerCase()
      : null;
    const incomingSsoSubject = typeof userData.ssoSubjectId === "string" && userData.ssoSubjectId.trim()
      ? userData.ssoSubjectId.trim()
      : null;
    const existingRows = normalizedEmail
      ? await db.select().from(users).where(sql`lower(trim(${users.email})) = ${normalizedEmail}`).limit(1)
      : userData.id
        ? await db.select().from(users).where(eq(users.id, userData.id)).limit(1)
        : [];
    const existingUser = existingRows[0];

    if (existingUser) {
      const identityInput: Record<string, unknown> = {};
      for (const field of ["firstName", "lastName", "email"] as const) {
        if (Object.prototype.hasOwnProperty.call(userData, field)) {
          identityInput[field] = field === "email" ? normalizedEmail : userData[field];
        }
      }
      const identityDecision = prepareIdentityUpdate(existingUser, identityInput, context);
      const updateData: Record<string, unknown> = {
        ...identityDecision.patch,
        ...(Object.prototype.hasOwnProperty.call(userData, "profileImageUrl") &&
          userData.profileImageUrl !== undefined
          ? { profileImageUrl: userData.profileImageUrl }
          : {}),
        updatedAt: new Date(),
      };

      // Preserve the external OIDC subject separately from the DriverHub user
      // primary key. Existing/invited users can predate OIDC and therefore have
      // historical records tied to a different internal ID. Only fill an empty
      // SSO link; never replace a different one automatically.
      if (incomingSsoSubject && !existingUser.ssoSubjectId) {
        const [subjectOwner] = await db.select({ id: users.id })
          .from(users)
          .where(eq(users.ssoSubjectId, incomingSsoSubject))
          .limit(1);
        if (!subjectOwner || subjectOwner.id === existingUser.id) {
          updateData.ssoSubjectId = incomingSsoSubject;
        } else {
          console.error(
            `[IdentityIntegrity] Refused to link OIDC subject to ${existingUser.id}; it is already linked to ${subjectOwner.id}.`,
          );
        }
      } else if (
        incomingSsoSubject
        && existingUser.ssoSubjectId
        && existingUser.ssoSubjectId !== incomingSsoSubject
      ) {
        console.error(
          `[IdentityIntegrity] Refused to replace existing OIDC subject for ${existingUser.id}.`,
        );
      }

      const [updated] = await db.update(users)
        .set(updateData as any)
        .where(eq(users.id, existingUser.id))
        .returning();
      await writeIdentityAudits(updated ?? existingUser, identityDecision.audits, context);
      return updated ?? existingUser;
    }

    // New accounts may be created without a human name while invited. Remove
    // undefined properties so sparse payloads never become destructive SQL.
    const insertData = Object.fromEntries(
      Object.entries(userData).filter(([, value]) => value !== undefined),
    ) as UpsertUser;
    if (normalizedEmail) insertData.email = normalizedEmail;
    const [created] = await db.insert(users).values(insertData).returning();
    return created;
  }

  // Alias for upsertUser - maintains backward compatibility
  async createUser(userData: UpsertUser, context?: IdentityUpdateContext): Promise<User> {
    return this.upsertUser(userData, context);
  }

  async updateUserRole(id: string, role: string): Promise<User> {
    // Only allow role selection if user hasn't already selected a role
    const [existingUser] = await db.select().from(users).where(eq(users.id, id));
    if (!existingUser) {
      throw new Error("User not found");
    }
    
    if (existingUser.roleSelectedAt) {
      throw new Error("Role has already been selected and cannot be changed");
    }

    const [user] = await db
      .update(users)
      .set({ 
        role, 
        roleSelectedAt: new Date(),
        updatedAt: new Date() 
      })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async updateUser(
    id: string,
    updates: Partial<{
      profileImageUrl: string | null;
      heymarketMemberId: number | null;
      firstName: string | null;
      lastName: string | null;
      email: string | null;
    }>,
    context: IdentityUpdateContext = { source: "storage_update" },
  ): Promise<User | undefined> {
    const [existing] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!existing) return undefined;

    const identityDecision = prepareIdentityUpdate(existing, updates, context);
    const nonIdentityUpdates: Record<string, unknown> = {};
    if (Object.prototype.hasOwnProperty.call(updates, "profileImageUrl")) {
      nonIdentityUpdates.profileImageUrl = updates.profileImageUrl;
    }
    if (Object.prototype.hasOwnProperty.call(updates, "heymarketMemberId")) {
      nonIdentityUpdates.heymarketMemberId = updates.heymarketMemberId;
    }

    if (Object.keys(identityDecision.patch).length === 0 && Object.keys(nonIdentityUpdates).length === 0) {
      await writeIdentityAudits(existing, identityDecision.audits, context);
      return existing;
    }

    const [user] = await db.update(users)
      .set({
        ...nonIdentityUpdates,
        ...identityDecision.patch,
        updatedAt: new Date(),
      } as any)
      .where(eq(users.id, id))
      .returning();
    await writeIdentityAudits(user ?? existing, identityDecision.audits, context);
    return user;
  }

  // Driver operations
  async getDriver(id: string, includeSensitiveData: boolean = false): Promise<DriverWithComputedFields | undefined> {
    const [driver] = await db.select().from(drivers).where(eq(drivers.id, id));
    if (!driver) return undefined;

    // Show masked last 4 digits unless full decrypted access is requested
    const maskedDriver = {
      ...driver,
      ssnOrEinEncrypted: includeSensitiveData ? driver.ssnOrEinEncrypted : null, // Hide encrypted value
      ssnOrEinLast4: driver.ssnOrEinLast4, // Always show last 4 digits (stored plaintext)
    };

    return enhanceDriverWithComputedFields(maskedDriver);
  }

  async getDriverByUserId(userId: string, includeSensitiveData: boolean = false): Promise<DriverWithComputedFields | undefined> {
    const [driver] = await db.select().from(drivers).where(eq(drivers.userId, userId));
    if (!driver) return undefined;

    // Show masked last 4 digits unless full decrypted access is requested
    const maskedDriver = {
      ...driver,
      ssnOrEinEncrypted: includeSensitiveData ? driver.ssnOrEinEncrypted : null, // Hide encrypted value
      ssnOrEinLast4: driver.ssnOrEinLast4, // Always show last 4 digits (stored plaintext)
    };

    return enhanceDriverWithComputedFields(maskedDriver);
  }

  async getDriverIdByUserId(userId: string): Promise<string | undefined> {
    const [driver] = await db.select({ id: drivers.id }).from(drivers).where(eq(drivers.userId, userId));
    return driver?.id;
  }

  async getDriverWithUser(id: string): Promise<DriverWithUser | undefined> {
    const [result] = await db
      .select()
      .from(drivers)
      .leftJoin(users, eq(drivers.userId, users.id))
      .where(eq(drivers.id, id));

    if (!result || !result.users) return undefined;

    return {
      ...result.drivers,
      user: result.users,
    };
  }

  async getAllDriversWithUsers(includeArchived = false): Promise<DriverWithUser[]> {
    const whereClause = includeArchived
      ? undefined
      : eq(drivers.isDeleted, false);

    const results = await db
      .select()
      .from(drivers)
      .leftJoin(users, eq(drivers.userId, users.id))
      .where(whereClause)
      .orderBy(desc(drivers.createdAt));

    return results
      .filter((r) => r.users !== null)
      .map((r) => ({
        ...r.drivers,
        user: r.users!,
      }));
  }

  async archiveDriver(driverId: string, userId: string, reason?: string): Promise<void> {
    await db.update(drivers).set({
      isDeleted: true,
      deletedAt: new Date(),
      deletedByUserId: userId,
      deletionReason: reason || null,
      status: "archived",
      statusChangedBy: userId,
      statusChangedAt: new Date(),
    }).where(eq(drivers.id, driverId));
  }

  async restoreDriver(driverId: string, userId: string): Promise<void> {
    await db.update(drivers).set({
      isDeleted: false,
      deletedAt: null,
      deletedByUserId: null,
      deletionReason: null,
      status: "inactive",
      statusChangedBy: userId,
      statusChangedAt: new Date(),
    }).where(eq(drivers.id, driverId));
  }

  async getMarket(marketId: string): Promise<typeof markets.$inferSelect | null> {
    const [market] = await db
      .select()
      .from(markets)
      .where(eq(markets.id, marketId))
      .limit(1);
    return market || null;
  }

  async getMarketByCode(code: string): Promise<typeof markets.$inferSelect | null> {
    const [market] = await db
      .select()
      .from(markets)
      .where(eq(markets.code, code))
      .limit(1);
    return market || null;
  }

  async getAllMarkets(): Promise<typeof markets.$inferSelect[]> {
    return db.select().from(markets).orderBy(markets.name);
  }

  async getZone(zoneId: string): Promise<typeof zones.$inferSelect | null> {
    const [zone] = await db
      .select()
      .from(zones)
      .where(eq(zones.id, zoneId))
      .limit(1);
    return zone || null;
  }

  async getAllDriversWithStats(includeArchived = false): Promise<(DriverWithUser & { movesToday: number; hoursThisWeek: number })[]> {
    const driversWithUsers = await this.getAllDriversWithUsers(includeArchived);
    
    const todayStr = new Date().toISOString().split('T')[0];
    const startOfWeekDate = new Date();
    startOfWeekDate.setDate(startOfWeekDate.getDate() - startOfWeekDate.getDay());
    const startOfWeekStr = startOfWeekDate.toISOString().split('T')[0];
    
    const todayStats = await db
      .select({
        driverId: trips.driverId,
        count: sql<number>`count(*)::int`,
      })
      .from(trips)
      .where(sql`DATE(${trips.tripDate}) = ${todayStr}`)
      .groupBy(trips.driverId);
    
    const weekStats = await db
      .select({
        driverId: trips.driverId,
        count: sql<number>`count(*)::int`,
        totalDuration: sql<string>`string_agg(${trips.duration}, ',')`,
      })
      .from(trips)
      .where(sql`DATE(${trips.tripDate}) >= ${startOfWeekStr}`)
      .groupBy(trips.driverId);
    
    const todayMap = new Map(todayStats.map(s => [s.driverId, s.count]));
    const weekMap = new Map(weekStats.map(s => {
      let hours = 0;
      if (s.totalDuration) {
        for (const dur of s.totalDuration.split(',')) {
          if (dur.trim()) {
            hours += parseDurationToHours(dur.trim());
          }
        }
      }
      return [s.driverId, hours];
    }));
    
    const allCustomers = await db.select({ id: customers.id, customerName: customers.customerName, dealerId: customers.dealerId }).from(customers);
    const customerNameMap = new Map(allCustomers.map(c => [c.id, c.customerName]));
    const customerDealerIdMap = new Map(allCustomers.map(c => [c.id, c.dealerId]));

    // Build a map of driverId → display account name and dealerId from the driverAccounts junction table
    // Rule: single account → use it; multiple accounts → use the primary one
    const assignedAccountRows = await db
      .select({
        driverId: driverAccounts.driverId,
        isPrimary: driverAccounts.isPrimary,
        customerName: customers.customerName,
        dealerId: customers.dealerId,
      })
      .from(driverAccounts)
      .innerJoin(customers, eq(driverAccounts.accountId, customers.id))
      .where(isNull(driverAccounts.assignmentEndedAt));

    const driverAccountGroups = new Map<string, Array<{ customerName: string; dealerId: string | null; isPrimary: boolean }>>();
    for (const row of assignedAccountRows) {
      if (!driverAccountGroups.has(row.driverId)) driverAccountGroups.set(row.driverId, []);
      driverAccountGroups.get(row.driverId)!.push({ customerName: row.customerName || "", dealerId: row.dealerId ?? null, isPrimary: row.isPrimary });
    }

    const primaryAccountMap = new Map<string, string>();
    const primaryDealerIdMap = new Map<string, string | null>();
    for (const [driverId, accounts] of driverAccountGroups) {
      const primary = accounts.length === 1 ? accounts[0] : (accounts.find(a => a.isPrimary) || accounts[0]);
      primaryAccountMap.set(driverId, primary.customerName);
      primaryDealerIdMap.set(driverId, primary.dealerId ?? null);
    }

    return driversWithUsers.map(driver => ({
      ...driver,
      movesToday: todayMap.get(driver.id) ?? 0,
      hoursThisWeek: Math.round((weekMap.get(driver.id) ?? 0) * 10) / 10,
      // Prefer the old drivershiftCustomerId FK; fall back to primary assigned account
      drivershiftCustomerName: (driver as any).drivershiftCustomerId
        ? customerNameMap.get((driver as any).drivershiftCustomerId) || primaryAccountMap.get(driver.id) || ""
        : primaryAccountMap.get(driver.id) || "",
      drivershiftDealerId: (driver as any).drivershiftCustomerId
        ? customerDealerIdMap.get((driver as any).drivershiftCustomerId) ?? primaryDealerIdMap.get(driver.id) ?? null
        : primaryDealerIdMap.get(driver.id) ?? null,
      // All assigned account names (for search purposes) — deduped, sorted
      allAccountNames: (driverAccountGroups.get(driver.id) ?? []).map(a => a.customerName).filter(Boolean),
    }));
  }

  async createDriver(driverData: InsertDriver): Promise<DriverWithComputedFields> {
    // Encrypt SSN/EIN if provided (input is plaintext, e.g., "123-45-6789")
    const dataToInsert = {
      ...driverData,
      ssnOrEinEncrypted: driverData.ssnOrEinEncrypted 
        ? encryptSsnOrEin(driverData.ssnOrEinEncrypted) // Encrypt the PLAINTEXT input
        : null,
      ssnOrEinLast4: driverData.ssnOrEinEncrypted
        ? extractLast4Digits(driverData.ssnOrEinEncrypted) // Extract from PLAINTEXT input
        : null,
    };

    const [driver] = await db.insert(drivers).values(dataToInsert).returning();
    
    // Return enhanced driver with computed fields (hide encrypted value, show last4)
    return enhanceDriverWithComputedFields({
      ...driver,
      ssnOrEinEncrypted: null, // Don't expose encrypted value
      ssnOrEinLast4: driver.ssnOrEinLast4, // Show plaintext last 4 digits
    });
  }

  async updateDriver(id: string, driverData: Partial<InsertDriver>): Promise<DriverWithComputedFields | undefined> {
    // Encrypt SSN/EIN if being updated (input is plaintext)
    const dataToUpdate: Record<string, any> = {
      ...driverData,
      updatedAt: new Date(),
    };

    if (driverData.ssnOrEinEncrypted !== undefined) {
      dataToUpdate.ssnOrEinEncrypted = driverData.ssnOrEinEncrypted
        ? encryptSsnOrEin(driverData.ssnOrEinEncrypted) // Encrypt the PLAINTEXT input
        : null;
      dataToUpdate.ssnOrEinLast4 = driverData.ssnOrEinEncrypted
        ? extractLast4Digits(driverData.ssnOrEinEncrypted) // Extract from PLAINTEXT input
        : null;
    }

    const [driver] = await db
      .update(drivers)
      .set(dataToUpdate)
      .where(eq(drivers.id, id))
      .returning();

    if (!driver) return undefined;

    // Return enhanced driver with computed fields (hide encrypted value, show last4)
    return enhanceDriverWithComputedFields({
      ...driver,
      ssnOrEinEncrypted: null, // Don't expose encrypted value
      ssnOrEinLast4: driver.ssnOrEinLast4, // Show plaintext last 4 digits
    });
  }

  // Employee operations
  async getAllEmployees(): Promise<Employee[]> {
    return await db
      .select()
      .from(employees)
      .orderBy(employees.lastName, employees.firstName);
  }

  async getEmployee(id: string): Promise<Employee | undefined> {
    const [employee] = await db
      .select()
      .from(employees)
      .where(eq(employees.id, id));
    return employee;
  }

  async getEmployeeByUserId(userId: string): Promise<Employee | undefined> {
    const [employee] = await db
      .select()
      .from(employees)
      .where(eq(employees.userId, userId));
    return employee;
  }

  async getNextEmployeeId(): Promise<string> {
    // Get all employee IDs that match the EMP#### pattern
    const allEmployees = await db
      .select({ employeeId: employees.employeeId })
      .from(employees)
      .where(sql`${employees.employeeId} ~ '^EMP[0-9]+$'`);
    
    let maxNum = 0;
    for (const emp of allEmployees) {
      if (emp.employeeId) {
        const numPart = parseInt(emp.employeeId.replace('EMP', ''), 10);
        if (!isNaN(numPart) && numPart > maxNum) {
          maxNum = numPart;
        }
      }
    }
    
    // Format as EMP0001, EMP0002, etc.
    const nextNum = maxNum + 1;
    return `EMP${nextNum.toString().padStart(4, '0')}`;
  }

  async createEmployee(employeeData: InsertEmployee): Promise<Employee> {
    // Encrypt SSN if provided
    const dataToInsert = { ...employeeData };
    if (dataToInsert.ssn) {
      // Remove any dashes and format, then encrypt
      const cleanSsn = dataToInsert.ssn.replace(/-/g, '');
      dataToInsert.ssn = encryptSsnOrEin(cleanSsn);
    }
    
    // Auto-link to user by matching workEmail to user email
    if (dataToInsert.workEmail && !dataToInsert.userId) {
      const matchingUser = await this.getUserByEmail(dataToInsert.workEmail);
      if (matchingUser) {
        dataToInsert.userId = matchingUser.id;
      }
    }
    
    const [employee] = await db
      .insert(employees)
      .values(dataToInsert)
      .returning();
    return employee;
  }

  async updateEmployee(id: string, employeeData: Partial<InsertEmployee>): Promise<Employee | undefined> {
    // Filter out undefined values to prevent writing NULL to required columns
    const dataToUpdate = Object.fromEntries(
      Object.entries({
        ...employeeData,
        updatedAt: new Date(),
      }).filter(([_, value]) => value !== undefined)
    ) as Record<string, any>;
    
    // Convert empty strings to null for date fields
    const dateFields = ['dateOfBirth', 'hireDate', 'termDate', 'lastPerformanceReviewDate', 'lastMeritIncrease'];
    for (const field of dateFields) {
      if (dataToUpdate[field] === '' || dataToUpdate[field] === null) {
        dataToUpdate[field] = null;
      }
    }
    
    // Encrypt SSN if provided
    if (dataToUpdate.ssn) {
      // Remove any dashes and format, then encrypt
      const cleanSsn = (dataToUpdate.ssn as string).replace(/-/g, '');
      dataToUpdate.ssn = encryptSsnOrEin(cleanSsn);
    }
    
    // Auto-link to user by matching workEmail to user email when workEmail is updated
    if (dataToUpdate.workEmail !== undefined) {
      if (dataToUpdate.workEmail) {
        const matchingUser = await this.getUserByEmail(dataToUpdate.workEmail);
        if (matchingUser) {
          dataToUpdate.userId = matchingUser.id;
        } else {
          // Clear userId if no matching user found to prevent mismatches
          dataToUpdate.userId = null;
        }
      } else {
        // Clear userId if workEmail is being cleared
        dataToUpdate.userId = null;
      }
    }

    const [employee] = await db
      .update(employees)
      .set(dataToUpdate)
      .where(eq(employees.id, id))
      .returning();
    return employee;
  }

  // Helper to mask employee SSN based on user role
  maskEmployeeSsn(employee: Employee, userRole: string): Employee {
    if (!employee.ssn) return employee;
    
    try {
      const decryptedSsn = decryptSsnOrEin(employee.ssn);
      // Only super_user can see full SSN
      if (userRole === 'super_user') {
        // Format as XXX-XX-XXXX
        const formatted = `${decryptedSsn.slice(0,3)}-${decryptedSsn.slice(3,5)}-${decryptedSsn.slice(5,9)}`;
        return { ...employee, ssn: formatted };
      } else {
        // Mask to show only last 4: XXX-XX-1234
        return { ...employee, ssn: maskSsnOrEin(decryptedSsn) };
      }
    } catch (e) {
      // If decryption fails, return masked version
      return { ...employee, ssn: '***-**-****' };
    }
  }

  // Customer operations
  async getAllCustomers(): Promise<Customer[]> {
    return db.select().from(customers).orderBy(asc(sql`lower(coalesce(${customers.customerName}, ''))`));
  }

  async getCustomer(id: string): Promise<Customer | undefined> {
    const [customer] = await db.select().from(customers).where(eq(customers.id, id));
    return customer;
  }

  async getCustomerByHubspotId(hubspotId: string): Promise<Customer | undefined> {
    const [customer] = await db.select().from(customers).where(eq(customers.hubspotId, hubspotId));
    return customer;
  }

  async createCustomer(customer: InsertCustomer): Promise<Customer> {
    // customer_number is auto-assigned by a BEFORE INSERT trigger (assign_account_number →
    // next_account_number()). Strip any empty/null customerNumber so the trigger fires;
    // only include it when a non-empty value is explicitly supplied (e.g. from an import).
    const { customerNumber, ...rest } = customer as any;
    const insertData = (customerNumber && String(customerNumber).trim())
      ? { ...rest, customerNumber }
      : rest;
    const [newCustomer] = await db.insert(customers).values(insertData).returning();
    return newCustomer;
  }

  async updateCustomer(id: string, customerData: Partial<InsertCustomer>): Promise<Customer | undefined> {
    // Remove customerNumber from updates - it's immutable after creation
    // Also strip merge fields — those are only written by the dedicated merge endpoint
    const { customerNumber, mergedIntoId, mergedAt, mergedById, mergeReason, ...safeData } = customerData as any;
    
    // Filter out undefined values to prevent writing NULL to required columns
    const dataToUpdate = Object.fromEntries(
      Object.entries({
        ...safeData,
        updatedAt: new Date(),
      }).filter(([_, value]) => value !== undefined)
    );

    const [customer] = await db
      .update(customers)
      .set(dataToUpdate)
      .where(eq(customers.id, id))
      .returning();
    return customer;
  }

  async deleteCustomer(id: string): Promise<void> {
    // Policy: no hard deletes — deactivate instead
    await db.update(customers)
      .set({ status: 'inactive', updatedAt: new Date() })
      .where(eq(customers.id, id));
  }

  async getCustomerPerformance(customerId: string) {
    // TODO: Replace with real data from trips/moves system when implemented
    // For now, return empty/zero data structure
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    return {
      movesLast12Months: months.map(month => ({ month, moves: 0 })),
      movesVsPriorYear: {
        current: 0,
        prior: 0,
        change: 0,
        changePercent: 0,
      },
      movesByType: [],
      driversCount: 0,
      driversByType: [],
      grossProfit: 0,
      avgMoveLength: 0,
      accidents: 0,
      customerTickets: 0,
      openCustomerTickets: 0,
      driverTickets: 0,
      openDriverTickets: 0,
      creditPaymentScore: 100,
    };
  }

  // Pay record operations
  async getPayRecordsByDriverId(driverId: string): Promise<PayRecord[]> {
    return await db
      .select()
      .from(payRecords)
      .where(eq(payRecords.driverId, driverId))
      .orderBy(desc(payRecords.payPeriodEnd));
  }

  async createPayRecord(payRecordData: InsertPayRecord): Promise<PayRecord> {
    const [payRecord] = await db.insert(payRecords).values(payRecordData).returning();
    return payRecord;
  }

  async getAllPayPeriods(): Promise<any[]> {
    return await db
      .select()
      .from(payPeriods)
      .orderBy(desc(payPeriods.periodStart));
  }

  async createPayPeriod(data: {
    payGroup: string;
    periodType?: string;
    periodStart: string;
    periodEnd: string;
    status?: string;
    createdBy?: string;
  }): Promise<any> {
    const [payPeriod] = await db.insert(payPeriods).values({
      payGroup: data.payGroup,
      periodType: data.periodType || 'WEEKLY',
      periodStart: data.periodStart,
      periodEnd: data.periodEnd,
      status: (data.status as 'OPEN' | 'PROCESSING' | 'LOCKED') || 'OPEN',
      createdBy: data.createdBy || null,
    }).returning();
    return payPeriod;
  }

  async updatePayPeriod(id: number | string, data: Partial<{ status: string; lockedAt: Date; lockedBy: string; exportedAt: Date; exportType: string; exportStatus: string }>): Promise<any> {
    const updateData: any = {};
    if (data.status) updateData.status = data.status;
    if (data.lockedAt) updateData.lockedAt = data.lockedAt;
    if (data.lockedBy) updateData.lockedBy = data.lockedBy;
    if (data.exportedAt) updateData.exportedAt = data.exportedAt;
    if (data.exportType) updateData.exportType = data.exportType;
    if (data.exportStatus) updateData.exportStatus = data.exportStatus;
    
    const [updated] = await db
      .update(payPeriods)
      .set(updateData)
      .where(eq(payPeriods.id, String(id)))
      .returning();
    return updated;
  }

  // Export Audit Log operations (INCREMENT 27)
  async createExportAuditLog(data: {
    payPeriodId: string;
    exportType: 'ADP_CSV' | 'OPENFORCE_CSV';
    fileName: string;
    fileHash: string;
    rowCount: number;
    totalAmountCents: number;
    createdBy?: string;
  }): Promise<typeof exportAuditLog.$inferSelect> {
    const [entry] = await db.insert(exportAuditLog).values({
      payPeriodId: data.payPeriodId,
      exportType: data.exportType,
      fileName: data.fileName,
      fileHash: data.fileHash,
      rowCount: data.rowCount,
      totalAmountCents: data.totalAmountCents,
      createdBy: data.createdBy || null,
    }).returning();
    return entry;
  }

  async getExportAuditLogsByPayPeriodId(payPeriodId: string): Promise<any[]> {
    const logs = await db
      .select()
      .from(exportAuditLog)
      .where(eq(exportAuditLog.payPeriodId, payPeriodId))
      .orderBy(desc(exportAuditLog.createdAt));
    return logs;
  }

  // Pay Period Audit Events (append-only)
  async createPayPeriodAuditEvent(data: { 
    action: string; 
    userId?: string; 
    payPeriodId?: string; 
    metadata?: Record<string, any> 
  }): Promise<any> {
    const [event] = await db.insert(payPeriodAuditEvents).values({
      action: data.action,
      userId: data.userId || null,
      payPeriodId: data.payPeriodId || null,
      metadata: data.metadata || null,
    }).returning();
    return event;
  }

  async getPayPeriodAuditEvents(limit: number = 10): Promise<any[]> {
    const events = await db
      .select({
        id: payPeriodAuditEvents.id,
        action: payPeriodAuditEvents.action,
        userId: payPeriodAuditEvents.userId,
        payPeriodId: payPeriodAuditEvents.payPeriodId,
        timestamp: payPeriodAuditEvents.timestamp,
        metadata: payPeriodAuditEvents.metadata,
        actorFirstName: users.firstName,
        actorLastName: users.lastName,
      })
      .from(payPeriodAuditEvents)
      .leftJoin(users, eq(payPeriodAuditEvents.userId, users.email))
      .orderBy(desc(payPeriodAuditEvents.timestamp))
      .limit(limit);
    
    return events.map(e => ({
      ...e,
      actorName: e.actorFirstName && e.actorLastName 
        ? `${e.actorFirstName} ${e.actorLastName}` 
        : e.userId || 'System',
    }));
  }

  async getPayPeriodAuditEventsByPayPeriodId(payPeriodId: string): Promise<any[]> {
    const events = await db
      .select({
        id: payPeriodAuditEvents.id,
        action: payPeriodAuditEvents.action,
        userId: payPeriodAuditEvents.userId,
        payPeriodId: payPeriodAuditEvents.payPeriodId,
        timestamp: payPeriodAuditEvents.timestamp,
        metadata: payPeriodAuditEvents.metadata,
        actorFirstName: users.firstName,
        actorLastName: users.lastName,
      })
      .from(payPeriodAuditEvents)
      .leftJoin(users, eq(payPeriodAuditEvents.userId, users.email))
      .where(eq(payPeriodAuditEvents.payPeriodId, payPeriodId))
      .orderBy(desc(payPeriodAuditEvents.timestamp));
    
    return events.map(e => ({
      ...e,
      actorName: e.actorFirstName && e.actorLastName 
        ? `${e.actorFirstName} ${e.actorLastName}` 
        : e.userId || 'System',
    }));
  }

  // Payroll Exceptions operations (INCREMENT 25B)
  async createPayrollException(data: {
    tripId: string;
    payPeriodId?: string;
    driverId: string;
    moveNumber: string;
    exceptionType: string;
    eligibilityReasons?: string[];
    originalEligibilityStatus?: string;
    status?: string;
  }): Promise<typeof payrollExceptions.$inferSelect> {
    const [exception] = await db.insert(payrollExceptions).values({
      tripId: data.tripId,
      payPeriodId: data.payPeriodId || null,
      driverId: data.driverId,
      moveNumber: data.moveNumber,
      exceptionType: data.exceptionType,
      eligibilityReasons: data.eligibilityReasons || [],
      originalEligibilityStatus: data.originalEligibilityStatus || null,
      status: data.status || 'PENDING',
    }).returning();
    return exception;
  }

  async getPayrollExceptionsByPayPeriod(payPeriodId: string): Promise<typeof payrollExceptions.$inferSelect[]> {
    return db
      .select()
      .from(payrollExceptions)
      .where(eq(payrollExceptions.payPeriodId, payPeriodId))
      .orderBy(desc(payrollExceptions.createdAt));
  }

  async getPayrollException(id: string): Promise<typeof payrollExceptions.$inferSelect | null> {
    const [exception] = await db
      .select()
      .from(payrollExceptions)
      .where(eq(payrollExceptions.id, id))
      .limit(1);
    return exception || null;
  }

  async updatePayrollException(id: string, data: {
    status?: string;
    overrideApprovedBy?: string;
    overrideReason?: string;
    overrideApprovedAt?: Date;
    includedInExportId?: string;
  }): Promise<typeof payrollExceptions.$inferSelect | null> {
    const updateData: any = { updatedAt: new Date() };
    if (data.status) updateData.status = data.status;
    if (data.overrideApprovedBy) updateData.overrideApprovedBy = data.overrideApprovedBy;
    if (data.overrideReason) updateData.overrideReason = data.overrideReason;
    if (data.overrideApprovedAt) updateData.overrideApprovedAt = data.overrideApprovedAt;
    if (data.includedInExportId) updateData.includedInExportId = data.includedInExportId;
    
    const [updated] = await db
      .update(payrollExceptions)
      .set(updateData)
      .where(eq(payrollExceptions.id, id))
      .returning();
    return updated || null;
  }

  async getPendingPayrollExceptions(): Promise<typeof payrollExceptions.$inferSelect[]> {
    return db
      .select()
      .from(payrollExceptions)
      .where(eq(payrollExceptions.status, 'PENDING'))
      .orderBy(desc(payrollExceptions.createdAt));
  }

  // Trip operations
  async getTripsByDriverId(driverId: string): Promise<Trip[]> {
    return await db
      .select()
      .from(trips)
      .where(eq(trips.driverId, driverId))
      .orderBy(desc(trips.tripDate));
  }

  async getTripsByCustomerId(customerId: string): Promise<Trip[]> {
    return await db
      .select()
      .from(trips)
      .where(eq(trips.customerId, customerId))
      .orderBy(desc(trips.tripDate));
  }

  async getTripWithRelations(id: string): Promise<any | undefined> {
    const [result] = await db
      .select({
        trip: trips,
        driverUser: users,
        customer: customers,
      })
      .from(trips)
      .leftJoin(drivers, eq(trips.driverId, drivers.id))
      .leftJoin(users, eq(drivers.userId, users.id))
      .leftJoin(customers, eq(trips.customerId, customers.id))
      .where(eq(trips.id, id));

    if (!result) return undefined;

    const driverReturns = await db
      .select()
      .from(driverReturnEntries)
      .where(eq(driverReturnEntries.linkedTripId, id))
      .orderBy(driverReturnEntries.tripDate);

    return {
      ...result.trip,
      driverName: result.driverUser
        ? `${result.driverUser.firstName || ''} ${result.driverUser.lastName || ''}`.trim() || null
        : null,
      customerName: result.customer?.customerName || null,
      driverReturns,
    };
  }

  async getTripsPage(filters: {
    moveNumber?: string;
    driver?: string;
    customer?: string;
    startDate?: string;
    endDate?: string;
    importBatchId?: string;
    status?: string;
    moveType?: string;
    sourceSystem?: string;
    limit?: number;
    offset?: number;
    sortBy?: string;
    sortDir?: string;
  }): Promise<{ trips: any[]; total: number }> {
    const limit = Math.min(filters.limit ?? 50, 200);
    const offset = filters.offset ?? 0;

    const conditions: any[] = [];
    const moveSearch = filters.moveNumber?.trim();
    if (moveSearch) {
      conditions.push(
        or(
          eq(trips.id, moveSearch),
          eq(trips.moveNumber, moveSearch),
          eq(trips.externalMoveId, moveSearch),
          ilike(trips.moveNumber, `%${moveSearch}%`),
          ilike(trips.externalMoveId, `%${moveSearch}%`),
          ilike(trips.origin, `%${moveSearch}%`),
          ilike(trips.destination, `%${moveSearch}%`),
        )!,
      );
    }
    if (filters.status) conditions.push(eq(trips.status, filters.status));
    if (filters.moveType) conditions.push(ilike(trips.moveType, `%${filters.moveType}%`));
    if (filters.sourceSystem) conditions.push(eq(trips.sourceSystem, filters.sourceSystem));
    if (filters.importBatchId) conditions.push(eq(trips.importBatchId, filters.importBatchId));
    if (filters.startDate) {
      const startTs = new Date(filters.startDate);
      startTs.setHours(0, 0, 0, 0);
      conditions.push(gte(trips.tripDate, startTs));
    }
    if (filters.endDate) {
      const endTs = new Date(filters.endDate);
      endTs.setHours(23, 59, 59, 999);
      conditions.push(lte(trips.tripDate, endTs));
    }
    if (filters.driver) {
      conditions.push(
        or(
          ilike(users.firstName, `%${filters.driver}%`),
          ilike(users.lastName, `%${filters.driver}%`),
          sql`lower(${users.firstName} || ' ' || ${users.lastName}) like lower(${'%' + filters.driver + '%'})`
        )!
      );
    }
    if (filters.customer) conditions.push(ilike(customers.customerName, `%${filters.customer}%`));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // DR count subquery
    const drCounts = db
      .select({
        linkedTripId: driverReturnEntries.linkedTripId,
        drCount: sql<number>`cast(count(*) as int)`.as('dr_count'),
      })
      .from(driverReturnEntries)
      .where(isNotNull(driverReturnEntries.linkedTripId))
      .groupBy(driverReturnEntries.linkedTripId)
      .as('dr_counts');

    // Count query
    const countQuery = db
      .select({ total: sql<number>`cast(count(*) as int)` })
      .from(trips)
      .leftJoin(drivers, eq(trips.driverId, drivers.id))
      .leftJoin(users, eq(drivers.userId, users.id))
      .leftJoin(customers, eq(trips.customerId, customers.id));
    const [{ total }] = whereClause
      ? await countQuery.where(whereClause)
      : await countQuery;

    // Sort
    const dir = filters.sortDir === 'asc' ? asc : desc;
    const exactMoveMatchOrder = moveSearch
      ? sql<number>`
          CASE
            WHEN ${trips.id} = ${moveSearch}
              OR ${trips.moveNumber} = ${moveSearch}
              OR ${trips.externalMoveId} = ${moveSearch}
            THEN 0
            ELSE 1
          END
        `
      : undefined;
    let orderExpr: any;
    switch (filters.sortBy) {
      case 'moveNumber': orderExpr = dir(trips.moveNumber); break;
      case 'status': orderExpr = dir(trips.status); break;
      case 'moveType': orderExpr = dir(trips.moveType); break;
      case 'customerName': orderExpr = dir(customers.customerName); break;
      case 'driverName': orderExpr = dir(users.lastName); break;
      default: orderExpr = dir(trips.tripDate); break;
    }

    // Data query
    const dataQuery = db
      .select({
        trip: trips,
        driverFirstName: users.firstName,
        driverLastName: users.lastName,
        customerName: customers.customerName,
        drCount: drCounts.drCount,
      })
      .from(trips)
      .leftJoin(drivers, eq(trips.driverId, drivers.id))
      .leftJoin(users, eq(drivers.userId, users.id))
      .leftJoin(customers, eq(trips.customerId, customers.id))
      .leftJoin(drCounts, eq(trips.id, drCounts.linkedTripId));

    const rows = whereClause
      ? await dataQuery
          .where(whereClause)
          .orderBy(...(exactMoveMatchOrder ? [exactMoveMatchOrder, orderExpr] : [orderExpr]))
          .limit(limit)
          .offset(offset)
      : await dataQuery.orderBy(orderExpr).limit(limit).offset(offset);

    return {
      trips: rows.map((r) => ({
        ...r.trip,
        driverName: [r.driverFirstName, r.driverLastName].filter(Boolean).join(' ') || null,
        customerName: r.customerName || null,
        driverReturnCount: r.drCount ?? 0,
      })),
      total: Number(total),
    };
  }

  async getTripsStats(): Promise<{
    totalToday: number;
    completedToday: number;
    activeNow: number;
    exceptions: number;
    thisWeek: number;
  }> {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    const dow = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1));
    monday.setHours(0, 0, 0, 0);

    const [[todayRow], [completedRow], [activeRow], [exceptRow], [weekRow]] = await Promise.all([
      db.select({ c: sql<number>`cast(count(*) as int)` }).from(trips)
        .where(and(gte(trips.tripDate, todayStart), lte(trips.tripDate, todayEnd))),
      db.select({ c: sql<number>`cast(count(*) as int)` }).from(trips)
        .where(and(gte(trips.tripDate, todayStart), lte(trips.tripDate, todayEnd), eq(trips.status, 'completed'))),
      db.select({ c: sql<number>`cast(count(*) as int)` }).from(trips)
        .where(eq(trips.status, 'in-progress')),
      db.select({ c: sql<number>`cast(count(*) as int)` }).from(trips)
        .where(and(isNotNull(trips.eligibilityStatus), sql`${trips.eligibilityStatus} != 'eligible'`)),
      db.select({ c: sql<number>`cast(count(*) as int)` }).from(trips)
        .where(gte(trips.tripDate, monday)),
    ]);

    return {
      totalToday: Number(todayRow?.c ?? 0),
      completedToday: Number(completedRow?.c ?? 0),
      activeNow: Number(activeRow?.c ?? 0),
      exceptions: Number(exceptRow?.c ?? 0),
      thisWeek: Number(weekRow?.c ?? 0),
    };
  }

  async createTrip(tripData: InsertTrip): Promise<Trip> {
    const [trip] = await db.insert(trips).values({
      ...tripData,
      moveType: normalizeMoveType(tripData.moveType),
    }).returning();
    return trip;
  }

  async getAllTrips(filters?: {
    moveNumber?: string;
    driver?: string;
    customer?: string;
    startDate?: string;
    endDate?: string;
    importBatchId?: string;
  }): Promise<any[]> {
    let query = db
      .select({
        trip: trips,
        driver: drivers,
        driverUser: users,
        customer: customers,
      })
      .from(trips)
      .leftJoin(drivers, eq(trips.driverId, drivers.id))
      .leftJoin(users, eq(drivers.userId, users.id))
      .leftJoin(customers, eq(trips.customerId, customers.id))
      .$dynamic();

    const conditions = [];

    if (filters?.moveNumber) {
      conditions.push(ilike(trips.moveNumber, `%${filters.moveNumber}%`));
    }

    if (filters?.driver) {
      conditions.push(
        or(
          ilike(users.firstName, `%${filters.driver}%`),
          ilike(users.lastName, `%${filters.driver}%`),
          ilike(sql`${users.firstName} || ' ' || ${users.lastName}`, `%${filters.driver}%`)
        )!
      );
    }

    if (filters?.customer) {
      conditions.push(ilike(customers.customerName, `%${filters.customer}%`));
    }

    if (filters?.startDate) {
      conditions.push(gte(trips.tripDate, new Date(filters.startDate)));
    }

    if (filters?.endDate) {
      const endDate = new Date(filters.endDate);
      endDate.setHours(23, 59, 59, 999);
      conditions.push(lte(trips.tripDate, endDate));
    }

    if (filters?.importBatchId) {
      conditions.push(eq(trips.importBatchId, filters.importBatchId));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)!);
    }

    const results = await query.orderBy(desc(trips.tripDate));

    return results.map((r) => ({
      ...r.trip,
      driverName: r.driverUser ? `${r.driverUser.firstName || ''} ${r.driverUser.lastName || ''}`.trim() : null,
      customerName: r.customer?.customerName || null,
    }));
  }

  async getTrip(id: string): Promise<Trip | undefined> {
    const [trip] = await db.select().from(trips).where(eq(trips.id, id));
    return trip;
  }

  async updateTrip(id: string, tripData: Partial<InsertTrip>): Promise<Trip | undefined> {
    const cleanData = Object.fromEntries(
      Object.entries(tripData).filter(([_, v]) => v !== undefined)
    );

    if ("moveType" in cleanData) {
      cleanData.moveType = normalizeMoveType(cleanData.moveType);
    }

    if (Object.keys(cleanData).length === 0) {
      return this.getTrip(id);
    }

    const [trip] = await db
      .update(trips)
      .set({ ...cleanData, updatedAt: new Date() })
      .where(eq(trips.id, id))
      .returning();
    return trip;
  }

  // Update trip eligibility snapshot (INCREMENT 25B - immutable after initial set)
  async updateTripEligibility(id: string, eligibilityData: {
    eligibilityStatus: string;
    eligibilityReasons: string[];
    eligibilityCheckedAt: Date;
    eligibilityPolicyVersionId: string;
    marketId?: string;
    zoneId?: string;
    workType?: string;
    executionMode?: string;
  }): Promise<Trip | undefined> {
    const [trip] = await db
      .update(trips)
      .set({
        eligibilityStatus: eligibilityData.eligibilityStatus,
        eligibilityReasons: eligibilityData.eligibilityReasons,
        eligibilityCheckedAt: eligibilityData.eligibilityCheckedAt,
        eligibilityPolicyVersionId: eligibilityData.eligibilityPolicyVersionId,
        marketId: eligibilityData.marketId || null,
        zoneId: eligibilityData.zoneId || null,
        workType: eligibilityData.workType || null,
        executionMode: eligibilityData.executionMode || null,
        updatedAt: new Date(),
      })
      .where(eq(trips.id, id))
      .returning();
    return trip;
  }

  // Get trips by eligibility status for payroll filtering
  async getTripsByPayPeriodWithEligibility(payPeriodStart: Date, payPeriodEnd: Date): Promise<Trip[]> {
    // Ensure end date includes the entire last day (up to 23:59:59.999)
    const adjustedEndDate = new Date(payPeriodEnd);
    adjustedEndDate.setHours(23, 59, 59, 999);
    
    return db
      .select()
      .from(trips)
      .where(
        and(
          gte(trips.tripDate, payPeriodStart),
          lte(trips.tripDate, adjustedEndDate)
        )!
      )
      .orderBy(trips.tripDate);
  }

  // Get trips without eligibility snapshots for backfill
  async getTripsWithoutEligibility(): Promise<Trip[]> {
    return db
      .select()
      .from(trips)
      .where(isNull(trips.eligibilityStatus))
      .orderBy(trips.tripDate);
  }

  // Policy Version operations
  async getActivePolicyVersion(): Promise<PolicyVersion | undefined> {
    const [result] = await db
      .select()
      .from(policyVersions)
      .where(eq(policyVersions.isActive, true))
      .limit(1);
    return result;
  }

  async createPolicyVersion(data: InsertPolicyVersion): Promise<PolicyVersion> {
    const [result] = await db.insert(policyVersions).values(data).returning();
    return result;
  }

  async deactivateAllPolicyVersions(): Promise<void> {
    await db.update(policyVersions).set({ isActive: false });
  }

  async getPolicyVersion(id: string): Promise<PolicyVersion | undefined> {
    const [result] = await db.select().from(policyVersions).where(eq(policyVersions.id, id));
    return result;
  }

  // Expense operations
  async createExpenses(expensesList: InsertExpense[]): Promise<Expense[]> {
    if (expensesList.length === 0) {
      return [];
    }
    // Normalize dates to strings for database insertion
    const normalizedList = expensesList.map(exp => ({
      ...exp,
      expenseDate: typeof exp.expenseDate === 'string' ? exp.expenseDate : exp.expenseDate.toISOString().split('T')[0],
    }));
    const createdExpenses = await db.insert(expenses).values(normalizedList as any).returning();
    return createdExpenses;
  }

  async getExpensesByDriverId(driverId: string): Promise<Expense[]> {
    return db
      .select()
      .from(expenses)
      .where(eq(expenses.driverId, driverId))
      .orderBy(desc(expenses.expenseDate));
  }

  async getExpensesByEmployeeId(employeeId: string): Promise<Expense[]> {
    return db
      .select()
      .from(expenses)
      .where(eq(expenses.employeeId, employeeId))
      .orderBy(desc(expenses.expenseDate));
  }

  async getExpensesByType(expenseType: 'driver' | 'employee'): Promise<Expense[]> {
    return db
      .select()
      .from(expenses)
      .where(eq(expenses.expenseType, expenseType))
      .orderBy(desc(expenses.expenseDate));
  }

  async getExpensesBySubmitter(userId: string): Promise<Expense[]> {
    return db
      .select()
      .from(expenses)
      .where(eq(expenses.submittedBy, userId))
      .orderBy(desc(expenses.expenseDate));
  }

  async getDraftExpensesByUser(userId: string): Promise<Expense[]> {
    return db
      .select()
      .from(expenses)
      .where(
        and(
          eq(expenses.submittedBy, userId),
          eq(expenses.status, 'draft')
        )
      )
      .orderBy(desc(expenses.createdAt));
  }

  async getAllExpenses(filters?: { expenseType?: 'driver' | 'employee'; status?: string; startDate?: string; endDate?: string }): Promise<Expense[]> {
    const conditions = [];
    
    if (filters?.expenseType) {
      conditions.push(eq(expenses.expenseType, filters.expenseType));
    }
    if (filters?.status) {
      conditions.push(eq(expenses.status, filters.status));
    }
    if (filters?.startDate) {
      conditions.push(gte(expenses.expenseDate, filters.startDate));
    }
    if (filters?.endDate) {
      conditions.push(lte(expenses.expenseDate, filters.endDate));
    }

    if (conditions.length === 0) {
      return db
        .select()
        .from(expenses)
        .orderBy(desc(expenses.createdAt));
    }

    return db
      .select()
      .from(expenses)
      .where(and(...conditions))
      .orderBy(desc(expenses.createdAt));
  }

  async updateExpenseStatus(id: string, status: string, approvedBy?: string): Promise<Expense | undefined> {
    const updateData: any = {
      status,
      updatedAt: new Date(),
    };

    if (status === 'approved' && approvedBy) {
      updateData.approvedBy = approvedBy;
      updateData.approvalDate = new Date();
    }

    const [expense] = await db
      .update(expenses)
      .set(updateData)
      .where(eq(expenses.id, id))
      .returning();
    return expense;
  }

  async createExpense(expenseData: InsertExpense): Promise<Expense> {
    // Normalize date to string for database insertion
    const normalizedData = {
      ...expenseData,
      expenseDate: typeof expenseData.expenseDate === 'string' ? expenseData.expenseDate : expenseData.expenseDate.toISOString().split('T')[0],
    };
    const [expense] = await db.insert(expenses).values(normalizedData as any).returning();
    return expense;
  }

  async getExpense(id: string): Promise<Expense | undefined> {
    const [expense] = await db
      .select()
      .from(expenses)
      .where(eq(expenses.id, id));
    return expense;
  }

  async deleteExpense(id: string): Promise<void> {
    await db.delete(expenses).where(eq(expenses.id, id));
  }

  async updateExpense(id: string, data: Partial<InsertExpense>): Promise<Expense | undefined> {
    const updateData: any = {
      ...data,
      updatedAt: new Date(),
    };
    if (data.expenseDate && typeof data.expenseDate !== 'string') {
      updateData.expenseDate = data.expenseDate.toISOString().split('T')[0];
    }
    const [expense] = await db
      .update(expenses)
      .set(updateData)
      .where(eq(expenses.id, id))
      .returning();
    return expense;
  }

  // Expense approval workflow operations
  async createExpenseApproval(approvalData: InsertExpenseApproval): Promise<ExpenseApproval> {
    const [approval] = await db.insert(expenseApprovals).values(approvalData).returning();
    return approval;
  }

  async getExpenseApprovalsByExpenseId(expenseId: string): Promise<ExpenseApproval[]> {
    return db
      .select()
      .from(expenseApprovals)
      .where(eq(expenseApprovals.expenseId, expenseId))
      .orderBy(expenseApprovals.level);
  }

  async getExpensesPendingApprovalByUser(userId: string): Promise<Expense[]> {
    // Get expenses where there's a pending approval for this user
    const pendingApprovals = await db
      .select()
      .from(expenseApprovals)
      .where(
        and(
          eq(expenseApprovals.approverUserId, userId),
          eq(expenseApprovals.status, 'pending')
        )
      );

    if (pendingApprovals.length === 0) {
      return [];
    }

    const expenseIds = pendingApprovals.map(a => a.expenseId);
    const pendingExpenses = await db
      .select()
      .from(expenses)
      .where(
        and(
          sql`${expenses.id} = ANY(${expenseIds})`,
          eq(expenses.status, 'pending')
        )
      )
      .orderBy(desc(expenses.createdAt));

    return pendingExpenses;
  }

  async approveExpense(expenseId: string, approvalId: string, userId: string, notes?: string): Promise<ExpenseApproval | undefined> {
    const [approval] = await db
      .update(expenseApprovals)
      .set({
        status: 'approved',
        decidedAt: new Date(),
        decidedByUserId: userId,
        notes: notes || null,
      })
      .where(eq(expenseApprovals.id, approvalId))
      .returning();
    return approval;
  }

  async rejectExpense(expenseId: string, approvalId: string, userId: string, notes?: string): Promise<ExpenseApproval | undefined> {
    // Reject the approval record
    const [approval] = await db
      .update(expenseApprovals)
      .set({
        status: 'rejected',
        decidedAt: new Date(),
        decidedByUserId: userId,
        notes: notes || null,
      })
      .where(eq(expenseApprovals.id, approvalId))
      .returning();

    // Also update expense status to rejected
    await db
      .update(expenses)
      .set({
        status: 'rejected',
        updatedAt: new Date(),
      })
      .where(eq(expenses.id, expenseId));

    return approval;
  }

  async advanceExpenseToNextStage(expenseId: string): Promise<Expense | undefined> {
    const expense = await this.getExpense(expenseId);
    if (!expense) return undefined;

    const currentLevel = expense.approvalLevel || 1;
    const totalLevels = expense.totalApprovalLevels || 2;
    const nextLevel = currentLevel + 1;

    // Determine next stage based on current stage
    let nextStage: string;
    if (expense.currentApprovalStage === 'manager') {
      nextStage = 'coo';
    } else if (expense.currentApprovalStage === 'coo') {
      nextStage = expense.expenseType === 'employee' ? 'executive' : 'completed';
    } else if (expense.currentApprovalStage === 'executive') {
      nextStage = 'completed';
    } else {
      nextStage = 'completed';
    }

    const updateData: any = {
      currentApprovalStage: nextStage,
      approvalLevel: nextLevel,
      updatedAt: new Date(),
    };

    // If completed, set final status
    if (nextStage === 'completed') {
      updateData.status = expense.expenseType === 'employee' ? 'approved' : 'approved';
    }

    const [updated] = await db
      .update(expenses)
      .set(updateData)
      .where(eq(expenses.id, expenseId))
      .returning();

    return updated;
  }

  async getCOOEmployee(): Promise<Employee | undefined> {
    const [coo] = await db
      .select()
      .from(employees)
      .where(ilike(employees.title, '%Chief Operating Officer%'))
      .limit(1);
    return coo;
  }

  async getWillWaltonEmployee(): Promise<Employee | undefined> {
    // Look for Will Walton by name or email
    const [employee] = await db
      .select()
      .from(employees)
      .where(
        or(
          ilike(employees.firstName, '%Will%'),
          ilike(employees.lastName, '%Walton%'),
          ilike(employees.workEmail, '%will%walton%')
        )
      )
      .limit(1);
    return employee;
  }

  async createAmrDeclineNotification(data: {
    ticketId: string;
    amrNumber: string;
    amrTitle: string;
    submittedByName: string | null;
    declinedByUserId: string;
    declinedByName: string;
    declineComment: string | null;
  }): Promise<void> {
    await db.insert(amrDeclineNotifications).values({
      ticketId: data.ticketId,
      amrNumber: data.amrNumber,
      amrTitle: data.amrTitle,
      submittedByName: data.submittedByName,
      declinedByUserId: data.declinedByUserId,
      declinedByName: data.declinedByName,
      declineComment: data.declineComment,
    });
  }

  async getActiveAmrDeclineNotifications(): Promise<any[]> {
    return db.select()
      .from(amrDeclineNotifications)
      .where(isNull(amrDeclineNotifications.clearedAt))
      .orderBy(desc(amrDeclineNotifications.declinedAt));
  }

  async clearAmrDeclineNotificationsForTicket(ticketId: string, clearedByName: string): Promise<void> {
    await db.update(amrDeclineNotifications)
      .set({ clearedAt: new Date(), clearedByName })
      .where(and(
        eq(amrDeclineNotifications.ticketId, ticketId),
        isNull(amrDeclineNotifications.clearedAt)
      ));
  }

  // ── Recruiting Approval Settings ──────────────────────────────────────────

  async getRecruitingApprovalSettings(orgId: string): Promise<any> {
    const { recruitingApprovalSettings } = await import("@shared/schema");
    const [row] = await db
      .select()
      .from(recruitingApprovalSettings)
      .where(eq(recruitingApprovalSettings.orgId, orgId))
      .limit(1);
    return row ?? null;
  }

  async upsertRecruitingApprovalSettings(orgId: string, data: any, changedBy: string, changedByName: string): Promise<any> {
    const { recruitingApprovalSettings, recruitingApprovalSettingsAudit } = await import("@shared/schema");

    // Fetch previous for audit trail
    const [prev] = await db
      .select()
      .from(recruitingApprovalSettings)
      .where(eq(recruitingApprovalSettings.orgId, orgId))
      .limit(1);

    const payload = {
      orgId,
      primaryApproverUserId: data.primaryApproverUserId ?? null,
      primaryApproverName:   data.primaryApproverName   ?? null,
      backupApproverUserId:  data.backupApproverUserId  ?? null,
      backupApproverName:    data.backupApproverName    ?? null,
      delegationEnabled:     data.delegationEnabled     ?? false,
      delegationStartDate:   data.delegationStartDate   ?? null,
      delegationEndDate:     data.delegationEndDate     ?? null,
      delegationReason:      data.delegationReason      ?? null,
      lastUpdatedBy:         changedBy,
      lastUpdatedByName:     changedByName,
      updatedAt:             new Date(),
    };

    let result: any;
    if (prev) {
      const [updated] = await db
        .update(recruitingApprovalSettings)
        .set(payload)
        .where(eq(recruitingApprovalSettings.orgId, orgId))
        .returning();
      result = updated;
    } else {
      const [inserted] = await db
        .insert(recruitingApprovalSettings)
        .values(payload)
        .returning();
      result = inserted;
    }

    // Determine change type
    let changeType = "settings_update";
    if (!prev?.delegationEnabled && data.delegationEnabled) changeType = "delegation_enabled";
    else if (prev?.delegationEnabled && !data.delegationEnabled) changeType = "delegation_disabled";

    await db.insert(recruitingApprovalSettingsAudit).values({
      orgId,
      changedBy,
      changedByName,
      changeType,
      previousValues: prev
        ? {
            primaryApproverUserId: prev.primaryApproverUserId,
            primaryApproverName:   prev.primaryApproverName,
            backupApproverUserId:  prev.backupApproverUserId,
            backupApproverName:    prev.backupApproverName,
            delegationEnabled:     prev.delegationEnabled,
            delegationStartDate:   prev.delegationStartDate,
            delegationEndDate:     prev.delegationEndDate,
            delegationReason:      prev.delegationReason,
          }
        : null,
      newValues: {
        primaryApproverUserId: payload.primaryApproverUserId,
        primaryApproverName:   payload.primaryApproverName,
        backupApproverUserId:  payload.backupApproverUserId,
        backupApproverName:    payload.backupApproverName,
        delegationEnabled:     payload.delegationEnabled,
        delegationStartDate:   payload.delegationStartDate,
        delegationEndDate:     payload.delegationEndDate,
        delegationReason:      payload.delegationReason,
      },
    });

    return result;
  }

  async getRecruitingApprovalSettingsAudit(orgId: string, limit = 50): Promise<any[]> {
    const { recruitingApprovalSettingsAudit } = await import("@shared/schema");
    return db
      .select()
      .from(recruitingApprovalSettingsAudit)
      .where(eq(recruitingApprovalSettingsAudit.orgId, orgId))
      .orderBy(desc(recruitingApprovalSettingsAudit.createdAt))
      .limit(limit);
  }

  async getActiveRecruitingApprover(orgId: string): Promise<{ userId: string | null; name: string | null; isDelegate: boolean }> {
    const settings = await this.getRecruitingApprovalSettings(orgId);
    if (!settings) {
      return { userId: null, name: null, isDelegate: false };
    }
    // Check if delegation is active
    if (settings.delegationEnabled && settings.delegationStartDate && settings.delegationEndDate) {
      const today = new Date().toISOString().slice(0, 10);
      if (today >= settings.delegationStartDate && today <= settings.delegationEndDate) {
        return {
          userId: settings.backupApproverUserId,
          name:   settings.backupApproverName,
          isDelegate: true,
        };
      }
    }
    return {
      userId: settings.primaryApproverUserId,
      name:   settings.primaryApproverName,
      isDelegate: false,
    };
  }

  // Billing Entity operations
  async getAllBillingEntities(): Promise<BillingEntity[]> {
    return db
      .select()
      .from(billingEntities)
      .orderBy(billingEntities.legalName);
  }

  async getBillingEntity(id: string): Promise<BillingEntity | undefined> {
    const [entity] = await db
      .select()
      .from(billingEntities)
      .where(eq(billingEntities.id, id));
    return entity;
  }

  async getBillingEntityByCode(code: string): Promise<BillingEntity | undefined> {
    const [entity] = await db
      .select()
      .from(billingEntities)
      .where(eq(billingEntities.entityCode, code));
    return entity;
  }

  async getDefaultBillingEntity(): Promise<BillingEntity | undefined> {
    const [entity] = await db
      .select()
      .from(billingEntities)
      .where(eq(billingEntities.isDefault, true))
      .limit(1);
    return entity;
  }

  async createBillingEntity(entity: InsertBillingEntity): Promise<BillingEntity> {
    const [created] = await db.insert(billingEntities).values(entity).returning();
    return created;
  }

  async updateBillingEntity(id: string, updates: Partial<InsertBillingEntity>): Promise<BillingEntity | undefined> {
    const [updated] = await db
      .update(billingEntities)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(billingEntities.id, id))
      .returning();
    return updated;
  }

  async deleteBillingEntity(id: string): Promise<void> {
    await db.delete(billingEntities).where(eq(billingEntities.id, id));
  }

  async generateInvoiceNumberForEntity(entityId: string): Promise<string> {
    const entity = await this.getBillingEntity(entityId);
    if (!entity) {
      return this.generateInvoiceNumber();
    }

    const year = new Date().getFullYear();
    const prefix = entity.invoicePrefix || 'INV';
    const format = entity.invoiceNumberFormat || '{PREFIX}-{YEAR}-{SEQ:5}';
    const nextNumber = entity.invoiceNextNumber || 1;

    await db
      .update(billingEntities)
      .set({ invoiceNextNumber: nextNumber + 1, updatedAt: new Date() })
      .where(eq(billingEntities.id, entityId));

    let invoiceNumber = format
      .replace('{PREFIX}', prefix)
      .replace('{YEAR}', String(year))
      .replace(/{SEQ:(\d+)}/g, (_, digits) => String(nextNumber).padStart(parseInt(digits), '0'));

    return invoiceNumber;
  }

  async logBillingEntityAction(data: InsertBillingEntityAuditLog): Promise<void> {
    await db.insert(billingEntityAuditLog).values(data);
  }

  async getBillingEntityAuditLog(entityId?: string): Promise<BillingEntityAuditLog[]> {
    if (entityId) {
      return db
        .select()
        .from(billingEntityAuditLog)
        .where(eq(billingEntityAuditLog.billingEntityId, entityId))
        .orderBy(desc(billingEntityAuditLog.performedAt));
    }
    return db
      .select()
      .from(billingEntityAuditLog)
      .orderBy(desc(billingEntityAuditLog.performedAt));
  }

  // Invoicing Permissions operations
  async getUserInvoicingPermissions(userId: string): Promise<UserInvoicingPermission[]> {
    return db
      .select()
      .from(userInvoicingPermissions)
      .where(eq(userInvoicingPermissions.userId, userId))
      .orderBy(desc(userInvoicingPermissions.grantedAt));
  }

  async grantInvoicingPermission(data: InsertUserInvoicingPermission): Promise<UserInvoicingPermission> {
    const [permission] = await db.insert(userInvoicingPermissions).values(data).returning();
    return permission;
  }

  async revokeInvoicingPermission(permissionId: string): Promise<void> {
    await db.delete(userInvoicingPermissions).where(eq(userInvoicingPermissions.id, permissionId));
  }

  async logInvoicingAction(data: InsertInvoicingActionAuditLog): Promise<void> {
    await db.insert(invoicingActionAuditLog).values(data);
  }

  async getInvoicingAuditLog(filters?: { userId?: string; action?: string; resourceType?: string; resourceId?: string; limit?: number }): Promise<InvoicingActionAuditLog[]> {
    let query = db.select().from(invoicingActionAuditLog);
    const conditions = [];
    if (filters?.userId) conditions.push(eq(invoicingActionAuditLog.userId, filters.userId));
    if (filters?.action) conditions.push(eq(invoicingActionAuditLog.action, filters.action));
    if (filters?.resourceType) conditions.push(eq(invoicingActionAuditLog.resourceType, filters.resourceType));
    if (filters?.resourceId) conditions.push(eq(invoicingActionAuditLog.resourceId, filters.resourceId));
    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }
    query = query.orderBy(desc(invoicingActionAuditLog.performedAt)) as any;
    if (filters?.limit) {
      query = query.limit(filters.limit) as any;
    }
    return query;
  }

  async getMfaSsoSettings(orgId?: string): Promise<MfaSsoSettings | undefined> {
    const [settings] = orgId 
      ? await db.select().from(mfaSsoSettings).where(eq(mfaSsoSettings.orgId, orgId)).limit(1)
      : await db.select().from(mfaSsoSettings).limit(1);
    return settings;
  }

  async updateMfaSsoSettings(id: string, data: Partial<InsertMfaSsoSettings>): Promise<MfaSsoSettings | undefined> {
    const [updated] = await db
      .update(mfaSsoSettings)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(mfaSsoSettings.id, id))
      .returning();
    return updated;
  }

  // Billing Location operations
  async getAllBillingLocations(entityId?: string): Promise<BillingLocation[]> {
    if (entityId) {
      return db
        .select()
        .from(billingLocations)
        .where(eq(billingLocations.billingEntityId, entityId))
        .orderBy(billingLocations.locationName);
    }
    return db
      .select()
      .from(billingLocations)
      .orderBy(billingLocations.locationName);
  }

  async getBillingLocation(id: string): Promise<BillingLocation | undefined> {
    const [location] = await db
      .select()
      .from(billingLocations)
      .where(eq(billingLocations.id, id));
    return location;
  }

  async createBillingLocation(location: InsertBillingLocation): Promise<BillingLocation> {
    const [created] = await db.insert(billingLocations).values(location).returning();
    return created;
  }

  async updateBillingLocation(id: string, updates: Partial<InsertBillingLocation>): Promise<BillingLocation | undefined> {
    const [updated] = await db
      .update(billingLocations)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(billingLocations.id, id))
      .returning();
    return updated;
  }

  async deleteBillingLocation(id: string): Promise<void> {
    await db.delete(billingLocations).where(eq(billingLocations.id, id));
  }

  // Invoice operations
  async createInvoice(invoiceData: InsertInvoice): Promise<Invoice> {
    const [invoice] = await db.insert(invoices).values(invoiceData).returning();
    return invoice;
  }

  async getAllInvoices(filters?: InvoiceSearchFilters): Promise<Invoice[]> {
    let query = db.select().from(invoices);
    
    const conditions: any[] = [];
    
    if (filters?.billingEntityId) {
      conditions.push(eq(invoices.billingEntityId, filters.billingEntityId));
    }
    if (filters?.locationId) {
      conditions.push(eq(invoices.locationId, filters.locationId));
    }
    if (filters?.customerId) {
      conditions.push(eq(invoices.customerId, filters.customerId));
    }
    if (filters?.status) {
      conditions.push(eq(invoices.status, filters.status));
    }
    if (filters?.statuses && filters.statuses.length > 0) {
      conditions.push(inArray(invoices.status, filters.statuses));
    }
    if (filters?.searchQuery) {
      const q = `%${filters.searchQuery}%`;
      conditions.push(or(
        ilike(invoices.invoiceNumber, q),
        ilike(invoices.customerName, q),
        ilike(sql`CAST(${invoices.totalAmount} AS TEXT)`, q),
      ));
    }
    if (filters?.amountMin !== undefined) {
      conditions.push(gte(invoices.totalAmount, String(filters.amountMin)));
    }
    if (filters?.amountMax !== undefined) {
      conditions.push(lte(invoices.totalAmount, String(filters.amountMax)));
    }
    const dateCol = filters?.dateField === 'dueDate' ? invoices.dueDate : invoices.invoiceDate;
    if (filters?.dateStart) {
      conditions.push(gte(dateCol, filters.dateStart));
    }
    if (filters?.dateEnd) {
      conditions.push(lte(dateCol, filters.dateEnd));
    }
    if (filters?.agingBucket) {
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];
      const paidStatuses = ['paid', 'voided', 'written_off', 'draft'];
      const notPaid = paidStatuses.map(s => sql`${invoices.status} != ${s}`);
      if (filters.agingBucket === 'current') {
        conditions.push(gte(invoices.dueDate, todayStr));
        conditions.push(and(...notPaid));
      } else if (filters.agingBucket === '1-30') {
        const d30 = new Date(today); d30.setDate(d30.getDate() - 30);
        conditions.push(lt(invoices.dueDate, todayStr));
        conditions.push(gte(invoices.dueDate, d30.toISOString().split('T')[0]));
        conditions.push(and(...notPaid));
      } else if (filters.agingBucket === '31-60') {
        const d31 = new Date(today); d31.setDate(d31.getDate() - 31);
        const d60 = new Date(today); d60.setDate(d60.getDate() - 60);
        conditions.push(lte(invoices.dueDate, d31.toISOString().split('T')[0]));
        conditions.push(gte(invoices.dueDate, d60.toISOString().split('T')[0]));
        conditions.push(and(...notPaid));
      } else if (filters.agingBucket === '61-90') {
        const d61 = new Date(today); d61.setDate(d61.getDate() - 61);
        const d90 = new Date(today); d90.setDate(d90.getDate() - 90);
        conditions.push(lte(invoices.dueDate, d61.toISOString().split('T')[0]));
        conditions.push(gte(invoices.dueDate, d90.toISOString().split('T')[0]));
        conditions.push(and(...notPaid));
      } else if (filters.agingBucket === '90+') {
        const d90 = new Date(today); d90.setDate(d90.getDate() - 90);
        conditions.push(lt(invoices.dueDate, d90.toISOString().split('T')[0]));
        conditions.push(and(...notPaid));
      }
    }
    if (filters?.collectionsTier) {
      if (filters.collectionsTier === 'escalated') {
        conditions.push(eq(invoices.escalationRequired, true));
      } else if (filters.collectionsTier === 'assigned') {
        conditions.push(isNotNull(invoices.collectionsOwnerId));
      } else if (filters.collectionsTier === 'unassigned') {
        conditions.push(isNull(invoices.collectionsOwnerId));
        const today = new Date().toISOString().split('T')[0];
        conditions.push(lt(invoices.dueDate, today));
        const notPaid2 = ['paid', 'voided', 'written_off', 'draft'];
        conditions.push(sql`${invoices.status} NOT IN (${sql.join(notPaid2.map(s => sql`${s}`), sql`, `)})`);
      }
    }
    if (!filters?.includeConsolidated) {
      conditions.push(or(isNull(invoices.consolidatedIntoId), eq(invoices.consolidatedIntoId, '')));
    }
    
    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }
    
    return query.orderBy(desc(invoices.createdAt));
  }

  async getInvoiceSavedViews(userId: string): Promise<InvoiceSavedView[]> {
    return db.select().from(invoiceSavedViews).where(
      and(
        eq(invoiceSavedViews.isActive, true),
        or(
          eq(invoiceSavedViews.createdBy, userId),
          eq(invoiceSavedViews.type, 'shared'),
          eq(invoiceSavedViews.type, 'system'),
        ),
      )
    ).orderBy(asc(invoiceSavedViews.displayOrder), desc(invoiceSavedViews.createdAt));
  }

  async getInvoiceSavedView(id: string): Promise<InvoiceSavedView | undefined> {
    const [view] = await db.select().from(invoiceSavedViews).where(eq(invoiceSavedViews.id, id));
    return view;
  }

  async createInvoiceSavedView(view: InsertInvoiceSavedView): Promise<InvoiceSavedView> {
    const [created] = await db.insert(invoiceSavedViews).values(view).returning();
    return created;
  }

  async updateInvoiceSavedView(id: string, updates: Partial<InsertInvoiceSavedView>): Promise<InvoiceSavedView | undefined> {
    const [updated] = await db.update(invoiceSavedViews)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(invoiceSavedViews.id, id))
      .returning();
    return updated;
  }

  async deleteInvoiceSavedView(id: string): Promise<void> {
    await db.update(invoiceSavedViews)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(invoiceSavedViews.id, id));
  }

  // ==========================================
  // IDEMPOTENCY & RESILIENCE OPERATIONS
  // ==========================================

  async getIdempotencyKey(scope: string, key: string): Promise<IdempotencyKey | undefined> {
    const [result] = await db.select()
      .from(idempotencyKeys)
      .where(and(
        eq(idempotencyKeys.scope, scope),
        eq(idempotencyKeys.key, key),
        gt(idempotencyKeys.expiresAt, new Date())
      ))
      .limit(1);
    return result;
  }

  async createIdempotencyKey(entry: InsertIdempotencyKey): Promise<IdempotencyKey> {
    const [result] = await db.insert(idempotencyKeys).values(entry).returning();
    return result;
  }

  async finalizeIdempotencyKey(scope: string, key: string, responseStatus: number, responseBody: any, entityId?: string): Promise<IdempotencyKey | undefined> {
    const updates: any = {
      status: responseStatus >= 200 && responseStatus < 300 ? 'completed' : 'failed',
      responseStatus,
      responseBody,
    };
    if (entityId) updates.entityId = entityId;
    const [result] = await db.update(idempotencyKeys)
      .set(updates)
      .where(and(
        eq(idempotencyKeys.scope, scope),
        eq(idempotencyKeys.key, key)
      ))
      .returning();
    return result;
  }

  async cleanupExpiredIdempotencyKeys(): Promise<number> {
    const result = await db.delete(idempotencyKeys)
      .where(lt(idempotencyKeys.expiresAt, new Date()));
    return (result as any).rowCount || 0;
  }

  async logResilienceEvent(entry: InsertResilienceLog): Promise<ResilienceLog> {
    const [result] = await db.insert(resilienceLog).values(entry).returning();
    return result;
  }

  async getResilienceLogs(filters?: { context?: string; entityType?: string; entityId?: string; status?: string }): Promise<ResilienceLog[]> {
    const conditions: any[] = [];
    if (filters?.context) conditions.push(eq(resilienceLog.context, filters.context));
    if (filters?.entityType) conditions.push(eq(resilienceLog.entityType, filters.entityType));
    if (filters?.entityId) conditions.push(eq(resilienceLog.entityId, filters.entityId));
    if (filters?.status) conditions.push(eq(resilienceLog.status, filters.status));
    let query = db.select().from(resilienceLog);
    if (conditions.length > 0) query = query.where(and(...conditions)) as any;
    return await query.orderBy(desc(resilienceLog.createdAt)).limit(100);
  }

  async getInvoice(id: string): Promise<Invoice | undefined> {
    const [invoice] = await db
      .select()
      .from(invoices)
      .where(eq(invoices.id, id));
    return invoice;
  }

  async updateInvoice(id: string, updates: Partial<InsertInvoice>): Promise<Invoice | undefined> {
    const [existing] = await db.select().from(invoices).where(eq(invoices.id, id));
    if (!existing) return undefined;

    const immutableStatuses = ['paid', 'void', 'written_off'];
    if (immutableStatuses.includes(existing.status || '')) {
      throw new Error(`Cannot edit invoice with status '${existing.status}'. Invoices in paid, void, or written-off status are locked.`);
    }

    const [invoice] = await db
      .update(invoices)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(invoices.id, id))
      .returning();
    return invoice;
  }

  async deleteInvoice(id: string): Promise<void> {
    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, id));
    if (!invoice) return;

    if (invoice.status !== 'draft') {
      throw new Error(`Cannot delete invoice with status '${invoice.status}'. Only draft invoices can be deleted.`);
    }

    const appliedPayments = await db.select({ id: paymentApplications.id })
      .from(paymentApplications)
      .where(eq(paymentApplications.invoiceId, id))
      .limit(1);
    if (appliedPayments.length > 0) {
      throw new Error('Cannot delete invoice with applied payments. Remove payment applications first.');
    }

    await db.delete(invoiceLineItems).where(eq(invoiceLineItems.invoiceId, id));
    await db.delete(invoices).where(eq(invoices.id, id));
  }

  // Driver note operations
  async getNotesByDriverId(driverId: string): Promise<DriverNoteWithAuthor[]> {
    const importerAlias = aliasedTable(users, 'importer_user');
    const results = await db
      .select()
      .from(driverNotes)
      .leftJoin(users, eq(driverNotes.corporateUserId, users.id))
      .leftJoin(importerAlias, eq(driverNotes.importedBy, importerAlias.id))
      .where(and(eq(driverNotes.driverId, driverId), isNull(driverNotes.deletedAt)))
      .orderBy(desc(driverNotes.createdAt));

    return results
      .filter((r) => r.users !== null)
      .map((r) => ({
        ...r.driver_notes,
        corporateUser: r.users!,
        importerUser: r.importer_user || null,
      }));
  }

  async createDriverNote(noteData: InsertDriverNote): Promise<DriverNote> {
    const [note] = await db.insert(driverNotes).values(noteData).returning();
    return note;
  }

  // Driver comment operations
  async getCommentsByDriverId(driverId: string): Promise<DriverCommentWithAuthor[]> {
    const results = await db
      .select()
      .from(driverComments)
      .leftJoin(users, eq(driverComments.authorId, users.id))
      .where(and(eq(driverComments.driverId, driverId), isNull(driverComments.deletedAt)))
      .orderBy(desc(driverComments.createdAt));

    return results
      .filter((r) => r.users !== null)
      .map((r) => ({
        ...r.driver_comments,
        author: r.users!,
      }));
  }

  async getComment(id: string): Promise<DriverComment | undefined> {
    const [comment] = await db
      .select()
      .from(driverComments)
      .where(eq(driverComments.id, id));
    return comment;
  }

  async createDriverComment(commentData: InsertDriverComment): Promise<DriverComment> {
    const [comment] = await db.insert(driverComments).values(commentData).returning();
    return comment;
  }

  async softDeleteDriverComment(id: string, userId: string, reason: string): Promise<void> {
    await db.update(driverComments)
      .set({ deletedAt: new Date(), deletedBy: userId, deletionReason: reason, updatedAt: new Date() })
      .where(and(eq(driverComments.id, id), isNull(driverComments.deletedAt)));
  }

  async deleteDriverComment(id: string): Promise<void> {
    // Policy: no hard deletes — soft-delete only (kept for interface compat)
    await db.update(driverComments)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(driverComments.id, id));
  }

  async getDriverNote(id: string): Promise<DriverNote | undefined> {
    const [note] = await db.select().from(driverNotes).where(eq(driverNotes.id, id));
    return note;
  }

  async softDeleteDriverNote(id: string, userId: string, reason: string): Promise<void> {
    await db.update(driverNotes)
      .set({ deletedAt: new Date(), deletedBy: userId, deletionReason: reason, updatedAt: new Date() })
      .where(and(eq(driverNotes.id, id), isNull(driverNotes.deletedAt)));
  }

  async editDriverNote(id: string, userId: string, newText: string, reason: string): Promise<DriverNote | undefined> {
    const [existing] = await db.select().from(driverNotes).where(eq(driverNotes.id, id));
    if (!existing || existing.deletedAt) return undefined;
    const [updated] = await db.update(driverNotes)
      .set({
        noteText: newText,
        editedAt: new Date(),
        editedBy: userId,
        editReason: reason,
        originalContent: existing.originalContent ?? existing.noteText,
        updatedAt: new Date(),
      })
      .where(eq(driverNotes.id, id))
      .returning();
    return updated;
  }

  // Driver document operations
  async getDriverResources(audience?: string): Promise<any[]> {
    const { driverResources } = await import('../shared/schema');
    const { eq, and, or, asc } = await import('drizzle-orm');
    let query = db.select().from(driverResources).orderBy(asc(driverResources.displayOrder), asc(driverResources.title));
    if (audience && audience !== 'All') {
      const results = await db.select().from(driverResources)
        .where(and(
          eq(driverResources.active, true),
          or(eq(driverResources.audience, 'All'), eq(driverResources.audience, audience))
        ))
        .orderBy(asc(driverResources.displayOrder), asc(driverResources.title));
      return results;
    }
    return await db.select().from(driverResources).where(eq(driverResources.active, true)).orderBy(asc(driverResources.displayOrder), asc(driverResources.title));
  }

  async getAllDriverResources(): Promise<any[]> {
    const { driverResources } = await import('../shared/schema');
    const { asc } = await import('drizzle-orm');
    return await db.select().from(driverResources).orderBy(asc(driverResources.displayOrder), asc(driverResources.title));
  }

  async createDriverResource(data: any): Promise<any> {
    const { driverResources } = await import('../shared/schema');
    const [row] = await db.insert(driverResources).values(data).returning();
    return row;
  }

  async updateDriverResource(id: string, data: any): Promise<any> {
    const { driverResources } = await import('../shared/schema');
    const { eq } = await import('drizzle-orm');
    const [row] = await db.update(driverResources).set({ ...data, updatedAt: new Date() }).where(eq(driverResources.id, id)).returning();
    return row;
  }

  async deactivateDriverResource(id: string): Promise<void> {
    const { driverResources } = await import('../shared/schema');
    const { eq } = await import('drizzle-orm');
    await db.update(driverResources).set({ active: false, updatedAt: new Date() }).where(eq(driverResources.id, id));
  }

  async getDocumentsByDriverId(driverId: string): Promise<DriverDocumentWithUploader[]> {
    const results = await db
      .select()
      .from(driverDocuments)
      .leftJoin(users, eq(driverDocuments.uploadedBy, users.id))
      .where(and(eq(driverDocuments.driverId, driverId), isNull(driverDocuments.deletedAt)))
      .orderBy(desc(driverDocuments.createdAt));

    return results
      .filter((r) => r.users !== null)
      .map((r) => ({
        ...r.driver_documents,
        uploader: r.users!,
      }));
  }

  async getDocument(id: string): Promise<DriverDocument | undefined> {
    const [document] = await db
      .select()
      .from(driverDocuments)
      .where(eq(driverDocuments.id, id));
    return document;
  }

  async createDocument(documentData: InsertDriverDocument): Promise<DriverDocument> {
    const [document] = await db.insert(driverDocuments).values(documentData).returning();
    return document;
  }

  async deleteDocument(id: string, userId?: string): Promise<void> {
    await db.update(driverDocuments).set({
      deletedAt: new Date(),
      deletedByUserId: userId || null,
      updatedAt: new Date(),
    }).where(eq(driverDocuments.id, id));
  }

  // Notification operations
  async getNotificationsByUserId(userId: string): Promise<Notification[]> {
    const notifs = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt));
    return notifs;
  }

  async createNotification(notificationData: InsertNotification): Promise<Notification> {
    const [notification] = await db.insert(notifications).values(notificationData).returning();
    return notification;
  }

  async markNotificationAsRead(id: string, userId: string): Promise<boolean> {
    const result = await db
      .update(notifications)
      .set({ isRead: true })
      .where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
      .returning();
    
    return result.length > 0;
  }

  async markAllNotificationsAsRead(userId: string): Promise<void> {
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.userId, userId));
  }

  // Analytics operations
  async getDriverStats(driverId: string): Promise<any> {
    // Get driver record for hireDate and lifetimeMoveCount
    const [driver] = await db
      .select()
      .from(drivers)
      .where(eq(drivers.id, driverId));

    const payRecordsData = await db
      .select()
      .from(payRecords)
      .where(eq(payRecords.driverId, driverId))
      .orderBy(desc(payRecords.payPeriodEnd));

    const tripsData = await db
      .select()
      .from(trips)
      .where(eq(trips.driverId, driverId));

    // Count accidents since hire date
    let accidentCountSinceHire = 0;
    if (driver) {
      const accidentConditions = [
        eq(safetyIncidents.driverId, driverId),
        eq(safetyIncidents.incidentType, 'accident')
      ];
      
      // If hire date exists, only count accidents after that date
      if (driver.hireDate) {
        accidentConditions.push(gte(safetyIncidents.incidentDate, driver.hireDate as string));
      }
      
      const accidents = await db
        .select()
        .from(safetyIncidents)
        .where(and(...accidentConditions));
      
      accidentCountSinceHire = accidents.length;
    }

    const totalGrossPay = payRecordsData.reduce((sum, record) => 
      sum + parseFloat(record.grossPay || "0"), 0
    );
    const totalNetPay = payRecordsData.reduce((sum, record) => 
      sum + parseFloat(record.netPay || "0"), 0
    );
    const totalHoursWorked = payRecordsData.reduce((sum, record) => 
      sum + parseFloat(record.hoursWorked || "0"), 0
    );
    const totalMilesDelivered = payRecordsData.reduce((sum, record) => 
      sum + parseFloat(record.milesDelivered || "0"), 0
    );
    const totalBonuses = payRecordsData.reduce((sum, record) => 
      sum + parseFloat(record.bonuses || "0"), 0
    );

    const totalTrips = tripsData.length;
    const totalRevenue = tripsData.reduce((sum, trip) => 
      sum + parseFloat(trip.billRate || "0"), 0
    );

    return {
      payRecords: payRecordsData.slice(0, 6),
      totalGrossPay,
      totalNetPay,
      totalHoursWorked,
      totalMilesDelivered,
      totalBonuses,
      totalTrips,
      totalRevenue,
      avgHourlyRate: totalHoursWorked > 0 ? totalGrossPay / totalHoursWorked : 0,
      // New fields for profile stats
      lifetimeMoveCount: driver?.lifetimeMoveCount || 0,
      accidentCountSinceHire,
      hireDate: driver?.hireDate || null,
    };
  }

  async getCorporateStats(): Promise<any> {
    const allDrivers = await db.select().from(drivers);
    const allPayRecords = await db.select().from(payRecords);
    const allTrips = await db.select().from(trips);

    const activeDrivers = allDrivers.filter(d => d.status === "active").length;
    const inactiveDrivers = allDrivers.filter(d => d.status === "inactive").length;
    const suspendedDrivers = allDrivers.filter(d => d.status === "suspended").length;

    const totalGrossPay = allPayRecords.reduce((sum, record) => 
      sum + parseFloat(record.grossPay || "0"), 0
    );
    const totalNetPay = allPayRecords.reduce((sum, record) => 
      sum + parseFloat(record.netPay || "0"), 0
    );
    const totalHoursWorked = allPayRecords.reduce((sum, record) => 
      sum + parseFloat(record.hoursWorked || "0"), 0
    );
    const totalMilesDelivered = allPayRecords.reduce((sum, record) => 
      sum + parseFloat(record.milesDelivered || "0"), 0
    );

    const totalTrips = allTrips.length;
    const totalRevenue = allTrips.reduce((sum, trip) => 
      sum + parseFloat(trip.billRate || "0"), 0
    );

    const driverStatusBreakdown = [
      { status: "active", count: activeDrivers },
      { status: "inactive", count: inactiveDrivers },
      { status: "suspended", count: suspendedDrivers },
    ];

    return {
      totalDrivers: allDrivers.length,
      activeDrivers,
      inactiveDrivers,
      suspendedDrivers,
      driverStatusBreakdown,
      totalGrossPay,
      totalNetPay,
      totalHoursWorked,
      totalMilesDelivered,
      totalTrips,
      totalRevenue,
      avgRevenuePerTrip: totalTrips > 0 ? totalRevenue / totalTrips : 0,
    };
  }

  // User invitation operations (admin/super_user only)
  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users).orderBy(desc(users.createdAt));
  }

  async createUserInvitation(invitationData: InsertUserInvitation): Promise<UserInvitation> {
    const [invitation] = await db.insert(userInvitations).values(invitationData).returning();
    return invitation;
  }

  async getInvitationByCode(code: string): Promise<UserInvitation | undefined> {
    const [invitation] = await db
      .select()
      .from(userInvitations)
      .where(eq(userInvitations.inviteCode, code));
    return invitation;
  }

  async getInvitationByEmail(email: string): Promise<UserInvitation | undefined> {
    const [invitation] = await db
      .select()
      .from(userInvitations)
      .where(eq(userInvitations.email, email));
    return invitation;
  }

  async getAllInvitations(): Promise<UserInvitation[]> {
    return await db
      .select()
      .from(userInvitations)
      .orderBy(desc(userInvitations.createdAt));
  }

  async markInvitationAsUsed(id: string, userId: string): Promise<void> {
    await db
      .update(userInvitations)
      .set({ usedAt: new Date(), usedBy: userId })
      .where(eq(userInvitations.id, id));
  }

  async deleteInvitation(id: string): Promise<void> {
    await db.delete(userInvitations).where(eq(userInvitations.id, id));
  }

  // Accident operations
  async getAllAccidents(): Promise<any[]> {
    const accidentsList = await db
      .select({
        accident: accidents,
        // Keep the Claims list aligned with the Claim Detail Activity Timeline.
        // These are the timeline's durable activity sources; creation is the
        // fallback for claims with no subsequent qualifying activity.
        lastActivityAt: sql<Date>`
          GREATEST(
            ${accidents.createdAt},
            COALESCE(
              (
                SELECT MAX(cal.created_at)
                FROM claim_audit_logs cal
                WHERE cal.claim_id = ${accidents.id}
              ),
              ${accidents.createdAt}
            ),
            COALESCE(
              (
                SELECT MAX(cse.created_at)
                FROM carrier_submission_events cse
                WHERE cse.claim_id = ${accidents.id}
              ),
              ${accidents.createdAt}
            ),
            COALESCE(
              (
                SELECT MAX(aa.created_at)
                FROM accident_attachments aa
                WHERE aa.accident_id = ${accidents.id}
                  AND aa.is_deleted = false
              ),
              ${accidents.createdAt}
            )
          )
        `,
        reporter: {
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
        },
      })
      .from(accidents)
      .leftJoin(users, eq(accidents.reportedBy, users.id))
      .orderBy(desc(accidents.createdAt), desc(accidents.id));
    
    return accidentsList.map(row => ({
      ...row.accident,
      lastActivityAt: row.lastActivityAt,
      reporter: row.reporter,
    }));
  }

  async getAccidentsByDriverId(driverId: string): Promise<any[]> {
    const accidentsList = await db
      .select({
        accident: accidents,
        reporter: {
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
        },
        customerName: customers.customerName,
      })
      .from(accidents)
      .leftJoin(users, eq(accidents.reportedBy, users.id))
      .leftJoin(customers, eq(accidents.customerId, customers.id))
      .where(eq(accidents.driverId, driverId))
      .orderBy(desc(accidents.accidentDate));
    
    // Add attachment counts to each accident
    const accidentsWithCounts = await Promise.all(
      accidentsList.map(async (row) => {
        const attachmentCount = await this.getAttachmentCountByAccidentId(row.accident.id);
        return {
          ...row.accident,
          reporter: row.reporter,
          customerName: row.customerName ?? null,
          attachmentCount,
        };
      })
    );
    
    return accidentsWithCounts;
  }

  async getAccidentsByCustomerId(customerId: string): Promise<any[]> {
    const accidentsList = await db
      .select({
        accident: accidents,
        reporter: {
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
        },
      })
      .from(accidents)
      .leftJoin(users, eq(accidents.reportedBy, users.id))
      .where(eq(accidents.customerId, customerId))
      .orderBy(desc(accidents.accidentDate));
    
    return accidentsList.map(row => ({
      ...row.accident,
      reporter: row.reporter,
    }));
  }

  async createAccident(accidentData: InsertAccident): Promise<Accident> {
    const [accident] = await db.insert(accidents).values(accidentData).returning();
    return accident;
  }

  async updateAccident(id: string, accidentData: Partial<InsertAccident>): Promise<Accident | undefined> {
    const [accident] = await db
      .update(accidents)
      .set({ ...accidentData, updatedAt: new Date() })
      .where(eq(accidents.id, id))
      .returning();
    return accident;
  }

  async updateClaimTriage(
    id: string, 
    triageData: {
      triageSeverity?: string;
      injuryFlag?: boolean;
      drivableFlag?: boolean;
      carrierNotificationRequired?: boolean;
      triageOwnerUserId?: string;
      triageDecisionAt?: Date;
      triageOverrideReason?: string;
      triageOverrideByUserId?: string;
      triageOverrideAt?: Date;
    }
  ): Promise<Accident | undefined> {
    const [accident] = await db
      .update(accidents)
      .set({ ...triageData, updatedAt: new Date() })
      .where(eq(accidents.id, id))
      .returning();
    return accident;
  }

  async getAccidentById(id: string): Promise<any> {
    const reporterAlias = aliasedTable(users, "reporter_user");
    const updaterAlias = aliasedTable(users, "updater_user");

    const [result] = await db
      .select({
        accident: accidents,
        reporter: {
          id: reporterAlias.id,
          firstName: reporterAlias.firstName,
          lastName: reporterAlias.lastName,
          email: reporterAlias.email,
        },
        updatedByUser: {
          firstName: updaterAlias.firstName,
          lastName: updaterAlias.lastName,
        },
      })
      .from(accidents)
      .leftJoin(reporterAlias, eq(accidents.reportedBy, reporterAlias.id))
      .leftJoin(updaterAlias, eq(accidents.updatedBy, updaterAlias.id))
      .where(eq(accidents.id, id));
    
    if (!result) return null;
    
    // For fileUrl: return it as-is for normal object-storage paths (short strings),
    // but return NULL for base64 data URIs (which can be 3-6 MB each and cause
    // Neon's 64 MB HTTP response limit to be exceeded on claims with many photos).
    // The download handler and photo thumbnail component fetch the URL on-demand
    // via /api/corporate/accidents/:id/attachments/:attachmentId/url for null cases.
    const attachmentsList = await db
      .select({
        id: accidentAttachments.id,
        accidentId: accidentAttachments.accidentId,
        fileName: accidentAttachments.fileName,
        fileType: accidentAttachments.fileType,
        fileSize: accidentAttachments.fileSize,
        fileUrl: sql<string | null>`CASE WHEN ${accidentAttachments.fileUrl} LIKE 'data:%' THEN NULL ELSE ${accidentAttachments.fileUrl} END`.as("file_url"),
        uploadedBy: accidentAttachments.uploadedBy,
        category: accidentAttachments.category,
        attachmentSource: accidentAttachments.attachmentSource,
        attachmentFlags: accidentAttachments.attachmentFlags,
        metadata: accidentAttachments.metadata,
        notes: accidentAttachments.notes,
        isDeleted: accidentAttachments.isDeleted,
        deletedAt: accidentAttachments.deletedAt,
        deletedByUserId: accidentAttachments.deletedByUserId,
        deletionReason: accidentAttachments.deletionReason,
        deletionOverrideId: accidentAttachments.deletionOverrideId,
        attachmentDocumentId: accidentAttachments.attachmentDocumentId,
        annotations: accidentAttachments.annotations,
        createdAt: accidentAttachments.createdAt,
      })
      .from(accidentAttachments)
      .where(eq(accidentAttachments.accidentId, id))
      .orderBy(desc(accidentAttachments.createdAt));
    
    let driverWithUser = null;
    if (result.accident.driverId) {
      driverWithUser = await this.getDriverWithUser(result.accident.driverId);
    }
    
    return {
      ...result.accident,
      reporter: result.reporter,
      driver: driverWithUser,
      attachments: attachmentsList,
      attachmentCount: attachmentsList.length,
      updatedByUser: result.updatedByUser?.firstName ? result.updatedByUser : null,
    };
  }

  // Claim-Move Traceability
  async getClaimsByMoveId(moveId: string): Promise<any[]> {
    const claimsList = await db
      .select({
        accident: accidents,
        reporter: {
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
        },
      })
      .from(accidents)
      .leftJoin(users, eq(accidents.reportedBy, users.id))
      .where(eq(accidents.moveId, moveId))
      .orderBy(desc(accidents.createdAt));
    
    return claimsList.map((row) => ({
      ...row.accident,
      reporter: row.reporter,
    }));
  }

  async getMoveByClaimId(claimId: string): Promise<Trip | null> {
    const [accident] = await db
      .select({ moveId: accidents.moveId })
      .from(accidents)
      .where(eq(accidents.id, claimId));
    
    if (!accident?.moveId) return null;
    
    const [trip] = await db
      .select()
      .from(trips)
      .where(eq(trips.id, accident.moveId));
    
    return trip || null;
  }

  // Claim Audit Log operations (immutable)
  async createClaimAuditLog(logData: InsertClaimAuditLog): Promise<ClaimAuditLog> {
    const [log] = await db.insert(claimAuditLogs).values(logData).returning();
    return log;
  }

  async getClaimAuditLogs(claimId: string): Promise<ClaimAuditLog[]> {
    return await db
      .select()
      .from(claimAuditLogs)
      .where(eq(claimAuditLogs.claimId, claimId))
      .orderBy(desc(claimAuditLogs.createdAt));
  }

  // Accident attachment operations
  async getAttachmentsByAccidentId(accidentId: string): Promise<AccidentAttachment[]> {
    return await db
      .select()
      .from(accidentAttachments)
      .where(eq(accidentAttachments.accidentId, accidentId))
      .orderBy(desc(accidentAttachments.createdAt));
  }

  async getAttachmentCountByAccidentId(accidentId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(accidentAttachments)
      .where(eq(accidentAttachments.accidentId, accidentId));
    return Number(result[0]?.count || 0);
  }

  async createAccidentAttachment(attachmentData: InsertAccidentAttachment): Promise<AccidentAttachment> {
    const [attachment] = await db.insert(accidentAttachments).values(attachmentData).returning();
    return attachment;
  }

  async addAccidentInsuranceComment(accidentId: string, comment: { id: string; text: string; createdAt: string; createdBy: string }): Promise<Accident | undefined> {
    // Use atomic PostgreSQL jsonb operation to prepend new comment to the array
    // This ensures concurrent writes don't overwrite each other
    const [accident] = await db
      .update(accidents)
      .set({
        insuranceCommentsHistory: sql`
          CASE 
            WHEN ${accidents.insuranceCommentsHistory} IS NULL THEN ${JSON.stringify([comment])}::jsonb
            ELSE ${JSON.stringify([comment])}::jsonb || ${accidents.insuranceCommentsHistory}
          END
        `,
        updatedAt: new Date(),
      })
      .where(eq(accidents.id, accidentId))
      .returning();
    return accident;
  }

  async addAccidentIncidentComment(accidentId: string, comment: { id: string; text: string; createdAt: string; createdBy: string }): Promise<Accident | undefined> {
    // Use atomic PostgreSQL jsonb operation to prepend new comment to the array
    // This ensures concurrent writes don't overwrite each other
    const [accident] = await db
      .update(accidents)
      .set({
        incidentCommentsHistory: sql`
          CASE 
            WHEN ${accidents.incidentCommentsHistory} IS NULL THEN ${JSON.stringify([comment])}::jsonb
            ELSE ${JSON.stringify([comment])}::jsonb || ${accidents.incidentCommentsHistory}
          END
        `,
        updatedAt: new Date(),
      })
      .where(eq(accidents.id, accidentId))
      .returning();
    return accident;
  }

  async getAccidentAttachmentById(id: string): Promise<AccidentAttachment | undefined> {
    const [attachment] = await db.select().from(accidentAttachments).where(eq(accidentAttachments.id, id)).limit(1);
    return attachment;
  }

  async updateAccidentAttachment(id: string, data: Partial<InsertAccidentAttachment>): Promise<AccidentAttachment> {
    const [updated] = await db.update(accidentAttachments).set(data).where(eq(accidentAttachments.id, id)).returning();
    return updated;
  }

  async deleteAccidentAttachment(id: string): Promise<void> {
    await db.delete(accidentAttachments).where(eq(accidentAttachments.id, id));
  }

  async getCategoryMetaByAccidentId(accidentId: string): Promise<AccidentCategoryMeta[]> {
    return await db
      .select()
      .from(accidentCategoryMeta)
      .where(eq(accidentCategoryMeta.accidentId, accidentId));
  }

  async upsertCategoryMeta(accidentId: string, category: string, data: { metadata?: any; notes?: string | null; updatedBy: string }): Promise<AccidentCategoryMeta> {
    const [result] = await db
      .insert(accidentCategoryMeta)
      .values({
        accidentId,
        category,
        metadata: data.metadata ?? null,
        notes: data.notes ?? null,
        updatedBy: data.updatedBy,
      })
      .onConflictDoUpdate({
        target: [accidentCategoryMeta.accidentId, accidentCategoryMeta.category],
        set: {
          metadata: data.metadata ?? null,
          notes: data.notes ?? null,
          updatedBy: data.updatedBy,
          updatedAt: new Date(),
        },
      })
      .returning();
    return result;
  }

  // Move Snapshot operations (immutable snapshots for claims)
  async createMoveSnapshot(snapshotData: InsertMoveSnapshot): Promise<MoveSnapshot> {
    const [snapshot] = await db.insert(moveSnapshots).values(snapshotData).returning();
    return snapshot;
  }

  async getMoveSnapshotById(id: string): Promise<MoveSnapshot | null> {
    const [snapshot] = await db.select().from(moveSnapshots).where(eq(moveSnapshots.id, id));
    return snapshot || null;
  }

  async getMoveSnapshotsByMoveId(moveId: string): Promise<MoveSnapshot[]> {
    return await db
      .select()
      .from(moveSnapshots)
      .where(eq(moveSnapshots.moveId, moveId))
      .orderBy(desc(moveSnapshots.createdAt));
  }

  async getMoveSnapshotForClaim(accidentId: string): Promise<MoveSnapshot | null> {
    const [accident] = await db.select({ moveSnapshotId: accidents.moveSnapshotId }).from(accidents).where(eq(accidents.id, accidentId));
    if (!accident?.moveSnapshotId) return null;
    
    const [snapshot] = await db.select().from(moveSnapshots).where(eq(moveSnapshots.id, accident.moveSnapshotId));
    return snapshot || null;
  }

  // Move Incident operations (damage, accident, injury, etc.)
  async createMoveIncident(incidentData: InsertMoveIncident): Promise<MoveIncident> {
    const [incident] = await db.insert(moveIncidents).values(incidentData).returning();
    return incident;
  }

  async getMoveIncidentsByMoveId(moveId: string): Promise<MoveIncident[]> {
    return await db
      .select()
      .from(moveIncidents)
      .where(eq(moveIncidents.moveId, moveId))
      .orderBy(desc(moveIncidents.occurredAt));
  }

  async getMoveIncidentById(id: string): Promise<MoveIncident | null> {
    const [incident] = await db.select().from(moveIncidents).where(eq(moveIncidents.id, id));
    return incident || null;
  }

  async linkIncidentToClaim(incidentId: string, accidentId: string): Promise<MoveIncident | null> {
    const [incident] = await db
      .update(moveIncidents)
      .set({ accidentId })
      .where(eq(moveIncidents.id, incidentId))
      .returning();
    return incident || null;
  }

  // Claim Event operations (audit trail for claim lifecycle)
  async createClaimEvent(event: InsertClaimEvent): Promise<ClaimEvent> {
    const [created] = await db.insert(claimEvents).values(event).returning();
    return created;
  }

  async getClaimEventsByClaimId(claimId: string): Promise<ClaimEvent[]> {
    return await db
      .select()
      .from(claimEvents)
      .where(eq(claimEvents.claimId, claimId))
      .orderBy(desc(claimEvents.createdAt));
  }

  async transitionClaimStatus(
    claimId: string,
    toStatus: string,
    userId: string,
    userName: string,
    note?: string
  ): Promise<{ accident: Accident; event: ClaimEvent } | null> {
    const [accident] = await db.select().from(accidents).where(eq(accidents.id, claimId));
    if (!accident) return null;

    const fromStatus = accident.claimStatus || 'DRAFT';

    const [updatedAccident] = await db
      .update(accidents)
      .set({ claimStatus: toStatus, updatedAt: new Date() })
      .where(eq(accidents.id, claimId))
      .returning();

    const [event] = await db
      .insert(claimEvents)
      .values({
        claimId,
        fromStatus,
        toStatus,
        changedByUserId: userId,
        changedByName: userName,
        note: note || null,
      })
      .returning();

    return { accident: updatedAccident, event };
  }

  // Move Media (Photo Compliance) operations
  async getMoveMediaByMoveId(moveId: string): Promise<MoveMedia[]> {
    return await db
      .select()
      .from(moveMedia)
      .where(eq(moveMedia.moveId, moveId))
      .orderBy(desc(moveMedia.createdAt));
  }

  async getMoveMediaByStage(moveId: string, stage: string): Promise<MoveMedia[]> {
    return await db
      .select()
      .from(moveMedia)
      .where(and(eq(moveMedia.moveId, moveId), eq(moveMedia.stage, stage)))
      .orderBy(moveMedia.category);
  }

  async createMoveMedia(media: InsertMoveMedia): Promise<MoveMedia> {
    const [created] = await db.insert(moveMedia).values(media).returning();
    // Update move compliance status after adding photo
    await this.updateMovePhotoComplianceStatus(media.moveId);
    return created;
  }

  async deleteMoveMedia(id: string): Promise<void> {
    // Get the media first to know which move to update
    const [existing] = await db.select().from(moveMedia).where(eq(moveMedia.id, id));
    if (existing) {
      await db.delete(moveMedia).where(eq(moveMedia.id, id));
      await this.updateMovePhotoComplianceStatus(existing.moveId);
    }
  }

  async updateMovePhotoComplianceStatus(moveId: string): Promise<void> {
    // Define required photos for each stage
    const PICKUP_REQUIRED = ["angle_front_left", "angle_front_right", "angle_rear_left", "angle_rear_right", "vin"];
    const DROPOFF_REQUIRED = ["angle_front_left", "angle_front_right", "angle_rear_left", "angle_rear_right", "surroundings"];

    // Get all photos for this move
    const photos = await this.getMoveMediaByMoveId(moveId);
    
    // Calculate pickup compliance
    const pickupPhotos = photos.filter(p => p.stage === "pickup" && p.qualityPassed);
    const pickupCategories = new Set(pickupPhotos.map(p => p.category));
    const pickupComplete = PICKUP_REQUIRED.every(cat => pickupCategories.has(cat));
    const pickupPartial = pickupPhotos.length > 0;
    const pickupStatus = pickupComplete ? "complete" : (pickupPartial ? "partial" : "not_started");

    // Calculate dropoff compliance
    const dropoffPhotos = photos.filter(p => p.stage === "dropoff" && p.qualityPassed);
    const dropoffCategories = new Set(dropoffPhotos.map(p => p.category));
    const dropoffComplete = DROPOFF_REQUIRED.every(cat => dropoffCategories.has(cat));
    const dropoffPartial = dropoffPhotos.length > 0;
    const dropoffStatus = dropoffComplete ? "complete" : (dropoffPartial ? "partial" : "not_started");

    // Update the trip record
    await db
      .update(trips)
      .set({
        pickupPhotoComplianceStatus: pickupStatus,
        dropoffPhotoComplianceStatus: dropoffStatus,
        updatedAt: new Date(),
      })
      .where(eq(trips.id, moveId));
  }

  // Photo Gate Override operations
  async createPhotoGateOverride(override: InsertPhotoGateOverride): Promise<PhotoGateOverride> {
    const [created] = await db.insert(photoGateOverrides).values(override).returning();
    return created;
  }

  async getPhotoGateOverridesByMoveId(moveId: string): Promise<PhotoGateOverride[]> {
    return await db
      .select()
      .from(photoGateOverrides)
      .where(eq(photoGateOverrides.moveId, moveId))
      .orderBy(desc(photoGateOverrides.createdAt));
  }

  // Driver Safety Flag operations
  async getDriverSafetyFlags(driverId: string): Promise<DriverSafetyFlag[]> {
    return await db
      .select()
      .from(driverSafetyFlags)
      .where(eq(driverSafetyFlags.driverId, driverId))
      .orderBy(desc(driverSafetyFlags.triggeredAt));
  }

  async getActiveDriverSafetyFlags(driverId: string): Promise<DriverSafetyFlag[]> {
    return await db
      .select()
      .from(driverSafetyFlags)
      .where(
        and(
          eq(driverSafetyFlags.driverId, driverId),
          isNull(driverSafetyFlags.resolvedAt)
        )
      )
      .orderBy(desc(driverSafetyFlags.triggeredAt));
  }

  async createDriverSafetyFlag(flag: InsertDriverSafetyFlag): Promise<DriverSafetyFlag> {
    const [created] = await db.insert(driverSafetyFlags).values(flag).returning();
    return created;
  }

  async resolveDriverSafetyFlag(
    flagId: string,
    userId: string,
    userName: string,
    note?: string
  ): Promise<DriverSafetyFlag | null> {
    const [updated] = await db
      .update(driverSafetyFlags)
      .set({
        resolvedAt: new Date(),
        resolvedByUserId: userId,
        resolvedByName: userName,
        resolutionNote: note || null,
      })
      .where(eq(driverSafetyFlags.id, flagId))
      .returning();
    return updated || null;
  }

  async checkAndTriggerSafetyFlags(driverId: string): Promise<DriverSafetyFlag[]> {
    // Default thresholds (can be made configurable later)
    const INCIDENT_THRESHOLD = 3;
    const INCIDENT_LOOKBACK_DAYS = 90;
    const CLAIM_THRESHOLD = 2;
    const CLAIM_LOOKBACK_DAYS = 180;

    const triggeredFlags: DriverSafetyFlag[] = [];
    const lookbackIncident = new Date();
    lookbackIncident.setDate(lookbackIncident.getDate() - INCIDENT_LOOKBACK_DAYS);
    const lookbackClaim = new Date();
    lookbackClaim.setDate(lookbackClaim.getDate() - CLAIM_LOOKBACK_DAYS);

    // Check for existing active flags to avoid duplicates
    const existingFlags = await this.getActiveDriverSafetyFlags(driverId);
    const existingIncidentFlag = existingFlags.find(f => f.flagType === 'INCIDENT_COUNT');
    const existingClaimFlag = existingFlags.find(f => f.flagType === 'CLAIM_COUNT');

    // Count incidents in lookback period
    const [incidentCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(moveIncidents)
      .innerJoin(trips, eq(moveIncidents.moveId, trips.id))
      .where(
        and(
          eq(trips.driverId, driverId),
          gte(moveIncidents.occurredAt, lookbackIncident)
        )
      );

    // Trigger INCIDENT_COUNT flag if threshold exceeded and no existing flag
    if (incidentCount.count >= INCIDENT_THRESHOLD && !existingIncidentFlag) {
      const flag = await this.createDriverSafetyFlag({
        driverId,
        flagType: 'INCIDENT_COUNT',
        thresholdValue: INCIDENT_THRESHOLD,
        lookbackDays: INCIDENT_LOOKBACK_DAYS,
        actualValue: incidentCount.count,
        note: `Driver has ${incidentCount.count} incidents in the last ${INCIDENT_LOOKBACK_DAYS} days (threshold: ${INCIDENT_THRESHOLD})`,
      });
      triggeredFlags.push(flag);
    }

    // Count claims in lookback period
    const [claimCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(accidents)
      .where(
        and(
          eq(accidents.driverId, driverId),
          gte(accidents.accidentDate, lookbackClaim)
        )
      );

    // Trigger CLAIM_COUNT flag if threshold exceeded and no existing flag
    if (claimCount.count >= CLAIM_THRESHOLD && !existingClaimFlag) {
      const flag = await this.createDriverSafetyFlag({
        driverId,
        flagType: 'CLAIM_COUNT',
        thresholdValue: CLAIM_THRESHOLD,
        lookbackDays: CLAIM_LOOKBACK_DAYS,
        actualValue: claimCount.count,
        note: `Driver has ${claimCount.count} claims in the last ${CLAIM_LOOKBACK_DAYS} days (threshold: ${CLAIM_THRESHOLD})`,
      });
      triggeredFlags.push(flag);
    }

    return triggeredFlags;
  }

  // Safety incident operations
  async getSafetyIncidents(driverId: string): Promise<any[]> {
    return await db.select().from(safetyIncidents).where(eq(safetyIncidents.driverId, driverId));
  }

  // ==========================================
  // CUSTOMER NOTIFICATION PREFERENCES IMPLEMENTATIONS
  // ==========================================

  async getCustomerNotificationPreferences(customerUserId: string): Promise<CustomerNotificationPreference[]> {
    return await db
      .select()
      .from(customerNotificationPreferences)
      .where(eq(customerNotificationPreferences.customerUserId, customerUserId));
  }

  async initializeCustomerNotificationPreferences(customerUserId: string): Promise<CustomerNotificationPreference[]> {
    const existing = await this.getCustomerNotificationPreferences(customerUserId);
    if (existing.length > 0) {
      return existing;
    }

    const preferences: InsertCustomerNotificationPreference[] = CUSTOMER_NOTIFICATION_EVENT_TYPES.map((eventType) => ({
      customerUserId,
      eventType,
      channel: 'EMAIL' as const,
      enabled: true,
    }));

    const created = await db
      .insert(customerNotificationPreferences)
      .values(preferences)
      .returning();
    
    return created;
  }

  async updateCustomerNotificationPreference(
    customerUserId: string, 
    eventType: string, 
    enabled: boolean
  ): Promise<CustomerNotificationPreference | null> {
    const [existing] = await db
      .select()
      .from(customerNotificationPreferences)
      .where(
        and(
          eq(customerNotificationPreferences.customerUserId, customerUserId),
          eq(customerNotificationPreferences.eventType, eventType)
        )
      );

    if (existing) {
      const [updated] = await db
        .update(customerNotificationPreferences)
        .set({ enabled, updatedAt: new Date() })
        .where(eq(customerNotificationPreferences.id, existing.id))
        .returning();
      return updated;
    } else {
      const [created] = await db
        .insert(customerNotificationPreferences)
        .values({
          customerUserId,
          eventType,
          channel: 'EMAIL',
          enabled,
        })
        .returning();
      return created;
    }
  }

  async isNotificationEnabled(customerUserId: string, eventType: CustomerNotificationEventType): Promise<boolean> {
    const [pref] = await db
      .select()
      .from(customerNotificationPreferences)
      .where(
        and(
          eq(customerNotificationPreferences.customerUserId, customerUserId),
          eq(customerNotificationPreferences.eventType, eventType)
        )
      );
    
    // Default to enabled if no preference exists
    return pref ? pref.enabled : true;
  }

  // ==========================================
  // CUSTOMER USERS IMPLEMENTATIONS
  // ==========================================

  async getCustomerUsersByCustomerId(customerId: string): Promise<CustomerUser[]> {
    return await db
      .select()
      .from(customerUsers)
      .where(eq(customerUsers.customerId, customerId))
      .orderBy(desc(customerUsers.createdAt));
  }

  async getCustomerUserById(id: string): Promise<CustomerUser | null> {
    const [customerUser] = await db
      .select()
      .from(customerUsers)
      .where(eq(customerUsers.id, id));
    return customerUser || null;
  }

  async getCustomerUserByEmail(customerId: string, email: string): Promise<CustomerUser | null> {
    const [customerUser] = await db
      .select()
      .from(customerUsers)
      .where(
        and(
          eq(customerUsers.customerId, customerId),
          eq(customerUsers.email, email.toLowerCase())
        )
      );
    return customerUser || null;
  }

  async getCustomerUserByUserId(userId: string): Promise<CustomerUser | null> {
    const [customerUser] = await db
      .select()
      .from(customerUsers)
      .where(eq(customerUsers.userId, userId));
    return customerUser || null;
  }

  async createCustomerUser(data: InsertCustomerUser): Promise<CustomerUser> {
    const [customerUser] = await db
      .insert(customerUsers)
      .values({
        ...data,
        email: data.email.toLowerCase(),
      })
      .returning();
    return customerUser;
  }

  async updateCustomerUserRole(id: string, role: CustomerUserRole): Promise<CustomerUser | null> {
    const [updated] = await db
      .update(customerUsers)
      .set({ role, updatedAt: new Date() })
      .where(eq(customerUsers.id, id))
      .returning();
    return updated || null;
  }

  async updateCustomerUserStatus(id: string, status: string, userId?: string): Promise<CustomerUser | null> {
    const updateData: any = { status, updatedAt: new Date() };
    if (status === 'ACTIVE' && userId) {
      updateData.userId = userId;
      updateData.acceptedAt = new Date();
    }
    const [updated] = await db
      .update(customerUsers)
      .set(updateData)
      .where(eq(customerUsers.id, id))
      .returning();
    return updated || null;
  }

  async deleteCustomerUser(id: string): Promise<void> {
    // Policy: no hard deletes — deactivate instead
    await db.update(customerUsers)
      .set({ status: 'INACTIVE' })
      .where(eq(customerUsers.id, id));
  }

  // ==========================================
  // SCHEDULING & TIME MANAGEMENT IMPLEMENTATIONS
  // ==========================================

  // Scheduling Entity operations
  async getAllSchedulingEntities(): Promise<any[]> {
    return await db.select().from(schedulingEntities).where(eq(schedulingEntities.isActive, true)).orderBy(schedulingEntities.legalName);
  }

  async getSchedulingEntity(id: string): Promise<any> {
    const [entity] = await db.select().from(schedulingEntities).where(eq(schedulingEntities.id, id));
    return entity;
  }

  async createSchedulingEntity(entityData: any): Promise<any> {
    const [entity] = await db.insert(schedulingEntities).values(entityData).returning();
    return entity;
  }

  async updateSchedulingEntity(id: string, updates: any): Promise<any> {
    const [entity] = await db
      .update(schedulingEntities)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(schedulingEntities.id, id))
      .returning();
    return entity;
  }

  async deleteSchedulingEntity(id: string): Promise<void> {
    await db.update(schedulingEntities).set({ isActive: false, updatedAt: new Date() }).where(eq(schedulingEntities.id, id));
  }

  async getUserSchedulingEntityAccess(userId: string): Promise<any[]> {
    return await db
      .select({
        access: userSchedulingEntityAccess,
        entity: schedulingEntities,
      })
      .from(userSchedulingEntityAccess)
      .innerJoin(schedulingEntities, eq(userSchedulingEntityAccess.entityId, schedulingEntities.id))
      .where(and(
        eq(userSchedulingEntityAccess.userId, userId),
        eq(userSchedulingEntityAccess.isActive, true),
        eq(schedulingEntities.isActive, true)
      ));
  }

  async grantSchedulingEntityAccess(accessData: any): Promise<any> {
    const [access] = await db.insert(userSchedulingEntityAccess).values(accessData).returning();
    return access;
  }

  async revokeSchedulingEntityAccess(id: string): Promise<void> {
    await db.update(userSchedulingEntityAccess).set({ isActive: false, updatedAt: new Date() }).where(eq(userSchedulingEntityAccess.id, id));
  }

  // Union / CBA Rule Set operations
  async getUnionCbaRuleSets(entityId?: string): Promise<any[]> {
    if (entityId) {
      return await db.select().from(unionCbaRuleSets)
        .where(and(eq(unionCbaRuleSets.entityId, entityId), eq(unionCbaRuleSets.isActive, true)))
        .orderBy(desc(unionCbaRuleSets.createdAt));
    }
    return await db.select().from(unionCbaRuleSets)
      .where(eq(unionCbaRuleSets.isActive, true))
      .orderBy(desc(unionCbaRuleSets.createdAt));
  }

  async getUnionCbaRuleSet(id: string): Promise<any> {
    const [ruleSet] = await db.select().from(unionCbaRuleSets).where(eq(unionCbaRuleSets.id, id));
    return ruleSet;
  }

  async createUnionCbaRuleSet(ruleSetData: any): Promise<any> {
    const [ruleSet] = await db.insert(unionCbaRuleSets).values(ruleSetData).returning();
    return ruleSet;
  }

  async updateUnionCbaRuleSet(id: string, updates: any): Promise<any> {
    const [ruleSet] = await db.update(unionCbaRuleSets)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(unionCbaRuleSets.id, id))
      .returning();
    return ruleSet;
  }

  async deleteUnionCbaRuleSet(id: string): Promise<void> {
    await db.update(unionCbaRuleSets)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(unionCbaRuleSets.id, id));
  }

  async getUnionCbaViolations(scheduleId?: string, ruleSetId?: string): Promise<any[]> {
    const conditions = [];
    if (scheduleId) conditions.push(eq(unionCbaViolations.scheduleId, scheduleId));
    if (ruleSetId) conditions.push(eq(unionCbaViolations.ruleSetId, ruleSetId));
    if (conditions.length > 0) {
      return await db.select().from(unionCbaViolations)
        .where(and(...conditions))
        .orderBy(desc(unionCbaViolations.detectedAt));
    }
    return await db.select().from(unionCbaViolations)
      .orderBy(desc(unionCbaViolations.detectedAt));
  }

  async createUnionCbaViolation(violationData: any): Promise<any> {
    const [violation] = await db.insert(unionCbaViolations).values(violationData).returning();
    return violation;
  }

  async acknowledgeUnionCbaViolation(id: string, userId: string): Promise<any> {
    const [violation] = await db.update(unionCbaViolations)
      .set({ acknowledged: true, acknowledgedBy: userId, acknowledgedAt: new Date() })
      .where(eq(unionCbaViolations.id, id))
      .returning();
    return violation;
  }

  async clearUnionCbaViolations(scheduleId: string): Promise<void> {
    await db.delete(unionCbaViolations).where(eq(unionCbaViolations.scheduleId, scheduleId));
  }

  // Scheduling Client Config operations (White-Label)
  async getSchedulingClientConfig(entityId: string): Promise<any> {
    const [config] = await db.select().from(schedulingClientConfigs)
      .where(eq(schedulingClientConfigs.entityId, entityId));
    return config || null;
  }

  async upsertSchedulingClientConfig(config: any): Promise<any> {
    const existing = await this.getSchedulingClientConfig(config.entityId);
    if (existing) {
      const [updated] = await db.update(schedulingClientConfigs)
        .set({ ...config, updatedAt: new Date() })
        .where(eq(schedulingClientConfigs.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(schedulingClientConfigs).values(config).returning();
    return created;
  }

  // Insurance Report operations
  async getSchedulingInsuranceReports(entityId?: string, periodType?: string): Promise<any[]> {
    const conditions = [];
    if (entityId) conditions.push(eq(schedulingInsuranceReports.entityId, entityId));
    if (periodType) conditions.push(eq(schedulingInsuranceReports.periodType, periodType));
    if (conditions.length > 0) {
      return await db.select().from(schedulingInsuranceReports)
        .where(and(...conditions))
        .orderBy(desc(schedulingInsuranceReports.generatedAt));
    }
    return await db.select().from(schedulingInsuranceReports)
      .orderBy(desc(schedulingInsuranceReports.generatedAt));
  }

  async getSchedulingInsuranceReport(id: string): Promise<any> {
    const [report] = await db.select().from(schedulingInsuranceReports)
      .where(eq(schedulingInsuranceReports.id, id));
    return report;
  }

  async createSchedulingInsuranceReport(report: any): Promise<any> {
    const [created] = await db.insert(schedulingInsuranceReports).values(report).returning();
    return created;
  }

  // AI Governance operations
  async getAiFeatureConfigs(entityId: string): Promise<any[]> {
    return db.select().from(schedulingAiFeatureConfigs)
      .where(eq(schedulingAiFeatureConfigs.entityId, entityId))
      .orderBy(schedulingAiFeatureConfigs.featureKey);
  }

  async getAiFeatureConfig(id: string): Promise<any> {
    const [config] = await db.select().from(schedulingAiFeatureConfigs)
      .where(eq(schedulingAiFeatureConfigs.id, id));
    return config || null;
  }

  async upsertAiFeatureConfig(config: any): Promise<any> {
    const existing = await db.select().from(schedulingAiFeatureConfigs)
      .where(and(
        eq(schedulingAiFeatureConfigs.entityId, config.entityId),
        eq(schedulingAiFeatureConfigs.featureKey, config.featureKey)
      ));
    if (existing.length > 0) {
      const [updated] = await db.update(schedulingAiFeatureConfigs)
        .set({ ...config, updatedAt: new Date() })
        .where(eq(schedulingAiFeatureConfigs.id, existing[0].id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(schedulingAiFeatureConfigs).values(config).returning();
    return created;
  }

  async toggleAiFeature(id: string, isEnabled: boolean, disabledReason?: string, disabledBy?: string): Promise<any> {
    const updates: any = { isEnabled, updatedAt: new Date() };
    if (!isEnabled) {
      updates.disabledReason = disabledReason || null;
      updates.disabledAt = new Date();
      updates.disabledBy = disabledBy || null;
    } else {
      updates.disabledReason = null;
      updates.disabledAt = null;
      updates.disabledBy = null;
    }
    const [updated] = await db.update(schedulingAiFeatureConfigs)
      .set(updates)
      .where(eq(schedulingAiFeatureConfigs.id, id))
      .returning();
    return updated;
  }

  async getAiDecisionLogs(entityId: string, featureKey?: string, limit: number = 50): Promise<any[]> {
    const conditions = [eq(schedulingAiDecisionLogs.entityId, entityId)];
    if (featureKey) conditions.push(eq(schedulingAiDecisionLogs.featureKey, featureKey));
    return db.select().from(schedulingAiDecisionLogs)
      .where(and(...conditions))
      .orderBy(desc(schedulingAiDecisionLogs.createdAt))
      .limit(limit);
  }

  async createAiDecisionLog(log: any): Promise<any> {
    const [created] = await db.insert(schedulingAiDecisionLogs).values(log).returning();
    return created;
  }

  async reviewAiDecision(id: string, reviewedBy: string, status: string, notes?: string, actionTaken?: string): Promise<any> {
    const [updated] = await db.update(schedulingAiDecisionLogs)
      .set({
        humanReviewStatus: status,
        humanReviewedBy: reviewedBy,
        humanReviewedAt: new Date(),
        humanReviewNotes: notes || null,
        actionTaken: actionTaken || "none",
      })
      .where(eq(schedulingAiDecisionLogs.id, id))
      .returning();
    return updated;
  }

  // Work Location operations
  async getAllWorkLocations(entityId?: string): Promise<any[]> {
    if (entityId) {
      return await db.select().from(workLocations).where(eq(workLocations.entityId, entityId)).orderBy(workLocations.name);
    }
    return await db.select().from(workLocations).orderBy(workLocations.name);
  }

  async getWorkLocation(id: string): Promise<any> {
    const [location] = await db.select().from(workLocations).where(eq(workLocations.id, id));
    return location;
  }

  async createWorkLocation(locationData: any): Promise<any> {
    const [location] = await db.insert(workLocations).values(locationData).returning();
    return location;
  }

  async updateWorkLocation(id: string, updates: any): Promise<any> {
    const [location] = await db
      .update(workLocations)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(workLocations.id, id))
      .returning();
    return location;
  }

  async deleteWorkLocation(id: string): Promise<void> {
    await db.delete(workLocations).where(eq(workLocations.id, id));
  }

  // Shift Template operations
  async getAllShiftTemplates(entityId?: string): Promise<any[]> {
    if (entityId) {
      return await db.select().from(shiftTemplates).where(and(eq(shiftTemplates.isActive, true), eq(shiftTemplates.entityId, entityId))).orderBy(shiftTemplates.name);
    }
    return await db.select().from(shiftTemplates).where(eq(shiftTemplates.isActive, true)).orderBy(shiftTemplates.name);
  }

  async getShiftTemplate(id: string): Promise<any> {
    const [template] = await db.select().from(shiftTemplates).where(eq(shiftTemplates.id, id));
    return template;
  }

  async createShiftTemplate(templateData: any): Promise<any> {
    const [template] = await db.insert(shiftTemplates).values(templateData).returning();
    return template;
  }

  async updateShiftTemplate(id: string, updates: any): Promise<any> {
    const [template] = await db
      .update(shiftTemplates)
      .set(updates)
      .where(eq(shiftTemplates.id, id))
      .returning();
    return template;
  }

  async deleteShiftTemplate(id: string): Promise<void> {
    await db.update(shiftTemplates).set({ isActive: false }).where(eq(shiftTemplates.id, id));
  }

  // Shift operations
  async getAllShifts(filters?: { startDate?: string; endDate?: string; locationId?: string; status?: string }): Promise<any[]> {
    let conditions = [];
    
    if (filters?.startDate) {
      conditions.push(gte(shifts.date, filters.startDate));
    }
    if (filters?.endDate) {
      conditions.push(lte(shifts.date, filters.endDate));
    }
    if (filters?.locationId) {
      conditions.push(eq(shifts.locationId, filters.locationId));
    }
    if (filters?.status) {
      conditions.push(eq(shifts.status, filters.status));
    }

    const query = conditions.length > 0
      ? db.select().from(shifts).where(and(...conditions)).orderBy(shifts.date, shifts.startTime)
      : db.select().from(shifts).orderBy(shifts.date, shifts.startTime);

    return await query;
  }

  async getShift(id: string): Promise<any> {
    const [shift] = await db.select().from(shifts).where(eq(shifts.id, id));
    return shift;
  }

  async getShiftWithAssignments(id: string): Promise<any> {
    const [shift] = await db.select().from(shifts).where(eq(shifts.id, id));
    if (!shift) return null;

    const assignmentsList = await db
      .select({
        assignment: shiftAssignments,
        user: {
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
          profileImageUrl: users.profileImageUrl,
        },
      })
      .from(shiftAssignments)
      .leftJoin(users, eq(shiftAssignments.userId, users.id))
      .where(eq(shiftAssignments.shiftId, id));

    let location = null;
    if (shift.locationId) {
      location = await this.getWorkLocation(shift.locationId);
    }

    return {
      ...shift,
      location,
      assignments: assignmentsList.map((row) => ({ ...row.assignment, user: row.user })),
    };
  }

  async createShift(shiftData: any): Promise<any> {
    const [shift] = await db.insert(shifts).values(shiftData).returning();
    return shift;
  }

  async updateShift(id: string, updates: any): Promise<any> {
    const [shift] = await db
      .update(shifts)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(shifts.id, id))
      .returning();
    return shift;
  }

  async deleteShift(id: string): Promise<void> {
    await db.delete(shifts).where(eq(shifts.id, id));
  }

  async publishShifts(shiftIds: string[], publishedBy: string): Promise<void> {
    const now = new Date();
    for (const id of shiftIds) {
      await db
        .update(shifts)
        .set({ status: "published", publishedAt: now, publishedBy, updatedAt: now })
        .where(eq(shifts.id, id));
    }
  }

  // Shift Assignment operations
  async getShiftAssignments(shiftId: string): Promise<any[]> {
    return await db
      .select({
        assignment: shiftAssignments,
        user: {
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
        },
      })
      .from(shiftAssignments)
      .leftJoin(users, eq(shiftAssignments.userId, users.id))
      .where(eq(shiftAssignments.shiftId, shiftId));
  }

  async getAssignmentsByUserId(userId: string, startDate?: string, endDate?: string): Promise<any[]> {
    let conditions = [eq(shiftAssignments.userId, userId)];
    
    const results = await db
      .select({
        assignment: shiftAssignments,
        shift: shifts,
        location: workLocations,
      })
      .from(shiftAssignments)
      .innerJoin(shifts, eq(shiftAssignments.shiftId, shifts.id))
      .leftJoin(workLocations, eq(shifts.locationId, workLocations.id))
      .where(eq(shiftAssignments.userId, userId))
      .orderBy(shifts.date, shifts.startTime);

    return results.map((row) => ({
      ...row.assignment,
      shift: row.shift,
      location: row.location,
    }));
  }

  async createShiftAssignment(assignmentData: any): Promise<any> {
    const [assignment] = await db.insert(shiftAssignments).values(assignmentData).returning();
    
    // Update shift's assignedStaff count
    const shift = await this.getShift(assignmentData.shiftId);
    if (shift) {
      await db
        .update(shifts)
        .set({ assignedStaff: (shift.assignedStaff || 0) + 1, updatedAt: new Date() })
        .where(eq(shifts.id, assignmentData.shiftId));
    }
    
    return assignment;
  }

  async updateShiftAssignment(id: string, updates: any): Promise<any> {
    const [assignment] = await db
      .update(shiftAssignments)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(shiftAssignments.id, id))
      .returning();
    return assignment;
  }

  async deleteShiftAssignment(id: string): Promise<void> {
    const [assignment] = await db.select().from(shiftAssignments).where(eq(shiftAssignments.id, id));
    if (assignment) {
      await db.delete(shiftAssignments).where(eq(shiftAssignments.id, id));
      
      // Update shift's assignedStaff count
      const shift = await this.getShift(assignment.shiftId);
      if (shift && shift.assignedStaff > 0) {
        await db
          .update(shifts)
          .set({ assignedStaff: shift.assignedStaff - 1, updatedAt: new Date() })
          .where(eq(shifts.id, assignment.shiftId));
      }
    }
  }

  // Shift Swap Request operations
  async getShiftSwapRequests(filters?: { status?: string; userId?: string }): Promise<any[]> {
    let conditions = [];
    if (filters?.status) {
      conditions.push(eq(shiftSwapRequests.status, filters.status));
    }
    if (filters?.userId) {
      conditions.push(eq(shiftSwapRequests.requestedByUserId, filters.userId));
    }

    const query = conditions.length > 0
      ? db.select().from(shiftSwapRequests).where(and(...conditions)).orderBy(desc(shiftSwapRequests.createdAt))
      : db.select().from(shiftSwapRequests).orderBy(desc(shiftSwapRequests.createdAt));

    return await query;
  }

  async createShiftSwapRequest(requestData: any): Promise<any> {
    const [request] = await db.insert(shiftSwapRequests).values(requestData).returning();
    return request;
  }

  async updateShiftSwapRequest(id: string, updates: any): Promise<any> {
    const [request] = await db
      .update(shiftSwapRequests)
      .set(updates)
      .where(eq(shiftSwapRequests.id, id))
      .returning();
    return request;
  }

  // Availability Window operations
  async getAvailabilityByUserId(userId: string): Promise<any[]> {
    return await db
      .select()
      .from(availabilityWindows)
      .where(eq(availabilityWindows.userId, userId))
      .orderBy(availabilityWindows.dayOfWeek, availabilityWindows.startTime);
  }

  async createAvailabilityWindow(availabilityData: any): Promise<any> {
    const [availability] = await db.insert(availabilityWindows).values(availabilityData).returning();
    return availability;
  }

  async updateAvailabilityWindow(id: string, updates: any): Promise<any> {
    const [availability] = await db
      .update(availabilityWindows)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(availabilityWindows.id, id))
      .returning();
    return availability;
  }

  async deleteAvailabilityWindow(id: string): Promise<void> {
    await db.delete(availabilityWindows).where(eq(availabilityWindows.id, id));
  }

  // Time-Off Request operations
  async getAllTimeOffRequests(filters?: { status?: string; startDate?: string; endDate?: string }): Promise<any[]> {
    let conditions = [];
    if (filters?.status) {
      conditions.push(eq(timeOffRequests.status, filters.status));
    }
    if (filters?.startDate) {
      conditions.push(gte(timeOffRequests.startDate, filters.startDate));
    }
    if (filters?.endDate) {
      conditions.push(lte(timeOffRequests.endDate, filters.endDate));
    }

    const results = await db
      .select({
        request: timeOffRequests,
        user: {
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
        },
      })
      .from(timeOffRequests)
      .leftJoin(users, eq(timeOffRequests.userId, users.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(timeOffRequests.createdAt));

    return results.map((row) => ({ ...row.request, user: row.user }));
  }

  async getTimeOffRequestsByUserId(userId: string): Promise<any[]> {
    return await db
      .select()
      .from(timeOffRequests)
      .where(eq(timeOffRequests.userId, userId))
      .orderBy(desc(timeOffRequests.startDate));
  }

  async getTimeOffRequest(id: string): Promise<any> {
    const [result] = await db
      .select({
        request: timeOffRequests,
        user: {
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
        },
      })
      .from(timeOffRequests)
      .leftJoin(users, eq(timeOffRequests.userId, users.id))
      .where(eq(timeOffRequests.id, id));

    if (!result) return null;
    return { ...result.request, user: result.user };
  }

  async createTimeOffRequest(requestData: any): Promise<any> {
    const [request] = await db.insert(timeOffRequests).values(requestData).returning();
    return request;
  }

  async updateTimeOffRequest(id: string, updates: any): Promise<any> {
    const [request] = await db
      .update(timeOffRequests)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(timeOffRequests.id, id))
      .returning();
    return request;
  }

  // Time Clock Event operations
  async getTimeClockEvents(userId: string, startDate?: string, endDate?: string): Promise<any[]> {
    let conditions = [eq(timeClockEvents.userId, userId)];
    
    if (startDate) {
      conditions.push(gte(timeClockEvents.eventTime, new Date(startDate)));
    }
    if (endDate) {
      conditions.push(lte(timeClockEvents.eventTime, new Date(endDate)));
    }

    return await db
      .select()
      .from(timeClockEvents)
      .where(and(...conditions))
      .orderBy(desc(timeClockEvents.eventTime));
  }

  async getLatestClockEvent(userId: string): Promise<any> {
    const [event] = await db
      .select()
      .from(timeClockEvents)
      .where(eq(timeClockEvents.userId, userId))
      .orderBy(desc(timeClockEvents.eventTime))
      .limit(1);
    return event;
  }

  async createTimeClockEvent(eventData: any): Promise<any> {
    const [event] = await db.insert(timeClockEvents).values(eventData).returning();
    return event;
  }

  async updateTimeClockEvent(id: string, updates: any): Promise<any> {
    const [event] = await db
      .update(timeClockEvents)
      .set(updates)
      .where(eq(timeClockEvents.id, id))
      .returning();
    return event;
  }

  // Timesheet operations
  async getAllTimesheets(filters?: { status?: string; periodStart?: string; periodEnd?: string }): Promise<any[]> {
    let conditions = [];
    if (filters?.status) {
      conditions.push(eq(timesheets.status, filters.status));
    }
    if (filters?.periodStart) {
      conditions.push(gte(timesheets.periodStart, filters.periodStart));
    }
    if (filters?.periodEnd) {
      conditions.push(lte(timesheets.periodEnd, filters.periodEnd));
    }

    const results = await db
      .select({
        timesheet: timesheets,
        user: {
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
        },
      })
      .from(timesheets)
      .leftJoin(users, eq(timesheets.userId, users.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(timesheets.periodStart));

    return results.map((row) => ({ ...row.timesheet, user: row.user }));
  }

  async getTimesheetsByUserId(userId: string): Promise<any[]> {
    return await db
      .select()
      .from(timesheets)
      .where(eq(timesheets.userId, userId))
      .orderBy(desc(timesheets.periodStart));
  }

  async getTimesheet(id: string): Promise<any> {
    const [result] = await db
      .select({
        timesheet: timesheets,
        user: {
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
        },
      })
      .from(timesheets)
      .leftJoin(users, eq(timesheets.userId, users.id))
      .where(eq(timesheets.id, id));

    if (!result) return null;
    return { ...result.timesheet, user: result.user };
  }

  async createTimesheet(timesheetData: any): Promise<any> {
    const [timesheet] = await db.insert(timesheets).values(timesheetData).returning();
    return timesheet;
  }

  async updateTimesheet(id: string, updates: any): Promise<any> {
    const [timesheet] = await db
      .update(timesheets)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(timesheets.id, id))
      .returning();
    return timesheet;
  }

  // Labor Rule operations
  async getAllLaborRules(entityId?: string): Promise<any[]> {
    if (entityId) {
      return await db.select().from(laborRules).where(and(eq(laborRules.isActive, true), eq(laborRules.entityId, entityId))).orderBy(laborRules.name);
    }
    return await db.select().from(laborRules).where(eq(laborRules.isActive, true)).orderBy(laborRules.name);
  }

  async getLaborRule(id: string): Promise<any> {
    const [rule] = await db.select().from(laborRules).where(eq(laborRules.id, id));
    return rule;
  }

  async createLaborRule(ruleData: any): Promise<any> {
    const [rule] = await db.insert(laborRules).values(ruleData).returning();
    return rule;
  }

  async updateLaborRule(id: string, updates: any): Promise<any> {
    const [rule] = await db
      .update(laborRules)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(laborRules.id, id))
      .returning();
    return rule;
  }

  async deleteLaborRule(id: string): Promise<void> {
    await db.update(laborRules).set({ isActive: false }).where(eq(laborRules.id, id));
  }

  // ==========================================
  // RECRUITING / ATS OPERATIONS
  // ==========================================

  async getAllRequisitions(filters?: { status?: string; department?: string; recruiterId?: string }): Promise<any[]> {
    let query = db.select().from(jobRequisitions);
    const conditions: any[] = [];
    if (filters?.status) conditions.push(eq(jobRequisitions.status, filters.status));
    if (filters?.department) conditions.push(eq(jobRequisitions.department, filters.department));
    if (filters?.recruiterId) conditions.push(eq(jobRequisitions.recruiterId, filters.recruiterId));
    if (conditions.length > 0) query = query.where(and(...conditions)) as any;
    return await query.orderBy(desc(jobRequisitions.createdAt));
  }

  async getRequisition(id: string): Promise<any> {
    const [result] = await db.select().from(jobRequisitions).where(eq(jobRequisitions.id, id));
    return result;
  }

  async getRequisitionWithStats(id: string): Promise<any> {
    const [req] = await db.select().from(jobRequisitions).where(eq(jobRequisitions.id, id));
    if (!req) return null;
    const apps = await db.select().from(applications).where(eq(applications.requisitionId, id));
    return { ...req, applicationCount: apps.length };
  }

  async createRequisition(requisition: any): Promise<any> {
    const [result] = await db.insert(jobRequisitions).values(requisition).returning();
    return result;
  }

  async updateRequisition(id: string, updates: any): Promise<any> {
    const [result] = await db.update(jobRequisitions).set({ ...updates, updatedAt: new Date() }).where(eq(jobRequisitions.id, id)).returning();
    return result;
  }

  async deleteRequisition(id: string): Promise<void> {
    await db.delete(jobRequisitions).where(eq(jobRequisitions.id, id));
  }

  async getAllCandidates(filters?: { search?: string; source?: string; inTalentPool?: boolean }): Promise<any[]> {
    let query = db.select().from(candidates);
    const conditions: any[] = [];
    if (filters?.source) conditions.push(eq(candidates.source, filters.source));
    if (filters?.inTalentPool !== undefined) conditions.push(eq(candidates.isInTalentPool, filters.inTalentPool));
    if (filters?.search) {
      conditions.push(or(
        ilike(candidates.firstName, `%${filters.search}%`),
        ilike(candidates.lastName, `%${filters.search}%`),
        ilike(candidates.email, `%${filters.search}%`)
      ));
    }
    if (conditions.length > 0) query = query.where(and(...conditions)) as any;
    return await query.orderBy(desc(candidates.createdAt));
  }

  async getCandidate(id: string): Promise<any> {
    const [result] = await db.select().from(candidates).where(eq(candidates.id, id));
    return result;
  }

  async getCandidateWithApplications(id: string): Promise<any> {
    const [cand] = await db.select().from(candidates).where(eq(candidates.id, id));
    if (!cand) return null;
    const apps = await db.select().from(applications).where(eq(applications.candidateId, id));
    return { ...cand, applications: apps };
  }

  async createCandidate(candidate: any): Promise<any> {
    const [result] = await db.insert(candidates).values(candidate).returning();
    return result;
  }

  async updateCandidate(id: string, updates: any): Promise<any> {
    const [result] = await db.update(candidates).set({ ...updates, updatedAt: new Date() }).where(eq(candidates.id, id)).returning();
    return result;
  }

  async deleteCandidate(id: string): Promise<void> {
    await db.delete(candidates).where(eq(candidates.id, id));
  }

  async getAllApplications(filters?: { requisitionId?: string; status?: string; stage?: string }): Promise<any[]> {
    let query = db.select().from(applications);
    const conditions: any[] = [];
    if (filters?.requisitionId) conditions.push(eq(applications.requisitionId, filters.requisitionId));
    if (filters?.status) conditions.push(eq(applications.status, filters.status));
    if (filters?.stage) conditions.push(eq(applications.stage, filters.stage));
    if (conditions.length > 0) query = query.where(and(...conditions)) as any;
    return await query.orderBy(desc(applications.appliedAt));
  }

  async getApplication(id: string): Promise<any> {
    const [result] = await db.select().from(applications).where(eq(applications.id, id));
    return result;
  }

  async getApplicationWithDetails(id: string): Promise<any> {
    const [app] = await db.select().from(applications).where(eq(applications.id, id));
    if (!app) return null;
    const [cand] = await db.select().from(candidates).where(eq(candidates.id, app.candidateId));
    const [req] = await db.select().from(jobRequisitions).where(eq(jobRequisitions.id, app.requisitionId));
    const ints = await db.select().from(interviews).where(eq(interviews.applicationId, id));
    return { ...app, candidate: cand, requisition: req, interviews: ints };
  }

  async getApplicationsByRequisitionId(requisitionId: string): Promise<any[]> {
    return await db.select().from(applications).where(eq(applications.requisitionId, requisitionId)).orderBy(desc(applications.appliedAt));
  }

  async getApplicationsByCandidateId(candidateId: string): Promise<any[]> {
    return await db.select().from(applications).where(eq(applications.candidateId, candidateId)).orderBy(desc(applications.appliedAt));
  }

  async createApplication(application: any): Promise<any> {
    const [result] = await db.insert(applications).values(application).returning();
    return result;
  }

  async updateApplication(id: string, updates: any): Promise<any> {
    const [result] = await db.update(applications).set({ ...updates, updatedAt: new Date() }).where(eq(applications.id, id)).returning();
    return result;
  }

  async updateApplicationStatus(id: string, status: string, rejectionReason?: string, rejectedBy?: string): Promise<any> {
    const updates: any = { status, updatedAt: new Date() };
    if (status === 'rejected') {
      updates.rejectionReason = rejectionReason;
      updates.rejectedBy = rejectedBy;
      updates.rejectedAt = new Date();
    } else if (status === 'hired') {
      updates.hiredAt = new Date();
    }
    const [result] = await db.update(applications).set(updates).where(eq(applications.id, id)).returning();
    return result;
  }

  async deleteApplication(id: string): Promise<void> {
    await db.delete(applications).where(eq(applications.id, id));
  }

  async getAllInterviews(filters?: { applicationId?: string; status?: string; startDate?: string; endDate?: string }): Promise<any[]> {
    let query = db.select().from(interviews);
    const conditions: any[] = [];
    if (filters?.applicationId) conditions.push(eq(interviews.applicationId, filters.applicationId));
    if (filters?.status) conditions.push(eq(interviews.status, filters.status));
    if (conditions.length > 0) query = query.where(and(...conditions)) as any;
    return await query.orderBy(desc(interviews.scheduledAt));
  }

  async getInterview(id: string): Promise<any> {
    const [result] = await db.select().from(interviews).where(eq(interviews.id, id));
    return result;
  }

  async getInterviewsByApplicationId(applicationId: string): Promise<any[]> {
    return await db.select().from(interviews).where(eq(interviews.applicationId, applicationId)).orderBy(interviews.scheduledAt);
  }

  async createInterview(interview: any): Promise<any> {
    const [result] = await db.insert(interviews).values(interview).returning();
    return result;
  }

  async updateInterview(id: string, updates: any): Promise<any> {
    const [result] = await db.update(interviews).set({ ...updates, updatedAt: new Date() }).where(eq(interviews.id, id)).returning();
    return result;
  }

  async deleteInterview(id: string): Promise<void> {
    await db.delete(interviews).where(eq(interviews.id, id));
  }

  async getScorecardsByInterviewId(interviewId: string): Promise<any[]> {
    return await db.select().from(interviewScorecards).where(eq(interviewScorecards.interviewId, interviewId));
  }

  async getScorecard(id: string): Promise<any> {
    const [result] = await db.select().from(interviewScorecards).where(eq(interviewScorecards.id, id));
    return result;
  }

  async createScorecard(scorecard: any): Promise<any> {
    const [result] = await db.insert(interviewScorecards).values(scorecard).returning();
    return result;
  }

  async updateScorecard(id: string, updates: any): Promise<any> {
    const [result] = await db.update(interviewScorecards).set({ ...updates, updatedAt: new Date() }).where(eq(interviewScorecards.id, id)).returning();
    return result;
  }

  async getAllOffers(filters?: { status?: string; applicationId?: string }): Promise<any[]> {
    let query = db.select().from(offers);
    const conditions: any[] = [];
    if (filters?.status) conditions.push(eq(offers.status, filters.status));
    if (filters?.applicationId) conditions.push(eq(offers.applicationId, filters.applicationId));
    if (conditions.length > 0) query = query.where(and(...conditions)) as any;
    return await query.orderBy(desc(offers.createdAt));
  }

  async getOffer(id: string): Promise<any> {
    const [result] = await db.select().from(offers).where(eq(offers.id, id));
    return result;
  }

  async getOfferByApplicationId(applicationId: string): Promise<any> {
    const [result] = await db.select().from(offers).where(eq(offers.applicationId, applicationId));
    return result;
  }

  async createOffer(offer: any): Promise<any> {
    const [result] = await db.insert(offers).values(offer).returning();
    return result;
  }

  async updateOffer(id: string, updates: any): Promise<any> {
    const [result] = await db.update(offers).set({ ...updates, updatedAt: new Date() }).where(eq(offers.id, id)).returning();
    return result;
  }

  async deleteOffer(id: string): Promise<void> {
    await db.delete(offers).where(eq(offers.id, id));
  }

  async getCommunicationsByCandidateId(candidateId: string): Promise<any[]> {
    return await db.select().from(recruitingCommunications).where(eq(recruitingCommunications.candidateId, candidateId)).orderBy(desc(recruitingCommunications.createdAt));
  }

  async getCommunicationsByApplicationId(applicationId: string): Promise<any[]> {
    return await db.select().from(recruitingCommunications).where(eq(recruitingCommunications.applicationId, applicationId)).orderBy(desc(recruitingCommunications.createdAt));
  }

  async createCommunication(communication: any): Promise<any> {
    const [result] = await db.insert(recruitingCommunications).values(communication).returning();
    return result;
  }

  async getActivitiesByApplicationId(applicationId: string): Promise<any[]> {
    return await db.select().from(applicationActivities).where(eq(applicationActivities.applicationId, applicationId)).orderBy(desc(applicationActivities.createdAt));
  }

  async createApplicationActivity(activity: any): Promise<any> {
    const [result] = await db.insert(applicationActivities).values(activity).returning();
    return result;
  }

  async getRecruitingStats(): Promise<{
    openRequisitions: number;
    totalCandidates: number;
    activeApplications: number;
    pendingInterviews: number;
    pendingOffers: number;
    hiredThisMonth: number;
    avgTimeToHire: number;
    pipelineByStage: { stage: string; count: number }[];
    sourceEffectiveness: { source: string; count: number; hiredCount: number }[];
  }> {
    const openReqs = await db.select().from(jobRequisitions).where(eq(jobRequisitions.status, 'open'));
    const allCandidates = await db.select().from(candidates);
    const activeApps = await db.select().from(applications).where(and(
      or(eq(applications.status, 'new'), eq(applications.status, 'screening'), eq(applications.status, 'interview'), eq(applications.status, 'offer'))
    ));
    const pendingInts = await db.select().from(interviews).where(eq(interviews.status, 'scheduled'));
    const pendingOffers = await db.select().from(offers).where(or(eq(offers.status, 'sent'), eq(offers.status, 'approved')));
    
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const hiredApps = await db.select().from(applications).where(and(
      eq(applications.status, 'hired'),
      gte(applications.hiredAt, startOfMonth)
    ));

    return {
      openRequisitions: openReqs.length,
      totalCandidates: allCandidates.length,
      activeApplications: activeApps.length,
      pendingInterviews: pendingInts.length,
      pendingOffers: pendingOffers.length,
      hiredThisMonth: hiredApps.length,
      avgTimeToHire: 0,
      pipelineByStage: [],
      sourceEffectiveness: [],
    };
  }

  // ==========================================
  // INVOICING & A/R MANAGEMENT OPERATIONS
  // ==========================================

  // Billable Charge operations
  async getAllBillableCharges(filters?: { 
    customerId?: string; 
    status?: string; 
    startDate?: string; 
    endDate?: string;
    sourceType?: string;
  }): Promise<BillableCharge[]> {
    let query = db.select().from(billableCharges);
    const conditions: any[] = [];
    if (filters?.customerId) conditions.push(eq(billableCharges.customerId, filters.customerId));
    if (filters?.status) conditions.push(eq(billableCharges.status, filters.status));
    if (filters?.sourceType) conditions.push(eq(billableCharges.sourceType, filters.sourceType));
    if (filters?.startDate) conditions.push(gte(billableCharges.chargeDate, filters.startDate));
    if (filters?.endDate) conditions.push(lte(billableCharges.chargeDate, filters.endDate));
    if (conditions.length > 0) query = query.where(and(...conditions)) as any;
    return await query.orderBy(desc(billableCharges.chargeDate));
  }

  async getBillableCharge(id: string): Promise<BillableCharge | undefined> {
    const [result] = await db.select().from(billableCharges).where(eq(billableCharges.id, id));
    return result;
  }

  async getBillableChargesByCustomer(customerId: string): Promise<BillableCharge[]> {
    return await db.select().from(billableCharges).where(eq(billableCharges.customerId, customerId)).orderBy(desc(billableCharges.chargeDate));
  }

  async getBillableChargesForInvoicing(customerId: string): Promise<BillableCharge[]> {
    return await db.select().from(billableCharges).where(and(
      eq(billableCharges.customerId, customerId),
      eq(billableCharges.status, 'approved')
    )).orderBy(billableCharges.chargeDate);
  }

  async createBillableCharge(charge: InsertBillableCharge): Promise<BillableCharge> {
    const [result] = await db.insert(billableCharges).values(charge).returning();
    return result;
  }

  async createBillableCharges(charges: InsertBillableCharge[]): Promise<BillableCharge[]> {
    if (charges.length === 0) return [];
    return await db.insert(billableCharges).values(charges).returning();
  }

  async updateBillableCharge(id: string, updates: Partial<InsertBillableCharge>): Promise<BillableCharge | undefined> {
    const [result] = await db.update(billableCharges).set({ ...updates, updatedAt: new Date() }).where(eq(billableCharges.id, id)).returning();
    return result;
  }

  async approveBillableCharge(id: string, approvedBy: string, notes?: string): Promise<BillableCharge | undefined> {
    const [result] = await db.update(billableCharges).set({ 
      status: 'approved',
      approvedBy,
      approvedAt: new Date(),
      approvalNotes: notes,
      updatedAt: new Date()
    }).where(eq(billableCharges.id, id)).returning();
    return result;
  }

  async deleteBillableCharge(id: string): Promise<void> {
    await db.delete(billableCharges).where(eq(billableCharges.id, id));
  }

  async generateChargesFromTimesheets(customerId: string, periodStart: string, periodEnd: string, createdBy: string): Promise<BillableCharge[]> {
    // Get approved timesheets for the period that are linked to this customer's employees/drivers
    // This is a simplified implementation - in production you'd have more complex logic
    const approvedTimesheets = await db.select().from(timesheets).where(and(
      eq(timesheets.status, 'approved'),
      gte(timesheets.periodStart, periodStart),
      lte(timesheets.periodEnd, periodEnd)
    ));

    const charges: InsertBillableCharge[] = [];
    for (const ts of approvedTimesheets) {
      const totalHours = parseFloat(ts.totalHours || '0');
      if (totalHours > 0) {
        charges.push({
          sourceType: 'timesheet',
          sourceId: ts.id,
          customerId,
          chargeDate: ts.periodEnd,
          serviceType: 'hourly_labor',
          description: `Labor hours for ${ts.periodStart} to ${ts.periodEnd}`,
          quantity: ts.totalHours || '0',
          unitRate: '0', // Would be set from customer billing profile
          amount: '0', // Would be calculated
          status: 'draft',
          createdBy,
        });
      }
    }

    if (charges.length === 0) return [];
    return await db.insert(billableCharges).values(charges).returning();
  }

  // Customer Billing Profile operations
  async getCustomerBillingProfile(customerId: string): Promise<CustomerBillingProfile | undefined> {
    const [result] = await db.select().from(customerBillingProfiles).where(eq(customerBillingProfiles.customerId, customerId));
    return result;
  }

  async createCustomerBillingProfile(profile: InsertCustomerBillingProfile): Promise<CustomerBillingProfile> {
    const [result] = await db.insert(customerBillingProfiles).values(profile).returning();
    return result;
  }

  async updateCustomerBillingProfile(customerId: string, updates: Partial<InsertCustomerBillingProfile>): Promise<CustomerBillingProfile | undefined> {
    const [result] = await db.update(customerBillingProfiles).set({ ...updates, updatedAt: new Date() }).where(eq(customerBillingProfiles.customerId, customerId)).returning();
    return result;
  }

  // Invoice Activity Timeline operations
  async getInvoiceActivities(invoiceId: string): Promise<InvoiceActivity[]> {
    return await db.select().from(invoiceActivities)
      .where(eq(invoiceActivities.invoiceId, invoiceId))
      .orderBy(desc(invoiceActivities.createdAt));
  }

  async createInvoiceActivity(data: InsertInvoiceActivity): Promise<InvoiceActivity> {
    const [result] = await db.insert(invoiceActivities).values(data).returning();
    return result;
  }

  // Reminder Schedule operations
  async getReminderSchedules(): Promise<ReminderSchedule[]> {
    return await db.select().from(reminderSchedules).orderBy(reminderSchedules.dayOffset);
  }

  async getReminderSchedule(id: string): Promise<ReminderSchedule | undefined> {
    const [result] = await db.select().from(reminderSchedules).where(eq(reminderSchedules.id, id)).limit(1);
    return result;
  }

  async createReminderSchedule(data: InsertReminderSchedule): Promise<ReminderSchedule> {
    const [result] = await db.insert(reminderSchedules).values(data).returning();
    return result;
  }

  async updateReminderSchedule(id: string, updates: Partial<InsertReminderSchedule>): Promise<ReminderSchedule | undefined> {
    const [result] = await db.update(reminderSchedules).set({ ...updates, updatedAt: new Date() }).where(eq(reminderSchedules.id, id)).returning();
    return result;
  }

  async deleteReminderSchedule(id: string): Promise<boolean> {
    const result = await db.delete(reminderSchedules).where(eq(reminderSchedules.id, id));
    return true;
  }

  async seedDefaultReminderSchedules(): Promise<void> {
    const existing = await this.getReminderSchedules();
    if (existing.length > 0) return;

    const defaultSchedules = [
      { name: '3 Days Before Due', dayOffset: 3, emailSubject: 'Upcoming Invoice Due - Invoice #{invoice_number}', emailTemplate: 'Your invoice #{invoice_number} for {amount} is due on {due_date}. Please make your payment to avoid any late fees.', isActive: true },
      { name: 'On Due Date', dayOffset: 0, emailSubject: 'Invoice Due Today - Invoice #{invoice_number}', emailTemplate: 'Your invoice #{invoice_number} for {amount} is due today. Please make your payment to keep your account in good standing.', isActive: true },
      { name: '7 Days Overdue', dayOffset: -7, emailSubject: 'Past Due Notice - Invoice #{invoice_number}', emailTemplate: 'Your invoice #{invoice_number} for {amount} is now 7 days overdue. Please make your payment as soon as possible.', isActive: true },
      { name: '14 Days Overdue', dayOffset: -14, emailSubject: 'Second Past Due Notice - Invoice #{invoice_number}', emailTemplate: 'Your invoice #{invoice_number} for {amount} is now 14 days overdue. Immediate payment is required.', isActive: true },
      { name: '30 Days Overdue (Escalation)', dayOffset: -30, emailSubject: 'Final Notice - Invoice #{invoice_number}', emailTemplate: 'Your invoice #{invoice_number} for {amount} is now 30 days overdue. This is an escalation notice. Please contact us immediately to resolve this matter.', isActive: true, isEscalation: true },
    ];

    for (const schedule of defaultSchedules) {
      await this.createReminderSchedule(schedule);
    }
    console.log('[Reminders] Default reminder schedules created');
  }

  // Extended Invoice operations
  async getInvoiceWithLineItems(id: string): Promise<(Invoice & { lineItems: InvoiceLineItem[] }) | undefined> {
    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, id));
    if (!invoice) return undefined;
    const lineItems = await db.select().from(invoiceLineItems).where(eq(invoiceLineItems.invoiceId, id)).orderBy(invoiceLineItems.lineNumber);
    return { ...invoice, lineItems };
  }

  async getInvoicesByCustomer(customerId: string): Promise<Invoice[]> {
    return await db.select().from(invoices).where(eq(invoices.customerId, customerId)).orderBy(desc(invoices.invoiceDate));
  }

  async getInvoicesForAging(): Promise<Invoice[]> {
    return await db.select().from(invoices).where(and(
      or(eq(invoices.status, 'sent'), eq(invoices.status, 'partially_paid'), eq(invoices.status, 'overdue'))
    )).orderBy(invoices.dueDate);
  }

  async generateInvoiceNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `INV-${year}-`;
    const latestInvoices = await db.select({ invoiceNumber: invoices.invoiceNumber })
      .from(invoices)
      .where(and(
        ilike(invoices.invoiceNumber, `${prefix}%`),
        eq(invoices.invoiceNumberFinalized, true) // Only count finalized numbers
      ))
      .orderBy(desc(invoices.invoiceNumber))
      .limit(1);
    
    let nextNumber = 1;
    if (latestInvoices.length > 0) {
      const lastNumber = parseInt(latestInvoices[0].invoiceNumber.replace(prefix, '')) || 0;
      nextNumber = lastNumber + 1;
    }
    return `${prefix}${nextNumber.toString().padStart(5, '0')}`;
  }

  // Generate a draft invoice number (placeholder that won't consume sequence numbers)
  async generateDraftInvoiceNumber(): Promise<{ invoiceNumber: string; draftSequence: number }> {
    const year = new Date().getFullYear();
    
    // Find the highest draft sequence across ALL invoices (finalized or not) to avoid collisions
    const allDrafts = await db.select({ draftSequence: invoices.draftSequence })
      .from(invoices)
      .where(sql`${invoices.draftSequence} IS NOT NULL`)
      .orderBy(desc(invoices.draftSequence))
      .limit(1);
    
    // Also check for any existing DRAFT-YYYY-XXXXX numbers to avoid unique constraint violations
    const existingDraftNumbers = await db.select({ invoiceNumber: invoices.invoiceNumber })
      .from(invoices)
      .where(sql`${invoices.invoiceNumber} LIKE ${'DRAFT-' + year + '-%'}`)
      .orderBy(desc(invoices.invoiceNumber))
      .limit(1);
    
    let nextDraftSequence = (allDrafts[0]?.draftSequence || 0) + 1;
    
    // Parse sequence from existing draft numbers as a fallback check
    if (existingDraftNumbers.length > 0) {
      const match = existingDraftNumbers[0].invoiceNumber.match(/DRAFT-\d{4}-(\d+)/);
      if (match) {
        const existingSeq = parseInt(match[1], 10);
        if (existingSeq >= nextDraftSequence) {
          nextDraftSequence = existingSeq + 1;
        }
      }
    }
    
    const invoiceNumber = `DRAFT-${year}-${nextDraftSequence.toString().padStart(5, '0')}`;
    
    return { invoiceNumber, draftSequence: nextDraftSequence };
  }

  // Helper function to convert payment terms to number of days
  private getPaymentTermDays(paymentTerms: string): number {
    const termMap: Record<string, number> = {
      'due_on_receipt': 0,
      'net_7': 7,
      'net_10': 10,
      'net_15': 15,
      'net_21': 21,
      'net_30': 30,
      'net_45': 45,
      'net_60': 60,
      'net_90': 90,
    };
    return termMap[paymentTerms] ?? 30; // Default to 30 days
  }

  async createInvoiceWithLineItems(invoice: InsertInvoice, lineItems: InsertInvoiceLineItem[]): Promise<Invoice & { lineItems: InvoiceLineItem[] }> {
    // Apply billing profile defaults if customer has one
    let invoiceWithDefaults = { ...invoice };
    
    if (invoice.customerId) {
      const [billingProfile] = await db.select()
        .from(customerBillingProfiles)
        .where(eq(customerBillingProfiles.customerId, invoice.customerId));
      
      if (billingProfile) {
        // Apply payment terms from billing profile if not explicitly set
        if (!invoice.paymentTerms && billingProfile.paymentTerms) {
          invoiceWithDefaults.paymentTerms = billingProfile.paymentTerms;
        }
        
        // Calculate due date based on payment terms if not set
        if (!invoice.dueDate && invoiceWithDefaults.paymentTerms && invoice.invoiceDate) {
          const invoiceDate = new Date(invoice.invoiceDate);
          const termDays = this.getPaymentTermDays(invoiceWithDefaults.paymentTerms);
          const dueDate = new Date(invoiceDate);
          dueDate.setDate(dueDate.getDate() + termDays);
          invoiceWithDefaults.dueDate = dueDate.toISOString().split('T')[0];
        }
      }
    }
    
    const [createdInvoice] = await db.insert(invoices).values(invoiceWithDefaults).returning();
    const lineItemsWithInvoiceId = lineItems.map((li, index) => ({
      ...li,
      invoiceId: createdInvoice.id,
      lineNumber: index + 1,
    }));
    const createdLineItems = lineItemsWithInvoiceId.length > 0 
      ? await db.insert(invoiceLineItems).values(lineItemsWithInvoiceId).returning()
      : [];
    
    // Create audit log entry for invoice creation
    await db.insert(invoiceAuditLog).values({
      invoiceId: createdInvoice.id,
      action: 'created',
      performedBy: invoice.createdBy,
      newValues: { 
        invoiceNumber: createdInvoice.invoiceNumber,
        customerId: createdInvoice.customerId,
        totalAmount: createdInvoice.totalAmount,
        status: createdInvoice.status,
        lineItemCount: createdLineItems.length,
      },
      notes: `Invoice ${createdInvoice.invoiceNumber} created`,
    });
    
    // Record initial status history
    await db.insert(invoiceStatusHistory).values({
      invoiceId: createdInvoice.id,
      previousStatus: null,
      newStatus: createdInvoice.status || 'draft',
      changedBy: invoice.createdBy,
      reason: 'Invoice created',
    });
    
    return { ...createdInvoice, lineItems: createdLineItems };
  }

  async createInvoiceRevision(invoiceId: string, userId: string, reason: string, revisionType: string): Promise<Invoice> {
    const source = await this.getInvoice(invoiceId);
    if (!source) throw new Error('Invoice not found');

    const allowedForDirectRevision = source.status === 'draft' || source.approvalWorkflowState === 'rejected';
    const requiresFinanceApproval = !allowedForDirectRevision && ['sent', 'viewed', 'overdue', 'partially_paid'].includes(source.status || '');

    if (!allowedForDirectRevision && !requiresFinanceApproval) {
      throw new Error(`Cannot revise invoice in status "${source.status}". Only draft, rejected, or sent/viewed/overdue/partially_paid invoices can be revised.`);
    }

    const originalId = source.originalInvoiceId || source.id;
    const existingVersions = await db.select().from(invoices)
      .where(sql`${invoices.originalInvoiceId} = ${originalId} OR ${invoices.id} = ${originalId}`)
      .orderBy(desc(invoices.versionNumber));
    const nextVersion = (existingVersions[0]?.versionNumber || 1) + 1;

    await db.update(invoices)
      .set({ isCurrentVersion: false, updatedAt: new Date() })
      .where(sql`${invoices.id} = ${source.id} OR (${invoices.originalInvoiceId} = ${originalId} AND ${invoices.isCurrentVersion} = true)`);

    const sourceLineItems = await this.getInvoiceLineItems(invoiceId);
    const { invoiceNumber, draftSequence } = await this.generateDraftInvoiceNumber();
    const today = new Date().toISOString().split('T')[0];
    const dueDate = source.dueDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const effectiveRevisionType = requiresFinanceApproval ? 'finance_approved' : (revisionType || 'standard');

    const newInvoice = await this.createInvoiceWithLineItems(
      {
        invoiceNumber,
        draftSequence,
        invoiceNumberFinalized: false,
        customerId: source.customerId,
        customerName: source.customerName,
        invoiceDate: today,
        dueDate,
        billingEntityId: source.billingEntityId,
        locationId: source.locationId,
        billingPeriodStart: source.billingPeriodStart,
        billingPeriodEnd: source.billingPeriodEnd,
        paymentTerms: source.paymentTerms,
        subtotalAmount: source.subtotalAmount,
        taxAmount: source.taxAmount,
        feesAmount: source.feesAmount,
        totalAmount: source.totalAmount || '0',
        paidAmount: '0.00',
        creditApplied: '0.00',
        balanceDue: source.totalAmount,
        currency: source.currency,
        status: 'draft',
        poNumber: source.poNumber,
        referenceNumber: source.referenceNumber,
        customerMemo: source.customerMemo,
        internalNotes: `Revision v${nextVersion} of invoice ${source.invoiceNumber}. Reason: ${reason}`,
        notes: source.notes,
        createdBy: userId,
        termsText: source.termsText,
        footerNotes: source.footerNotes,
        remittanceInstructions: source.remittanceInstructions,
        versionNumber: nextVersion,
        originalInvoiceId: originalId,
        previousVersionId: source.id,
        isCurrentVersion: true,
        revisionReason: reason,
        revisionType: effectiveRevisionType,
        financeApprovalRequired: requiresFinanceApproval,
        financeApprovalStatus: requiresFinanceApproval ? 'pending' : null,
      },
      sourceLineItems.map(li => ({
        invoiceId: '',
        lineNumber: li.lineNumber,
        lineItemType: li.lineItemType,
        category: li.category || 'service',
        serviceType: li.serviceType,
        description: li.description,
        quantity: li.quantity,
        unitPrice: li.unitPrice,
        totalPrice: li.totalPrice,
        taxable: li.taxable,
        notes: li.notes,
      }))
    );

    await this.logInvoiceAction(
      newInvoice.id,
      'revision_created',
      userId,
      null,
      {
        versionNumber: nextVersion,
        previousVersionId: source.id,
        previousInvoiceNumber: source.invoiceNumber,
        originalInvoiceId: originalId,
        revisionType: effectiveRevisionType,
        revisionReason: reason,
        financeApprovalRequired: requiresFinanceApproval,
      },
      `Revision v${nextVersion} created from ${source.invoiceNumber}. Reason: ${reason}`
    );

    await this.logInvoiceAction(
      source.id,
      'superseded_by_revision',
      userId,
      null,
      { newVersionId: newInvoice.id, newVersionNumber: nextVersion },
      `Superseded by revision v${nextVersion} (${newInvoice.invoiceNumber})`
    );

    return newInvoice;
  }

  async getInvoiceVersions(invoiceId: string): Promise<Invoice[]> {
    const invoice = await this.getInvoice(invoiceId);
    if (!invoice) return [];
    const originalId = invoice.originalInvoiceId || invoice.id;
    const versions = await db.select().from(invoices)
      .where(sql`${invoices.id} = ${originalId} OR ${invoices.originalInvoiceId} = ${originalId}`)
      .orderBy(desc(invoices.versionNumber));
    return versions;
  }

  async financeApproveRevision(invoiceId: string, userId: string, approved: boolean, notes?: string): Promise<Invoice | undefined> {
    const invoice = await this.getInvoice(invoiceId);
    if (!invoice) return undefined;
    if (!invoice.financeApprovalRequired || invoice.financeApprovalStatus !== 'pending') {
      throw new Error('This invoice does not have a pending finance approval');
    }

    const status = approved ? 'approved' : 'rejected';
    const [updated] = await db.update(invoices)
      .set({
        financeApprovalStatus: status,
        financeApprovedBy: userId,
        financeApprovedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, invoiceId))
      .returning();

    await this.logInvoiceAction(
      invoiceId,
      approved ? 'finance_revision_approved' : 'finance_revision_rejected',
      userId,
      null,
      { financeApprovalStatus: status, notes },
      `Finance revision ${status}${notes ? ': ' + notes : ''}`
    );

    return updated;
  }

  // ======== Invoice SLA Rules & Breaches ========

  async getInvoiceSlaRules(): Promise<InvoiceSlaRule[]> {
    return await db.select().from(invoiceSlaRules).orderBy(invoiceSlaRules.createdAt);
  }

  async createInvoiceSlaRule(data: InsertInvoiceSlaRule): Promise<InvoiceSlaRule> {
    const [rule] = await db.insert(invoiceSlaRules).values(data).returning();
    return rule;
  }

  async updateInvoiceSlaRule(id: string, data: Partial<InsertInvoiceSlaRule>): Promise<InvoiceSlaRule | undefined> {
    const [updated] = await db.update(invoiceSlaRules)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(invoiceSlaRules.id, id))
      .returning();
    return updated;
  }

  async deleteInvoiceSlaRule(id: string): Promise<boolean> {
    const result = await db.delete(invoiceSlaRules).where(eq(invoiceSlaRules.id, id));
    return true;
  }

  async evaluateInvoiceSlaBreaches(): Promise<{ created: number; cleared: number }> {
    const rules = await db.select().from(invoiceSlaRules).where(eq(invoiceSlaRules.isActive, true));
    if (rules.length === 0) return { created: 0, cleared: 0 };

    let created = 0;
    let cleared = 0;

    const clearableStatuses = ['paid', 'void', 'written_off', 'cancelled'];
    const disputeStatus = 'disputed';

    const allInvoices = await db.select().from(invoices).where(
      and(eq(invoices.isCurrentVersion, true))
    );

    for (const invoice of allInvoices) {
      const shouldClear = clearableStatuses.includes(invoice.status || '') || invoice.status === disputeStatus;

      if (shouldClear) {
        const unclearedBreaches = await db.select().from(invoiceSlaBreaches)
          .where(and(
            eq(invoiceSlaBreaches.invoiceId, invoice.id),
            or(eq(invoiceSlaBreaches.status, 'active'), eq(invoiceSlaBreaches.status, 'acknowledged'))
          ));
        for (const breach of unclearedBreaches) {
          await db.update(invoiceSlaBreaches)
            .set({ status: 'cleared', clearedAt: new Date(), clearedReason: invoice.status || 'manual' })
            .where(eq(invoiceSlaBreaches.id, breach.id));
          cleared++;
        }
        if (unclearedBreaches.length > 0) {
          await db.update(invoices)
            .set({ slaStatus: 'ok', escalationRequired: false, updatedAt: new Date() })
            .where(eq(invoices.id, invoice.id));
        }
        continue;
      }

      const now = new Date();

      for (const rule of rules) {
        let breached = false;

        if (rule.triggerType === 'not_sent_after_service' && rule.thresholdDays) {
          const refDate = invoice.serviceCompletionDate || invoice.invoiceDate;
          if (refDate && !invoice.sentAt) {
            const refTime = new Date(refDate).getTime();
            const daysSince = Math.floor((now.getTime() - refTime) / (1000 * 60 * 60 * 24));
            if (daysSince > rule.thresholdDays) {
              breached = true;
            }
          }
        }

        if (rule.triggerType === 'unpaid_past_due' && rule.thresholdDays) {
          if (invoice.dueDate && (invoice.status === 'sent' || invoice.status === 'viewed' || invoice.status === 'overdue' || invoice.status === 'partially_paid')) {
            const dueTime = new Date(invoice.dueDate).getTime();
            const daysPastDue = Math.floor((now.getTime() - dueTime) / (1000 * 60 * 60 * 24));
            if (daysPastDue > rule.thresholdDays) {
              breached = true;
            }
          }
        }

        if (rule.triggerType === 'unpaid_after_reminders' && rule.thresholdReminders) {
          if ((invoice.remindersSentCount || 0) >= rule.thresholdReminders &&
              invoice.status !== 'paid' && invoice.status !== 'void' && invoice.status !== 'draft') {
            breached = true;
          }
        }

        if (breached) {
          const existingBreach = await db.select().from(invoiceSlaBreaches)
            .where(and(
              eq(invoiceSlaBreaches.invoiceId, invoice.id),
              eq(invoiceSlaBreaches.ruleId, rule.id),
              eq(invoiceSlaBreaches.status, 'active')
            ));
          if (existingBreach.length === 0) {
            await db.insert(invoiceSlaBreaches).values({
              invoiceId: invoice.id,
              ruleId: rule.id,
              triggerType: rule.triggerType,
              severity: rule.severity,
              escalationAction: rule.escalationAction,
              assignedToUserId: rule.defaultCollectionsOwnerId,
              metadata: { thresholdDays: rule.thresholdDays, thresholdReminders: rule.thresholdReminders },
            });
            created++;

            let newSlaStatus = rule.severity === 'critical' ? 'breach' : 'at_risk';
            const updateData: any = { slaStatus: newSlaStatus, updatedAt: new Date() };

            if (rule.escalationAction === 'escalation_required' || rule.escalationAction === 'assign_collections') {
              updateData.escalationRequired = true;
              updateData.escalationRequiredAt = new Date();
            }
            if (rule.escalationAction === 'assign_collections' && rule.defaultCollectionsOwnerId) {
              updateData.collectionsOwnerId = rule.defaultCollectionsOwnerId;
              updateData.collectionsAssignedAt = new Date();
            }

            await db.update(invoices).set(updateData).where(eq(invoices.id, invoice.id));

            await this.logInvoiceAction(
              invoice.id,
              'sla_breach_detected',
              null,
              null,
              { ruleId: rule.id, ruleName: rule.name, triggerType: rule.triggerType, severity: rule.severity, escalationAction: rule.escalationAction },
              `SLA breach: ${rule.name} (${rule.triggerType})`
            );
          }
        }
      }
    }

    return { created, cleared };
  }

  async getInvoiceSlaBreaches(filters?: { invoiceId?: string; status?: string }): Promise<InvoiceSlaBreach[]> {
    const conditions = [];
    if (filters?.invoiceId) conditions.push(eq(invoiceSlaBreaches.invoiceId, filters.invoiceId));
    if (filters?.status) conditions.push(eq(invoiceSlaBreaches.status, filters.status));

    if (conditions.length > 0) {
      return await db.select().from(invoiceSlaBreaches)
        .where(and(...conditions))
        .orderBy(desc(invoiceSlaBreaches.breachedAt));
    }
    return await db.select().from(invoiceSlaBreaches)
      .orderBy(desc(invoiceSlaBreaches.breachedAt));
  }

  async acknowledgeInvoiceSlaBreach(id: string, userId: string): Promise<InvoiceSlaBreach | undefined> {
    const [updated] = await db.update(invoiceSlaBreaches)
      .set({ status: 'acknowledged', acknowledgedBy: userId, acknowledgedAt: new Date() })
      .where(eq(invoiceSlaBreaches.id, id))
      .returning();
    if (updated) {
      await this.logInvoiceAction(
        updated.invoiceId,
        'sla_breach_acknowledged',
        userId,
        null,
        { breachId: id, triggerType: updated.triggerType, severity: updated.severity },
        `SLA breach acknowledged: ${updated.triggerType}`
      );
    }
    return updated;
  }

  async assignInvoiceToCollections(invoiceId: string, ownerId: string, userId: string): Promise<Invoice | undefined> {
    const [updated] = await db.update(invoices)
      .set({
        collectionsOwnerId: ownerId,
        collectionsAssignedAt: new Date(),
        escalationRequired: true,
        escalationRequiredAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, invoiceId))
      .returning();

    if (updated) {
      await this.logInvoiceAction(
        invoiceId,
        'assigned_to_collections',
        userId,
        null,
        { collectionsOwnerId: ownerId },
        `Assigned to collections owner`
      );
    }
    return updated;
  }

  async consolidateCharges(customerId: string, chargeIds: string[], invoiceData: Partial<InsertInvoice>, userId: string): Promise<Invoice & { lineItems: InvoiceLineItem[] }> {
    const charges = await db.select().from(billableCharges).where(
      and(
        eq(billableCharges.customerId, customerId),
        inArray(billableCharges.id, chargeIds)
      )
    );
    if (charges.length === 0) throw new Error('No valid charges found');
    if (charges.length !== chargeIds.length) throw new Error('Some charges not found or do not belong to this customer');
    const invalidCharges = charges.filter(c => c.invoiceId || c.status === 'invoiced');
    if (invalidCharges.length > 0) throw new Error('Some charges are already invoiced');

    const lineItems: any[] = charges.map((charge, idx) => ({
      lineNumber: idx + 1,
      lineItemType: 'service',
      category: 'service',
      serviceType: charge.serviceType,
      description: charge.description,
      quantity: charge.quantity,
      unitPrice: charge.unitRate,
      totalPrice: charge.amount,
      chargeId: charge.id,
      sourceType: charge.sourceType,
      sourceId: charge.sourceId,
      dateOfService: charge.chargeDate,
      isTaxable: charge.isTaxable,
      taxRate: charge.taxRate,
      taxAmount: charge.taxAmount,
    }));

    const totalAmount = charges.reduce((sum, c) => sum + parseFloat(c.amount), 0);
    const { invoiceNumber } = await this.generateDraftInvoiceNumber();

    const customer = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1);
    const customerName = customer[0]?.companyName || customer[0]?.name || 'Unknown';

    const newInvoice: InsertInvoice = {
      invoiceNumber,
      customerId,
      customerName,
      invoiceDate: new Date().toISOString().split('T')[0],
      dueDate: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
      totalAmount: totalAmount.toFixed(2),
      subtotalAmount: totalAmount.toFixed(2),
      status: 'draft',
      isConsolidated: true,
      consolidationType: 'charges',
      createdBy: userId,
      ...invoiceData,
    };

    const result = await this.createInvoiceWithLineItems(newInvoice, lineItems);

    for (const charge of charges) {
      await db.update(billableCharges)
        .set({ status: 'invoiced', invoiceId: result.id, updatedAt: new Date() })
        .where(eq(billableCharges.id, charge.id));

      await db.insert(invoiceConsolidationSources).values({
        consolidatedInvoiceId: result.id,
        sourceType: 'charge',
        sourceChargeId: charge.id,
        sourceAmount: charge.amount,
        sourceDescription: charge.description,
      });
    }

    await this.logInvoiceAction(result.id, 'consolidated_from_charges', userId, null, { chargeIds, chargeCount: charges.length }, `Consolidated ${charges.length} charges`);

    return result;
  }

  async consolidateDraftInvoices(invoiceIds: string[], invoiceData: Partial<InsertInvoice>, userId: string): Promise<Invoice & { lineItems: InvoiceLineItem[] }> {
    const sourceInvoices = await db.select().from(invoices).where(
      and(
        inArray(invoices.id, invoiceIds),
        eq(invoices.status, 'draft'),
        eq(invoices.isCurrentVersion, true)
      )
    );
    if (sourceInvoices.length === 0) throw new Error('No valid draft invoices found');
    if (sourceInvoices.length !== invoiceIds.length) throw new Error('Some invoices not found or are not drafts');

    const customerIds = [...new Set(sourceInvoices.map(i => i.customerId).filter(Boolean))];
    if (customerIds.length > 1) throw new Error('All invoices must belong to the same customer');

    const allLineItems: any[] = [];
    let totalAmount = 0;

    for (const sourceInv of sourceInvoices) {
      const srcLineItems = await db.select().from(invoiceLineItems).where(eq(invoiceLineItems.invoiceId, sourceInv.id));
      for (const li of srcLineItems) {
        allLineItems.push({
          lineItemType: li.lineItemType,
          category: li.category,
          serviceType: li.serviceType,
          description: li.description,
          quantity: li.quantity,
          unitPrice: li.unitPrice,
          totalPrice: li.totalPrice,
          chargeId: li.chargeId,
          sourceType: 'invoice',
          sourceId: sourceInv.id,
          dateOfService: li.dateOfService,
          isTaxable: li.isTaxable,
          taxRate: li.taxRate,
          taxAmount: li.taxAmount,
          jobReference: li.jobReference,
          notes: li.notes,
        });
      }
      totalAmount += parseFloat(sourceInv.totalAmount);
    }

    allLineItems.forEach((li, idx) => { li.lineNumber = idx + 1; });

    const { invoiceNumber } = await this.generateDraftInvoiceNumber();
    const customerId = customerIds[0] || sourceInvoices[0].customerId;
    const customerName = sourceInvoices[0].customerName;

    const newInvoice: InsertInvoice = {
      invoiceNumber,
      customerId: customerId || undefined,
      customerName,
      invoiceDate: new Date().toISOString().split('T')[0],
      dueDate: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
      totalAmount: totalAmount.toFixed(2),
      subtotalAmount: totalAmount.toFixed(2),
      status: 'draft',
      isConsolidated: true,
      consolidationType: 'drafts',
      createdBy: userId,
      ...invoiceData,
    };

    const result = await this.createInvoiceWithLineItems(newInvoice, allLineItems);

    for (const sourceInv of sourceInvoices) {
      await db.update(invoices)
        .set({ status: 'consolidated', consolidatedIntoId: result.id, updatedAt: new Date() })
        .where(eq(invoices.id, sourceInv.id));

      await db.insert(invoiceConsolidationSources).values({
        consolidatedInvoiceId: result.id,
        sourceType: 'invoice',
        sourceInvoiceId: sourceInv.id,
        sourceAmount: sourceInv.totalAmount,
        sourceDescription: `Invoice ${sourceInv.invoiceNumber}`,
      });

      await this.logInvoiceAction(sourceInv.id, 'consolidated_into', userId, null, { consolidatedInvoiceId: result.id }, `Consolidated into invoice ${result.invoiceNumber}`);
    }

    await this.logInvoiceAction(result.id, 'consolidated_from_drafts', userId, null, { sourceInvoiceIds: invoiceIds, sourceCount: sourceInvoices.length }, `Consolidated ${sourceInvoices.length} draft invoices`);

    return result;
  }

  async getConsolidationDetail(invoiceId: string): Promise<{ sources: any[]; totalAmount: string } | undefined> {
    const invoice = await this.getInvoice(invoiceId);
    if (!invoice || !invoice.isConsolidated) return undefined;

    const sources = await db.select().from(invoiceConsolidationSources)
      .where(eq(invoiceConsolidationSources.consolidatedInvoiceId, invoiceId));

    const enrichedSources = await Promise.all(sources.map(async (source) => {
      if (source.sourceType === 'invoice' && source.sourceInvoiceId) {
        const srcInvoice = await this.getInvoice(source.sourceInvoiceId);
        const srcLineItems = srcInvoice ? await db.select().from(invoiceLineItems).where(eq(invoiceLineItems.invoiceId, srcInvoice.id)) : [];
        return { ...source, invoice: srcInvoice, lineItems: srcLineItems };
      } else if (source.sourceType === 'charge' && source.sourceChargeId) {
        const [charge] = await db.select().from(billableCharges).where(eq(billableCharges.id, source.sourceChargeId));
        return { ...source, charge };
      }
      return source;
    }));

    return {
      sources: enrichedSources,
      totalAmount: invoice.totalAmount,
    };
  }

  async updateInvoiceStatus(id: string, status: string, updates?: Partial<InsertInvoice>, userId?: string): Promise<Invoice | undefined> {
    const [currentInvoice] = await db.select().from(invoices).where(eq(invoices.id, id));
    if (!currentInvoice) return undefined;
    
    const previousStatus = currentInvoice.status || 'draft';

    const VALID_INVOICE_TRANSITIONS: Record<string, string[]> = {
      draft: ['approved'],
      approved: ['sent'],
      sent: ['viewed', 'partially_paid', 'void'],
      viewed: ['partially_paid', 'void'],
      partially_paid: ['paid'],
      overdue: ['paid'],
      paid: [],
      void: [],
      written_off: [],
    };

    if (previousStatus === status) {
      const [result] = await db.update(invoices).set({ 
        ...updates,
        updatedAt: new Date() 
      }).where(eq(invoices.id, id)).returning();
      return result;
    }

    const allowedNextStatuses = VALID_INVOICE_TRANSITIONS[previousStatus] || [];
    if (!allowedNextStatuses.includes(status)) {
      throw new Error(`Invalid status transition: cannot change invoice from '${previousStatus}' to '${status}'. Allowed transitions: ${allowedNextStatuses.join(', ') || 'none (terminal state)'}`);
    }

    const [result] = await db.update(invoices).set({ 
      ...updates,
      status, 
      updatedAt: new Date() 
    }).where(eq(invoices.id, id)).returning();
    
    // Record status history
    if (result && previousStatus !== status) {
      await db.insert(invoiceStatusHistory).values({
        invoiceId: id,
        previousStatus,
        newStatus: status,
        changedBy: userId || null,
        reason: (updates as any)?.reason || null,
      });
      
      // Create audit log entry
      await db.insert(invoiceAuditLog).values({
        invoiceId: id,
        action: 'status_changed',
        performedBy: userId || null,
        previousValues: { status: previousStatus },
        newValues: { status },
        notes: `Status changed from ${previousStatus} to ${status}`,
      });
    }
    
    return result;
  }

  // Mark invoice as disputed
  async markInvoiceAsDisputed(id: string, data: { reasonCategory: string; notes?: string; createdBy: string }): Promise<Invoice | undefined> {
    const [currentInvoice] = await db.select().from(invoices).where(eq(invoices.id, id));
    if (!currentInvoice) return undefined;
    
    // Store prior status before dispute
    const priorStatus = currentInvoice.status;
    
    const [result] = await db.update(invoices).set({
      isDisputed: true,
      status: 'disputed',
      disputedReasonCategory: data.reasonCategory,
      disputedNotes: data.notes || null,
      disputedCreatedBy: data.createdBy,
      disputedCreatedAt: new Date(),
      disputeResolvedAt: null,
      priorStatusBeforeDispute: priorStatus,
      updatedAt: new Date(),
    }).where(eq(invoices.id, id)).returning();
    
    // Record status history
    if (result) {
      await db.insert(invoiceStatusHistory).values({
        invoiceId: id,
        previousStatus: priorStatus,
        newStatus: 'disputed',
        changedBy: data.createdBy,
        reason: `Disputed: ${data.reasonCategory} - ${data.notes || 'No notes'}`,
      });
      
      // Create invoice activity for timeline
      await this.createInvoiceActivity({
        invoiceId: id,
        activityType: 'disputed',
        description: `Invoice marked as disputed: ${data.reasonCategory}`,
        metadata: { reasonCategory: data.reasonCategory, notes: data.notes },
        performedBy: data.createdBy,
      });
    }
    
    return result;
  }

  async resolveInvoiceDispute(id: string, resolvedBy: string, resolution: string, resolvedAmount?: string): Promise<InvoiceDispute | undefined> {
    const [result] = await db.update(invoiceDisputes).set({ 
      status: 'resolved',
      resolution,
      resolvedAmount,
      resolvedBy,
      resolvedAt: new Date(),
      updatedAt: new Date()
    }).where(eq(invoiceDisputes.id, id)).returning();

    if (result) {
      // Update invoice dispute status
      const remainingDisputes = await db.select().from(invoiceDisputes).where(and(
        eq(invoiceDisputes.invoiceId, result.invoiceId),
        eq(invoiceDisputes.status, 'open')
      ));
      
      if (remainingDisputes.length === 0) {
        await db.update(invoices).set({ 
          isDisputed: false,
          disputedAmount: '0',
          status: 'sent',
          updatedAt: new Date()
        }).where(eq(invoices.id, result.invoiceId));
      }
    }

    return result;
  }

  async voidInvoice(id: string, voidedBy: string, reason: string): Promise<Invoice | undefined> {
    const [currentInvoice] = await db.select().from(invoices).where(eq(invoices.id, id));
    if (!currentInvoice) return undefined;
    
    const VOID_ALLOWED_FROM = ['sent', 'viewed'];
    const currentStatus = currentInvoice.status || 'draft';
    if (!VOID_ALLOWED_FROM.includes(currentStatus)) {
      throw new Error(`Cannot void invoice with status '${currentStatus}'. Only sent or viewed invoices can be voided.`);
    }
    
    const previousStatus = currentInvoice.status;
    
    const [result] = await db.update(invoices).set({ 
      status: 'void',
      voidedBy,
      voidedAt: new Date(),
      voidReason: reason,
      updatedAt: new Date() 
    }).where(eq(invoices.id, id)).returning();
    
    // Record status history
    if (result) {
      await db.insert(invoiceStatusHistory).values({
        invoiceId: id,
        previousStatus,
        newStatus: 'void',
        changedBy: voidedBy,
        reason,
      });
      
      // Create audit log entry
      await db.insert(invoiceAuditLog).values({
        invoiceId: id,
        action: 'voided',
        performedBy: voidedBy,
        previousValues: { status: previousStatus },
        newValues: { status: 'void', voidReason: reason },
        notes: `Invoice voided: ${reason}`,
      });
      
      // Create invoice activity for timeline
      await this.createInvoiceActivity({
        invoiceId: id,
        activityType: 'voided',
        description: `Invoice voided: ${reason}`,
        performedBy: voidedBy,
        performedByType: 'user',
        metadata: { reason, previousStatus },
      });
    }
    
    return result;
  }

  async writeOffInvoice(id: string, amount: string, reason: string, notes: string, performedBy: string): Promise<Invoice | undefined> {
    const [currentInvoice] = await db.select().from(invoices).where(eq(invoices.id, id));
    if (!currentInvoice) return undefined;

    const allowedStatuses = ['overdue', 'sent', 'partially_paid', 'viewed'];
    if (!allowedStatuses.includes(currentInvoice.status || '')) {
      throw new Error(`Cannot write off invoice with status: ${currentInvoice.status}`);
    }

    const writeOffAmount = parseFloat(amount);
    const currentBalance = parseFloat(currentInvoice.balanceDue || currentInvoice.totalAmount);
    if (writeOffAmount <= 0 || writeOffAmount > currentBalance) {
      throw new Error(`Write-off amount must be between $0.01 and $${currentBalance.toFixed(2)}`);
    }

    const previousStatus = currentInvoice.status;
    const isFullWriteOff = Math.abs(writeOffAmount - currentBalance) < 0.01;
    const newBalance = isFullWriteOff ? 0 : currentBalance - writeOffAmount;
    const newStatus = isFullWriteOff ? 'written_off' : previousStatus;
    const existingWrittenOff = parseFloat(currentInvoice.writtenOffAmount || '0');
    const totalWrittenOff = existingWrittenOff + writeOffAmount;

    const maxLineNumber = await db.select({ maxNum: sql<number>`COALESCE(MAX(line_number), 0)` })
      .from(invoiceLineItems)
      .where(eq(invoiceLineItems.invoiceId, id));
    const nextLineNumber = (maxLineNumber[0]?.maxNum || 0) + 1;

    await db.insert(invoiceLineItems).values({
      invoiceId: id,
      lineNumber: nextLineNumber,
      lineItemType: 'adjustment',
      category: 'bad_debt',
      description: `Bad Debt Write-Off: ${reason}`,
      quantity: '1',
      unitPrice: String(-writeOffAmount),
      totalPrice: String(-writeOffAmount),
    });

    const [result] = await db.update(invoices).set({
      balanceDue: String(newBalance.toFixed(2)),
      writtenOffAmount: String(totalWrittenOff.toFixed(2)),
      writtenOffBy: performedBy,
      writtenOffAt: new Date(),
      writeOffReason: reason,
      writeOffNotes: notes,
      status: newStatus,
      updatedAt: new Date(),
    }).where(eq(invoices.id, id)).returning();

    if (result) {
      await db.insert(invoiceStatusHistory).values({
        invoiceId: id,
        previousStatus,
        newStatus: newStatus || previousStatus || 'written_off',
        changedBy: performedBy,
        reason: `Write-off ($${writeOffAmount.toFixed(2)}): ${reason}`,
        metadata: { writeOffAmount: amount, isFullWriteOff, notes },
      });

      await db.insert(invoiceAuditLog).values({
        invoiceId: id,
        action: 'written_off',
        performedBy,
        previousValues: { status: previousStatus, balanceDue: currentInvoice.balanceDue, writtenOffAmount: currentInvoice.writtenOffAmount },
        newValues: { status: newStatus, balanceDue: String(newBalance.toFixed(2)), writtenOffAmount: String(totalWrittenOff.toFixed(2)) },
        notes: `Write-off: $${writeOffAmount.toFixed(2)} - ${reason}. ${notes}`,
      });

      await this.createInvoiceActivity({
        invoiceId: id,
        activityType: 'written_off',
        description: `${isFullWriteOff ? 'Full' : 'Partial'} write-off of $${writeOffAmount.toFixed(2)}: ${reason}`,
        performedBy,
        performedByType: 'user',
        metadata: { amount: writeOffAmount, reason, notes, isFullWriteOff, previousBalance: currentBalance, newBalance },
      });

      if (currentInvoice.customerId) {
        try {
          await db.insert(arLedgerEntries).values({
            customerId: currentInvoice.customerId,
            entryType: 'write_off',
            referenceType: 'invoice',
            referenceId: id,
            entryDate: new Date().toISOString().split('T')[0],
            description: `Bad debt write-off for Invoice #${currentInvoice.invoiceNumber || id}: ${reason}`,
            amount: String(-writeOffAmount),
            invoiceId: id,
            createdBy: performedBy,
          });
        } catch (err) {
          console.error('Failed to create AR ledger entry for write-off:', err);
        }
      }
    }

    return result;
  }

  async sendInvoice(id: string, sentBy: string, toEmails: string[], ccEmails?: string[]): Promise<Invoice | undefined> {
    const [existing] = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1);
    if (!existing) return undefined;

    const previousStatus = existing.status || 'draft';
    const isInitialSend = previousStatus === 'approved';
    const isResend = ['sent', 'viewed', 'overdue', 'partially_paid'].includes(previousStatus);
    
    if (!isInitialSend && !isResend) {
      throw new Error(`Cannot send invoice with status '${previousStatus}'. Invoice must be approved before sending.`);
    }
    
    const expirationDays = existing.paymentLinkExpirationDays || 90;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expirationDays);
    
    const updateData: any = { 
      status: isInitialSend ? 'sent' : previousStatus,
      sentAt: isInitialSend ? new Date() : existing.sentAt,
      sentBy,
      sentToEmails: toEmails,
      lastSentAt: new Date(),
      paymentLinkExpiresAt: expiresAt,
      updatedAt: new Date() 
    };
    
    // If invoice number not finalized, assign real invoice number now
    if (!existing.invoiceNumberFinalized) {
      let newInvoiceNumber: string;
      
      // Get billing entity to apply template settings
      if (existing.billingEntityId) {
        newInvoiceNumber = await this.generateInvoiceNumberForEntity(existing.billingEntityId);
        
        // Get entity for template settings
        const entity = await this.getBillingEntity(existing.billingEntityId);
        if (entity) {
          // Apply template settings from entity if not already set on invoice
          if (!existing.termsText && entity.defaultTermsText) {
            updateData.termsText = entity.defaultTermsText;
          }
          if (!existing.footerNotes && entity.footerNotes) {
            updateData.footerNotes = entity.footerNotes;
          }
          if (!existing.remittanceInstructions && entity.remittanceInstructions) {
            updateData.remittanceInstructions = entity.remittanceInstructions;
          }
        }
      } else {
        // No entity, use default numbering
        newInvoiceNumber = await this.generateInvoiceNumber();
      }
      
      updateData.invoiceNumber = newInvoiceNumber;
      updateData.invoiceNumberFinalized = true;
      updateData.invoiceNumberFinalizedAt = new Date();
      
      // Log the number assignment
      await this.logInvoiceAction(id, 'number_assigned', sentBy, 
        { invoiceNumber: existing.invoiceNumber }, 
        { invoiceNumber: newInvoiceNumber },
        `Invoice number assigned on send: ${newInvoiceNumber}`
      );
    }
    
    const [result] = await db.update(invoices).set(updateData).where(eq(invoices.id, id)).returning();

    if (result && previousStatus !== updateData.status) {
      await db.insert(invoiceStatusHistory).values({
        invoiceId: id,
        previousStatus,
        newStatus: updateData.status,
        changedBy: sentBy,
        reason: 'Invoice sent',
      });

      await db.insert(invoiceAuditLog).values({
        invoiceId: id,
        action: 'sent',
        performedBy: sentBy,
        previousValues: { status: previousStatus },
        newValues: { status: updateData.status, sentToEmails: toEmails },
        notes: `Invoice sent. Status changed from ${previousStatus} to ${updateData.status}`,
      });
    } else if (result) {
      await db.insert(invoiceAuditLog).values({
        invoiceId: id,
        action: 'resent',
        performedBy: sentBy,
        previousValues: { status: previousStatus },
        newValues: { sentToEmails: toEmails },
        notes: `Invoice resent (status unchanged: ${previousStatus})`,
      });
    }

    return result;
  }

  async getInvoiceStatusHistory(invoiceId: string): Promise<any[]> {
    return await db.select().from(invoiceStatusHistory)
      .where(eq(invoiceStatusHistory.invoiceId, invoiceId))
      .orderBy(desc(invoiceStatusHistory.changedAt));
  }

  async getInvoiceAuditLog(invoiceId: string): Promise<any[]> {
    return await db.select().from(invoiceAuditLog)
      .where(eq(invoiceAuditLog.invoiceId, invoiceId))
      .orderBy(desc(invoiceAuditLog.performedAt));
  }

  async logInvoiceAction(invoiceId: string, action: string, performedBy?: string, previousValues?: any, newValues?: any, notes?: string): Promise<void> {
    await db.insert(invoiceAuditLog).values({
      invoiceId,
      action,
      performedBy: performedBy || null,
      previousValues: previousValues || null,
      newValues: newValues || null,
      notes: notes || null,
    });
  }

  // Invoice Approval Workflow operations
  async submitInvoiceForApproval(id: string, submittedBy: string): Promise<Invoice | undefined> {
    const invoice = await this.getInvoice(id);
    if (!invoice) return undefined;
    
    const previousState = invoice.approvalWorkflowState || 'draft';
    
    const [updated] = await db.update(invoices)
      .set({
        approvalWorkflowState: 'pending_approval',
        submittedForApprovalBy: submittedBy,
        submittedForApprovalAt: new Date(),
        rejectedBy: null,
        rejectedAt: null,
        rejectionReason: null,
        rejectionComment: null,
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, id))
      .returning();
    
    // Log approval action
    await db.insert(invoiceApprovalActions).values({
      invoiceId: id,
      action: 'submitted_for_approval',
      previousState,
      newState: 'pending_approval',
      performedBy: submittedBy,
    });
    
    // Log to audit log
    await this.logInvoiceAction(id, 'submitted_for_approval', submittedBy, { approvalWorkflowState: previousState }, { approvalWorkflowState: 'pending_approval' });
    
    return updated;
  }

  async approveInvoice(id: string, approvedBy: string): Promise<Invoice | undefined> {
    const invoice = await this.getInvoice(id);
    if (!invoice) return undefined;
    
    const previousState = invoice.approvalWorkflowState || 'draft';
    
    const [updated] = await db.update(invoices)
      .set({
        approvalWorkflowState: 'approved',
        approvedBy: approvedBy,
        approvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, id))
      .returning();
    
    // Log approval action
    await db.insert(invoiceApprovalActions).values({
      invoiceId: id,
      action: 'approved',
      previousState,
      newState: 'approved',
      performedBy: approvedBy,
    });
    
    // Log to audit log
    await this.logInvoiceAction(id, 'approved', approvedBy, { approvalWorkflowState: previousState }, { approvalWorkflowState: 'approved' });
    
    return updated;
  }

  async rejectInvoice(id: string, rejectedBy: string, reason: string, comment: string): Promise<Invoice | undefined> {
    const invoice = await this.getInvoice(id);
    if (!invoice) return undefined;
    
    const previousState = invoice.approvalWorkflowState || 'draft';
    
    const [updated] = await db.update(invoices)
      .set({
        approvalWorkflowState: 'rejected',
        rejectedBy: rejectedBy,
        rejectedAt: new Date(),
        rejectionReason: reason,
        rejectionComment: comment,
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, id))
      .returning();
    
    // Log approval action
    await db.insert(invoiceApprovalActions).values({
      invoiceId: id,
      action: 'rejected',
      previousState,
      newState: 'rejected',
      performedBy: rejectedBy,
      rejectionReason: reason,
      rejectionComment: comment,
    });
    
    // Log to audit log
    await this.logInvoiceAction(id, 'rejected', rejectedBy, { approvalWorkflowState: previousState }, { approvalWorkflowState: 'rejected', rejectionReason: reason });
    
    return updated;
  }

  async returnInvoiceToDraft(id: string, performedBy: string): Promise<Invoice | undefined> {
    const invoice = await this.getInvoice(id);
    if (!invoice) return undefined;
    
    const previousState = invoice.approvalWorkflowState || 'draft';
    
    const [updated] = await db.update(invoices)
      .set({
        approvalWorkflowState: 'draft',
        rejectedBy: null,
        rejectedAt: null,
        rejectionReason: null,
        rejectionComment: null,
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, id))
      .returning();
    
    // Log approval action
    await db.insert(invoiceApprovalActions).values({
      invoiceId: id,
      action: 'returned_to_draft',
      previousState,
      newState: 'draft',
      performedBy,
    });
    
    // Log to audit log
    await this.logInvoiceAction(id, 'returned_to_draft', performedBy, { approvalWorkflowState: previousState }, { approvalWorkflowState: 'draft' });
    
    return updated;
  }

  async getInvoiceApprovalHistory(invoiceId: string): Promise<any[]> {
    return await db.select({
      id: invoiceApprovalActions.id,
      action: invoiceApprovalActions.action,
      previousState: invoiceApprovalActions.previousState,
      newState: invoiceApprovalActions.newState,
      performedAt: invoiceApprovalActions.performedAt,
      performedBy: invoiceApprovalActions.performedBy,
      performedByName: users.firstName,
      rejectionReason: invoiceApprovalActions.rejectionReason,
      rejectionComment: invoiceApprovalActions.rejectionComment,
      notes: invoiceApprovalActions.notes,
    })
    .from(invoiceApprovalActions)
    .leftJoin(users, eq(invoiceApprovalActions.performedBy, users.id))
    .where(eq(invoiceApprovalActions.invoiceId, invoiceId))
    .orderBy(desc(invoiceApprovalActions.performedAt));
  }

  async getInvoicesPendingApproval(): Promise<Invoice[]> {
    return await db.select()
      .from(invoices)
      .where(eq(invoices.approvalWorkflowState, 'pending_approval'))
      .orderBy(desc(invoices.createdAt));
  }

  // Invoice Line Item operations
  async getInvoiceLineItems(invoiceId: string): Promise<InvoiceLineItem[]> {
    return await db.select().from(invoiceLineItems).where(eq(invoiceLineItems.invoiceId, invoiceId)).orderBy(invoiceLineItems.lineNumber);
  }

  async getInvoiceLineItem(id: string): Promise<InvoiceLineItem | undefined> {
    const [result] = await db.select().from(invoiceLineItems).where(eq(invoiceLineItems.id, id));
    return result;
  }

  async createInvoiceLineItem(lineItem: InsertInvoiceLineItem): Promise<InvoiceLineItem> {
    const [result] = await db.insert(invoiceLineItems).values(lineItem).returning();
    return result;
  }

  async updateInvoiceLineItem(id: string, updates: Partial<InsertInvoiceLineItem>): Promise<InvoiceLineItem | undefined> {
    const [result] = await db.update(invoiceLineItems).set({ ...updates, updatedAt: new Date() }).where(eq(invoiceLineItems.id, id)).returning();
    return result;
  }

  async deleteInvoiceLineItem(id: string): Promise<void> {
    await db.delete(invoiceLineItems).where(eq(invoiceLineItems.id, id));
  }

  // Line Item Category Mappings
  async getLineItemCategoryMappings(billingEntityId?: string): Promise<LineItemCategoryMapping[]> {
    if (billingEntityId) {
      return await db.select().from(lineItemCategoryMappings)
        .where(or(eq(lineItemCategoryMappings.billingEntityId, billingEntityId), isNull(lineItemCategoryMappings.billingEntityId)))
        .orderBy(lineItemCategoryMappings.category);
    }
    return await db.select().from(lineItemCategoryMappings).orderBy(lineItemCategoryMappings.category);
  }

  async getLineItemCategoryMapping(id: string): Promise<LineItemCategoryMapping | undefined> {
    const [result] = await db.select().from(lineItemCategoryMappings).where(eq(lineItemCategoryMappings.id, id));
    return result;
  }

  async createLineItemCategoryMapping(mapping: InsertLineItemCategoryMapping): Promise<LineItemCategoryMapping> {
    const [result] = await db.insert(lineItemCategoryMappings).values(mapping).returning();
    return result;
  }

  async updateLineItemCategoryMapping(id: string, updates: Partial<InsertLineItemCategoryMapping>): Promise<LineItemCategoryMapping | undefined> {
    const [result] = await db.update(lineItemCategoryMappings).set({ ...updates, updatedAt: new Date() }).where(eq(lineItemCategoryMappings.id, id)).returning();
    return result;
  }

  async deleteLineItemCategoryMapping(id: string): Promise<void> {
    await db.delete(lineItemCategoryMappings).where(eq(lineItemCategoryMappings.id, id));
  }

  // Invoice Attachments
  async getInvoiceAttachments(invoiceId: string): Promise<InvoiceAttachment[]> {
    return await db.select().from(invoiceAttachments)
      .where(eq(invoiceAttachments.invoiceId, invoiceId))
      .orderBy(desc(invoiceAttachments.createdAt));
  }

  async getInvoiceAttachment(id: string): Promise<InvoiceAttachment | undefined> {
    const [result] = await db.select().from(invoiceAttachments).where(eq(invoiceAttachments.id, id));
    return result;
  }

  async getCustomerVisibleAttachments(invoiceId: string): Promise<InvoiceAttachment[]> {
    return await db.select().from(invoiceAttachments)
      .where(and(
        eq(invoiceAttachments.invoiceId, invoiceId),
        eq(invoiceAttachments.customerVisible, true)
      ))
      .orderBy(desc(invoiceAttachments.createdAt));
  }

  async createInvoiceAttachment(attachment: InsertInvoiceAttachment): Promise<InvoiceAttachment> {
    const [result] = await db.insert(invoiceAttachments).values(attachment).returning();
    return result;
  }

  async deleteInvoiceAttachment(id: string): Promise<void> {
    await db.delete(invoiceAttachments).where(eq(invoiceAttachments.id, id));
  }

  // Payment operations
  async getAllPayments(filters?: { 
    customerId?: string; 
    status?: string; 
    paymentMethod?: string;
    startDate?: string; 
    endDate?: string 
  }): Promise<Payment[]> {
    let query = db.select().from(payments);
    const conditions: any[] = [];
    if (filters?.customerId) conditions.push(eq(payments.customerId, filters.customerId));
    if (filters?.status) conditions.push(eq(payments.status, filters.status));
    if (filters?.paymentMethod) conditions.push(eq(payments.paymentMethod, filters.paymentMethod));
    if (filters?.startDate) conditions.push(gte(payments.paymentDate, filters.startDate));
    if (filters?.endDate) conditions.push(lte(payments.paymentDate, filters.endDate));
    if (conditions.length > 0) query = query.where(and(...conditions)) as any;
    return await query.orderBy(desc(payments.paymentDate));
  }

  async getPayment(id: string): Promise<Payment | undefined> {
    const [result] = await db.select().from(payments).where(eq(payments.id, id));
    return result;
  }

  async getPaymentByStripeId(stripePaymentIntentId: string): Promise<Payment | undefined> {
    const [result] = await db.select().from(payments).where(eq(payments.stripePaymentIntentId, stripePaymentIntentId));
    return result;
  }

  async getPaymentsByCustomer(customerId: string): Promise<Payment[]> {
    return await db.select().from(payments).where(eq(payments.customerId, customerId)).orderBy(desc(payments.paymentDate));
  }

  async generatePaymentNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `PMT-${year}-`;
    const latestPayments = await db.select({ paymentNumber: payments.paymentNumber })
      .from(payments)
      .where(ilike(payments.paymentNumber, `${prefix}%`))
      .orderBy(desc(payments.paymentNumber))
      .limit(1);
    
    let nextNumber = 1;
    if (latestPayments.length > 0) {
      const lastNumber = parseInt(latestPayments[0].paymentNumber.replace(prefix, '')) || 0;
      nextNumber = lastNumber + 1;
    }
    return `${prefix}${nextNumber.toString().padStart(5, '0')}`;
  }

  async createPayment(payment: InsertPayment): Promise<Payment> {
    const [result] = await db.insert(payments).values(payment).returning();
    return result;
  }

  async updatePayment(id: string, updates: Partial<InsertPayment>): Promise<Payment | undefined> {
    const [result] = await db.update(payments).set({ ...updates, updatedAt: new Date() }).where(eq(payments.id, id)).returning();
    return result;
  }

  async updatePaymentStatus(id: string, status: string, processorDetails?: any): Promise<Payment | undefined> {
    const updates: any = { status, updatedAt: new Date() };
    if (processorDetails) {
      if (processorDetails.stripePaymentIntentId) updates.stripePaymentIntentId = processorDetails.stripePaymentIntentId;
      if (processorDetails.stripeChargeId) updates.stripeChargeId = processorDetails.stripeChargeId;
      if (processorDetails.processorFee) updates.processorFee = processorDetails.processorFee;
      if (processorDetails.netAmount) updates.netAmount = processorDetails.netAmount;
    }
    const [result] = await db.update(payments).set(updates).where(eq(payments.id, id)).returning();
    return result;
  }

  // Payment Application operations
  async getPaymentApplications(paymentId: string): Promise<PaymentApplication[]> {
    return await db.select().from(paymentApplications).where(eq(paymentApplications.paymentId, paymentId));
  }

  async getPaymentApplicationsByInvoice(invoiceId: string): Promise<PaymentApplication[]> {
    return await db.select().from(paymentApplications).where(eq(paymentApplications.invoiceId, invoiceId));
  }

  async applyPaymentToInvoice(paymentId: string, invoiceId: string, amount: string, appliedBy: string): Promise<PaymentApplication> {
    const applyAmount = parseFloat(amount);
    if (isNaN(applyAmount) || applyAmount <= 0) {
      throw new Error('Payment application amount must be a positive number');
    }

    const existingInvoice = await this.getInvoice(invoiceId);
    if (!existingInvoice) {
      throw new Error('Invoice not found');
    }
    const terminalStatuses = ['void', 'written_off', 'paid'];
    if (terminalStatuses.includes(existingInvoice.status || '')) {
      throw new Error(`Cannot apply payment to an invoice with status '${existingInvoice.status}'`);
    }

    const payment = await this.getPayment(paymentId);
    if (!payment) {
      throw new Error('Payment not found');
    }

    const unappliedBalance = parseFloat(payment.unappliedAmount || payment.amount);
    if (applyAmount > unappliedBalance + 0.005) {
      throw new Error(`Insufficient unapplied payment balance. Attempting to apply $${applyAmount.toFixed(2)} but only $${unappliedBalance.toFixed(2)} is available.`);
    }

    const existingApplications = await db.select()
      .from(paymentApplications)
      .where(and(
        eq(paymentApplications.paymentId, paymentId),
        eq(paymentApplications.invoiceId, invoiceId)
      ));

    const DEDUP_WINDOW_MS = 30000;
    const recentDuplicate = existingApplications.find(app => {
      const isSameAmount = Math.abs(parseFloat(app.amount) - applyAmount) < 0.005;
      const isRecent = app.appliedAt && (Date.now() - new Date(app.appliedAt).getTime()) < DEDUP_WINDOW_MS;
      return isSameAmount && isRecent;
    });
    if (recentDuplicate) {
      throw new Error(`Duplicate payment application detected. Payment $${applyAmount.toFixed(2)} was already applied to this invoice ${Math.round((Date.now() - new Date(recentDuplicate.appliedAt!).getTime()) / 1000)} seconds ago.`);
    }

    const existingTotal = existingApplications.reduce((sum, app) => sum + parseFloat(app.amount), 0);
    const newTotal = existingTotal + applyAmount;
    const invoiceTotal = parseFloat(existingInvoice.totalAmount || '0');
    if (newTotal > invoiceTotal + 0.005) {
      throw new Error(`Payment application would exceed invoice total. Already applied: $${existingTotal.toFixed(2)}, attempting: $${applyAmount.toFixed(2)}, invoice total: $${invoiceTotal.toFixed(2)}`);
    }

    const [application] = await db.insert(paymentApplications).values({
      paymentId,
      invoiceId,
      amount,
      appliedBy,
      matchMethod: 'manual',
    }).returning();

    const newApplied = (parseFloat(payment.appliedAmount || '0') + applyAmount).toFixed(2);
    const newUnapplied = (parseFloat(payment.amount) - parseFloat(newApplied)).toFixed(2);
    await db.update(payments).set({ 
      appliedAmount: newApplied,
      unappliedAmount: newUnapplied,
      updatedAt: new Date()
    }).where(eq(payments.id, paymentId));

    // Update invoice paid amount
    const invoice = await this.getInvoice(invoiceId);
    if (invoice) {
      const newPaid = (parseFloat(invoice.paidAmount || '0') + parseFloat(amount)).toFixed(2);
      const newBalance = Math.max(0, parseFloat(invoice.totalAmount) - parseFloat(newPaid)).toFixed(2);
      const newStatus = parseFloat(newBalance) <= 0.005 ? 'paid' : 'partially_paid';
      await db.update(invoices).set({ 
        paidAmount: newPaid,
        balanceDue: newBalance,
        status: newStatus,
        updatedAt: new Date()
      }).where(eq(invoices.id, invoiceId));

      // Write AR ledger credit entry for this manual application
      const pmtRecord = await this.getPayment(paymentId);
      if (pmtRecord?.customerId) {
        await db.insert(arLedgerEntries).values({
          customerId: pmtRecord.customerId,
          entryType: 'payment',
          referenceType: 'payment',
          referenceId: paymentId,
          entryDate: new Date().toISOString().split('T')[0],
          description: `Payment ${pmtRecord.paymentNumber || paymentId} applied to Invoice ${invoice.invoiceNumber} (manual)`,
          amount: (-applyAmount).toFixed(2),
          invoiceId,
          createdBy: appliedBy,
        }).catch(() => {/* non-fatal: ledger entry failure should not block application */});
      }
    }

    return application;
  }

  async createManualPayment(payment: InsertPayment & { allocations?: Array<{ invoiceId: string; amount: string }> }, enteredBy: string): Promise<Payment> {
    // Generate payment number
    const paymentNumber = await this.generatePaymentNumber();
    
    // Create the payment with manual entry flag
    const paymentData = {
      ...payment,
      paymentNumber,
      isManualEntry: true,
      enteredBy,
      enteredAt: new Date(),
      status: 'completed',
      appliedAmount: '0',
      unappliedAmount: payment.amount,
    };
    
    // Remove allocations from the payment data (not a database field)
    const allocations = payment.allocations;
    delete (paymentData as any).allocations;
    
    const [createdPayment] = await db.insert(payments).values(paymentData).returning();
    
    // Apply payment to invoices if allocations provided
    if (allocations && allocations.length > 0) {
      for (const allocation of allocations) {
        await this.applyPaymentToInvoice(createdPayment.id, allocation.invoiceId, allocation.amount, enteredBy);
      }
    }
    
    // Return the updated payment
    return await this.getPayment(createdPayment.id) as Payment;
  }

  async unapplyPayment(applicationId: string): Promise<void> {
    const [application] = await db.select().from(paymentApplications).where(eq(paymentApplications.id, applicationId));
    if (!application) return;

    // Reverse the payment application
    const payment = await this.getPayment(application.paymentId);
    if (payment) {
      const newApplied = (parseFloat(payment.appliedAmount || '0') - parseFloat(application.amount)).toFixed(2);
      const newUnapplied = (parseFloat(payment.amount) - parseFloat(newApplied)).toFixed(2);
      await db.update(payments).set({ 
        appliedAmount: newApplied,
        unappliedAmount: newUnapplied,
        updatedAt: new Date()
      }).where(eq(payments.id, application.paymentId));
    }

    const invoice = await this.getInvoice(application.invoiceId);
    if (invoice) {
      const newPaid = (parseFloat(invoice.paidAmount || '0') - parseFloat(application.amount)).toFixed(2);
      const newBalance = (parseFloat(invoice.totalAmount) - parseFloat(newPaid)).toFixed(2);
      const newStatus = parseFloat(newPaid) <= 0 ? 'sent' : 'partially_paid';
      await db.update(invoices).set({ 
        paidAmount: newPaid,
        balanceDue: newBalance,
        status: newStatus,
        updatedAt: new Date()
      }).where(eq(invoices.id, application.invoiceId));
    }

    await db.delete(paymentApplications).where(eq(paymentApplications.id, applicationId));
  }

  // Deposit Batch operations
  async getAllDepositBatches(filters?: { status?: string; startDate?: string; endDate?: string }): Promise<DepositBatch[]> {
    let query = db.select().from(depositBatches);
    const conditions: any[] = [];
    if (filters?.status) conditions.push(eq(depositBatches.status, filters.status));
    if (filters?.startDate) conditions.push(gte(depositBatches.depositDate, filters.startDate));
    if (filters?.endDate) conditions.push(lte(depositBatches.depositDate, filters.endDate));
    if (conditions.length > 0) query = query.where(and(...conditions)) as any;
    return await query.orderBy(desc(depositBatches.depositDate));
  }

  async getDepositBatch(id: string): Promise<DepositBatch | undefined> {
    const [result] = await db.select().from(depositBatches).where(eq(depositBatches.id, id));
    return result;
  }

  async getDepositBatchWithPayments(id: string): Promise<(DepositBatch & { payments: Payment[] }) | undefined> {
    const [batch] = await db.select().from(depositBatches).where(eq(depositBatches.id, id));
    if (!batch) return undefined;
    const batchPayments = await db.select().from(payments).where(eq(payments.depositBatchId, id));
    return { ...batch, payments: batchPayments };
  }

  async generateBatchNumber(): Promise<string> {
    const date = new Date();
    const prefix = `DEP-${date.getFullYear()}${(date.getMonth() + 1).toString().padStart(2, '0')}${date.getDate().toString().padStart(2, '0')}-`;
    const latestBatches = await db.select({ batchNumber: depositBatches.batchNumber })
      .from(depositBatches)
      .where(ilike(depositBatches.batchNumber, `${prefix}%`))
      .orderBy(desc(depositBatches.batchNumber))
      .limit(1);
    
    let nextNumber = 1;
    if (latestBatches.length > 0) {
      const lastNumber = parseInt(latestBatches[0].batchNumber.replace(prefix, '')) || 0;
      nextNumber = lastNumber + 1;
    }
    return `${prefix}${nextNumber.toString().padStart(3, '0')}`;
  }

  async createDepositBatch(batch: InsertDepositBatch): Promise<DepositBatch> {
    const [result] = await db.insert(depositBatches).values(batch).returning();
    return result;
  }

  async updateDepositBatch(id: string, updates: Partial<InsertDepositBatch>): Promise<DepositBatch | undefined> {
    const [result] = await db.update(depositBatches).set({ ...updates, updatedAt: new Date() }).where(eq(depositBatches.id, id)).returning();
    return result;
  }

  async addPaymentToDepositBatch(batchId: string, paymentId: string): Promise<{ reverted: boolean }> {
    const payment = await this.getPayment(paymentId);
    if (!payment) return { reverted: false };

    await db.update(payments).set({ depositBatchId: batchId, updatedAt: new Date() }).where(eq(payments.id, paymentId));

    const batch = await this.getDepositBatch(batchId);
    let reverted = false;
    if (batch) {
      const updateData: any = {
        itemCount: (batch.itemCount || 0) + 1,
        totalAmount: ((parseFloat(batch.totalAmount || '0') + parseFloat(payment.amount)).toFixed(2)),
        updatedAt: new Date()
      };
      if (batch.status === 'balanced') {
        updateData.status = 'draft';
        reverted = true;
      }
      await db.update(depositBatches).set(updateData).where(eq(depositBatches.id, batchId));
    }
    return { reverted };
  }

  async removePaymentFromDepositBatch(paymentId: string): Promise<{ reverted: boolean; batchId?: string }> {
    const payment = await this.getPayment(paymentId);
    if (!payment || !payment.depositBatchId) return { reverted: false };

    const batchId = payment.depositBatchId;
    await db.update(payments).set({ depositBatchId: null, updatedAt: new Date() }).where(eq(payments.id, paymentId));

    const batch = await this.getDepositBatch(batchId);
    let reverted = false;
    if (batch) {
      const updateData: any = {
        itemCount: Math.max(0, (batch.itemCount || 0) - 1),
        totalAmount: (Math.max(0, parseFloat(batch.totalAmount || '0') - parseFloat(payment.amount)).toFixed(2)),
        updatedAt: new Date()
      };
      if (batch.status === 'balanced') {
        updateData.status = 'draft';
        reverted = true;
      }
      await db.update(depositBatches).set(updateData).where(eq(depositBatches.id, batchId));
    }
    return { reverted, batchId };
  }

  async closeDepositBatch(id: string, closedBy: string): Promise<DepositBatch | undefined> {
    const batch = await this.getDepositBatch(id);
    if (!batch) return undefined;
    if (batch.status !== 'submitted') {
      throw new Error(`Cannot lock deposit batch with status '${batch.status}'. Only submitted batches can be locked.`);
    }
    const [result] = await db.update(depositBatches).set({ 
      status: 'locked',
      lockedAt: new Date(),
      lockedBy: closedBy,
      updatedAt: new Date() 
    }).where(eq(depositBatches.id, id)).returning();
    return result;
  }

  async reconcileDepositBatch(id: string, reconciledBy: string, actualAmount: string, notes?: string, reconciliationReference?: string, statementDate?: string): Promise<DepositBatch | undefined> {
    const batch = await this.getDepositBatch(id);
    if (!batch) return undefined;
    if (batch.status !== 'locked') {
      throw new Error(`Cannot reconcile deposit batch with status '${batch.status}'. Batch must be locked first.`);
    }

    const discrepancy = (parseFloat(actualAmount) - parseFloat(batch.totalAmount || '0')).toFixed(2);
    const [result] = await db.update(depositBatches).set({ 
      status: 'reconciled',
      reconciledAt: new Date(),
      reconciledBy,
      actualDepositAmount: actualAmount,
      discrepancyAmount: discrepancy,
      discrepancyNotes: notes,
      reconciliationReference: reconciliationReference || null,
      statementDate: statementDate || null,
      updatedAt: new Date() 
    }).where(eq(depositBatches.id, id)).returning();
    return result;
  }

  async logDepositBatchAudit(batchId: string, action: string, fromStatus: string | null, toStatus: string | null, performedBy: string, performedByName: string, metadata?: any): Promise<DepositBatchAuditEntry> {
    const [result] = await db.insert(depositBatchAuditLog).values({
      batchId,
      action,
      fromStatus,
      toStatus,
      performedBy,
      performedByName,
      metadata: metadata || null,
    }).returning();
    return result;
  }

  async getDepositBatchAuditLog(batchId: string): Promise<DepositBatchAuditEntry[]> {
    return await db.select().from(depositBatchAuditLog)
      .where(eq(depositBatchAuditLog.batchId, batchId))
      .orderBy(desc(depositBatchAuditLog.createdAt));
  }

  async deleteDepositBatch(id: string): Promise<void> {
    await db.update(payments).set({ depositBatchId: null, updatedAt: new Date() }).where(eq(payments.depositBatchId, id));
    await db.delete(depositBatchAuditLog).where(eq(depositBatchAuditLog.batchId, id));
    await db.delete(depositBatches).where(eq(depositBatches.id, id));
  }

  // A/R Ledger operations
  async getArLedgerByCustomer(customerId: string): Promise<ArLedgerEntry[]> {
    return await db.select().from(arLedgerEntries).where(eq(arLedgerEntries.customerId, customerId)).orderBy(desc(arLedgerEntries.entryDate));
  }

  async createArLedgerEntry(entry: InsertArLedgerEntry): Promise<ArLedgerEntry> {
    const [result] = await db.insert(arLedgerEntries).values(entry).returning();
    return result;
  }

  async getCustomerBalance(customerId: string): Promise<string> {
    const entries = await this.getArLedgerByCustomer(customerId);
    const balance = entries.reduce((sum, e) => sum + parseFloat(e.amount), 0);
    return balance.toFixed(2);
  }

  async getCustomerArSummary(customerId: string): Promise<{
    totalOutstanding: string;
    currentBalance: string;
    overdue30: string;
    overdue60: string;
    overdue90Plus: string;
  }> {
    const outstandingInvoices = await db.select().from(invoices).where(and(
      eq(invoices.customerId, customerId),
      or(eq(invoices.status, 'sent'), eq(invoices.status, 'partially_paid'), eq(invoices.status, 'overdue'))
    ));

    const today = new Date();
    let current = 0, overdue30 = 0, overdue60 = 0, overdue90Plus = 0;

    for (const inv of outstandingInvoices) {
      const balance = parseFloat(inv.balanceDue || inv.totalAmount) - parseFloat(inv.paidAmount || '0');
      const dueDate = new Date(inv.dueDate);
      const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));

      if (daysOverdue <= 0) current += balance;
      else if (daysOverdue <= 30) overdue30 += balance;
      else if (daysOverdue <= 60) overdue60 += balance;
      else overdue90Plus += balance;
    }

    const total = current + overdue30 + overdue60 + overdue90Plus;
    return {
      totalOutstanding: total.toFixed(2),
      currentBalance: current.toFixed(2),
      overdue30: overdue30.toFixed(2),
      overdue60: overdue60.toFixed(2),
      overdue90Plus: overdue90Plus.toFixed(2),
    };
  }

  // Aging Report operations
  async getAgingReport(): Promise<AgingBucket[]> {
    const allCustomers = await db.select().from(customers).where(eq(customers.status, 'active'));
    const result: AgingBucket[] = [];

    for (const customer of allCustomers) {
      const summary = await this.getCustomerArSummary(customer.id);
      if (parseFloat(summary.totalOutstanding) > 0) {
        result.push({
          customerId: customer.id,
          customerName: customer.customerName,
          current: summary.currentBalance,
          days1to30: summary.overdue30,
          days31to60: summary.overdue60,
          days61to90: '0.00', // Simplified for now
          over90: summary.overdue90Plus,
          total: summary.totalOutstanding,
        });
      }
    }

    return result;
  }

  async getAgingReportByCustomer(customerId: string): Promise<AgingBucket> {
    const [customer] = await db.select().from(customers).where(eq(customers.id, customerId));
    const summary = await this.getCustomerArSummary(customerId);
    return {
      customerId,
      customerName: customer?.customerName || 'Unknown',
      current: summary.currentBalance,
      days1to30: summary.overdue30,
      days31to60: summary.overdue60,
      days61to90: '0.00',
      over90: summary.overdue90Plus,
      total: summary.totalOutstanding,
    };
  }

  // Credit Memo operations
  async getAllCreditMemos(filters?: { customerId?: string; status?: string }): Promise<CreditMemo[]> {
    let query = db.select().from(creditMemos);
    const conditions: any[] = [];
    if (filters?.customerId) conditions.push(eq(creditMemos.customerId, filters.customerId));
    if (filters?.status) conditions.push(eq(creditMemos.status, filters.status));
    if (conditions.length > 0) query = query.where(and(...conditions)) as any;
    return await query.orderBy(desc(creditMemos.creditDate));
  }

  async getCreditMemo(id: string): Promise<CreditMemo | undefined> {
    const [result] = await db.select().from(creditMemos).where(eq(creditMemos.id, id));
    return result;
  }

  async getCreditMemosByCustomer(customerId: string): Promise<CreditMemo[]> {
    return await db.select().from(creditMemos).where(eq(creditMemos.customerId, customerId)).orderBy(desc(creditMemos.creditDate));
  }

  async generateCreditMemoNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `CM-${year}-`;
    const latest = await db.select({ creditMemoNumber: creditMemos.creditMemoNumber })
      .from(creditMemos)
      .where(ilike(creditMemos.creditMemoNumber, `${prefix}%`))
      .orderBy(desc(creditMemos.creditMemoNumber))
      .limit(1);
    
    let nextNumber = 1;
    if (latest.length > 0) {
      const lastNumber = parseInt(latest[0].creditMemoNumber.replace(prefix, '')) || 0;
      nextNumber = lastNumber + 1;
    }
    return `${prefix}${nextNumber.toString().padStart(5, '0')}`;
  }

  async createCreditMemo(creditMemo: InsertCreditMemo): Promise<CreditMemo> {
    const [result] = await db.insert(creditMemos).values({
      ...creditMemo,
      remainingAmount: creditMemo.amount,
    }).returning();
    return result;
  }

  async updateCreditMemo(id: string, updates: Partial<InsertCreditMemo>): Promise<CreditMemo | undefined> {
    const [result] = await db.update(creditMemos).set({ ...updates, updatedAt: new Date() }).where(eq(creditMemos.id, id)).returning();
    return result;
  }

  async applyCreditMemoToInvoice(creditMemoId: string, invoiceId: string, amount: string, appliedBy: string): Promise<CreditMemoApplication> {
    const [application] = await db.insert(creditMemoApplications).values({
      creditMemoId,
      invoiceId,
      amount,
      appliedBy,
    }).returning();

    // Update credit memo remaining amount
    const cm = await this.getCreditMemo(creditMemoId);
    if (cm) {
      const newApplied = (parseFloat(cm.appliedAmount || '0') + parseFloat(amount)).toFixed(2);
      const newRemaining = (parseFloat(cm.amount) - parseFloat(newApplied)).toFixed(2);
      const newStatus = parseFloat(newRemaining) <= 0 ? 'fully_applied' : 'active';
      await db.update(creditMemos).set({ 
        appliedAmount: newApplied,
        remainingAmount: newRemaining,
        status: newStatus,
        updatedAt: new Date()
      }).where(eq(creditMemos.id, creditMemoId));
    }

    // Update invoice credit applied and balance
    const invoice = await this.getInvoice(invoiceId);
    if (invoice) {
      const newCredit = (parseFloat(invoice.creditApplied || '0') + parseFloat(amount)).toFixed(2);
      const newBalance = (parseFloat(invoice.totalAmount) - parseFloat(invoice.paidAmount || '0') - parseFloat(newCredit)).toFixed(2);
      const newStatus = parseFloat(newBalance) <= 0 ? 'paid' : invoice.status;
      await db.update(invoices).set({ 
        creditApplied: newCredit,
        balanceDue: newBalance,
        status: newStatus,
        updatedAt: new Date()
      }).where(eq(invoices.id, invoiceId));
      
      // Create invoice activity for timeline
      await this.createInvoiceActivity({
        invoiceId,
        activityType: 'credit_applied',
        description: `Credit of $${amount} applied (Credit Memo: ${cm?.creditMemoNumber || creditMemoId})`,
        performedBy: appliedBy,
        performedByType: 'user',
        metadata: { creditMemoId, amount, newBalanceDue: newBalance },
      });
      
      // Create audit log entry
      await db.insert(invoiceAuditLog).values({
        invoiceId,
        action: 'credit_applied',
        performedBy: appliedBy,
        previousValues: { creditApplied: invoice.creditApplied, balanceDue: invoice.balanceDue },
        newValues: { creditApplied: newCredit, balanceDue: newBalance },
        notes: `Credit memo ${cm?.creditMemoNumber || creditMemoId} applied: $${amount}`,
      });
    }

    return application;
  }

  // Payment Event operations (for AI timeliness signals)
  async createPaymentEvent(event: InsertPaymentEvent): Promise<PaymentEvent> {
    const [result] = await db.insert(paymentEvents).values(event).returning();
    return result;
  }

  async getPaymentEventsByCustomer(customerId: string, startDate?: Date, endDate?: Date): Promise<PaymentEvent[]> {
    let query = db.select().from(paymentEvents).where(eq(paymentEvents.customerId, customerId));
    
    if (startDate && endDate) {
      query = db.select().from(paymentEvents).where(
        and(
          eq(paymentEvents.customerId, customerId),
          gte(paymentEvents.eventAt, startDate),
          lte(paymentEvents.eventAt, endDate)
        )
      );
    }
    
    return await query.orderBy(desc(paymentEvents.eventAt));
  }

  async getPaymentEventsByInvoice(invoiceId: string): Promise<PaymentEvent[]> {
    return await db.select().from(paymentEvents)
      .where(eq(paymentEvents.invoiceId, invoiceId))
      .orderBy(desc(paymentEvents.eventAt));
  }

  // Customer Payment Metrics operations
  async getCustomerPaymentMetrics(customerId: string): Promise<CustomerPaymentMetrics | undefined> {
    const [result] = await db.select().from(customerPaymentMetrics).where(eq(customerPaymentMetrics.customerId, customerId));
    return result;
  }

  async upsertCustomerPaymentMetrics(customerId: string, metrics: Partial<InsertCustomerPaymentMetrics>): Promise<CustomerPaymentMetrics> {
    const existing = await this.getCustomerPaymentMetrics(customerId);
    
    if (existing) {
      const [result] = await db.update(customerPaymentMetrics)
        .set({ ...metrics, updatedAt: new Date() })
        .where(eq(customerPaymentMetrics.customerId, customerId))
        .returning();
      return result;
    } else {
      const [result] = await db.insert(customerPaymentMetrics)
        .values({ customerId, ...metrics })
        .returning();
      return result;
    }
  }

  async calculateAndUpdateCustomerPaymentMetrics(customerId: string): Promise<CustomerPaymentMetrics> {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    
    // Get all invoices for the customer in the last 6 months
    const customerInvoices = await db.select().from(invoices)
      .where(and(
        eq(invoices.customerId, customerId),
        gte(invoices.invoiceDate, sixMonthsAgo.toISOString().split('T')[0]),
        inArray(invoices.status, ['paid', 'partially_paid', 'overdue', 'sent', 'viewed'])
      ));
    
    // Get all payments for the customer in the last 6 months
    const customerPayments = await db.select().from(payments)
      .where(and(
        eq(payments.customerId, customerId),
        gte(payments.paymentDate, sixMonthsAgo.toISOString().split('T')[0])
      ));
    
    // Get payment events for reminder response analysis
    const events = await this.getPaymentEventsByCustomer(customerId, sixMonthsAgo, new Date());
    
    // Calculate metrics
    let totalDaysToPay = 0;
    let daysToPays: number[] = [];
    let onTimeCount = 0;
    let paidAfterReminderCount = 0;
    let disputedCount = 0;
    let totalInvoiceCount = customerInvoices.length;
    
    // Calculate days to pay for each invoice
    for (const invoice of customerInvoices) {
      if (invoice.status === 'paid' || invoice.status === 'partially_paid') {
        // Find when the invoice was fully paid
        const invoicePaymentEvents = events.filter(e => 
          e.invoiceId === invoice.id && e.eventType === 'payment_posted'
        );
        
        if (invoicePaymentEvents.length > 0) {
          const firstPayment = invoicePaymentEvents[invoicePaymentEvents.length - 1]; // Oldest payment
          const invoiceDate = new Date(invoice.invoiceDate);
          const paymentDate = new Date(firstPayment.eventAt);
          const daysToPay = Math.ceil((paymentDate.getTime() - invoiceDate.getTime()) / (1000 * 60 * 60 * 24));
          totalDaysToPay += daysToPay;
          daysToPays.push(daysToPay);
          
          // Check if paid on time
          const dueDate = new Date(invoice.dueDate);
          if (paymentDate <= dueDate) {
            onTimeCount++;
          }
          
          // Check if paid after reminder
          const remindersSent = events.filter(e => 
            e.invoiceId === invoice.id && e.eventType === 'reminder_sent' && 
            new Date(e.eventAt) < paymentDate
          );
          if (remindersSent.length > 0) {
            paidAfterReminderCount++;
          }
        }
      }
      
      // Count disputes
      if (invoice.isDisputed || invoice.status === 'disputed') {
        disputedCount++;
      }
    }
    
    // Calculate average and median days to pay
    const avgDaysToPay = daysToPays.length > 0 ? totalDaysToPay / daysToPays.length : null;
    daysToPays.sort((a, b) => a - b);
    const medianDaysToPay = daysToPays.length > 0 
      ? daysToPays.length % 2 === 0
        ? (daysToPays[daysToPays.length / 2 - 1] + daysToPays[daysToPays.length / 2]) / 2
        : daysToPays[Math.floor(daysToPays.length / 2)]
      : null;
    
    // Calculate percentages
    const pctOnTime = totalInvoiceCount > 0 ? (onTimeCount / totalInvoiceCount) * 100 : null;
    const pctPaidAfterReminder = totalInvoiceCount > 0 ? (paidAfterReminderCount / totalInvoiceCount) * 100 : null;
    const disputeRate = totalInvoiceCount > 0 ? (disputedCount / totalInvoiceCount) * 100 : null;
    
    // Calculate reminder response time average (hours)
    let totalReminderResponseTime = 0;
    let reminderResponseCount = 0;
    for (const invoice of customerInvoices) {
      const invoiceEvents = events.filter(e => e.invoiceId === invoice.id);
      const reminders = invoiceEvents.filter(e => e.eventType === 'reminder_sent');
      const paymentPosted = invoiceEvents.find(e => e.eventType === 'payment_posted');
      
      if (reminders.length > 0 && paymentPosted) {
        // Find the last reminder before payment
        const lastReminderBeforePayment = reminders
          .filter(r => new Date(r.eventAt) < new Date(paymentPosted.eventAt))
          .sort((a, b) => new Date(b.eventAt).getTime() - new Date(a.eventAt).getTime())[0];
        
        if (lastReminderBeforePayment) {
          const responseHours = (new Date(paymentPosted.eventAt).getTime() - new Date(lastReminderBeforePayment.eventAt).getTime()) / (1000 * 60 * 60);
          totalReminderResponseTime += responseHours;
          reminderResponseCount++;
        }
      }
    }
    const reminderResponseTimeAvg = reminderResponseCount > 0 ? totalReminderResponseTime / reminderResponseCount : null;
    
    // Determine DSO trend direction (comparing current period to previous period)
    // This is simplified - in production, we'd compare against historical data
    let dsoTrendDirection: 'improving' | 'flat' | 'worsening' | null = null;
    if (avgDaysToPay !== null) {
      // For now, just set to 'flat' as baseline
      dsoTrendDirection = 'flat';
    }
    
    // Upsert the metrics
    return await this.upsertCustomerPaymentMetrics(customerId, {
      avgDaysToPay: avgDaysToPay?.toFixed(2) || null,
      medianDaysToPay: medianDaysToPay?.toFixed(2) || null,
      pctOnTime: pctOnTime?.toFixed(2) || null,
      pctPaidAfterReminder: pctPaidAfterReminder?.toFixed(2) || null,
      disputeRate: disputeRate?.toFixed(2) || null,
      reminderResponseTimeAvg: reminderResponseTimeAvg?.toFixed(2) || null,
      dsoTrendDirection,
      totalInvoicesAnalyzed: totalInvoiceCount,
      totalPaymentsAnalyzed: customerPayments.length,
      analysisWindowStart: sixMonthsAgo.toISOString().split('T')[0],
      analysisWindowEnd: new Date().toISOString().split('T')[0],
      lastCalculatedAt: new Date(),
    });
  }

  // AI Scoring v1 - Payment Timeliness & Collections Risk
  async calculatePaymentTimelinessScore(customerId: string): Promise<{
    score: number;
    tier: 'healthy' | 'watchlist' | 'at_risk' | 'collections_candidate';
    explanation: string[];
    hasEnoughData: boolean;
  }> {
    // Get customer payment metrics
    const metrics = await this.getCustomerPaymentMetrics(customerId);
    
    // Check if we have enough data to score
    const minInvoicesRequired = 3;
    if (!metrics || (metrics.totalInvoicesAnalyzed || 0) < minInvoicesRequired) {
      return {
        score: 50,
        tier: 'watchlist',
        explanation: ['Insufficient payment history for accurate scoring'],
        hasEnoughData: false,
      };
    }
    
    // Start with a base score of 100 and apply penalties/bonuses
    let score = 100;
    const explanations: { text: string; impact: number }[] = [];
    
    // Factor 1: On-time payment percentage (max 30 point impact)
    const pctOnTime = parseFloat(metrics.pctOnTime || '100');
    if (pctOnTime < 50) {
      const penalty = Math.min(30, (100 - pctOnTime) * 0.4);
      score -= penalty;
      explanations.push({ text: `Only ${pctOnTime.toFixed(0)}% of invoices paid on time`, impact: -penalty });
    } else if (pctOnTime >= 90) {
      const bonus = 5;
      score = Math.min(100, score + bonus);
      explanations.push({ text: `Excellent on-time payment rate (${pctOnTime.toFixed(0)}%)`, impact: bonus });
    } else if (pctOnTime < 70) {
      const penalty = (70 - pctOnTime) * 0.3;
      score -= penalty;
      explanations.push({ text: `Low on-time payment rate (${pctOnTime.toFixed(0)}%)`, impact: -penalty });
    }
    
    // Factor 2: Average days to pay (max 25 point impact)
    const avgDays = parseFloat(metrics.avgDaysToPay || '30');
    if (avgDays > 60) {
      const penalty = Math.min(25, (avgDays - 30) * 0.4);
      score -= penalty;
      explanations.push({ text: `High average payment time (${avgDays.toFixed(0)} days)`, impact: -penalty });
    } else if (avgDays > 45) {
      const penalty = (avgDays - 30) * 0.3;
      score -= penalty;
      explanations.push({ text: `Slower than average payment (${avgDays.toFixed(0)} days)`, impact: -penalty });
    } else if (avgDays <= 20) {
      const bonus = 5;
      score = Math.min(100, score + bonus);
      explanations.push({ text: `Fast payment time (${avgDays.toFixed(0)} days average)`, impact: bonus });
    }
    
    // Factor 3: Dispute rate (max 20 point impact)
    const disputeRate = parseFloat(metrics.disputeRate || '0');
    if (disputeRate > 20) {
      const penalty = Math.min(20, disputeRate * 0.5);
      score -= penalty;
      explanations.push({ text: `High dispute rate (${disputeRate.toFixed(0)}%)`, impact: -penalty });
    } else if (disputeRate > 10) {
      const penalty = disputeRate * 0.3;
      score -= penalty;
      explanations.push({ text: `Elevated dispute rate (${disputeRate.toFixed(0)}%)`, impact: -penalty });
    }
    
    // Factor 4: Percentage paid only after reminders (max 15 point impact)
    const pctAfterReminder = parseFloat(metrics.pctPaidAfterReminder || '0');
    if (pctAfterReminder > 60) {
      const penalty = Math.min(15, (pctAfterReminder - 30) * 0.3);
      score -= penalty;
      explanations.push({ text: `${pctAfterReminder.toFixed(0)}% of payments only after reminders`, impact: -penalty });
    } else if (pctAfterReminder > 40) {
      const penalty = (pctAfterReminder - 30) * 0.2;
      score -= penalty;
      explanations.push({ text: `Frequently pays only after reminders (${pctAfterReminder.toFixed(0)}%)`, impact: -penalty });
    }
    
    // Factor 5: DSO trend direction (max 10 point impact)
    const dsoTrend = metrics.dsoTrendDirection;
    if (dsoTrend === 'worsening') {
      score -= 10;
      explanations.push({ text: 'DSO trend is worsening', impact: -10 });
    } else if (dsoTrend === 'improving') {
      const bonus = 5;
      score = Math.min(100, score + bonus);
      explanations.push({ text: 'DSO trend is improving', impact: bonus });
    }
    
    // Clamp score to 0-100
    score = Math.max(0, Math.min(100, Math.round(score)));
    
    // Determine tier based on score
    let tier: 'healthy' | 'watchlist' | 'at_risk' | 'collections_candidate';
    if (score >= 70) {
      tier = 'healthy';
    } else if (score >= 50) {
      tier = 'watchlist';
    } else if (score >= 30) {
      tier = 'at_risk';
    } else {
      tier = 'collections_candidate';
    }
    
    // Sort explanations by impact magnitude and take top 3
    const sortedExplanations = explanations
      .sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact))
      .slice(0, 3)
      .map(e => e.text);
    
    // If no explanations, add a default
    if (sortedExplanations.length === 0) {
      sortedExplanations.push('Payment behavior is within normal parameters');
    }
    
    return {
      score,
      tier,
      explanation: sortedExplanations,
      hasEnoughData: true,
    };
  }

  async updateCustomerAIScore(customerId: string): Promise<Customer | undefined> {
    // First, ensure payment metrics are up to date
    await this.calculateAndUpdateCustomerPaymentMetrics(customerId);
    
    // Calculate the score
    const result = await this.calculatePaymentTimelinessScore(customerId);
    
    // Update the customer record
    const [updated] = await db.update(customers)
      .set({
        paymentTimelinessScore: result.score,
        collectionsRiskTier: result.tier,
        scoreExplanation: JSON.stringify(result.explanation),
        lastScoredAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(customers.id, customerId))
      .returning();
    
    return updated;
  }

  async getCustomersWithAIScores(filters?: { tier?: string; minScore?: number; maxScore?: number }): Promise<Customer[]> {
    const conditions: any[] = [];
    
    // Only include customers that have been scored
    conditions.push(isNotNull(customers.lastScoredAt));
    
    if (filters?.tier) {
      conditions.push(eq(customers.collectionsRiskTier, filters.tier));
    }
    
    if (filters?.minScore !== undefined) {
      conditions.push(gte(customers.paymentTimelinessScore, filters.minScore));
    }
    
    if (filters?.maxScore !== undefined) {
      conditions.push(lte(customers.paymentTimelinessScore, filters.maxScore));
    }
    
    return await db.select().from(customers).where(and(...conditions)).orderBy(asc(customers.paymentTimelinessScore));
  }

  // QuickBooks Integration
  async getQuickbooksSettings(): Promise<QuickbooksSettings | undefined> {
    const [settings] = await db.select().from(quickbooksSettings).limit(1);
    return settings;
  }

  async upsertQuickbooksSettings(settings: Partial<InsertQuickbooksSettings> & { updatedBy?: string }): Promise<QuickbooksSettings> {
    const existing = await this.getQuickbooksSettings();
    if (existing) {
      const [updated] = await db.update(quickbooksSettings)
        .set({ ...settings, updatedAt: new Date() })
        .where(eq(quickbooksSettings.id, existing.id))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(quickbooksSettings)
        .values({ ...settings as InsertQuickbooksSettings })
        .returning();
      return created;
    }
  }

  async updateQuickbooksSyncStatus(
    entityType: 'invoice' | 'payment' | 'credit_memo' | 'deposit',
    entityId: string,
    status: string,
    error?: string,
    externalId?: string
  ): Promise<void> {
    const updateData: any = {
      qbSyncStatus: status,
      qbSyncError: error || null,
    };
    if (status === 'synced') {
      updateData.qbSyncedAt = new Date();
    }
    
    if (entityType === 'invoice') {
      if (externalId) updateData.qbInvoiceId = externalId;
      await db.update(invoices).set(updateData).where(eq(invoices.id, entityId));
    } else if (entityType === 'payment') {
      if (externalId) updateData.qbPaymentId = externalId;
      await db.update(payments).set(updateData).where(eq(payments.id, entityId));
    } else if (entityType === 'credit_memo') {
      if (externalId) updateData.qbCreditMemoId = externalId;
      await db.update(creditMemos).set(updateData).where(eq(creditMemos.id, entityId));
    } else if (entityType === 'deposit') {
      if (externalId) updateData.qbDepositId = externalId;
      await db.update(depositBatches).set(updateData).where(eq(depositBatches.id, entityId));
    }
  }

  async queueQuickbooksSync(entityType: string, entityId: string, operationType: string, queuedBy?: string): Promise<void> {
    const existing = await db.select()
      .from(integrationQueue)
      .where(and(
        eq(integrationQueue.integrationType, 'quickbooks'),
        eq(integrationQueue.entityType, entityType),
        eq(integrationQueue.entityId, entityId),
        eq(integrationQueue.operationType, operationType),
        or(
          eq(integrationQueue.status, 'queued'),
          eq(integrationQueue.status, 'processing')
        )
      ))
      .limit(1);

    if (existing.length > 0) {
      console.log(`[QuickBooks Sync] Dedup: ${operationType} for ${entityType}/${entityId} already queued/processing, skipping`);
      return;
    }

    await db.insert(integrationQueue).values({
      integrationType: 'quickbooks',
      operationType,
      entityType,
      entityId,
      status: 'queued',
      priority: 5,
      queuedBy,
    });
  }

  async getQuickbooksSyncQueue(status?: string): Promise<any[]> {
    let query = db.select().from(integrationQueue).where(eq(integrationQueue.integrationType, 'quickbooks'));
    if (status) {
      query = query.where(eq(integrationQueue.status, status));
    }
    return await query.orderBy(integrationQueue.createdAt);
  }

  // ==========================================
  // PAYMENT RETRY CONFIG OPERATIONS
  // ==========================================

  async getPaymentRetryConfig(orgId?: string): Promise<any[]> {
    if (orgId) {
      return await db.select().from(paymentRetryConfig)
        .where(eq(paymentRetryConfig.orgId, orgId))
        .orderBy(paymentRetryConfig.paymentMethod);
    }
    return await db.select().from(paymentRetryConfig).orderBy(paymentRetryConfig.paymentMethod);
  }

  async getPaymentRetryConfigByMethod(paymentMethod: string, orgId?: string): Promise<any | undefined> {
    const conditions = [eq(paymentRetryConfig.paymentMethod, paymentMethod)];
    if (orgId) {
      conditions.push(eq(paymentRetryConfig.orgId, orgId));
    }
    const result = await db.select().from(paymentRetryConfig)
      .where(and(...conditions))
      .limit(1);
    return result[0];
  }

  async createPaymentRetryConfig(config: any): Promise<any> {
    const id = `prc_${Date.now()}`;
    const [result] = await db.insert(paymentRetryConfig).values({ ...config, id }).returning();
    return result;
  }

  async updatePaymentRetryConfig(id: string, updates: any): Promise<any | undefined> {
    const [result] = await db.update(paymentRetryConfig)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(paymentRetryConfig.id, id))
      .returning();
    return result;
  }

  async deletePaymentRetryConfig(id: string): Promise<void> {
    await db.delete(paymentRetryConfig).where(eq(paymentRetryConfig.id, id));
  }

  // ==========================================
  // PAYMENT RETRY ATTEMPTS OPERATIONS
  // ==========================================

  async getPaymentRetryAttempts(paymentId: string): Promise<any[]> {
    return await db.select().from(paymentRetryAttempts)
      .where(eq(paymentRetryAttempts.paymentId, paymentId))
      .orderBy(paymentRetryAttempts.attemptNumber);
  }

  async getScheduledRetryAttempts(beforeDate?: Date): Promise<any[]> {
    const conditions = [eq(paymentRetryAttempts.status, 'scheduled')];
    if (beforeDate) {
      conditions.push(lte(paymentRetryAttempts.scheduledAt, beforeDate));
    }
    return await db.select().from(paymentRetryAttempts)
      .where(and(...conditions))
      .orderBy(paymentRetryAttempts.scheduledAt);
  }

  async createPaymentRetryAttempt(attempt: any): Promise<any> {
    const id = `pra_${Date.now()}`;
    const [result] = await db.insert(paymentRetryAttempts).values({ ...attempt, id }).returning();
    return result;
  }

  async updatePaymentRetryAttempt(id: string, updates: any): Promise<any | undefined> {
    const [result] = await db.update(paymentRetryAttempts)
      .set(updates)
      .where(eq(paymentRetryAttempts.id, id))
      .returning();
    return result;
  }

  async schedulePaymentRetry(paymentId: string, retryAt: Date, attemptNumber: number): Promise<any> {
    return await this.createPaymentRetryAttempt({
      paymentId,
      attemptNumber,
      scheduledAt: retryAt,
      status: 'scheduled',
    });
  }

  async processPaymentRetry(
    attemptId: string, 
    status: string, 
    processorResponse?: string, 
    failureCode?: string, 
    failureMessage?: string
  ): Promise<any | undefined> {
    const [result] = await db.update(paymentRetryAttempts)
      .set({
        status,
        attemptedAt: new Date(),
        processorResponse,
        failureCode,
        failureMessage,
      })
      .where(eq(paymentRetryAttempts.id, attemptId))
      .returning();
    return result;
  }

  async cancelPendingRetries(paymentId: string): Promise<number> {
    const result = await db.update(paymentRetryAttempts)
      .set({ status: 'cancelled' })
      .where(and(
        eq(paymentRetryAttempts.paymentId, paymentId),
        eq(paymentRetryAttempts.status, 'scheduled')
      ))
      .returning();
    return result.length;
  }

  // ==========================================
  // CUSTOMER PAYMENT METHODS OPERATIONS
  // ==========================================

  async getCustomerPaymentMethods(customerId: string): Promise<any[]> {
    return await db.select().from(customerPaymentMethods)
      .where(and(
        eq(customerPaymentMethods.customerId, customerId),
        isNull(customerPaymentMethods.deletedAt)
      ))
      .orderBy(desc(customerPaymentMethods.isDefault), customerPaymentMethods.createdAt);
  }

  async getCustomerPaymentMethod(id: string): Promise<any | undefined> {
    const result = await db.select().from(customerPaymentMethods)
      .where(eq(customerPaymentMethods.id, id))
      .limit(1);
    return result[0];
  }

  async createCustomerPaymentMethod(method: any): Promise<any> {
    const id = `cpm_${Date.now()}`;
    const [result] = await db.insert(customerPaymentMethods).values({ ...method, id }).returning();
    return result;
  }

  async updateCustomerPaymentMethod(id: string, updates: any): Promise<any | undefined> {
    const [result] = await db.update(customerPaymentMethods)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(customerPaymentMethods.id, id))
      .returning();
    return result;
  }

  async deleteCustomerPaymentMethod(id: string): Promise<void> {
    await db.update(customerPaymentMethods)
      .set({ deletedAt: new Date(), isActive: false })
      .where(eq(customerPaymentMethods.id, id));
  }

  async setDefaultPaymentMethod(customerId: string, paymentMethodId: string): Promise<void> {
    // First, unset all defaults for this customer
    await db.update(customerPaymentMethods)
      .set({ isDefault: false })
      .where(eq(customerPaymentMethods.customerId, customerId));
    
    // Then set the new default
    await db.update(customerPaymentMethods)
      .set({ isDefault: true })
      .where(eq(customerPaymentMethods.id, paymentMethodId));
  }

  // ==========================================
  // AUTOPAY MANAGEMENT OPERATIONS
  // ==========================================

  async getAutopayEligibleInvoices(trigger: 'on_send' | 'on_due_date'): Promise<any[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Get invoices that are eligible for autopay
    const allInvoices = await db.select({
      invoice: invoices,
      billingProfile: customerBillingProfiles,
    })
      .from(invoices)
      .innerJoin(customerBillingProfiles, eq(invoices.customerId, customerBillingProfiles.customerId))
      .where(and(
        // Billing profile has autopay enabled with matching trigger
        eq(customerBillingProfiles.autopayEnabled, true),
        eq(customerBillingProfiles.autopayTrigger, trigger),
        // Invoice is in a payable state (not disputed, void, or already paid)
        or(
          eq(invoices.status, 'sent'),
          eq(invoices.status, 'overdue')
        ),
        // Has a valid autopay payment method
        isNull(customerBillingProfiles.autopayDisabledAt)
      ));
    
    // For on_due_date trigger, filter to invoices due today
    if (trigger === 'on_due_date') {
      return allInvoices.filter(item => {
        const dueDate = new Date(item.invoice.dueDate);
        dueDate.setHours(0, 0, 0, 0);
        return dueDate.getTime() === today.getTime();
      });
    }
    
    return allInvoices;
  }

  async createAutopayAttempt(attempt: any): Promise<any> {
    const id = `apa_${Date.now()}`;
    const [result] = await db.insert(autopayAttempts).values({ ...attempt, id }).returning();
    return result;
  }

  async updateAutopayAttempt(id: string, updates: any): Promise<any | undefined> {
    const [result] = await db.update(autopayAttempts)
      .set(updates)
      .where(eq(autopayAttempts.id, id))
      .returning();
    return result;
  }

  async getAutopayAttemptsByInvoice(invoiceId: string): Promise<any[]> {
    return await db.select().from(autopayAttempts)
      .where(eq(autopayAttempts.invoiceId, invoiceId))
      .orderBy(desc(autopayAttempts.createdAt));
  }

  async getAutopayAttemptsByCustomer(customerId: string): Promise<any[]> {
    return await db.select().from(autopayAttempts)
      .where(eq(autopayAttempts.customerId, customerId))
      .orderBy(desc(autopayAttempts.createdAt));
  }

  async processAutopay(invoiceId: string, paymentMethodId: string, trigger: string): Promise<any> {
    // Get invoice
    const invoice = await this.getInvoice(invoiceId);
    if (!invoice) {
      throw new Error('Invoice not found');
    }
    
    // Check invoice is in valid state for autopay
    if (['paid', 'void', 'cancelled'].includes(invoice.status)) {
      throw new Error(`Invoice is ${invoice.status}, cannot process autopay`);
    }
    
    // Check for disputes
    const disputes = await this.getInvoiceDisputes({ invoiceId, status: 'open' });
    if (disputes.length > 0) {
      throw new Error('Invoice has open disputes, cannot process autopay');
    }
    
    // Get payment method
    const paymentMethod = await this.getCustomerPaymentMethod(paymentMethodId);
    if (!paymentMethod || !paymentMethod.isActive || !paymentMethod.isVerified) {
      throw new Error('Payment method not available or not verified');
    }
    
    // Create autopay attempt record
    const attempt = await this.createAutopayAttempt({
      invoiceId,
      customerId: invoice.customerId,
      paymentMethodId,
      trigger,
      amount: invoice.totalAmount,
      status: 'processing',
    });
    
    // Log to invoice timeline
    await this.createInvoiceActivity({
      invoiceId,
      activityType: 'autopay_initiated',
      description: `Autopay attempt initiated via ${trigger} trigger`,
      metadata: { attemptId: attempt.id, paymentMethodId, amount: invoice.totalAmount },
    });
    
    return attempt;
  }

  async disableCustomerAutopay(customerId: string, disabledBy: string, reason?: string): Promise<void> {
    await db.update(customerBillingProfiles)
      .set({
        autopayEnabled: false,
        autopayDisabledAt: new Date(),
        autopayDisabledBy: disabledBy,
        autopayDisabledReason: reason,
        updatedAt: new Date(),
      })
      .where(eq(customerBillingProfiles.customerId, customerId));
  }

  // ==========================================
  // LATE FEE MANAGEMENT OPERATIONS
  // ==========================================

  async getInvoicesEligibleForLateFee(): Promise<Invoice[]> {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    // Get all overdue invoices that haven't had late fees applied yet
    // and have customers with late fee policies enabled
    const eligibleInvoices = await db.select()
      .from(invoices)
      .innerJoin(customerBillingProfiles, eq(invoices.customerId, customerBillingProfiles.customerId))
      .where(and(
        // Invoice is overdue
        sql`${invoices.dueDate}::date < ${todayStr}::date`,
        // Has a positive balance
        sql`CAST(COALESCE(${invoices.balanceDue}, ${invoices.totalAmount}) AS DECIMAL) > 0`,
        // Not already had late fee applied
        isNull(invoices.lateFeeAppliedAt),
        // Invoice is in a billable state
        or(
          eq(invoices.status, 'sent'),
          eq(invoices.status, 'overdue'),
          eq(invoices.status, 'partially_paid'),
          eq(invoices.status, 'viewed')
        ),
        // Not voided or disputed
        isNull(invoices.voidedAt),
        or(eq(invoices.isDisputed, false), isNull(invoices.isDisputed)),
        // Customer has late fee enabled
        eq(customerBillingProfiles.lateFeeEnabled, true),
        // Grace period has passed: dueDate + gracePeriodDays < today
        sql`(${invoices.dueDate}::date + COALESCE(${customerBillingProfiles.gracePeriodDays}, 0) * interval '1 day')::date < ${todayStr}::date`
      ))
      .orderBy(asc(invoices.dueDate));

    return eligibleInvoices.map(row => row.invoices);
  }

  async applyLateFeeToInvoice(invoiceId: string, appliedBy: string): Promise<{ invoice: Invoice; lineItem: InvoiceLineItem } | null> {
    // Get the invoice
    const invoice = await this.getInvoice(invoiceId);
    if (!invoice) {
      return null;
    }

    // Check if late fee already applied
    if (invoice.lateFeeAppliedAt) {
      console.log(`[LateFee] Late fee already applied to invoice ${invoiceId}`);
      return null;
    }

    // Get customer billing profile for late fee policy
    if (!invoice.customerId) {
      console.log(`[LateFee] Invoice ${invoiceId} has no customer`);
      return null;
    }

    const billingProfile = await this.getCustomerBillingProfile(invoice.customerId);
    if (!billingProfile || !billingProfile.lateFeeEnabled) {
      console.log(`[LateFee] Late fees not enabled for customer ${invoice.customerId}`);
      return null;
    }

    // Calculate late fee amount
    let lateFeeAmount: number;
    const invoiceTotal = parseFloat(invoice.totalAmount || '0');
    
    if (billingProfile.lateFeeType === 'percent') {
      const percentage = parseFloat(billingProfile.lateFeeAmount || '0');
      lateFeeAmount = (invoiceTotal * percentage) / 100;
    } else {
      // flat fee
      lateFeeAmount = parseFloat(billingProfile.lateFeeAmount || '0');
    }

    if (lateFeeAmount <= 0) {
      console.log(`[LateFee] Calculated late fee is $0 for invoice ${invoiceId}`);
      return null;
    }

    // Get current line items to determine next line number
    const existingLineItems = await this.getInvoiceLineItems(invoiceId);
    const maxLineNumber = existingLineItems.reduce((max, item) => Math.max(max, item.lineNumber || 0), 0);

    // Create late fee line item
    const lineItem = await this.createInvoiceLineItem({
      invoiceId,
      lineNumber: maxLineNumber + 1,
      lineItemType: 'late_fee',
      serviceType: 'late_fee',
      description: `Late Fee${billingProfile.lateFeeType === 'percent' ? ` (${billingProfile.lateFeeAmount}%)` : ''}`,
      quantity: '1',
      unitPrice: lateFeeAmount.toFixed(2),
      totalPrice: lateFeeAmount.toFixed(2),
      isTaxable: false,
    });

    // Update invoice with late fee info and new totals
    const newSubtotal = parseFloat(invoice.subtotalAmount || '0') + lateFeeAmount;
    const newTotal = parseFloat(invoice.totalAmount || '0') + lateFeeAmount;
    const newBalanceDue = parseFloat(invoice.balanceDue || invoice.totalAmount || '0') + lateFeeAmount;

    const [updatedInvoice] = await db.update(invoices)
      .set({
        lateFeeAppliedAt: new Date(),
        lateFeeAmount: lateFeeAmount.toFixed(2),
        subtotalAmount: newSubtotal.toFixed(2),
        totalAmount: newTotal.toFixed(2),
        balanceDue: newBalanceDue.toFixed(2),
        feesAmount: (parseFloat(invoice.feesAmount || '0') + lateFeeAmount).toFixed(2),
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, invoiceId))
      .returning();

    // Log to invoice activity timeline
    await this.createInvoiceActivity({
      invoiceId,
      activityType: 'late_fee_applied',
      performedBy: appliedBy,
      description: `Late fee of $${lateFeeAmount.toFixed(2)} applied`,
      metadata: {
        lateFeeAmount: lateFeeAmount.toFixed(2),
        lateFeeType: billingProfile.lateFeeType,
        lateFeeRate: billingProfile.lateFeeAmount,
        gracePeriodDays: billingProfile.gracePeriodDays,
        lineItemId: lineItem.id,
      },
    });

    // Log to audit trail
    await this.createInvoiceAuditLogEntry({
      invoiceId,
      action: 'late_fee_applied',
      performedBy: appliedBy,
      previousValues: {
        totalAmount: invoice.totalAmount,
        balanceDue: invoice.balanceDue,
        lateFeeAppliedAt: null,
      },
      newValues: {
        totalAmount: newTotal.toFixed(2),
        balanceDue: newBalanceDue.toFixed(2),
        lateFeeAppliedAt: new Date().toISOString(),
        lateFeeAmount: lateFeeAmount.toFixed(2),
      },
    });

    console.log(`[LateFee] Applied $${lateFeeAmount.toFixed(2)} late fee to invoice ${invoiceId}`);

    return { invoice: updatedInvoice, lineItem };
  }

  async reverseLateFee(invoiceId: string, reversedBy: string, reason: string): Promise<Invoice | null> {
    // Get the invoice
    const invoice = await this.getInvoice(invoiceId);
    if (!invoice) {
      return null;
    }

    // Check if late fee was applied
    if (!invoice.lateFeeAppliedAt || !invoice.lateFeeAmount) {
      console.log(`[LateFee] No late fee to reverse on invoice ${invoiceId}`);
      return null;
    }

    // Check if already reversed
    if (invoice.lateFeeReversedAt) {
      console.log(`[LateFee] Late fee already reversed on invoice ${invoiceId}`);
      return null;
    }

    const lateFeeAmount = parseFloat(invoice.lateFeeAmount);

    // Find and remove the late fee line item
    const lateFeeLineItem = await this.getLateFeeLineItem(invoiceId);
    if (lateFeeLineItem) {
      await this.deleteInvoiceLineItem(lateFeeLineItem.id);
    }

    // Update invoice with reversal info and adjusted totals
    const newSubtotal = parseFloat(invoice.subtotalAmount || '0') - lateFeeAmount;
    const newTotal = parseFloat(invoice.totalAmount || '0') - lateFeeAmount;
    const newBalanceDue = parseFloat(invoice.balanceDue || invoice.totalAmount || '0') - lateFeeAmount;

    const [updatedInvoice] = await db.update(invoices)
      .set({
        lateFeeReversedAt: new Date(),
        lateFeeReversedBy: reversedBy,
        lateFeeReversalReason: reason,
        subtotalAmount: newSubtotal.toFixed(2),
        totalAmount: newTotal.toFixed(2),
        balanceDue: newBalanceDue.toFixed(2),
        feesAmount: (parseFloat(invoice.feesAmount || '0') - lateFeeAmount).toFixed(2),
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, invoiceId))
      .returning();

    // Log to invoice activity timeline
    await this.createInvoiceActivity({
      invoiceId,
      activityType: 'late_fee_reversed',
      performedBy: reversedBy,
      description: `Late fee of $${lateFeeAmount.toFixed(2)} reversed: ${reason}`,
      metadata: {
        lateFeeAmount: lateFeeAmount.toFixed(2),
        reversalReason: reason,
        lineItemId: lateFeeLineItem?.id,
      },
    });

    // Log to audit trail
    await this.createInvoiceAuditLogEntry({
      invoiceId,
      action: 'late_fee_reversed',
      performedBy: reversedBy,
      previousValues: {
        totalAmount: invoice.totalAmount,
        balanceDue: invoice.balanceDue,
        lateFeeReversedAt: null,
      },
      newValues: {
        totalAmount: newTotal.toFixed(2),
        balanceDue: newBalanceDue.toFixed(2),
        lateFeeReversedAt: new Date().toISOString(),
        lateFeeReversalReason: reason,
      },
      notes: reason,
    });

    console.log(`[LateFee] Reversed $${lateFeeAmount.toFixed(2)} late fee on invoice ${invoiceId}: ${reason}`);

    return updatedInvoice;
  }

  async getLateFeeLineItem(invoiceId: string): Promise<InvoiceLineItem | undefined> {
    const [lineItem] = await db.select()
      .from(invoiceLineItems)
      .where(and(
        eq(invoiceLineItems.invoiceId, invoiceId),
        eq(invoiceLineItems.lineItemType, 'late_fee')
      ))
      .limit(1);
    
    return lineItem;
  }

  // ==========================================
  // COLLECTIONS WORKBENCH OPERATIONS
  // ==========================================

  async getCollectionsQueue(filters?: {
    overdueBucket?: string;
    customerId?: string;
    minBalance?: number;
    maxBalance?: number;
    isDisputed?: boolean;
    assignedToUserId?: string;
    lastReminderBefore?: string;
    lastReminderAfter?: string;
    riskTier?: string;
  }): Promise<any[]> {
    const today = new Date();
    
    // Get overdue invoices with customer rollups
    const overdueInvoices = await db.select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      customerId: invoices.customerId,
      customerName: invoices.customerName,
      dueDate: invoices.dueDate,
      balanceDue: invoices.balanceDue,
      totalAmount: invoices.totalAmount,
      status: invoices.status,
      isDisputed: invoices.isDisputed,
      disputedAmount: invoices.disputedAmount,
      lastSentAt: invoices.lastSentAt,
      sentAt: invoices.sentAt,
    }).from(invoices)
      .where(and(
        sql`${invoices.dueDate}::date < ${today.toISOString().split('T')[0]}::date`,
        sql`CAST(${invoices.balanceDue} AS DECIMAL) > 0`,
        or(eq(invoices.status, 'sent'), eq(invoices.status, 'overdue'), eq(invoices.status, 'partially_paid'), eq(invoices.status, 'viewed'))
      ))
      .orderBy(asc(invoices.dueDate));

    // Get last reminder info for each invoice
    const invoiceIds = overdueInvoices.map(inv => inv.id);
    const reminderActivities = invoiceIds.length > 0 
      ? await db.select({
          invoiceId: invoiceActivities.invoiceId,
          createdAt: invoiceActivities.createdAt,
        }).from(invoiceActivities)
          .where(and(
            inArray(invoiceActivities.invoiceId, invoiceIds),
            eq(invoiceActivities.activityType, 'reminder_sent')
          ))
          .orderBy(desc(invoiceActivities.createdAt))
      : [];

    // Create a map of invoiceId to last reminder date
    const lastReminderMap: Record<string, Date> = {};
    reminderActivities.forEach(activity => {
      if (!lastReminderMap[activity.invoiceId] && activity.createdAt) {
        lastReminderMap[activity.invoiceId] = activity.createdAt;
      }
    });

    // Get assigned owner for each customer from most recent notes
    const customerIds = [...new Set(overdueInvoices.map(inv => inv.customerId).filter(Boolean))] as string[];
    const ownerAssignments: Record<string, string> = {};
    if (customerIds.length > 0) {
      const notesWithOwners = await db.select({
        customerId: collectionsNotes.customerId,
        assignedToUserId: collectionsNotes.assignedToUserId,
      }).from(collectionsNotes)
        .where(and(
          inArray(collectionsNotes.customerId, customerIds),
          sql`${collectionsNotes.assignedToUserId} IS NOT NULL`
        ))
        .orderBy(desc(collectionsNotes.createdAt));
      
      notesWithOwners.forEach(note => {
        if (note.customerId && note.assignedToUserId && !ownerAssignments[note.customerId]) {
          ownerAssignments[note.customerId] = note.assignedToUserId;
        }
      });
    }

    // Calculate days overdue and bucket for each invoice

    // Fetch AI scores for each customer
    const customerScores: Record<string, { score: number | null; tier: string | null }> = {};
    if (customerIds.length > 0) {
      const customerRecords = await db.select({
        id: customers.id,
        paymentTimelinessScore: customers.paymentTimelinessScore,
        collectionsRiskTier: customers.collectionsRiskTier,
      }).from(customers)
        .where(inArray(customers.id, customerIds));
      
      customerRecords.forEach(c => {
        customerScores[c.id] = {
          score: c.paymentTimelinessScore,
          tier: c.collectionsRiskTier,
        };
      });
    }
    const enrichedInvoices = overdueInvoices.map(inv => {
      const dueDate = new Date(inv.dueDate);
      const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
      let bucket: string;
      if (daysOverdue <= 30) bucket = '1-30';
      else if (daysOverdue <= 60) bucket = '31-60';
      else if (daysOverdue <= 90) bucket = '61-90';
      else bucket = '90+';
      
      return {
        ...inv,
        daysOverdue,
        overdueBucket: bucket,
        lastReminderSent: lastReminderMap[inv.id] || null,
        assignedOwner: inv.customerId ? ownerAssignments[inv.customerId] || null : null,
        aiScore: inv.customerId ? customerScores[inv.customerId]?.score || null : null,
        aiTier: inv.customerId ? customerScores[inv.customerId]?.tier || null : null,
      };
    });

    // Apply filters
    let filtered = enrichedInvoices;
    
    if (filters?.overdueBucket) {
      filtered = filtered.filter(inv => inv.overdueBucket === filters.overdueBucket);
    }
    if (filters?.customerId) {
      filtered = filtered.filter(inv => inv.customerId === filters.customerId);
    }
    if (filters?.minBalance !== undefined) {
      filtered = filtered.filter(inv => parseFloat(inv.balanceDue || '0') >= filters.minBalance!);
    }
    if (filters?.maxBalance !== undefined) {
      filtered = filtered.filter(inv => parseFloat(inv.balanceDue || '0') <= filters.maxBalance!);
    }
    if (filters?.isDisputed !== undefined) {
      filtered = filtered.filter(inv => inv.isDisputed === filters.isDisputed);
    }
    if (filters?.assignedToUserId) {
      filtered = filtered.filter(inv => inv.assignedOwner === filters.assignedToUserId);
    }
    if (filters?.lastReminderBefore) {
      const beforeDate = new Date(filters.lastReminderBefore);
      filtered = filtered.filter(inv => {
        if (!inv.lastReminderSent) return true; // Include invoices with no reminder
        return new Date(inv.lastReminderSent) < beforeDate;
      });
    }
    if (filters?.lastReminderAfter) {
      const afterDate = new Date(filters.lastReminderAfter);
      filtered = filtered.filter(inv => {
        if (!inv.lastReminderSent) return false;
        return new Date(inv.lastReminderSent) > afterDate;
      });
    }

    return filtered;
  }

  async getCollectionsCustomerRollup(customerId: string): Promise<any> {
    const today = new Date();
    
    // Get all overdue invoices for the customer
    const overdueInvoices = await db.select().from(invoices)
      .where(and(
        eq(invoices.customerId, customerId),
        sql`${invoices.dueDate}::date < ${today.toISOString().split('T')[0]}::date`,
        sql`CAST(${invoices.balanceDue} AS DECIMAL) > 0`
      ))
      .orderBy(asc(invoices.dueDate));

    // Get customer payment metrics if available
    const [metrics] = await db.select().from(customerPaymentMetrics)
      .where(eq(customerPaymentMetrics.customerId, customerId))
      .limit(1);

    // Get last payment for this customer
    const [lastPayment] = await db.select({
      paymentDate: payments.paymentDate,
      amount: payments.amount,
    }).from(payments)
      .innerJoin(invoices, eq(payments.invoiceId, invoices.id))
      .where(eq(invoices.customerId, customerId))
      .orderBy(desc(payments.paymentDate))
      .limit(1);

    // Get communication history (last 5 reminders sent)
    const reminderHistory = await db.select({
      createdAt: invoiceActivities.createdAt,
      invoiceId: invoiceActivities.invoiceId,
      metadata: invoiceActivities.metadata,
      channel: invoiceActivities.channel,
    }).from(invoiceActivities)
      .innerJoin(invoices, eq(invoiceActivities.invoiceId, invoices.id))
      .where(and(
        eq(invoices.customerId, customerId),
        eq(invoiceActivities.activityType, 'reminder_sent')
      ))
      .orderBy(desc(invoiceActivities.createdAt))
      .limit(5);

    // Get customer flags
    const flags = await this.getCollectionsCustomerFlags(customerId);

    // Get assigned owner from most recent note
    const [ownerNote] = await db.select({
      assignedToUserId: collectionsNotes.assignedToUserId,
    }).from(collectionsNotes)
      .where(and(
        eq(collectionsNotes.customerId, customerId),
        sql`${collectionsNotes.assignedToUserId} IS NOT NULL`
      ))
      .orderBy(desc(collectionsNotes.createdAt))
      .limit(1);

    // Calculate rollup metrics
    const totalBalance = overdueInvoices.reduce((sum, inv) => sum + parseFloat(inv.balanceDue || '0'), 0);
    const oldestInvoiceAge = overdueInvoices.length > 0 
      ? Math.floor((today.getTime() - new Date(overdueInvoices[0].dueDate).getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    // Calculate aging breakdown
    const agingBreakdown = {
      days1to30: { count: 0, amount: 0 },
      days31to60: { count: 0, amount: 0 },
      days61to90: { count: 0, amount: 0 },
      over90: { count: 0, amount: 0 },
    };

    overdueInvoices.forEach(inv => {
      const dueDate = new Date(inv.dueDate);
      const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
      const balance = parseFloat(inv.balanceDue || '0');
      
      if (daysOverdue <= 30) {
        agingBreakdown.days1to30.count++;
        agingBreakdown.days1to30.amount += balance;
      } else if (daysOverdue <= 60) {
        agingBreakdown.days31to60.count++;
        agingBreakdown.days31to60.amount += balance;
      } else if (daysOverdue <= 90) {
        agingBreakdown.days61to90.count++;
        agingBreakdown.days61to90.amount += balance;
      } else {
        agingBreakdown.over90.count++;
        agingBreakdown.over90.amount += balance;
      }
    });

    // Calculate disputed metrics
    const disputedInvoices = overdueInvoices.filter(inv => inv.isDisputed);
    const totalDisputedAmount = disputedInvoices.reduce((sum, inv) => sum + parseFloat(inv.disputedAmount || inv.balanceDue || '0'), 0);

    return {
      customerId,
      openBalance: totalBalance.toFixed(2),
      overdueInvoiceCount: overdueInvoices.length,
      oldestInvoiceAge,
      lastPaymentDate: lastPayment?.paymentDate || null,
      lastPaymentAmount: lastPayment?.amount || null,
      lastReminderSent: reminderHistory.length > 0 ? reminderHistory[0].createdAt : null,
      reminderCount: reminderHistory.length,
      communicationHistory: reminderHistory,
      paymentMetrics: metrics || null,
      flags: flags || null,
      assignedOwner: ownerNote?.assignedToUserId || null,
      agingBreakdown: {
        days1to30: { count: agingBreakdown.days1to30.count, amount: agingBreakdown.days1to30.amount.toFixed(2) },
        days31to60: { count: agingBreakdown.days31to60.count, amount: agingBreakdown.days31to60.amount.toFixed(2) },
        days61to90: { count: agingBreakdown.days61to90.count, amount: agingBreakdown.days61to90.amount.toFixed(2) },
        over90: { count: agingBreakdown.over90.count, amount: agingBreakdown.over90.amount.toFixed(2) },
      },
      disputedCount: disputedInvoices.length,
      disputedAmount: totalDisputedAmount.toFixed(2),
    };
  }

  async getCollectionsNotesByCustomer(customerId: string): Promise<CollectionsNote[]> {
    return await db.select().from(collectionsNotes)
      .where(eq(collectionsNotes.customerId, customerId))
      .orderBy(desc(collectionsNotes.createdAt));
  }

  async getCollectionsNotesByInvoice(invoiceId: string): Promise<CollectionsNote[]> {
    return await db.select().from(collectionsNotes)
      .where(eq(collectionsNotes.invoiceId, invoiceId))
      .orderBy(desc(collectionsNotes.createdAt));
  }

  async createCollectionsNote(note: InsertCollectionsNote): Promise<CollectionsNote> {
    const [result] = await db.insert(collectionsNotes).values(note).returning();
    return result;
  }

  async updateCollectionsNote(id: string, updates: Partial<InsertCollectionsNote>): Promise<CollectionsNote | undefined> {
    const [result] = await db.update(collectionsNotes)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(collectionsNotes.id, id))
      .returning();
    return result;
  }

  async getCollectionsCustomerFlags(customerId: string): Promise<CollectionsCustomerFlag | undefined> {
    const [result] = await db.select().from(collectionsCustomerFlags)
      .where(eq(collectionsCustomerFlags.customerId, customerId))
      .limit(1);
    return result;
  }

  async upsertCollectionsCustomerFlags(flags: Partial<InsertCollectionsCustomerFlag> & { customerId: string }): Promise<CollectionsCustomerFlag> {
    const existing = await this.getCollectionsCustomerFlags(flags.customerId);
    
    if (existing) {
      const [result] = await db.update(collectionsCustomerFlags)
        .set({ ...flags, updatedAt: new Date() })
        .where(eq(collectionsCustomerFlags.customerId, flags.customerId))
        .returning();
      return result;
    } else {
      const [result] = await db.insert(collectionsCustomerFlags)
        .values(flags as InsertCollectionsCustomerFlag)
        .returning();
      return result;
    }
  }

  async calculateNextBestAction(customerId: string): Promise<{ action: string; reason: string; priority: string }> {
    const rollup = await this.getCollectionsCustomerRollup(customerId);
    const flags = rollup.flags;
    const metrics = rollup.paymentMetrics;

    // Rules-based Next Best Action (v1 - deterministic, AI-ready structure)
    
    // Rule 1: If disputed, review dispute first
    const overdueInvoices = await this.getCollectionsQueue({ customerId });
    const hasDisputed = overdueInvoices.some((inv: any) => inv.isDisputed);
    if (hasDisputed) {
      return {
        action: 'review_dispute',
        reason: 'Customer has active dispute(s) requiring review',
        priority: 'high',
      };
    }

    // Rule 2: If already escalated, no further action
    if (flags?.escalatedToCollections) {
      return {
        action: 'no_action_needed',
        reason: 'Account already escalated to collections agency',
        priority: 'low',
      };
    }

    // Rule 3: 90+ days overdue with high balance -> escalate to collections
    const over90 = overdueInvoices.filter((inv: any) => inv.overdueBucket === '90+');
    if (over90.length > 0 && parseFloat(rollup.openBalance) > 1000) {
      return {
        action: 'escalate_collections',
        reason: `${over90.length} invoice(s) over 90 days past due with $${rollup.openBalance} balance`,
        priority: 'critical',
      };
    }

    // Rule 4: Poor payment history -> require prepay
    if (metrics && parseFloat(metrics.pctOnTime || '100') < 30 && !flags?.requirePrepayFlag) {
      return {
        action: 'require_prepay',
        reason: `Only ${metrics.pctOnTime}% of invoices paid on time - consider prepayment requirement`,
        priority: 'high',
      };
    }

    // Rule 5: Multiple partial payments -> switch to ACH only
    if (metrics && parseFloat(metrics.avgPartialPaymentCountPerInvoice || '0') > 2 && !flags?.achOnlyFlag) {
      return {
        action: 'switch_ach_only',
        reason: 'Customer frequently makes partial payments - ACH-only may improve collection',
        priority: 'medium',
      };
    }

    // Rule 6: 61-90 days overdue -> call customer
    const days61to90 = overdueInvoices.filter((inv: any) => inv.overdueBucket === '61-90');
    if (days61to90.length > 0) {
      return {
        action: 'call_customer',
        reason: `${days61to90.length} invoice(s) 61-90 days past due - phone follow-up recommended`,
        priority: 'high',
      };
    }

    // Rule 7: No recent reminder -> send reminder
    const daysSinceReminder = rollup.lastReminderSent 
      ? Math.floor((new Date().getTime() - new Date(rollup.lastReminderSent).getTime()) / (1000 * 60 * 60 * 24))
      : 999;
    
    if (daysSinceReminder > 7 && overdueInvoices.length > 0) {
      return {
        action: 'send_reminder',
        reason: daysSinceReminder === 999 
          ? 'No reminder sent yet for overdue invoice(s)'
          : `Last reminder sent ${daysSinceReminder} days ago`,
        priority: 'medium',
      };
    }

    // Default: No immediate action needed
    return {
      action: 'no_action_needed',
      reason: 'Account is being actively managed',
      priority: 'low',
    };
  }

  // Customer Statement operations
  async getCustomerStatements(customerId: string): Promise<CustomerStatement[]> {
    return await db.select().from(customerStatements)
      .where(eq(customerStatements.customerId, customerId))
      .orderBy(desc(customerStatements.createdAt));
  }

  async getCustomerStatement(id: string): Promise<CustomerStatement | undefined> {
    const [result] = await db.select().from(customerStatements).where(eq(customerStatements.id, id)).limit(1);
    return result;
  }

  async generateStatementNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const [latest] = await db.select({ statementNumber: customerStatements.statementNumber })
      .from(customerStatements)
      .where(sql`${customerStatements.statementNumber} LIKE ${'STMT-' + year + '%'}`)
      .orderBy(desc(customerStatements.statementNumber))
      .limit(1);
    
    let sequence = 1;
    if (latest?.statementNumber) {
      const match = latest.statementNumber.match(/STMT-\d{4}-(\d+)/);
      if (match) {
        sequence = parseInt(match[1]) + 1;
      }
    }
    return `STMT-${year}-${sequence.toString().padStart(5, '0')}`;
  }

  async generateCustomerStatement(customerId: string, periodStartDate: Date, periodEndDate: Date, createdBy: string): Promise<CustomerStatement> {
    // Get customer info
    const customer = await this.getCustomer(customerId);
    if (!customer) {
      throw new Error('Customer not found');
    }

    // Get all invoices for the customer
    const allInvoices = await this.getInvoicesByCustomer(customerId);
    const allPayments = await this.getPaymentsByCustomer(customerId);
    const allCreditMemos = await this.getCreditMemosByCustomer(customerId);

    // Convert dates to string format for comparison
    const startDateStr = periodStartDate.toISOString().split('T')[0];
    const endDateStr = periodEndDate.toISOString().split('T')[0];

    // Calculate opening balance (sum of all unpaid invoices before period start)
    const invoicesBeforePeriod = allInvoices.filter(inv => {
      const invDate = new Date(inv.invoiceDate);
      return invDate < periodStartDate && inv.status !== 'void' && inv.status !== 'draft';
    });
    
    const paymentsBeforePeriod = allPayments.filter(p => {
      const pDate = new Date(p.paymentDate);
      return pDate < periodStartDate && p.status === 'completed';
    });

    const creditsBeforePeriod = allCreditMemos.filter(c => {
      const cDate = new Date(c.creditDate);
      return cDate < periodStartDate && c.status !== 'cancelled';
    });

    const totalInvoicesBeforePeriod = invoicesBeforePeriod.reduce((sum, inv) => sum + parseFloat(inv.totalAmount || '0'), 0);
    const totalPaymentsBeforePeriod = paymentsBeforePeriod.reduce((sum, p) => sum + parseFloat(p.amount || '0'), 0);
    const totalCreditsBeforePeriod = creditsBeforePeriod.reduce((sum, c) => sum + parseFloat(c.amount || '0'), 0);
    const openingBalance = totalInvoicesBeforePeriod - totalPaymentsBeforePeriod - totalCreditsBeforePeriod;

    // Calculate invoices issued during period
    const invoicesDuringPeriod = allInvoices.filter(inv => {
      const invDate = new Date(inv.invoiceDate);
      return invDate >= periodStartDate && invDate <= periodEndDate && inv.status !== 'void' && inv.status !== 'draft';
    });
    const totalInvoicesIssued = invoicesDuringPeriod.reduce((sum, inv) => sum + parseFloat(inv.totalAmount || '0'), 0);

    // Calculate payments received during period
    const paymentsDuringPeriod = allPayments.filter(p => {
      const pDate = new Date(p.paymentDate);
      return pDate >= periodStartDate && pDate <= periodEndDate && p.status === 'completed';
    });
    const totalPaymentsReceived = paymentsDuringPeriod.reduce((sum, p) => sum + parseFloat(p.amount || '0'), 0);

    // Calculate credits/adjustments during period
    const creditsDuringPeriod = allCreditMemos.filter(c => {
      const cDate = new Date(c.creditDate);
      return cDate >= periodStartDate && cDate <= periodEndDate && c.status !== 'cancelled';
    });
    const totalCreditsAdjustments = creditsDuringPeriod.reduce((sum, c) => sum + parseFloat(c.amount || '0'), 0);

    // Calculate closing balance
    const closingBalance = openingBalance + totalInvoicesIssued - totalPaymentsReceived - totalCreditsAdjustments;

    // Calculate aging breakdown (as of period end date)
    const unpaidInvoices = allInvoices.filter(inv => {
      const invDate = new Date(inv.invoiceDate);
      return invDate <= periodEndDate && 
             inv.status !== 'void' && 
             inv.status !== 'draft' && 
             inv.status !== 'paid' &&
             parseFloat(inv.balanceDue || '0') > 0;
    });

    let agingCurrent = 0, aging1to30 = 0, aging31to60 = 0, aging61to90 = 0, agingOver90 = 0;
    
    unpaidInvoices.forEach(inv => {
      const dueDate = new Date(inv.dueDate);
      const daysPastDue = Math.floor((periodEndDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
      const balance = parseFloat(inv.balanceDue || '0');
      
      if (daysPastDue <= 0) {
        agingCurrent += balance;
      } else if (daysPastDue <= 30) {
        aging1to30 += balance;
      } else if (daysPastDue <= 60) {
        aging31to60 += balance;
      } else if (daysPastDue <= 90) {
        aging61to90 += balance;
      } else {
        agingOver90 += balance;
      }
    });

    // Invoice counts by status
    const invoiceCountDraft = allInvoices.filter(i => i.status === 'draft').length;
    const invoiceCountSent = allInvoices.filter(i => i.status === 'sent' || i.status === 'viewed').length;
    const invoiceCountPaid = allInvoices.filter(i => i.status === 'paid').length;
    const invoiceCountOverdue = allInvoices.filter(i => i.status === 'overdue').length;

    // Build transaction details array
    const transactionDetails: any[] = [];
    let runningBalance = openingBalance;

    // Add opening balance entry
    transactionDetails.push({
      type: 'opening_balance',
      date: startDateStr,
      reference: '',
      description: 'Opening Balance',
      amount: openingBalance.toFixed(2),
      balance: runningBalance.toFixed(2)
    });

    // Add all transactions during period (sorted by date)
    const allTransactions: Array<{ type: string; date: Date; reference: string; description: string; amount: number }> = [];

    invoicesDuringPeriod.forEach(inv => {
      allTransactions.push({
        type: 'invoice',
        date: new Date(inv.invoiceDate),
        reference: inv.invoiceNumber,
        description: `Invoice ${inv.invoiceNumber}`,
        amount: parseFloat(inv.totalAmount || '0')
      });
    });

    paymentsDuringPeriod.forEach(p => {
      allTransactions.push({
        type: 'payment',
        date: new Date(p.paymentDate),
        reference: p.paymentNumber,
        description: `Payment ${p.paymentNumber} (${p.paymentMethod})`,
        amount: -parseFloat(p.amount || '0')
      });
    });

    creditsDuringPeriod.forEach(c => {
      allTransactions.push({
        type: 'credit',
        date: new Date(c.creditDate),
        reference: c.creditMemoNumber,
        description: `Credit Memo ${c.creditMemoNumber}`,
        amount: -parseFloat(c.amount || '0')
      });
    });

    // Sort by date
    allTransactions.sort((a, b) => a.date.getTime() - b.date.getTime());

    // Add to transaction details with running balance
    allTransactions.forEach(t => {
      runningBalance += t.amount;
      transactionDetails.push({
        type: t.type,
        date: t.date.toISOString().split('T')[0],
        reference: t.reference,
        description: t.description,
        amount: t.amount.toFixed(2),
        balance: runningBalance.toFixed(2)
      });
    });

    // Generate statement number
    const statementNumber = await this.generateStatementNumber();

    // Insert the statement
    const [result] = await db.insert(customerStatements).values({
      statementNumber,
      customerId,
      customerName: customer.name,
      periodStartDate: startDateStr,
      periodEndDate: endDateStr,
      openingBalance: openingBalance.toFixed(2),
      totalInvoicesIssued: totalInvoicesIssued.toFixed(2),
      totalPaymentsReceived: totalPaymentsReceived.toFixed(2),
      totalCreditsAdjustments: totalCreditsAdjustments.toFixed(2),
      closingBalance: closingBalance.toFixed(2),
      agingCurrent: agingCurrent.toFixed(2),
      aging1to30: aging1to30.toFixed(2),
      aging31to60: aging31to60.toFixed(2),
      aging61to90: aging61to90.toFixed(2),
      agingOver90: agingOver90.toFixed(2),
      invoiceCountDraft,
      invoiceCountSent,
      invoiceCountPaid,
      invoiceCountOverdue,
      transactionDetails,
      createdBy
    }).returning();

    return result;
  }

  // Invoice Email Log operations
  async getInvoiceEmailLog(invoiceId: string): Promise<InvoiceEmailLog[]> {
    return await db.select().from(invoiceEmailLog).where(eq(invoiceEmailLog.invoiceId, invoiceId)).orderBy(desc(invoiceEmailLog.createdAt));
  }

  async createInvoiceEmailLogEntry(entry: InsertInvoiceEmailLog): Promise<InvoiceEmailLog> {
    const [result] = await db.insert(invoiceEmailLog).values(entry).returning();
    return result;
  }

  async updateInvoiceEmailLogStatus(id: string, status: string, details?: any): Promise<InvoiceEmailLog | undefined> {
    const updates: any = { status };
    if (status === 'sent') updates.sentAt = new Date();
    if (status === 'delivered') updates.deliveredAt = new Date();
    if (status === 'opened') updates.openedAt = new Date();
    if (status === 'bounced') {
      updates.bouncedAt = new Date();
      if (details?.reason) updates.bounceReason = details.reason;
    }
    const [result] = await db.update(invoiceEmailLog).set(updates).where(eq(invoiceEmailLog.id, id)).returning();
    return result;
  }

  // Invoice Delivery History operations
  async getInvoiceDeliveryHistory(invoiceId: string): Promise<any[]> {
    return await db.select()
      .from(invoiceDeliveryHistory)
      .where(eq(invoiceDeliveryHistory.invoiceId, invoiceId))
      .orderBy(desc(invoiceDeliveryHistory.createdAt));
  }

  async createInvoiceDeliveryEvent(event: { invoiceId: string; eventType: string; recipientEmail?: string; sentBy?: string; ipAddress?: string; userAgent?: string; metadata?: any }): Promise<any> {
    const [result] = await db.insert(invoiceDeliveryHistory).values({
      invoiceId: event.invoiceId,
      eventType: event.eventType,
      recipientEmail: event.recipientEmail,
      sentBy: event.sentBy,
      ipAddress: event.ipAddress,
      userAgent: event.userAgent,
      metadata: event.metadata,
    }).returning();
    return result;
  }

  async markInvoiceViewed(invoiceId: string, ipAddress?: string, userAgent?: string): Promise<any> {
    // Get current invoice
    const [invoice] = await db.select()
      .from(invoices)
      .where(eq(invoices.id, invoiceId))
      .limit(1);
    
    if (!invoice) return null;

    // Update view count and viewedAt (first view)
    const updates: any = {
      viewCount: (invoice.viewCount || 0) + 1,
      updatedAt: new Date(),
    };
    
    // Only set viewedAt on first view
    if (!invoice.viewedAt) {
      updates.viewedAt = new Date();
    }

    // Update invoice status to 'viewed' if currently 'sent'
    if (invoice.status === 'sent') {
      updates.status = 'viewed';
    }

    const [updatedInvoice] = await db.update(invoices)
      .set(updates)
      .where(eq(invoices.id, invoiceId))
      .returning();

    // Record the view event
    await this.createInvoiceDeliveryEvent({
      invoiceId,
      eventType: 'viewed',
      ipAddress,
      userAgent,
    });

    return updatedInvoice;
  }

  // Integration Queue operations
  async getIntegrationQueue(filters?: { integrationType?: string; status?: string; entityType?: string }): Promise<IntegrationQueueItem[]> {
    let query = db.select().from(integrationQueue);
    const conditions: any[] = [];
    if (filters?.integrationType) conditions.push(eq(integrationQueue.integrationType, filters.integrationType));
    if (filters?.status) conditions.push(eq(integrationQueue.status, filters.status));
    if (filters?.entityType) conditions.push(eq(integrationQueue.entityType, filters.entityType));
    if (conditions.length > 0) query = query.where(and(...conditions)) as any;
    return await query.orderBy(integrationQueue.priority, desc(integrationQueue.createdAt));
  }

  async getIntegrationQueueItem(id: string): Promise<IntegrationQueueItem | undefined> {
    const [result] = await db.select().from(integrationQueue).where(eq(integrationQueue.id, id));
    return result;
  }

  async createIntegrationQueueItem(item: InsertIntegrationQueue): Promise<IntegrationQueueItem> {
    const [result] = await db.insert(integrationQueue).values(item).returning();
    return result;
  }

  async updateIntegrationQueueItem(id: string, updates: Partial<InsertIntegrationQueue>): Promise<IntegrationQueueItem | undefined> {
    const [result] = await db.update(integrationQueue).set({ ...updates, updatedAt: new Date() }).where(eq(integrationQueue.id, id)).returning();
    return result;
  }

  async processIntegrationQueueItem(id: string, status: string, response?: any, error?: string): Promise<IntegrationQueueItem | undefined> {
    const item = await this.getIntegrationQueueItem(id);
    if (item && status === 'failed') {
      try {
        await this.logResilienceEvent({
          context: `integration_${item.integrationType}`,
          entityType: item.entityType,
          entityId: item.entityId,
          action: item.operationType,
          status: 'error',
          errorMessage: error || undefined,
          retryCount: (item.retryCount || 0) + 1,
          metadata: { queueItemId: id, response },
        });
      } catch (logErr) {
        console.error('[Resilience] Failed to log integration error:', logErr);
      }
    }
    const updates: any = { 
      status, 
      lastAttemptAt: new Date(),
      updatedAt: new Date()
    };
    if (status === 'completed') {
      updates.processedAt = new Date();
      if (response) {
        updates.responsePayload = response;
        if (response.externalId) updates.externalId = response.externalId;
      }
    } else if (status === 'failed') {
      updates.errorMessage = error;
      if (item) {
        updates.retryCount = (item.retryCount || 0) + 1;
        if (updates.retryCount < (item.maxRetries || 3)) {
          updates.status = 'queued';
          updates.nextAttemptAt = new Date(Date.now() + 60000 * Math.pow(2, updates.retryCount));
        }
      }
    }
    const [result] = await db.update(integrationQueue).set(updates).where(eq(integrationQueue.id, id)).returning();
    return result;
  }

  async retryIntegrationQueueItem(id: string): Promise<IntegrationQueueItem | undefined> {
    const [result] = await db.update(integrationQueue).set({ 
      status: 'queued',
      nextAttemptAt: new Date(),
      updatedAt: new Date()
    }).where(eq(integrationQueue.id, id)).returning();
    return result;
  }

  // Invoice Dispute operations
  async getInvoiceDisputes(filters?: { invoiceId?: string; status?: string }): Promise<InvoiceDispute[]> {
    let query = db.select().from(invoiceDisputes);
    const conditions: any[] = [];
    if (filters?.invoiceId) conditions.push(eq(invoiceDisputes.invoiceId, filters.invoiceId));
    if (filters?.status) conditions.push(eq(invoiceDisputes.status, filters.status));
    if (conditions.length > 0) query = query.where(and(...conditions)) as any;
    return await query.orderBy(desc(invoiceDisputes.createdAt));
  }

  async getInvoiceDispute(id: string): Promise<InvoiceDispute | undefined> {
    const [result] = await db.select().from(invoiceDisputes).where(eq(invoiceDisputes.id, id));
    return result;
  }

  async createInvoiceDispute(dispute: InsertInvoiceDispute): Promise<InvoiceDispute> {
    const [result] = await db.insert(invoiceDisputes).values(dispute).returning();
    
    // Mark invoice as disputed
    await db.update(invoices).set({ 
      isDisputed: true,
      disputedAmount: dispute.disputedAmount,
      status: 'disputed',
      updatedAt: new Date()
    }).where(eq(invoices.id, dispute.invoiceId));

    return result;
  }

  async updateInvoiceDispute(id: string, updates: Partial<InsertInvoiceDispute>): Promise<InvoiceDispute | undefined> {
    const [result] = await db.update(invoiceDisputes).set({ ...updates, updatedAt: new Date() }).where(eq(invoiceDisputes.id, id)).returning();
    return result;
  }

  // Invoicing Analytics
  async getInvoicingStats(): Promise<{
    totalOutstanding: string;
    overdueAmount: string;
    pendingCharges: string;
    pendingChargesCount: number;
    invoicesSentThisMonth: number;
    paymentsReceivedThisMonth: string;
    averageDaysToPayment: number;
    agingSummary: {
      current: string;
      days1to30: string;
      days31to60: string;
      days61to90: string;
      over90: string;
    };
  }> {
    // Get outstanding invoices
    const outstandingInvoices = await db.select().from(invoices).where(
      or(eq(invoices.status, 'sent'), eq(invoices.status, 'partially_paid'), eq(invoices.status, 'overdue'))
    );

    let totalOutstanding = 0;
    let overdueAmount = 0;
    const today = new Date();
    let current = 0, days1to30 = 0, days31to60 = 0, days61to90 = 0, over90 = 0;

    for (const inv of outstandingInvoices) {
      const balance = parseFloat(inv.balanceDue || inv.totalAmount) - parseFloat(inv.paidAmount || '0');
      totalOutstanding += balance;
      
      const dueDate = new Date(inv.dueDate);
      const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));

      if (daysOverdue > 0) overdueAmount += balance;
      
      if (daysOverdue <= 0) current += balance;
      else if (daysOverdue <= 30) days1to30 += balance;
      else if (daysOverdue <= 60) days31to60 += balance;
      else if (daysOverdue <= 90) days61to90 += balance;
      else over90 += balance;
    }

    // Get pending charges
    const pendingCharges = await db.select().from(billableCharges).where(
      or(eq(billableCharges.status, 'draft'), eq(billableCharges.status, 'pending_approval'), eq(billableCharges.status, 'approved'))
    );
    const pendingChargesTotal = pendingCharges.reduce((sum, c) => sum + parseFloat(c.amount), 0);

    // Get this month's activity
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const invoicesThisMonth = await db.select().from(invoices).where(and(
      gte(invoices.sentAt, startOfMonth),
      eq(invoices.status, 'sent')
    ));

    const paymentsThisMonth = await db.select().from(payments).where(and(
      gte(payments.paymentDate, startOfMonth.toISOString().split('T')[0]),
      eq(payments.status, 'completed')
    ));
    const paymentsTotal = paymentsThisMonth.reduce((sum, p) => sum + parseFloat(p.amount), 0);

    return {
      totalOutstanding: totalOutstanding.toFixed(2),
      overdueAmount: overdueAmount.toFixed(2),
      pendingCharges: pendingChargesTotal.toFixed(2),
      pendingChargesCount: pendingCharges.length,
      invoicesSentThisMonth: invoicesThisMonth.length,
      paymentsReceivedThisMonth: paymentsTotal.toFixed(2),
      averageDaysToPayment: 0, // Would require more complex calculation
      agingSummary: {
        current: current.toFixed(2),
        days1to30: days1to30.toFixed(2),
        days31to60: days31to60.toFixed(2),
        days61to90: days61to90.toFixed(2),
        over90: over90.toFixed(2),
      },
    };
  }

  // ==========================================
  // REVENUE REPORTING PACK IMPLEMENTATION
  // ==========================================

  async getDsoTrend(filters?: { startDate?: string; endDate?: string; customerId?: string }): Promise<{
    month: string;
    dso: number;
    totalAr: string;
    avgDailySales: string;
  }[]> {
    const results: { month: string; dso: number; totalAr: string; avgDailySales: string }[] = [];
    const today = new Date();
    
    // Get 6 months of data (current month + 5 previous)
    for (let i = 5; i >= 0; i--) {
      const monthDate = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const monthEnd = new Date(today.getFullYear(), today.getMonth() - i + 1, 0);
      const monthStart = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const monthStr = monthDate.toISOString().slice(0, 7); // YYYY-MM format
      
      // Build conditions for queries
      const invoiceConditions = [
        lte(invoices.invoiceDate, monthEnd.toISOString().split('T')[0]),
        or(
          eq(invoices.status, 'sent'),
          eq(invoices.status, 'partially_paid'),
          eq(invoices.status, 'overdue'),
          eq(invoices.status, 'paid')
        )
      ];
      
      if (filters?.customerId) {
        invoiceConditions.push(eq(invoices.customerId, filters.customerId));
      }
      
      // Get AR at end of month (invoices outstanding at that point)
      const arInvoices = await db.select().from(invoices).where(and(...invoiceConditions));
      
      let totalAr = 0;
      for (const inv of arInvoices) {
        // Only count balance that was outstanding at month end
        const invoiceDate = new Date(inv.invoiceDate);
        const paidAt = inv.status === 'paid' && inv.sentAt ? new Date(inv.sentAt) : null;
        
        if (invoiceDate <= monthEnd) {
          if (!paidAt || paidAt > monthEnd) {
            totalAr += parseFloat(inv.balanceDue || inv.totalAmount) - parseFloat(inv.paidAmount || '0');
          }
        }
      }
      
      // Get total sales for the month (credit sales = invoices sent)
      const monthlySalesConditions = [
        gte(invoices.invoiceDate, monthStart.toISOString().split('T')[0]),
        lte(invoices.invoiceDate, monthEnd.toISOString().split('T')[0]),
      ];
      if (filters?.customerId) {
        monthlySalesConditions.push(eq(invoices.customerId, filters.customerId));
      }
      
      const monthlyInvoices = await db.select().from(invoices).where(and(...monthlySalesConditions));
      const totalSales = monthlyInvoices.reduce((sum, inv) => sum + parseFloat(inv.totalAmount), 0);
      
      // Calculate average daily sales
      const daysInMonth = monthEnd.getDate();
      const avgDailySales = totalSales / daysInMonth;
      
      // DSO = (AR / Total Credit Sales) * Days in period, or AR / Avg Daily Sales
      const dso = avgDailySales > 0 ? Math.round(totalAr / avgDailySales) : 0;
      
      results.push({
        month: monthStr,
        dso,
        totalAr: totalAr.toFixed(2),
        avgDailySales: avgDailySales.toFixed(2),
      });
    }
    
    return results;
  }

  async getOverdueExposure(filters?: { startDate?: string; endDate?: string; customerId?: string }): Promise<{
    bucket: string;
    bucketLabel: string;
    count: number;
    amount: string;
    percentage: number;
  }[]> {
    const today = new Date();
    
    // Build conditions
    const conditions = [
      or(eq(invoices.status, 'sent'), eq(invoices.status, 'partially_paid'), eq(invoices.status, 'overdue'))
    ];
    
    if (filters?.customerId) {
      conditions.push(eq(invoices.customerId, filters.customerId));
    }
    
    const overdueInvoices = await db.select().from(invoices).where(and(...conditions));
    
    const buckets = {
      current: { label: 'Current (Not Due)', count: 0, amount: 0 },
      '1-30': { label: '1-30 Days', count: 0, amount: 0 },
      '31-60': { label: '31-60 Days', count: 0, amount: 0 },
      '61-90': { label: '61-90 Days', count: 0, amount: 0 },
      '90+': { label: '90+ Days', count: 0, amount: 0 },
    };
    
    let totalAmount = 0;
    
    for (const inv of overdueInvoices) {
      const dueDate = new Date(inv.dueDate);
      const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
      const balance = parseFloat(inv.balanceDue || inv.totalAmount) - parseFloat(inv.paidAmount || '0');
      
      totalAmount += balance;
      
      if (daysOverdue <= 0) {
        buckets.current.count++;
        buckets.current.amount += balance;
      } else if (daysOverdue <= 30) {
        buckets['1-30'].count++;
        buckets['1-30'].amount += balance;
      } else if (daysOverdue <= 60) {
        buckets['31-60'].count++;
        buckets['31-60'].amount += balance;
      } else if (daysOverdue <= 90) {
        buckets['61-90'].count++;
        buckets['61-90'].amount += balance;
      } else {
        buckets['90+'].count++;
        buckets['90+'].amount += balance;
      }
    }
    
    return Object.entries(buckets).map(([bucket, data]) => ({
      bucket,
      bucketLabel: data.label,
      count: data.count,
      amount: data.amount.toFixed(2),
      percentage: totalAmount > 0 ? Math.round((data.amount / totalAmount) * 100) : 0,
    }));
  }

  async getTopOverdueCustomers(filters?: { startDate?: string; endDate?: string; customerId?: string; limit?: number }): Promise<{
    customerId: string;
    customerName: string;
    overdueAmount: string;
    overdueInvoiceCount: number;
    oldestInvoiceDays: number;
    oldestInvoiceDate: string;
  }[]> {
    const today = new Date();
    const limit = filters?.limit || 10;
    
    const conditions = [
      or(eq(invoices.status, 'sent'), eq(invoices.status, 'partially_paid'), eq(invoices.status, 'overdue')),
      lt(invoices.dueDate, today.toISOString().split('T')[0])
    ];
    
    if (filters?.customerId) {
      conditions.push(eq(invoices.customerId, filters.customerId));
    }
    
    // Get all overdue invoices
    const overdueInvoices = await db.select().from(invoices).where(and(...conditions));
    
    // Group by customer
    const customerMap = new Map<string, {
      customerName: string;
      overdueAmount: number;
      overdueInvoiceCount: number;
      oldestInvoiceDays: number;
      oldestInvoiceDate: string;
    }>();
    
    for (const inv of overdueInvoices) {
      if (!inv.customerId) continue;
      
      const balance = parseFloat(inv.balanceDue || inv.totalAmount) - parseFloat(inv.paidAmount || '0');
      const dueDate = new Date(inv.dueDate);
      const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
      
      const existing = customerMap.get(inv.customerId);
      if (existing) {
        existing.overdueAmount += balance;
        existing.overdueInvoiceCount++;
        if (daysOverdue > existing.oldestInvoiceDays) {
          existing.oldestInvoiceDays = daysOverdue;
          existing.oldestInvoiceDate = inv.dueDate;
        }
      } else {
        customerMap.set(inv.customerId, {
          customerName: inv.customerName,
          overdueAmount: balance,
          overdueInvoiceCount: 1,
          oldestInvoiceDays: daysOverdue,
          oldestInvoiceDate: inv.dueDate,
        });
      }
    }
    
    // Sort by overdue amount descending and limit
    const sorted = Array.from(customerMap.entries())
      .sort((a, b) => b[1].overdueAmount - a[1].overdueAmount)
      .slice(0, limit);
    
    return sorted.map(([customerId, data]) => ({
      customerId,
      customerName: data.customerName,
      overdueAmount: data.overdueAmount.toFixed(2),
      overdueInvoiceCount: data.overdueInvoiceCount,
      oldestInvoiceDays: data.oldestInvoiceDays,
      oldestInvoiceDate: data.oldestInvoiceDate,
    }));
  }

  async getReminderEffectiveness(filters?: { startDate?: string; endDate?: string; customerId?: string }): Promise<{
    totalRemindersSent: number;
    paidWithin7Days: number;
    paidWithin7DaysPercent: number;
    avgDaysToPayment: number;
    byReminderType: {
      reminderType: string;
      count: number;
      paidWithin7Days: number;
      paidWithin7DaysPercent: number;
      avgDaysToPayment: number;
    }[];
  }> {
    // Get reminder events from paymentEvents
    const conditions: SQL[] = [eq(paymentEvents.eventType, 'reminder_sent')];
    
    if (filters?.startDate) {
      conditions.push(gte(paymentEvents.eventAt, new Date(filters.startDate)));
    }
    if (filters?.endDate) {
      conditions.push(lte(paymentEvents.eventAt, new Date(filters.endDate)));
    }
    if (filters?.customerId) {
      conditions.push(eq(paymentEvents.customerId, filters.customerId));
    }
    
    const reminderEvents = await db.select().from(paymentEvents).where(and(...conditions));
    
    // For each reminder, check if invoice was paid within 7 days
    let totalPaidWithin7Days = 0;
    let totalDaysToPayment = 0;
    let countWithPayment = 0;
    
    const byReminderTypeMap = new Map<string, {
      count: number;
      paidWithin7Days: number;
      totalDaysToPayment: number;
      countWithPayment: number;
    }>();
    
    for (const reminder of reminderEvents) {
      if (!reminder.invoiceId) continue;
      
      const reminderType = reminder.reminderType || 'unknown';
      const reminderDate = new Date(reminder.eventAt);
      
      // Find payment event for this invoice after reminder
      const paymentEvent = await db.select().from(paymentEvents).where(
        and(
          eq(paymentEvents.invoiceId, reminder.invoiceId),
          eq(paymentEvents.eventType, 'payment_posted'),
          gt(paymentEvents.eventAt, reminder.eventAt)
        )
      ).orderBy(paymentEvents.eventAt).limit(1);
      
      // Update totals
      if (!byReminderTypeMap.has(reminderType)) {
        byReminderTypeMap.set(reminderType, { count: 0, paidWithin7Days: 0, totalDaysToPayment: 0, countWithPayment: 0 });
      }
      const typeData = byReminderTypeMap.get(reminderType)!;
      typeData.count++;
      
      if (paymentEvent.length > 0) {
        const paymentDate = new Date(paymentEvent[0].eventAt);
        const daysDiff = Math.floor((paymentDate.getTime() - reminderDate.getTime()) / (1000 * 60 * 60 * 24));
        
        if (daysDiff <= 7) {
          totalPaidWithin7Days++;
          typeData.paidWithin7Days++;
        }
        
        totalDaysToPayment += daysDiff;
        countWithPayment++;
        typeData.totalDaysToPayment += daysDiff;
        typeData.countWithPayment++;
      }
    }
    
    // Calculate overall metrics
    const totalRemindersSent = reminderEvents.length;
    const paidWithin7DaysPercent = totalRemindersSent > 0 ? Math.round((totalPaidWithin7Days / totalRemindersSent) * 100) : 0;
    const avgDaysToPayment = countWithPayment > 0 ? Math.round(totalDaysToPayment / countWithPayment) : 0;
    
    // Calculate per-type metrics
    const byReminderType = Array.from(byReminderTypeMap.entries()).map(([reminderType, data]) => ({
      reminderType,
      count: data.count,
      paidWithin7Days: data.paidWithin7Days,
      paidWithin7DaysPercent: data.count > 0 ? Math.round((data.paidWithin7Days / data.count) * 100) : 0,
      avgDaysToPayment: data.countWithPayment > 0 ? Math.round(data.totalDaysToPayment / data.countWithPayment) : 0,
    }));
    
    return {
      totalRemindersSent,
      paidWithin7Days: totalPaidWithin7Days,
      paidWithin7DaysPercent,
      avgDaysToPayment,
      byReminderType,
    };
  }

  // ==========================================
  // SOCIAL MEDIA MODULE IMPLEMENTATION
  // ==========================================

  // Platform Connection operations
  async getAllSocialConnections(): Promise<SocialPlatformConnection[]> {
    return db.select().from(socialPlatformConnections).orderBy(desc(socialPlatformConnections.createdAt));
  }

  async getSocialConnection(id: string): Promise<SocialPlatformConnection | undefined> {
    const [result] = await db.select().from(socialPlatformConnections).where(eq(socialPlatformConnections.id, id));
    return result;
  }

  async getSocialConnectionByPlatform(platform: string): Promise<SocialPlatformConnection | undefined> {
    const [result] = await db.select().from(socialPlatformConnections)
      .where(and(eq(socialPlatformConnections.platform, platform), eq(socialPlatformConnections.isActive, true)));
    return result;
  }

  async getActiveSocialConnections(): Promise<SocialPlatformConnection[]> {
    return db.select().from(socialPlatformConnections)
      .where(eq(socialPlatformConnections.isActive, true))
      .orderBy(socialPlatformConnections.platform);
  }

  async createSocialConnection(connection: InsertSocialPlatformConnection): Promise<SocialPlatformConnection> {
    const [result] = await db.insert(socialPlatformConnections).values(connection).returning();
    return result;
  }

  async updateSocialConnection(id: string, updates: Partial<InsertSocialPlatformConnection>): Promise<SocialPlatformConnection | undefined> {
    const [result] = await db.update(socialPlatformConnections)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(socialPlatformConnections.id, id))
      .returning();
    return result;
  }

  async deleteSocialConnection(id: string): Promise<void> {
    await db.delete(socialPlatformConnections).where(eq(socialPlatformConnections.id, id));
  }

  // Social Post operations
  async getAllSocialPosts(filters?: { status?: string; postType?: string; platform?: string }): Promise<SocialPost[]> {
    let query = db.select().from(socialPosts);
    const conditions = [];
    
    if (filters?.status) {
      conditions.push(eq(socialPosts.status, filters.status));
    }
    if (filters?.postType) {
      conditions.push(eq(socialPosts.postType, filters.postType));
    }
    
    if (conditions.length > 0) {
      return db.select().from(socialPosts).where(and(...conditions)).orderBy(desc(socialPosts.createdAt));
    }
    return db.select().from(socialPosts).orderBy(desc(socialPosts.createdAt));
  }

  async getSocialPost(id: string): Promise<SocialPost | undefined> {
    const [result] = await db.select().from(socialPosts).where(eq(socialPosts.id, id));
    return result;
  }

  async getSocialPostWithLogs(id: string): Promise<(SocialPost & { publishLogs: SocialPublishLog[] }) | undefined> {
    const [post] = await db.select().from(socialPosts).where(eq(socialPosts.id, id));
    if (!post) return undefined;
    
    const logs = await db.select().from(socialPublishLogs)
      .where(eq(socialPublishLogs.postId, id))
      .orderBy(desc(socialPublishLogs.createdAt));
    
    return { ...post, publishLogs: logs };
  }

  async getScheduledSocialPosts(): Promise<SocialPost[]> {
    return db.select().from(socialPosts)
      .where(eq(socialPosts.status, 'scheduled'))
      .orderBy(socialPosts.scheduledFor);
  }

  async getDraftSocialPosts(): Promise<SocialPost[]> {
    return db.select().from(socialPosts)
      .where(eq(socialPosts.status, 'draft'))
      .orderBy(desc(socialPosts.createdAt));
  }

  async createSocialPost(post: InsertSocialPost): Promise<SocialPost> {
    const [result] = await db.insert(socialPosts).values(post).returning();
    return result;
  }

  async updateSocialPost(id: string, updates: Partial<InsertSocialPost>): Promise<SocialPost | undefined> {
    const [result] = await db.update(socialPosts)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(socialPosts.id, id))
      .returning();
    return result;
  }

  async deleteSocialPost(id: string): Promise<void> {
    await db.delete(socialPosts).where(eq(socialPosts.id, id));
  }

  // Social Publish Log operations
  async getSocialPublishLogs(postId: string): Promise<SocialPublishLog[]> {
    return db.select().from(socialPublishLogs)
      .where(eq(socialPublishLogs.postId, postId))
      .orderBy(desc(socialPublishLogs.createdAt));
  }

  async createSocialPublishLog(log: InsertSocialPublishLog): Promise<SocialPublishLog> {
    const [result] = await db.insert(socialPublishLogs).values(log).returning();
    return result;
  }

  async updateSocialPublishLog(id: string, updates: Partial<InsertSocialPublishLog>): Promise<SocialPublishLog | undefined> {
    const [result] = await db.update(socialPublishLogs)
      .set(updates)
      .where(eq(socialPublishLogs.id, id))
      .returning();
    return result;
  }

  // Social Post Template operations
  async getAllSocialTemplates(): Promise<SocialPostTemplate[]> {
    return db.select().from(socialPostTemplates)
      .where(eq(socialPostTemplates.isActive, true))
      .orderBy(socialPostTemplates.name);
  }

  async getSocialTemplate(id: string): Promise<SocialPostTemplate | undefined> {
    const [result] = await db.select().from(socialPostTemplates).where(eq(socialPostTemplates.id, id));
    return result;
  }

  async getSocialTemplatesByType(templateType: string): Promise<SocialPostTemplate[]> {
    return db.select().from(socialPostTemplates)
      .where(and(eq(socialPostTemplates.templateType, templateType), eq(socialPostTemplates.isActive, true)))
      .orderBy(socialPostTemplates.name);
  }

  async createSocialTemplate(template: InsertSocialPostTemplate): Promise<SocialPostTemplate> {
    const [result] = await db.insert(socialPostTemplates).values(template).returning();
    return result;
  }

  async updateSocialTemplate(id: string, updates: Partial<InsertSocialPostTemplate>): Promise<SocialPostTemplate | undefined> {
    const [result] = await db.update(socialPostTemplates)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(socialPostTemplates.id, id))
      .returning();
    return result;
  }

  async deleteSocialTemplate(id: string): Promise<void> {
    await db.update(socialPostTemplates)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(socialPostTemplates.id, id));
  }

  // Social Media Stats
  async getSocialMediaStats(): Promise<{
    totalPosts: number;
    scheduledPosts: number;
    publishedPosts: number;
    draftPosts: number;
    connectedPlatforms: number;
    postsThisMonth: number;
    postsByPlatform: { platform: string; count: number }[];
  }> {
    const allPosts = await db.select().from(socialPosts);
    const activeConnections = await db.select().from(socialPlatformConnections)
      .where(eq(socialPlatformConnections.isActive, true));
    
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    
    const postsThisMonth = allPosts.filter(p => 
      p.createdAt && new Date(p.createdAt) >= startOfMonth
    ).length;

    // Count posts by target platform
    const platformCounts: { [key: string]: number } = {};
    for (const post of allPosts.filter(p => p.status === 'published')) {
      const platforms = (post.targetPlatforms as string[]) || [];
      for (const platform of platforms) {
        platformCounts[platform] = (platformCounts[platform] || 0) + 1;
      }
    }

    return {
      totalPosts: allPosts.length,
      scheduledPosts: allPosts.filter(p => p.status === 'scheduled').length,
      publishedPosts: allPosts.filter(p => p.status === 'published').length,
      draftPosts: allPosts.filter(p => p.status === 'draft').length,
      connectedPlatforms: activeConnections.length,
      postsThisMonth,
      postsByPlatform: Object.entries(platformCounts).map(([platform, count]) => ({ platform, count })),
    };
  }

  // HubSpot Field Mapping operations
  async getAllHubspotFieldMappings(): Promise<HubspotFieldMapping[]> {
    return db.select().from(hubspotFieldMappings);
  }

  async getHubspotFieldMapping(id: string): Promise<HubspotFieldMapping | undefined> {
    const [mapping] = await db.select().from(hubspotFieldMappings)
      .where(eq(hubspotFieldMappings.id, id));
    return mapping;
  }

  async getHubspotFieldMappingByDriverHubField(driverHubField: string): Promise<HubspotFieldMapping | undefined> {
    const [mapping] = await db.select().from(hubspotFieldMappings)
      .where(eq(hubspotFieldMappings.driverHubField, driverHubField));
    return mapping;
  }

  async createHubspotFieldMapping(mapping: InsertHubspotFieldMapping): Promise<HubspotFieldMapping> {
    const [created] = await db.insert(hubspotFieldMappings)
      .values(mapping)
      .returning();
    return created;
  }

  async updateHubspotFieldMapping(id: string, updates: Partial<InsertHubspotFieldMapping>): Promise<HubspotFieldMapping | undefined> {
    const [updated] = await db.update(hubspotFieldMappings)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(hubspotFieldMappings.id, id))
      .returning();
    return updated;
  }

  async deleteHubspotFieldMapping(id: string): Promise<void> {
    await db.delete(hubspotFieldMappings)
      .where(eq(hubspotFieldMappings.id, id));
  }

  async upsertHubspotFieldMappings(mappings: InsertHubspotFieldMapping[]): Promise<HubspotFieldMapping[]> {
    const results: HubspotFieldMapping[] = [];
    for (const mapping of mappings) {
      const existing = await this.getHubspotFieldMappingByDriverHubField(mapping.driverHubField);
      if (existing) {
        const updated = await this.updateHubspotFieldMapping(existing.id, mapping);
        if (updated) results.push(updated);
      } else {
        const created = await this.createHubspotFieldMapping(mapping);
        results.push(created);
      }
    }
    return results;
  }

  // ============================================
  // FEEDBACK SYSTEM (INCREMENT 28)
  // ============================================

  async getNextFeedbackTicketNumber(): Promise<number> {
    const result = await db.execute(sql`SELECT nextval('feedback_ticket_number_seq')::int as next_val`);
    return (result.rows[0] as any).next_val;
  }

  async createFeedbackTicket(ticket: InsertFeedbackTicket): Promise<FeedbackTicket> {
    const ticketNumber = await this.getNextFeedbackTicketNumber();
    const [created] = await db.insert(feedbackTickets)
      .values({ ...ticket, ticketNumber })
      .returning();
    return created;
  }

  async getFeedbackTicket(id: string): Promise<FeedbackTicket | undefined> {
    const [ticket] = await db.select().from(feedbackTickets)
      .where(eq(feedbackTickets.id, id));
    return ticket;
  }

  async getFeedbackTicketsByUser(userId: string): Promise<FeedbackTicket[]> {
    return db.select().from(feedbackTickets)
      .where(eq(feedbackTickets.createdByUserId, userId))
      .orderBy(desc(feedbackTickets.updatedAt));
  }

  async getAllFeedbackTickets(filters?: { status?: string; priority?: string; type?: string; area?: string; ticketSource?: string }): Promise<FeedbackTicket[]> {
    let query = db.select().from(feedbackTickets);
    
    const conditions: any[] = [];
    if (filters?.status) {
      conditions.push(eq(feedbackTickets.status, filters.status as any));
    }
    if (filters?.priority) {
      conditions.push(eq(feedbackTickets.priority, filters.priority as any));
    }
    if (filters?.type) {
      conditions.push(eq(feedbackTickets.type, filters.type as any));
    }
    if (filters?.area) {
      conditions.push(eq(feedbackTickets.area, filters.area as any));
    }
    if (filters?.ticketSource) {
      conditions.push(eq(feedbackTickets.ticketSource, filters.ticketSource as any));
    }

    if (conditions.length > 0) {
      return db.select().from(feedbackTickets)
        .where(and(...conditions))
        .orderBy(desc(feedbackTickets.updatedAt));
    }
    
    return db.select().from(feedbackTickets)
      .orderBy(desc(feedbackTickets.updatedAt));
  }

  async updateFeedbackTicket(id: string, updates: Partial<{ status: string; priority: string; assignedToUserId: string | null }>): Promise<FeedbackTicket | undefined> {
    const [updated] = await db.update(feedbackTickets)
      .set({ ...updates as any, updatedAt: new Date() })
      .where(eq(feedbackTickets.id, id))
      .returning();
    return updated;
  }

  async createFeedbackComment(comment: InsertFeedbackComment): Promise<FeedbackComment> {
    const [created] = await db.insert(feedbackComments)
      .values(comment)
      .returning();
    return created;
  }

  async getFeedbackComments(ticketId: string, visibility?: string): Promise<FeedbackComment[]> {
    if (visibility) {
      return db.select().from(feedbackComments)
        .where(and(
          eq(feedbackComments.ticketId, ticketId),
          eq(feedbackComments.visibility, visibility as any)
        ))
        .orderBy(desc(feedbackComments.createdAt));
    }
    return db.select().from(feedbackComments)
      .where(eq(feedbackComments.ticketId, ticketId))
      .orderBy(desc(feedbackComments.createdAt));
  }

  async createFeedbackAuditLog(entry: { ticketId: string; actorUserId: string; actorName: string; action: string; fromValue?: string; toValue?: string }): Promise<FeedbackAuditLogEntry> {
    const [created] = await db.insert(feedbackAuditLog)
      .values(entry as any)
      .returning();
    return created;
  }

  async getFeedbackAuditLogs(ticketId: string): Promise<FeedbackAuditLogEntry[]> {
    return db.select().from(feedbackAuditLog)
      .where(eq(feedbackAuditLog.ticketId, ticketId))
      .orderBy(desc(feedbackAuditLog.createdAt));
  }

  // ==========================================
  // CARRIER-READY CLAIMS INTELLIGENCE OPERATIONS
  // ==========================================

  // Risk Mitigation Action operations
  async getAllRiskMitigationActions(filters?: { status?: string; actionType?: string }): Promise<RiskMitigationAction[]> {
    const conditions: any[] = [];
    if (filters?.status) {
      conditions.push(eq(riskMitigationActions.status, filters.status));
    }
    if (filters?.actionType) {
      conditions.push(eq(riskMitigationActions.actionType, filters.actionType));
    }
    
    if (conditions.length > 0) {
      return db.select().from(riskMitigationActions)
        .where(and(...conditions))
        .orderBy(desc(riskMitigationActions.createdAt));
    }
    return db.select().from(riskMitigationActions)
      .orderBy(desc(riskMitigationActions.createdAt));
  }

  async getRiskMitigationAction(id: string): Promise<RiskMitigationAction | undefined> {
    const [action] = await db.select().from(riskMitigationActions)
      .where(eq(riskMitigationActions.id, id));
    return action;
  }

  async createRiskMitigationAction(action: InsertRiskMitigationAction): Promise<RiskMitigationAction> {
    const [created] = await db.insert(riskMitigationActions)
      .values(action)
      .returning();
    return created;
  }

  async updateRiskMitigationAction(id: string, updates: Partial<InsertRiskMitigationAction>): Promise<RiskMitigationAction | undefined> {
    const [updated] = await db.update(riskMitigationActions)
      .set({ ...updates as any, updatedAt: new Date() })
      .where(eq(riskMitigationActions.id, id))
      .returning();
    return updated;
  }

  async deleteRiskMitigationAction(id: string): Promise<void> {
    await db.delete(riskMitigationActions)
      .where(eq(riskMitigationActions.id, id));
  }

  // Carrier Narrative operations
  async getAllCarrierNarratives(filters?: { status?: string; narrativeType?: string }): Promise<CarrierNarrative[]> {
    const conditions: any[] = [];
    if (filters?.status) {
      conditions.push(eq(carrierNarratives.status, filters.status));
    }
    if (filters?.narrativeType) {
      conditions.push(eq(carrierNarratives.narrativeType, filters.narrativeType));
    }
    
    if (conditions.length > 0) {
      return db.select().from(carrierNarratives)
        .where(and(...conditions))
        .orderBy(desc(carrierNarratives.createdAt));
    }
    return db.select().from(carrierNarratives)
      .orderBy(desc(carrierNarratives.createdAt));
  }

  async getCarrierNarrative(id: string): Promise<CarrierNarrative | undefined> {
    const [narrative] = await db.select().from(carrierNarratives)
      .where(eq(carrierNarratives.id, id));
    return narrative;
  }

  async createCarrierNarrative(narrative: InsertCarrierNarrative): Promise<CarrierNarrative> {
    const [created] = await db.insert(carrierNarratives)
      .values(narrative)
      .returning();
    return created;
  }

  async updateCarrierNarrative(id: string, updates: Partial<InsertCarrierNarrative>): Promise<CarrierNarrative | undefined> {
    const [updated] = await db.update(carrierNarratives)
      .set({ ...updates as any, updatedAt: new Date() })
      .where(eq(carrierNarratives.id, id))
      .returning();
    return updated;
  }

  async deleteCarrierNarrative(id: string): Promise<void> {
    await db.delete(carrierNarratives)
      .where(eq(carrierNarratives.id, id));
  }

  async approveCarrierNarrative(id: string, userId: string): Promise<CarrierNarrative | undefined> {
    const [updated] = await db.update(carrierNarratives)
      .set({ 
        status: 'APPROVED',
        approvedAt: new Date(),
        approvedByUserId: userId,
        updatedAt: new Date()
      })
      .where(eq(carrierNarratives.id, id))
      .returning();
    return updated;
  }

  // Carrier Dashboard Analytics
  async getCarrierDashboardMetrics(periodDays: number = 90): Promise<any> {
    const now = new Date();
    const periodStart = new Date();
    periodStart.setDate(periodStart.getDate() - periodDays);
    
    // Get all claims in period
    const allClaims = await this.getAllAccidents();
    const periodClaims = allClaims.filter((c: any) => {
      const date = c.incidentDate || c.accidentDate || c.createdAt;
      return date && new Date(date) >= periodStart;
    });
    
    // Get all moves in period
    const allMoves = await this.getAllTrips();
    const periodMoves = allMoves.filter((m: any) => {
      return m.createdAt && new Date(m.createdAt) >= periodStart;
    });
    
    // Get all drivers
    const allDrivers = await this.getAllDriversWithUsers();
    
    // Calculate metrics
    const claimsPer1k = periodMoves.length > 0 
      ? Math.round((periodClaims.length / periodMoves.length) * 1000 * 10) / 10 
      : 0;
    
    // Severity-weighted loss index
    const getSeverityWeight = (severity: string): number => {
      switch ((severity || '').toLowerCase()) {
        case 'low': case 'minor': return 1;
        case 'medium': case 'moderate': return 3;
        case 'high': case 'severe': case 'critical': return 5;
        default: return 2;
      }
    };
    
    let totalCost = 0;
    let totalSeverityWeight = 0;
    periodClaims.forEach((c: any) => {
      totalCost += parseFloat(c.probableCost || c.totalEstimate || '0');
      totalSeverityWeight += getSeverityWeight(c.claimSeverity);
    });
    
    const avgSeverityWeight = periodClaims.length > 0 
      ? Math.round((totalSeverityWeight / periodClaims.length) * 10) / 10 
      : 0;
    
    // At-fault percentage
    const atFaultClaims = periodClaims.filter((c: any) => 
      c.dodAtFault?.toLowerCase() === 'yes'
    ).length;
    const atFaultPercent = periodClaims.length > 0 
      ? Math.round((atFaultClaims / periodClaims.length) * 100) 
      : 0;
    
    // Average days to close
    const closedClaims = periodClaims.filter((c: any) => 
      ['closed', 'resolved', 'denied'].includes((c.status || '').toLowerCase()) ||
      ['CLOSED', 'DENIED', 'PAID'].includes(c.claimStatus || '')
    );
    
    let totalDaysToClose = 0;
    closedClaims.forEach((c: any) => {
      const created = c.createdAt ? new Date(c.createdAt) : null;
      const updated = c.updatedAt ? new Date(c.updatedAt) : null;
      if (created && updated) {
        totalDaysToClose += Math.max(0, Math.floor((updated.getTime() - created.getTime()) / (1000 * 60 * 60 * 24)));
      }
    });
    const avgDaysToClose = closedClaims.length > 0 
      ? Math.round(totalDaysToClose / closedClaims.length) 
      : 0;
    
    // Open claims > 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const openClaimsOver30 = allClaims.filter((c: any) => {
      const isOpen = !['closed', 'resolved', 'denied'].includes((c.status || '').toLowerCase()) &&
                     !['CLOSED', 'DENIED', 'PAID'].includes(c.claimStatus || '');
      const created = c.createdAt ? new Date(c.createdAt) : null;
      return isOpen && created && created < thirtyDaysAgo;
    }).length;
    
    // Photo compliance
    const pickupComplete = periodMoves.filter((m: any) => m.pickupPhotoComplianceStatus === 'complete').length;
    const dropoffComplete = periodMoves.filter((m: any) => m.dropoffPhotoComplianceStatus === 'complete').length;
    const pickupCompliancePercent = periodMoves.length > 0 ? Math.round((pickupComplete / periodMoves.length) * 100) : 0;
    const dropoffCompliancePercent = periodMoves.length > 0 ? Math.round((dropoffComplete / periodMoves.length) * 100) : 0;
    
    // Claims with evidence
    const claimsWithEvidence = periodClaims.filter((c: any) => c.evidenceComplianceStatus === 'complete').length;
    const evidencePercent = periodClaims.length > 0 ? Math.round((claimsWithEvidence / periodClaims.length) * 100) : 0;
    
    return {
      periodDays,
      periodStart: periodStart.toISOString(),
      periodEnd: now.toISOString(),
      
      // Core KPIs
      claimsFrequency: claimsPer1k,
      severityWeightedIndex: avgSeverityWeight,
      totalClaimsCost: Math.round(totalCost * 100) / 100,
      avgDaysToClose,
      openClaimsOver30Days: openClaimsOver30,
      atFaultPercent,
      notAtFaultPercent: 100 - atFaultPercent,
      
      // Evidence & Safety
      pickupCompliancePercent,
      dropoffCompliancePercent,
      claimsWithEvidencePercent: evidencePercent,
      
      // Counts
      totalClaims: periodClaims.length,
      totalMoves: periodMoves.length,
      openClaims: allClaims.filter((c: any) => 
        !['closed', 'resolved', 'denied'].includes((c.status || '').toLowerCase()) &&
        !['CLOSED', 'DENIED', 'PAID'].includes(c.claimStatus || '')
      ).length,
      activeDrivers: allDrivers.filter((d: any) => d.status === 'active').length,
    };
  }

  async getCarrierTrendData(periodDays: number = 90): Promise<any> {
    const now = new Date();
    const periodStart = new Date();
    periodStart.setDate(periodStart.getDate() - periodDays);
    
    // Get all claims
    const allClaims = await this.getAllAccidents();
    const allMoves = await this.getAllTrips();
    
    // Generate weekly data points
    const weeks: any[] = [];
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    const numWeeks = Math.ceil(periodDays / 7);
    
    for (let i = 0; i < numWeeks; i++) {
      const weekEnd = new Date(now.getTime() - (i * weekMs));
      const weekStart = new Date(weekEnd.getTime() - weekMs);
      
      const weekClaims = allClaims.filter((c: any) => {
        const date = c.incidentDate || c.accidentDate || c.createdAt;
        if (!date) return false;
        const d = new Date(date);
        return d >= weekStart && d < weekEnd;
      });
      
      const weekMoves = allMoves.filter((m: any) => {
        if (!m.createdAt) return false;
        const d = new Date(m.createdAt);
        return d >= weekStart && d < weekEnd;
      });
      
      const claimsPer1k = weekMoves.length > 0 
        ? Math.round((weekClaims.length / weekMoves.length) * 1000 * 10) / 10 
        : 0;
      
      // Severity calculation
      let totalSeverity = 0;
      weekClaims.forEach((c: any) => {
        switch ((c.claimSeverity || '').toLowerCase()) {
          case 'low': case 'minor': totalSeverity += 1; break;
          case 'medium': case 'moderate': totalSeverity += 3; break;
          case 'high': case 'severe': case 'critical': totalSeverity += 5; break;
          default: totalSeverity += 2;
        }
      });
      const avgSeverity = weekClaims.length > 0 ? Math.round((totalSeverity / weekClaims.length) * 10) / 10 : 0;
      
      // Photo compliance
      const pickupComplete = weekMoves.filter((m: any) => m.pickupPhotoComplianceStatus === 'complete').length;
      const photoCompliance = weekMoves.length > 0 ? Math.round((pickupComplete / weekMoves.length) * 100) : 0;
      
      weeks.unshift({
        weekStart: weekStart.toISOString().split('T')[0],
        weekEnd: weekEnd.toISOString().split('T')[0],
        claimsCount: weekClaims.length,
        movesCount: weekMoves.length,
        claimsPer1k,
        avgSeverity,
        photoCompliancePercent: photoCompliance,
      });
    }
    
    // Calculate trend directions
    const recentHalf = weeks.slice(Math.floor(weeks.length / 2));
    const olderHalf = weeks.slice(0, Math.floor(weeks.length / 2));
    
    const avgRecent = recentHalf.reduce((sum, w) => sum + w.claimsPer1k, 0) / (recentHalf.length || 1);
    const avgOlder = olderHalf.reduce((sum, w) => sum + w.claimsPer1k, 0) / (olderHalf.length || 1);
    const frequencyTrend = avgRecent < avgOlder ? 'improving' : avgRecent > avgOlder ? 'worsening' : 'stable';
    
    const severityRecent = recentHalf.reduce((sum, w) => sum + w.avgSeverity, 0) / (recentHalf.length || 1);
    const severityOlder = olderHalf.reduce((sum, w) => sum + w.avgSeverity, 0) / (olderHalf.length || 1);
    const severityTrend = severityRecent < severityOlder ? 'improving' : severityRecent > severityOlder ? 'worsening' : 'stable';
    
    const photoRecent = recentHalf.reduce((sum, w) => sum + w.photoCompliancePercent, 0) / (recentHalf.length || 1);
    const photoOlder = olderHalf.reduce((sum, w) => sum + w.photoCompliancePercent, 0) / (olderHalf.length || 1);
    const photoTrend = photoRecent > photoOlder ? 'improving' : photoRecent < photoOlder ? 'worsening' : 'stable';
    
    return {
      periodDays,
      weeks,
      trends: {
        frequency: frequencyTrend,
        frequencyChange: Math.round((avgRecent - avgOlder) * 10) / 10,
        severity: severityTrend,
        severityChange: Math.round((severityRecent - severityOlder) * 10) / 10,
        photoCompliance: photoTrend,
        photoChange: Math.round((photoRecent - photoOlder) * 10) / 10,
      },
    };
  }

  // ============================================
  // Account Documents Hub
  // ============================================
  
  async getAccountDocuments(customerId: string): Promise<AccountDocument[]> {
    const docs = await db
      .select()
      .from(accountDocuments)
      .where(and(eq(accountDocuments.customerId, customerId), eq(accountDocuments.isDeleted, false)))
      .orderBy(desc(accountDocuments.uploadedAt));
    return docs;
  }

  async getAccountDocument(id: string): Promise<AccountDocument | undefined> {
    const [doc] = await db.select().from(accountDocuments).where(eq(accountDocuments.id, id));
    return doc;
  }

  async createAccountDocument(doc: InsertAccountDocument): Promise<AccountDocument> {
    const [created] = await db.insert(accountDocuments).values(doc).returning();
    return created;
  }

  async deleteAccountDocument(id: string): Promise<void> {
    await db.delete(accountDocuments).where(eq(accountDocuments.id, id));
  }

  async updateAccountDocument(id: string, updates: Record<string, any>): Promise<AccountDocument | undefined> {
    const [updated] = await db.update(accountDocuments)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(accountDocuments.id, id))
      .returning();
    return updated;
  }

  // Standard Documents (global library)
  async getStandardDocuments(activeOnly: boolean = true): Promise<StandardDocument[]> {
    if (activeOnly) {
      const docs = await db
        .select()
        .from(standardDocuments)
        .where(eq(standardDocuments.isActive, true))
        .orderBy(desc(standardDocuments.createdAt));
      return docs;
    }
    const docs = await db
      .select()
      .from(standardDocuments)
      .orderBy(desc(standardDocuments.createdAt));
    return docs;
  }

  async getStandardDocument(id: string): Promise<StandardDocument | undefined> {
    const [doc] = await db.select().from(standardDocuments).where(eq(standardDocuments.id, id));
    return doc;
  }

  async createStandardDocument(doc: InsertStandardDocument): Promise<StandardDocument> {
    const [created] = await db.insert(standardDocuments).values(doc).returning();
    return created;
  }

  async updateStandardDocument(id: string, updates: Partial<InsertStandardDocument>): Promise<StandardDocument | undefined> {
    const [updated] = await db
      .update(standardDocuments)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(standardDocuments.id, id))
      .returning();
    return updated;
  }

  async deleteStandardDocument(id: string): Promise<void> {
    await db.delete(standardDocuments).where(eq(standardDocuments.id, id));
  }

  // Document Packet Logs
  async getDocumentPacketLogs(customerId: string): Promise<DocumentPacketLog[]> {
    const logs = await db
      .select()
      .from(documentPacketLogs)
      .where(eq(documentPacketLogs.customerId, customerId))
      .orderBy(desc(documentPacketLogs.sentAt));
    return logs;
  }

  async createDocumentPacketLog(log: InsertDocumentPacketLog): Promise<DocumentPacketLog> {
    const [created] = await db.insert(documentPacketLogs).values(log).returning();
    return created;
  }

  // ============================================
  // SAVED ACCOUNT VIEWS
  // ============================================

  async getSavedAccountViews(userId: string): Promise<any[]> {
    const views = await db
      .select()
      .from(savedAccountViews)
      .where(eq(savedAccountViews.userId, userId))
      .orderBy(savedAccountViews.isSystemDefault, savedAccountViews.name);
    return views;
  }

  async getSavedAccountView(id: string, userId: string): Promise<any | undefined> {
    const [view] = await db
      .select()
      .from(savedAccountViews)
      .where(and(eq(savedAccountViews.id, id), eq(savedAccountViews.userId, userId)));
    return view;
  }

  async createSavedAccountView(view: any): Promise<any> {
    const [created] = await db.insert(savedAccountViews).values(view).returning();
    return created;
  }

  async updateSavedAccountView(id: string, userId: string, updates: any): Promise<any | undefined> {
    const [updated] = await db
      .update(savedAccountViews)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(savedAccountViews.id, id), eq(savedAccountViews.userId, userId), eq(savedAccountViews.isSystemDefault, false)))
      .returning();
    return updated;
  }

  async deleteSavedAccountView(id: string, userId: string): Promise<boolean> {
    const result = await db
      .delete(savedAccountViews)
      .where(and(eq(savedAccountViews.id, id), eq(savedAccountViews.userId, userId), eq(savedAccountViews.isSystemDefault, false)));
    return true;
  }

  // ============================================
  // MOVE SAVED VIEWS
  // ============================================

  async getMoveSavedViews(userId: string): Promise<any[]> {
    const { moveSavedViews } = await import("@shared/schema");
    return db
      .select()
      .from(moveSavedViews)
      .where(eq(moveSavedViews.userId, userId))
      .orderBy(moveSavedViews.isSystemDefault, moveSavedViews.name);
  }

  async createMoveSavedView(view: any): Promise<any> {
    const { moveSavedViews } = await import("@shared/schema");
    const [created] = await db.insert(moveSavedViews).values(view).returning();
    return created;
  }

  async updateMoveSavedView(id: string, userId: string, updates: any): Promise<any | undefined> {
    const { moveSavedViews } = await import("@shared/schema");
    const [updated] = await db
      .update(moveSavedViews)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(moveSavedViews.id, id), eq(moveSavedViews.userId, userId), eq(moveSavedViews.isSystemDefault, false)))
      .returning();
    return updated;
  }

  async deleteMoveSavedView(id: string, userId: string): Promise<void> {
    const { moveSavedViews } = await import("@shared/schema");
    await db
      .delete(moveSavedViews)
      .where(and(eq(moveSavedViews.id, id), eq(moveSavedViews.userId, userId), eq(moveSavedViews.isSystemDefault, false)));
  }

  async initializeDefaultMoveViewsForUser(userId: string): Promise<void> {
    const { moveSavedViews } = await import("@shared/schema");
    const existing = await db.select({ id: moveSavedViews.id }).from(moveSavedViews).where(eq(moveSavedViews.userId, userId));
    if (existing.length > 0) return;

    const today = new Date().toISOString().split("T")[0];
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - (day === 0 ? 6 : day - 1);
    d.setDate(diff);
    const monday = d.toISOString().split("T")[0];

    const defaults = [
      { userId, name: "Today",        isSystemDefault: true, filterStartDate: today,   filterEndDate: today },
      { userId, name: "Current Week", isSystemDefault: true, filterStartDate: monday,  filterEndDate: today },
      { userId, name: "Active",       isSystemDefault: true, filterStatus: "in-progress" },
    ];
    for (const v of defaults) {
      await db.insert(moveSavedViews).values(v);
    }
  }

  /** Set a view as the user's default (unsets any existing default first) */
  async setMoveDefaultView(viewId: string, userId: string): Promise<any | undefined> {
    const { moveSavedViews } = await import("@shared/schema");
    // Unset any existing default for this user
    await db.update(moveSavedViews)
      .set({ isUserDefault: false, updatedAt: new Date() })
      .where(and(eq(moveSavedViews.userId, userId), eq(moveSavedViews.isUserDefault, true)));
    // Set the new default
    const [updated] = await db.update(moveSavedViews)
      .set({ isUserDefault: true, updatedAt: new Date() })
      .where(and(eq(moveSavedViews.id, viewId), eq(moveSavedViews.userId, userId)))
      .returning();
    return updated;
  }

  /** Unset the user's default view */
  async unsetMoveDefaultView(userId: string): Promise<void> {
    const { moveSavedViews } = await import("@shared/schema");
    await db.update(moveSavedViews)
      .set({ isUserDefault: false, updatedAt: new Date() })
      .where(and(eq(moveSavedViews.userId, userId), eq(moveSavedViews.isUserDefault, true)));
  }

  // ============================================
  // MOVE TEAM PRESETS (Task #87)
  // ============================================

  async getMoveTeamPresets(): Promise<any[]> {
    const { moveTeamPresets } = await import("@shared/schema");
    return db
      .select()
      .from(moveTeamPresets)
      .where(eq(moveTeamPresets.visibility, "team"))
      .orderBy(moveTeamPresets.name);
  }

  async createMoveTeamPreset(preset: any): Promise<any> {
    const { moveTeamPresets } = await import("@shared/schema");
    const [created] = await db.insert(moveTeamPresets).values(preset).returning();
    return created;
  }

  async updateMoveTeamPreset(id: string, ownerUserId: string, updates: any): Promise<any | undefined> {
    const { moveTeamPresets } = await import("@shared/schema");
    const [updated] = await db
      .update(moveTeamPresets)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(moveTeamPresets.id, id), eq(moveTeamPresets.ownerUserId, ownerUserId)))
      .returning();
    return updated;
  }

  async deleteMoveTeamPreset(id: string, ownerUserId: string): Promise<void> {
    const { moveTeamPresets } = await import("@shared/schema");
    await db.delete(moveTeamPresets)
      .where(and(eq(moveTeamPresets.id, id), eq(moveTeamPresets.ownerUserId, ownerUserId)));
  }

  // ============================================
  // MOVE EXPORT SCHEDULES (Task #85)
  // ============================================

  async getMoveExportSchedules(userId: string): Promise<any[]> {
    const { moveExportSchedules } = await import("@shared/schema");
    return db
      .select()
      .from(moveExportSchedules)
      .where(eq(moveExportSchedules.userId, userId))
      .orderBy(moveExportSchedules.name);
  }

  async createMoveExportSchedule(schedule: any): Promise<any> {
    const { moveExportSchedules } = await import("@shared/schema");
    const [created] = await db.insert(moveExportSchedules).values(schedule).returning();
    return created;
  }

  async updateMoveExportSchedule(id: string, userId: string, updates: any): Promise<any | undefined> {
    const { moveExportSchedules } = await import("@shared/schema");
    const [updated] = await db
      .update(moveExportSchedules)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(moveExportSchedules.id, id), eq(moveExportSchedules.userId, userId)))
      .returning();
    return updated;
  }

  async deleteMoveExportSchedule(id: string, userId: string): Promise<void> {
    const { moveExportSchedules } = await import("@shared/schema");
    await db.delete(moveExportSchedules)
      .where(and(eq(moveExportSchedules.id, id), eq(moveExportSchedules.userId, userId)));
  }

  async getMoveExportRunLog(scheduleId: string, limit = 20): Promise<any[]> {
    const { moveExportRunLog } = await import("@shared/schema");
    return db
      .select()
      .from(moveExportRunLog)
      .where(eq(moveExportRunLog.scheduleId, scheduleId))
      .orderBy(desc(moveExportRunLog.ranAt))
      .limit(limit);
  }

  async appendMoveExportRunLog(entry: {
    scheduleId: string;
    status: string;
    rowCount?: number;
    truncated?: boolean;
    recipients?: string;
    errorMessage?: string;
  }): Promise<any> {
    const { moveExportRunLog } = await import("@shared/schema");
    const [row] = await db.insert(moveExportRunLog).values(entry).returning();
    // Update schedule.lastRunAt
    const { moveExportSchedules } = await import("@shared/schema");
    await db.update(moveExportSchedules)
      .set({ lastRunAt: new Date(), updatedAt: new Date() })
      .where(eq(moveExportSchedules.id, entry.scheduleId));
    return row;
  }

  async getAllEnabledMoveExportSchedules(): Promise<any[]> {
    const { moveExportSchedules } = await import("@shared/schema");
    return db.select().from(moveExportSchedules).where(eq(moveExportSchedules.enabled, true));
  }

  async initializeDefaultViewsForUser(userId: string): Promise<void> {
    const existingViews = await this.getSavedAccountViews(userId);
    if (existingViews.length > 0) return;

    const defaultViews = [
      {
        userId,
        name: "My Accounts",
        isSystemDefault: true,
        filterOwner: userId,
      },
      {
        userId,
        name: "At Risk",
        isSystemDefault: true,
        filterHealth: JSON.stringify(["red", "yellow"]),
      },
      {
        userId,
        name: "Needs Contact",
        isSystemDefault: true,
        filterNeedsContact: true,
      },
    ];

    for (const view of defaultViews) {
      await db.insert(savedAccountViews).values(view);
    }
  }

  async getUserViewPreference(userId: string): Promise<any | undefined> {
    const [pref] = await db
      .select()
      .from(userViewPreferences)
      .where(eq(userViewPreferences.userId, userId));
    return pref;
  }

  async setUserViewPreference(userId: string, viewId: string | null): Promise<any> {
    const existing = await this.getUserViewPreference(userId);
    if (existing) {
      const [updated] = await db
        .update(userViewPreferences)
        .set({ lastSelectedViewId: viewId, updatedAt: new Date() })
        .where(eq(userViewPreferences.userId, userId))
        .returning();
      return updated;
    } else {
      const [created] = await db
        .insert(userViewPreferences)
        .values({ userId, lastSelectedViewId: viewId })
        .returning();
      return created;
    }
  }

  // Account Activities Methods
  async getAccountActivities(customerId: string): Promise<AccountActivity[]> {
    return await db
      .select()
      .from(accountActivities)
      .where(eq(accountActivities.customerId, customerId))
      .orderBy(desc(accountActivities.activityDate));
  }

  async createAccountActivity(activity: InsertAccountActivity): Promise<AccountActivity> {
    const [created] = await db.insert(accountActivities).values(activity).returning();
    return created;
  }

  async logTouchActivity(
    customerId: string,
    activityType: string,
    notes: string | null,
    performedByUserId: string
  ): Promise<{ activity: AccountActivity; updatedCustomer: Customer }> {
    const now = new Date();
    const nextTouchDate = new Date();
    nextTouchDate.setDate(nextTouchDate.getDate() + 30); // 30 days from now

    // Create activity entry
    const [activity] = await db.insert(accountActivities).values({
      customerId,
      activityType,
      notes,
      performedByUserId,
      activityDate: now,
    }).returning();

    // Update customer's lastActivityDate and nextRequiredTouchDate
    const [updatedCustomer] = await db
      .update(customers)
      .set({
        lastActivityDate: now,
        nextRequiredTouchDate: nextTouchDate,
      })
      .where(eq(customers.id, customerId))
      .returning();

    return { activity, updatedCustomer };
  }

  // Account Activity Events
  async getAccountActivityEvents(accountId: string, category?: string): Promise<AccountActivityEvent[]> {
    let query = db
      .select()
      .from(accountActivityEvents)
      .where(eq(accountActivityEvents.accountId, accountId))
      .orderBy(desc(accountActivityEvents.eventTs));
    
    if (category && category !== 'all') {
      return await db
        .select()
        .from(accountActivityEvents)
        .where(and(
          eq(accountActivityEvents.accountId, accountId),
          eq(accountActivityEvents.category, category)
        ))
        .orderBy(desc(accountActivityEvents.eventTs));
    }
    
    return await query;
  }

  async createAccountActivityEvent(event: InsertAccountActivityEvent): Promise<AccountActivityEvent> {
    const [created] = await db.insert(accountActivityEvents).values(event).returning();
    return created;
  }

  // Health Engine - Calculate and update account health status
  async calculateAccountHealth(accountId: string, triggerType: string = 'scheduled', triggeredBy?: string): Promise<{ health: string; healthTrend: string; healthReasons: string[] }> {
    const customer = await this.getCustomer(accountId);
    if (!customer) {
      throw new Error('Customer not found');
    }

    // Check for active override - if one exists, skip calculation and return current values
    const activeOverride = await this.getActiveHealthOverride(accountId);
    if (activeOverride) {
      return {
        health: activeOverride.overrideValue,
        healthTrend: customer.healthTrend || 'stable',
        healthReasons: [`Manual override: ${activeOverride.reason}`],
      };
    }

    const previousHealth = customer.health;
    const now = new Date();
    now.setHours(0, 0, 0, 0); // Start of today
    
    let newHealth: string;
    const reasons: string[] = [];
    
    // Sub-scores for tracking individual health factors
    const subScores: Record<string, any> = {
      touchCadence: { status: 'green', details: '' },
      claims: { status: 'green', details: '' },
      carrierMetrics: { status: 'green', details: '' },
      claimsEfficiency: { status: 'green', details: '' },
      volumeMomentum: { status: 'green', details: '' },
    };

    if (!customer.nextRequiredTouchDate) {
      // No touch date set - default to green
      newHealth = 'green';
      reasons.push('No required touch date set');
      subScores.touchCadence = { status: 'green', details: 'No required touch date set' };
    } else {
      const touchDate = new Date(customer.nextRequiredTouchDate);
      touchDate.setHours(0, 0, 0, 0);
      
      const daysDiff = Math.floor((now.getTime() - touchDate.getTime()) / (1000 * 60 * 60 * 24));
      
      if (daysDiff > 14) {
        // Overdue by more than 14 days - Red
        newHealth = 'red';
        reasons.push(`Next Required Touch overdue by ${daysDiff} days`);
        subScores.touchCadence = { status: 'red', details: `Overdue by ${daysDiff} days`, daysOverdue: daysDiff };
      } else if (daysDiff >= 1 && daysDiff <= 14) {
        // Overdue by 1-14 days - Yellow
        newHealth = 'yellow';
        reasons.push(`Next Required Touch overdue by ${daysDiff} days`);
        subScores.touchCadence = { status: 'yellow', details: `Overdue by ${daysDiff} days`, daysOverdue: daysDiff };
      } else {
        // Today or in the future - Green
        newHealth = 'green';
        if (daysDiff === 0) {
          reasons.push('Next Required Touch is today');
          subScores.touchCadence = { status: 'green', details: 'Touch date is today' };
        } else {
          reasons.push(`Next Required Touch in ${Math.abs(daysDiff)} days`);
          subScores.touchCadence = { status: 'green', details: `Touch date in ${Math.abs(daysDiff)} days` };
        }
      }
    }

    // Factor in claims data for health calculation (with defensive error handling)
    try {
      const claims = await this.getAccidentsByCustomerId(accountId);
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      
      // Count open claims and recent high-severity claims
      const openClaims = claims.filter((c: any) => 
        !["CLOSED", "PAID", "DENIED"].includes(c.claimStatus || "")
      ).length;
      
      const recentHighSeverityClaims = claims.filter((c: any) => {
        const date = c.incidentDate || c.accidentDate;
        const isRecent = date && new Date(date) >= thirtyDaysAgo;
        const isHighSeverity = c.claimSeverity === "HIGH" || c.claimSeverity === "CRITICAL";
        return isRecent && isHighSeverity;
      }).length;

      // Claims can escalate health status (from any level to higher severity)
      if (recentHighSeverityClaims >= 2) {
        // 2+ high/critical claims in 30 days - escalate to red
        newHealth = 'red';
        reasons.push(`${recentHighSeverityClaims} high-severity claims in last 30 days`);
        subScores.claims = { status: 'red', details: `${recentHighSeverityClaims} high-severity claims in 30 days`, openClaims, recentHighSeverityClaims };
      } else if (recentHighSeverityClaims === 1) {
        // 1 high/critical claim - escalate to at least yellow
        if (newHealth === 'green') {
          newHealth = 'yellow';
        }
        reasons.push('1 high-severity claim in last 30 days');
        subScores.claims = { status: 'yellow', details: '1 high-severity claim in 30 days', openClaims, recentHighSeverityClaims };
      } else if (openClaims >= 3) {
        // 3+ open claims - escalate to at least yellow
        if (newHealth === 'green') {
          newHealth = 'yellow';
        }
        reasons.push(`${openClaims} open claims require attention`);
        subScores.claims = { status: 'yellow', details: `${openClaims} open claims`, openClaims, recentHighSeverityClaims };
      } else {
        subScores.claims = { status: 'green', details: openClaims > 0 ? `${openClaims} open claims` : 'No claims issues', openClaims, recentHighSeverityClaims };
      }

      // Calculate loss ratio and claim frequency for carrier-grade health assessment
      const nintyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      
      // Get trip metrics for this account
      const tripResult = await db
        .select({
          count: sql<number>`count(*)`,
          revenue: sql<number>`COALESCE(SUM(CAST(bill_rate AS DECIMAL)), 0)`,
        })
        .from(trips)
        .where(and(eq(trips.customerId, accountId), gte(trips.tripDate, nintyDaysAgo)));
      
      const tripCount = Number(tripResult[0]?.count || 0);
      const revenue = Number(tripResult[0]?.revenue || 0);
      
      // Calculate incurred losses (paid + reserved) from recent claims
      const recentClaims = claims.filter((c: any) => {
        const date = c.incidentDate || c.accidentDate;
        return date && new Date(date) >= nintyDaysAgo;
      });
      
      let totalIncurred = 0;
      for (const claim of recentClaims) {
        const paid = Number(claim.insurancePaid || claim.actualCost || 0);
        const reserved = Number(claim.insuranceReserve || claim.probableCost || 0);
        totalIncurred += paid + reserved;
      }
      
      // Calculate loss ratio (target: < 5%)
      const lossRatio = revenue > 0 ? (totalIncurred / revenue) * 100 : 0;
      
      // Calculate claim frequency (per 100 trips, target: < 1)
      const claimFrequency = tripCount > 0 ? (recentClaims.length / tripCount) * 100 : 0;
      
      // Loss ratio impacts health
      if (lossRatio > 10) {
        newHealth = 'red';
        reasons.push(`High loss ratio: ${lossRatio.toFixed(1)}% (target: <5%)`);
        subScores.carrierMetrics = { status: 'red', details: `Loss ratio: ${lossRatio.toFixed(1)}%`, lossRatio, claimFrequency };
      } else if (lossRatio > 5 && newHealth === 'green') {
        newHealth = 'yellow';
        reasons.push(`Elevated loss ratio: ${lossRatio.toFixed(1)}%`);
        subScores.carrierMetrics = { status: 'yellow', details: `Loss ratio: ${lossRatio.toFixed(1)}%`, lossRatio, claimFrequency };
      }
      
      // Claim frequency impacts health
      if (claimFrequency > 2) {
        if (newHealth !== 'red') {
          newHealth = 'red';
        }
        reasons.push(`High claim frequency: ${claimFrequency.toFixed(2)} per 100 trips (target: <1)`);
        subScores.carrierMetrics = { status: 'red', details: `Claim frequency: ${claimFrequency.toFixed(2)}/100 trips`, lossRatio, claimFrequency };
      } else if (claimFrequency > 1 && newHealth === 'green') {
        newHealth = 'yellow';
        reasons.push(`Elevated claim frequency: ${claimFrequency.toFixed(2)} per 100 trips`);
        subScores.carrierMetrics = { status: 'yellow', details: `Claim frequency: ${claimFrequency.toFixed(2)}/100 trips`, lossRatio, claimFrequency };
      }
      
      // Set carrier metrics if not already set
      if (!subScores.carrierMetrics.lossRatio) {
        subScores.carrierMetrics = { status: 'green', details: 'Within target ranges', lossRatio, claimFrequency };
      }

      // Claims efficiency metrics: claims per 1,000 moves and claim $ per move
      // Calculate for current and prior 30-day periods to detect trend changes
      const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
      
      // Current 30-day claims
      const claims30 = claims.filter((c: any) => {
        const date = c.incidentDate || c.accidentDate;
        return date && new Date(date) >= thirtyDaysAgo;
      });
      
      // Prior 30-day claims (30-60 days ago)
      const claimsPrior30 = claims.filter((c: any) => {
        const date = c.incidentDate || c.accidentDate;
        return date && new Date(date) >= sixtyDaysAgo && new Date(date) < thirtyDaysAgo;
      });

      // Get trip counts for current and prior 30-day periods
      const tripResult30Current = await db
        .select({ count: sql<number>`count(*)` })
        .from(trips)
        .where(and(eq(trips.customerId, accountId), gte(trips.tripDate, thirtyDaysAgo)));
      const moves30 = Number(tripResult30Current[0]?.count || 0);

      const tripResultPrior30 = await db
        .select({ count: sql<number>`count(*)` })
        .from(trips)
        .where(and(eq(trips.customerId, accountId), gte(trips.tripDate, sixtyDaysAgo), lt(trips.tripDate, thirtyDaysAgo)));
      const movesPrior30 = Number(tripResultPrior30[0]?.count || 0);

      // Calculate claims per 1,000 moves
      const claimsPer1000Current = moves30 > 0 ? (claims30.length / moves30) * 1000 : 0;
      const claimsPer1000Prior = movesPrior30 > 0 ? (claimsPrior30.length / movesPrior30) * 1000 : 0;
      
      // Calculate claim $ per move
      let totalCost30 = 0;
      for (const claim of claims30) {
        const paid = Number(claim.insurancePaid || claim.actualCost || 0);
        const reserved = Number(claim.insuranceReserve || claim.probableCost || 0);
        totalCost30 += paid + reserved;
      }
      let totalCostPrior30 = 0;
      for (const claim of claimsPrior30) {
        const paid = Number(claim.insurancePaid || claim.actualCost || 0);
        const reserved = Number(claim.insuranceReserve || claim.probableCost || 0);
        totalCostPrior30 += paid + reserved;
      }
      const claimDollarPerMoveCurrent = moves30 > 0 ? totalCost30 / moves30 : 0;
      const claimDollarPerMovePrior = movesPrior30 > 0 ? totalCostPrior30 / movesPrior30 : 0;

      // Check for claims per 1,000 moves trend deterioration
      // >20% increase → Yellow, >40% sustained → Red
      if (claimsPer1000Prior > 0 && moves30 >= 10) {
        const claimsPer1000Change = ((claimsPer1000Current - claimsPer1000Prior) / claimsPer1000Prior) * 100;
        
        if (claimsPer1000Change > 40) {
          // Sustained high increase - escalate to red
          if (newHealth !== 'red') {
            newHealth = 'red';
          }
          reasons.push(`Claims per 1,000 moves increased ${claimsPer1000Change.toFixed(0)}% (target: <20%)`);
        } else if (claimsPer1000Change > 20 && newHealth === 'green') {
          newHealth = 'yellow';
          reasons.push(`Claims per 1,000 moves increased ${claimsPer1000Change.toFixed(0)}%`);
        }
      }

      // Check for claim $ per move trend deterioration
      // >25% increase → Yellow
      if (claimDollarPerMovePrior > 0 && moves30 >= 10) {
        const claimDollarChange = ((claimDollarPerMoveCurrent - claimDollarPerMovePrior) / claimDollarPerMovePrior) * 100;
        
        if (claimDollarChange > 50) {
          // Major cost increase - escalate to red
          if (newHealth !== 'red') {
            newHealth = 'red';
          }
          reasons.push(`Claim $ per move increased ${claimDollarChange.toFixed(0)}% ($${claimDollarPerMoveCurrent.toFixed(2)}/move)`);
        } else if (claimDollarChange > 25 && newHealth === 'green') {
          newHealth = 'yellow';
          reasons.push(`Claim $ per move increased ${claimDollarChange.toFixed(0)}%`);
        }
      }
    } catch (claimsError) {
      // Log error but don't fail health calculation - claims data is supplementary
      console.error(`Error fetching claims for health calculation (account ${accountId}):`, claimsError);
    }

    // Volume Momentum integration (LOWEST WEIGHT)
    // Volume Momentum can only affect health when it's currently green
    // It cannot override severe risk (red) or payment/claims issues (yellow)
    try {
      const momentum = await this.getAccountVolumeMomentum(accountId);
      
      // Only apply volume momentum if health is currently green
      // This ensures it has the lowest weight and cannot mask other issues
      if (newHealth === 'green') {
        // Sustained severe decline (score < 30) can trigger yellow
        if (momentum.score < 30 && momentum.label === 'Declining') {
          // Only trigger if YoY is significantly negative (>20% decline)
          if (momentum.yoyChange < -20) {
            newHealth = 'yellow';
            reasons.push(`Volume declining: ${momentum.yoyChange.toFixed(0)}% YoY (momentum score: ${momentum.score})`);
            subScores.volumeMomentum = { status: 'yellow', details: `Volume declining ${momentum.yoyChange.toFixed(0)}% YoY`, score: momentum.score, yoyChange: momentum.yoyChange };
          }
        }
      }
      // Add volume momentum context to reasons even if it doesn't change health
      if (momentum.label === 'Growing' && momentum.yoyChange > 15) {
        reasons.push(`Volume growing: +${momentum.yoyChange.toFixed(0)}% YoY`);
        subScores.volumeMomentum = { status: 'green', details: `Volume growing +${momentum.yoyChange.toFixed(0)}% YoY`, score: momentum.score, yoyChange: momentum.yoyChange };
      }
      // Set volume momentum if not already set
      if (!subScores.volumeMomentum.score) {
        subScores.volumeMomentum = { status: momentum.label === 'Declining' ? 'yellow' : 'green', details: `${momentum.label} (${momentum.yoyChange >= 0 ? '+' : ''}${momentum.yoyChange.toFixed(0)}% YoY)`, score: momentum.score, yoyChange: momentum.yoyChange };
      }
    } catch (volumeError) {
      // Log error but don't fail health calculation - volume momentum is supplementary
      console.error(`Error fetching volume momentum for health calculation (account ${accountId}):`, volumeError);
    }

    // Calculate trend based on previous health
    let newTrend: string;
    const healthOrder = { 'green': 0, 'yellow': 1, 'red': 2 };
    
    if (!previousHealth) {
      newTrend = 'stable';
    } else {
      const prevOrder = healthOrder[previousHealth as keyof typeof healthOrder] ?? 0;
      const newOrder = healthOrder[newHealth as keyof typeof healthOrder] ?? 0;
      
      if (newOrder > prevOrder) {
        newTrend = 'declining';
      } else if (newOrder < prevOrder) {
        newTrend = 'improving';
      } else {
        newTrend = 'stable';
      }
    }

    // Update customer with new health data
    await db
      .update(customers)
      .set({
        health: newHealth,
        healthTrend: newTrend,
        healthReasons: JSON.stringify(reasons),
        healthCalculatedAt: new Date(),
      })
      .where(eq(customers.id, accountId));

    // Log the health calculation for audit trail
    try {
      await this.createHealthCalculationLog({
        accountId,
        calculatedAt: new Date(),
        overallHealth: newHealth,
        previousHealth: previousHealth || undefined,
        healthTrend: newTrend,
        subScores: JSON.stringify(subScores),
        reasons: JSON.stringify(reasons),
        triggerType,
        triggeredBy,
      });
    } catch (logError) {
      console.error(`Error logging health calculation for account ${accountId}:`, logError);
    }

    return {
      health: newHealth,
      healthTrend: newTrend,
      healthReasons: reasons,
    };
  }

  // Recalculate health for all customers
  async recalculateAllAccountHealth(): Promise<{ processed: number; errors: number }> {
    const allCustomers = await this.getAllCustomers();
    let processed = 0;
    let errors = 0;

    for (const customer of allCustomers) {
      try {
        await this.calculateAccountHealth(customer.id);
        processed++;
      } catch (error) {
        console.error(`Error calculating health for customer ${customer.id}:`, error);
        errors++;
      }
    }

    return { processed, errors };
  }

  // Health Governance & Explainability
  async createHealthCalculationLog(data: InsertHealthCalculationLog): Promise<HealthCalculationLog> {
    const [log] = await db.insert(healthCalculationLogs).values(data).returning();
    return log;
  }

  async getHealthCalculationLogs(accountId: string, limit: number = 20): Promise<HealthCalculationLog[]> {
    return await db
      .select()
      .from(healthCalculationLogs)
      .where(eq(healthCalculationLogs.accountId, accountId))
      .orderBy(desc(healthCalculationLogs.calculatedAt))
      .limit(limit);
  }

  async createHealthOverride(data: InsertHealthOverride): Promise<HealthOverride> {
    // Deactivate any existing active overrides for this account
    await db
      .update(healthOverrides)
      .set({
        isActive: false,
        deactivatedAt: new Date(),
        deactivationReason: 'Superseded by new override',
      })
      .where(and(
        eq(healthOverrides.accountId, data.accountId),
        eq(healthOverrides.isActive, true)
      ));
    
    const [override] = await db.insert(healthOverrides).values({
      ...data,
      isActive: true,
    }).returning();
    
    // Update the customer's health status with the override
    await db
      .update(customers)
      .set({
        health: data.overrideValue,
        healthReasons: JSON.stringify([`Manual override: ${data.reason}`]),
        healthCalculatedAt: new Date(),
      })
      .where(eq(customers.id, data.accountId));
    
    // Log to activity timeline
    await this.createAccountActivityEvent({
      accountId: data.accountId,
      category: 'status',
      eventType: 'health_override_created',
      summary: `Health status manually set to ${data.overrideValue.toUpperCase()} until ${new Date(data.expiresAt).toLocaleDateString()}`,
      triggeredBy: data.createdBy,
    });
    
    return override;
  }

  async getActiveHealthOverride(accountId: string): Promise<HealthOverride | undefined> {
    const now = new Date();
    const [override] = await db
      .select()
      .from(healthOverrides)
      .where(and(
        eq(healthOverrides.accountId, accountId),
        eq(healthOverrides.isActive, true),
        gte(healthOverrides.expiresAt, now)
      ))
      .limit(1);
    return override;
  }

  async getHealthOverrides(accountId: string): Promise<HealthOverride[]> {
    return await db
      .select()
      .from(healthOverrides)
      .where(eq(healthOverrides.accountId, accountId))
      .orderBy(desc(healthOverrides.createdAt));
  }

  async deactivateHealthOverride(id: string, deactivatedBy: string, reason: string): Promise<HealthOverride | undefined> {
    const [override] = await db
      .update(healthOverrides)
      .set({
        isActive: false,
        deactivatedAt: new Date(),
        deactivatedBy,
        deactivationReason: reason,
      })
      .where(eq(healthOverrides.id, id))
      .returning();
    
    if (override) {
      // Recalculate health without the override
      await this.calculateAccountHealth(override.accountId);
      
      // Log to activity timeline
      await this.createAccountActivityEvent({
        accountId: override.accountId,
        category: 'status',
        eventType: 'health_override_removed',
        summary: `Health override removed: ${reason}`,
        triggeredBy: deactivatedBy,
      });
    }
    
    return override;
  }

  async expireHealthOverrides(): Promise<number> {
    const now = new Date();
    const expired = await db
      .update(healthOverrides)
      .set({
        isActive: false,
        deactivatedAt: now,
        deactivationReason: 'Expired',
      })
      .where(and(
        eq(healthOverrides.isActive, true),
        lt(healthOverrides.expiresAt, now)
      ))
      .returning();
    
    // Recalculate health for all affected accounts
    for (const override of expired) {
      try {
        await this.calculateAccountHealth(override.accountId);
        await this.createAccountActivityEvent({
          accountId: override.accountId,
          category: 'status',
          eventType: 'health_override_expired',
          summary: `Health override expired - health recalculated automatically`,
          triggeredBy: 'system',
        });
      } catch (error) {
        console.error(`Error recalculating health after override expiration for ${override.accountId}:`, error);
      }
    }
    
    return expired.length;
  }

  async getHealthExplanation(accountId: string): Promise<{
    currentHealth: string;
    healthTrend: string;
    calculatedAt: Date | null;
    reasons: string[];
    subScores: Record<string, any>;
    hasActiveOverride: boolean;
    override?: HealthOverride;
    recentLogs: HealthCalculationLog[];
  }> {
    const customer = await this.getCustomer(accountId);
    if (!customer) {
      throw new Error('Customer not found');
    }

    const activeOverride = await this.getActiveHealthOverride(accountId);
    const recentLogs = await this.getHealthCalculationLogs(accountId, 10);
    
    let reasons: string[] = [];
    try {
      reasons = customer.healthReasons ? JSON.parse(customer.healthReasons) : [];
    } catch {
      reasons = [];
    }

    // Get the most recent log for sub-scores
    let subScores: Record<string, any> = {};
    if (recentLogs.length > 0) {
      try {
        subScores = JSON.parse(recentLogs[0].subScores);
      } catch {
        subScores = {};
      }
    }

    return {
      currentHealth: customer.health || 'green',
      healthTrend: customer.healthTrend || 'stable',
      calculatedAt: customer.healthCalculatedAt,
      reasons,
      subScores,
      hasActiveOverride: !!activeOverride,
      override: activeOverride,
      recentLogs,
    };
  }

  // Volume Momentum Score
  async getAccountVolumeMomentum(accountId: string): Promise<{
    score: number;
    label: 'Growing' | 'Stable' | 'Declining';
    yoyChange: number;
    qoqChange: number;
    volatility: number;
    currentYearMoves: number;
    priorYearMoves: number;
    currentQuarterMoves: number;
    priorQuarterMoves: number;
    monthlyVolumes: { month: string; moves: number }[];
  }> {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const currentQuarter = Math.floor(currentMonth / 3);
    
    // Define date ranges
    const currentYearStart = new Date(currentYear, 0, 1);
    const priorYearStart = new Date(currentYear - 1, 0, 1);
    const priorYearEnd = new Date(currentYear, 0, 1);
    
    // Current quarter start
    const currentQuarterStart = new Date(currentYear, currentQuarter * 3, 1);
    // Prior quarter (same quarter last year for better comparison)
    const priorQuarterStart = new Date(currentYear - 1, currentQuarter * 3, 1);
    const priorQuarterEnd = new Date(currentYear - 1, (currentQuarter + 1) * 3, 1);
    
    // Get trip counts for year-over-year comparison
    const [currentYearResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(trips)
      .where(and(eq(trips.customerId, accountId), gte(trips.tripDate, currentYearStart)));
    const currentYearMoves = Number(currentYearResult?.count || 0);
    
    const [priorYearResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(trips)
      .where(and(
        eq(trips.customerId, accountId),
        gte(trips.tripDate, priorYearStart),
        lt(trips.tripDate, priorYearEnd)
      ));
    const priorYearMoves = Number(priorYearResult?.count || 0);
    
    // Get trip counts for quarter-over-quarter comparison
    const [currentQuarterResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(trips)
      .where(and(eq(trips.customerId, accountId), gte(trips.tripDate, currentQuarterStart)));
    const currentQuarterMoves = Number(currentQuarterResult?.count || 0);
    
    const [priorQuarterResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(trips)
      .where(and(
        eq(trips.customerId, accountId),
        gte(trips.tripDate, priorQuarterStart),
        lt(trips.tripDate, priorQuarterEnd)
      ));
    const priorQuarterMoves = Number(priorQuarterResult?.count || 0);
    
    // Get monthly volumes for the last 12 months (for volatility calculation)
    const twelveMonthsAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    const monthlyData = await db
      .select({
        month: sql<string>`to_char(${trips.tripDate}, 'YYYY-MM')`,
        count: sql<number>`count(*)`
      })
      .from(trips)
      .where(and(eq(trips.customerId, accountId), gte(trips.tripDate, twelveMonthsAgo)))
      .groupBy(sql`to_char(${trips.tripDate}, 'YYYY-MM')`)
      .orderBy(sql`to_char(${trips.tripDate}, 'YYYY-MM')`);
    
    const monthlyVolumes = monthlyData.map(m => ({
      month: m.month,
      moves: Number(m.count || 0)
    }));
    
    // Calculate YoY change percentage
    // Normalize for partial year by comparing same period
    const monthsElapsed = currentMonth + 1;
    const normalizedPriorYear = priorYearMoves > 0 
      ? (priorYearMoves / 12) * monthsElapsed 
      : 0;
    const yoyChange = normalizedPriorYear > 0 
      ? ((currentYearMoves - normalizedPriorYear) / normalizedPriorYear) * 100 
      : (currentYearMoves > 0 ? 100 : 0);
    
    // Calculate QoQ change percentage
    const qoqChange = priorQuarterMoves > 0 
      ? ((currentQuarterMoves - priorQuarterMoves) / priorQuarterMoves) * 100 
      : (currentQuarterMoves > 0 ? 100 : 0);
    
    // Calculate volatility (coefficient of variation of monthly volumes)
    let volatility = 0;
    if (monthlyVolumes.length >= 3) {
      const volumes = monthlyVolumes.map(m => m.moves);
      const mean = volumes.reduce((a, b) => a + b, 0) / volumes.length;
      if (mean > 0) {
        const variance = volumes.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / volumes.length;
        const stdDev = Math.sqrt(variance);
        volatility = (stdDev / mean) * 100; // CV as percentage
      }
    }
    
    // Calculate momentum score (0-100)
    // Base score starts at 50 (neutral)
    let score = 50;
    
    // YoY growth contribution (weighted highest: up to +/- 30 points)
    if (yoyChange > 20) {
      score += Math.min(30, yoyChange * 0.5); // Strong growth
    } else if (yoyChange > 0) {
      score += yoyChange * 1.5; // Moderate growth
    } else if (yoyChange < -20) {
      score += Math.max(-30, yoyChange * 0.5); // Strong decline
    } else if (yoyChange < 0) {
      score += yoyChange * 1.5; // Moderate decline
    }
    
    // QoQ trend contribution (weighted medium: up to +/- 15 points)
    if (qoqChange > 10) {
      score += Math.min(15, qoqChange * 0.3);
    } else if (qoqChange > 0) {
      score += qoqChange * 0.5;
    } else if (qoqChange < -10) {
      score += Math.max(-15, qoqChange * 0.3);
    } else if (qoqChange < 0) {
      score += qoqChange * 0.5;
    }
    
    // Volatility penalty (high volatility reduces score slightly: up to -10 points)
    if (volatility > 50) {
      score -= Math.min(10, (volatility - 50) * 0.1);
    } else if (volatility > 30) {
      score -= (volatility - 30) * 0.1;
    }
    
    // Clamp score to 0-100
    score = Math.max(0, Math.min(100, Math.round(score)));
    
    // Determine label based on score
    let label: 'Growing' | 'Stable' | 'Declining';
    if (score >= 60) {
      label = 'Growing';
    } else if (score <= 40) {
      label = 'Declining';
    } else {
      label = 'Stable';
    }
    
    return {
      score,
      label,
      yoyChange: Math.round(yoyChange * 10) / 10,
      qoqChange: Math.round(qoqChange * 10) / 10,
      volatility: Math.round(volatility * 10) / 10,
      currentYearMoves,
      priorYearMoves,
      currentQuarterMoves,
      priorQuarterMoves,
      monthlyVolumes,
    };
  }

  // Parent/Child Account Hierarchy

  async getChildAccounts(parentId: string): Promise<Customer[]> {
    return db
      .select()
      .from(customers)
      .where(eq(customers.parentAccountId, parentId))
      .orderBy(customers.customerName);
  }

  async getParentAccount(childId: string): Promise<Customer | null> {
    const child = await this.getCustomer(childId);
    if (!child || !child.parentAccountId) {
      return null;
    }
    const parent = await this.getCustomer(child.parentAccountId);
    return parent || null;
  }

  async isParentAccount(accountId: string): Promise<boolean> {
    const children = await db
      .select({ id: customers.id })
      .from(customers)
      .where(eq(customers.parentAccountId, accountId))
      .limit(1);
    return children.length > 0;
  }

  async getParentRollupMetrics(parentId: string): Promise<{
    totalRevenue30: number;
    totalRevenue90: number;
    totalCosts30: number;
    totalCosts90: number;
    totalMargin: number;
    openAR: number;
    childCount: number;
    rolledUpHealth: string;
    rolledUpHealthTrend: string;
  }> {
    const childAccounts = await this.getChildAccounts(parentId);
    const childCount = childAccounts.length;

    // Calculate rolled-up health - worst health of any child
    // Priority: red > yellow > green
    let worstHealth = 'green';
    const healthCounts = { red: 0, yellow: 0, green: 0 };
    const trendCounts = { down: 0, flat: 0, up: 0 };

    for (const child of childAccounts) {
      const health = (child.health || 'green').toLowerCase();
      if (health === 'red') {
        healthCounts.red++;
        worstHealth = 'red';
      } else if (health === 'yellow' && worstHealth !== 'red') {
        healthCounts.yellow++;
        worstHealth = 'yellow';
      } else {
        healthCounts.green++;
      }

      const trend = (child.healthTrend || 'flat').toLowerCase();
      if (trend === 'down' || trend === 'declining') trendCounts.down++;
      else if (trend === 'up' || trend === 'improving') trendCounts.up++;
      else trendCounts.flat++;
    }

    // Rolled-up trend: if more trending down than up, overall is down; if more up, overall is up
    let rolledUpHealthTrend = 'flat';
    if (trendCounts.down > trendCounts.up) {
      rolledUpHealthTrend = 'down';
    } else if (trendCounts.up > trendCounts.down) {
      rolledUpHealthTrend = 'up';
    }

    // Get child IDs for aggregating trip/financial data
    const childIds = childAccounts.map(c => c.id);
    
    // Calculate revenue, costs, and AR from trips if we have children
    let totalRevenue30 = 0;
    let totalRevenue90 = 0;
    let totalCosts30 = 0;
    let totalCosts90 = 0;
    let totalMargin = 0;
    let openAR = 0;

    if (childIds.length > 0) {
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

      // Get trips for all child accounts in last 90 days
      const childTrips = await db
        .select({
          customerId: trips.customerId,
          tripDate: trips.tripDate,
          billRate: trips.billRate,
          payRate: trips.payRate,
        })
        .from(trips)
        .where(
          and(
            inArray(trips.customerId, childIds),
            gte(trips.tripDate, ninetyDaysAgo)
          )
        );

      for (const trip of childTrips) {
        const tripDate = new Date(trip.tripDate || '');
        const revenue = parseFloat(trip.billRate || '0');
        const cost = parseFloat(trip.payRate || '0');

        if (tripDate >= thirtyDaysAgo) {
          totalRevenue30 += revenue;
          totalCosts30 += cost;
        }
        totalRevenue90 += revenue;
        totalCosts90 += cost;
      }

      totalMargin = totalRevenue90 - totalCosts90;

      // Sum open AR from invoices for child accounts
      const openInvoices = await db
        .select({
          totalAmount: invoices.totalAmount,
          paidAmount: invoices.paidAmount,
        })
        .from(invoices)
        .where(
          and(
            inArray(invoices.customerId, childIds),
            eq(invoices.status, 'pending')
          )
        );

      for (const inv of openInvoices) {
        const total = parseFloat(inv.totalAmount || '0');
        const paid = parseFloat(inv.paidAmount || '0');
        openAR += (total - paid);
      }
    }

    // Calculate claims metrics rollup
    let totalClaims30 = 0;
    let totalClaims90 = 0;
    let totalClaimsCost30 = 0;
    let totalClaimsCost90 = 0;
    let totalMoves30 = 0;
    let totalMoves90 = 0;
    const childClaimsData: { childId: string; childName: string; claimsCount: number; claimsCost: number }[] = [];

    if (childIds.length > 0) {
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

      for (const child of childAccounts) {
        const childClaims = await this.getAccidentsByCustomerId(child.id);
        let childClaims30 = 0;
        let childClaimsCost30 = 0;

        for (const claim of childClaims) {
          const date = (claim as any).incidentDate || (claim as any).accidentDate;
          if (!date) continue;
          const claimDate = new Date(date);
          const paid = Number((claim as any).insurancePaid || (claim as any).actualCost || 0);
          const reserved = Number((claim as any).insuranceReserve || (claim as any).probableCost || 0);
          const cost = paid + reserved;

          if (claimDate >= thirtyDaysAgo) {
            totalClaims30++;
            totalClaimsCost30 += cost;
            childClaims30++;
            childClaimsCost30 += cost;
          }
          if (claimDate >= ninetyDaysAgo) {
            totalClaims90++;
            totalClaimsCost90 += cost;
          }
        }

        if (childClaims30 > 0) {
          childClaimsData.push({
            childId: child.id,
            childName: child.customerName || 'Unknown',
            claimsCount: childClaims30,
            claimsCost: childClaimsCost30,
          });
        }

        // Get moves for this child
        const tripResult30 = await db
          .select({ count: sql<number>`count(*)` })
          .from(trips)
          .where(and(eq(trips.customerId, child.id), gte(trips.tripDate, thirtyDaysAgo)));
        totalMoves30 += Number(tripResult30[0]?.count || 0);

        const tripResult90 = await db
          .select({ count: sql<number>`count(*)` })
          .from(trips)
          .where(and(eq(trips.customerId, child.id), gte(trips.tripDate, ninetyDaysAgo)));
        totalMoves90 += Number(tripResult90[0]?.count || 0);
      }
    }

    // Calculate child concentration (percentage of total claims cost)
    const totalClaimsCostForConcentration = childClaimsData.reduce((sum, c) => sum + c.claimsCost, 0);
    const childConcentration = childClaimsData
      .map(c => ({
        ...c,
        percentage: totalClaimsCostForConcentration > 0 ? (c.claimsCost / totalClaimsCostForConcentration) * 100 : 0,
      }))
      .sort((a, b) => b.percentage - a.percentage)
      .slice(0, 5); // Top 5 contributors

    const claimsMetrics = {
      totalClaims30,
      totalClaims90,
      totalClaimsCost30,
      totalClaimsCost90,
      totalMoves30,
      totalMoves90,
      claimsPer1000Moves30: totalMoves30 > 0 ? (totalClaims30 / totalMoves30) * 1000 : 0,
      claimsPer1000Moves90: totalMoves90 > 0 ? (totalClaims90 / totalMoves90) * 1000 : 0,
      claimDollarPerMove30: totalMoves30 > 0 ? totalClaimsCost30 / totalMoves30 : 0,
      claimDollarPerMove90: totalMoves90 > 0 ? totalClaimsCost90 / totalMoves90 : 0,
      childConcentration,
    };

    return {
      totalRevenue30,
      totalRevenue90,
      totalCosts30,
      totalCosts90,
      totalMargin,
      openAR,
      childCount,
      rolledUpHealth: worstHealth,
      rolledUpHealthTrend,
      claimsMetrics,
    };
  }

  // Playbooks - automated responses to account scenarios
  async getAllPlaybooks(): Promise<Playbook[]> {
    return db.select().from(playbooks).orderBy(asc(playbooks.priority));
  }

  async getPlaybookById(id: string): Promise<Playbook | undefined> {
    const [playbook] = await db.select().from(playbooks).where(eq(playbooks.id, id));
    return playbook;
  }

  async getEnabledPlaybooks(): Promise<Playbook[]> {
    return db
      .select()
      .from(playbooks)
      .where(eq(playbooks.enabled, true))
      .orderBy(asc(playbooks.priority));
  }

  async createPlaybook(data: InsertPlaybook): Promise<Playbook> {
    const [playbook] = await db.insert(playbooks).values(data).returning();
    return playbook;
  }

  async updatePlaybook(id: string, data: Partial<InsertPlaybook>): Promise<Playbook | undefined> {
    const [playbook] = await db
      .update(playbooks)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(playbooks.id, id))
      .returning();
    return playbook;
  }

  async deletePlaybook(id: string): Promise<boolean> {
    const result = await db.delete(playbooks).where(eq(playbooks.id, id));
    return true;
  }

  // Playbook Executions
  async getPlaybookExecutionsByAccount(accountId: string): Promise<PlaybookExecution[]> {
    return db
      .select()
      .from(playbookExecutions)
      .where(eq(playbookExecutions.accountId, accountId))
      .orderBy(desc(playbookExecutions.executedAt));
  }

  async hasPlaybookExecuted(playbookId: string, accountId: string, incidentKey: string): Promise<boolean> {
    const [existing] = await db
      .select()
      .from(playbookExecutions)
      .where(
        and(
          eq(playbookExecutions.playbookId, playbookId),
          eq(playbookExecutions.accountId, accountId),
          eq(playbookExecutions.incidentKey, incidentKey)
        )
      );
    return !!existing;
  }

  async createPlaybookExecution(data: InsertPlaybookExecution): Promise<PlaybookExecution> {
    const [execution] = await db.insert(playbookExecutions).values(data).returning();
    return execution;
  }

  // Playbook Trigger Evaluation
  async evaluatePlaybookTriggers(accountId: string): Promise<{ playbook: Playbook; incidentKey: string }[]> {
    const customer = await this.getCustomer(accountId);
    if (!customer) return [];

    const enabledPlaybooks = await this.getEnabledPlaybooks();
    const triggeredPlaybooks: { playbook: Playbook; incidentKey: string }[] = [];

    for (const playbook of enabledPlaybooks) {
      const config = JSON.parse(playbook.triggerConfig || '{}');
      let triggered = false;
      let incidentKey = '';

      switch (playbook.triggerType) {
        case 'volume_drop': {
          // Check if volume dropped by threshold% in the specified period
          const threshold = config.thresholdPercent || 25;
          const periodDays = config.periodDays || 30;
          const now = new Date();
          const periodStart = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000);
          const priorPeriodStart = new Date(periodStart.getTime() - periodDays * 24 * 60 * 60 * 1000);

          // Get trip counts for current and prior periods
          const currentTrips = await db
            .select({ count: sql<number>`count(*)` })
            .from(trips)
            .where(and(eq(trips.customerId, accountId), gte(trips.tripDate, periodStart)));
          
          const priorTrips = await db
            .select({ count: sql<number>`count(*)` })
            .from(trips)
            .where(
              and(
                eq(trips.customerId, accountId),
                gte(trips.tripDate, priorPeriodStart),
                lt(trips.tripDate, periodStart)
              )
            );

          const currentCount = Number(currentTrips[0]?.count || 0);
          const priorCount = Number(priorTrips[0]?.count || 0);

          if (priorCount > 0) {
            const dropPercent = ((priorCount - currentCount) / priorCount) * 100;
            if (dropPercent >= threshold) {
              triggered = true;
              // Use month as incident key to prevent multiple triggers in same month
              incidentKey = `volume_drop_${now.getFullYear()}_${now.getMonth()}`;
            }
          }
          break;
        }

        case 'ar_past_due': {
          // Check if AR is past due by specified days
          const pastDueDays = config.pastDueDays || 30;
          const now = new Date();
          const dueThreshold = new Date(now.getTime() - pastDueDays * 24 * 60 * 60 * 1000);

          const pastDueInvoices = await db
            .select()
            .from(invoices)
            .where(
              and(
                eq(invoices.customerId, accountId),
                eq(invoices.status, 'pending'),
                lt(invoices.dueDate, dueThreshold)
              )
            )
            .limit(1);

          if (pastDueInvoices.length > 0) {
            triggered = true;
            // Use month as incident key
            incidentKey = `ar_past_due_${now.getFullYear()}_${now.getMonth()}`;
          }
          break;
        }

        case 'health_red': {
          // Check if health just turned red
          if (customer.health === 'red') {
            triggered = true;
            // Use the date health changed as incident key
            const healthDate = customer.healthCalculatedAt 
              ? new Date(customer.healthCalculatedAt).toISOString().split('T')[0]
              : new Date().toISOString().split('T')[0];
            incidentKey = `health_red_${healthDate}`;
          }
          break;
        }

        case 'sla_breach': {
          // Check for SLA breaches in the specified period
          const periodDays = config.periodDays || 7;
          const minBreaches = config.minBreaches || 2;
          const now = new Date();
          const periodStart = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000);

          // Count SLA breach events
          const breaches = await db
            .select({ count: sql<number>`count(*)` })
            .from(accountActivityEvents)
            .where(
              and(
                eq(accountActivityEvents.accountId, accountId),
                eq(accountActivityEvents.eventType, 'sla_breach'),
                gte(accountActivityEvents.eventTs, periodStart)
              )
            );

          const breachCount = Number(breaches[0]?.count || 0);
          if (breachCount >= minBreaches) {
            triggered = true;
            // Use week as incident key
            const weekNum = Math.floor(now.getTime() / (7 * 24 * 60 * 60 * 1000));
            incidentKey = `sla_breach_week_${weekNum}`;
          }
          break;
        }
      }

      if (triggered && incidentKey) {
        // Check if already executed for this incident
        const alreadyExecuted = await this.hasPlaybookExecuted(playbook.id, accountId, incidentKey);
        if (!alreadyExecuted) {
          triggeredPlaybooks.push({ playbook, incidentKey });
        }
      }
    }

    return triggeredPlaybooks;
  }

  // Execute playbook actions
  async executePlaybookActions(
    playbook: Playbook,
    accountId: string,
    incidentKey: string,
    executorUserId?: string
  ): Promise<PlaybookExecution> {
    const actions = JSON.parse(playbook.actions || '[]');
    const executedActions: any[] = [];
    let hasError = false;
    let errorMessage = '';

    try {
      for (const action of actions) {
        try {
          switch (action.type) {
            case 'create_task': {
              // Create a task in activity timeline as a note with task-like structure
              await this.createAccountActivityEvent({
                accountId,
                category: 'task',
                eventType: 'task_created',
                summary: `[TASK] ${action.taskType || 'Follow-up'}: ${action.description || 'Playbook-generated task'}`,
                createdByUserId: executorUserId || null,
                metadata: JSON.stringify({
                  taskType: action.taskType,
                  dueDate: action.dueDays 
                    ? new Date(Date.now() + action.dueDays * 24 * 60 * 60 * 1000).toISOString()
                    : null,
                  owner: action.owner,
                  playbookId: playbook.id,
                  playbookName: playbook.name,
                }),
              });
              executedActions.push({ type: 'create_task', success: true });
              break;
            }

            case 'add_note': {
              // Add an activity note
              await this.createAccountActivityEvent({
                accountId,
                category: 'system',
                eventType: 'playbook_note',
                summary: action.note || `Note from playbook: ${playbook.name}`,
                createdByUserId: executorUserId || null,
                metadata: JSON.stringify({
                  playbookId: playbook.id,
                  playbookName: playbook.name,
                }),
              });
              executedActions.push({ type: 'add_note', success: true });
              break;
            }

            case 'notify_role': {
              // Create notification event (actual notification would be sent by notification system)
              await this.createAccountActivityEvent({
                accountId,
                category: 'system',
                eventType: 'notification_sent',
                summary: `Notification sent to ${action.role || 'Owner'}: ${action.message || playbook.name}`,
                createdByUserId: executorUserId || null,
                metadata: JSON.stringify({
                  role: action.role,
                  message: action.message,
                  playbookId: playbook.id,
                  playbookName: playbook.name,
                }),
              });
              executedActions.push({ type: 'notify_role', success: true, role: action.role });
              break;
            }
          }
        } catch (actionError: any) {
          executedActions.push({ type: action.type, success: false, error: actionError.message });
          hasError = true;
          errorMessage += `${action.type}: ${actionError.message}; `;
        }
      }

      // Log playbook execution to activity timeline
      await this.createAccountActivityEvent({
        accountId,
        category: 'system',
        eventType: 'playbook_executed',
        summary: `Playbook executed: ${playbook.name}`,
        createdByUserId: executorUserId || null,
        metadata: JSON.stringify({
          playbookId: playbook.id,
          incidentKey,
          actionsExecuted: executedActions,
        }),
      });

    } catch (error: any) {
      hasError = true;
      errorMessage = error.message;
    }

    // Record the execution
    const execution = await this.createPlaybookExecution({
      playbookId: playbook.id,
      accountId,
      incidentKey,
      status: hasError ? 'failed' : 'completed',
      actionsExecuted: JSON.stringify(executedActions),
      errorMessage: hasError ? errorMessage : null,
    });

    return execution;
  }

  // Run all playbooks for all accounts (scheduled job)
  async runPlaybooksForAllAccounts(): Promise<{ processed: number; triggered: number; errors: number }> {
    const allCustomers = await this.getAllCustomers();
    let processed = 0;
    let triggered = 0;
    let errors = 0;

    for (const customer of allCustomers) {
      try {
        const triggeredPlaybooks = await this.evaluatePlaybookTriggers(customer.id);
        
        for (const { playbook, incidentKey } of triggeredPlaybooks) {
          try {
            await this.executePlaybookActions(playbook, customer.id, incidentKey);
            triggered++;
          } catch (error) {
            console.error(`Error executing playbook ${playbook.name} for account ${customer.id}:`, error);
            errors++;
          }
        }
        
        processed++;
      } catch (error) {
        console.error(`Error evaluating playbooks for account ${customer.id}:`, error);
        errors++;
      }
    }

    return { processed, triggered, errors };
  }

  // Expansion & Renewal Engine
  async getAccountOpportunities(accountId: string): Promise<{
    expansionOpportunities: { type: string; title: string; description: string; priority: number }[];
    renewalRisk: 'LOW' | 'MEDIUM' | 'HIGH';
    renewalIndicators: {
      slaPerformance: { score: number; summary: string };
      claimsTrend: { direction: string; summary: string };
      marginTrend: { direction: string; summary: string };
      contractRemaining?: { days: number; summary: string };
    };
  }> {
    const customer = await this.getCustomer(accountId);
    if (!customer) {
      throw new Error('Customer not found');
    }

    const expansionOpportunities: { type: string; title: string; description: string; priority: number }[] = [];
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    // 1. Check for volume growth with good margin
    const currentPeriodTrips = await db
      .select({
        count: sql<number>`count(*)`,
        totalRevenue: sql<number>`COALESCE(SUM(CAST(bill_rate AS DECIMAL)), 0)`,
        totalCost: sql<number>`COALESCE(SUM(CAST(pay_rate AS DECIMAL)), 0)`,
      })
      .from(trips)
      .where(and(eq(trips.customerId, accountId), gte(trips.tripDate, thirtyDaysAgo)));

    const priorPeriodTrips = await db
      .select({
        count: sql<number>`count(*)`,
        totalRevenue: sql<number>`COALESCE(SUM(CAST(bill_rate AS DECIMAL)), 0)`,
        totalCost: sql<number>`COALESCE(SUM(CAST(pay_rate AS DECIMAL)), 0)`,
      })
      .from(trips)
      .where(
        and(
          eq(trips.customerId, accountId),
          gte(trips.tripDate, sixtyDaysAgo),
          lt(trips.tripDate, thirtyDaysAgo)
        )
      );

    const currentCount = Number(currentPeriodTrips[0]?.count || 0);
    const priorCount = Number(priorPeriodTrips[0]?.count || 0);
    const currentRevenue = Number(currentPeriodTrips[0]?.totalRevenue || 0);
    const currentCost = Number(currentPeriodTrips[0]?.totalCost || 0);
    const priorRevenue = Number(priorPeriodTrips[0]?.totalRevenue || 0);
    const priorCost = Number(priorPeriodTrips[0]?.totalCost || 0);

    const currentMargin = currentRevenue > 0 ? ((currentRevenue - currentCost) / currentRevenue) * 100 : 0;
    const priorMargin = priorRevenue > 0 ? ((priorRevenue - priorCost) / priorRevenue) * 100 : 0;

    // Volume growth signal: 15%+ growth with 20%+ margin
    if (priorCount > 0 && currentCount > priorCount) {
      const growthPercent = ((currentCount - priorCount) / priorCount) * 100;
      if (growthPercent >= 15 && currentMargin >= 20) {
        expansionOpportunities.push({
          type: 'volume_growth',
          title: 'Volume Growth Opportunity',
          description: `Volume grew ${growthPercent.toFixed(0)}% with ${currentMargin.toFixed(1)}% margin. Consider expanding service capacity or negotiating volume commitments.`,
          priority: 1,
        });
      }
    }

    // 2. Check for services not enabled but used by similar accounts
    const enabledServices = JSON.parse(customer.enabledServices || '[]') as string[];
    const allPossibleServices = ['pickup_delivery', 'parts_delivery', 'dealer_transfers', 'transport', 'shuttle', 'specialty'];
    const missingServices = allPossibleServices.filter(s => !enabledServices.includes(s));

    // Find similar accounts (same customer type or group) and their services
    if (missingServices.length > 0 && (customer.customerType || customer.customerGroup)) {
      const similarAccounts = await db
        .select({ enabledServices: customers.enabledServices })
        .from(customers)
        .where(
          and(
            or(
              customer.customerType ? eq(customers.customerType, customer.customerType) : sql`false`,
              customer.customerGroup ? eq(customers.customerGroup, customer.customerGroup) : sql`false`
            ),
            sql`${customers.id} != ${accountId}`,
            eq(customers.status, 'active')
          )
        )
        .limit(20);

      const serviceUsageCount: Record<string, number> = {};
      for (const account of similarAccounts) {
        const services = JSON.parse(account.enabledServices || '[]') as string[];
        for (const service of services) {
          if (missingServices.includes(service)) {
            serviceUsageCount[service] = (serviceUsageCount[service] || 0) + 1;
          }
        }
      }

      // If a service is used by 30%+ of similar accounts but not by this account
      const threshold = Math.max(2, Math.floor(similarAccounts.length * 0.3));
      for (const [service, count] of Object.entries(serviceUsageCount)) {
        if (count >= threshold) {
          expansionOpportunities.push({
            type: 'service_expansion',
            title: `Enable ${service.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}`,
            description: `${count} similar accounts use this service. Consider enabling to increase service breadth.`,
            priority: 2,
          });
        }
      }
    }

    // 3. Check for parent accounts with unmanaged child locations
    if (!customer.parentAccountId) {
      // This could be a parent account - check for potential child accounts
      const childAccounts = await db
        .select({ id: customers.id, accountOwnerId: customers.accountOwnerId, customerName: customers.customerName })
        .from(customers)
        .where(eq(customers.parentAccountId, accountId));

      const unmanagedChildren = childAccounts.filter(c => !c.accountOwnerId);
      if (unmanagedChildren.length > 0) {
        expansionOpportunities.push({
          type: 'unmanaged_locations',
          title: 'Unmanaged Child Locations',
          description: `${unmanagedChildren.length} child location(s) without assigned account owner. Consider assigning ownership for better coverage.`,
          priority: 3,
        });
      }
    }

    // Calculate renewal readiness indicators
    // SLA Performance
    const slaLatePickups = customer.slaLatePickups || 0;
    const slaMissedCoverage = customer.slaMissedCoverage || 0;
    const slaEscalations = customer.slaEscalations || 0;
    const totalSlaIssues = slaLatePickups + slaMissedCoverage + slaEscalations;
    
    let slaScore = 100;
    if (totalSlaIssues > 10) slaScore = 50;
    else if (totalSlaIssues > 5) slaScore = 70;
    else if (totalSlaIssues > 0) slaScore = 90;

    const slaPerformance = {
      score: slaScore,
      summary: totalSlaIssues === 0 
        ? 'Excellent - No SLA issues' 
        : `${totalSlaIssues} SLA issues (${slaLatePickups} late, ${slaMissedCoverage} missed, ${slaEscalations} escalations)`,
    };

    // Claims Trend
    const claims = await this.getAccidentsByCustomerId(accountId);
    const recentClaims = claims.filter((c: any) => {
      const date = c.incidentDate || c.accidentDate;
      return date && new Date(date) >= ninetyDaysAgo;
    });
    const olderClaims = claims.filter((c: any) => {
      const date = c.incidentDate || c.accidentDate;
      return date && new Date(date) < ninetyDaysAgo;
    });

    let claimsDirection = 'stable';
    if (recentClaims.length > olderClaims.length * 0.5) claimsDirection = 'increasing';
    else if (recentClaims.length < olderClaims.length * 0.3) claimsDirection = 'decreasing';

    const claimsTrend = {
      direction: claimsDirection,
      summary: recentClaims.length === 0 
        ? 'No claims in last 90 days' 
        : `${recentClaims.length} claims in last 90 days (${claimsDirection})`,
    };

    // Margin Trend
    let marginDirection = 'stable';
    if (currentMargin > priorMargin + 5) marginDirection = 'improving';
    else if (currentMargin < priorMargin - 5) marginDirection = 'declining';

    const marginTrend = {
      direction: marginDirection,
      summary: `Current margin: ${currentMargin.toFixed(1)}% (${marginDirection} from ${priorMargin.toFixed(1)}%)`,
    };

    // Calculate overall renewal risk
    let riskScore = 0;
    
    // Health factor
    if (customer.health === 'red') riskScore += 40;
    else if (customer.health === 'yellow') riskScore += 20;
    
    // SLA factor
    if (slaScore < 70) riskScore += 30;
    else if (slaScore < 90) riskScore += 15;
    
    // Claims factor
    if (claimsDirection === 'increasing') riskScore += 15;
    
    // Margin factor
    if (marginDirection === 'declining') riskScore += 15;
    else if (currentMargin < 15) riskScore += 10;

    let renewalRisk: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';
    if (riskScore >= 50) renewalRisk = 'HIGH';
    else if (riskScore >= 25) renewalRisk = 'MEDIUM';

    return {
      expansionOpportunities: expansionOpportunities.sort((a, b) => a.priority - b.priority),
      renewalRisk,
      renewalIndicators: {
        slaPerformance,
        claimsTrend,
        marginTrend,
      },
    };
  }

  // Create expansion/renewal task
  async createOpportunityTask(
    accountId: string,
    taskType: 'expansion' | 'renewal',
    opportunityDetails: string,
    createdByUserId?: string
  ): Promise<AccountActivityEvent> {
    const customer = await this.getCustomer(accountId);
    if (!customer) {
      throw new Error('Customer not found');
    }

    const taskTitle = taskType === 'expansion' 
      ? 'Expansion Opportunity Follow-up'
      : 'Renewal Preparation';

    const summary = taskType === 'expansion'
      ? `[TASK] ${taskTitle}: ${opportunityDetails}`
      : `[TASK] ${taskTitle}: Review renewal readiness and prepare proposal`;

    const dueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days from now

    const event = await this.createAccountActivityEvent({
      accountId,
      category: 'task',
      eventType: `${taskType}_task_created`,
      summary,
      createdByUserId: createdByUserId || null,
      metadata: JSON.stringify({
        taskType,
        opportunityDetails,
        dueDate: dueDate.toISOString(),
        accountName: customer.customerName,
      }),
    });

    return event;
  }

  // ============================================
  // Carrier Metrics (Insurance Underwriting View)
  // ============================================

  async getCarrierMetrics(accountId?: string): Promise<{
    lossExperience: {
      totalIncurred: number;
      totalPaid: number;
      totalReserved: number;
      lossRatio: number;
      claimFrequencyRate: number;
      averageClaimCost: number;
      totalTrips: number;
      claimsPerHundredTrips: number;
    };
    claimsProfile: {
      totalClaims: number;
      openClaims: number;
      closedClaims: number;
      bySeverity: { severity: string; count: number; totalCost: number }[];
      byType: { type: string; count: number; percentage: number }[];
      averageDaysToResolution: number;
    };
    riskIndicators: {
      atFaultPercentage: number;
      repeatClaimants: { driverId: string; driverName: string; claimCount: number }[];
      highRiskLocations: { location: string; claimCount: number }[];
      trendDirection: 'improving' | 'stable' | 'worsening';
      currentPeriodClaims: number;
      priorPeriodClaims: number;
    };
    operationalQuality: {
      slaComplianceRate: number;
      latePickupPercentage: number;
      escalationRate: number;
      coverageGaps: number;
    };
    underwritingSummary: {
      riskScore: number;
      riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
      narrative: string;
      strengths: string[];
      concerns: string[];
    };
    period: { startDate: string; endDate: string };
  }> {
    const now = new Date();
    const twelveMonthsAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Build where conditions based on accountId filter
    const claimConditions = accountId 
      ? and(eq(accidents.customerId, accountId), gte(accidents.incidentDate, twelveMonthsAgo))
      : gte(accidents.incidentDate, twelveMonthsAgo);

    const tripConditions = accountId
      ? and(eq(trips.customerId, accountId), gte(trips.tripDate, twelveMonthsAgo))
      : gte(trips.tripDate, twelveMonthsAgo);

    // Get all claims in period
    const allClaims = await db
      .select()
      .from(accidents)
      .where(claimConditions);

    // Get trip count for frequency calculation
    const tripCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(trips)
      .where(tripConditions);

    const totalTrips = Number(tripCount[0]?.count || 0);

    // Calculate loss experience
    let totalPaid = 0;
    let totalReserved = 0;
    let totalDaysToResolve = 0;
    let resolvedCount = 0;
    let atFaultCount = 0;

    const severityCounts: Record<string, { count: number; totalCost: number }> = {
      'LOW': { count: 0, totalCost: 0 },
      'MEDIUM': { count: 0, totalCost: 0 },
      'HIGH': { count: 0, totalCost: 0 },
      'CRITICAL': { count: 0, totalCost: 0 },
    };

    const typeCounts: Record<string, number> = {};
    const locationCounts: Record<string, number> = {};
    const driverClaimCounts: Record<string, { name: string; count: number }> = {};

    for (const claim of allClaims) {
      const paid = Number(claim.insurancePaid || claim.actualCost || 0);
      const reserved = Number(claim.insuranceReserve || claim.probableCost || 0);
      totalPaid += paid;
      totalReserved += reserved;

      // Severity breakdown
      const severity = (claim.claimSeverity || 'MEDIUM').toUpperCase();
      if (severityCounts[severity]) {
        severityCounts[severity].count++;
        severityCounts[severity].totalCost += paid + reserved;
      }

      // Type breakdown
      const type = claim.claimType || claim.incidentType || 'OTHER';
      typeCounts[type] = (typeCounts[type] || 0) + 1;

      // Location tracking
      if (claim.location) {
        locationCounts[claim.location] = (locationCounts[claim.location] || 0) + 1;
      }

      // At-fault tracking
      if (claim.dodAtFault === 'yes' || claim.atFault === 'yes') {
        atFaultCount++;
      }

      // Days to resolution
      if (claim.claimStatus === 'CLOSED' || claim.claimStatus === 'PAID') {
        const incidentDate = claim.incidentDate || claim.accidentDate;
        if (incidentDate && claim.updatedAt) {
          const days = Math.ceil((new Date(claim.updatedAt).getTime() - new Date(incidentDate).getTime()) / (24 * 60 * 60 * 1000));
          totalDaysToResolve += days;
          resolvedCount++;
        }
      }

      // Driver claim tracking for repeat claimants
      if (claim.driverId) {
        if (!driverClaimCounts[claim.driverId]) {
          driverClaimCounts[claim.driverId] = { name: '', count: 0 };
        }
        driverClaimCounts[claim.driverId].count++;
      }
    }

    const totalIncurred = totalPaid + totalReserved;
    const totalClaims = allClaims.length;
    const openClaims = allClaims.filter(c => !['CLOSED', 'PAID', 'DENIED'].includes(c.claimStatus || '')).length;
    const closedClaims = totalClaims - openClaims;

    // Calculate claim frequency rate (claims per 100 trips)
    const claimsPerHundredTrips = totalTrips > 0 ? (totalClaims / totalTrips) * 100 : 0;
    
    // Get revenue for loss ratio calculation
    const revenueResult = await db
      .select({ total: sql<number>`COALESCE(SUM(CAST(bill_rate AS DECIMAL)), 0)` })
      .from(trips)
      .where(tripConditions);
    const totalRevenue = Number(revenueResult[0]?.total || 0);
    const lossRatio = totalRevenue > 0 ? (totalIncurred / totalRevenue) * 100 : 0;

    // Get repeat claimants (drivers with 2+ claims)
    const repeatClaimants = Object.entries(driverClaimCounts)
      .filter(([_, data]) => data.count >= 2)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10)
      .map(([driverId, data]) => ({
        driverId,
        driverName: data.name || `Driver ${driverId.slice(-6)}`,
        claimCount: data.count,
      }));

    // High risk locations
    const highRiskLocations = Object.entries(locationCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([location, claimCount]) => ({ location, claimCount }));

    // Trend calculation - compare current 6 months to prior 6 months
    const currentPeriodClaims = allClaims.filter(c => {
      const date = c.incidentDate || c.accidentDate;
      return date && new Date(date) >= sixMonthsAgo;
    }).length;

    const priorPeriodClaims = allClaims.filter(c => {
      const date = c.incidentDate || c.accidentDate;
      return date && new Date(date) < sixMonthsAgo;
    }).length;

    let trendDirection: 'improving' | 'stable' | 'worsening' = 'stable';
    if (priorPeriodClaims > 0) {
      const changePercent = ((currentPeriodClaims - priorPeriodClaims) / priorPeriodClaims) * 100;
      if (changePercent > 20) trendDirection = 'worsening';
      else if (changePercent < -20) trendDirection = 'improving';
    }

    // SLA/operational metrics
    let slaMetrics = { latePickups: 0, missedCoverage: 0, escalations: 0 };
    if (accountId) {
      const customer = await this.getCustomer(accountId);
      if (customer) {
        slaMetrics = {
          latePickups: customer.slaLatePickups || 0,
          missedCoverage: customer.slaMissedCoverage || 0,
          escalations: customer.slaEscalations || 0,
        };
      }
    } else {
      // Fleet-wide SLA aggregation
      const slaResult = await db
        .select({
          totalLate: sql<number>`COALESCE(SUM(sla_late_pickups), 0)`,
          totalMissed: sql<number>`COALESCE(SUM(sla_missed_coverage), 0)`,
          totalEscalations: sql<number>`COALESCE(SUM(sla_escalations), 0)`,
        })
        .from(customers)
        .where(eq(customers.status, 'active'));
      slaMetrics = {
        latePickups: Number(slaResult[0]?.totalLate || 0),
        missedCoverage: Number(slaResult[0]?.totalMissed || 0),
        escalations: Number(slaResult[0]?.totalEscalations || 0),
      };
    }

    const totalSlaEvents = slaMetrics.latePickups + slaMetrics.missedCoverage + slaMetrics.escalations;
    const slaComplianceRate = totalTrips > 0 ? Math.max(0, 100 - (totalSlaEvents / totalTrips) * 100) : 100;
    const latePickupPercentage = totalTrips > 0 ? (slaMetrics.latePickups / totalTrips) * 100 : 0;
    const escalationRate = totalTrips > 0 ? (slaMetrics.escalations / totalTrips) * 100 : 0;

    // Calculate underwriting risk score (0-100, higher = worse)
    let riskScore = 0;
    const concerns: string[] = [];
    const strengths: string[] = [];

    // Loss ratio factor (target: <5%)
    if (lossRatio > 10) { riskScore += 30; concerns.push(`High loss ratio (${lossRatio.toFixed(1)}%)`); }
    else if (lossRatio > 5) { riskScore += 15; concerns.push(`Elevated loss ratio (${lossRatio.toFixed(1)}%)`); }
    else if (lossRatio <= 2) { strengths.push(`Low loss ratio (${lossRatio.toFixed(1)}%)`); }

    // Claim frequency factor
    if (claimsPerHundredTrips > 2) { riskScore += 25; concerns.push(`High claim frequency (${claimsPerHundredTrips.toFixed(2)} per 100 trips)`); }
    else if (claimsPerHundredTrips > 1) { riskScore += 10; }
    else if (claimsPerHundredTrips <= 0.5) { strengths.push(`Low claim frequency (${claimsPerHundredTrips.toFixed(2)} per 100 trips)`); }

    // Severity mix factor
    const highSeverityCount = severityCounts['HIGH'].count + severityCounts['CRITICAL'].count;
    const highSeverityPercent = totalClaims > 0 ? (highSeverityCount / totalClaims) * 100 : 0;
    if (highSeverityPercent > 30) { riskScore += 20; concerns.push(`High severity claims (${highSeverityPercent.toFixed(0)}% high/critical)`); }
    else if (highSeverityPercent > 15) { riskScore += 10; }
    else if (highSeverityPercent <= 5) { strengths.push(`Favorable severity mix`); }

    // At-fault percentage
    const atFaultPercent = totalClaims > 0 ? (atFaultCount / totalClaims) * 100 : 0;
    if (atFaultPercent > 60) { riskScore += 15; concerns.push(`High at-fault rate (${atFaultPercent.toFixed(0)}%)`); }
    else if (atFaultPercent <= 30) { strengths.push(`Low at-fault rate (${atFaultPercent.toFixed(0)}%)`); }

    // Trend factor
    if (trendDirection === 'worsening') { riskScore += 10; concerns.push('Claims trend worsening'); }
    else if (trendDirection === 'improving') { riskScore -= 5; strengths.push('Claims trend improving'); }

    // SLA compliance
    if (slaComplianceRate < 90) { riskScore += 10; concerns.push(`SLA compliance below target (${slaComplianceRate.toFixed(1)}%)`); }
    else if (slaComplianceRate >= 98) { strengths.push(`Excellent SLA compliance (${slaComplianceRate.toFixed(1)}%)`); }

    riskScore = Math.max(0, Math.min(100, riskScore));

    let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW';
    if (riskScore >= 70) riskLevel = 'CRITICAL';
    else if (riskScore >= 50) riskLevel = 'HIGH';
    else if (riskScore >= 25) riskLevel = 'MEDIUM';

    // Generate narrative
    const narrative = this.generateCarrierNarrative(
      accountId ? 'account' : 'fleet',
      totalClaims,
      totalIncurred,
      lossRatio,
      claimsPerHundredTrips,
      trendDirection,
      riskLevel,
      strengths,
      concerns
    );

    return {
      lossExperience: {
        totalIncurred,
        totalPaid,
        totalReserved,
        lossRatio,
        claimFrequencyRate: claimsPerHundredTrips,
        averageClaimCost: totalClaims > 0 ? totalIncurred / totalClaims : 0,
        totalTrips,
        claimsPerHundredTrips,
      },
      claimsProfile: {
        totalClaims,
        openClaims,
        closedClaims,
        bySeverity: Object.entries(severityCounts).map(([severity, data]) => ({
          severity,
          count: data.count,
          totalCost: data.totalCost,
        })),
        byType: Object.entries(typeCounts).map(([type, count]) => ({
          type,
          count,
          percentage: totalClaims > 0 ? (count / totalClaims) * 100 : 0,
        })),
        averageDaysToResolution: resolvedCount > 0 ? totalDaysToResolve / resolvedCount : 0,
      },
      riskIndicators: {
        atFaultPercentage: atFaultPercent,
        repeatClaimants,
        highRiskLocations,
        trendDirection,
        currentPeriodClaims,
        priorPeriodClaims,
      },
      operationalQuality: {
        slaComplianceRate,
        latePickupPercentage,
        escalationRate,
        coverageGaps: slaMetrics.missedCoverage,
      },
      underwritingSummary: {
        riskScore,
        riskLevel,
        narrative,
        strengths,
        concerns,
      },
      period: {
        startDate: twelveMonthsAgo.toISOString().split('T')[0],
        endDate: now.toISOString().split('T')[0],
      },
    };
  }

  private generateCarrierNarrative(
    scope: 'fleet' | 'account',
    totalClaims: number,
    totalIncurred: number,
    lossRatio: number,
    frequency: number,
    trend: string,
    riskLevel: string,
    strengths: string[],
    concerns: string[]
  ): string {
    const scopeLabel = scope === 'fleet' ? 'This fleet' : 'This account';
    
    let narrative = `${scopeLabel} recorded ${totalClaims} claims totaling $${totalIncurred.toLocaleString()} in incurred losses over the trailing 12 months. `;
    
    if (totalClaims === 0) {
      return `${scopeLabel} has maintained a clean loss history with zero claims over the trailing 12 months. This represents favorable risk characteristics for underwriting consideration.`;
    }

    narrative += `The loss ratio stands at ${lossRatio.toFixed(1)}% with a claim frequency of ${frequency.toFixed(2)} per 100 trips. `;
    
    if (trend === 'improving') {
      narrative += `Claims trends are improving compared to the prior period, indicating positive risk management trajectory. `;
    } else if (trend === 'worsening') {
      narrative += `Claims trends show deterioration compared to the prior period, warranting closer monitoring. `;
    } else {
      narrative += `Claims trends remain stable compared to the prior period. `;
    }

    if (concerns.length > 0) {
      narrative += `Key concerns include: ${concerns.slice(0, 3).join('; ')}. `;
    }

    if (strengths.length > 0) {
      narrative += `Positive indicators include: ${strengths.slice(0, 3).join('; ')}. `;
    }

    narrative += `Overall risk assessment: ${riskLevel}.`;

    return narrative;
  }

  // Drug Test Notification Methods
  async getDrugTestNotifications(filters?: { status?: string; driverId?: string; claimId?: string }): Promise<DrugTestNotification[]> {
    const results = await db
      .select()
      .from(drugTestNotifications)
      .orderBy(desc(drugTestNotifications.createdAt));
    
    let filtered = results;
    if (filters?.status) {
      filtered = filtered.filter(r => r.status === filters.status);
    }
    if (filters?.driverId) {
      filtered = filtered.filter(r => r.driverId === filters.driverId);
    }
    if (filters?.claimId) {
      filtered = filtered.filter(r => r.claimId === filters.claimId);
    }
    
    return filtered;
  }

  async getDrugTestNotificationById(id: string): Promise<DrugTestNotification | undefined> {
    const [notification] = await db
      .select()
      .from(drugTestNotifications)
      .where(eq(drugTestNotifications.id, id));
    return notification;
  }

  async getDrugTestNotificationsByClaimId(claimId: string): Promise<DrugTestNotification[]> {
    return db
      .select()
      .from(drugTestNotifications)
      .where(eq(drugTestNotifications.claimId, claimId))
      .orderBy(desc(drugTestNotifications.createdAt));
  }

  async createDrugTestNotification(data: InsertDrugTestNotification): Promise<DrugTestNotification> {
    // Calculate default deadline if not provided (48 hours from now)
    const deadline = data.deadlineAt || new Date(Date.now() + 48 * 60 * 60 * 1000);
    
    const [notification] = await db
      .insert(drugTestNotifications)
      .values({
        ...data,
        deadlineAt: deadline,
      })
      .returning();
    return notification;
  }

  async updateDrugTestNotification(id: string, data: Partial<InsertDrugTestNotification>): Promise<DrugTestNotification | undefined> {
    const updateData: any = { ...data, updatedAt: new Date() };
    
    // Auto-set notification sent time when status changes to NOTIFIED
    if (data.status === 'NOTIFIED' && !data.notificationSentAt) {
      updateData.notificationSentAt = new Date();
    }
    // Auto-set completed time when status changes to COMPLETED
    if (data.status === 'COMPLETED' && !data.completedAt) {
      updateData.completedAt = new Date();
    }
    
    const [updated] = await db
      .update(drugTestNotifications)
      .set(updateData)
      .where(eq(drugTestNotifications.id, id))
      .returning();
    return updated;
  }

  async getDrugTestStats(): Promise<{
    total: number;
    pending: number;
    notified: number;
    scheduled: number;
    completed: number;
    cancelled: number;
    expired: number;
    byTriggerType: Record<string, number>;
    testResults: Record<string, number>;
  }> {
    const allNotifications = await db.select().from(drugTestNotifications);
    
    return {
      total: allNotifications.length,
      pending: allNotifications.filter(n => n.status === 'PENDING').length,
      notified: allNotifications.filter(n => n.status === 'NOTIFIED').length,
      scheduled: allNotifications.filter(n => n.status === 'SCHEDULED').length,
      completed: allNotifications.filter(n => n.status === 'COMPLETED').length,
      cancelled: allNotifications.filter(n => n.status === 'CANCELLED').length,
      expired: allNotifications.filter(n => n.status === 'EXPIRED').length,
      byTriggerType: {
        ACCIDENT: allNotifications.filter(n => n.triggerType === 'ACCIDENT').length,
        INJURY: allNotifications.filter(n => n.triggerType === 'INJURY').length,
        DOT_REQUIRED: allNotifications.filter(n => n.triggerType === 'DOT_REQUIRED').length,
        RANDOM: allNotifications.filter(n => n.triggerType === 'RANDOM').length,
        POST_INCIDENT: allNotifications.filter(n => n.triggerType === 'POST_INCIDENT').length,
        REASONABLE_SUSPICION: allNotifications.filter(n => n.triggerType === 'REASONABLE_SUSPICION').length,
      },
      testResults: {
        NEGATIVE: allNotifications.filter(n => n.testResult === 'NEGATIVE').length,
        POSITIVE: allNotifications.filter(n => n.testResult === 'POSITIVE').length,
        INCONCLUSIVE: allNotifications.filter(n => n.testResult === 'INCONCLUSIVE').length,
        REFUSED: allNotifications.filter(n => n.testResult === 'REFUSED').length,
      },
    };
  }

  // Account Decisions
  async getAccountDecisions(accountId: string): Promise<(AccountDecision & { addendums: DecisionAddendum[] })[]> {
    const decisions = await db
      .select()
      .from(accountDecisions)
      .where(eq(accountDecisions.accountId, accountId))
      .orderBy(desc(accountDecisions.createdAt));
    
    // Fetch addendums for each decision
    const decisionsWithAddendums = await Promise.all(
      decisions.map(async (decision) => {
        const addendums = await db
          .select()
          .from(decisionAddendums)
          .where(eq(decisionAddendums.decisionId, decision.id))
          .orderBy(desc(decisionAddendums.createdAt));
        return { ...decision, addendums };
      })
    );
    
    return decisionsWithAddendums;
  }

  async getAccountDecisionById(id: string): Promise<(AccountDecision & { addendums: DecisionAddendum[] }) | undefined> {
    const [decision] = await db
      .select()
      .from(accountDecisions)
      .where(eq(accountDecisions.id, id));
    
    if (!decision) return undefined;
    
    const addendums = await db
      .select()
      .from(decisionAddendums)
      .where(eq(decisionAddendums.decisionId, id))
      .orderBy(desc(decisionAddendums.createdAt));
    
    return { ...decision, addendums };
  }

  async createAccountDecision(data: InsertAccountDecision): Promise<AccountDecision> {
    const [decision] = await db
      .insert(accountDecisions)
      .values(data)
      .returning();
    return decision;
  }

  async createDecisionAddendum(data: InsertDecisionAddendum): Promise<DecisionAddendum> {
    const [addendum] = await db
      .insert(decisionAddendums)
      .values(data)
      .returning();
    return addendum;
  }

  // Account Knowledge Base methods
  async getAccountKnowledge(accountId: string): Promise<AccountKnowledge | undefined> {
    const [knowledge] = await db
      .select()
      .from(accountKnowledge)
      .where(eq(accountKnowledge.accountId, accountId))
      .limit(1);
    return knowledge;
  }

  async getAccountKnowledgeHistory(accountId: string): Promise<AccountKnowledgeHistory[]> {
    return await db
      .select()
      .from(accountKnowledgeHistory)
      .where(eq(accountKnowledgeHistory.accountId, accountId))
      .orderBy(desc(accountKnowledgeHistory.editedAt));
  }

  async upsertAccountKnowledge(
    accountId: string,
    data: Partial<InsertAccountKnowledge>,
    userId: string,
    userName: string
  ): Promise<AccountKnowledge> {
    const existing = await this.getAccountKnowledge(accountId);
    
    if (existing) {
      // Save current state to history before updating
      await db.insert(accountKnowledgeHistory).values({
        knowledgeId: existing.id,
        accountId,
        beforeServicing: existing.beforeServicing,
        whatNotToDo: existing.whatNotToDo,
        knownLandmines: existing.knownLandmines,
        preferredPractices: existing.preferredPractices,
        version: existing.version,
        editedBy: userId,
        editedByName: userName,
      });

      // Update the existing record with new version
      const [updated] = await db
        .update(accountKnowledge)
        .set({
          beforeServicing: data.beforeServicing ?? existing.beforeServicing,
          whatNotToDo: data.whatNotToDo ?? existing.whatNotToDo,
          knownLandmines: data.knownLandmines ?? existing.knownLandmines,
          preferredPractices: data.preferredPractices ?? existing.preferredPractices,
          version: existing.version + 1,
          lastUpdatedBy: userId,
          lastUpdatedByName: userName,
          lastUpdatedAt: new Date(),
        })
        .where(eq(accountKnowledge.id, existing.id))
        .returning();
      return updated;
    } else {
      // Create new knowledge entry
      const [created] = await db
        .insert(accountKnowledge)
        .values({
          accountId,
          beforeServicing: data.beforeServicing || null,
          whatNotToDo: data.whatNotToDo || null,
          knownLandmines: data.knownLandmines || null,
          preferredPractices: data.preferredPractices || null,
          lastUpdatedBy: userId,
          lastUpdatedByName: userName,
        })
        .returning();
      return created;
    }
  }

  // Account Readiness methods
  async getAccountReadiness(accountId: string): Promise<AccountReadiness | null> {
    const [readiness] = await db
      .select()
      .from(accountReadiness)
      .where(eq(accountReadiness.accountId, accountId))
      .limit(1);
    return readiness || null;
  }

  calculateReadinessScore(readinessData: Partial<AccountReadiness>): { score: number; missingItems: string[]; criticalMissing: boolean } {
    let score = 0;
    const missingItems: string[] = [];
    let criticalMissing = false;

    for (const item of READINESS_ITEMS) {
      const key = item.key as keyof AccountReadiness;
      const isComplete = readinessData[key] === true;
      
      if (isComplete) {
        score += item.weight;
      } else {
        missingItems.push(item.label);
        if (item.critical) {
          criticalMissing = true;
        }
      }
    }

    return { score, missingItems, criticalMissing };
  }

  async upsertAccountReadiness(
    accountId: string,
    data: Partial<InsertAccountReadiness>,
    userId: string,
    userName: string
  ): Promise<AccountReadiness> {
    const existing = await this.getAccountReadiness(accountId);
    
    // Calculate the new score based on updated data
    const updatedData = existing ? { ...existing, ...data } : data;
    const { score, missingItems, criticalMissing } = this.calculateReadinessScore(updatedData);
    
    const activationBlocked = criticalMissing;
    const activationBlockedReason = activationBlocked 
      ? `Required items incomplete: ${missingItems.filter(item => 
            READINESS_ITEMS.find(ri => ri.label === item)?.critical
          ).join(', ')}`
      : null;

    if (existing) {
      const [updated] = await db
        .update(accountReadiness)
        .set({
          ...data,
          readinessScore: score,
          activationBlocked,
          activationBlockedReason,
          lastUpdatedBy: userId,
          lastUpdatedByName: userName,
          lastUpdatedAt: new Date(),
        })
        .where(eq(accountReadiness.id, existing.id))
        .returning();
      return updated;
    } else {
      const [created] = await db
        .insert(accountReadiness)
        .values({
          accountId,
          contractSigned: data.contractSigned ?? false,
          pricingApproved: data.pricingApproved ?? false,
          insuranceDocsComplete: data.insuranceDocsComplete ?? false,
          paymentTermsApproved: data.paymentTermsApproved ?? false,
          slaConfigured: data.slaConfigured ?? false,
          driverCapacityConfirmed: data.driverCapacityConfirmed ?? false,
          readinessScore: score,
          activationBlocked,
          activationBlockedReason,
          activationThreshold: data.activationThreshold ?? 80,
          lastUpdatedBy: userId,
          lastUpdatedByName: userName,
        })
        .returning();
      return created;
    }
  }

  async checkActivationAllowed(accountId: string): Promise<{ allowed: boolean; reason: string | null; score: number }> {
    const readiness = await this.getAccountReadiness(accountId);
    if (!readiness) {
      return { allowed: false, reason: 'Readiness checklist not initialized', score: 0 };
    }
    return {
      allowed: !readiness.activationBlocked,
      reason: readiness.activationBlockedReason,
      score: readiness.readinessScore ?? 0,
    };
  }

  // ===== OT RISK FORECASTING METHODS =====

  async getDriverOverrunPattern(driverId: string): Promise<DriverOverrunPattern | null> {
    const [pattern] = await db
      .select()
      .from(driverOverrunPatterns)
      .where(eq(driverOverrunPatterns.driverId, driverId))
      .limit(1);
    return pattern || null;
  }

  async updateDriverOverrunPattern(
    driverId: string, 
    completedShiftData: { scheduledMinutes: number; actualMinutes: number }
  ): Promise<DriverOverrunPattern> {
    const existing = await this.getDriverOverrunPattern(driverId);
    const { scheduledMinutes, actualMinutes } = completedShiftData;
    const overrunMinutes = Math.max(0, actualMinutes - scheduledMinutes);
    const earlyMinutes = Math.max(0, scheduledMinutes - actualMinutes);
    const didOverrun = actualMinutes > scheduledMinutes;

    if (existing) {
      const shiftsCompleted = (existing.shiftsCompleted ?? 0) + 1;
      const shiftsWithOverrun = (existing.shiftsWithOverrun ?? 0) + (didOverrun ? 1 : 0);
      const avgShiftDurationMinutes = (
        (parseFloat(existing.avgShiftDurationMinutes ?? "0") * (shiftsCompleted - 1) + actualMinutes) / shiftsCompleted
      ).toFixed(2);
      const avgOverrunMinutes = shiftsWithOverrun > 0 
        ? ((parseFloat(existing.avgOverrunMinutes ?? "0") * (shiftsWithOverrun - (didOverrun ? 1 : 0)) + overrunMinutes) / shiftsWithOverrun).toFixed(2)
        : "0";
      const avgEarlyMinutes = (shiftsCompleted - shiftsWithOverrun) > 0
        ? ((parseFloat(existing.avgEarlyMinutes ?? "0") * (shiftsCompleted - shiftsWithOverrun - (!didOverrun ? 1 : 0)) + earlyMinutes) / (shiftsCompleted - shiftsWithOverrun)).toFixed(2)
        : "0";
      const overrunRate = (shiftsWithOverrun / shiftsCompleted).toFixed(4);

      const [updated] = await db
        .update(driverOverrunPatterns)
        .set({
          avgShiftDurationMinutes,
          avgOverrunMinutes,
          avgEarlyMinutes,
          overrunRate,
          shiftsCompleted,
          shiftsWithOverrun,
          lastCalculatedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(driverOverrunPatterns.id, existing.id))
        .returning();
      return updated;
    } else {
      const [created] = await db
        .insert(driverOverrunPatterns)
        .values({
          driverId,
          avgShiftDurationMinutes: actualMinutes.toFixed(2),
          avgOverrunMinutes: overrunMinutes.toFixed(2),
          avgEarlyMinutes: earlyMinutes.toFixed(2),
          overrunRate: didOverrun ? "1.0000" : "0.0000",
          shiftsCompleted: 1,
          shiftsWithOverrun: didOverrun ? 1 : 0,
        })
        .returning();
      return created;
    }
  }

  async calculateOTRiskForecast(
    driverId: string, 
    scheduleId: string | null, 
    weekStartDate: Date
  ): Promise<OtRiskForecast> {
    const weekEndDate = new Date(weekStartDate);
    weekEndDate.setDate(weekEndDate.getDate() + 6);
    const weekStartStr = weekStartDate.toISOString().split('T')[0];
    const weekEndStr = weekEndDate.toISOString().split('T')[0];

    // Get OT threshold (default 40 hours)
    const [threshold] = await db
      .select()
      .from(overtimeAlertThresholds)
      .where(eq(overtimeAlertThresholds.isActive, true))
      .limit(1);
    const otThresholdHours = parseFloat(threshold?.weeklyHoursWarning ?? "40");

    // Get scheduled hours for this driver this week
    const scheduledShifts = await db
      .select({
        startTime: schedulingShifts.startTime,
        endTime: schedulingShifts.endTime,
      })
      .from(schedulingAssignments)
      .innerJoin(schedulingShifts, eq(schedulingAssignments.shiftId, schedulingShifts.id))
      .where(
        and(
          eq(schedulingAssignments.driverId, driverId),
          gte(schedulingShifts.startTime, new Date(weekStartStr)),
          lte(schedulingShifts.startTime, new Date(weekEndStr + 'T23:59:59'))
        )
      );

    let scheduledHours = 0;
    for (const shift of scheduledShifts) {
      const durationMs = new Date(shift.endTime).getTime() - new Date(shift.startTime).getTime();
      scheduledHours += durationMs / (1000 * 60 * 60);
    }

    // Get clocked hours so far this week
    const clockedShifts = await db
      .select({
        clockInTime: schedulingAssignments.clockInTime,
        clockOutTime: schedulingAssignments.clockOutTime,
      })
      .from(schedulingAssignments)
      .innerJoin(schedulingShifts, eq(schedulingAssignments.shiftId, schedulingShifts.id))
      .where(
        and(
          eq(schedulingAssignments.driverId, driverId),
          gte(schedulingShifts.startTime, new Date(weekStartStr)),
          lte(schedulingShifts.startTime, new Date(weekEndStr + 'T23:59:59')),
          isNotNull(schedulingAssignments.clockInTime),
          isNotNull(schedulingAssignments.clockOutTime)
        )
      );

    let clockedHours = 0;
    for (const shift of clockedShifts) {
      if (shift.clockInTime && shift.clockOutTime) {
        const durationMs = new Date(shift.clockOutTime).getTime() - new Date(shift.clockInTime).getTime();
        clockedHours += durationMs / (1000 * 60 * 60);
      }
    }

    // Get historical overrun pattern
    const pattern = await this.getDriverOverrunPattern(driverId);
    const overrunRate = parseFloat(pattern?.overrunRate ?? "0");
    const avgOverrunMinutes = parseFloat(pattern?.avgOverrunMinutes ?? "0");

    // Calculate projected hours
    // Remaining scheduled shifts + historical overrun adjustment
    const remainingScheduledHours = scheduledHours - clockedHours;
    const projectedOverrunHours = (remainingScheduledHours * overrunRate * avgOverrunMinutes) / 60;
    const projectedHours = clockedHours + remainingScheduledHours + projectedOverrunHours;

    // Calculate risk factors
    const hoursUntilOT = Math.max(0, otThresholdHours - projectedHours);
    const projectedOTHours = Math.max(0, projectedHours - otThresholdHours);

    // Calculate risk score (0-100)
    let riskScore = 0;
    
    // Factor 1: Scheduled hours relative to OT threshold (max 40 points)
    const scheduledHoursRisk = Math.min(40, (scheduledHours / otThresholdHours) * 40);
    riskScore += scheduledHoursRisk;
    
    // Factor 2: Historical overrun risk (max 30 points)
    const historicalOverrunRisk = Math.min(30, overrunRate * 30);
    riskScore += historicalOverrunRisk;
    
    // Factor 3: Current progress risk (max 30 points)
    const currentProgressRisk = projectedOTHours > 0 
      ? Math.min(30, 15 + (projectedOTHours / 10) * 15) 
      : Math.min(15, (clockedHours / otThresholdHours) * 15);
    riskScore += currentProgressRisk;

    // Determine risk level
    let riskLevel: 'low' | 'medium' | 'high' = 'low';
    if (riskScore >= 70 || projectedOTHours > 5) {
      riskLevel = 'high';
    } else if (riskScore >= 40 || projectedOTHours > 0) {
      riskLevel = 'medium';
    }

    const riskFactors = {
      scheduledHoursRisk: Math.round(scheduledHoursRisk),
      historicalOverrunRisk: Math.round(historicalOverrunRisk),
      currentProgressRisk: Math.round(currentProgressRisk),
      hoursUntilOT: parseFloat(hoursUntilOT.toFixed(2)),
      projectedOTHours: parseFloat(projectedOTHours.toFixed(2)),
    };

    // Upsert the forecast
    const [existingForecast] = await db
      .select()
      .from(otRiskForecasts)
      .where(
        and(
          eq(otRiskForecasts.driverId, driverId),
          eq(otRiskForecasts.weekStartDate, weekStartStr)
        )
      )
      .limit(1);

    if (existingForecast) {
      const [updated] = await db
        .update(otRiskForecasts)
        .set({
          scheduleId,
          scheduledHours: scheduledHours.toFixed(2),
          clockedHours: clockedHours.toFixed(2),
          projectedHours: projectedHours.toFixed(2),
          otThreshold: otThresholdHours.toFixed(2),
          riskLevel,
          riskScore: Math.round(riskScore),
          riskFactors,
          calculatedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(otRiskForecasts.id, existingForecast.id))
        .returning();
      return updated;
    } else {
      const [created] = await db
        .insert(otRiskForecasts)
        .values({
          driverId,
          scheduleId,
          weekStartDate: weekStartStr,
          weekEndDate: weekEndStr,
          scheduledHours: scheduledHours.toFixed(2),
          clockedHours: clockedHours.toFixed(2),
          projectedHours: projectedHours.toFixed(2),
          otThreshold: otThresholdHours.toFixed(2),
          riskLevel,
          riskScore: Math.round(riskScore),
          riskFactors,
        })
        .returning();
      return created;
    }
  }

  async getOTRiskForecastsForSchedule(scheduleId: string): Promise<OtRiskForecast[]> {
    // Get the schedule to determine the week
    const [schedule] = await db
      .select()
      .from(schedulingSchedules)
      .where(eq(schedulingSchedules.id, scheduleId))
      .limit(1);

    if (!schedule) return [];

    // Get all drivers assigned to this schedule
    const driverIds = await db
      .selectDistinct({ driverId: schedulingAssignments.driverId })
      .from(schedulingAssignments)
      .innerJoin(schedulingShifts, eq(schedulingAssignments.shiftId, schedulingShifts.id))
      .where(
        and(
          eq(schedulingShifts.scheduleId, scheduleId),
          isNotNull(schedulingAssignments.driverId)
        )
      );

    // Calculate forecasts for each driver
    const forecasts: OtRiskForecast[] = [];
    const weekStartDate = new Date(schedule.startDate);

    for (const { driverId } of driverIds) {
      if (driverId) {
        const forecast = await this.calculateOTRiskForecast(driverId, scheduleId, weekStartDate);
        forecasts.push(forecast);
      }
    }

    return forecasts;
  }

  async getOTRiskForecastsForWeek(weekStartDate: Date): Promise<OtRiskForecast[]> {
    const weekStartStr = weekStartDate.toISOString().split('T')[0];
    return await db
      .select()
      .from(otRiskForecasts)
      .where(eq(otRiskForecasts.weekStartDate, weekStartStr))
      .orderBy(desc(otRiskForecasts.riskScore));
  }

  async getOTRiskSummary(scheduleId: string): Promise<{ low: number; medium: number; high: number; total: number }> {
    const forecasts = await this.getOTRiskForecastsForSchedule(scheduleId);
    
    const summary = {
      low: 0,
      medium: 0,
      high: 0,
      total: forecasts.length,
    };

    for (const forecast of forecasts) {
      if (forecast.riskLevel === 'high') {
        summary.high++;
      } else if (forecast.riskLevel === 'medium') {
        summary.medium++;
      } else {
        summary.low++;
      }
    }

    return summary;
  }

  // ===== TIERED OT ALERTS & ESCALATION =====

  async getTieredOtAlertConfigs(locationId?: string, accountId?: number): Promise<TieredOtAlertConfig[]> {
    let query = db.select().from(tieredOtAlertConfigs).where(eq(tieredOtAlertConfigs.isActive, true));
    
    const configs = await query;
    
    // Filter by location/account if specified
    return configs.filter(c => {
      if (locationId && c.locationId !== locationId) return false;
      if (accountId && c.accountId !== accountId) return false;
      return true;
    });
  }

  async getTieredOtAlertConfig(id: string): Promise<TieredOtAlertConfig | null> {
    const [config] = await db.select().from(tieredOtAlertConfigs).where(eq(tieredOtAlertConfigs.id, id)).limit(1);
    return config || null;
  }

  async createTieredOtAlertConfig(config: InsertTieredOtAlertConfig): Promise<TieredOtAlertConfig> {
    const [created] = await db.insert(tieredOtAlertConfigs).values(config).returning();
    return created;
  }

  async updateTieredOtAlertConfig(id: string, updates: Partial<InsertTieredOtAlertConfig>): Promise<TieredOtAlertConfig | null> {
    const [updated] = await db
      .update(tieredOtAlertConfigs)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(tieredOtAlertConfigs.id, id))
      .returning();
    return updated || null;
  }

  async deleteTieredOtAlertConfig(id: string): Promise<void> {
    await db.delete(tieredOtAlertConfigs).where(eq(tieredOtAlertConfigs.id, id));
  }

  async processOtAlerts(driverId: string, scheduleId: string | null, hoursWorked: number, weeklyOtThreshold: number): Promise<OtAlertLog[]> {
    const hoursRemaining = weeklyOtThreshold - hoursWorked;
    const alerts: OtAlertLog[] = [];

    // Get applicable config (location-specific or global)
    const configs = await this.getTieredOtAlertConfigs();
    const config = configs[0]; // Use first active config for now

    if (!config) return alerts;

    const threshold1 = parseFloat(config.threshold1HoursRemaining ?? "8");
    const threshold2 = parseFloat(config.threshold2HoursRemaining ?? "4");

    // Check thresholds and create alerts
    if (hoursRemaining <= 0) {
      // OT reached - notify all, flag schedule
      const alertData: InsertOtAlertLog = {
        driverId,
        scheduleId,
        alertType: 'ot_reached',
        severity: 'critical',
        recipientType: 'management',
        hoursWorked: hoursWorked.toFixed(2),
        hoursRemaining: "0",
        otThreshold: weeklyOtThreshold.toFixed(2),
        title: 'Overtime Reached',
        message: `Driver has reached ${hoursWorked.toFixed(1)} hours this week, exceeding the ${weeklyOtThreshold}hr OT threshold.`,
        status: 'pending',
      };
      const [created] = await db.insert(otAlertLogs).values(alertData).returning();
      alerts.push(created);
    } else if (hoursRemaining <= threshold2) {
      // Threshold 2 - notify management
      const alertData: InsertOtAlertLog = {
        driverId,
        scheduleId,
        alertType: 'ot_threshold_2',
        severity: 'warning',
        recipientType: 'management',
        hoursWorked: hoursWorked.toFixed(2),
        hoursRemaining: hoursRemaining.toFixed(2),
        otThreshold: weeklyOtThreshold.toFixed(2),
        title: 'OT Warning: 4 Hours Remaining',
        message: `Driver has ${hoursRemaining.toFixed(1)} hours remaining before reaching OT threshold.`,
        status: 'pending',
      };
      const [created] = await db.insert(otAlertLogs).values(alertData).returning();
      alerts.push(created);
    } else if (hoursRemaining <= threshold1) {
      // Threshold 1 - notify dispatch
      const alertData: InsertOtAlertLog = {
        driverId,
        scheduleId,
        alertType: 'ot_threshold_1',
        severity: 'info',
        recipientType: 'dispatch',
        hoursWorked: hoursWorked.toFixed(2),
        hoursRemaining: hoursRemaining.toFixed(2),
        otThreshold: weeklyOtThreshold.toFixed(2),
        title: 'OT Notice: 8 Hours Remaining',
        message: `Driver has ${hoursRemaining.toFixed(1)} hours remaining before reaching OT threshold.`,
        status: 'pending',
      };
      const [created] = await db.insert(otAlertLogs).values(alertData).returning();
      alerts.push(created);
    }

    return alerts;
  }

  async getOtAlertLogs(filters?: { driverId?: string; scheduleId?: string; status?: string; limit?: number }): Promise<OtAlertLog[]> {
    let conditions = [];
    
    if (filters?.driverId) {
      conditions.push(eq(otAlertLogs.driverId, filters.driverId));
    }
    if (filters?.scheduleId) {
      conditions.push(eq(otAlertLogs.scheduleId, filters.scheduleId));
    }
    if (filters?.status) {
      conditions.push(eq(otAlertLogs.status, filters.status as any));
    }
    
    let query = db.select().from(otAlertLogs);
    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }
    
    const logs = await query.orderBy(desc(otAlertLogs.createdAt)).limit(filters?.limit || 100);
    return logs;
  }

  async acknowledgeOtAlert(id: string, userId: string): Promise<OtAlertLog | null> {
    const [updated] = await db
      .update(otAlertLogs)
      .set({ status: 'acknowledged', acknowledgedAt: new Date(), acknowledgedBy: userId })
      .where(eq(otAlertLogs.id, id))
      .returning();
    return updated || null;
  }

  // ===== BREAK INTELLIGENCE & COMPLIANCE =====

  async getBreakRuleConfigs(locationId?: string, accountId?: number): Promise<BreakRuleConfig[]> {
    const configs = await db.select().from(breakRuleConfigs).where(eq(breakRuleConfigs.isActive, true));
    
    return configs.filter(c => {
      if (locationId && c.locationId !== locationId) return false;
      if (accountId && c.accountId !== accountId) return false;
      return true;
    });
  }

  async getBreakRuleConfig(id: string): Promise<BreakRuleConfig | null> {
    const [config] = await db.select().from(breakRuleConfigs).where(eq(breakRuleConfigs.id, id)).limit(1);
    return config || null;
  }

  async createBreakRuleConfig(config: InsertBreakRuleConfig): Promise<BreakRuleConfig> {
    const [created] = await db.insert(breakRuleConfigs).values(config).returning();
    return created;
  }

  async updateBreakRuleConfig(id: string, updates: Partial<InsertBreakRuleConfig>): Promise<BreakRuleConfig | null> {
    const [updated] = await db
      .update(breakRuleConfigs)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(breakRuleConfigs.id, id))
      .returning();
    return updated || null;
  }

  async deleteBreakRuleConfig(id: string): Promise<void> {
    await db.delete(breakRuleConfigs).where(eq(breakRuleConfigs.id, id));
  }

  async getBreakRecords(filters?: { driverId?: string; shiftId?: string; status?: string }): Promise<BreakRecord[]> {
    let conditions = [];
    
    if (filters?.driverId) {
      conditions.push(eq(breakRecords.driverId, filters.driverId));
    }
    if (filters?.shiftId) {
      conditions.push(eq(breakRecords.shiftId, filters.shiftId));
    }
    if (filters?.status) {
      conditions.push(eq(breakRecords.status, filters.status as any));
    }
    
    let query = db.select().from(breakRecords);
    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }
    
    return await query.orderBy(desc(breakRecords.createdAt));
  }

  async createBreakRecord(record: InsertBreakRecord): Promise<BreakRecord> {
    const [created] = await db.insert(breakRecords).values(record).returning();
    return created;
  }

  async updateBreakRecord(id: string, updates: Partial<InsertBreakRecord>): Promise<BreakRecord | null> {
    const [updated] = await db
      .update(breakRecords)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(breakRecords.id, id))
      .returning();
    return updated || null;
  }

  async processBreakAlerts(driverId: string, shiftId: string, hoursWorked: number): Promise<BreakAlertLog[]> {
    const alerts: BreakAlertLog[] = [];
    
    // Get applicable break rule config
    const configs = await this.getBreakRuleConfigs();
    const config = configs[0];
    
    if (!config) return alerts;
    
    const minHoursForBreak = parseFloat(config.minHoursWorkedForBreak ?? "4");
    const approachingMinutes = config.breakApproachingAlertMinutes ?? 30;
    const overdueMinutes = config.breakOverdueAlertMinutes ?? 15;
    
    // Check if driver is approaching break time
    const minutesWorked = hoursWorked * 60;
    const breakDueAt = minHoursForBreak * 60;
    const minutesUntilBreak = breakDueAt - minutesWorked;
    
    if (minutesUntilBreak <= approachingMinutes && minutesUntilBreak > 0) {
      // Break approaching alert to driver
      const alertData: InsertBreakAlertLog = {
        driverId,
        shiftId,
        alertType: 'break_approaching',
        severity: 'info',
        recipientType: 'driver',
        hoursWorked: hoursWorked.toFixed(2),
        minutesUntilBreakDue: Math.round(minutesUntilBreak),
        title: 'Break Time Approaching',
        message: `Your required break will be due in ${Math.round(minutesUntilBreak)} minutes.`,
        status: 'pending',
      };
      const [created] = await db.insert(breakAlertLogs).values(alertData).returning();
      alerts.push(created);
    } else if (minutesUntilBreak <= -overdueMinutes) {
      // Break overdue alert to driver AND dispatch
      const driverAlert: InsertBreakAlertLog = {
        driverId,
        shiftId,
        alertType: 'break_overdue',
        severity: 'warning',
        recipientType: 'driver',
        hoursWorked: hoursWorked.toFixed(2),
        minutesOverdue: Math.abs(Math.round(minutesUntilBreak)),
        title: 'Break Overdue',
        message: `Your break is ${Math.abs(Math.round(minutesUntilBreak))} minutes overdue. Please take your break as soon as possible.`,
        status: 'pending',
      };
      const [createdDriver] = await db.insert(breakAlertLogs).values(driverAlert).returning();
      alerts.push(createdDriver);
      
      // Notify dispatch
      const dispatchAlert: InsertBreakAlertLog = {
        driverId,
        shiftId,
        alertType: 'break_overdue',
        severity: 'warning',
        recipientType: 'dispatch',
        hoursWorked: hoursWorked.toFixed(2),
        minutesOverdue: Math.abs(Math.round(minutesUntilBreak)),
        title: 'Driver Break Overdue',
        message: `Driver break is ${Math.abs(Math.round(minutesUntilBreak))} minutes overdue.`,
        status: 'pending',
      };
      const [createdDispatch] = await db.insert(breakAlertLogs).values(dispatchAlert).returning();
      alerts.push(createdDispatch);
    }
    
    return alerts;
  }

  async getBreakAlertLogs(filters?: { driverId?: string; status?: string; limit?: number }): Promise<BreakAlertLog[]> {
    let conditions = [];
    
    if (filters?.driverId) {
      conditions.push(eq(breakAlertLogs.driverId, filters.driverId));
    }
    if (filters?.status) {
      conditions.push(eq(breakAlertLogs.status, filters.status as any));
    }
    
    let query = db.select().from(breakAlertLogs);
    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }
    
    return await query.orderBy(desc(breakAlertLogs.createdAt)).limit(filters?.limit || 100);
  }

  async acknowledgeBreakAlert(id: string, userId: string): Promise<BreakAlertLog | null> {
    const [updated] = await db
      .update(breakAlertLogs)
      .set({ status: 'acknowledged', acknowledgedAt: new Date(), acknowledgedBy: userId })
      .where(eq(breakAlertLogs.id, id))
      .returning();
    return updated || null;
  }

  // ===== REBALANCING SUGGESTIONS =====
  
  async getRebalancingSuggestions(filters?: { scheduleId?: string; status?: string; priority?: string; limit?: number }): Promise<RebalancingSuggestion[]> {
    let query = db.select().from(rebalancingSuggestions);
    const conditions: any[] = [];
    
    if (filters?.scheduleId) {
      conditions.push(eq(rebalancingSuggestions.scheduleId, filters.scheduleId));
    }
    if (filters?.status) {
      conditions.push(eq(rebalancingSuggestions.status, filters.status as any));
    }
    if (filters?.priority) {
      conditions.push(eq(rebalancingSuggestions.priority, filters.priority as any));
    }
    
    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }
    
    return await query.orderBy(desc(rebalancingSuggestions.createdAt)).limit(filters?.limit || 50);
  }

  async getRebalancingSuggestion(id: string): Promise<RebalancingSuggestion | null> {
    const [suggestion] = await db
      .select()
      .from(rebalancingSuggestions)
      .where(eq(rebalancingSuggestions.id, id));
    return suggestion || null;
  }

  async createRebalancingSuggestion(suggestion: InsertRebalancingSuggestion): Promise<RebalancingSuggestion> {
    const [created] = await db
      .insert(rebalancingSuggestions)
      .values(suggestion)
      .returning();
    return created;
  }

  async applyRebalancingSuggestion(id: string, userId: string): Promise<RebalancingSuggestion | null> {
    // Get the suggestion first
    const suggestion = await this.getRebalancingSuggestion(id);
    if (!suggestion || suggestion.status !== 'pending') {
      return null;
    }
    
    // Apply the change based on suggestion type
    if (suggestion.suggestionType === 'shift_reassignment' && suggestion.sourceAssignmentId && suggestion.targetDriverId) {
      // Reassign the shift to the target driver
      await db
        .update(schedulingAssignments)
        .set({ 
          driverId: suggestion.targetDriverId,
          updatedAt: new Date()
        })
        .where(eq(schedulingAssignments.id, suggestion.sourceAssignmentId));
    }
    
    // Mark the suggestion as applied
    const [updated] = await db
      .update(rebalancingSuggestions)
      .set({ 
        status: 'applied',
        appliedAt: new Date(),
        appliedByUserId: userId,
        updatedAt: new Date()
      })
      .where(eq(rebalancingSuggestions.id, id))
      .returning();
    
    return updated || null;
  }

  async dismissRebalancingSuggestion(id: string, userId: string, reason?: string): Promise<RebalancingSuggestion | null> {
    const [updated] = await db
      .update(rebalancingSuggestions)
      .set({ 
        status: 'dismissed',
        dismissedAt: new Date(),
        dismissedByUserId: userId,
        dismissalReason: reason || null,
        updatedAt: new Date()
      })
      .where(eq(rebalancingSuggestions.id, id))
      .returning();
    return updated || null;
  }

  async generateRebalancingSuggestions(scheduleId: string): Promise<RebalancingSuggestion[]> {
    const suggestions: RebalancingSuggestion[] = [];
    
    // Get schedule details
    const [schedule] = await db
      .select()
      .from(schedulingSchedules)
      .where(eq(schedulingSchedules.id, scheduleId));
    
    if (!schedule) return suggestions;
    
    // Get all assignments for this schedule with driver info
    const assignments = await db
      .select({
        assignment: schedulingAssignments,
        shift: schedulingShifts,
        driver: drivers
      })
      .from(schedulingAssignments)
      .innerJoin(schedulingShifts, eq(schedulingAssignments.shiftId, schedulingShifts.id))
      .innerJoin(drivers, eq(schedulingAssignments.driverId, drivers.id))
      .where(eq(schedulingShifts.scheduleId, scheduleId));
    
    if (assignments.length === 0) return suggestions;
    
    // Calculate weekly hours per driver
    const driverHours: Map<string, { 
      driverId: string; 
      driverName: string;
      totalHours: number; 
      assignments: typeof assignments;
    }> = new Map();
    
    for (const a of assignments) {
      const shiftStart = new Date(a.shift.startTime);
      const shiftEnd = new Date(a.shift.endTime);
      const hours = (shiftEnd.getTime() - shiftStart.getTime()) / (1000 * 60 * 60);
      
      const existing = driverHours.get(a.driver.id);
      if (existing) {
        existing.totalHours += hours;
        existing.assignments.push(a);
      } else {
        driverHours.set(a.driver.id, {
          driverId: a.driver.id,
          driverName: `${a.driver.firstName} ${a.driver.lastName}`,
          totalHours: hours,
          assignments: [a]
        });
      }
    }
    
    // Find drivers at OT risk (>35 hours) and underutilized drivers (<30 hours)
    const otThreshold = 40;
    const warningThreshold = 35;
    const underutilizedThreshold = 30;
    
    const atRiskDrivers = Array.from(driverHours.values())
      .filter(d => d.totalHours > warningThreshold)
      .sort((a, b) => b.totalHours - a.totalHours);
    
    const underutilizedDrivers = Array.from(driverHours.values())
      .filter(d => d.totalHours < underutilizedThreshold)
      .sort((a, b) => a.totalHours - b.totalHours);
    
    // Generate shift reassignment suggestions
    for (const atRisk of atRiskDrivers) {
      const hoursOverLimit = atRisk.totalHours - otThreshold;
      const hoursToReduce = Math.max(hoursOverLimit, atRisk.totalHours - warningThreshold);
      
      // Find a shift that could be reassigned
      for (const assignment of atRisk.assignments) {
        const shiftStart = new Date(assignment.shift.startTime);
        const shiftEnd = new Date(assignment.shift.endTime);
        const shiftHours = (shiftEnd.getTime() - shiftStart.getTime()) / (1000 * 60 * 60);
        
        // Find underutilized driver who can take this shift
        for (const underutilized of underutilizedDrivers) {
          if (underutilized.driverId === atRisk.driverId) continue;
          
          const newHoursForTarget = underutilized.totalHours + shiftHours;
          if (newHoursForTarget <= otThreshold) {
            // Calculate impact
            const otAvoided = Math.max(0, atRisk.totalHours - otThreshold);
            const laborCostSaved = otAvoided * 15; // Assume $15/hr OT premium
            
            const priority = atRisk.totalHours > otThreshold ? 'high' : 'medium';
            
            const created = await this.createRebalancingSuggestion({
              scheduleId,
              weekStartDate: schedule.startDate,
              suggestionType: 'shift_reassignment',
              priority: priority as any,
              sourceDriverId: atRisk.driverId,
              sourceShiftId: assignment.shift.id,
              sourceAssignmentId: assignment.assignment.id,
              targetDriverId: underutilized.driverId,
              otHoursAvoided: String(otAvoided.toFixed(2)),
              laborCostDelta: String(-laborCostSaved.toFixed(2)),
              utilizationImprovement: String(((shiftHours / 40) * 100).toFixed(1)),
              sourceDriverCurrentHours: String(atRisk.totalHours.toFixed(2)),
              sourceDriverProjectedHours: String((atRisk.totalHours - shiftHours).toFixed(2)),
              sourceDriverOtRisk: atRisk.totalHours > otThreshold ? 'high' : 'medium',
              targetDriverCurrentHours: String(underutilized.totalHours.toFixed(2)),
              targetDriverProjectedHours: String(newHoursForTarget.toFixed(2)),
              targetDriverOtRisk: 'low',
              title: `Reassign shift from ${atRisk.driverName} to ${underutilized.driverName}`,
              rationale: `${atRisk.driverName} is at ${atRisk.totalHours.toFixed(1)} hours this week, risking overtime. ${underutilized.driverName} has capacity at only ${underutilized.totalHours.toFixed(1)} hours.`,
              impactSummary: `Moving this ${shiftHours.toFixed(1)}hr shift would avoid ${otAvoided.toFixed(1)} OT hours and save approximately $${laborCostSaved.toFixed(0)} in OT costs.`,
              confidenceScore: 85,
              expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Expires in 7 days
            });
            
            suggestions.push(created);
            break; // Only generate one suggestion per shift
          }
        }
        
        if (suggestions.length >= 5) break; // Limit suggestions per schedule
      }
      
      if (suggestions.length >= 5) break;
    }
    
    return suggestions;
  }

  async getDriverWeeklySummary(driverId: string, weekStart?: Date): Promise<{
    weekStart: Date;
    weekEnd: Date;
    scheduledHours: number;
    actualHours: number;
    remainingBeforeOT: number;
    otThreshold: number;
    breakCompliance: { eligible: number; taken: number; overdue: number; status: 'compliant' | 'at_risk' | 'violation' };
    upcomingShifts: Array<{ id: string; date: string; startTime: string; endTime: string; location: string | null; hours: number }>;
  }> {
    const now = new Date();
    const startOfWeek = weekStart || new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
    const endOfWeek = new Date(startOfWeek.getTime() + 7 * 24 * 60 * 60 * 1000 - 1);
    const otThreshold = 40;

    // Get scheduled assignments for this week
    const assignments = await db.select()
      .from(schedulingAssignments)
      .innerJoin(schedulingShifts, eq(schedulingAssignments.shiftId, schedulingShifts.id))
      .leftJoin(workLocations, eq(schedulingShifts.locationId, workLocations.id))
      .where(
        and(
          eq(schedulingAssignments.driverId, driverId),
          gte(schedulingShifts.date, startOfWeek.toISOString().split('T')[0]),
          lte(schedulingShifts.date, endOfWeek.toISOString().split('T')[0])
        )
      );

    // Calculate scheduled hours
    let scheduledHours = 0;
    for (const a of assignments) {
      const shift = a.scheduling_shifts;
      if (shift.startTime && shift.endTime) {
        const start = new Date(`2000-01-01T${shift.startTime}`);
        const end = new Date(`2000-01-01T${shift.endTime}`);
        const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
        scheduledHours += hours > 0 ? hours : hours + 24;
      }
    }

    // Get actual hours from time entries
    const timeEntriesData = await db.select()
      .from(timeEntries)
      .where(
        and(
          eq(timeEntries.driverId, driverId),
          gte(timeEntries.startAt, startOfWeek),
          lte(timeEntries.startAt, endOfWeek)
        )
      );

    let actualHours = 0;
    for (const entry of timeEntriesData) {
      if (entry.startAt && entry.endAt) {
        const hours = (new Date(entry.endAt).getTime() - new Date(entry.startAt).getTime()) / (1000 * 60 * 60);
        actualHours += hours;
      } else if (entry.startAt) {
        // Currently clocked in
        const hours = (now.getTime() - new Date(entry.startAt).getTime()) / (1000 * 60 * 60);
        actualHours += hours;
      }
    }

    // Get break alert logs for compliance status
    const breakAlerts = await db.select()
      .from(breakAlertLogs)
      .where(
        and(
          eq(breakAlertLogs.driverId, driverId),
          gte(breakAlertLogs.createdAt, startOfWeek),
          lte(breakAlertLogs.createdAt, endOfWeek)
        )
      );

    const eligibleBreaks = breakAlerts.filter(a => a.alertType === 'approaching' || a.alertType === 'overdue').length;
    const takenBreaks = breakAlerts.filter(a => a.status === 'acknowledged').length;
    const overdueBreaks = breakAlerts.filter(a => a.alertType === 'overdue' && a.status !== 'acknowledged').length;
    
    let breakStatus: 'compliant' | 'at_risk' | 'violation' = 'compliant';
    if (overdueBreaks > 0) {
      breakStatus = 'violation';
    } else if (eligibleBreaks > 0 && takenBreaks < eligibleBreaks / 2) {
      breakStatus = 'at_risk';
    }

    // Get upcoming shifts (next 7 days)
    const upcomingStart = now.toISOString().split('T')[0];
    const upcomingEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    const upcomingAssignments = await db.select()
      .from(schedulingAssignments)
      .innerJoin(schedulingShifts, eq(schedulingAssignments.shiftId, schedulingShifts.id))
      .leftJoin(workLocations, eq(schedulingShifts.locationId, workLocations.id))
      .where(
        and(
          eq(schedulingAssignments.driverId, driverId),
          gte(schedulingShifts.date, upcomingStart),
          lte(schedulingShifts.date, upcomingEnd)
        )
      )
      .orderBy(schedulingShifts.date, schedulingShifts.startTime);

    const upcomingShifts = upcomingAssignments.map(a => {
      const shift = a.scheduling_shifts;
      let hours = 0;
      if (shift.startTime && shift.endTime) {
        const start = new Date(`2000-01-01T${shift.startTime}`);
        const end = new Date(`2000-01-01T${shift.endTime}`);
        hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
        if (hours < 0) hours += 24;
      }
      return {
        id: a.scheduling_assignments.id,
        date: shift.date || '',
        startTime: shift.startTime || '',
        endTime: shift.endTime || '',
        location: a.work_locations?.name || null,
        hours: Math.round(hours * 10) / 10,
      };
    });

    return {
      weekStart: startOfWeek,
      weekEnd: endOfWeek,
      scheduledHours: Math.round(scheduledHours * 10) / 10,
      actualHours: Math.round(actualHours * 10) / 10,
      remainingBeforeOT: Math.max(0, Math.round((otThreshold - actualHours) * 10) / 10),
      otThreshold,
      breakCompliance: {
        eligible: eligibleBreaks,
        taken: takenBreaks,
        overdue: overdueBreaks,
        status: breakStatus,
      },
      upcomingShifts,
    };
  }

  async getRecruitingTasks(filters: { ownerId?: string; status?: string; type?: string; overdue?: boolean; entityType?: string; entityId?: string }): Promise<RecruitingTask[]> {
    const conditions: any[] = [];
    if (filters.ownerId) conditions.push(eq(recruitingTasks.ownerId, filters.ownerId));
    if (filters.status) conditions.push(eq(recruitingTasks.status, filters.status as any));
    if (filters.type) conditions.push(eq(recruitingTasks.type, filters.type as any));
    if (filters.entityType) conditions.push(eq(recruitingTasks.entityType, filters.entityType as any));
    if (filters.entityId) conditions.push(eq(recruitingTasks.entityId, filters.entityId));
    if (filters.overdue) {
      conditions.push(lt(recruitingTasks.dueDate, new Date()));
      conditions.push(or(eq(recruitingTasks.status, "pending"), eq(recruitingTasks.status, "in_progress")));
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    return db.select().from(recruitingTasks).where(where).orderBy(asc(recruitingTasks.dueDate), desc(recruitingTasks.createdAt));
  }

  async getRecruitingTaskById(id: string): Promise<RecruitingTask | undefined> {
    const [task] = await db.select().from(recruitingTasks).where(eq(recruitingTasks.id, id));
    return task;
  }

  async createRecruitingTask(task: InsertRecruitingTask): Promise<RecruitingTask> {
    const [created] = await db.insert(recruitingTasks).values(task).returning();
    return created;
  }

  async updateRecruitingTask(id: string, updates: Partial<{ status: string; completedAt: Date; completedBy: string }>): Promise<RecruitingTask | undefined> {
    const [updated] = await db.update(recruitingTasks).set(updates as any).where(eq(recruitingTasks.id, id)).returning();
    return updated;
  }

  async getRecruitingTaskCountsByEntity(entityType: string, entityIds: string[]): Promise<Record<string, number>> {
    if (entityIds.length === 0) return {};
    const rows = await db.select({
      entityId: recruitingTasks.entityId,
      count: sql<number>`count(*)::int`,
    })
    .from(recruitingTasks)
    .where(and(
      eq(recruitingTasks.entityType, entityType as any),
      inArray(recruitingTasks.entityId, entityIds),
      or(eq(recruitingTasks.status, "pending"), eq(recruitingTasks.status, "in_progress"))
    ))
    .groupBy(recruitingTasks.entityId);
    const result: Record<string, number> = {};
    for (const row of rows) {
      result[row.entityId] = row.count;
    }
    return result;
  }

  async getRecruitingHealthThresholds(): Promise<RecruitingHealthThreshold[]> {
    return db.select().from(recruitingHealthThresholds).orderBy(asc(recruitingHealthThresholds.metricKey));
  }

  async updateRecruitingHealthThreshold(metricKey: string, updates: Partial<InsertRecruitingHealthThreshold>): Promise<RecruitingHealthThreshold | undefined> {
    const [updated] = await db.update(recruitingHealthThresholds)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(recruitingHealthThresholds.metricKey, metricKey))
      .returning();
    return updated;
  }

  async createRecruitingHealthSnapshot(snapshot: InsertRecruitingHealthSnapshot): Promise<RecruitingHealthSnapshot> {
    const [created] = await db.insert(recruitingHealthSnapshots).values(snapshot).returning();
    return created;
  }

  async getRecruitingHealthSnapshots(limit: number = 30): Promise<RecruitingHealthSnapshot[]> {
    return db.select().from(recruitingHealthSnapshots)
      .orderBy(desc(recruitingHealthSnapshots.snapshotDate))
      .limit(limit);
  }

  async getRecruitingHealthSnapshotByDate(date: string): Promise<RecruitingHealthSnapshot | undefined> {
    const [snapshot] = await db.select().from(recruitingHealthSnapshots)
      .where(eq(recruitingHealthSnapshots.snapshotDate, date));
    return snapshot;
  }

  // ==========================================
  // SCHEDULING SLA TRACKING
  // ==========================================

  async getSchedulingSlaDefinitions(entityId?: string): Promise<SchedulingSlaDefinition[]> {
    const conditions: any[] = [];
    if (entityId) conditions.push(eq(schedulingSlaDefinitions.entityId, entityId));
    return conditions.length > 0
      ? db.select().from(schedulingSlaDefinitions).where(and(...conditions)).orderBy(schedulingSlaDefinitions.name)
      : db.select().from(schedulingSlaDefinitions).orderBy(schedulingSlaDefinitions.name);
  }

  async getSchedulingSlaDefinition(id: string): Promise<SchedulingSlaDefinition | undefined> {
    const [def] = await db.select().from(schedulingSlaDefinitions).where(eq(schedulingSlaDefinitions.id, id));
    return def;
  }

  async createSchedulingSlaDefinition(def: InsertSchedulingSlaDefinition): Promise<SchedulingSlaDefinition> {
    const [created] = await db.insert(schedulingSlaDefinitions).values(def).returning();
    return created;
  }

  async updateSchedulingSlaDefinition(id: string, updates: Partial<InsertSchedulingSlaDefinition>): Promise<SchedulingSlaDefinition | undefined> {
    const [updated] = await db.update(schedulingSlaDefinitions)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(schedulingSlaDefinitions.id, id))
      .returning();
    return updated;
  }

  async deleteSchedulingSlaDefinition(id: string): Promise<void> {
    await db.delete(schedulingSlaDefinitions).where(eq(schedulingSlaDefinitions.id, id));
  }

  async getSchedulingSlaEvents(filters?: { slaDefinitionId?: string; startDate?: string; endDate?: string; status?: string; locationId?: string }): Promise<SchedulingSlaEvent[]> {
    const conditions: any[] = [];
    if (filters?.slaDefinitionId) conditions.push(eq(schedulingSlaEvents.slaDefinitionId, filters.slaDefinitionId));
    if (filters?.status) conditions.push(eq(schedulingSlaEvents.status, filters.status));
    if (filters?.locationId) conditions.push(eq(schedulingSlaEvents.locationId, filters.locationId));
    if (filters?.startDate) conditions.push(gte(schedulingSlaEvents.eventDate, filters.startDate));
    if (filters?.endDate) conditions.push(lte(schedulingSlaEvents.eventDate, filters.endDate));
    return conditions.length > 0
      ? db.select().from(schedulingSlaEvents).where(and(...conditions)).orderBy(desc(schedulingSlaEvents.createdAt)).limit(500)
      : db.select().from(schedulingSlaEvents).orderBy(desc(schedulingSlaEvents.createdAt)).limit(500);
  }

  async createSchedulingSlaEvent(event: InsertSchedulingSlaEvent): Promise<SchedulingSlaEvent> {
    const [created] = await db.insert(schedulingSlaEvents).values(event).returning();
    return created;
  }

  async updateSchedulingSlaEvent(id: string, updates: Partial<InsertSchedulingSlaEvent>): Promise<SchedulingSlaEvent | undefined> {
    const [updated] = await db.update(schedulingSlaEvents)
      .set(updates)
      .where(eq(schedulingSlaEvents.id, id))
      .returning();
    return updated;
  }

  async assessSchedulingSlaRisk(shiftIds: string[]): Promise<any[]> {
    if (!shiftIds.length) return [];
    
    const activeDefs = await db.select().from(schedulingSlaDefinitions)
      .where(eq(schedulingSlaDefinitions.isActive, true));
    
    if (!activeDefs.length) return [];

    const shiftsData = await db.select().from(shifts)
      .where(inArray(shifts.id, shiftIds));

    const assignmentsData = await db.select().from(shiftAssignments)
      .where(inArray(shiftAssignments.shiftId, shiftIds));

    const risks: any[] = [];

    for (const shift of shiftsData) {
      const shiftAssigns = assignmentsData.filter(a => a.shiftId === shift.id && a.status !== 'declined' && a.status !== 'cancelled');
      
      for (const def of activeDefs) {
        if (def.locationId && def.locationId !== shift.locationId) continue;

        if (def.metricType === 'coverage_completeness') {
          const required = shift.requiredStaff || 1;
          const assigned = shiftAssigns.filter(a => a.assignmentRole === 'primary').length;
          const coveragePct = required > 0 ? (assigned / required) * 100 : 100;
          const target = parseFloat(def.targetValue);
          const warning = def.warningThreshold ? parseFloat(def.warningThreshold) : target;

          if (coveragePct < target) {
            risks.push({
              shiftId: shift.id,
              slaDefinitionId: def.id,
              slaName: def.name,
              metricType: def.metricType,
              status: coveragePct < warning ? 'breached' : 'warning',
              targetValue: target,
              actualValue: coveragePct,
              message: `Coverage ${coveragePct.toFixed(0)}% (need ${assigned}/${required} staff) — target ${target}%`,
              shiftDate: shift.date,
              shiftStart: shift.startTime,
            });
          }
        }

        if (def.metricType === 'shift_start_timeliness') {
          const unconfirmed = shiftAssigns.filter(a => a.status === 'assigned' && !a.confirmedAt);
          if (unconfirmed.length > 0) {
            const shiftStart = new Date(shift.startTime);
            const hoursUntil = (shiftStart.getTime() - Date.now()) / (1000 * 60 * 60);
            if (hoursUntil < 4 && hoursUntil > 0) {
              risks.push({
                shiftId: shift.id,
                slaDefinitionId: def.id,
                slaName: def.name,
                metricType: def.metricType,
                status: hoursUntil < 1 ? 'breached' : 'warning',
                targetValue: parseFloat(def.targetValue),
                actualValue: null,
                message: `${unconfirmed.length} unconfirmed assignment(s) — shift starts in ${hoursUntil.toFixed(1)}h`,
                shiftDate: shift.date,
                shiftStart: shift.startTime,
              });
            }
          }
        }
      }
    }

    return risks;
  }

  // Cross-Location Mobility Controls
  async getCrossLocationMobilityConfigs(entityId?: string): Promise<CrossLocationMobilityConfig[]> {
    if (entityId) {
      return await db.select().from(crossLocationMobilityConfigs)
        .where(eq(crossLocationMobilityConfigs.entityId, entityId))
        .orderBy(desc(crossLocationMobilityConfigs.createdAt));
    }
    return await db.select().from(crossLocationMobilityConfigs)
      .orderBy(desc(crossLocationMobilityConfigs.createdAt));
  }

  async getCrossLocationMobilityConfig(id: string): Promise<CrossLocationMobilityConfig | undefined> {
    const [config] = await db.select().from(crossLocationMobilityConfigs)
      .where(eq(crossLocationMobilityConfigs.id, id));
    return config;
  }

  async createCrossLocationMobilityConfig(config: InsertCrossLocationMobilityConfig): Promise<CrossLocationMobilityConfig> {
    const [created] = await db.insert(crossLocationMobilityConfigs).values(config).returning();
    return created;
  }

  async updateCrossLocationMobilityConfig(id: string, updates: Partial<InsertCrossLocationMobilityConfig>): Promise<CrossLocationMobilityConfig | undefined> {
    const [updated] = await db.update(crossLocationMobilityConfigs)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(crossLocationMobilityConfigs.id, id))
      .returning();
    return updated;
  }

  async deleteCrossLocationMobilityConfig(id: string): Promise<void> {
    await db.delete(crossLocationMobilityConfigs).where(eq(crossLocationMobilityConfigs.id, id));
  }

  async getCrossLocationTravelLogs(filters?: { driverId?: string; userId?: string; startDate?: string; endDate?: string; riskLevel?: string }): Promise<CrossLocationTravelLog[]> {
    const conditions: any[] = [];
    if (filters?.driverId) conditions.push(eq(crossLocationTravelLogs.driverId, filters.driverId));
    if (filters?.userId) conditions.push(eq(crossLocationTravelLogs.userId, filters.userId));
    if (filters?.riskLevel) conditions.push(eq(crossLocationTravelLogs.riskLevel, filters.riskLevel));
    if (filters?.startDate) conditions.push(gte(crossLocationTravelLogs.travelDate, filters.startDate));
    if (filters?.endDate) conditions.push(lte(crossLocationTravelLogs.travelDate, filters.endDate));

    return conditions.length > 0
      ? db.select().from(crossLocationTravelLogs).where(and(...conditions)).orderBy(desc(crossLocationTravelLogs.createdAt)).limit(500)
      : db.select().from(crossLocationTravelLogs).orderBy(desc(crossLocationTravelLogs.createdAt)).limit(500);
  }

  async createCrossLocationTravelLog(log: InsertCrossLocationTravelLog): Promise<CrossLocationTravelLog> {
    const [created] = await db.insert(crossLocationTravelLogs).values(log).returning();
    return created;
  }

  async assessCrossLocationMobilityRisk(driverId: string, targetLocationId: string, targetShiftDate: string, targetShiftStartTime: string): Promise<any> {
    const warnings: any[] = [];

    const activeConfigs = await db.select().from(crossLocationMobilityConfigs)
      .where(eq(crossLocationMobilityConfigs.isActive, true));
    const config = activeConfigs[0];

    if (!config) {
      return { warnings: [], riskLevel: 'none', message: 'No mobility config active' };
    }

    const targetLoc = await db.select().from(workLocations).where(eq(workLocations.id, targetLocationId));
    if (!targetLoc.length) {
      return { warnings: [], riskLevel: 'none', message: 'Target location not found' };
    }

    const dayShifts = await db.select({
      shift: shifts,
      location: workLocations,
    }).from(shiftAssignments)
      .innerJoin(shifts, eq(shiftAssignments.shiftId, shifts.id))
      .leftJoin(workLocations, eq(shifts.locationId, workLocations.id))
      .where(and(
        or(
          eq(shiftAssignments.driverId, driverId),
          eq(shiftAssignments.userId, driverId)
        ),
        eq(shifts.date, targetShiftDate),
        or(
          eq(shiftAssignments.status, 'assigned'),
          eq(shiftAssignments.status, 'confirmed')
        )
      ));

    const weekStart = new Date(targetShiftDate);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    const weekShifts = await db.select({
      shift: shifts,
      location: workLocations,
    }).from(shiftAssignments)
      .innerJoin(shifts, eq(shiftAssignments.shiftId, shifts.id))
      .leftJoin(workLocations, eq(shifts.locationId, workLocations.id))
      .where(and(
        or(
          eq(shiftAssignments.driverId, driverId),
          eq(shiftAssignments.userId, driverId)
        ),
        gte(shifts.date, weekStart.toISOString().split('T')[0]),
        lte(shifts.date, weekEnd.toISOString().split('T')[0]),
        or(
          eq(shiftAssignments.status, 'assigned'),
          eq(shiftAssignments.status, 'confirmed')
        )
      ));

    const crossLocationDayCount = dayShifts.filter(s =>
      s.location && s.location.id !== targetLocationId
    ).length;

    const crossLocationWeekCount = weekShifts.filter(s =>
      s.location && s.location.id !== targetLocationId
    ).length;

    const maxDaily = config.maxCrossLocationShiftsPerDay || 1;
    const maxWeekly = config.maxCrossLocationShiftsPerWeek || 3;

    if (crossLocationDayCount + 1 > maxDaily) {
      warnings.push({
        type: 'excessive_daily_cross_location',
        severity: 'high',
        message: `Driver would exceed daily cross-location limit (${crossLocationDayCount + 1}/${maxDaily} shifts)`,
        current: crossLocationDayCount,
        limit: maxDaily,
      });
    }

    if (crossLocationWeekCount + 1 > maxWeekly) {
      warnings.push({
        type: 'excessive_weekly_cross_location',
        severity: 'high',
        message: `Driver would exceed weekly cross-location limit (${crossLocationWeekCount + 1}/${maxWeekly} shifts)`,
        current: crossLocationWeekCount,
        limit: maxWeekly,
      });
    }

    for (const ds of dayShifts) {
      if (!ds.location || ds.location.id === targetLocationId) continue;
      if (!ds.location.latitude || !ds.location.longitude || !targetLoc[0].latitude || !targetLoc[0].longitude) continue;

      const dist = haversineDistance(
        parseFloat(ds.location.latitude), parseFloat(ds.location.longitude),
        parseFloat(targetLoc[0].latitude!), parseFloat(targetLoc[0].longitude!)
      );

      const estTravelMinutes = Math.round(dist / 40 * 60); // ~40mph avg

      const maxDist = parseFloat(config.maxTravelDistanceMiles || '50');
      const warnDist = parseFloat(config.warningDistanceMiles || '30');
      const maxTime = config.maxTravelTimeMinutes || 60;
      const warnTime = config.warningTravelTimeMinutes || 45;

      if (dist > maxDist) {
        warnings.push({
          type: 'excessive_travel_distance',
          severity: 'high',
          message: `Travel distance ${dist.toFixed(1)} mi exceeds max ${maxDist} mi (from ${ds.location.name})`,
          distance: dist,
          limit: maxDist,
          fromLocation: ds.location.name,
        });
      } else if (dist > warnDist) {
        warnings.push({
          type: 'travel_distance_warning',
          severity: 'warning',
          message: `Travel distance ${dist.toFixed(1)} mi approaching limit of ${maxDist} mi (from ${ds.location.name})`,
          distance: dist,
          limit: maxDist,
          fromLocation: ds.location.name,
        });
      }

      if (estTravelMinutes > maxTime) {
        warnings.push({
          type: 'excessive_travel_time',
          severity: 'high',
          message: `Est. travel time ${estTravelMinutes} min exceeds max ${maxTime} min (from ${ds.location.name})`,
          travelTime: estTravelMinutes,
          limit: maxTime,
          fromLocation: ds.location.name,
        });
      } else if (estTravelMinutes > warnTime) {
        warnings.push({
          type: 'travel_time_warning',
          severity: 'warning',
          message: `Est. travel time ${estTravelMinutes} min approaching limit of ${maxTime} min (from ${ds.location.name})`,
          travelTime: estTravelMinutes,
          limit: maxTime,
          fromLocation: ds.location.name,
        });
      }

      const shiftEnd = new Date(ds.shift.endTime);
      const targetStart = new Date(targetShiftStartTime);
      const restMinutes = Math.round((targetStart.getTime() - shiftEnd.getTime()) / (1000 * 60));
      const minRest = config.minRestBetweenCrossLocationMinutes || 480;

      if (restMinutes > 0 && restMinutes < minRest) {
        warnings.push({
          type: 'insufficient_rest',
          severity: restMinutes < minRest / 2 ? 'high' : 'warning',
          message: `Only ${restMinutes} min rest between shifts (min ${minRest} min required, from ${ds.location.name})`,
          restMinutes,
          limit: minRest,
          fromLocation: ds.location.name,
        });
      }
    }

    const riskLevel = warnings.some(w => w.severity === 'high') ? 'high'
      : warnings.some(w => w.severity === 'warning') ? 'warning'
      : 'none';

    return {
      warnings,
      riskLevel,
      driverId,
      targetLocationId,
      targetLocationName: targetLoc[0].name,
      configName: config.name,
      assessedAt: new Date().toISOString(),
    };
  }

  async createSchedulingJustification(justification: InsertSchedulingJustification): Promise<SchedulingJustification> {
    const [created] = await db.insert(schedulingJustifications).values(justification).returning();
    return created;
  }

  async getSchedulingJustifications(filters?: { category?: string; scheduleId?: string; driverId?: string; createdById?: string; search?: string; startDate?: string; endDate?: string }): Promise<SchedulingJustification[]> {
    const conditions: any[] = [];
    if (filters?.category) conditions.push(eq(schedulingJustifications.category, filters.category as any));
    if (filters?.scheduleId) conditions.push(eq(schedulingJustifications.scheduleId, filters.scheduleId));
    if (filters?.driverId) conditions.push(eq(schedulingJustifications.driverId, filters.driverId));
    if (filters?.createdById) conditions.push(eq(schedulingJustifications.createdById, filters.createdById));
    if (filters?.search) conditions.push(ilike(schedulingJustifications.narrative, `%${filters.search}%`));
    if (filters?.startDate) conditions.push(gte(schedulingJustifications.createdAt, new Date(filters.startDate)));
    if (filters?.endDate) conditions.push(lte(schedulingJustifications.createdAt, new Date(filters.endDate)));

    return conditions.length > 0
      ? db.select().from(schedulingJustifications).where(and(...conditions)).orderBy(desc(schedulingJustifications.createdAt)).limit(500)
      : db.select().from(schedulingJustifications).orderBy(desc(schedulingJustifications.createdAt)).limit(500);
  }

  async getSchedulingJustification(id: string): Promise<SchedulingJustification | undefined> {
    const [justification] = await db.select().from(schedulingJustifications).where(eq(schedulingJustifications.id, id));
    return justification;
  }

// ─── Account Notes ───────────────────────────────────────────────────────────
  async getAccountNotes(customerId: string, filters?: { noteType?: string; submittedByUserId?: string; startDate?: string; endDate?: string }): Promise<AccountNote[]> {
    const conditions: any[] = [
      eq(accountNotes.customerId, customerId),
      isNull(accountNotes.deletedAt),
    ];
    if (filters?.noteType) conditions.push(eq(accountNotes.noteType, filters.noteType));
    if (filters?.submittedByUserId) conditions.push(eq(accountNotes.submittedByUserId, filters.submittedByUserId));
    if (filters?.startDate) conditions.push(gte(accountNotes.noteDate, filters.startDate));
    if (filters?.endDate) conditions.push(lte(accountNotes.noteDate, filters.endDate));
    return db.select().from(accountNotes).where(and(...conditions)).orderBy(desc(accountNotes.noteDate), desc(accountNotes.createdAt));
  }

  async getAccountNote(noteId: string): Promise<AccountNote | undefined> {
    const [note] = await db.select().from(accountNotes).where(eq(accountNotes.id, noteId));
    return note;
  }

  async createAccountNote(data: InsertAccountNote): Promise<AccountNote> {
    const [note] = await db.insert(accountNotes).values(data).returning();
    return note;
  }

  async updateAccountNote(noteId: string, editedByUserId: string, updates: { content?: string; noteType?: string; noteDate?: string; tripId?: string | null; zendeskId?: string | null }, reason: string): Promise<AccountNote | undefined> {
    const existing = await this.getAccountNote(noteId);
    if (!existing || existing.deletedAt) return undefined;
    const [updated] = await db.update(accountNotes)
      .set({
        ...(updates.content   !== undefined ? { content: updates.content }     : {}),
        ...(updates.noteType  !== undefined ? { noteType: updates.noteType }   : {}),
        ...(updates.noteDate  !== undefined ? { noteDate: updates.noteDate }   : {}),
        ...(updates.tripId    !== undefined ? { tripId: updates.tripId }       : {}),
        ...(updates.zendeskId !== undefined ? { zendeskId: updates.zendeskId } : {}),
        editedAt:       new Date(),
        editedBy:       editedByUserId,
        editReason:     reason,
        originalContent: existing.originalContent ?? existing.content,
        updatedAt:      new Date(),
      })
      .where(and(eq(accountNotes.id, noteId), isNull(accountNotes.deletedAt)))
      .returning();
    return updated;
  }

  async softDeleteAccountNote(noteId: string, deletedByUserId: string, reason: string): Promise<AccountNote | undefined> {
    const [updated] = await db.update(accountNotes)
      .set({ deletedAt: new Date(), deletedBy: deletedByUserId, deletionReason: reason, updatedAt: new Date() })
      .where(and(eq(accountNotes.id, noteId), isNull(accountNotes.deletedAt)))
      .returning();
    return updated;
  }

  async getTripsForExport(filters: {
    moveNumber?: string;
    driver?: string;
    customer?: string;
    startDate?: string;
    endDate?: string;
    importBatchId?: string;
    status?: string;
    moveType?: string;
    sourceSystem?: string;
    sortBy?: string;
    sortDir?: string;
    limit?: number;
  }): Promise<{ rows: any[]; truncated: boolean; totalMatched: number; cap: number }> {
    // Hard cap: never load more than this many rows into memory for a single export.
    const EXPORT_CAP = filters.limit ?? 5000;

    const conditions: any[] = [];
    if (filters.moveNumber) conditions.push(ilike(trips.moveNumber, `%${filters.moveNumber}%`));
    if (filters.status) conditions.push(eq(trips.status, filters.status));
    if (filters.moveType) conditions.push(ilike(trips.moveType, `%${filters.moveType}%`));
    if (filters.sourceSystem) conditions.push(eq(trips.sourceSystem, filters.sourceSystem));
    if (filters.importBatchId) conditions.push(eq(trips.importBatchId, filters.importBatchId));
    if (filters.startDate) {
      const startTs = new Date(filters.startDate);
      startTs.setHours(0, 0, 0, 0);
      conditions.push(gte(trips.tripDate, startTs));
    }
    if (filters.endDate) {
      const endTs = new Date(filters.endDate);
      endTs.setHours(23, 59, 59, 999);
      conditions.push(lte(trips.tripDate, endTs));
    }
    if (filters.driver) {
      conditions.push(
        or(
          ilike(users.firstName, `%${filters.driver}%`),
          ilike(users.lastName, `%${filters.driver}%`),
          sql`lower(${users.firstName} || ' ' || ${users.lastName}) like lower(${'%' + filters.driver + '%'})`
        )!
      );
    }
    if (filters.customer) conditions.push(ilike(customers.customerName, `%${filters.customer}%`));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const drCounts = db
      .select({
        linkedTripId: driverReturnEntries.linkedTripId,
        drCount: sql<number>`cast(count(*) as int)`.as('dr_count'),
      })
      .from(driverReturnEntries)
      .where(isNotNull(driverReturnEntries.linkedTripId))
      .groupBy(driverReturnEntries.linkedTripId)
      .as('dr_counts');

    const dir = filters.sortDir === 'asc' ? asc : desc;
    let orderExpr: any;
    switch (filters.sortBy) {
      case 'moveNumber': orderExpr = dir(trips.moveNumber); break;
      case 'status': orderExpr = dir(trips.status); break;
      case 'moveType': orderExpr = dir(trips.moveType); break;
      case 'customerName': orderExpr = dir(customers.customerName); break;
      case 'driverName': orderExpr = dir(users.lastName); break;
      default: orderExpr = dir(trips.tripDate); break;
    }

    // Fetch cap + 1 rows so we can detect truncation without a separate COUNT query.
    const dataQuery = db
      .select({
        trip: trips,
        driverFirstName: users.firstName,
        driverLastName: users.lastName,
        customerName: customers.customerName,
        drCount: drCounts.drCount,
      })
      .from(trips)
      .leftJoin(drivers, eq(trips.driverId, drivers.id))
      .leftJoin(users, eq(drivers.userId, users.id))
      .leftJoin(customers, eq(trips.customerId, customers.id))
      .leftJoin(drCounts, eq(trips.id, drCounts.linkedTripId));

    const rawRows = whereClause
      ? await dataQuery.where(whereClause).orderBy(orderExpr).limit(EXPORT_CAP + 1)
      : await dataQuery.orderBy(orderExpr).limit(EXPORT_CAP + 1);

    const truncated = rawRows.length > EXPORT_CAP;
    const sliced = truncated ? rawRows.slice(0, EXPORT_CAP) : rawRows;

    const rows = sliced.map((r) => ({
      ...r.trip,
      driverName: [r.driverFirstName, r.driverLastName].filter(Boolean).join(' ') || null,
      customerName: r.customerName || null,
      driverReturnCount: r.drCount ?? 0,
    }));

    return {
      rows,
      truncated,
      totalMatched: truncated ? EXPORT_CAP + 1 : rows.length, // "at least N" when truncated
      cap: EXPORT_CAP,
    };
  }
}


function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3959; // Earth radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export const storage = new DatabaseStorage();
