/**
 * DriverConnect API v1 — Documentation & QA Support Routes
 *
 * GET  /api/v1/docs                  → Interactive Swagger UI
 * GET  /api/v1/docs/payloads         → Sample payload library (JSON)
 * GET  /api/v1/docs/postman          → Importable Postman v2.1 collection
 * GET  /api/v1/docs/uat-scenarios    → Structured UAT test scenarios
 * GET  /api/v1/docs/error-codes      → Error code reference
 * GET  /api/v1/docs/dto-contracts    → TypeScript DTO contract definitions
 */
import { Router, Request, Response } from 'express';

const router = Router();

// ─── BASE URL HELPER ─────────────────────────────────────────────────────────
const baseUrl = (req: Request) => `${req.protocol}://${req.get('host')}/api/v1`;

// ─────────────────────────────────────────────────────────────────────────────
// 1. SWAGGER UI
// ─────────────────────────────────────────────────────────────────────────────
router.get('/docs', (req: Request, res: Response) => {
  const specUrl = `${baseUrl(req)}/openapi.json`;
  res.setHeader('Content-Type', 'text/html');
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>DriverHub 360 — DriverConnect API v1</title>
  <meta name="description" content="Interactive API documentation for the DriverConnect Integration API v1 — versioned machine-to-machine API for driver operations, dispatch, execution events, and financial sync." />
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui.css" />
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f0f0f; }
    #swagger-header {
      background: linear-gradient(135deg, #FF6B35 0%, #e85d2a 100%);
      color: #fff;
      padding: 20px 32px;
      display: flex;
      align-items: center;
      gap: 20px;
      box-shadow: 0 2px 12px rgba(0,0,0,0.3);
    }
    #swagger-header .logo { font-size: 22px; font-weight: 800; letter-spacing: -0.5px; }
    #swagger-header .version-badge {
      background: rgba(255,255,255,0.2);
      border-radius: 4px;
      padding: 2px 10px;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.5px;
    }
    #swagger-header .links { margin-left: auto; display: flex; gap: 16px; font-size: 13px; }
    #swagger-header .links a { color: rgba(255,255,255,0.85); text-decoration: none; }
    #swagger-header .links a:hover { color: #fff; }
    #swagger-ui { background: #fff; min-height: calc(100vh - 70px); }
    .swagger-ui .topbar { display: none; }
    .swagger-ui .info .title { color: #1a1a1a; }
    .swagger-ui .scheme-container { background: #f8f8f8; }
  </style>
</head>
<body>
  <div id="swagger-header">
    <div class="logo">DriverHub 360</div>
    <div class="version-badge">DriverConnect API v1</div>
    <div class="links">
      <a href="/api/v1/docs/payloads" target="_blank">Sample Payloads</a>
      <a href="/api/v1/docs/postman" download="DriverConnect-API-v1.postman_collection.json">Postman Collection</a>
      <a href="/api/v1/docs/uat-scenarios" target="_blank">UAT Scenarios</a>
      <a href="/api/v1/docs/error-codes" target="_blank">Error Codes</a>
    </div>
  </div>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui-bundle.js"></script>
  <script src="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui-standalone-preset.js"></script>
  <script>
    SwaggerUIBundle({
      url: "${specUrl}",
      dom_id: '#swagger-ui',
      presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
      plugins: [SwaggerUIBundle.plugins.DownloadUrl],
      layout: 'StandaloneLayout',
      deepLinking: true,
      displayRequestDuration: true,
      filter: true,
      tryItOutEnabled: true,
      requestInterceptor: (request) => {
        // Prefer Authorization: Bearer (DriverConnect standard); fall back to X-API-Key (legacy)
        if (!request.headers['Authorization'] && !request.headers['X-API-Key']) {
          const key = window._apiKey || localStorage.getItem('driverhub_api_key') || '';
          if (key) request.headers['Authorization'] = 'Bearer ' + key;
        }
        return request;
      },
      onComplete: () => {
        const stored = localStorage.getItem('driverhub_api_key');
        if (stored) window._apiKey = stored;
        const input = document.querySelector('.auth-container input');
        if (input && stored) input.value = stored;
      },
      persistAuthorization: true,
      showExtensions: true,
      showCommonExtensions: true,
      defaultModelsExpandDepth: 2,
      defaultModelExpandDepth: 3,
      docExpansion: 'list',
      tagsSorter: 'alpha',
      operationsSorter: (a, b) => {
        const order = ['GET','POST','PUT','PATCH','DELETE'];
        return order.indexOf(a.get('method').toUpperCase()) - order.indexOf(b.get('method').toUpperCase());
      },
    });
  </script>
</body>
</html>`);
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. SAMPLE PAYLOAD LIBRARY
// ─────────────────────────────────────────────────────────────────────────────
const SAMPLE_PAYLOADS = {
  _meta: {
    version: 'v1',
    description: 'Curated sample request and response payloads for the DriverConnect Integration API.',
    testApiKey: 'dhk_live_<your-api-key>',
    baseUrl: '/api/v1',
    note: 'Replace placeholder IDs with real IDs from your environment. Use GET /drivers, GET /accounts to obtain valid IDs.',
  },
  authentication: {
    description: 'All authenticated endpoints require a token. Two schemes accepted (choose one):',
    schemes: {
      bearer_preferred: { header: 'Authorization', value: 'Bearer dhk_live_<your-api-key>', note: 'DriverConnect standard — preferred' },
      legacy_compat:    { header: 'X-API-Key',     value: 'dhk_live_<your-api-key>',        note: 'Backward-compatible legacy header' },
    },
    optional_headers: {
      'X-Tenant-Id':      'Org UUID — validated against token org when provided',
      'X-Idempotency-Key':'UUID v4 — required on transactional POST endpoints for replay safety',
    },
    key_info_response: {
      success: true,
      data: {
        key_id: '8e0d8245-a449-4625-a573-af51d8c78c58',
        key_name: 'DriverConnect Mobile v1',
        org_id: '26c087eb-0d86-4a4c-b48e-e2049323ccfd',
        tenant_id: '26c087eb-0d86-4a4c-b48e-e2049323ccfd',
        scopes: ['read:moves', 'write:execution', 'read:drivers', 'manage:webhooks', 'read:invoices', 'write:time', 'write:expenses'],
        auth: { accepted_schemes: ['Authorization: Bearer <token>', 'X-API-Key: <token>'] },
      },
      meta: { requestId: 'req_lc2xw8k12ab4', timestamp: '2026-03-14T08:00:00.000Z' },
    },
  },
  execution_events: {
    description: 'State-machine events from the mobile app. Must follow valid transitions.',
    state_machine: {
      READY: ['EN_ROUTE_PICKUP', 'CANCELLED'],
      EN_ROUTE_PICKUP: ['AT_PICKUP', 'CANCELLED'],
      AT_PICKUP: ['EN_ROUTE_DESTINATION', 'CANCELLED'],
      EN_ROUTE_DESTINATION: ['AT_DESTINATION', 'CANCELLED'],
      AT_DESTINATION: ['COMPLETED', 'CANCELLED'],
    },
    en_route_pickup: {
      request: {
        method: 'POST', path: '/api/v1/execution-events',
        headers: {
          'Authorization': 'Bearer dhk_live_<key>',
          'Content-Type': 'application/json',
          'X-Tenant-Id': '26c087eb-0d86-4a4c-b48e-e2049323ccfd',
          'X-Idempotency-Key': 'mobile-evt-df75-2e36-EN_ROUTE-20260314T090130',
        },
        body: {
          eventType: 'EN_ROUTE_PICKUP',
          moveId: '2e3686d6-0000-0000-0000-000000000001',
          driverId: 'df7569d6-0000-0000-0000-000000000001',
          timestamp: '2026-03-14T09:01:30Z',
          location: { lat: 41.8498, lng: -87.6396, accuracy: 5.2 },
          notes: 'Departing depot now',
        },
      },
      response_201: {
        success: true,
        data: {
          id: 'ee-abc123', moveId: '2e3686d6-0000-0000-0000-000000000001',
          eventType: 'EN_ROUTE_PICKUP', previousState: 'READY', newState: 'EN_ROUTE_PICKUP',
          timestamp: '2026-03-14T09:01:30Z', isDuplicate: false,
        },
        meta: { requestId: 'req_lc2xw8k12ab4', timestamp: '2026-03-14T09:01:30.000Z' },
      },
      response_409_invalid_transition: {
        success: false,
        error: { code: 'INVALID_TRANSITION', message: 'Cannot transition from AT_DESTINATION to EN_ROUTE_PICKUP.' },
        meta: { requestId: 'req_lc2xw8k12ab5', timestamp: '2026-03-14T09:01:30.000Z' },
      },
      response_409_duplicate: {
        success: true,
        data: { isDuplicate: true, message: 'Idempotency key already processed. Returning original record.' },
        meta: { requestId: 'req_lc2xw8k12ab6', timestamp: '2026-03-14T09:01:30.000Z' },
      },
    },
    completed: {
      request: {
        method: 'POST', path: '/api/v1/execution-events',
        body: {
          eventType: 'COMPLETED',
          moveId: '2e3686d6-0000-0000-0000-000000000001',
          driverId: 'df7569d6-0000-0000-0000-000000000001',
          timestamp: '2026-03-14T12:05:00Z',
          idempotencyKey: 'mobile-evt-df75-2e36-COMPLETED-20260314T120500',
        },
      },
    },
    driver_declined: {
      request: {
        method: 'POST', path: '/api/v1/execution-events',
        body: {
          eventType: 'DECLINED',
          moveId: '2e3686d6-0000-0000-0000-000000000001',
          driverId: 'df7569d6-0000-0000-0000-000000000001',
          timestamp: '2026-03-14T08:10:00Z',
          idempotencyKey: 'mobile-evt-df75-2e36-DECLINED-20260314T081000',
          notes: 'Vehicle issue — cannot accept this trip',
        },
      },
    },
  },
  exceptions: {
    description: 'Field exceptions reported by drivers. Severity levels: LOW, MEDIUM, HIGH, CRITICAL.',
    vehicle_breakdown: {
      request: {
        method: 'POST', path: '/api/v1/exceptions',
        body: {
          moveId: '2e3686d6-0000-0000-0000-000000000001',
          driverId: 'df7569d6-0000-0000-0000-000000000001',
          reasonCode: 'VEHICLE_BREAKDOWN',
          severity: 'HIGH',
          notes: 'Right rear tire blew out on I-90 near exit 48. Vehicle is safe. Requesting roadside.',
          photoUrl: 'https://storage.driverhub.io/exceptions/exc-df75-20260314-blowout.jpg',
          location: { lat: 41.8801, lng: -87.7390, address: 'I-90 W near Exit 48, Chicago, IL' },
        },
      },
      response_201: {
        success: true,
        data: {
          id: 'exc-xyz789', moveId: '2e3686d6-0000-0000-0000-000000000001',
          driverId: 'df7569d6-0000-0000-0000-000000000001',
          reasonCode: 'VEHICLE_BREAKDOWN', severity: 'HIGH',
          reportedAt: '2026-03-14T10:45:00Z',
        },
      },
    },
    customer_unavailable: {
      request: {
        method: 'POST', path: '/api/v1/exceptions',
        body: {
          moveId: '2e3686d6-0000-0000-0000-000000000001',
          driverId: 'df7569d6-0000-0000-0000-000000000001',
          reasonCode: 'CUSTOMER_UNAVAILABLE', severity: 'MEDIUM',
          notes: 'Waited 15 minutes. No one at delivery address. Attempting to call.',
        },
      },
    },
  },
  driver_status: {
    description: 'Driver duty status updates from the mobile app.',
    clock_on: {
      request: {
        method: 'POST', path: '/api/v1/driver-status-events',
        body: {
          driverId: 'df7569d6-0000-0000-0000-000000000001',
          status: 'ON_DUTY',
          timestamp: '2026-03-14T07:00:00Z',
          location: { lat: 41.8498, lng: -87.6396 },
          notes: 'Reporting for morning shift',
        },
      },
    },
    available: {
      request: {
        method: 'POST', path: '/api/v1/driver-status-events',
        body: { driverId: 'df7569d6-0000-0000-0000-000000000001', status: 'AVAILABLE', timestamp: '2026-03-14T07:05:00Z' },
      },
    },
  },
  time_events: {
    description: 'Clock events for time-tracking. Use unique idempotencyKey per event.',
    clock_in: {
      request: {
        method: 'POST', path: '/api/v1/time-events',
        body: {
          driverId: 'df7569d6-0000-0000-0000-000000000001',
          eventType: 'CLOCK_IN',
          timestamp: '2026-03-14T07:02:00Z',
          idempotencyKey: 'mobile-clock-in-df75-20260314T070200',
          notes: 'Arrived at depot',
        },
      },
      response_201: {
        success: true,
        data: {
          id: 1042, driverId: 'df7569d6-0000-0000-0000-000000000001',
          eventType: 'CLOCK_IN', timestamp: '2026-03-14T07:02:00Z',
          idempotencyKey: 'mobile-clock-in-df75-20260314T070200',
          isDuplicate: false, createdAt: '2026-03-14T07:02:01Z',
        },
      },
    },
    clock_out: {
      request: {
        method: 'POST', path: '/api/v1/time-events',
        body: {
          driverId: 'df7569d6-0000-0000-0000-000000000001',
          eventType: 'CLOCK_OUT',
          timestamp: '2026-03-14T17:05:00Z',
          idempotencyKey: 'mobile-clock-out-df75-20260314T170500',
        },
      },
    },
    shift_entry_manual: {
      description: 'Backfill shift entry — used when driver forgets to clock in/out',
      request: {
        method: 'POST', path: '/api/v1/time-events',
        body: {
          driverId: 'df7569d6-0000-0000-0000-000000000001',
          eventType: 'SHIFT_ENTRY',
          timestamp: '2026-03-13T07:00:00Z',
          idempotencyKey: 'backfill-shift-df75-20260313T070000',
          notes: 'Manual backfill approved by dispatcher Jordan Walsh',
        },
      },
    },
  },
  expense_events: {
    description: 'Expense claims from drivers. Categories: FUEL, TOLLS, PARKING, MILEAGE, MEALS, LODGING, MAINTENANCE, OTHER. Max $50,000.',
    fuel: {
      request: {
        method: 'POST', path: '/api/v1/expense-events',
        body: {
          driverId: 'df7569d6-0000-0000-0000-000000000001',
          category: 'FUEL',
          amount: 82.50,
          currency: 'USD',
          receiptUrl: 'https://storage.driverhub.io/receipts/rcpt-2026-0314-df75.jpg',
          description: 'Fill-up at Pilot Flying J — I-90 Exit 48',
          expenseDate: '2026-03-14',
          idempotencyKey: 'mobile-expense-df75-FUEL-20260314T082501',
        },
      },
    },
    tolls: {
      request: {
        method: 'POST', path: '/api/v1/expense-events',
        body: {
          driverId: 'df7569d6-0000-0000-0000-000000000001',
          category: 'TOLLS',
          amount: 14.25,
          currency: 'USD',
          description: 'I-90 tollway — Chicago to Rockford',
          expenseDate: '2026-03-14',
          idempotencyKey: 'mobile-expense-df75-TOLLS-20260314T093000',
        },
      },
    },
  },
  proof_of_delivery: {
    description: 'Proof of delivery submission. Required after COMPLETED execution event.',
    submit_pod: {
      request: {
        method: 'POST', path: '/api/v1/documents/pod',
        body: {
          moveId: '2e3686d6-0000-0000-0000-000000000001',
          driverId: 'df7569d6-0000-0000-0000-000000000001',
          photoUrl: 'https://storage.driverhub.io/pod/pod-2e36-20260314-120300.jpg',
          signatureUrl: null,
          recipientName: 'Alex Thompson',
          notes: 'Left at reception desk — checked in with security',
          capturedAt: '2026-03-14T12:03:00Z',
        },
      },
      response_201: {
        success: true,
        data: {
          id: 'doc-abc001', moveId: '2e3686d6-0000-0000-0000-000000000001',
          docType: 'POD', photoUrl: 'https://storage.driverhub.io/pod/pod-2e36-20260314-120300.jpg',
          recipientName: 'Alex Thompson', capturedAt: '2026-03-14T12:03:00Z',
        },
      },
    },
  },
  dispatch: {
    assign_driver: {
      request: {
        method: 'POST', path: '/api/v1/dispatch/assign',
        body: {
          moveId: '2e3686d6-0000-0000-0000-000000000001',
          driverId: 'df7569d6-0000-0000-0000-000000000001',
          notes: 'Driver confirmed via phone',
          offerMode: false,
        },
      },
    },
    reassign_driver: {
      request: {
        method: 'POST', path: '/api/v1/dispatch/reassign',
        body: {
          moveId: '2e3686d6-0000-0000-0000-000000000001',
          newDriverId: '2528e4c0-0000-0000-0000-000000000002',
          reason: 'Original driver vehicle breakdown',
        },
      },
    },
  },
  webhooks: {
    description: 'Webhook endpoints receive POST requests signed with HMAC-SHA256.',
    register_endpoint: {
      request: {
        method: 'POST', path: '/api/v1/webhooks',
        body: {
          name: 'DriverConnect Mobile App Webhook',
          url: 'https://your-app.example.com/webhooks/driverhub',
          events: ['move.created', 'trip.completed', 'driver.status_changed', 'exception.opened', 'pod.submitted'],
          description: 'Primary webhook for DriverConnect mobile app integration',
        },
      },
      response_201: {
        success: true,
        data: {
          id: 'wh-0001-uuid',
          name: 'DriverConnect Mobile App Webhook',
          url: 'https://your-app.example.com/webhooks/driverhub',
          events: ['move.created', 'trip.completed', 'driver.status_changed', 'exception.opened', 'pod.submitted'],
          isActive: true,
          secret: '<generated-on-create>',
          createdAt: '2026-03-14T09:00:00Z',
        },
        _note: 'The secret is returned ONCE on creation. Store it securely — it cannot be retrieved again.',
      },
    },
    wildcard_subscription: {
      description: 'Subscribe to all 18 event types at once',
      request: {
        method: 'POST', path: '/api/v1/webhooks',
        body: {
          name: 'All-events Webhook',
          url: 'https://your-app.example.com/webhooks/driverhub-all',
          events: ['*'],
        },
      },
    },
    verification_code: {
      language: 'javascript (Node.js)',
      code: `const crypto = require('crypto');

function verifyDriverHubWebhook(rawBody, signatureHeader, endpointSecret) {
  const expected = 'sha256=' + crypto
    .createHmac('sha256', endpointSecret)
    .update(rawBody, 'utf8')
    .digest('hex');
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader),
      Buffer.from(expected)
    );
  } catch {
    return false;
  }
}

// Express.js handler example:
app.post('/webhooks/driverhub', express.raw({ type: 'application/json' }), (req, res) => {
  const sig = req.headers['x-driverhub-signature-256'];
  const secret = process.env.DRIVERHUB_WEBHOOK_SECRET;
  if (!verifyDriverHubWebhook(req.body, sig, secret)) {
    return res.status(401).send('Invalid signature');
  }
  const event = JSON.parse(req.body);
  console.log('Event received:', event.event, event.id);
  res.json({ received: true }); // Respond 200 within 10s
});`,
    },
    example_payloads: {
      'move.created': {
        eventId: 'wh_0a1b2c3d4e5f6a7b',
        eventType: 'move.created',
        occurredAt: '2026-03-14T09:01:30Z',
        tenantId: '26c087eb-0d86-4a4c-b48e-e2049323ccfd',
        data: {
          moveId: '2e3686d6-0000-0000-0000-000000000001',
          accountId: '9379dd64-0000-0000-0000-000000000001',
          driverId: null,
          status: 'READY',
          assignmentState: 'UNASSIGNED',
          scheduledAt: '2026-03-14T09:00:00Z',
          pickupAddress: '1600 S Canal St, Chicago, IL 60616',
          deliveryAddress: '875 N Michigan Ave, Chicago, IL 60611',
        },
      },
      'trip.assigned': {
        eventId: 'wh_a1b2c3d4e5f60011',
        eventType: 'trip.assigned',
        occurredAt: '2026-03-14T09:05:00Z',
        tenantId: '26c087eb-0d86-4a4c-b48e-e2049323ccfd',
        data: {
          moveId: '2e3686d6-0000-0000-0000-000000000001',
          status: 'assigned',
          driverId: 'df7569d6-0000-0000-0000-000000000001',
          driverName: 'Alex Johnson',
        },
      },
      'trip.reassigned': {
        eventId: 'wh_b2c3d4e5f6a70022',
        eventType: 'trip.reassigned',
        occurredAt: '2026-03-14T10:15:00Z',
        tenantId: '26c087eb-0d86-4a4c-b48e-e2049323ccfd',
        data: {
          moveId: '2e3686d6-0000-0000-0000-000000000001',
          status: 'assigned',
          driverId: 'df7569d6-0000-0000-0000-000000000002',
          driverName: 'Maria Garcia',
          previousDriverId: 'df7569d6-0000-0000-0000-000000000001',
        },
      },
      'trip.completed': {
        eventId: 'wh_1b2c3d4e5f6a7b8c',
        eventType: 'trip.completed',
        occurredAt: '2026-03-14T12:05:30Z',
        tenantId: '26c087eb-0d86-4a4c-b48e-e2049323ccfd',
        data: {
          moveId: '2e3686d6-0000-0000-0000-000000000001',
          driverId: 'df7569d6-0000-0000-0000-000000000001',
          currentStatus: 'COMPLETED',
          recordedAt: '2026-03-14T12:05:00Z',
        },
      },
      'driver.status_changed': {
        eventId: 'wh_2c3d4e5f6a7b8c9d',
        eventType: 'driver.status_changed',
        occurredAt: '2026-03-14T07:00:30Z',
        tenantId: '26c087eb-0d86-4a4c-b48e-e2049323ccfd',
        data: {
          driverId: 'df7569d6-0000-0000-0000-000000000001',
          previousStatus: 'OFF_DUTY',
          status: 'ON_DUTY',
          reason: 'start_of_shift',
          recordedAt: '2026-03-14T07:00:00Z',
        },
      },
      'exception.opened': {
        eventId: 'wh_3d4e5f6a7b8c9d0e',
        eventType: 'exception.opened',
        occurredAt: '2026-03-14T10:45:30Z',
        tenantId: '26c087eb-0d86-4a4c-b48e-e2049323ccfd',
        data: {
          exceptionId: 'exc-xyz789',
          moveId: '2e3686d6-0000-0000-0000-000000000001',
          driverId: 'df7569d6-0000-0000-0000-000000000001',
          reasonCode: 'VEHICLE_BREAKDOWN',
          severity: 'HIGH',
          openedAt: '2026-03-14T10:45:00Z',
        },
      },
      'pod.submitted': {
        eventId: 'wh_4e5f6a7b8c9d0e1f',
        eventType: 'pod.submitted',
        occurredAt: '2026-03-14T12:03:30Z',
        tenantId: '26c087eb-0d86-4a4c-b48e-e2049323ccfd',
        data: {
          documentId: 'doc-abc001',
          moveId: '2e3686d6-0000-0000-0000-000000000001',
          driverId: 'df7569d6-0000-0000-0000-000000000001',
          photoUrl: 'https://storage.driverhub.io/pod/pod-2e36-20260314-120300.jpg',
          recipientName: 'Alex Thompson',
          capturedAt: '2026-03-14T12:03:00Z',
        },
      },
      'payment.updated': {
        eventId: 'wh_5f6a7b8c9d0e1f2a',
        eventType: 'payment.updated',
        occurredAt: '2026-03-15T14:00:30Z',
        tenantId: '26c087eb-0d86-4a4c-b48e-e2049323ccfd',
        data: {
          paymentId: 'pay-0001',
          invoiceId: 'inv-0001',
          accountId: '9379dd64-0000-0000-0000-000000000001',
          amount: 1250.00,
          currency: 'USD',
          status: 'paid',
          paidAt: '2026-03-15T14:00:00Z',
        },
      },
    },
  },
  error_responses: {
    '400_validation': {
      error: 'VALIDATION_ERROR',
      message: 'Request body validation failed.',
      details: [
        { field: 'driverId', message: 'Required field missing' },
        { field: 'amount', message: 'Must be a number between 0.01 and 50000' },
      ],
    },
    _format_note: 'All error responses follow: { success: false, error: { code, message, details? }, meta: { requestId, timestamp } }',
    '401_missing_token': {
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required. Provide Authorization: Bearer <token> or X-API-Key header.' },
      meta: { requestId: 'req_lc2xw8k12ab4', timestamp: '2026-03-14T08:00:00.000Z' },
    },
    '401_invalid_token': {
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'The provided token is invalid or has been revoked.' },
      meta: { requestId: 'req_lc2xw8k12ab5', timestamp: '2026-03-14T08:00:00.000Z' },
    },
    '401_token_expired': {
      success: false,
      error: { code: 'TOKEN_EXPIRED', message: 'The provided token has expired. Contact your administrator to issue a new key.' },
      meta: { requestId: 'req_lc2xw8k12ab6', timestamp: '2026-03-14T08:00:00.000Z' },
    },
    '403_tenant_mismatch': {
      success: false,
      error: { code: 'TENANT_MISMATCH', message: 'X-Tenant-Id does not match the organization associated with this token.' },
      meta: { requestId: 'req_lc2xw8k12ab7', timestamp: '2026-03-14T08:00:00.000Z' },
    },
    '403_scope': {
      success: false,
      error: { code: 'INSUFFICIENT_SCOPE', message: "This operation requires the 'write:execution' scope.", required_scope: 'write:execution' },
      meta: { requestId: 'req_lc2xw8k12ab8', timestamp: '2026-03-14T08:00:00.000Z' },
    },
    '400_validation': {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request body validation failed.',
        details: [
          { field: 'driverId', message: 'Required field missing' },
          { field: 'amount', message: 'Must be a number between 0.01 and 50000' },
        ],
      },
      meta: { requestId: 'req_lc2xw8k12ab9', timestamp: '2026-03-14T08:00:00.000Z' },
    },
    '404_not_found': {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Move 2e3686d6-0000-0000-0000-000000000001 not found.' },
      meta: { requestId: 'req_lc2xw8k12aba', timestamp: '2026-03-14T08:00:00.000Z' },
    },
    '409_invalid_transition': {
      success: false,
      error: { code: 'INVALID_TRANSITION', message: 'Cannot transition from COMPLETED to EN_ROUTE_PICKUP.' },
      meta: { requestId: 'req_lc2xw8k12abb', timestamp: '2026-03-14T08:00:00.000Z' },
    },
    '409_duplicate_key': {
      success: true,
      data: { isDuplicate: true, message: 'Idempotency key already processed. Returning original record.' },
      meta: { requestId: 'req_lc2xw8k12abc', timestamp: '2026-03-14T08:00:00.000Z' },
    },
    '422_business_rule': {
      success: false,
      error: { code: 'UNPROCESSABLE', message: 'Driver is not in AVAILABLE status and cannot be assigned.' },
      meta: { requestId: 'req_lc2xw8k12abd', timestamp: '2026-03-14T08:00:00.000Z' },
    },
    '429_rate_limit': {
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests. Limit: 600/min.',
        retry_after_seconds: 42,
      },
      meta: { requestId: 'req_lc2xw8k12abe', timestamp: '2026-03-14T08:00:00.000Z' },
    },
  },
};

router.get('/docs/payloads', (_req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.json({ success: true, data: SAMPLE_PAYLOADS });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. POSTMAN COLLECTION v2.1
// ─────────────────────────────────────────────────────────────────────────────
function buildPostmanCollection(req: Request) {
  const base = '{{baseUrl}}';
  const apiKey = '{{apiKey}}';

  const authHeader = { key: 'Authorization', value: `Bearer ${apiKey}`, type: 'text' };
  const tenantHeader = { key: 'X-Tenant-Id', value: '{{tenantId}}', type: 'text' };
  const idempHeader   = { key: 'X-Idempotency-Key', value: '{{$guid}}', type: 'text' };
  const jsonHeader = { key: 'Content-Type', value: 'application/json', type: 'text' };

  const item = (name: string, method: string, path: string, body?: object, desc?: string) => {
    const isPost = method === 'POST' || method === 'PUT' || method === 'PATCH';
    return {
      name,
      request: {
        method,
        header: [
          authHeader,
          tenantHeader,
          ...(isPost ? [idempHeader, jsonHeader] : []),
        ],
        body: body ? { mode: 'raw', raw: JSON.stringify(body, null, 2), options: { raw: { language: 'json' } } } : undefined,
        url: { raw: `${base}${path}`, host: ['{{baseUrl}}'], path: path.split('/').filter(Boolean) },
        description: desc,
      },
      response: [],
    };
  };

  const folder = (name: string, desc: string, items: object[]) => ({
    name, description: desc,
    item: items,
  });

  const execEventBody = (eventType: string, extra?: object) => ({
    eventType,
    moveId: '{{moveId}}',
    driverId: '{{driverId}}',
    timestamp: new Date().toISOString(),
    idempotencyKey: `mobile-evt-{{$guid}}-${eventType}`,
    ...extra,
  });

  return {
    info: {
      name: 'DriverConnect Integration API v1',
      description: `DriverHub 360 — DriverConnect Integration API v1\n\nAuthentication (set the apiKey variable — used in: Authorization: Bearer {{apiKey}}):\n  Preferred: Authorization: Bearer <token>\n  Legacy:    X-API-Key: <token>\n\nOther variables:\n  tenantId — your org UUID (goes in X-Tenant-Id header; optional but recommended)\n  X-Idempotency-Key — auto-generated per request via {{$guid}}\n\nBase URL: Set baseUrl, e.g. https://your-host/api/v1\n\nResponse envelope:\n  Success:  { success: true, data: {...}, meta: { requestId, timestamp } }\n  Paginated: meta also includes { page, pageSize, total, hasMore }\n  Error:    { success: false, error: { code, message, details? }, meta: { requestId, timestamp } }\n\nTest IDs (sandbox):\n  accountId: 9379dd64-0000-0000-0000-000000000001\n  driverId:  df7569d6-0000-0000-0000-000000000001\n  moveId:    <get from GET /moves>\n  webhookId: <created via POST /webhooks>`,
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
      version: { major: 1, minor: 0, patch: 0 },
    },
    variable: [
      { key: 'baseUrl',    value: `${req.protocol}://${req.get('host')}/api/v1`, type: 'string' },
      { key: 'apiKey',     value: 'dhk_live_<your-api-key>',                     type: 'string',
        description: 'Used as: Authorization: Bearer {{apiKey}}. Also accepted via X-API-Key header.' },
      { key: 'tenantId',   value: '26c087eb-0d86-4a4c-b48e-e2049323ccfd',        type: 'string',
        description: 'Your org UUID — sent as X-Tenant-Id header. Optional but recommended.' },
      { key: 'accountId',  value: '9379dd64-0000-0000-0000-000000000001',         type: 'string' },
      { key: 'driverId',   value: 'df7569d6-0000-0000-0000-000000000001',         type: 'string' },
      { key: 'moveId',     value: '<replace-with-real-move-id>',                  type: 'string' },
      { key: 'webhookId',  value: '<replace-after-POST-/webhooks>',               type: 'string' },
      { key: 'deliveryId', value: '<replace-with-delivery-id>',                   type: 'string' },
    ],
    item: [
      folder('System', 'Health check and API metadata', [
        item('Health Check', 'GET', '/health', undefined, 'No auth required. Confirms API is running.'),
        item('Key Info', 'GET', '/key-info', undefined, 'Returns metadata for the authenticated API key, including scopes.'),
        item('Event Types Reference', 'GET', '/event-types', undefined, 'All valid event codes, state machine transitions, and enum values.'),
      ]),
      folder('Master Data', 'Reference data — drivers, accounts, locations, moves', [
        item('List Drivers', 'GET', '/drivers', undefined),
        item('Get Driver', 'GET', '/drivers/{{driverId}}', undefined),
        item('List Accounts', 'GET', '/accounts', undefined),
        item('Get Account', 'GET', '/accounts/{{accountId}}', undefined),
        item('Get Contract Products', 'GET', '/accounts/{{accountId}}/contract-products', undefined, 'Requires read:accounts. Returns active, effective account products and DriverDash pricing applicability.'),
        item('List Moves', 'GET', '/moves', undefined),
        item('Get Move', 'GET', '/moves/{{moveId}}', undefined),
        item('List Locations', 'GET', '/locations', undefined),
        item('List Service Types', 'GET', '/service-types', undefined),
        item('List Schedules', 'GET', '/schedules', undefined),
        item('List Users', 'GET', '/users', undefined),
      ]),
      folder('Operations — Bookings', 'Create and manage trip bookings', [
        item('List Bookings', 'GET', '/bookings', undefined),
        item('Create Booking', 'POST', '/bookings', {
          accountId: '{{accountId}}',
          serviceTypeId: '<service-type-id>',
          pickupAddress: '1600 S Canal St, Chicago, IL 60616',
          deliveryAddress: '875 N Michigan Ave, Chicago, IL 60611',
          scheduledAt: '2026-03-14T09:00:00Z',
          notes: 'Fragile — handle with care',
        }),
        item('Get Booking', 'GET', '/bookings/{{moveId}}', undefined),
        item('Cancel Booking', 'PATCH', '/bookings/{{moveId}}/status', { status: 'CANCELLED', reason: 'Customer cancelled' }),
      ]),
      folder('Operations — Dispatch', 'Assign and reassign drivers to moves', [
        item('Dispatch Queue', 'GET', '/dispatch', undefined, 'Unassigned moves ready for dispatch'),
        item('Assign Driver', 'POST', '/dispatch/assign', {
          moveId: '{{moveId}}',
          driverId: '{{driverId}}',
          offerMode: false,
          notes: 'Driver confirmed via phone',
        }),
        item('Reassign Driver', 'POST', '/dispatch/reassign', {
          moveId: '{{moveId}}',
          newDriverId: '<new-driver-id>',
          reason: 'Original driver vehicle breakdown',
        }),
        item('Dispatch History', 'GET', '/dispatch/history/{{moveId}}', undefined),
      ]),
      folder('Execution Events', 'State machine events from the mobile app', [
        item('EN_ROUTE_PICKUP', 'POST', '/execution-events', execEventBody('EN_ROUTE_PICKUP', { notes: 'Departing depot now' })),
        item('AT_PICKUP', 'POST', '/execution-events', execEventBody('AT_PICKUP')),
        item('EN_ROUTE_DESTINATION', 'POST', '/execution-events', execEventBody('EN_ROUTE_DESTINATION')),
        item('AT_DESTINATION', 'POST', '/execution-events', execEventBody('AT_DESTINATION')),
        item('COMPLETED', 'POST', '/execution-events', execEventBody('COMPLETED')),
        item('CANCELLED', 'POST', '/execution-events', execEventBody('CANCELLED', { notes: 'Customer cancelled at pickup' })),
        item('ACCEPTED (offer)', 'POST', '/execution-events', execEventBody('ACCEPTED')),
        item('DECLINED (offer)', 'POST', '/execution-events', execEventBody('DECLINED', { notes: 'Too far from current location' })),
        item('List Execution Events', 'GET', '/execution-events', undefined),
        item('Move Execution History', 'GET', '/execution-events/{{moveId}}/history', undefined),
        item('Log Exception', 'POST', '/exceptions', {
          moveId: '{{moveId}}',
          driverId: '{{driverId}}',
          reasonCode: 'VEHICLE_BREAKDOWN',
          severity: 'HIGH',
          notes: 'Right rear tire blew out on I-90 near exit 48. Vehicle is safe.',
          location: { lat: 41.8801, lng: -87.7390 },
        }),
        item('List Exceptions', 'GET', '/exceptions', undefined),
      ]),
      folder('Driver Status', 'Duty status updates from the mobile app', [
        item('Update Status: ON_DUTY', 'POST', '/driver-status-events', {
          driverId: '{{driverId}}', status: 'ON_DUTY',
          timestamp: new Date().toISOString(),
          location: { lat: 41.8498, lng: -87.6396 },
        }),
        item('Update Status: AVAILABLE', 'POST', '/driver-status-events', {
          driverId: '{{driverId}}', status: 'AVAILABLE', timestamp: new Date().toISOString(),
        }),
        item('Update Status: OFF_DUTY', 'POST', '/driver-status-events', {
          driverId: '{{driverId}}', status: 'OFF_DUTY', timestamp: new Date().toISOString(),
        }),
        item('List Driver Status Events', 'GET', '/driver-status-events', undefined),
      ]),
      folder('Time & Expense', 'Clock events and expense claims from the mobile app', [
        item('Clock In', 'POST', '/time-events', {
          driverId: '{{driverId}}', eventType: 'CLOCK_IN',
          timestamp: new Date().toISOString(),
          idempotencyKey: 'mobile-clock-in-{{$guid}}',
        }),
        item('Clock Out', 'POST', '/time-events', {
          driverId: '{{driverId}}', eventType: 'CLOCK_OUT',
          timestamp: new Date().toISOString(),
          idempotencyKey: 'mobile-clock-out-{{$guid}}',
        }),
        item('Shift Entry (Backfill)', 'POST', '/time-events', {
          driverId: '{{driverId}}', eventType: 'SHIFT_ENTRY',
          timestamp: '2026-03-13T07:00:00Z',
          idempotencyKey: 'backfill-shift-{{$guid}}',
          notes: 'Manual backfill',
        }),
        item('List Time Events', 'GET', '/time-events', undefined),
        item('Log Fuel Expense', 'POST', '/expense-events', {
          driverId: '{{driverId}}', category: 'FUEL', amount: 82.50, currency: 'USD',
          description: 'Fill-up at Pilot Flying J',
          expenseDate: '2026-03-14',
          idempotencyKey: 'mobile-expense-FUEL-{{$guid}}',
        }),
        item('Log Toll Expense', 'POST', '/expense-events', {
          driverId: '{{driverId}}', category: 'TOLLS', amount: 14.25, currency: 'USD',
          expenseDate: '2026-03-14',
          idempotencyKey: 'mobile-expense-TOLLS-{{$guid}}',
        }),
        item('List Expense Events', 'GET', '/expense-events', undefined),
      ]),
      folder('Documents & POD', 'Driver document management and proof of delivery', [
        item('Submit Proof of Delivery', 'POST', '/documents/pod', {
          moveId: '{{moveId}}',
          driverId: '{{driverId}}',
          photoUrl: 'https://storage.driverhub.io/pod/example.jpg',
          recipientName: 'Alex Thompson',
          notes: 'Left at reception desk',
          capturedAt: new Date().toISOString(),
        }),
        item('List Documents', 'GET', '/documents', undefined),
        item('Get Document', 'GET', '/documents/<document-id>', undefined),
        item('Documents for Move', 'GET', '/moves/{{moveId}}/documents', undefined),
      ]),
      folder('Financial Sync', 'Invoice and payment data for accounting sync', [
        item('List Invoices', 'GET', '/invoices', undefined),
        item('Get Invoice', 'GET', '/invoices/<invoice-id>', undefined),
        item('List Payments', 'GET', '/payments', undefined),
        item('Get Payment', 'GET', '/payments/<payment-id>', undefined),
      ]),
      folder('Webhooks', 'Manage outbound webhook endpoints and delivery logs', [
        item('List Endpoints', 'GET', '/webhooks', undefined),
        item('Register Endpoint', 'POST', '/webhooks', {
          name: 'My Integration Webhook',
          url: 'https://your-app.example.com/webhooks/driverhub',
          events: ['move.created', 'trip.completed', 'driver.status_changed'],
          description: 'DriverConnect mobile app integration',
        }),
        item('Get Endpoint', 'GET', '/webhooks/{{webhookId}}', undefined),
        item('Update Endpoint', 'PATCH', '/webhooks/{{webhookId}}', {
          events: ['*'],
          description: 'Updated to wildcard subscription',
        }),
        item('Send Test Ping', 'POST', '/webhooks/{{webhookId}}/test', undefined),
        item('Event Catalog', 'GET', '/webhook-event-catalog', undefined, 'All 18 available event types'),
        item('Delivery Log', 'GET', '/webhook-deliveries', undefined),
        item('Deliveries for Endpoint', 'GET', '/webhooks/{{webhookId}}/deliveries', undefined),
        item('Get Single Delivery', 'GET', '/webhook-deliveries/{{deliveryId}}', undefined),
        item('Redeliver (Dead-Letter)', 'POST', '/webhook-deliveries/{{deliveryId}}/redeliver', undefined, 'Requeues a failed/dead-letter delivery with a fresh retry cycle.'),
        item('Deactivate Endpoint', 'DELETE', '/webhooks/{{webhookId}}', undefined, 'Soft-deactivates the endpoint — sets isActive: false'),
      ]),
    ],
  };
}

router.get('/docs/postman', (req: Request, res: Response) => {
  const collection = buildPostmanCollection(req);
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', 'attachment; filename="DriverConnect-API-v1.postman_collection.json"');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.json(collection);
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. UAT TEST SCENARIOS
// ─────────────────────────────────────────────────────────────────────────────
const UAT_SCENARIOS = {
  _meta: {
    version: 'v1',
    purpose: 'Structured UAT scenarios for DriverConnect Integration API. QA teams can execute these without developer assistance.',
    environment: {
      baseUrl: '/api/v1',
      requiredHeader: 'Authorization: Bearer dhk_live_<your-api-key>',
      legacyHeader: 'X-API-Key: dhk_live_<your-api-key>',
      optionalHeaders: { 'X-Tenant-Id': '<org-uuid>', 'X-Idempotency-Key': '<uuid-v4> (required on transactional POSTs)' },
      toolsNeeded: ['curl', 'Postman', 'Insomnia', 'or any HTTP client'],
      docsUrl: '/api/v1/docs',
      postmanCollection: '/api/v1/docs/postman',
    },
    legend: {
      PASS: 'Expected behavior observed',
      FAIL: 'Unexpected behavior — log and report',
      SKIP: 'Prerequisite not met — skip scenario',
    },
  },
  scenarios: [
    {
      id: 'UAT-001',
      title: 'API Health Check',
      category: 'System',
      priority: 'P0',
      description: 'Verify the API is operational and returns correct metadata.',
      steps: [
        {
          step: 1,
          action: 'GET /api/v1/health',
          headers: {},
          expectedStatus: 200,
          expectedBody: { status: 'ok', api: 'DriverHub Integration API', version: 'v1' },
          passCondition: 'status=200, body.status="ok"',
        },
      ],
    },
    {
      id: 'UAT-002',
      title: 'API Key Authentication',
      category: 'Authentication',
      priority: 'P0',
      description: 'Verify that all authenticated endpoints enforce the X-API-Key header.',
      steps: [
        {
          step: 1,
          action: 'GET /api/v1/key-info (no header)',
          headers: {},
          expectedStatus: '4xx (not 200)',
          passCondition: 'Request without header is not authenticated',
        },
        {
          step: 2,
          action: 'GET /api/v1/key-info (with valid key)',
          headers: { 'Authorization': 'Bearer dhk_live_<your-key>' },
          expectedStatus: 200,
          expectedBody: { success: true, data: { key_id: '<uuid>', scopes: [] } },
          passCondition: 'Returns 200 with key metadata including scopes array',
        },
        {
          step: 3,
          action: 'GET /api/v1/key-info (with invalid key)',
          headers: { 'Authorization': 'Bearer dhk_live_totally_fake_key' },
          expectedStatus: 401,
          passCondition: 'Returns 401 with error=UNAUTHORIZED',
        },
      ],
    },
    {
      id: 'UAT-003',
      title: 'Scope Enforcement',
      category: 'Authentication',
      priority: 'P0',
      description: 'Verify that endpoints reject keys with insufficient scope.',
      steps: [
        {
          step: 1,
          note: 'Obtain a read-only key that lacks write:execution scope',
          action: 'POST /api/v1/execution-events with read-only key',
          headers: { 'Authorization': 'Bearer <read-only-key>', 'X-Idempotency-Key': 'test-scope-001' },
          body: { eventType: 'EN_ROUTE_PICKUP', moveId: '<valid-id>', driverId: '<valid-id>', timestamp: '<iso>' },
          expectedStatus: 403,
          passCondition: 'Returns 403 with error=FORBIDDEN and message mentioning required scope',
        },
      ],
    },
    {
      id: 'UAT-010',
      title: 'Full Trip Lifecycle — Happy Path',
      category: 'Execution Events',
      priority: 'P0',
      description: 'Simulate a complete driver trip from dispatch through delivery. Must be executed in sequence.',
      prerequisites: ['Valid API key with write:execution scope', 'A move in READY state', 'An AVAILABLE driver assigned to that move'],
      steps: [
        {
          step: 1,
          action: 'POST /api/v1/execution-events — EN_ROUTE_PICKUP',
          body: { eventType: 'EN_ROUTE_PICKUP', moveId: '{{moveId}}', driverId: '{{driverId}}', timestamp: '<now>', idempotencyKey: 'uat-010-step-1' },
          expectedStatus: 201,
          expectedBody: { success: true, data: { newState: 'EN_ROUTE_PICKUP', isDuplicate: false } },
          passCondition: 'newState=EN_ROUTE_PICKUP, isDuplicate=false',
        },
        {
          step: 2,
          action: 'POST /api/v1/execution-events — AT_PICKUP',
          body: { eventType: 'AT_PICKUP', moveId: '{{moveId}}', driverId: '{{driverId}}', timestamp: '<now+15m>', idempotencyKey: 'uat-010-step-2' },
          expectedStatus: 201,
          passCondition: 'newState=AT_PICKUP',
        },
        {
          step: 3,
          action: 'POST /api/v1/execution-events — EN_ROUTE_DESTINATION',
          body: { eventType: 'EN_ROUTE_DESTINATION', moveId: '{{moveId}}', driverId: '{{driverId}}', timestamp: '<now+20m>', idempotencyKey: 'uat-010-step-3' },
          expectedStatus: 201,
          passCondition: 'newState=EN_ROUTE_DESTINATION',
        },
        {
          step: 4,
          action: 'POST /api/v1/execution-events — AT_DESTINATION',
          body: { eventType: 'AT_DESTINATION', moveId: '{{moveId}}', driverId: '{{driverId}}', timestamp: '<now+60m>', idempotencyKey: 'uat-010-step-4' },
          expectedStatus: 201,
          passCondition: 'newState=AT_DESTINATION',
        },
        {
          step: 5,
          action: 'POST /api/v1/execution-events — COMPLETED',
          body: { eventType: 'COMPLETED', moveId: '{{moveId}}', driverId: '{{driverId}}', timestamp: '<now+65m>', idempotencyKey: 'uat-010-step-5' },
          expectedStatus: 201,
          passCondition: 'newState=COMPLETED',
        },
        {
          step: 6,
          action: 'GET /api/v1/execution-events/{{moveId}}/history',
          expectedStatus: 200,
          passCondition: 'Returns 5 events in order: EN_ROUTE_PICKUP → AT_PICKUP → EN_ROUTE_DESTINATION → AT_DESTINATION → COMPLETED',
        },
        {
          step: 7,
          action: 'POST /api/v1/documents/pod — Submit proof of delivery',
          body: {
            moveId: '{{moveId}}', driverId: '{{driverId}}',
            photoUrl: 'https://storage.driverhub.io/pod/uat-test.jpg',
            recipientName: 'QA Tester',
            capturedAt: '<now+66m>',
          },
          expectedStatus: 201,
          passCondition: 'POD document created with docType=POD',
        },
      ],
    },
    {
      id: 'UAT-011',
      title: 'Invalid State Transition',
      category: 'Execution Events',
      priority: 'P1',
      description: 'Verify that the state machine rejects invalid transitions.',
      steps: [
        {
          step: 1,
          note: 'Use a move that is in EN_ROUTE_PICKUP state',
          action: 'POST /api/v1/execution-events — COMPLETED (invalid: skipping steps)',
          body: { eventType: 'COMPLETED', moveId: '{{moveId}}', driverId: '{{driverId}}', timestamp: '<now>', idempotencyKey: 'uat-011-invalid' },
          expectedStatus: 409,
          passCondition: 'Returns 409 with error=INVALID_TRANSITION and message describing valid next states',
        },
      ],
    },
    {
      id: 'UAT-012',
      title: 'Idempotency — Duplicate Event Submission',
      category: 'Execution Events',
      priority: 'P1',
      description: 'Verify that submitting the same idempotency key twice returns the original record without creating a duplicate.',
      steps: [
        {
          step: 1,
          action: 'POST /api/v1/execution-events (first submission)',
          body: { eventType: 'EN_ROUTE_PICKUP', moveId: '{{moveId}}', driverId: '{{driverId}}', timestamp: '<now>', idempotencyKey: 'uat-012-idempotency-test-key' },
          expectedStatus: 201,
          passCondition: 'isDuplicate=false',
        },
        {
          step: 2,
          action: 'POST /api/v1/execution-events (identical second submission)',
          body: { eventType: 'EN_ROUTE_PICKUP', moveId: '{{moveId}}', driverId: '{{driverId}}', timestamp: '<now>', idempotencyKey: 'uat-012-idempotency-test-key' },
          expectedStatus: '200 or 201',
          passCondition: 'isDuplicate=true; same record ID returned; no second state transition occurred',
        },
      ],
    },
    {
      id: 'UAT-020',
      title: 'Field Exception — Vehicle Breakdown (HIGH Severity)',
      category: 'Exceptions',
      priority: 'P1',
      description: 'Log a high-severity field exception and verify it is recorded.',
      steps: [
        {
          step: 1,
          action: 'POST /api/v1/exceptions',
          body: {
            moveId: '{{moveId}}', driverId: '{{driverId}}',
            reasonCode: 'VEHICLE_BREAKDOWN', severity: 'HIGH',
            notes: 'Right rear tire blew out on I-90 near exit 48.',
            location: { lat: 41.8801, lng: -87.7390 },
          },
          expectedStatus: 201,
          passCondition: 'Returns 201 with reasonCode=VEHICLE_BREAKDOWN, severity=HIGH, id is populated',
        },
        {
          step: 2,
          action: 'GET /api/v1/exceptions',
          expectedStatus: 200,
          passCondition: 'The new exception appears in the list with correct moveId, reasonCode, severity',
        },
      ],
    },
    {
      id: 'UAT-021',
      title: 'Exception — Invalid Reason Code',
      category: 'Exceptions',
      priority: 'P2',
      steps: [
        {
          step: 1,
          action: 'POST /api/v1/exceptions with invalid reasonCode',
          body: { moveId: '{{moveId}}', driverId: '{{driverId}}', reasonCode: 'NOT_A_REAL_CODE', severity: 'MEDIUM' },
          expectedStatus: 400,
          passCondition: 'Returns 400 with details[].field="reasonCode"',
        },
      ],
    },
    {
      id: 'UAT-030',
      title: 'Driver Status — Full Day Cycle',
      category: 'Driver Status',
      priority: 'P1',
      steps: [
        {
          step: 1, action: 'POST /driver-status-events — ON_DUTY',
          body: { driverId: '{{driverId}}', status: 'ON_DUTY', timestamp: '<07:00>' },
          expectedStatus: 201, passCondition: 'newStatus=ON_DUTY',
        },
        {
          step: 2, action: 'POST /driver-status-events — AVAILABLE',
          body: { driverId: '{{driverId}}', status: 'AVAILABLE', timestamp: '<07:05>' },
          expectedStatus: 201, passCondition: 'newStatus=AVAILABLE',
        },
        {
          step: 3, action: 'POST /driver-status-events — ON_BREAK',
          body: { driverId: '{{driverId}}', status: 'ON_BREAK', timestamp: '<12:00>' },
          expectedStatus: 201, passCondition: 'newStatus=ON_BREAK',
        },
        {
          step: 4, action: 'POST /driver-status-events — OFF_DUTY',
          body: { driverId: '{{driverId}}', status: 'OFF_DUTY', timestamp: '<17:00>' },
          expectedStatus: 201, passCondition: 'newStatus=OFF_DUTY',
        },
        {
          step: 5, action: 'GET /driver-status-events?driverId={{driverId}}',
          expectedStatus: 200,
          passCondition: 'All 4 status records present, ordered chronologically',
        },
      ],
    },
    {
      id: 'UAT-040',
      title: 'Time & Expense — Clock In / Clock Out',
      category: 'Time & Expense',
      priority: 'P1',
      steps: [
        {
          step: 1, action: 'POST /time-events — CLOCK_IN',
          body: { driverId: '{{driverId}}', eventType: 'CLOCK_IN', timestamp: '<07:02>', idempotencyKey: 'uat-040-ci-{{$guid}}' },
          expectedStatus: 201, passCondition: 'eventType=CLOCK_IN, id is integer, isDuplicate=false',
        },
        {
          step: 2, action: 'POST /time-events — CLOCK_OUT',
          body: { driverId: '{{driverId}}', eventType: 'CLOCK_OUT', timestamp: '<17:05>', idempotencyKey: 'uat-040-co-{{$guid}}' },
          expectedStatus: 201, passCondition: 'eventType=CLOCK_OUT, isDuplicate=false',
        },
        {
          step: 3, action: 'GET /time-events?driverId={{driverId}}',
          expectedStatus: 200, passCondition: 'Both records present; meta.total >= 2',
        },
      ],
    },
    {
      id: 'UAT-041',
      title: 'Time Event Idempotency',
      category: 'Time & Expense',
      priority: 'P2',
      steps: [
        {
          step: 1,
          action: 'POST /time-events (first submission)',
          body: { driverId: '{{driverId}}', eventType: 'CLOCK_IN', timestamp: '<now>', idempotencyKey: 'uat-041-idem-key' },
          expectedStatus: 201, passCondition: 'isDuplicate=false',
        },
        {
          step: 2,
          action: 'POST /time-events (same key, second submission)',
          body: { driverId: '{{driverId}}', eventType: 'CLOCK_IN', timestamp: '<now>', idempotencyKey: 'uat-041-idem-key' },
          expectedStatus: '200 or 201', passCondition: 'isDuplicate=true; same integer id returned',
        },
      ],
    },
    {
      id: 'UAT-042',
      title: 'Expense — $50k Cap Enforcement',
      category: 'Time & Expense',
      priority: 'P1',
      steps: [
        {
          step: 1,
          action: 'POST /expense-events with amount > $50,000',
          body: { driverId: '{{driverId}}', category: 'OTHER', amount: 50001, idempotencyKey: 'uat-042-cap-test' },
          expectedStatus: 400,
          passCondition: 'Returns 400 with details[].field="amount" mentioning maximum',
        },
      ],
    },
    {
      id: 'UAT-050',
      title: 'Webhook Endpoint Lifecycle',
      category: 'Webhooks',
      priority: 'P0',
      description: 'Full CRUD lifecycle for a webhook endpoint.',
      steps: [
        {
          step: 1,
          action: 'POST /webhooks — Register endpoint',
          body: { name: 'UAT Webhook', url: 'https://webhook.site/test', events: ['move.created', 'trip.completed'] },
          expectedStatus: 201,
          passCondition: 'isActive=true, secret is a 64-char hex string (starts with whsec_)',
          important: 'Save the secret — it will NOT be returned again',
        },
        {
          step: 2,
          action: 'GET /webhooks — List endpoints',
          expectedStatus: 200,
          passCondition: 'New endpoint appears in list with correct name and events',
        },
        {
          step: 3,
          action: 'GET /webhooks/{{webhookId}}',
          expectedStatus: 200,
          passCondition: 'Returns endpoint data WITHOUT the secret field',
        },
        {
          step: 4,
          action: 'PATCH /webhooks/{{webhookId}} — Add more events',
          body: { events: ['*'] },
          expectedStatus: 200,
          passCondition: 'events=["*"] in response',
        },
        {
          step: 5,
          action: 'POST /webhooks/{{webhookId}}/test — Send test ping',
          expectedStatus: 200,
          passCondition: 'duration_ms is populated; status is "delivered" (requires reachable URL) or "failed" (unreachable URL — both are acceptable)',
        },
        {
          step: 6,
          action: 'GET /webhook-event-catalog',
          expectedStatus: 200,
          passCondition: 'meta.total=18; move.created, trip.completed, driver.status_changed, pod.submitted, account.updated, payment.updated all present',
        },
        {
          step: 7,
          action: 'DELETE /webhooks/{{webhookId}} — Deactivate',
          expectedStatus: 200,
          passCondition: 'Returns success; isActive=false',
        },
        {
          step: 8,
          action: 'GET /webhooks/{{webhookId}} after deactivation',
          expectedStatus: 200,
          passCondition: 'isActive=false (endpoint still retrievable, but no longer receives events)',
        },
      ],
    },
    {
      id: 'UAT-051',
      title: 'Webhook Signature Verification',
      category: 'Webhooks',
      priority: 'P0',
      description: 'Verify that webhook deliveries include a valid HMAC-SHA256 signature.',
      prerequisites: ['A webhook endpoint registered at a URL you control (e.g., webhook.site, ngrok)', 'The endpoint secret saved from UAT-050 step 1'],
      steps: [
        {
          step: 1,
          action: 'POST /webhooks/{{webhookId}}/test',
          expectedStatus: 200,
          passCondition: 'Test ping delivery received at your endpoint URL',
        },
        {
          step: 2,
          action: 'At your endpoint — inspect the incoming request headers',
          passCondition: 'X-DriverHub-Signature-256 header is present and starts with "sha256="',
        },
        {
          step: 3,
          action: 'Verify the signature using the code from GET /api/v1/docs/payloads (webhooks.verification_code)',
          passCondition: 'crypto.timingSafeEqual check passes; verifyDriverHubWebhook() returns true',
        },
        {
          step: 4,
          action: 'Tamper with the payload and re-verify',
          passCondition: 'verifyDriverHubWebhook() returns false — tampered payloads are rejected',
        },
      ],
    },
    {
      id: 'UAT-052',
      title: 'Webhook Delivery Log & Redeliver',
      category: 'Webhooks',
      priority: 'P1',
      steps: [
        {
          step: 1, action: 'GET /webhook-deliveries?endpoint_id={{webhookId}}',
          expectedStatus: 200, passCondition: 'data array present; meta.total >= 0',
        },
        {
          step: 2, action: 'GET /webhook-deliveries?status=failed',
          expectedStatus: 200, passCondition: 'Filtered list — all records have status=failed',
        },
        {
          step: 3,
          note: 'If a delivery in failed or dead_letter status exists:',
          action: 'POST /webhook-deliveries/{{deliveryId}}/redeliver',
          expectedStatus: 200, passCondition: 'Returns queued=true or message "Redeliver queued."; delivery status resets to pending',
        },
        {
          step: 4, action: 'GET /webhook-deliveries/{{deliveryId}} after redeliver',
          expectedStatus: 200, passCondition: 'status is no longer dead_letter; attempts reset toward 1',
        },
      ],
    },
    {
      id: 'UAT-060',
      title: 'Rate Limiting',
      category: 'System',
      priority: 'P2',
      description: 'Verify the 600 req/min rate limit is enforced.',
      steps: [
        {
          step: 1,
          action: 'Inspect response headers on any authenticated request',
          passCondition: 'X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset headers are present',
        },
        {
          step: 2,
          action: 'Send 601+ requests within 60 seconds to any authenticated endpoint',
          passCondition: 'The 601st+ request returns HTTP 429 with error=RATE_LIMIT_EXCEEDED',
          note: 'This test is optional; confirm with automation tooling',
        },
      ],
    },
    {
      id: 'UAT-070',
      title: 'Financial Data Sync',
      category: 'Financial Sync',
      priority: 'P1',
      steps: [
        {
          step: 1, action: 'GET /invoices',
          expectedStatus: 200, passCondition: 'Paginated list with meta.total, meta.page, meta.limit',
        },
        {
          step: 2, action: 'GET /payments',
          expectedStatus: 200, passCondition: 'Paginated payment list',
        },
        {
          step: 3, action: 'GET /invoices/<valid-invoice-id>',
          expectedStatus: 200, passCondition: 'Single invoice with all fields',
        },
        {
          step: 4, action: 'GET /invoices/<fake-id>',
          expectedStatus: 404, passCondition: 'Returns 404 with error=NOT_FOUND',
        },
      ],
    },
  ],
  test_data: {
    note: 'Use GET /drivers, GET /accounts, GET /moves to retrieve real IDs from your environment.',
    sandbox_reference: {
      driverId: 'df7569d6-0000-0000-0000-000000000001 (replace with real ID from GET /drivers)',
      accountId: '9379dd64-0000-0000-0000-000000000001 (replace with real ID from GET /accounts)',
      moveId: 'retrieve via GET /moves?status=READY',
    },
    idempotency_key_format: {
      recommended: '<source>-<event_type>-<driver_id_prefix>-<yyyyMMddTHHmmss>',
      example: 'mobile-CLOCK_IN-df7569-20260314T070200',
      rules: ['Must be unique per driver+event combination', 'Max 128 characters', 'Cached 72 hours'],
    },
  },
};

router.get('/docs/uat-scenarios', (_req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.json({ success: true, data: UAT_SCENARIOS });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. ERROR CODE REFERENCE
// ─────────────────────────────────────────────────────────────────────────────
router.get('/docs/error-codes', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      description: 'All API errors follow the shape: { error: "CODE", message: "...", details?: [...] }',
      http_status_codes: [
        {
          status: 400, error: 'VALIDATION_ERROR',
          description: 'Request body or query param failed schema validation.',
          resolution: 'Check the details[] array for field-level messages. Fix the request and retry.',
          example: { error: 'VALIDATION_ERROR', message: 'Request body validation failed.', details: [{ field: 'driverId', message: 'Required' }] },
        },
        {
          status: 401, error: 'UNAUTHORIZED',
          description: 'X-API-Key header is missing or the key is invalid/inactive.',
          resolution: 'Provide a valid X-API-Key header. Contact your administrator to generate a key.',
          example: { error: 'UNAUTHORIZED', message: 'Invalid or inactive API key.' },
        },
        {
          status: 403, error: 'FORBIDDEN',
          description: 'Your API key does not have the required scope for this endpoint.',
          resolution: 'Use GET /key-info to check your scopes. Request a key with the needed scope.',
          example: { error: 'FORBIDDEN', message: "Scope 'write:execution' required for this operation." },
          scope_map: {
            'read:drivers': ['GET /drivers', 'GET /drivers/{id}'],
            'read:moves': ['GET /moves', 'GET /moves/{id}'],
            'read:accounts': ['GET /accounts', 'GET /accounts/{id}', 'GET /accounts/{id}/contract-products'],
            'write:execution': ['POST /execution-events', 'POST /exceptions', 'POST /driver-status-events'],
            'write:dispatch': ['POST /dispatch/assign', 'POST /dispatch/reassign'],
            'write:time': ['POST /time-events'],
            'write:expenses': ['POST /expense-events'],
            'write:documents': ['POST /documents/pod', 'POST /documents/upload'],
            'read:invoices': ['GET /invoices', 'GET /payments'],
            'manage:webhooks': ['POST /webhooks', 'PATCH /webhooks/{id}', 'DELETE /webhooks/{id}'],
            'read:webhooks': ['GET /webhooks', 'GET /webhook-deliveries'],
          },
        },
        {
          status: 404, error: 'NOT_FOUND',
          description: 'The requested resource does not exist or is not accessible to this key.',
          resolution: 'Verify the ID is correct. Use list endpoints to discover valid IDs.',
          example: { error: 'NOT_FOUND', message: 'Move abc123 not found.' },
        },
        {
          status: 409, error: 'CONFLICT',
          description: 'The request conflicts with current state. Includes invalid state machine transitions.',
          subCodes: [
            { error: 'INVALID_TRANSITION', message: 'Cannot transition from COMPLETED to EN_ROUTE_PICKUP.', resolution: 'Check GET /execution-events/{moveId}/history for valid next states.' },
            { error: 'DRIVER_ALREADY_ASSIGNED', message: 'A driver is already assigned to this move.', resolution: 'Reassign via POST /dispatch/reassign.' },
          ],
        },
        {
          status: 409, code: 'IDEMPOTENCY_DUPLICATE',
          description: 'Not actually an error — the idempotency key was already processed. The original record is returned.',
          note: 'Duplicate submissions return success:true with isDuplicate:true. Treat this as a success.',
          example: { success: true, data: { isDuplicate: true, id: 1042, message: 'Idempotency key already processed.' } },
        },
        {
          status: 422, error: 'UNPROCESSABLE',
          description: 'The request is syntactically valid but violates a business rule.',
          examples: [
            'Driver is not in AVAILABLE status and cannot be assigned.',
            'Expense amount exceeds the $50,000 maximum per claim.',
            'Move is in terminal state (COMPLETED/CANCELLED) and cannot be updated.',
          ],
        },
        {
          status: 429, error: 'RATE_LIMIT_EXCEEDED',
          description: 'Request rate limit exceeded. Limit is 600 requests/minute per API key.',
          resolution: 'Wait for the time indicated in X-RateLimit-Reset header, then retry.',
          headers: {
            'X-RateLimit-Limit': 'Maximum requests per minute',
            'X-RateLimit-Remaining': 'Requests remaining in current window',
            'X-RateLimit-Reset': 'Unix timestamp when the window resets',
          },
          example: { error: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests. Retry after X-RateLimit-Reset.' },
        },
        {
          status: 500, error: 'INTERNAL_SERVER_ERROR',
          description: 'An unexpected server error occurred.',
          resolution: 'Retry after a brief delay. If the issue persists, contact DriverHub support with the request timestamp.',
        },
      ],
    },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. DTO CONTRACT DEFINITIONS
// ─────────────────────────────────────────────────────────────────────────────
router.get('/docs/dto-contracts', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      description: 'TypeScript DTO contract definitions for all DriverConnect API v1 data shapes. These are stable contracts — breaking changes will be versioned.',
      version: 'v1',
      stability: 'stable',
      contracts: {
        request_dtos: {
          ExecutionEventRequest: `interface ExecutionEventRequest {
  eventType: 'EN_ROUTE_PICKUP'|'AT_PICKUP'|'EN_ROUTE_DESTINATION'|'AT_DESTINATION'|'COMPLETED'|'CANCELLED'|'ACCEPTED'|'DECLINED'|'DELAYED'|'NO_SHOW';
  moveId: string;       // UUID
  driverId: string;     // UUID
  timestamp: string;    // ISO 8601 UTC
  idempotencyKey: string; // max 128 chars; cached 72h
  location?: { lat: number; lng: number; accuracy?: number };
  notes?: string;       // max 500 chars
}`,
          ExceptionRequest: `interface ExceptionRequest {
  moveId: string;       // UUID
  driverId: string;     // UUID
  reasonCode: 'VEHICLE_BREAKDOWN'|'TRAFFIC_DELAY'|'CUSTOMER_UNAVAILABLE'|'SAFETY_CONCERN'|'WEATHER_HAZARD'|'ROUTE_BLOCKED'|'DRIVER_EMERGENCY'|'CARGO_DAMAGE'|'ACCESS_DENIED'|'MECHANICAL_FAILURE'|'FUEL_ISSUE'|'ACCIDENT'|'NAVIGATION_ERROR'|'CUSTOMER_DISPUTE'|'OTHER';
  severity?: 'LOW'|'MEDIUM'|'HIGH'|'CRITICAL'; // default: MEDIUM
  notes?: string;       // max 1000 chars
  photoUrl?: string;    // URL to photo evidence
  location?: { lat: number; lng: number; address?: string };
}`,
          DriverStatusEventRequest: `interface DriverStatusEventRequest {
  driverId: string;     // UUID
  status: 'ON_DUTY'|'OFF_DUTY'|'ON_BREAK'|'AVAILABLE'|'UNAVAILABLE'|'DRIVE_MODE';
  timestamp?: string;   // ISO 8601 UTC; defaults to server time
  location?: { lat: number; lng: number };
  notes?: string;
}`,
          TimeEventRequest: `interface TimeEventRequest {
  driverId: string;     // UUID
  eventType: 'CLOCK_IN'|'CLOCK_OUT'|'SHIFT_ENTRY';
  timestamp: string;    // ISO 8601 UTC
  idempotencyKey: string; // max 128 chars; cached 72h
  moveId?: string;      // UUID (optional association)
  notes?: string;       // max 500 chars
}`,
          ExpenseEventRequest: `interface ExpenseEventRequest {
  driverId: string;     // UUID
  category: 'FUEL'|'TOLLS'|'PARKING'|'MILEAGE'|'MEALS'|'LODGING'|'MAINTENANCE'|'OTHER';
  amount: number;       // USD; min: 0.01; max: 50000.00
  currency?: string;    // default: 'USD'
  idempotencyKey: string; // max 128 chars; cached 72h
  receiptUrl?: string;  // URL to receipt photo
  description?: string; // max 500 chars
  expenseDate?: string; // ISO date (YYYY-MM-DD)
}`,
          PodSubmitRequest: `interface PodSubmitRequest {
  moveId: string;       // UUID
  driverId: string;     // UUID
  photoUrl: string;     // URL to POD photo (required)
  signatureUrl?: string; // URL to recipient signature image
  recipientName?: string;
  notes?: string;       // max 500 chars
  capturedAt?: string;  // ISO 8601 UTC; defaults to server time
}`,
          WebhookEndpointRequest: `interface WebhookEndpointRequest {
  name: string;         // max 100 chars
  url: string;          // HTTPS URI
  events: string[];     // event types or ["*"] for all 18 types
  description?: string; // max 500 chars
}`,
          WebhookEndpointUpdateRequest: `interface WebhookEndpointUpdateRequest {
  name?: string;
  url?: string;         // HTTPS URI
  events?: string[];    // replaces existing subscription list
  description?: string;
  isActive?: boolean;   // false=pause, true=resume
}`,
        },
        response_dtos: {
          ApiResponse: `// ─── Standard Response Envelope ─────────────────────────────────────────────
// stability: stable | auth: Authorization: Bearer <token> | X-API-Key: <token>

/** Included in every response. */
interface MetaBase {
  requestId: string;     // Unique trace ID — matches X-Request-Id response header
  timestamp: string;     // ISO 8601 UTC, e.g. "2026-03-14T08:00:00.000Z"
}

/** Additional fields present in paginated list responses. */
interface PaginatedMeta extends MetaBase {
  page:     number;      // 1-indexed current page
  pageSize: number;      // Items per page (default 25)
  total:    number;      // Total matching records
  hasMore:  boolean;     // true when page * pageSize < total
}

/** Successful single-resource or action response. */
interface ApiResponse<T> {
  success: true;
  data: T;
  meta: MetaBase;
}

/** Successful paginated list response. */
interface PaginatedResponse<T> {
  success: true;
  data: T[];
  meta: PaginatedMeta;
}

/** Standard error response for all 4xx / 5xx status codes. */
interface ApiErrorResponse {
  success: false;
  error: {
    code:           string;                              // Machine-readable error code
    message:        string;                              // Human-readable description
    details?:       Array<{ field: string; message: string }>; // Field-level validation errors
    required_scope?: string;                             // Present on 403 scope errors
  };
  meta: MetaBase;
}

// ─── Common Error Codes ───────────────────────────────────────────────────────
// UNAUTHORIZED         401  Missing or invalid token
// TOKEN_EXPIRED        401  Token has expired
// TENANT_MISMATCH      403  X-Tenant-Id does not match token org
// INSUFFICIENT_SCOPE   403  Token lacks required scope
// NOT_FOUND            404  Resource does not exist
// INVALID_TRANSITION   409  State machine violation
// DUPLICATE_KEY        409  Idempotency key already processed (returns original record)
// VALIDATION_ERROR     400  Request body validation failure
// UNPROCESSABLE        422  Business rule violation
// RATE_LIMIT_EXCEEDED  429  600 req/min limit hit; see Retry-After + X-RateLimit-Reset
// INTERNAL_ERROR       500  Unexpected server error

// ─── Standard Request Headers ─────────────────────────────────────────────────
// Authorization: Bearer <token>    Required* (preferred)
// X-API-Key: <token>               Required* (legacy — backward-compatible)
// X-Tenant-Id: <org-uuid>          Optional — validated against token org when provided
// X-Idempotency-Key: <uuid-v4>     Required on transactional POST endpoints
// Content-Type: application/json   Required on POST/PUT/PATCH

// ─── Standard Response Headers ───────────────────────────────────────────────
// X-Request-Id                     Matches meta.requestId — use for log correlation
// X-RateLimit-Limit                Max requests per minute (600)
// X-RateLimit-Remaining            Requests remaining in current window
// X-RateLimit-Reset                Unix timestamp when window resets
// Retry-After                      Seconds to wait (only on 429 responses)
`,
          Driver: `interface Driver {
  id: string;           // UUID
  firstName: string;
  lastName: string;
  licenseNumber: string;
  licenseExpiry?: string; // ISO date
  status: 'ACTIVE'|'INACTIVE'|'SUSPENDED';
  phone?: string;
  vehicleType?: string;
}`,
          ExecutionEventResponse: `interface ExecutionEventResponse {
  id: string;           // UUID
  moveId: string;
  driverId: string;
  eventType: string;
  previousState: string | null;
  newState: string;
  timestamp: string;
  isDuplicate: boolean;
}`,
          TimeEventResponse: `interface TimeEventResponse {
  id: number;           // integer (serial)
  driverId: string;     // UUID
  eventType: string;
  timestamp: string;
  idempotencyKey: string;
  isDuplicate: boolean;
  createdAt: string;
}`,
          ExpenseEventResponse: `interface ExpenseEventResponse {
  id: number;           // integer (serial)
  driverId: string;     // UUID
  category: string;
  amount: number;
  currency: string;
  receiptUrl?: string;
  description?: string;
  expenseDate?: string;
  idempotencyKey: string;
  isDuplicate: boolean;
}`,
          WebhookEndpointResponse: `interface WebhookEndpointResponse {
  id: string;           // UUID
  name: string;
  url: string;
  events: string[];
  isActive: boolean;
  description?: string;
  secret?: string;      // ONLY returned on POST /webhooks (create). Store securely.
  createdAt: string;
  updatedAt: string;
}`,
          WebhookDeliveryResponse: `interface WebhookDeliveryResponse {
  id: string;           // UUID
  endpointId: string;
  eventType: string;
  status: 'pending'|'delivered'|'failed'|'dead_letter';
  httpStatus?: number;
  attempts: number;     // number of delivery attempts made
  payload?: object;     // full envelope sent to endpoint
  responseBody?: string;
  deliveredAt?: string;
  createdAt: string;
}`,
          WebhookPayloadEnvelope: `// Shape of every HTTP POST sent to your webhook endpoint:
interface WebhookPayloadEnvelope {
  id: string;           // unique delivery UUID
  event: string;        // event type, e.g. "move.created"
  created_at: string;   // ISO 8601 UTC
  api_version: 'v1';
  data: WebhookEventData; // see event-specific shapes below
}

// HMAC verification header:
// X-DriverHub-Signature-256: sha256=<hex>`,
        },
        webhook_event_data_shapes: {
          'move.*': `interface WH_MoveData {
  move_id: string; account_id: string; driver_id: string | null;
  status: string; assignment_state: string;
  scheduled_at: string; pickup_address: string; delivery_address: string;
  updated_at: string;
}`,
          'trip.*': `interface WH_TripData {
  move_id: string; driver_id: string | null; previous_driver_id: string | null;
  assignment_state: string; completed_at: string | null;
}`,
          'driver.status_changed': `interface WH_DriverStatusData {
  driver_id: string; previous_status: string | null; new_status: string;
  location: { lat: number; lng: number } | null; changed_at: string;
}`,
          'account.updated': `interface WH_AccountData {
  account_id: string; changed_fields: string[]; updated_at: string;
}`,
          'payment.updated': `interface WH_PaymentData {
  payment_id: string; invoice_id: string | null; account_id: string;
  amount: number; currency: string; status: string; paid_at: string | null;
}`,
          'exception.opened': `interface WH_ExceptionData {
  exception_id: string; move_id: string; driver_id: string;
  reason_code: string; severity: string; opened_at: string;
}`,
          'time_event.created': `interface WH_TimeEventData {
  time_entry_id: number; driver_id: string; event_type: string; timestamp: string;
}`,
          'expense.created': `interface WH_ExpenseData {
  expense_id: number; driver_id: string; category: string;
  amount: number; currency: string;
}`,
          'pod.submitted': `interface WH_PodData {
  document_id: string; move_id: string; driver_id: string;
  photo_url: string; recipient_name: string | null; captured_at: string;
}`,
        },
      },
    },
  });
});

export default router;
