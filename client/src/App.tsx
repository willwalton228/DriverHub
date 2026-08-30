import { useState, useEffect, lazy, Suspense } from "react";
import { PageTitleProvider } from "@/contexts/PageTitleContext";
import { Switch, Route, Redirect, useLocation, useSearch, Link } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { useSchedulingReportSessionLifecycle } from "@/components/scheduling/SchedulingReportSession";
import { ThemeToggle } from "@/components/ThemeToggle";
import { UserMenu } from "@/components/UserMenu";
import { HeaderLogo } from "@/components/Logo";
import { NotificationBell } from "@/components/NotificationBell";
import { RecruitingApprovalAlert } from "@/components/RecruitingApprovalAlert";
import { AMRDeclineAlert } from "@/components/AMRDeclineAlert";
import { useAuth } from "@/hooks/useAuth";
import { SubmitTicketDrawer } from "@/components/SubmitTicketDrawer";
import { Button } from "@/components/ui/button";
import { Bug, Settings } from "lucide-react";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/Landing";
import AccessPending from "@/pages/AccessPending";
import DriverHome from "@/pages/driver/Home";
import Profile from "@/pages/driver/Profile";
import PayData from "@/pages/driver/PayData";
import TripHistory from "@/pages/driver/TripHistory";
import Documents from "@/pages/driver/Documents";
import DriverExpenses from "@/pages/driver/Expenses";
import MyReferrals from "@/pages/driver/MyReferrals";
import ReferralLanding from "@/pages/ReferralLanding";
import TimeClock from "@/pages/driver/TimeClock";
import MyStatus from "@/pages/driver/MyStatus";
import DriverTasks from "@/pages/driver/Tasks";
import DriverSchedule from "@/pages/driver/Schedule";
import CorporateDashboard from "@/pages/corporate/Dashboard";
import DriversDashboard from "@/pages/corporate/DriversDashboard";
import CustomersDashboard from "@/pages/corporate/CustomersDashboard";
import ClaimsDashboard from "@/pages/corporate/ClaimsDashboard";
import ClaimsControls from "@/pages/corporate/ClaimsControls";
import ClaimsQueue from "@/pages/corporate/ClaimsQueue";
import ClaimsReportLibrary from "@/pages/corporate/ClaimsReportLibrary";
import ClaimsLossAccrualReport from "@/pages/corporate/ClaimsLossAccrualReport";
import ClaimsAnalysisReport from "@/pages/corporate/ClaimsAnalysisReport";
import AccountBillingRatesView from "@/pages/corporate/AccountBillingRatesView";
import MovesDashboard from "@/pages/corporate/MovesDashboard";
import Drivers from "@/pages/corporate/Drivers";
const DriverDetail = lazy(() => import("@/pages/corporate/DriverDetail"));
const DriverDashboard = lazy(() => import("@/pages/corporate/DriverDashboard"));
import CorporateProfile from "@/pages/corporate/Profile";
import AdminUserManagement from "@/pages/AdminUserManagement";
import PlatformAdminConsole from "@/pages/PlatformAdminConsole";
import Customers from "@/pages/corporate/Customers";
const AccountDetail = lazy(() => import("@/pages/corporate/AccountDetail"));
import StandardDocuments from "@/pages/corporate/StandardDocuments";
import InsuranceCards from "@/pages/corporate/InsuranceCards";
import LicenseReviewQueue from "@/pages/corporate/LicenseReviewQueue";
import LicenseReviewDetail from "@/pages/corporate/LicenseReviewDetail";
import Safety from "@/pages/corporate/Safety";
import CarrierDashboard from "@/pages/corporate/CarrierDashboard";
import CarrierMetrics from "@/pages/corporate/CarrierMetrics";
import CarrierClaimsView from "@/pages/corporate/CarrierClaimsView";
const AccidentDetail = lazy(() => import("@/pages/corporate/AccidentDetail"));
import DailyWorkPlan from "@/pages/corporate/DailyWorkPlan";
import OpsWorkPlan from "@/pages/corporate/OpsWorkPlan";
const OperationsMap = lazy(() => import("@/pages/corporate/OperationsMap"));
const AccountMapReport = lazy(() => import("@/pages/reports/AccountMapReport"));
import AtRiskDriversPage from "@/pages/corporate/AtRiskDriversPage";
import { ClaimErrorBoundary } from "@/components/ClaimErrorBoundary";
import { PageErrorBoundary } from "@/components/PageErrorBoundary";
import EventIngestion from "@/pages/corporate/EventIngestion";
import MappingHealth from "@/pages/corporate/MappingHealth";
import Replay from "@/pages/corporate/Replay";
import IntegrationMonitoring from "@/pages/corporate/IntegrationMonitoring";
import ProviderHealth from "@/pages/corporate/ProviderHealth";
import MicrosoftGraphAdmin from "@/pages/admin/MicrosoftGraphAdmin";
import WeeklyReportRecipients from "@/pages/admin/WeeklyReportRecipients";
import SchemaRegistry from "@/pages/corporate/SchemaRegistry";
import ProcessingQueue from "@/pages/corporate/ProcessingQueue";
import DLQ from "@/pages/corporate/DLQ";
import RetentionPolicies from "@/pages/corporate/RetentionPolicies";
import RISPControlsRegistry from "@/pages/corporate/RISPControlsRegistry";
import RISPInsuranceSummary from "@/pages/corporate/RISPInsuranceSummary";
import ExternalAccess from "@/pages/corporate/ExternalAccess";
import LegalHolds from "@/pages/corporate/LegalHolds";
import AccountingAdmin from "@/pages/corporate/AccountingAdmin";
import BillingModule from "@/pages/corporate/BillingModule";
import AccountingModule from "@/pages/corporate/AccountingModule";
import BillsAdmin from "@/pages/corporate/BillsAdmin";
import ProductLibrary from "@/pages/corporate/ProductLibrary";
import SalesPricing from "@/pages/corporate/SalesPricing";
import MarketPricingOverview from "@/pages/corporate/MarketPricingOverview";
import ProductLibraryDashboard from "@/pages/corporate/ProductLibraryDashboard";
import ProductDetail from "@/pages/corporate/ProductDetail";
import TeamsAdmin from "@/pages/admin/TeamsAdmin";
import AccountReports from "@/pages/admin/AccountReports";
import WiwMappingHealth from "@/pages/admin/WiwMappingHealth";
import ExternalPortal from "@/pages/ExternalPortal";
import Trips from "@/pages/corporate/Trips";
import TripDetail from "@/pages/corporate/TripDetail";
import NewClaim from "@/pages/corporate/NewClaim";
import Payment from "@/pages/corporate/Payment";
const Invoices = lazy(() => import("@/pages/corporate/Invoices"));
import CollectionsWorkbench from "@/pages/corporate/CollectionsWorkbench";
import RevenueReports from "@/pages/corporate/RevenueReports";
import WidgetLibrary from "@/pages/reports/WidgetLibrary";
import MovesImport from "@/pages/reports/MovesImport";
import DraiverImport from "@/pages/corporate/DraiverImport";
import DraiverImportResults from "@/pages/corporate/DraiverImportResults";
import FileDrop from "@/pages/reports/FileDrop";
import FinancialIntelligence from "@/pages/corporate/FinancialIntelligence";
import IntegrationAPI from "@/pages/corporate/IntegrationAPI";
import QuickBooksSettings from "@/pages/corporate/QuickBooksSettings";
import QBOExpenseDashboard from "@/pages/corporate/QBOExpenseDashboard";
import FinanceDashboard from "@/pages/corporate/finance/FinanceDashboard";
import FinanceRevenue from "@/pages/corporate/finance/FinanceRevenue";
import FinanceExpenses from "@/pages/corporate/finance/FinanceExpenses";
import FinanceCashFlow from "@/pages/corporate/finance/FinanceCashFlow";
import FinanceQBSync from "@/pages/corporate/finance/FinanceQBSync";
import FinancePermissionsAdmin from "@/pages/corporate/FinancePermissionsAdmin";
import VendorPermissionsAdmin from "@/pages/corporate/VendorPermissionsAdmin";
import StripeSettings from "@/pages/corporate/StripeSettings";
import Support from "@/pages/corporate/Support";
import Expenses from "@/pages/corporate/Expenses";
const Scheduling = lazy(() => import("@/pages/corporate/Scheduling"));
import WiwImports from "@/pages/corporate/WiwImports";
const Recruiting = lazy(() => import("@/pages/corporate/Recruiting"));
const ReferralCampaigns = lazy(() => import("@/pages/corporate/ReferralCampaigns"));
const ReferralAnalytics = lazy(() => import("@/pages/corporate/ReferralAnalytics"));
const ReferralSettings = lazy(() => import("@/pages/corporate/ReferralSettings"));
const WorkforcePlanning = lazy(() => import("@/pages/corporate/WorkforcePlanning"));
const RecruitingRequestsPage = lazy(() => import("@/pages/corporate/RecruitingRequestsPage"));
const CandidateListPage = lazy(() => import("@/pages/corporate/CandidateListPage"));
const CandidateDetailPage = lazy(() => import("@/pages/corporate/CandidateDetailPage"));
const RecruitingCampaignManager = lazy(() => import("@/pages/corporate/RecruitingCampaignManager"));
const Vendors = lazy(() => import("@/pages/corporate/Vendors"));
import VendorRenewalCalendar from "@/pages/corporate/VendorRenewalCalendar";
import APPayables from "@/pages/corporate/APPayables";
import RecruitingIntegrationStatus from "@/pages/corporate/RecruitingIntegrationStatus";
import SocialMedia from "@/pages/corporate/SocialMedia";
import Reports from "@/pages/corporate/Reports";
import AccountsSetup from "@/pages/corporate/AccountsSetup";
import Markets from "@/pages/corporate/Markets";
import Timecards from "@/pages/corporate/Timecards";
import TimecardExceptions from "@/pages/corporate/TimecardExceptions";
import SchedulingTimeOff from "@/pages/corporate/SchedulingTimeOff";
import SchedulingHolidays from "@/pages/corporate/SchedulingHolidays";
import SchedulingReports from "@/pages/corporate/SchedulingReports";
import SchedulingNoShowReport from "@/pages/corporate/SchedulingNoShowReport";
import WiwGovernanceConsole from "@/pages/scheduling/WiwGovernanceConsole";
const WiwTimeOffReport = lazy(() => import("@/pages/corporate/WiwTimeOffReport"));
const NeedsCoverage = lazy(() => import("@/pages/corporate/NeedsCoverage"));
const WiwReconciliation = lazy(() => import("@/pages/scheduling/WiwReconciliation"));
import InvoiceCandidates from "@/pages/corporate/InvoiceCandidates";
import BillingEngine from "@/pages/corporate/BillingEngine";
import WiwInvoicePreview from "@/pages/corporate/WiwInvoicePreview";
import PayrollModule from "@/pages/payroll/PayrollModule";
import MarginEngine from "@/pages/corporate/MarginEngine";
import QAQueue from "@/pages/corporate/QAQueue";
import DriversReport from "@/pages/corporate/reports/DriversReport";
import TripsReport from "@/pages/corporate/reports/TripsReport";
import ComplianceReport from "@/pages/corporate/reports/ComplianceReport";
import WorkforceReport from "@/pages/corporate/reports/WorkforceReport";
import CustomReportingIntelligence from "@/pages/corporate/reports/CustomReportingIntelligence";
import ReportBuilderWorkspace from "@/pages/corporate/reports/ReportBuilderWorkspace";
import RideshareReconciliation from "@/pages/corporate/reports/RideshareReconciliation";
import RideshareOptimizationReport from "@/pages/corporate/reports/RideshareOptimizationReport";
import OpenForceReconciliation from "@/pages/corporate/reports/OpenForceReconciliation";
import AccountProfitability from "@/pages/corporate/reports/AccountProfitability";
import MoveProfitability from "@/pages/corporate/reports/MoveProfitability";
const MovesReport = lazy(() => import("@/pages/corporate/reports/MovesReport"));
const DriverIntelligenceReport = lazy(() => import("@/pages/corporate/reports/DriverIntelligenceReport"));
const DriverEngagementRetentionReport = lazy(() => import("@/pages/corporate/reports/DriverEngagementRetentionReport"));
import ReportDeliveryMonitor from "@/pages/corporate/ReportDeliveryMonitor";
import ExceptionDashboard from "@/pages/corporate/ExceptionDashboard";
import InsightsDashboard from "@/pages/corporate/InsightsDashboard";
import FeedbackQueue from "@/pages/corporate/FeedbackQueue";
import MyFeedback from "@/pages/MyFeedback";
import { DriverLayout } from "@/components/DriverLayout";
import { FeedbackButton } from "@/components/FeedbackButton";
import { FeedbackPrompt } from "@/components/FeedbackPrompt";
import Register from "@/pages/Register";
import CustomerMoveTimeline from "@/pages/customer/MoveTimeline";
import CustomerReportIssue from "@/pages/customer/ReportIssue";
import CustomerMyRequests from "@/pages/customer/MyRequests";
import CustomerNotificationSettings from "@/pages/customer/NotificationSettings";
import CustomerUserSettings from "@/pages/customer/UserSettings";
import CustomerAcceptInvitation from "@/pages/customer/AcceptInvitation";
import Login from "@/pages/Login";
import Bootstrap from "@/pages/Bootstrap";
import AcceptInvite from "@/pages/AcceptInvite";
import ScreeningForm from "@/pages/ScreeningForm";
import Apply from "@/pages/Apply";
import PayInvoice from "@/pages/PayInvoice";
import ScheduleBooking from "@/pages/public/ScheduleBooking";
import HolidayResponse from "@/pages/public/HolidayResponse";
import CandidatePortal from "@/pages/CandidatePortal";
const TicketPortal = lazy(() => import("@/pages/corporate/TicketPortal"));
import DriverMassImport from "@/pages/corporate/DriverMassImport";
import DateFix from "@/pages/corporate/DateFix";
import DriverDateCorrectionImport from "@/pages/corporate/DriverDateCorrectionImport";
import DataRepair from "@/pages/corporate/DataRepair";
import PlatformConfig from "@/pages/corporate/PlatformConfig";
import TransportationMethods from "@/pages/corporate/TransportationMethods";
import MoveTypes from "@/pages/corporate/MoveTypes";
import MoveTemplates from "@/pages/corporate/MoveTemplates";
import MoveTasks from "@/pages/corporate/MoveTasks";
import ClaimsImport from "@/pages/corporate/ClaimsImport";
import RecruitingImport from "@/pages/corporate/RecruitingImport";
import WiwImportWizard from "@/pages/corporate/WiwImportWizard";
import AccountImport from "@/pages/corporate/AccountImport";
import ImportLauncher from "@/pages/corporate/ImportLauncher";
import DataImports from "@/pages/DataImports";
const DriverReturns = lazy(() => import("@/pages/corporate/DriverReturns"));
const OperationalMoveReport      = lazy(() => import("@/pages/corporate/reports/OperationalMoveReport"));
const ReconciliationReport       = lazy(() => import("@/pages/corporate/reports/ReconciliationReport"));
const OperationalAccountReport = lazy(() => import("@/pages/corporate/reports/OperationalAccountReport"));
const OperationalDriverReport  = lazy(() => import("@/pages/corporate/reports/OperationalDriverReport"));
import DriversNeedsUpdate from "@/pages/corporate/DriversNeedsUpdate";
import DriverResources from "@/pages/corporate/DriverResources";
import AdminCenter from "@/pages/corporate/admin/AdminCenter";
import CommunicationsCenter from "@/pages/admin/CommunicationsCenter";
import UserFeedback from "@/pages/admin/UserFeedback";

function Router() {
  const { isAuthenticated, isLoading, isDriver, isCorporate, isProvisioned } = useAuth();
  const [location] = useLocation();
  
  // Public routes that should be accessible regardless of auth status
  // Check for these first before showing loading or doing auth checks
  if (location.startsWith('/pay/')) {
    return (
      <Switch>
        <Route path="/pay/:token" component={PayInvoice} />
        <Route path="/pay/:token/success" component={PayInvoice} />
      </Switch>
    );
  }

  if (location.startsWith('/holiday-response')) {
    return <HolidayResponse />;
  }

  if (location.startsWith('/portal/candidate/')) {
    return (
      <Switch>
        <Route path="/portal/candidate/:token" component={CandidatePortal} />
      </Switch>
    );
  }

  if (location.startsWith('/ref/')) {
    return (
      <Switch>
        <Route path="/ref/:code" component={ReferralLanding} />
      </Switch>
    );
  }

  if (location.startsWith('/bootstrap')) {
    return (
      <Switch>
        <Route path="/bootstrap" component={Bootstrap} />
      </Switch>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <Switch>
        <Route path="/">{() => <Redirect to="/login" />}</Route>
        <Route path="/login" component={Login} />
        <Route path="/accept-invite/:token" component={AcceptInvite} />
        <Route path="/register" component={Register} />
        <Route path="/customer/moves/:moveId" component={CustomerMoveTimeline} />
        <Route path="/customer/support/report" component={CustomerReportIssue} />
        <Route path="/customer/support/requests" component={CustomerMyRequests} />
        <Route path="/customer/settings/notifications" component={CustomerNotificationSettings} />
        <Route path="/customer/settings/users" component={CustomerUserSettings} />
        <Route path="/customer/accept-invitation/:invitationId" component={CustomerAcceptInvitation} />
        <Route path="/external" component={ExternalPortal} />
        <Route path="/screening/:token" component={ScreeningForm} />
        <Route path="/apply/:requisitionId" component={Apply} />
        <Route path="/schedule/:token" component={ScheduleBooking} />
        <Route path="/pay/:token" component={PayInvoice} />
        <Route path="/pay/:token/success" component={PayInvoice} />
        <Route>{() => <Redirect to="/login" />}</Route>
      </Switch>
    );
  }

  // Show Access Pending page for authenticated users who are NOT provisioned
  // Provisioned = has orgId + role + isProvisioned flag set by admin
  if (!isProvisioned) {
    return <AccessPending />;
  }

  if (isDriver) {
    return (
      <DriverLayout>
        {/* Outer safety-net boundary for all driver-app routes. Individual
            per-route boundaries below take precedence (closer to the component);
            this fires only if a route has no inner wrapper. */}
        <PageErrorBoundary pageLabel="Driver App">
        <Switch>
          <Route path="/login">{() => <Redirect to="/" />}</Route>
          <Route path="/">{() => <PageErrorBoundary backTo="/" backLabel="Back to Home" pageLabel="Home"><DriverHome /></PageErrorBoundary>}</Route>
          <Route path="/profile">{() => <PageErrorBoundary backTo="/" backLabel="Back to Home" pageLabel="Profile"><Profile /></PageErrorBoundary>}</Route>
          <Route path="/pay">{() => <PageErrorBoundary backTo="/" backLabel="Back to Home" pageLabel="Pay Data"><PayData /></PageErrorBoundary>}</Route>
          <Route path="/status">{() => <PageErrorBoundary backTo="/" backLabel="Back to Home" pageLabel="My Status"><MyStatus /></PageErrorBoundary>}</Route>
          <Route path="/trips">{() => <PageErrorBoundary backTo="/" backLabel="Back to Home" pageLabel="Trip History"><TripHistory /></PageErrorBoundary>}</Route>
          <Route path="/time-clock">{() => <PageErrorBoundary backTo="/" backLabel="Back to Home" pageLabel="Time Clock"><TimeClock /></PageErrorBoundary>}</Route>
          <Route path="/documents">{() => <PageErrorBoundary backTo="/" backLabel="Back to Home" pageLabel="Documents"><Documents /></PageErrorBoundary>}</Route>
          <Route path="/expenses">{() => <PageErrorBoundary backTo="/" backLabel="Back to Home" pageLabel="Expenses"><DriverExpenses /></PageErrorBoundary>}</Route>
          <Route path="/tasks">{() => <PageErrorBoundary backTo="/" backLabel="Back to Home" pageLabel="Tasks"><DriverTasks /></PageErrorBoundary>}</Route>
          <Route path="/schedule">{() => <PageErrorBoundary backTo="/" backLabel="Back to Home" pageLabel="Schedule"><DriverSchedule /></PageErrorBoundary>}</Route>
          <Route path="/referrals">{() => <PageErrorBoundary backTo="/" backLabel="Back to Home" pageLabel="My Referrals"><MyReferrals /></PageErrorBoundary>}</Route>
          <Route path="/my-feedback" component={MyFeedback} />
          <Route path="/customer/moves/:moveId" component={CustomerMoveTimeline} />
          <Route path="/customer/support/report" component={CustomerReportIssue} />
          <Route path="/customer/support/requests" component={CustomerMyRequests} />
          <Route path="/customer/settings/notifications" component={CustomerNotificationSettings} />
          <Route path="/customer/settings/users" component={CustomerUserSettings} />
          <Route path="/customer/accept-invitation/:invitationId" component={CustomerAcceptInvitation} />
          <Route path="/apply/:requisitionId" component={Apply} />
          <Route component={NotFound} />
        </Switch>
        </PageErrorBoundary>
        <FeedbackButton />
        <FeedbackPrompt promptType="sign_in" />
      </DriverLayout>
    );
  }

  if (isCorporate) {
    return <CorporateLayout />;
  }

  return <Route component={NotFound} />;
}

function CorporateLayout() {
  const [location] = useLocation();
  const search = useSearch();
  const [ticketDrawerOpen, setTicketDrawerOpen] = useState(false);
  useSchedulingReportSessionLifecycle(location, search);

  // Safari's layout viewport can remain taller than the visible area while the
  // software keyboard is open. Share the visual viewport height with portal
  // primitives so dialogs and menus remain reachable.
  useEffect(() => {
    const updateViewportHeight = () => {
      const height = window.visualViewport?.height ?? window.innerHeight;
      document.documentElement.style.setProperty("--app-viewport-height", `${height}px`);
    };
    updateViewportHeight();
    window.addEventListener("resize", updateViewportHeight, { passive: true });
    window.visualViewport?.addEventListener("resize", updateViewportHeight, { passive: true });
    window.visualViewport?.addEventListener("scroll", updateViewportHeight, { passive: true });
    return () => {
      window.removeEventListener("resize", updateViewportHeight);
      window.visualViewport?.removeEventListener("resize", updateViewportHeight);
      window.visualViewport?.removeEventListener("scroll", updateViewportHeight);
    };
  }, []);

  // Auto-collapse sidebar below 1280px (covers iPad landscape ~1180px + iPad portrait ~820px).
  // User can still toggle manually at any width. Desktop (≥1280px) starts open.
  const [sidebarOpen, setSidebarOpen] = useState(
    () => typeof window !== "undefined" ? window.innerWidth >= 1280 : true
  );
  useEffect(() => {
    const desktopQuery = window.matchMedia("(min-width: 1280px)");
    const syncSidebarBreakpoint = (event: MediaQueryListEvent | MediaQueryList) => {
      setSidebarOpen(event.matches);
    };
    desktopQuery.addEventListener("change", syncSidebarBreakpoint);
    return () => desktopQuery.removeEventListener("change", syncSidebarBreakpoint);
  }, []);

  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "4rem",
  };

  return (
    <>
    <SidebarProvider open={sidebarOpen} onOpenChange={setSidebarOpen} style={style as React.CSSProperties}>
       <div className="corporate-shell flex w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
           <header className="corporate-header flex shrink-0 h-[84px] px-3 sm:px-5 border-b gap-2">
            {/* Left: sidebar trigger (centered) + logo (bottom-anchored with 12px gap to divider) */}
             <div className="corporate-header__brand flex items-center gap-2 sm:gap-3 shrink-0">
              <SidebarTrigger data-testid="button-sidebar-toggle" />
               <HeaderLogo className="corporate-header__logo h-8 sm:h-10 w-auto self-end mb-[14px] sm:mb-3" />
            </div>
            {/* Right: actions */}
             <div className="corporate-header__actions flex flex-1 min-w-0 items-center justify-end gap-1 sm:gap-2">
              {/* Full-label button on sm+, icon-only on mobile */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setTicketDrawerOpen(true)}
                data-testid="button-submit-ticket-header"
                 className="corporate-header__request-button hidden sm:flex"
              >
                <Bug className="h-4 w-4 mr-1" />
                 <span className="corporate-header__request-label">Submit Mod Request</span>
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setTicketDrawerOpen(true)}
                title="Submit Mod Request"
                className="sm:hidden"
              >
                <Bug className="h-4 w-4" />
              </Button>
               <Button
                  asChild
                  variant="ghost"
                  size="icon"
                  title="Administration Center"
                  data-testid="btn-admin-center"
                  className="corporate-header__admin"
                >
                 <Link href="/admin-center"><Settings className="h-[22px] w-[22px]" /></Link>
               </Button>
              <NotificationBell />
              <ThemeToggle />
              <UserMenu />
            </div>
          </header>
           <main className={`corporate-main flex-1${location.startsWith("/ops-map") || location.startsWith("/reports/account-map") || location === "/claims" || location === "/claims/queue" ? " p-0" : location === "/reports/driver-engagement" ? " px-3 pb-4 sm:px-4 sm:pb-6 md:px-6" : location === "/amr" ? " px-3 sm:px-4 md:px-6" : /^\/drivers\/[^/]+(?:\?.*)?$/.test(location) ? " px-3 pb-4 sm:px-4 sm:pb-6 md:px-6" : " px-3 py-4 sm:px-4 sm:py-6 md:px-6"}`}>
            {/* Outer safety-net boundary: catches any route not individually wrapped.
                Inner PageErrorBoundary wrappers on specific routes take precedence because
                they are closer to the component — this one only fires for uncovered routes. */}
            <PageErrorBoundary pageLabel="DriverHub">
            <Suspense fallback={<div className="flex items-center justify-center h-full py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>}>
            <Switch>
                <Route path="/login">{() => <Redirect to="/" />}</Route>
                <Route path="/" component={CorporateDashboard} />
                <Route path="/dashboard/drivers" component={DriversDashboard} />
                <Route path="/dashboard/customers" component={CustomersDashboard} />
                <Route path="/dashboard/claims">{() => <PageErrorBoundary backTo="/dashboard" backLabel="Back to Dashboard" pageLabel="Claims Dashboard"><ClaimsDashboard /></PageErrorBoundary>}</Route>
                <Route path="/claims/dashboard">{() => <PageErrorBoundary backTo="/claims" backLabel="Back to Claims" pageLabel="Claims Dashboard"><ClaimsDashboard /></PageErrorBoundary>}</Route>
                <Route path="/claims/controls" component={ClaimsControls} />
                <Route path="/claims/reports/loss-accrual" component={ClaimsLossAccrualReport} />
                <Route path="/claims/reports/analysis" component={ClaimsAnalysisReport} />
                <Route path="/claims/reports" component={ClaimsReportLibrary} />
                <Route path="/claims">{() => <PageErrorBoundary backTo="/dashboard" backLabel="Back to Dashboard" pageLabel="Claims"><ClaimsQueue /></PageErrorBoundary>}</Route>
                <Route path="/claims/queue">{() => <PageErrorBoundary backTo="/dashboard" backLabel="Back to Dashboard" pageLabel="Claims"><ClaimsQueue /></PageErrorBoundary>}</Route>
                <Route path="/data-imports">{() => <PageErrorBoundary backTo="/dashboard" backLabel="Back to Dashboard" pageLabel="Data Imports"><DataImports /></PageErrorBoundary>}</Route>
                <Route path="/driver-returns" component={DriverReturns} />
                <Route path="/reports/reconciliation" component={ReconciliationReport}     />
                <Route path="/reports/ops/moves"    component={OperationalMoveReport}    />
                <Route path="/reports/ops/accounts" component={OperationalAccountReport} />
                <Route path="/reports/ops/drivers"  component={OperationalDriverReport}  />
                <Route path="/imports/:moduleKey" component={ImportLauncher} />
                <Route path="/claims/import" component={ClaimsImport} />
                <Route path="/recruiting/import" component={RecruitingImport} />
                <Route path="/scheduling/wiw-import" component={WiwImportWizard} />
                <Route path="/accounts/billing-rates" component={AccountBillingRatesView} />
                <Route path="/accounts/import" component={AccountImport} />
                <Route path="/dashboard/moves" component={MovesDashboard} />
                <Route path="/drivers" component={Drivers} />
                <Route path="/drivers/mass-import" component={DriverMassImport} />
                <Route path="/admin/date-fix" component={DateFix} />
                <Route path="/admin/driver-date-correction" component={DriverDateCorrectionImport} />
                <Route path="/admin/data/date-repair" component={DataRepair} />
                <Route path="/drivers/needs-update" component={DriversNeedsUpdate} />
                <Route path="/drivers/resources" component={DriverResources} />
                <Route path="/drivers/:id/dashboard">
                  {(params) => (
                    <PageErrorBoundary backTo={`/drivers/${params.id}`} backLabel="Back to Driver" pageLabel="Driver Dashboard">
                      <DriverDashboard />
                    </PageErrorBoundary>
                  )}
                </Route>
                <Route path="/drivers/:id">
                  {(params) => (
                    <PageErrorBoundary backTo="/drivers" backLabel="Back to Drivers" pageLabel="Driver">
                      <DriverDetail />
                    </PageErrorBoundary>
                  )}
                </Route>
                <Route path="/customers">{() => <PageErrorBoundary backTo="/dashboard" backLabel="Back to Dashboard" pageLabel="Accounts"><Customers /></PageErrorBoundary>}</Route>
                <Route path="/customers/setup" component={AccountsSetup} />
                <Route path="/customers/:id">
                  {(params) => (
                    <PageErrorBoundary backTo="/customers" backLabel="Back to Accounts" pageLabel="Account">
                      <AccountDetail />
                    </PageErrorBoundary>
                  )}
                </Route>
                <Route path="/standard-documents" component={StandardDocuments} />
                <Route path="/insurance-cards" component={InsuranceCards} />
                <Route path="/compliance/license-review" component={LicenseReviewQueue} />
                <Route path="/compliance/license-review/:id" component={LicenseReviewDetail} />
                <Route path="/safety" component={Safety} />
                <Route path="/carrier" component={CarrierDashboard} />
                <Route path="/carrier/metrics" component={CarrierMetrics} />
                <Route path="/carrier/claims" component={CarrierClaimsView} />
                <Route path="/work-plan">{() => <PageErrorBoundary backTo="/dashboard" backLabel="Back to Dashboard" pageLabel="Work Plan"><DailyWorkPlan /></PageErrorBoundary>}</Route>
                <Route path="/ops-work-plan">{() => <PageErrorBoundary backTo="/dashboard" backLabel="Back to Dashboard" pageLabel="Ops Work Plan"><OpsWorkPlan /></PageErrorBoundary>}</Route>
                <Route path="/ops-map">
                  {() => (
                    <PageErrorBoundary backTo="/dashboard" backLabel="Back to Dashboard" pageLabel="Operations Map">
                      <OperationsMap />
                    </PageErrorBoundary>
                  )}
                </Route>
                <Route path="/corporate/at-risk-drivers" component={AtRiskDriversPage} />
                <Route path="/accidents/:accidentId">
                  {(params) => (
                    <ClaimErrorBoundary claimId={params.accidentId}>
                      <AccidentDetail />
                    </ClaimErrorBoundary>
                  )}
                </Route>
                <Route path="/claims/new" component={NewClaim} />
                {/* /claims/:id → canonical URL alias for /accidents/:id */}
                <Route path="/claims/:accidentId">
                  {(params) => (
                    <ClaimErrorBoundary claimId={params.accidentId}>
                      <AccidentDetail />
                    </ClaimErrorBoundary>
                  )}
                </Route>
                <Route path="/trips/:id">
                  {(params) => (
                    <PageErrorBoundary backTo="/trips" backLabel="Back to Trips" pageLabel="Trip">
                      <TripDetail />
                    </PageErrorBoundary>
                  )}
                </Route>
                <Route path="/trips">{() => <PageErrorBoundary backTo="/dashboard" backLabel="Back to Dashboard" pageLabel="Trips"><Trips /></PageErrorBoundary>}</Route>
                <Route path="/payment">{() => <PageErrorBoundary backTo="/dashboard" backLabel="Back to Dashboard" pageLabel="Payment"><Payment /></PageErrorBoundary>}</Route>
                <Route path="/invoices">{() => <PageErrorBoundary backTo="/dashboard" backLabel="Back to Dashboard" pageLabel="Invoices"><Invoices /></PageErrorBoundary>}</Route>
                <Route path="/collections">{() => <PageErrorBoundary backTo="/dashboard" backLabel="Back to Dashboard" pageLabel="Collections Workbench"><CollectionsWorkbench /></PageErrorBoundary>}</Route>
                <Route path="/revenue-reports">{() => <PageErrorBoundary backTo="/dashboard" backLabel="Back to Dashboard" pageLabel="Revenue Reports"><RevenueReports /></PageErrorBoundary>}</Route>
                <Route path="/reports/widget-library" component={WidgetLibrary} />
                <Route path="/reports/moves-import" component={MovesImport} />
                <Route path="/reports/draiver-import/:batchId" component={DraiverImportResults} />
                <Route path="/reports/draiver-import" component={DraiverImport} />
                <Route path="/reports/file-drop" component={FileDrop} />
                <Route path="/financial-intelligence" component={FinancialIntelligence} />
                <Route path="/integration-api" component={IntegrationAPI} />
                <Route path="/integrations/quickbooks" component={QuickBooksSettings} />
                <Route path="/accounting/expenses">{() => <PageErrorBoundary backTo="/accounting" backLabel="Back to Accounting" pageLabel="Accounting Expenses"><QBOExpenseDashboard /></PageErrorBoundary>}</Route>
                <Route path="/finance">{() => <PageErrorBoundary backTo="/dashboard" backLabel="Back to Dashboard" pageLabel="Finance"><FinanceDashboard /></PageErrorBoundary>}</Route>
                <Route path="/finance/revenue">{() => <PageErrorBoundary backTo="/finance" backLabel="Back to Finance" pageLabel="Finance Revenue"><FinanceRevenue /></PageErrorBoundary>}</Route>
                <Route path="/finance/expenses">{() => <PageErrorBoundary backTo="/finance" backLabel="Back to Finance" pageLabel="Finance Expenses"><FinanceExpenses /></PageErrorBoundary>}</Route>
                <Route path="/finance/cash-flow">{() => <PageErrorBoundary backTo="/finance" backLabel="Back to Finance" pageLabel="Finance Cash Flow"><FinanceCashFlow /></PageErrorBoundary>}</Route>
                <Route path="/finance/qb-sync">{() => <PageErrorBoundary backTo="/finance" backLabel="Back to Finance" pageLabel="Finance QB Sync"><FinanceQBSync /></PageErrorBoundary>}</Route>
                <Route path="/admin/finance-permissions" component={FinancePermissionsAdmin} />
                <Route path="/admin/vendor-permissions" component={VendorPermissionsAdmin} />
                <Route path="/integrations/stripe" component={StripeSettings} />
                <Route path="/support" component={Support} />
                <Route path="/expenses" component={Expenses} />
                <Route path="/scheduling/driver-time-off">{() => <PageErrorBoundary backTo="/scheduling/reports" backLabel="Back to Scheduling Reports" pageLabel="Drivers with Most Time Off"><WiwTimeOffReport /></PageErrorBoundary>}</Route>
                <Route path="/scheduling/needs-coverage">{() => <PageErrorBoundary backTo="/scheduling" backLabel="Back to Scheduling" pageLabel="Needs Coverage"><NeedsCoverage /></PageErrorBoundary>}</Route>
                <Route path="/scheduling/wiw-reconciliation">{() => <PageErrorBoundary backTo="/scheduling" backLabel="Back to Scheduling" pageLabel="WIW Reconciliation"><WiwReconciliation /></PageErrorBoundary>}</Route>
                <Route path="/scheduling/wiw-governance">{() => <PageErrorBoundary backTo="/scheduling" backLabel="Back to Scheduling" pageLabel="WIW Governance"><WiwGovernanceConsole /></PageErrorBoundary>}</Route>
                <Route path="/scheduling/wiw-imports">{() => <PageErrorBoundary backTo="/scheduling" backLabel="Back to Scheduling" pageLabel="WIW Imports"><WiwImports /></PageErrorBoundary>}</Route>
                <Route path="/scheduling/time-clock">{() => <PageErrorBoundary backTo="/scheduling" backLabel="Back to Scheduling" pageLabel="Time Clock"><Timecards /></PageErrorBoundary>}</Route>
                <Route path="/scheduling/calendar">{() => <PageErrorBoundary backTo="/scheduling" backLabel="Back to Scheduling" pageLabel="Scheduling Calendar"><Scheduling /></PageErrorBoundary>}</Route>
                <Route path="/scheduling/time-off">{() => <PageErrorBoundary backTo="/scheduling" backLabel="Back to Scheduling" pageLabel="Time Off"><SchedulingTimeOff /></PageErrorBoundary>}</Route>
                <Route path="/scheduling/holidays">{() => <PageErrorBoundary backTo="/scheduling" backLabel="Back to Scheduling" pageLabel="Holidays"><SchedulingHolidays /></PageErrorBoundary>}</Route>
                <Route path="/scheduling/reports/time-off">{() => <PageErrorBoundary backTo="/scheduling/reports" backLabel="Back to Scheduling Reports" pageLabel="Drivers with Most Time Off"><WiwTimeOffReport /></PageErrorBoundary>}</Route>
                <Route path="/scheduling/reports/no-show">{() => <PageErrorBoundary backTo="/scheduling/reports" backLabel="Back to Scheduling Reports" pageLabel="No Show Monitor"><SchedulingNoShowReport /></PageErrorBoundary>}</Route>
                <Route path="/scheduling/reports">{() => <PageErrorBoundary backTo="/scheduling" backLabel="Back to Scheduling" pageLabel="Scheduling Reports"><SchedulingReports /></PageErrorBoundary>}</Route>
                <Route path="/scheduling">{() => <PageErrorBoundary backTo="/dashboard" backLabel="Back to Dashboard" pageLabel="Scheduling"><Scheduling /></PageErrorBoundary>}</Route>
                <Route path="/recruiting/campaigns/:id/workspace">{() => <PageErrorBoundary backTo="/recruiting/campaigns" backLabel="Back to Active Campaigns" pageLabel="Campaign Workspace"><Recruiting /></PageErrorBoundary>}</Route>
                <Route path="/recruiting/campaigns/:id">{() => <PageErrorBoundary backTo="/recruiting/campaigns" backLabel="Back to Active Campaigns" pageLabel="Campaign Detail"><Recruiting /></PageErrorBoundary>}</Route>
                <Route path="/recruiting/closed-campaigns">{() => <PageErrorBoundary backTo="/recruiting" backLabel="Back to Active Campaigns" pageLabel="Closed Campaigns"><Recruiting /></PageErrorBoundary>}</Route>
                <Route path="/recruiting/campaigns">{() => <PageErrorBoundary backTo="/dashboard" backLabel="Back to Dashboard" pageLabel="Active Campaigns"><Recruiting /></PageErrorBoundary>}</Route>
                <Route path="/recruiting">{() => <PageErrorBoundary backTo="/dashboard" backLabel="Back to Dashboard" pageLabel="Recruiting"><Recruiting /></PageErrorBoundary>}</Route>
                <Route path="/recruiting/campaign-management">{() => <PageErrorBoundary backTo="/recruiting" backLabel="Back to Recruiting" pageLabel="Campaign Management"><RecruitingCampaignManager /></PageErrorBoundary>}</Route>
                <Route path="/recruiting/requisitions">{() => <PageErrorBoundary backTo="/dashboard" backLabel="Back to Dashboard" pageLabel="Recruiting"><Recruiting /></PageErrorBoundary>}</Route>
                <Route path="/recruiting/requisitions/:id">{() => <PageErrorBoundary backTo="/recruiting/requisitions" backLabel="Back to Requisitions" pageLabel="Recruiting"><Recruiting /></PageErrorBoundary>}</Route>
                <Route path="/recruiting/candidates">{() => <PageErrorBoundary backTo="/recruiting" backLabel="Back to Recruiting" pageLabel="Candidates"><CandidateListPage /></PageErrorBoundary>}</Route>
                <Route path="/recruiting/candidates/:id">{() => <PageErrorBoundary backTo="/recruiting/candidates" backLabel="Back to Candidates" pageLabel="Candidate"><CandidateDetailPage /></PageErrorBoundary>}</Route>
                <Route path="/recruiting/applications">{() => <PageErrorBoundary backTo="/dashboard" backLabel="Back to Dashboard" pageLabel="Recruiting"><Recruiting /></PageErrorBoundary>}</Route>
                <Route path="/recruiting/applications/:id">{() => <PageErrorBoundary backTo="/recruiting/applications" backLabel="Back to Applications" pageLabel="Recruiting"><Recruiting /></PageErrorBoundary>}</Route>
                <Route path="/recruiting/pipeline">{() => <PageErrorBoundary backTo="/dashboard" backLabel="Back to Dashboard" pageLabel="Recruiting"><Recruiting /></PageErrorBoundary>}</Route>
                <Route path="/recruiting/requests">{() => <PageErrorBoundary backTo="/dashboard" backLabel="Back to Dashboard" pageLabel="Recruiting Requests"><RecruitingRequestsPage /></PageErrorBoundary>}</Route>
                <Route path="/recruiting/requests/:id">{() => <PageErrorBoundary backTo="/recruiting/requests" backLabel="Back to Requests" pageLabel="Recruiting Requests"><RecruitingRequestsPage /></PageErrorBoundary>}</Route>
                <Route path="/recruiting/integration-status" component={RecruitingIntegrationStatus} />
                <Route path="/recruiting/referral-campaigns">{() => <PageErrorBoundary backTo="/recruiting" backLabel="Back to Recruiting" pageLabel="Referral Campaigns"><ReferralCampaigns /></PageErrorBoundary>}</Route>
                <Route path="/recruiting/referral-analytics">{() => <PageErrorBoundary backTo="/recruiting" backLabel="Back to Recruiting" pageLabel="Referral Analytics"><ReferralAnalytics /></PageErrorBoundary>}</Route>
                <Route path="/recruiting/referral-settings">{() => <PageErrorBoundary backTo="/recruiting" backLabel="Back to Recruiting" pageLabel="Referral Settings"><ReferralSettings /></PageErrorBoundary>}</Route>
                <Route path="/recruiting/workforce-planning">{() => <PageErrorBoundary backTo="/recruiting" backLabel="Back to Recruiting" pageLabel="Workforce Planning"><WorkforcePlanning /></PageErrorBoundary>}</Route>
                <Route path="/vendors">{() => <PageErrorBoundary backTo="/dashboard" backLabel="Back to Dashboard" pageLabel="Vendors"><Vendors /></PageErrorBoundary>}</Route>
                <Route path="/vendors/renewal-calendar">{() => <PageErrorBoundary backTo="/vendors" backLabel="Back to Vendors" pageLabel="Vendor Renewal Calendar"><VendorRenewalCalendar /></PageErrorBoundary>}</Route>
                <Route path="/ap-payables">{() => <PageErrorBoundary backTo="/dashboard" backLabel="Back to Dashboard" pageLabel="AP Payables"><APPayables /></PageErrorBoundary>}</Route>
                <Route path="/social-media">{() => <PageErrorBoundary backTo="/dashboard" backLabel="Back to Dashboard" pageLabel="Social Media"><SocialMedia /></PageErrorBoundary>}</Route>
                <Route path="/reports">
                  {() => (
                    <PageErrorBoundary backTo="/dashboard" backLabel="Back to Dashboard" pageLabel="Reports & Analytics">
                      <Reports />
                    </PageErrorBoundary>
                  )}
                </Route>
                <Route path="/reports/drivers">
                  {() => (
                    <PageErrorBoundary backTo="/reports" backLabel="Back to Reports" pageLabel="Drivers Report">
                      <DriversReport />
                    </PageErrorBoundary>
                  )}
                </Route>
                <Route path="/reports/trips">
                  {() => (
                    <PageErrorBoundary backTo="/reports" backLabel="Back to Reports" pageLabel="Trips Report">
                      <TripsReport />
                    </PageErrorBoundary>
                  )}
                </Route>
                <Route path="/reports/compliance">
                  {() => (
                    <PageErrorBoundary backTo="/reports" backLabel="Back to Reports" pageLabel="Compliance Report">
                      <ComplianceReport />
                    </PageErrorBoundary>
                  )}
                </Route>
                <Route path="/reports/workforce">
                  {() => (
                    <PageErrorBoundary backTo="/reports" backLabel="Back to Reports" pageLabel="Workforce Report">
                      <WorkforceReport />
                    </PageErrorBoundary>
                  )}
                </Route>
                <Route path="/reports/custom/builder">
                  {() => (
                    <PageErrorBoundary backTo="/reports/custom" backLabel="Back to Custom Reports" pageLabel="Report Builder">
                      <ReportBuilderWorkspace />
                    </PageErrorBoundary>
                  )}
                </Route>
                <Route path="/reports/custom">
                  {() => (
                    <PageErrorBoundary backTo="/reports" backLabel="Back to Reports" pageLabel="Custom Reporting">
                      <CustomReportingIntelligence />
                    </PageErrorBoundary>
                  )}
                </Route>
                <Route path="/reports/rideshare">
                  {() => (
                    <PageErrorBoundary backTo="/reports" backLabel="Back to Reports" pageLabel="Rideshare Reconciliation">
                      <RideshareReconciliation />
                    </PageErrorBoundary>
                  )}
                </Route>
                <Route path="/reports/account-map">
                  {() => (
                    <PageErrorBoundary backTo="/reports" backLabel="Back to Reports" pageLabel="Account Map">
                      <AccountMapReport />
                    </PageErrorBoundary>
                  )}
                </Route>
                <Route path="/reports/rideshare-optimization">
                  {() => (
                    <PageErrorBoundary backTo="/reports" backLabel="Back to Reports" pageLabel="Rideshare Optimization">
                      <RideshareOptimizationReport />
                    </PageErrorBoundary>
                  )}
                </Route>
                <Route path="/reports/openforce">
                  {() => (
                    <PageErrorBoundary backTo="/reports" backLabel="Back to Reports" pageLabel="OpenForce Reconciliation">
                      <OpenForceReconciliation />
                    </PageErrorBoundary>
                  )}
                </Route>
                <Route path="/reports/account-profitability">
                  {() => (
                    <PageErrorBoundary backTo="/reports" backLabel="Back to Reports" pageLabel="Account Profitability">
                      <AccountProfitability />
                    </PageErrorBoundary>
                  )}
                </Route>
                <Route path="/reports/move-profitability">
                  {() => (
                    <PageErrorBoundary backTo="/reports" backLabel="Back to Reports" pageLabel="Move Profitability">
                      <MoveProfitability />
                    </PageErrorBoundary>
                  )}
                </Route>
                <Route path="/reports/moves">
                  {() => (
                    <PageErrorBoundary backTo="/reports" backLabel="Back to Reports" pageLabel="Moves Report">
                      <MovesReport />
                    </PageErrorBoundary>
                  )}
                </Route>
                <Route path="/reports/driver-intelligence">
                  {() => (
                    <PageErrorBoundary backTo="/reports" backLabel="Back to Reports" pageLabel="Driver Intelligence">
                      <DriverIntelligenceReport />
                    </PageErrorBoundary>
                  )}
                </Route>
                <Route path="/reports/driver-engagement">
                  {() => (
                    <PageErrorBoundary backTo="/reports" backLabel="Back to Reports" pageLabel="Driver Engagement & Retention">
                      <DriverEngagementRetentionReport />
                    </PageErrorBoundary>
                  )}
                </Route>
                <Route path="/admin/report-delivery-monitor" component={ReportDeliveryMonitor} />
                <Route path="/admin/weekly-report-recipients" component={WeeklyReportRecipients} />
                <Route path="/admin/wiw-mapping-health" component={WiwMappingHealth} />
                <Route path="/exceptions" component={ExceptionDashboard} />
                <Route path="/dashboard/insights" component={InsightsDashboard} />
                <Route path="/markets" component={Markets} />
                <Route path="/pay-periods">
                  {() => { window.location.replace("/payroll"); return null; }}
                </Route>
                <Route path="/timecards">{() => <Redirect to="/scheduling/time-clock" />}</Route>
                <Route path="/timecard-exceptions">{() => <Redirect to="/scheduling/time-clock" />}</Route>
                <Route path="/billing">{() => <PageErrorBoundary backTo="/dashboard" backLabel="Back to Dashboard" pageLabel="Billing"><BillingModule /></PageErrorBoundary>}</Route>
                <Route path="/accounting">{() => <PageErrorBoundary backTo="/dashboard" backLabel="Back to Dashboard" pageLabel="Accounting"><AccountingModule /></PageErrorBoundary>}</Route>
                <Route path="/billing/candidates">{() => <PageErrorBoundary backTo="/billing" backLabel="Back to Billing" pageLabel="Invoice Candidates"><InvoiceCandidates /></PageErrorBoundary>}</Route>
                <Route path="/billing-engine">{() => <PageErrorBoundary backTo="/billing" backLabel="Back to Billing" pageLabel="Billing Engine"><BillingEngine /></PageErrorBoundary>}</Route>
                <Route path="/billing/wiw-invoice-preview">{() => <PageErrorBoundary backTo="/billing" backLabel="Back to Billing" pageLabel="WIW Invoice Preview"><WiwInvoicePreview /></PageErrorBoundary>}</Route>
                <Route path="/account-products">{() => <Redirect to="/accounts" />}</Route>
                <Route path="/payroll">{() => <PageErrorBoundary backTo="/dashboard" backLabel="Back to Dashboard" pageLabel="Payroll"><PayrollModule /></PageErrorBoundary>}</Route>
                <Route path="/margin-engine">{() => <PageErrorBoundary backTo="/dashboard" backLabel="Back to Dashboard" pageLabel="Margin Engine"><MarginEngine /></PageErrorBoundary>}</Route>
                <Route path="/claims/case-queue" component={QAQueue} />
                <Route path="/qa-queue">
                  {() => { window.location.replace("/claims/case-queue"); return null; }}
                </Route>
                <Route path="/profile" component={CorporateProfile} />
                <Route path="/users">
                  {() => (
                    <PageErrorBoundary backTo="/" backLabel="Back to Dashboard" pageLabel="User Management">
                      <AdminUserManagement />
                    </PageErrorBoundary>
                  )}
                </Route>
                <Route path="/platform-admin" component={PlatformAdminConsole} />
                <Route path="/admin/platform-config" component={PlatformConfig} />
                <Route path="/admin/transportation-methods" component={TransportationMethods} />
                <Route path="/admin/move-types" component={MoveTypes} />
                <Route path="/admin/move-templates" component={MoveTemplates} />
                <Route path="/admin/move-tasks" component={MoveTasks} />
                <Route path="/admin/integrations/events" component={EventIngestion} />
                <Route path="/admin/integrations/mapping" component={MappingHealth} />
                <Route path="/admin/integrations/replay" component={Replay} />
                <Route path="/admin/integrations/monitoring" component={IntegrationMonitoring} />
                <Route path="/admin/integrations/microsoft-graph" component={MicrosoftGraphAdmin} />
                <Route path="/admin/provider-health" component={ProviderHealth} />
                <Route path="/admin/recruiting-observability"><Redirect to="/recruiting/observability" /></Route>
                <Route path="/recruiting/observability">{() => <PageErrorBoundary backTo="/dashboard" backLabel="Back to Dashboard" pageLabel="Recruiting"><Recruiting /></PageErrorBoundary>}</Route>
                <Route path="/admin/integrations/schemas" component={SchemaRegistry} />
                <Route path="/admin/integrations/processing" component={ProcessingQueue} />
                <Route path="/admin/integrations/dlq" component={DLQ} />
                <Route path="/admin/data/retention" component={RetentionPolicies} />
                {/* Legacy RISP routes — redirect to Claims-based paths */}
                <Route path="/admin/data/risp-controls">{() => <Redirect to="/claims/risp-controls" />}</Route>
                <Route path="/reporting/risp/summary">{() => <Redirect to="/claims/risp-insurance-summary" />}</Route>
                {/* RISP under Claims module */}
                <Route path="/claims/risp-controls" component={RISPControlsRegistry} />
                <Route path="/claims/risp-insurance-summary" component={RISPInsuranceSummary} />
                <Route path="/admin/external-access" component={ExternalAccess} />
                <Route path="/admin/compliance/legal-holds" component={LegalHolds} />
                <Route path="/admin/accounting" component={AccountingAdmin} />
                <Route path="/admin/bills" component={BillsAdmin} />
                <Route path="/admin/products/dashboard">{() => <PageErrorBoundary backTo="/admin/products" backLabel="Back to Product Library" pageLabel="Product Dashboard"><ProductLibraryDashboard /></PageErrorBoundary>}</Route>
                <Route path="/admin/products/:id">{() => <PageErrorBoundary backTo="/admin/products" backLabel="Back to Product Library" pageLabel="Product Detail"><ProductDetail /></PageErrorBoundary>}</Route>
                <Route path="/admin/products">{() => <PageErrorBoundary backTo="/dashboard" backLabel="Back to Dashboard" pageLabel="Product Library"><ProductLibrary /></PageErrorBoundary>}</Route>
                <Route path="/sales/market-pricing-overview">{() => <PageErrorBoundary backTo="/dashboard" backLabel="Back to Dashboard" pageLabel="Market Pricing Overview"><MarketPricingOverview /></PageErrorBoundary>}</Route>
                <Route path="/sales/pricing/reference" component={SalesPricing} />
                <Route path="/sales/pricing" component={SalesPricing} />
                <Route path="/admin/teams" component={TeamsAdmin} />
                <Route path="/admin/account-reports" component={AccountReports} />
                <Route path="/external" component={ExternalPortal} />
                <Route path="/amr">{() => <PageErrorBoundary backTo="/dashboard" backLabel="Back to Dashboard" pageLabel="AMR"><TicketPortal /></PageErrorBoundary>}</Route>
                <Route path="/ticket-portal">{() => <Redirect to="/amr" />}</Route>
                <Route path="/tickets">{() => <Redirect to={`/amr${window.location.search}`} />}</Route>
                <Route path="/admin/communications/:tab" component={CommunicationsCenter} />
                <Route path="/admin/communications" component={CommunicationsCenter} />
                <Route path="/admin/user-feedback" component={UserFeedback} />
                <Route path="/admin-center/:category/:section" component={AdminCenter} />
                <Route path="/admin-center/:category" component={AdminCenter} />
                <Route path="/admin-center" component={AdminCenter} />
                <Route path="/feedback-queue" component={FeedbackQueue} />
                <Route path="/my-feedback" component={MyFeedback} />
                <Route path="/customer/moves/:moveId" component={CustomerMoveTimeline} />
                <Route path="/customer/support/report" component={CustomerReportIssue} />
                <Route path="/customer/support/requests" component={CustomerMyRequests} />
                <Route path="/customer/settings/notifications" component={CustomerNotificationSettings} />
                <Route path="/customer/settings/users" component={CustomerUserSettings} />
                <Route path="/customer/accept-invitation/:invitationId" component={CustomerAcceptInvitation} />
                <Route path="/apply/:requisitionId" component={Apply} />
                <Route component={NotFound} />
              </Switch>
            </Suspense>
            </PageErrorBoundary>
            </main>
            <FeedbackButton />
            <FeedbackPrompt promptType="sign_in" />
          </div>
        </div>
      </SidebarProvider>
      <RecruitingApprovalAlert />
      <AMRDeclineAlert />
      <SubmitTicketDrawer open={ticketDrawerOpen} onOpenChange={setTicketDrawerOpen} />
    </>
  );
}

export default function App() {
  return (
    <PageTitleProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </QueryClientProvider>
    </PageTitleProvider>
  );
}
