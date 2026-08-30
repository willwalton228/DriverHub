/**
 * Centralized Status Color Map for DriverHub 360
 *
 * All status badge colors system-wide are controlled from this single file.
 * To add a new status: add an entry to STATUS_COLOR_MAP below.
 *
 * Color scheme:
 *   Entity statuses (active/terminated/inactive/pending) → solid colors with white text
 *   Claims operational pills (injury/fault/severity/drug test) → solid colors with white text
 *   Domain-specific statuses (invoice/payment/move) → soft tinted backgrounds
 *
 * getStatusBadgeClass() is case-insensitive and normalises hyphens to underscores.
 */

export const STATUS_COLOR_MAP: Record<string, string> = {

  // ─── Entity / person statuses (solid — high visual weight) ────────────────
  active:      'bg-green-600 text-white dark:bg-green-700 dark:text-white',
  enabled:     'bg-green-600 text-white dark:bg-green-700 dark:text-white',

  terminated:  'bg-red-600 text-white dark:bg-red-700 dark:text-white',
  suspended:   'bg-red-600 text-white dark:bg-red-700 dark:text-white',
  banned:      'bg-red-600 text-white dark:bg-red-700 dark:text-white',
  blocked:     'bg-red-600 text-white dark:bg-red-700 dark:text-white',

  inactive:    'bg-gray-500 text-white dark:bg-gray-600 dark:text-white',
  disabled:    'bg-gray-500 text-white dark:bg-gray-600 dark:text-white',
  archived:    'bg-gray-500 text-white dark:bg-gray-600 dark:text-white',

  onboarding:  'bg-blue-500 text-white dark:bg-blue-600 dark:text-white',

  pending:     'bg-amber-500 text-white dark:bg-amber-600 dark:text-white',

  // ─── Claims — operational state pills (solid, white text) ────────────────
  // Injury
  injury_reported:   'bg-red-600 text-white dark:bg-red-700 dark:text-white',
  no_injury:         'bg-green-600 text-white dark:bg-green-700 dark:text-white',

  // Fault
  at_fault:          'bg-red-600 text-white dark:bg-red-700 dark:text-white',
  not_at_fault:      'bg-green-600 text-white dark:bg-green-700 dark:text-white',
  partial_fault:     'bg-gray-600 text-white dark:bg-gray-700 dark:text-white',
  fault_pending:     'bg-gray-500 text-white dark:bg-gray-600 dark:text-white',

  // Claim Type — using neutral dark gray until specific colors approved
  insurance_claim:   'bg-gray-600 text-white dark:bg-gray-700 dark:text-white', // pending approval
  internal_claim:    'bg-gray-600 text-white dark:bg-gray-700 dark:text-white', // pending approval

  // Severity — colors pending approval; using neutral dark gray
  catastrophic:      'bg-gray-600 text-white dark:bg-gray-700 dark:text-white', // pending approval
  major:             'bg-gray-600 text-white dark:bg-gray-700 dark:text-white', // pending approval
  moderate:          'bg-gray-600 text-white dark:bg-gray-700 dark:text-white', // pending approval
  minor:             'bg-gray-600 text-white dark:bg-gray-700 dark:text-white', // pending approval

  // Readiness — colors pending approval; using neutral dark gray
  already_reported:  'bg-gray-600 text-white dark:bg-gray-700 dark:text-white', // pending approval
  ready_to_report:   'bg-gray-600 text-white dark:bg-gray-700 dark:text-white', // pending approval
  not_ready:         'bg-gray-600 text-white dark:bg-gray-700 dark:text-white', // pending approval

  // Attorney — color pending approval; using neutral dark gray
  attorney_letter_received: 'bg-gray-600 text-white dark:bg-gray-700 dark:text-white', // pending approval

  // Drug test — colors pending approval; using neutral dark gray
  not_required:      'bg-gray-600 text-white dark:bg-gray-700 dark:text-white', // pending approval
  required:          'bg-gray-600 text-white dark:bg-gray-700 dark:text-white', // pending approval
  notified:          'bg-gray-600 text-white dark:bg-gray-700 dark:text-white', // pending approval
  acknowledged:      'bg-gray-600 text-white dark:bg-gray-700 dark:text-white', // pending approval
  waived:            'bg-gray-600 text-white dark:bg-gray-700 dark:text-white', // pending approval
  failed_to_comply:  'bg-gray-600 text-white dark:bg-gray-700 dark:text-white', // pending approval

  // ─── Future / scalable statuses ───────────────────────────────────────────
  'under review':               'bg-amber-500 text-white dark:bg-amber-600 dark:text-white',
  'compliance hold':            'bg-orange-500 text-white dark:bg-orange-600 dark:text-white',
  'background check pending':   'bg-blue-500 text-white dark:bg-blue-600 dark:text-white',

  // ─── Invoice / payment / finance statuses (soft tones) ────────────────────
  draft:            'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
  balanced:         'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  submitted:        'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  locked:           'bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-200',
  reconciled:       'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  pending_approval: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  sent:             'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  approved:         'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  viewed:           'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  paid:             'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  completed:        'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  invoiced:         'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  partially_paid:   'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200',
  overdue:          'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  failed:           'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  rejected:         'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  denied:           'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  disputed:         'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  cancelled:        'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
  void:             'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
  voided:           'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
  refunded:         'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
  written_off:      'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  reimbursed:       'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  in_approval:      'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',

  // ─── Claims-specific statuses ──────────────────────────────────────────────
  under_review:               'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  investigating:              'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  additional_info_requested:  'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  sent_to_carrier:            'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  closed:                     'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
  abandoned:                  'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
  driver_paid:                'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  insurance_paid:             'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  dod_paid:                   'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',

  // ─── Move / trip statuses ─────────────────────────────────────────────────
  scheduled:    'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  in_progress:  'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  resolved:     'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',

  // ─── Exception / ticket statuses ──────────────────────────────────────────
  open:       'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  dismissed:  'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',

  // ─── Social / content statuses ────────────────────────────────────────────
  published:      'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  publishing:     'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  scheduled_post: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',

  // ─── Event / job processing statuses ──────────────────────────────────────
  processing: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  processed:  'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  received:   'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
  queued:     'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
  running:    'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  retrying:   'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  dead:       'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  dlq:        'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  success:    'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  error:      'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',

  // ─── Schema / data statuses ───────────────────────────────────────────────
  registered:   'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  deprecated:   'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  unsupported:  'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  experimental: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',

  // ─── Timecard / exception statuses ────────────────────────────────────────
  exception: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
};

const FALLBACK_CLASS = 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200';

/**
 * Returns a Tailwind class string for a given status value.
 * Case-insensitive. Normalises hyphens → underscores for lookup.
 *
 * Usage:
 *   <Badge className={getStatusBadgeClass(driver.status)}>{driver.status}</Badge>
 */
export function getStatusBadgeClass(
  status: string | null | undefined,
  fallback = FALLBACK_CLASS
): string {
  if (!status) return fallback;
  const normalized = status.toLowerCase().trim().replace(/-/g, '_');
  return (
    STATUS_COLOR_MAP[normalized] ??
    STATUS_COLOR_MAP[status.toLowerCase().trim()] ??
    STATUS_COLOR_MAP[status] ??
    fallback
  );
}

/**
 * Formats a raw status string for display.
 * Converts underscores/hyphens to spaces and title-cases each word.
 */
export function formatStatusLabel(status: string | null | undefined): string {
  if (!status) return '—';
  return status
    .replace(/[_-]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
