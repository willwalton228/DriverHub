# DriverConnect API v1 Contract

> **Single Source of Truth** for the DriverConnect mobile app integration with DriverHub 360.

**Version**: 1.0.0  
**Base URL**: `/api/v1`  
**Authentication**: Replit Auth (session-based)

---

## State Machines

### Assignment State Machine

```
UNASSIGNED ──offer──► OFFERED ──accept──► ASSIGNED
     ▲                    │                    │
     │                    │ decline            │ reassign
     │                    │ expire             │
     │                    ▼                    ▼
     └────────────────────┴────────────── REASSIGNING
                                               │
                                               ▼
                                          CANCELLED
```

| State | Description |
|-------|-------------|
| `UNASSIGNED` | Move is available in queue, no driver assigned |
| `OFFERED` | Move offered to specific driver with TTL countdown |
| `ASSIGNED` | Driver accepted, move is theirs to execute |
| `REASSIGNING` | Move being reassigned to different driver |
| `CANCELLED` | Move cancelled, terminal state |

### Execution State Machine

```
READY ──► EN_ROUTE_PICKUP ──► AT_PICKUP ──► EN_ROUTE_DESTINATION ──► AT_DESTINATION ──► COMPLETED
  │              │                │                  │                     │
  └──────────────┴────────────────┴──────────────────┴─────────────────────┴──► CANCELLED
```

| From State | Allowed Transitions |
|------------|---------------------|
| `READY` | `EN_ROUTE_PICKUP`, `CANCELLED` |
| `EN_ROUTE_PICKUP` | `AT_PICKUP`, `CANCELLED` |
| `AT_PICKUP` | `EN_ROUTE_DESTINATION`, `CANCELLED` |
| `EN_ROUTE_DESTINATION` | `AT_DESTINATION`, `CANCELLED` |
| `AT_DESTINATION` | `COMPLETED`, `CANCELLED` |
| `COMPLETED` | *(terminal)* |
| `CANCELLED` | *(terminal)* |

---

## Endpoints

### READ Endpoints

#### GET /api/v1/me
Returns current authenticated user info.

**Response:**
```json
{
  "user_id": "uuid",
  "email": "driver@example.com",
  "first_name": "John",
  "last_name": "Doe",
  "role": "driver",
  "server_time": "2026-01-26T15:54:00.000Z"
}
```

---

#### GET /api/v1/drivers/me
Returns driver profile for current authenticated user.

**Response:**
```json
{
  "driver_id": "uuid",
  "driver_number": "DRV-001",
  "safety_state": "ACTIVE",
  "driver_type": "full-time",
  "driver_classification": "Employee",
  "market": "DFW",
  "status": "active",
  "server_time": "2026-01-26T15:54:00.000Z"
}
```

**Errors:**
- `NOT_A_DRIVER` - User has no driver profile

---

#### GET /api/v1/moves/assigned
Returns all moves OFFERED or ASSIGNED to current driver.

**Response:**
```json
{
  "moves": [
    {
      "move_id": "uuid",
      "move_number": "MOV-2026-001",
      "assignment_state": "OFFERED",
      "execution_state": "READY",
      "offer_expires_at": "2026-01-26T16:00:00.000Z",
      "server_time": "2026-01-26T15:58:00.000Z",
      "ttl_seconds_remaining": 120,
      
      "market_code": "DFW",
      "zone_code": "DFW01",
      "service_datetime": "2026-01-26T18:00:00.000Z",
      "estimated_minutes_snapshot": 78,
      
      "pay_estimate": {
        "currency": "USD",
        "estimated_total": 42.50,
        "rate_basis": "HOURLY",
        "breakdown": {
          "base": 38.00,
          "wait_time": 4.50
        }
      },
      
      "origin": {
        "address": "123 Main St, Dallas, TX 75201",
        "lat": 32.7767,
        "lng": -96.7970
      },
      "destination": {
        "address": "456 Oak Ave, Irving, TX 75039",
        "lat": 32.8140,
        "lng": -96.9489
      },
      
      "return_to_origin_required": true,
      "wait_time_rules": {
        "pickup_minutes": 10,
        "drop_minutes": 10,
        "return_minutes": 8
      },
      
      "customer_name": "Acme Corp",
      "instructions": "Call on arrival"
    }
  ],
  "count": 1,
  "server_time": "2026-01-26T15:58:00.000Z"
}
```

**Notes:**
- Expired offers are automatically filtered out (TTL enforcement)
- `ttl_seconds_remaining` is `null` for ASSIGNED moves

---

#### GET /api/v1/moves/queue
Returns claimable UNASSIGNED moves filtered by zone/market.

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `zone` | string | Filter by zone code (e.g., `DFW01`) |
| `market` | string | Filter by market code (e.g., `DFW`) |

**Response:**
```json
{
  "moves": [ /* same structure as /assigned */ ],
  "count": 5,
  "filters": {
    "zone": "DFW01",
    "market": null
  },
  "server_time": "2026-01-26T15:58:00.000Z"
}
```

**Errors:**
- `DRIVER_NOT_ELIGIBLE` - Driver safety state prevents work

---

### DISPATCH Endpoints (Corporate/Dispatch Users)

#### POST /api/v1/dispatch/moves/:id/offer
Create an offer for a move to a specific driver.

**Request:**
```json
{
  "driver_id": "uuid",
  "ttl_seconds": 300
}
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `driver_id` | uuid | Yes | - | Target driver to receive offer |
| `ttl_seconds` | integer | No | 300 | TTL in seconds (min 60, max 1800) |

**Response:**
```json
{
  "success": true,
  "move_id": "uuid",
  "driver_id": "uuid",
  "assignment_state": "OFFERED",
  "offered_at": "2026-01-26T15:55:00.000Z",
  "offer_expires_at": "2026-01-26T16:00:00.000Z",
  "ttl_seconds": 300,
  "server_time": "2026-01-26T15:55:00.000Z"
}
```

**Errors:**
- `DRIVER_ID_REQUIRED` (400) - Missing driver_id
- `DRIVER_NOT_FOUND` (404) - Driver not found
- `DRIVER_NOT_ELIGIBLE` (403) - Driver safety state prevents offers
- `MOVE_NOT_FOUND` (404) - Move not found
- `MOVE_NOT_AVAILABLE` (409) - Move not in UNASSIGNED state

---

### WRITE Endpoints (Driver Actions)

#### POST /api/v1/moves/:id/accept
Accept an offered move.

**Request:** *(no body required)*

**Response:**
```json
{
  "success": true,
  "move_id": "uuid",
  "assignment_state": "ASSIGNED",
  "accepted_at": "2026-01-26T15:58:30.000Z",
  "server_time": "2026-01-26T15:58:30.000Z"
}
```

**Errors:**
- `OFFER_EXPIRED` (410) - Offer TTL has passed
- `NOT_OFFERED_TO_YOU` (403) - Move offered to different driver
- `INVALID_STATE` (409) - Move not in OFFERED state

---

#### POST /api/v1/moves/:id/decline
Decline an offered move.

**Request:**
```json
{
  "reason_code": "TOO_FAR",
  "note": "Optional explanation"
}
```

**Valid Reason Codes:**
- `SCHEDULE_CONFLICT`
- `TOO_FAR`
- `PAY_TOO_LOW`
- `VEHICLE_ISSUE`
- `OTHER`

**Response:**
```json
{
  "success": true,
  "move_id": "uuid",
  "assignment_state": "UNASSIGNED",
  "declined_at": "2026-01-26T15:58:30.000Z",
  "server_time": "2026-01-26T15:58:30.000Z"
}
```

**Errors:**
- `REASON_REQUIRED` (400) - Missing reason_code
- `INVALID_REASON_CODE` (400) - Unknown reason_code
- `NOT_OFFERED_TO_YOU` (403) - Move offered to different driver
- `INVALID_STATE` (409) - Move not in OFFERED state

---

#### POST /api/v1/moves/:id/status
Update execution status for an assigned move.

**Request:**
```json
{
  "status": "EN_ROUTE_PICKUP"
}
```

**Response:**
```json
{
  "success": true,
  "move_id": "uuid",
  "execution_state": "EN_ROUTE_PICKUP",
  "previous_state": "READY",
  "updated_at": "2026-01-26T16:00:00.000Z",
  "server_time": "2026-01-26T16:00:00.000Z"
}
```

**Errors:**
- `STATUS_REQUIRED` (400) - Missing status field
- `INVALID_STATUS` (400) - Unknown status value
- `NOT_ASSIGNED` (409) - Move not in ASSIGNED state
- `NOT_ASSIGNED_TO_YOU` (403) - Move assigned to different driver
- `INVALID_TRANSITION` (409) - State transition not allowed

---

## Error Codes Reference

| Code | HTTP | Description |
|------|------|-------------|
| `UNAUTHORIZED` | 401 | Authentication required |
| `NOT_A_DRIVER` | 404 | User has no driver profile |
| `DRIVER_NOT_FOUND` | 404 | Driver record not found |
| `DRIVER_NOT_ELIGIBLE` | 403 | Driver safety state prevents work |
| `MOVE_NOT_FOUND` | 404 | Move ID not found |
| `OFFER_EXPIRED` | 410 | Offer TTL has passed, move returned to queue |
| `NOT_OFFERED_TO_YOU` | 403 | Move was offered to a different driver |
| `NOT_ASSIGNED` | 409 | Move is not in ASSIGNED state |
| `NOT_ASSIGNED_TO_YOU` | 403 | Move is assigned to a different driver |
| `INVALID_STATE` | 409 | Move is not in expected state for this action |
| `INVALID_TRANSITION` | 409 | Requested state transition is not allowed |
| `REASON_REQUIRED` | 400 | Decline requires a reason_code |
| `INVALID_REASON_CODE` | 400 | Unknown decline reason code |
| `STATUS_REQUIRED` | 400 | Status update requires status field |
| `INVALID_STATUS` | 400 | Unknown execution status value |
| `INTERNAL_ERROR` | 500 | Server error |

---

## TTL Enforcement

Offers have a time-to-live (TTL) enforced at **request-time**:

1. When any API reads or writes a move:
   - If `assignment_state = OFFERED` AND `offer_expires_at < now`
   - Auto-transition to `UNASSIGNED`
   - Clear `offered_to_driver_id`, `offer_expires_at`, `offered_at`
   - Write `OFFER_EXPIRED` audit event

2. No background cron required - purely request-driven

3. Expired offers return `410 OFFER_EXPIRED` on accept attempts

---

## Audit Events

All offer lifecycle events are logged to `move_offer_audit`:

| Event Type | Trigger |
|------------|---------|
| `OFFERED` | Dispatcher creates offer |
| `ACCEPTED` | Driver accepts offer |
| `DECLINED` | Driver declines offer |
| `EXPIRED` | TTL enforcement triggered |
| `STATUS_UPDATE` | Execution state changed |
| `REASSIGNED` | Move reassigned to different driver |
| `CANCELLED` | Move cancelled |

---

## Pay Estimate (Informational)

The `pay_estimate` object in move payloads is **informational only**:

- Shows estimated pay to help driver decision-making
- Does NOT affect actual payroll calculations
- Actual pay determined by DriverHub pay period logic

```json
{
  "pay_estimate": {
    "currency": "USD",
    "estimated_total": 42.50,
    "rate_basis": "HOURLY",
    "breakdown": {
      "base": 38.00,
      "wait_time": 4.50
    }
  }
}
```
