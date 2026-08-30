-- Approved, email-safe New Claim Created notification template.
-- Delivery and recipient selection remain in the centralized Communication Service.

ALTER TABLE comm_templates
  ADD COLUMN IF NOT EXISTS category TEXT;

INSERT INTO comm_templates (
  slug,
  name,
  channel,
  category,
  subject_template,
  body_html_template,
  body_text_template,
  variables,
  is_active,
  version
) VALUES (
  'CLAIM_CREATED',
  'New Claim Created',
  'email',
  'Claims',
  'New Claim Created – Claim #{{claimNumber}}',
  '<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background-color:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#202124;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f5f7;">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:640px;background-color:#ffffff;">
            <tr>
              <td style="padding:22px 28px;background-color:#e8751a;color:#ffffff;">
                <div style="font-size:22px;line-height:28px;font-weight:700;">New Claim Created</div>
                <div style="margin-top:5px;font-size:13px;line-height:18px;">Claim ID: {{claimNumber}}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 28px 10px;font-size:14px;line-height:20px;">
                A new claim has been created in DriverHub.
              </td>
            </tr>
            <tr>
              <td style="padding:14px 28px 0;">
                <div style="padding-bottom:8px;border-bottom:1px solid #e5e7eb;font-size:12px;line-height:16px;font-weight:700;letter-spacing:0.5px;color:#4b5563;">CLAIM DETAILS</div>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:6px;border-collapse:collapse;font-size:13px;line-height:19px;">
                  <tr><td width="42%" style="padding:6px 8px 6px 0;color:#6b7280;">Claim ID</td><td style="padding:6px 0;font-weight:600;">{{claimNumber}}</td></tr>
                  <tr><td style="padding:6px 8px 6px 0;color:#6b7280;">Driver</td><td style="padding:6px 0;">{{driverName}}</td></tr>
                  <tr><td style="padding:6px 8px 6px 0;color:#6b7280;">Date of Incident</td><td style="padding:6px 0;">{{incidentDate}}</td></tr>
                  <tr><td style="padding:6px 8px 6px 0;color:#6b7280;">Account / Customer</td><td style="padding:6px 0;">{{customerName}}</td></tr>
                  <tr><td style="padding:6px 8px 6px 0;color:#6b7280;">Location / Market</td><td style="padding:6px 0;">{{location}} / {{market}}</td></tr>
                  <tr><td style="padding:6px 8px 6px 0;color:#6b7280;">Claim Type</td><td style="padding:6px 0;">{{claimType}}</td></tr>
                  <tr><td style="padding:6px 8px 6px 0;color:#6b7280;">Incident Type</td><td style="padding:6px 0;">{{incidentType}}</td></tr>
                  <tr><td style="padding:6px 8px 6px 0;color:#6b7280;">Resolution Status</td><td style="padding:6px 0;">{{resolutionStatus}}</td></tr>
                  <tr><td style="padding:6px 8px 6px 0;color:#6b7280;">Severity</td><td style="padding:6px 0;">{{severity}}</td></tr>
                  <tr><td style="padding:6px 8px 6px 0;color:#6b7280;">Execution System</td><td style="padding:6px 0;">{{executionSystem}}</td></tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:22px 28px 0;">
                <div style="padding-bottom:8px;border-bottom:1px solid #e5e7eb;font-size:12px;line-height:16px;font-weight:700;letter-spacing:0.5px;color:#4b5563;">OVERVIEW</div>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:6px;border-collapse:collapse;font-size:13px;line-height:19px;">
                  <tr><td width="42%" style="padding:6px 8px 6px 0;color:#6b7280;">Estimated Damage / Probable Cost</td><td style="padding:6px 0;font-weight:600;">{{estimatedDamageOrProbableCost}}</td></tr>
                  <tr><td style="padding:6px 8px 6px 0;color:#6b7280;">Actual Cost</td><td style="padding:6px 0;">{{actualCost}}</td></tr>
                  <tr><td style="padding:6px 8px 6px 0;color:#6b7280;">Photos</td><td style="padding:6px 0;">{{photoCount}}</td></tr>
                  <tr><td style="padding:6px 8px 6px 0;color:#6b7280;">Documents</td><td style="padding:6px 0;">{{documentCount}}</td></tr>
                  <tr><td style="padding:6px 8px 6px 0;color:#6b7280;">Open Items</td><td style="padding:6px 0;">{{openItemCount}}</td></tr>
                </table>
              </td>
            </tr>
            <tr>
              <td align="left" style="padding:26px 28px 28px;">
                <a href="{{claimUrl}}" style="display:inline-block;padding:11px 18px;background-color:#e8751a;color:#ffffff;text-decoration:none;font-size:14px;line-height:18px;font-weight:700;">View Claim</a>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px;background-color:#f8f9fa;border-top:1px solid #e5e7eb;color:#6b7280;font-size:11px;line-height:17px;">
                <strong style="color:#4b5563;">DriverHub 360</strong><br />
                This is an automated message. Please do not reply.<br />
                You are receiving this email because you are configured to receive New Claim notifications in DriverHub.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>',
  'New Claim Created – Claim #{{claimNumber}}\n\nA new claim has been created in DriverHub.\n\nClaim Details\nClaim ID: {{claimNumber}}\nDriver: {{driverName}}\nDate of Incident: {{incidentDate}}\nAccount / Customer: {{customerName}}\nLocation / Market: {{location}} / {{market}}\nClaim Type: {{claimType}}\nIncident Type: {{incidentType}}\nResolution Status: {{resolutionStatus}}\nSeverity: {{severity}}\nExecution System: {{executionSystem}}\n\nOverview\nEstimated Damage / Probable Cost: {{estimatedDamageOrProbableCost}}\nActual Cost: {{actualCost}}\nPhotos: {{photoCount}}\nDocuments: {{documentCount}}\nOpen Items: {{openItemCount}}\n\nView Claim: {{claimUrl}}\n\nDriverHub 360\nThis is an automated message. Please do not reply.',
  '["claimNumber","driverName","incidentDate","customerName","location","market","claimType","incidentType","resolutionStatus","severity","executionSystem","estimatedDamageOrProbableCost","actualCost","photoCount","documentCount","openItemCount","claimUrl"]'::jsonb,
  true,
  1
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  channel = EXCLUDED.channel,
  category = EXCLUDED.category,
  subject_template = EXCLUDED.subject_template,
  body_html_template = EXCLUDED.body_html_template,
  body_text_template = EXCLUDED.body_text_template,
  variables = EXCLUDED.variables,
  is_active = true,
  version = COALESCE(comm_templates.version, 0) + 1,
  updated_at = now();