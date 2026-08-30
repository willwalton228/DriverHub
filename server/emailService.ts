import { Resend } from "resend";
import { getAppBaseUrl } from "./appConfig";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

const APP_NAME = "DriverHub 360";
const APP_URL = getAppBaseUrl();


export interface InvitationEmailData {
  to: string;
  firstName: string;
  lastName: string;
  role: "driver" | "employee";
  inviteCode: string;
}

function getInvitationEmailHtml(data: InvitationEmailData): string {
  const inviteUrl = `${APP_URL}/register?code=${data.inviteCode}`;
  const roleDisplay = data.role === "driver" ? "Driver" : "Employee";

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to ${APP_NAME}</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="background-color: #FF6B35; padding: 30px 40px; border-radius: 12px 12px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600;">${APP_NAME}</h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <h2 style="margin: 0 0 20px 0; color: #18181b; font-size: 24px;">Welcome, ${data.firstName}!</h2>
              
              <p style="margin: 0 0 20px 0; color: #52525b; font-size: 16px; line-height: 1.6;">
                You've been added to ${APP_NAME} as a <strong>${roleDisplay}</strong>. 
                To access your account and complete your profile, please click the button below to register.
              </p>
              
              <p style="margin: 0 0 30px 0; color: #52525b; font-size: 16px; line-height: 1.6;">
                Your username will be your work email address: <strong>${data.to}</strong>
              </p>
              
              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding: 20px 0;">
                    <a href="${inviteUrl}" style="display: inline-block; background-color: #FF6B35; color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-size: 16px; font-weight: 600;">
                      Complete Your Registration
                    </a>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 30px 0 20px 0; color: #52525b; font-size: 16px; line-height: 1.6;">
                Once registered, you'll be directed to your ${roleDisplay} profile where you should:
              </p>
              
              <ul style="margin: 0 0 20px 0; padding-left: 20px; color: #52525b; font-size: 16px; line-height: 1.8;">
                <li>Complete all required information in your profile</li>
                <li>Review and verify your personal details</li>
                <li>Upload any required documents</li>
              </ul>
              
              <p style="margin: 30px 0 0 0; color: #71717a; font-size: 14px; line-height: 1.6;">
                This invitation link will expire in 7 days. If you have any questions, please contact your administrator.
              </p>
              
              <hr style="margin: 30px 0; border: none; border-top: 1px solid #e4e4e7;">
              
              <p style="margin: 0; color: #a1a1aa; font-size: 12px;">
                If the button doesn't work, copy and paste this link into your browser:<br>
                <a href="${inviteUrl}" style="color: #FF6B35; word-break: break-all;">${inviteUrl}</a>
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #fafafa; padding: 20px 40px; border-radius: 0 0 12px 12px; text-align: center;">
              <p style="margin: 0; color: #a1a1aa; font-size: 12px;">
                &copy; ${new Date().getFullYear()} ${APP_NAME}. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

function getInvitationEmailText(data: InvitationEmailData): string {
  const inviteUrl = `${APP_URL}/register?code=${data.inviteCode}`;
  const roleDisplay = data.role === "driver" ? "Driver" : "Employee";

  return `
Welcome to ${APP_NAME}, ${data.firstName}!

You've been added to ${APP_NAME} as a ${roleDisplay}.

To access your account and complete your profile, please visit the following link:
${inviteUrl}

Your username will be your work email address: ${data.to}

Once registered, you'll be directed to your ${roleDisplay} profile where you should:
- Complete all required information in your profile
- Review and verify your personal details
- Upload any required documents

This invitation link will expire in 7 days.

If you have any questions, please contact your administrator.

---
${APP_NAME}
  `.trim();
}

export async function sendInvitationEmail(data: InvitationEmailData): Promise<{ success: boolean; error?: string }> {
  if (!resend) {
    console.warn("Email service not configured (RESEND_API_KEY not set). Invitation not sent to:", data.to);
    return { success: false, error: "Email service not configured" };
  }

  try {
    const fromEmail = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
    
    const { data: emailData, error } = await resend.emails.send({
      from: `${APP_NAME} <${fromEmail}>`,
      to: data.to,
      subject: `Welcome to ${APP_NAME} - Complete Your Registration`,
      html: getInvitationEmailHtml(data),
      text: getInvitationEmailText(data),
    });

    if (error) {
      console.error("Failed to send invitation email:", error);
      return { success: false, error: error.message };
    }

    console.log(`Invitation email sent to ${data.to}, email ID: ${emailData?.id}`);
    return { success: true };
  } catch (error: any) {
    console.error("Error sending invitation email:", error);
    return { success: false, error: error.message };
  }
}

export interface UserInviteEmailData {
  to: string;
  organizationName: string;
  inviteUrl: string;
  role: string;
}

export async function sendUserInviteEmail(data: UserInviteEmailData): Promise<{ success: boolean; error?: string }> {
  if (!resend) {
    console.warn("Email service not configured (RESEND_API_KEY not set). User invite not sent to:", data.to);
    return { success: false, error: "Email service not configured" };
  }

  try {
    const fromEmail = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
    
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to ${APP_NAME}</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <tr>
            <td style="background-color: #FF6B35; padding: 30px 40px; border-radius: 12px 12px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600;">${APP_NAME}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <h2 style="margin: 0 0 20px 0; color: #18181b; font-size: 24px;">You're Invited!</h2>
              
              <p style="margin: 0 0 20px 0; color: #52525b; font-size: 16px; line-height: 1.6;">
                You've been invited to join <strong>${data.organizationName}</strong> on ${APP_NAME} as a <strong>${data.role}</strong>.
              </p>
              
              <p style="margin: 0 0 30px 0; color: #52525b; font-size: 16px; line-height: 1.6;">
                Click the button below to set up your account:
              </p>
              
              <table cellpadding="0" cellspacing="0" style="margin: 0 0 30px 0;">
                <tr>
                  <td style="background-color: #FF6B35; border-radius: 8px;">
                    <a href="${data.inviteUrl}" style="display: inline-block; padding: 14px 28px; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600;">
                      Accept Invitation
                    </a>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 0 0 10px 0; color: #71717a; font-size: 14px;">
                This invitation will expire in 7 days.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f4f4f5; padding: 20px 40px; border-radius: 0 0 12px 12px;">
              <p style="margin: 0; color: #71717a; font-size: 14px; text-align: center;">
                &copy; ${new Date().getFullYear()} ${APP_NAME}. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

    const { data: emailData, error } = await resend.emails.send({
      from: `${APP_NAME} <${fromEmail}>`,
      to: data.to,
      subject: `You're invited to join ${data.organizationName} on ${APP_NAME}`,
      html,
    });

    if (error) {
      console.error("Error sending user invite email:", error);
      return { success: false, error: error.message };
    }

    console.log("User invite email sent:", emailData?.id);
    return { success: true };
  } catch (error: any) {
    console.error("Error sending user invite email:", error);
    return { success: false, error: error.message };
  }
}

export interface NewClaimEmailData {
  accidentDate: Date;
  status: string;
  driverName: string;
  location: string;
  policeReportFiled: boolean;
  dodAtFault: string | null;
  vehicleInvolved: string | null;
  zendeskTicketNumber: string | null;
  incidentType: string | null;
  notes: string | null;
  createdBy: string;
}

function formatDateForEmail(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function getNewClaimEmailHtml(data: NewClaimEmailData): string {
  const formatValue = (val: string | null | undefined) => val || "Not provided";
  const formatBoolean = (val: boolean) => val ? "Yes" : "No";
  
  const statusLabels: Record<string, string> = {
    abandoned: "Abandoned",
    denied: "Denied",
    denied_abandoned: "Denied/Abandoned",
    driver_paid: "Driver Paid",
    insurance_paid: "Insurance Paid",
    dod_paid: "DoD Paid",
    paid_jri: "Paid-JRI",
    paid_other_insurance: "Paid-Other Insurance",
    pending: "Pending",
    open: "Open",
  };

  const incidentLabels: Record<string, string> = {
    collision: "Collision",
    property_damage: "Property Damage",
    injury: "Injury",
    theft: "Theft",
    vandalism: "Vandalism",
    other: "Other",
  };

  const vehicleLabels: Record<string, string> = {
    dod_customer: "DoD Customer",
    dealer_loaner: "Dealer Loaner",
    consumer: "Consumer",
  };

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Claim Created - ${APP_NAME}</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="background-color: #FF6B35; padding: 30px 40px; border-radius: 12px 12px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600;">${APP_NAME}</h1>
              <p style="margin: 10px 0 0 0; color: #ffffff; font-size: 16px; opacity: 0.9;">New Claim Notification</p>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <h2 style="margin: 0 0 20px 0; color: #18181b; font-size: 24px;">New Claim Created</h2>
              
              <p style="margin: 0 0 30px 0; color: #52525b; font-size: 16px; line-height: 1.6;">
                A new claim has been created in ${APP_NAME}. Below are the details:
              </p>
              
              <!-- Claim Details Table -->
              <table width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #e4e4e7; border-radius: 8px; overflow: hidden;">
                <tr style="background-color: #fafafa;">
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e4e4e7; font-weight: 600; color: #52525b; width: 40%;">Date of Incident</td>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e4e4e7; color: #18181b;">${formatDateForEmail(data.accidentDate)}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e4e4e7; font-weight: 600; color: #52525b;">Status</td>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e4e4e7; color: #18181b;">${statusLabels[data.status] || data.status}</td>
                </tr>
                <tr style="background-color: #fafafa;">
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e4e4e7; font-weight: 600; color: #52525b;">Driver</td>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e4e4e7; color: #18181b;">${data.driverName}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e4e4e7; font-weight: 600; color: #52525b;">Customer/Location</td>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e4e4e7; color: #18181b;">${formatValue(data.location)}</td>
                </tr>
                <tr style="background-color: #fafafa;">
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e4e4e7; font-weight: 600; color: #52525b;">Police Report Filed</td>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e4e4e7; color: #18181b;">${formatBoolean(data.policeReportFiled)}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e4e4e7; font-weight: 600; color: #52525b;">DoD At Fault</td>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e4e4e7; color: #18181b;">${formatValue(data.dodAtFault)}</td>
                </tr>
                <tr style="background-color: #fafafa;">
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e4e4e7; font-weight: 600; color: #52525b;">Vehicle Involved</td>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e4e4e7; color: #18181b;">${vehicleLabels[data.vehicleInvolved || ""] || formatValue(data.vehicleInvolved)}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e4e4e7; font-weight: 600; color: #52525b;">Zendesk Ticket #</td>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e4e4e7; color: #18181b;">${formatValue(data.zendeskTicketNumber)}</td>
                </tr>
                <tr style="background-color: #fafafa;">
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e4e4e7; font-weight: 600; color: #52525b;">Incident Type</td>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e4e4e7; color: #18181b;">${incidentLabels[data.incidentType || ""] || formatValue(data.incidentType)}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e4e4e7; font-weight: 600; color: #52525b;">Notes</td>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e4e4e7; color: #18181b;">${formatValue(data.notes)}</td>
                </tr>
                <tr style="background-color: #fafafa;">
                  <td style="padding: 12px 16px; font-weight: 600; color: #52525b;">Created By</td>
                  <td style="padding: 12px 16px; color: #18181b;">${data.createdBy}</td>
                </tr>
              </table>
              
              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding: 30px 0 20px 0;">
                    <a href="${APP_URL}/safety" style="display: inline-block; background-color: #FF6B35; color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-size: 16px; font-weight: 600;">
                      View All Claims
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #fafafa; padding: 20px 40px; border-radius: 0 0 12px 12px; text-align: center;">
              <p style="margin: 0; color: #a1a1aa; font-size: 12px;">
                &copy; ${new Date().getFullYear()} ${APP_NAME}. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

function getNewClaimEmailText(data: NewClaimEmailData): string {
  const formatValue = (val: string | null | undefined) => val || "Not provided";
  const formatBoolean = (val: boolean) => val ? "Yes" : "No";

  return `
New Claim Created - ${APP_NAME}

A new claim has been created. Here are the details:

Date of Incident: ${formatDateForEmail(data.accidentDate)}
Status: ${data.status}
Driver: ${data.driverName}
Customer/Location: ${formatValue(data.location)}
Police Report Filed: ${formatBoolean(data.policeReportFiled)}
DoD At Fault: ${formatValue(data.dodAtFault)}
Vehicle Involved: ${formatValue(data.vehicleInvolved)}
Zendesk Ticket #: ${formatValue(data.zendeskTicketNumber)}
Incident Type: ${formatValue(data.incidentType)}
Notes: ${formatValue(data.notes)}
Created By: ${data.createdBy}

View all claims at: ${APP_URL}/safety

---
${APP_NAME}
  `.trim();
}

/**
 * @deprecated Claim-created delivery is owned by the centralized
 * Communication Service and its configured recipient rules.
 *
 * This safe no-op remains temporarily for backward source compatibility only;
 * it must not be reconnected to a Claims route.
 */
export async function sendNewClaimNotification(_data: NewClaimEmailData): Promise<{ success: boolean; error?: string }> {
  return {
    success: false,
    error: "Claim-created email delivery is managed by the Communication Service.",
  };
}

export async function sendWelcomeReminderEmail(
  to: string, 
  firstName: string, 
  role: "driver" | "employee"
): Promise<{ success: boolean; error?: string }> {
  if (!resend) {
    console.warn("Email service not configured. Reminder not sent to:", to);
    return { success: false, error: "Email service not configured" };
  }

  try {
    const fromEmail = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
    const profileUrl = role === "driver" ? `${APP_URL}/driver` : `${APP_URL}/employee`;
    
    const { data: emailData, error } = await resend.emails.send({
      from: `${APP_NAME} <${fromEmail}>`,
      to: to,
      subject: `Reminder: Complete Your ${APP_NAME} Profile`,
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Complete Your Profile</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <tr>
            <td style="background-color: #FF6B35; padding: 30px 40px; border-radius: 12px 12px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600;">${APP_NAME}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <h2 style="margin: 0 0 20px 0; color: #18181b; font-size: 24px;">Hi ${firstName}!</h2>
              <p style="margin: 0 0 20px 0; color: #52525b; font-size: 16px; line-height: 1.6;">
                We noticed your profile is incomplete. Please take a moment to fill in all required information.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding: 20px 0;">
                    <a href="${profileUrl}" style="display: inline-block; background-color: #FF6B35; color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-size: 16px; font-weight: 600;">
                      Complete Your Profile
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
      `.trim(),
      text: `Hi ${firstName}! We noticed your profile is incomplete. Please visit ${profileUrl} to fill in all required information.`,
    });

    if (error) {
      console.error("Failed to send reminder email:", error);
      return { success: false, error: error.message };
    }

    console.log(`Reminder email sent to ${to}, email ID: ${emailData?.id}`);
    return { success: true };
  } catch (error: any) {
    console.error("Error sending reminder email:", error);
    return { success: false, error: error.message };
  }
}

// ==========================================
// CUSTOMER NOTIFICATION EMAILS
// ==========================================

export interface CustomerNotificationEmailData {
  to: string;
  customerName: string;
}

export interface MoveScheduledEmailData extends CustomerNotificationEmailData {
  moveNumber: string;
  tripDate: string;
  origin: string;
  destination: string;
}

export interface MoveAssignedEmailData extends CustomerNotificationEmailData {
  moveNumber: string;
  tripDate: string;
  driverFirstName: string;
}

export interface DelayExceptionEmailData extends CustomerNotificationEmailData {
  moveNumber: string;
  publicMessage: string;
  exceptionType: string;
}

export interface MoveCompletedEmailData extends CustomerNotificationEmailData {
  moveNumber: string;
  completedAt: string;
  origin: string;
  destination: string;
}

export interface InvoicePreviewEmailData extends CustomerNotificationEmailData {
  invoiceNumber: string;
  totalAmount: string;
  dueDate: string;
}

function getCustomerEmailHtml(subject: string, content: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject} - ${APP_NAME}</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <tr>
            <td style="background-color: #FF6B35; padding: 30px 40px; border-radius: 12px 12px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600;">${APP_NAME}</h1>
              <p style="margin: 10px 0 0 0; color: #ffffff; font-size: 16px; opacity: 0.9;">${subject}</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              ${content}
            </td>
          </tr>
          <tr>
            <td style="background-color: #fafafa; padding: 20px 40px; border-radius: 0 0 12px 12px; text-align: center;">
              <p style="margin: 0; color: #a1a1aa; font-size: 12px;">
                &copy; ${new Date().getFullYear()} ${APP_NAME}. All rights reserved.
              </p>
              <p style="margin: 10px 0 0 0; color: #a1a1aa; font-size: 11px;">
                To manage your notification preferences, visit your account settings.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

export async function sendMoveScheduledNotification(data: MoveScheduledEmailData): Promise<{ success: boolean; error?: string }> {
  if (!resend) {
    console.warn("Email service not configured. Move scheduled notification not sent.");
    return { success: false, error: "Email service not configured" };
  }

  try {
    const fromEmail = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
    const content = `
      <h2 style="margin: 0 0 20px 0; color: #18181b; font-size: 24px;">Move Scheduled</h2>
      <p style="margin: 0 0 20px 0; color: #52525b; font-size: 16px; line-height: 1.6;">
        Hi ${data.customerName},
      </p>
      <p style="margin: 0 0 20px 0; color: #52525b; font-size: 16px; line-height: 1.6;">
        Your move has been scheduled! Here are the details:
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #e4e4e7; border-radius: 8px; margin-bottom: 20px;">
        <tr style="background-color: #fafafa;">
          <td style="padding: 12px 16px; font-weight: 600; color: #52525b;">Move #</td>
          <td style="padding: 12px 16px; color: #18181b;">${data.moveNumber}</td>
        </tr>
        <tr>
          <td style="padding: 12px 16px; font-weight: 600; color: #52525b;">Date</td>
          <td style="padding: 12px 16px; color: #18181b;">${data.tripDate}</td>
        </tr>
        <tr style="background-color: #fafafa;">
          <td style="padding: 12px 16px; font-weight: 600; color: #52525b;">Pickup</td>
          <td style="padding: 12px 16px; color: #18181b;">${data.origin}</td>
        </tr>
        <tr>
          <td style="padding: 12px 16px; font-weight: 600; color: #52525b;">Delivery</td>
          <td style="padding: 12px 16px; color: #18181b;">${data.destination}</td>
        </tr>
      </table>
      <p style="margin: 0; color: #52525b; font-size: 14px;">
        We'll notify you when a driver has been assigned to your move.
      </p>
    `;

    const { data: emailData, error } = await resend.emails.send({
      from: `${APP_NAME} <${fromEmail}>`,
      to: data.to,
      subject: `Move Scheduled - #${data.moveNumber}`,
      html: getCustomerEmailHtml("Move Scheduled", content),
    });

    if (error) {
      console.error("Failed to send move scheduled notification:", error);
      return { success: false, error: error.message };
    }

    console.log(`Move scheduled notification sent to ${data.to}, email ID: ${emailData?.id}`);
    return { success: true };
  } catch (error: any) {
    console.error("Error sending move scheduled notification:", error);
    return { success: false, error: error.message };
  }
}

export async function sendMoveAssignedNotification(data: MoveAssignedEmailData): Promise<{ success: boolean; error?: string }> {
  if (!resend) {
    console.warn("Email service not configured. Move assigned notification not sent.");
    return { success: false, error: "Email service not configured" };
  }

  try {
    const fromEmail = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
    const content = `
      <h2 style="margin: 0 0 20px 0; color: #18181b; font-size: 24px;">Driver Assigned</h2>
      <p style="margin: 0 0 20px 0; color: #52525b; font-size: 16px; line-height: 1.6;">
        Hi ${data.customerName},
      </p>
      <p style="margin: 0 0 20px 0; color: #52525b; font-size: 16px; line-height: 1.6;">
        Great news! A driver has been assigned to your move <strong>#${data.moveNumber}</strong> scheduled for <strong>${data.tripDate}</strong>.
      </p>
      <p style="margin: 0 0 20px 0; color: #52525b; font-size: 16px; line-height: 1.6;">
        Your driver <strong>${data.driverFirstName}</strong> is preparing for your move.
      </p>
      <p style="margin: 0; color: #52525b; font-size: 14px;">
        We'll keep you updated on your move's progress.
      </p>
    `;

    const { data: emailData, error } = await resend.emails.send({
      from: `${APP_NAME} <${fromEmail}>`,
      to: data.to,
      subject: `Driver Assigned - Move #${data.moveNumber}`,
      html: getCustomerEmailHtml("Driver Assigned", content),
    });

    if (error) {
      console.error("Failed to send move assigned notification:", error);
      return { success: false, error: error.message };
    }

    console.log(`Move assigned notification sent to ${data.to}, email ID: ${emailData?.id}`);
    return { success: true };
  } catch (error: any) {
    console.error("Error sending move assigned notification:", error);
    return { success: false, error: error.message };
  }
}

export async function sendDelayExceptionNotification(data: DelayExceptionEmailData): Promise<{ success: boolean; error?: string }> {
  if (!resend) {
    console.warn("Email service not configured. Delay exception notification not sent.");
    return { success: false, error: "Email service not configured" };
  }

  try {
    const fromEmail = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
    const content = `
      <h2 style="margin: 0 0 20px 0; color: #18181b; font-size: 24px;">Move Update</h2>
      <p style="margin: 0 0 20px 0; color: #52525b; font-size: 16px; line-height: 1.6;">
        Hi ${data.customerName},
      </p>
      <p style="margin: 0 0 20px 0; color: #52525b; font-size: 16px; line-height: 1.6;">
        We have an update regarding your move <strong>#${data.moveNumber}</strong>:
      </p>
      <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; margin-bottom: 20px; border-radius: 0 8px 8px 0;">
        <p style="margin: 0; color: #92400e; font-size: 14px;">
          ${data.publicMessage}
        </p>
      </div>
      <p style="margin: 0; color: #52525b; font-size: 14px;">
        We apologize for any inconvenience and will keep you updated.
      </p>
    `;

    const { data: emailData, error } = await resend.emails.send({
      from: `${APP_NAME} <${fromEmail}>`,
      to: data.to,
      subject: `Move Update - #${data.moveNumber}`,
      html: getCustomerEmailHtml("Move Update", content),
    });

    if (error) {
      console.error("Failed to send delay exception notification:", error);
      return { success: false, error: error.message };
    }

    console.log(`Delay exception notification sent to ${data.to}, email ID: ${emailData?.id}`);
    return { success: true };
  } catch (error: any) {
    console.error("Error sending delay exception notification:", error);
    return { success: false, error: error.message };
  }
}

export async function sendMoveCompletedNotification(data: MoveCompletedEmailData): Promise<{ success: boolean; error?: string }> {
  if (!resend) {
    console.warn("Email service not configured. Move completed notification not sent.");
    return { success: false, error: "Email service not configured" };
  }

  try {
    const fromEmail = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
    const content = `
      <h2 style="margin: 0 0 20px 0; color: #18181b; font-size: 24px;">Move Completed!</h2>
      <p style="margin: 0 0 20px 0; color: #52525b; font-size: 16px; line-height: 1.6;">
        Hi ${data.customerName},
      </p>
      <p style="margin: 0 0 20px 0; color: #52525b; font-size: 16px; line-height: 1.6;">
        Your move <strong>#${data.moveNumber}</strong> has been successfully completed!
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #e4e4e7; border-radius: 8px; margin-bottom: 20px;">
        <tr style="background-color: #fafafa;">
          <td style="padding: 12px 16px; font-weight: 600; color: #52525b;">From</td>
          <td style="padding: 12px 16px; color: #18181b;">${data.origin}</td>
        </tr>
        <tr>
          <td style="padding: 12px 16px; font-weight: 600; color: #52525b;">To</td>
          <td style="padding: 12px 16px; color: #18181b;">${data.destination}</td>
        </tr>
        <tr style="background-color: #fafafa;">
          <td style="padding: 12px 16px; font-weight: 600; color: #52525b;">Completed</td>
          <td style="padding: 12px 16px; color: #18181b;">${data.completedAt}</td>
        </tr>
      </table>
      <p style="margin: 0; color: #52525b; font-size: 14px;">
        Thank you for choosing ${APP_NAME}. We appreciate your business!
      </p>
    `;

    const { data: emailData, error } = await resend.emails.send({
      from: `${APP_NAME} <${fromEmail}>`,
      to: data.to,
      subject: `Move Completed - #${data.moveNumber}`,
      html: getCustomerEmailHtml("Move Completed", content),
    });

    if (error) {
      console.error("Failed to send move completed notification:", error);
      return { success: false, error: error.message };
    }

    console.log(`Move completed notification sent to ${data.to}, email ID: ${emailData?.id}`);
    return { success: true };
  } catch (error: any) {
    console.error("Error sending move completed notification:", error);
    return { success: false, error: error.message };
  }
}

export async function sendInvoicePreviewNotification(data: InvoicePreviewEmailData): Promise<{ success: boolean; error?: string }> {
  if (!resend) {
    console.warn("Email service not configured. Invoice preview notification not sent.");
    return { success: false, error: "Email service not configured" };
  }

  try {
    const fromEmail = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
    const content = `
      <h2 style="margin: 0 0 20px 0; color: #18181b; font-size: 24px;">Invoice Preview Available</h2>
      <p style="margin: 0 0 20px 0; color: #52525b; font-size: 16px; line-height: 1.6;">
        Hi ${data.customerName},
      </p>
      <p style="margin: 0 0 20px 0; color: #52525b; font-size: 16px; line-height: 1.6;">
        A new invoice preview is available for your review:
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #e4e4e7; border-radius: 8px; margin-bottom: 20px;">
        <tr style="background-color: #fafafa;">
          <td style="padding: 12px 16px; font-weight: 600; color: #52525b;">Invoice #</td>
          <td style="padding: 12px 16px; color: #18181b;">${data.invoiceNumber}</td>
        </tr>
        <tr>
          <td style="padding: 12px 16px; font-weight: 600; color: #52525b;">Amount</td>
          <td style="padding: 12px 16px; color: #18181b;">${data.totalAmount}</td>
        </tr>
        <tr style="background-color: #fafafa;">
          <td style="padding: 12px 16px; font-weight: 600; color: #52525b;">Due Date</td>
          <td style="padding: 12px 16px; color: #18181b;">${data.dueDate}</td>
        </tr>
      </table>
      <p style="margin: 0; color: #52525b; font-size: 14px;">
        Please review the invoice and contact us if you have any questions.
      </p>
    `;

    const { data: emailData, error } = await resend.emails.send({
      from: `${APP_NAME} <${fromEmail}>`,
      to: data.to,
      subject: `Invoice Preview - #${data.invoiceNumber}`,
      html: getCustomerEmailHtml("Invoice Preview", content),
    });

    if (error) {
      console.error("Failed to send invoice preview notification:", error);
      return { success: false, error: error.message };
    }

    console.log(`Invoice preview notification sent to ${data.to}, email ID: ${emailData?.id}`);
    return { success: true };
  } catch (error: any) {
    console.error("Error sending invoice preview notification:", error);
    return { success: false, error: error.message };
  }
}

// ==========================================
// CUSTOMER USER INVITATION EMAIL
// ==========================================

export async function sendCustomerUserInvitation(
  email: string, 
  customerName: string, 
  invitationId: string
): Promise<{ success: boolean; error?: string }> {
  if (!resend) {
    console.warn("Email service not configured. Customer user invitation not sent.");
    return { success: false, error: "Email service not configured" };
  }

  try {
    const fromEmail = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
    const baseUrl = getAppBaseUrl();
    const acceptUrl = `${baseUrl}/customer/accept-invitation/${invitationId}`;

    const content = `
      <h2 style="margin: 0 0 20px 0; color: #18181b; font-size: 24px;">You've Been Invited!</h2>
      <p style="margin: 0 0 20px 0; color: #52525b; font-size: 16px; line-height: 1.6;">
        You've been invited to join the <strong>${customerName}</strong> account on DriverHub 360.
      </p>
      <p style="margin: 0 0 30px 0; color: #52525b; font-size: 16px; line-height: 1.6;">
        Click the button below to accept the invitation and access your account dashboard.
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 30px;">
        <tr>
          <td align="center">
            <a href="${acceptUrl}" style="display: inline-block; background-color: #FF6B35; color: white; font-weight: 600; font-size: 16px; padding: 14px 32px; text-decoration: none; border-radius: 6px;">
              Accept Invitation
            </a>
          </td>
        </tr>
      </table>
      <p style="margin: 0 0 10px 0; color: #71717a; font-size: 14px;">
        Or copy and paste this link into your browser:
      </p>
      <p style="margin: 0; color: #3b82f6; font-size: 14px; word-break: break-all;">
        ${acceptUrl}
      </p>
    `;

    const { data: emailData, error } = await resend.emails.send({
      from: `${APP_NAME} <${fromEmail}>`,
      to: email,
      subject: `You're invited to join ${customerName} on DriverHub 360`,
      html: getCustomerEmailHtml("Account Invitation", content),
    });

    if (error) {
      console.error("Failed to send customer user invitation:", error);
      return { success: false, error: error.message };
    }

    console.log(`Customer user invitation sent to ${email}, email ID: ${emailData?.id}`);
    return { success: true };
  } catch (error: any) {
    console.error("Error sending customer user invitation:", error);
    return { success: false, error: error.message };
  }
}

// Send Document Packet to external recipients
export interface DocumentPacketEmailData {
  to: string;
  customerName: string;
  senderName: string;
  documentNames: string[];
  documentUrls: { name: string; url: string }[];
}

function getDocumentPacketEmailHtml(data: DocumentPacketEmailData): string {
  const documentList = data.documentNames.map(name => `<li style="margin-bottom: 8px;">${name}</li>`).join('');
  const attachmentLinks = data.documentUrls.map(doc => 
    `<a href="${doc.url}" style="display: inline-block; background-color: #f4f4f5; color: #18181b; text-decoration: none; padding: 12px 20px; border-radius: 6px; font-size: 14px; margin: 4px 0; border: 1px solid #e4e4e7;">${doc.name}</a>`
  ).join('<br>');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Document Packet from ${APP_NAME}</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="background-color: #FF6B35; padding: 30px 40px; border-radius: 12px 12px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600;">${APP_NAME}</h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <h2 style="margin: 0 0 20px 0; color: #18181b; font-size: 24px;">Document Packet</h2>
              
              <p style="margin: 0 0 20px 0; color: #52525b; font-size: 16px; line-height: 1.6;">
                <strong>${data.senderName}</strong> from <strong>${data.customerName}</strong> has sent you the following documents:
              </p>
              
              <div style="background-color: #f9fafb; border-radius: 8px; padding: 20px; margin: 20px 0;">
                <h3 style="margin: 0 0 12px 0; color: #374151; font-size: 16px;">Included Documents:</h3>
                <ul style="margin: 0; padding-left: 20px; color: #52525b; font-size: 14px; line-height: 1.8;">
                  ${documentList}
                </ul>
              </div>
              
              <p style="margin: 20px 0; color: #52525b; font-size: 16px; line-height: 1.6;">
                Download the documents below:
              </p>
              
              <div style="margin: 20px 0;">
                ${attachmentLinks}
              </div>
              
              <p style="margin: 30px 0 0 0; color: #71717a; font-size: 14px; line-height: 1.6;">
                If you have any questions about these documents, please contact your representative.
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 30px 40px; background-color: #f9fafb; border-radius: 0 0 12px 12px; text-align: center;">
              <p style="margin: 0; color: #71717a; font-size: 12px;">
                Sent via ${APP_NAME}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
}

export async function sendDocumentPacketEmail(data: DocumentPacketEmailData): Promise<{ success: boolean; error?: string }> {
  if (!resend) {
    console.log("RESEND_API_KEY not configured - document packet email skipped");
    console.log("Would have sent document packet to:", data.to);
    console.log("Documents:", data.documentNames.join(", "));
    return { success: true };
  }

  try {
    const fromEmail = process.env.FROM_EMAIL || "noreply@driverhub360.com";

    const { data: emailData, error } = await resend.emails.send({
      from: `${APP_NAME} <${fromEmail}>`,
      to: data.to,
      subject: `Document Packet from ${data.customerName}`,
      html: getDocumentPacketEmailHtml(data),
    });

    if (error) {
      console.error("Failed to send document packet email:", error);
      return { success: false, error: error.message };
    }

    console.log(`Document packet sent to ${data.to}, email ID: ${emailData?.id}`);
    return { success: true };
  } catch (error: any) {
    console.error("Error sending document packet email:", error);
    return { success: false, error: error.message };
  }
}

// ==========================================
// INVOICE EMAIL DELIVERY
// ==========================================

export interface InvoiceEmailData {
  to: string;
  customerName: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  totalAmount: string;
  balanceDue: string;
  paymentLink: string;
  lineItems: Array<{
    description: string;
    quantity: number;
    unitPrice: string;
    amount: string;
  }>;
  companyName?: string;
  notes?: string;
  isResend?: boolean;
  // Billing entity branding
  billingEntityName?: string;
  billingEntityDba?: string;
  billingEntityEmail?: string;
  billingEntityPhone?: string;
  billingEntityAddress?: string;
  billingEntityWebsite?: string;
  w9Url?: string;
}

function formatCurrency(amount: string): string {
  const num = parseFloat(amount);
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num);
}

function getInvoiceEmailHtml(data: InvoiceEmailData): string {
  const NAVY   = '#1F2A6D';
  const GREEN  = '#16a34a';
  const brand  = data.billingEntityDba || data.billingEntityName || 'Driver on Demand';
  const year   = new Date().getFullYear();

  const lineItemsHtml = data.lineItems.map((item, idx) => `
    <tr style="background-color: ${idx % 2 === 0 ? '#ffffff' : '#f7f8fa'};">
      <td style="padding: 11px 16px; color: #1a1a2e; font-size: 13px; border-bottom: 1px solid #e8eaf0;">${item.description}</td>
      <td style="padding: 11px 16px; color: #52525b; font-size: 13px; border-bottom: 1px solid #e8eaf0; text-align: center;">${item.quantity}</td>
      <td style="padding: 11px 16px; color: #52525b; font-size: 13px; border-bottom: 1px solid #e8eaf0; text-align: right;">${formatCurrency(item.unitPrice)}</td>
      <td style="padding: 11px 16px; color: #1a1a2e; font-size: 13px; border-bottom: 1px solid #e8eaf0; text-align: right; font-weight: 600;">${formatCurrency(item.amount)}</td>
    </tr>
  `).join('');

  const contactLines: string[] = [];
  if (data.billingEntityEmail) contactLines.push(`<a href="mailto:${data.billingEntityEmail}" style="color: #a0b4cc; text-decoration: none;">${data.billingEntityEmail}</a>`);
  if (data.billingEntityPhone) contactLines.push(data.billingEntityPhone);
  if (data.billingEntityAddress) contactLines.push(data.billingEntityAddress);
  if (data.billingEntityWebsite) contactLines.push(`<a href="${data.billingEntityWebsite}" style="color: #a0b4cc; text-decoration: none;">${data.billingEntityWebsite}</a>`);
  const contactHtml = contactLines.join(' &nbsp;|&nbsp; ');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invoice #${data.invoiceNumber} – ${brand}</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Arial, sans-serif; background-color: #eef1f6;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #eef1f6; padding: 36px 16px;">
    <tr>
      <td align="center">
        <table width="640" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">

          <!-- ── HEADER ─────────────────────────────────────── -->
          <tr>
            <td style="background-color: ${NAVY}; padding: 28px 36px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="vertical-align: middle;">
                    <div style="font-size: 22px; font-weight: 700; color: #ffffff; letter-spacing: -0.3px; line-height: 1;">${brand}</div>
                    <div style="font-size: 12px; color: rgba(255,255,255,0.65); margin-top: 4px; letter-spacing: 0.5px; text-transform: uppercase;">Billing &amp; Invoicing</div>
                  </td>
                  <td style="text-align: right; vertical-align: middle;">
                    <div style="display: inline-block; background-color: rgba(255,255,255,0.12); border-radius: 4px; padding: 6px 14px;">
                      <div style="font-size: 11px; color: rgba(255,255,255,0.65); text-transform: uppercase; letter-spacing: 0.8px;">Invoice</div>
                      <div style="font-size: 20px; font-weight: 700; color: #ffffff; line-height: 1.3;">#${data.invoiceNumber}</div>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ── INTRO ──────────────────────────────────────── -->
          <tr>
            <td style="padding: 28px 36px 0 36px;">
              <p style="margin: 0 0 6px 0; font-size: 15px; color: #1a1a2e; font-weight: 600;">Hello, ${data.customerName}</p>
              <p style="margin: 0; font-size: 14px; color: #52525b; line-height: 1.65;">
                ${data.isResend
                  ? `This is a friendly reminder that Invoice <strong>#${data.invoiceNumber}</strong> remains outstanding. Please arrange payment at your earliest convenience.`
                  : `Please find your invoice below. Payment is due on <strong>${data.dueDate}</strong>. You may pay securely online using the button below.`
                }
              </p>
            </td>
          </tr>

          <!-- ── INVOICE META BAND ──────────────────────────── -->
          <tr>
            <td style="padding: 20px 36px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f7f8fa; border-radius: 6px;">
                <tr>
                  <td style="padding: 14px 18px; border-right: 1px solid #e8eaf0;">
                    <div style="font-size: 11px; color: #71717a; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 3px;">Invoice Date</div>
                    <div style="font-size: 14px; font-weight: 600; color: #1a1a2e;">${data.invoiceDate}</div>
                  </td>
                  <td style="padding: 14px 18px; border-right: 1px solid #e8eaf0;">
                    <div style="font-size: 11px; color: #71717a; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 3px;">Due Date</div>
                    <div style="font-size: 14px; font-weight: 600; color: #1a1a2e;">${data.dueDate}</div>
                  </td>
                  <td style="padding: 14px 18px; border-right: 1px solid #e8eaf0;">
                    <div style="font-size: 11px; color: #71717a; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 3px;">Invoice Total</div>
                    <div style="font-size: 14px; font-weight: 600; color: #1a1a2e;">${formatCurrency(data.totalAmount)}</div>
                  </td>
                  <td style="padding: 14px 18px;">
                    <div style="font-size: 11px; color: #71717a; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 3px;">Balance Due</div>
                    <div style="font-size: 16px; font-weight: 700; color: ${NAVY};">${formatCurrency(data.balanceDue)}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ── LINE ITEMS ─────────────────────────────────── -->
          <tr>
            <td style="padding: 0 36px 20px 36px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #e8eaf0; border-radius: 6px; overflow: hidden;">
                <thead>
                  <tr style="background-color: ${NAVY};">
                    <th style="padding: 12px 16px; color: #ffffff; font-size: 11px; text-transform: uppercase; letter-spacing: 0.6px; text-align: left; font-weight: 600;">Description</th>
                    <th style="padding: 12px 16px; color: #ffffff; font-size: 11px; text-transform: uppercase; letter-spacing: 0.6px; text-align: center; font-weight: 600;">Qty</th>
                    <th style="padding: 12px 16px; color: #ffffff; font-size: 11px; text-transform: uppercase; letter-spacing: 0.6px; text-align: right; font-weight: 600;">Rate</th>
                    <th style="padding: 12px 16px; color: #ffffff; font-size: 11px; text-transform: uppercase; letter-spacing: 0.6px; text-align: right; font-weight: 600;">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  ${lineItemsHtml}
                </tbody>
                <tfoot>
                  <tr style="background-color: #f7f8fa;">
                    <td colspan="3" style="padding: 13px 16px; font-size: 13px; font-weight: 600; color: #1a1a2e; text-align: right; border-top: 2px solid #e8eaf0;">Total:</td>
                    <td style="padding: 13px 16px; font-size: 14px; font-weight: 700; color: #1a1a2e; text-align: right; border-top: 2px solid #e8eaf0;">${formatCurrency(data.totalAmount)}</td>
                  </tr>
                  <tr style="background-color: ${NAVY};">
                    <td colspan="3" style="padding: 14px 16px; font-size: 14px; font-weight: 600; color: #ffffff; text-align: right;">Amount Due:</td>
                    <td style="padding: 14px 16px; font-size: 17px; font-weight: 700; color: #ffffff; text-align: right;">${formatCurrency(data.balanceDue)}</td>
                  </tr>
                </tfoot>
              </table>
            </td>
          </tr>

          ${data.notes ? `
          <!-- ── NOTES ──────────────────────────────────────── -->
          <tr>
            <td style="padding: 0 36px 20px 36px;">
              <div style="padding: 14px 18px; background-color: #f7f8fa; border-radius: 6px; border-left: 3px solid ${NAVY};">
                <p style="margin: 0 0 4px 0; font-size: 11px; color: #71717a; text-transform: uppercase; letter-spacing: 0.5px;">Notes</p>
                <p style="margin: 0; font-size: 13px; color: #52525b; line-height: 1.6;">${data.notes}</p>
              </div>
            </td>
          </tr>
          ` : ''}

          <!-- ── PAY INVOICE CTA ─────────────────────────────── -->
          <tr>
            <td style="padding: 4px 36px 10px 36px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f0fdf4; border-radius: 8px; border: 1px solid #bbf7d0;">
                <tr>
                  <td style="padding: 24px 28px; text-align: center;">
                    <p style="margin: 0 0 6px 0; font-size: 14px; color: #166534; font-weight: 600;">Pay securely online — credit card or ACH bank transfer</p>
                    <p style="margin: 0 0 18px 0; font-size: 13px; color: #4ade80;">No account required</p>
                    <a href="${data.paymentLink}" style="display: inline-block; background-color: ${GREEN}; color: #ffffff; text-decoration: none; padding: 15px 44px; border-radius: 6px; font-size: 16px; font-weight: 700; letter-spacing: 0.2px;">
                      Pay Invoice &nbsp; ${formatCurrency(data.balanceDue)}
                    </a>
                    <p style="margin: 14px 0 0 0; font-size: 11px; color: #15803d;">
                      Or copy this link: <span style="font-family: monospace; color: #166534;">${data.paymentLink}</span>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ── W-9 / FORMS ────────────────────────────────── -->
          ${data.w9Url ? `
          <tr>
            <td style="padding: 14px 36px 4px 36px; text-align: center;">
              <p style="margin: 0; font-size: 13px; color: #71717a; line-height: 1.7;">
                Need our W-9 or tax forms?&nbsp;
                <a href="${data.w9Url}" style="color: ${NAVY}; font-weight: 600; text-decoration: underline;">Download W-9</a>
              </p>
            </td>
          </tr>
          ` : ''}

          <!-- ── DIVIDER ─────────────────────────────────────── -->
          <tr>
            <td style="padding: 20px 36px 0 36px;">
              <hr style="border: none; border-top: 1px solid #e8eaf0; margin: 0;" />
            </td>
          </tr>

          <!-- ── FOOTER ─────────────────────────────────────── -->
          <tr>
            <td style="background-color: ${NAVY}; padding: 20px 36px; border-radius: 0 0 8px 8px; text-align: center;">
              <p style="margin: 0 0 4px 0; font-size: 13px; color: rgba(255,255,255,0.9); font-weight: 600;">${brand}</p>
              ${contactHtml ? `<p style="margin: 0 0 8px 0; font-size: 11px; color: rgba(255,255,255,0.6); line-height: 1.8;">${contactHtml}</p>` : ''}
              <p style="margin: 0; font-size: 10px; color: rgba(255,255,255,0.4);">&copy; ${year} ${brand}. All rights reserved.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

function getInvoiceEmailText(data: InvoiceEmailData): string {
  const brand = data.billingEntityDba || data.billingEntityName || 'Driver on Demand';
  const lineItems = data.lineItems.map(item =>
    `  - ${item.description}: ${item.quantity} x ${formatCurrency(item.unitPrice)} = ${formatCurrency(item.amount)}`
  ).join('\n');

  const contactParts: string[] = [];
  if (data.billingEntityEmail)   contactParts.push(data.billingEntityEmail);
  if (data.billingEntityPhone)   contactParts.push(data.billingEntityPhone);
  if (data.billingEntityAddress) contactParts.push(data.billingEntityAddress);

  return `
${brand} – Invoice #${data.invoiceNumber}

${data.isResend
    ? `Reminder: Invoice #${data.invoiceNumber} is still outstanding.`
    : `Please find your invoice below. Payment is due on ${data.dueDate}.`
  }

Bill To: ${data.customerName}
Invoice Date: ${data.invoiceDate}
Due Date: ${data.dueDate}

CHARGES:
${lineItems}

Invoice Total: ${formatCurrency(data.totalAmount)}
Balance Due:   ${formatCurrency(data.balanceDue)}

${data.notes ? `Notes: ${data.notes}\n` : ''}
──────────────────────────────────
PAY ONLINE (credit card or ACH):
${data.paymentLink}
──────────────────────────────────
${data.w9Url ? `Download W-9 / Tax Forms: ${data.w9Url}\n` : ''}
${contactParts.length ? `Questions? Contact us:\n${contactParts.join('\n')}\n` : ''}
${brand}
  `.trim();
}

export async function sendInvoiceEmail(data: InvoiceEmailData): Promise<{ success: boolean; error?: string; messageId?: string }> {
  const brand = data.billingEntityDba || data.billingEntityName || 'Driver on Demand';

  if (!resend) {
    console.log("RESEND_API_KEY not configured - invoice email would be sent to:", data.to);
    console.log("Invoice:", data.invoiceNumber, "Amount:", data.totalAmount);
    console.log("Payment Link:", data.paymentLink);
    return { success: true, error: "Email service not configured (RESEND_API_KEY missing)" };
  }

  try {
    const fromEmail = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";

    // Subject: "Driver on Demand Invoice – Week Ending {dueDate}" / reminder variant
    const subject = data.isResend
      ? `Reminder: ${brand} Invoice #${data.invoiceNumber} – ${formatCurrency(data.balanceDue)} Due ${data.dueDate}`
      : `${brand} Invoice – Week Ending ${data.dueDate}`;

    const { data: emailData, error } = await resend.emails.send({
      from: `${brand} Billing <${fromEmail}>`,
      to: data.to,
      subject,
      html: getInvoiceEmailHtml(data),
      text: getInvoiceEmailText(data),
    });

    if (error) {
      console.error("Failed to send invoice email:", error);
      return { success: false, error: error.message };
    }

    console.log(`Invoice email ${data.isResend ? 'resent' : 'sent'} to ${data.to}, email ID: ${emailData?.id}`);
    return { success: true, messageId: emailData?.id };
  } catch (error: any) {
    console.error("Error sending invoice email:", error);
    return { success: false, error: error.message };
  }
}

export interface PaymentReceiptInvoiceLine {
  number: string;
  amount: string;
  remainingBalance: string;
}

export interface PaymentReceiptEmailData {
  to: string;
  customerName: string;
  paymentNumber: string;
  /** Single invoice — used by Stripe webhook and legacy callers. */
  invoiceNumber: string;
  paymentDate: string;
  paymentMethod: string;
  amount: string;
  cardLast4?: string | null;
  achAccountLast4?: string | null;
  remainingBalance: string;
  /** Multi-invoice breakdown — when provided, overrides the single invoiceNumber row. */
  invoices?: PaymentReceiptInvoiceLine[];
}

const BRAND_COLOR = '#1F2A6D';

function formatPaymentMethod(data: PaymentReceiptEmailData): string {
  if (data.paymentMethod === 'ach' || data.paymentMethod === 'ach_manual') {
    return data.achAccountLast4
      ? `Bank Transfer (ACH) — ending in ${data.achAccountLast4}`
      : 'Bank Transfer (ACH)';
  }
  if (data.paymentMethod === 'card' || data.paymentMethod === 'credit_card') {
    return data.cardLast4
      ? `Card — ending in ${data.cardLast4}`
      : 'Credit / Debit Card';
  }
  const labels: Record<string, string> = {
    check: 'Check', wire: 'Wire Transfer', cash: 'Cash', other: 'Other',
  };
  return labels[data.paymentMethod] || data.paymentMethod;
}

function getPaymentReceiptEmailHtml(data: PaymentReceiptEmailData): string {
  const paymentMethodDisplay = formatPaymentMethod(data);

  // Build invoice rows — multi-invoice breakdown if provided, else single row
  const invoiceLines: PaymentReceiptInvoiceLine[] =
    data.invoices && data.invoices.length > 0
      ? data.invoices
      : [{ number: data.invoiceNumber, amount: data.amount, remainingBalance: data.remainingBalance }];

  const invoiceRowsHtml = invoiceLines
    .map((inv, i) => {
      const bg = i % 2 === 0 ? '#fafafa' : '#ffffff';
      return `
        <tr style="background-color: ${bg};">
          <td style="padding: 12px 16px; color: #18181b; border-bottom: 1px solid #e4e4e7;">#${inv.number}</td>
          <td style="padding: 12px 16px; color: #18181b; border-bottom: 1px solid #e4e4e7; text-align: right;">${formatCurrency(inv.amount)}</td>
          <td style="padding: 12px 16px; color: ${parseFloat(inv.remainingBalance) <= 0 ? '#16a34a' : '#92400e'}; border-bottom: 1px solid #e4e4e7; text-align: right; font-weight: 500;">
            ${parseFloat(inv.remainingBalance) <= 0 ? 'Paid in Full' : formatCurrency(inv.remainingBalance) + ' remaining'}
          </td>
        </tr>`;
    })
    .join('');

  const hasMultiple = invoiceLines.length > 1;
  const invoiceHeaderLabel = hasMultiple ? 'Applied to Invoices' : 'Invoice';
  const totalRemainingBalance = parseFloat(data.remainingBalance);
  const overallFullyPaid = !hasMultiple && totalRemainingBalance <= 0;

  const invoiceIntro = hasMultiple
    ? `Your payment of <strong>${formatCurrency(data.amount)}</strong> has been applied to ${invoiceLines.length} invoices:`
    : `We've received your payment for Invoice <strong>#${data.invoiceNumber}</strong>. Here's your receipt:`;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payment Receipt - Driver on Demand</title>
</head>
<body style="margin:0;padding:0;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;background-color:#f4f4f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="620" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;">

          <!-- Brand header -->
          <tr>
            <td style="background-color:${BRAND_COLOR};padding:28px 36px;">
              <p style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">Driver on Demand</p>
              <p style="margin:4px 0 0;color:rgba(255,255,255,0.7);font-size:12px;">AutoNition, LLC &middot; EIN 39-4553456 &middot; billing@driverondemand.co</p>
            </td>
          </tr>

          <!-- Green confirmation banner -->
          <tr>
            <td style="background-color:#16a34a;padding:22px 36px;text-align:center;">
              <p style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">Payment Received</p>
              <p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">Thank you, ${data.customerName}!</p>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding:32px 36px;">
              <p style="margin:0 0 24px;color:#3f3f46;font-size:15px;line-height:1.6;">${invoiceIntro}</p>

              <!-- Payment summary table -->
              <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e4e4e7;border-radius:6px;overflow:hidden;margin-bottom:24px;">
                <tr style="background-color:#f4f4f5;">
                  <td style="padding:12px 16px;font-weight:600;color:#52525b;font-size:13px;border-bottom:1px solid #e4e4e7;">Receipt #</td>
                  <td style="padding:12px 16px;color:#18181b;border-bottom:1px solid #e4e4e7;">${data.paymentNumber}</td>
                </tr>
                <tr>
                  <td style="padding:12px 16px;font-weight:600;color:#52525b;font-size:13px;border-bottom:1px solid #e4e4e7;">Payment Date</td>
                  <td style="padding:12px 16px;color:#18181b;border-bottom:1px solid #e4e4e7;">${data.paymentDate}</td>
                </tr>
                <tr style="background-color:#f4f4f5;">
                  <td style="padding:12px 16px;font-weight:600;color:#52525b;font-size:13px;border-bottom:1px solid #e4e4e7;">Payment Method</td>
                  <td style="padding:12px 16px;color:#18181b;border-bottom:1px solid #e4e4e7;">${paymentMethodDisplay}</td>
                </tr>
                <tr style="background-color:${BRAND_COLOR};">
                  <td style="padding:14px 16px;font-weight:700;color:#ffffff;font-size:15px;">Total Paid</td>
                  <td style="padding:14px 16px;color:#ffffff;font-weight:700;font-size:20px;">${formatCurrency(data.amount)}</td>
                </tr>
              </table>

              <!-- Invoice breakdown -->
              ${hasMultiple ? `
              <p style="margin:0 0 10px;font-weight:600;color:#18181b;font-size:14px;">Invoice Breakdown</p>
              <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e4e4e7;border-radius:6px;overflow:hidden;margin-bottom:24px;">
                <tr style="background-color:${BRAND_COLOR};">
                  <th style="padding:10px 14px;color:#fff;font-size:13px;text-align:left;">Invoice #</th>
                  <th style="padding:10px 14px;color:#fff;font-size:13px;text-align:right;">Applied</th>
                  <th style="padding:10px 14px;color:#fff;font-size:13px;text-align:right;">Balance</th>
                </tr>
                ${invoiceRowsHtml}
              </table>
              ` : ''}

              <!-- Balance status -->
              ${totalRemainingBalance > 0.005 ? `
              <div style="background-color:#fef3c7;border-radius:6px;padding:14px 16px;margin-bottom:20px;">
                <p style="margin:0;color:#92400e;font-size:14px;"><strong>Remaining balance: ${formatCurrency(String(totalRemainingBalance))}</strong> — a follow-up invoice or payment may be needed.</p>
              </div>
              ` : `
              <div style="background-color:#dcfce7;border-radius:6px;padding:14px 16px;margin-bottom:20px;">
                <p style="margin:0;color:#15803d;font-size:14px;"><strong>Account fully paid</strong> — no outstanding balance. Thank you!</p>
              </div>
              `}

              <p style="margin:0;color:#71717a;font-size:13px;line-height:1.6;">
                Please save this email for your records. Questions? Contact us at
                <a href="mailto:billing@driverondemand.co" style="color:${BRAND_COLOR};">billing@driverondemand.co</a>.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#f4f4f5;padding:18px 36px;text-align:center;">
              <p style="margin:0;color:#a1a1aa;font-size:12px;">
                &copy; ${new Date().getFullYear()} AutoNition, LLC &middot; 4491 S State Road 7, Fort Lauderdale FL 33314 &middot; billing@driverondemand.co
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();
}

export async function sendPaymentReceiptEmail(data: PaymentReceiptEmailData): Promise<{ success: boolean; error?: string }> {
  // Primary: Microsoft Graph (configured). Fallback: Resend.
  try {
    const { sendEmail: mgSend, isMicrosoftGraphConfigured } = await import("./services/microsoftGraphService");
    if (isMicrosoftGraphConfigured()) {
      const result = await mgSend({
        to: [data.to],
        subject: `Payment Receipt – ${formatCurrency(data.amount)} for Invoice #${data.invoiceNumber}`,
        bodyHtml: getPaymentReceiptEmailHtml(data),
      });
      if (result.ok || result.skipped) {
        console.log(`[Receipt] Payment receipt sent via Microsoft Graph to ${data.to}`);
        return { success: true };
      }
      console.warn("[Receipt] Microsoft Graph send failed, trying Resend:", result.error);
    }
  } catch (e: any) {
    console.warn("[Receipt] Microsoft Graph import failed, trying Resend:", e.message);
  }

  if (!resend) {
    console.log("[Receipt] No email provider configured — receipt not sent to:", data.to);
    return { success: false, error: "No email provider configured" };
  }

  try {
    const fromEmail = process.env.RESEND_FROM_EMAIL || "billing@driverondemand.co";
    const { data: emailData, error } = await resend.emails.send({
      from: `Driver on Demand Billing <${fromEmail}>`,
      to: data.to,
      subject: `Payment Receipt – ${formatCurrency(data.amount)} for Invoice #${data.invoiceNumber}`,
      html: getPaymentReceiptEmailHtml(data),
    });
    if (error) {
      console.error("[Receipt] Resend failed:", error);
      return { success: false, error: error.message };
    }
    console.log(`[Receipt] Sent via Resend to ${data.to}, ID: ${emailData?.id}`);
    return { success: true };
  } catch (error: any) {
    console.error("[Receipt] Error:", error);
    return { success: false, error: error.message };
  }
}

// ─── Payment Failure Email ────────────────────────────────────────────────────

export interface PaymentFailureEmailData {
  to: string;
  customerName: string;
  invoiceNumber: string;
  amount: string;
  failureReason: string;
  paymentLink: string;
}

function getPaymentFailureEmailHtml(data: PaymentFailureEmailData): string {
  const BRAND_NAVY = '#1F2A6D';
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payment Failed – Action Required</title>
</head>
<body style="margin:0;padding:0;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;background-color:#f4f4f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;">
          <!-- Header -->
          <tr>
            <td style="background-color:${BRAND_NAVY};padding:28px 36px;">
              <p style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">Driver on Demand</p>
              <p style="margin:4px 0 0;color:rgba(255,255,255,0.75);font-size:12px;">AutoNition, LLC · EIN 39-4553456 · billing@driverondemand.co</p>
            </td>
          </tr>
          <!-- Alert banner -->
          <tr>
            <td style="background-color:#fef2f2;border-bottom:2px solid #fca5a5;padding:20px 36px;">
              <p style="margin:0;color:#991b1b;font-size:18px;font-weight:700;">Payment Failed – Action Required</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px 36px;">
              <p style="margin:0 0 16px;color:#374151;font-size:15px;">Hi ${data.customerName},</p>
              <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.6;">
                We were unable to process your payment of <strong>${formatCurrency(data.amount)}</strong> for
                Invoice #${data.invoiceNumber}. Your invoice remains open and a balance is still due.
              </p>

              <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:6px;margin-bottom:28px;">
                <tr style="background-color:#f9fafb;">
                  <td style="padding:12px 16px;color:#6b7280;font-size:13px;font-weight:600;border-bottom:1px solid #e5e7eb;">Invoice Number</td>
                  <td style="padding:12px 16px;color:#111827;font-size:14px;border-bottom:1px solid #e5e7eb;">#${data.invoiceNumber}</td>
                </tr>
                <tr>
                  <td style="padding:12px 16px;color:#6b7280;font-size:13px;font-weight:600;border-bottom:1px solid #e5e7eb;">Amount</td>
                  <td style="padding:12px 16px;color:#111827;font-size:14px;border-bottom:1px solid #e5e7eb;">${formatCurrency(data.amount)}</td>
                </tr>
                <tr style="background-color:#f9fafb;">
                  <td style="padding:12px 16px;color:#6b7280;font-size:13px;font-weight:600;">Reason</td>
                  <td style="padding:12px 16px;color:#b91c1c;font-size:14px;font-weight:600;">${data.failureReason}</td>
                </tr>
              </table>

              <div style="text-align:center;margin-bottom:28px;">
                <a href="${data.paymentLink}"
                   style="display:inline-block;background-color:${BRAND_NAVY};color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:14px 32px;border-radius:6px;">
                  Retry Payment
                </a>
              </div>

              <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.6;">
                Common reasons for payment failure include insufficient funds, an expired card, or bank restrictions
                on ACH transfers. Please verify your payment details before retrying. If you need assistance,
                contact us at <a href="mailto:billing@driverondemand.co" style="color:${BRAND_NAVY};">billing@driverondemand.co</a>.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color:#f9fafb;padding:16px 36px;border-top:1px solid #e5e7eb;">
              <p style="margin:0;color:#9ca3af;font-size:11px;text-align:center;">
                Driver on Demand · AutoNition, LLC · 4491 S State Road 7, Fort Lauderdale FL 33314 ·
                <a href="mailto:billing@driverondemand.co" style="color:#9ca3af;">billing@driverondemand.co</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();
}

export async function sendPaymentFailureEmail(data: PaymentFailureEmailData): Promise<{ success: boolean; error?: string }> {
  try {
    const { sendEmail: mgSend, isMicrosoftGraphConfigured } = await import("./services/microsoftGraphService");
    if (isMicrosoftGraphConfigured()) {
      const result = await mgSend({
        to: [data.to],
        subject: `Payment Failed – Action Required for Invoice #${data.invoiceNumber}`,
        bodyHtml: getPaymentFailureEmailHtml(data),
      });
      if (result.ok || result.skipped) {
        console.log(`[PaymentFailure] Failure email sent via Microsoft Graph to ${data.to}`);
        return { success: true };
      }
      console.warn("[PaymentFailure] Microsoft Graph failed:", result.error);
    }
  } catch (e: any) {
    console.warn("[PaymentFailure] Microsoft Graph import failed:", e.message);
  }

  if (!resend) {
    console.log("[PaymentFailure] No email provider configured — failure email not sent to:", data.to);
    return { success: false, error: "No email provider configured" };
  }

  try {
    const fromEmail = process.env.RESEND_FROM_EMAIL || "billing@driverondemand.co";
    const { data: emailData, error } = await resend.emails.send({
      from: `Driver on Demand Billing <${fromEmail}>`,
      to: data.to,
      subject: `Payment Failed – Action Required for Invoice #${data.invoiceNumber}`,
      html: getPaymentFailureEmailHtml(data),
    });
    if (error) {
      console.error("[PaymentFailure] Resend error:", error);
      return { success: false, error: error.message };
    }
    console.log(`[PaymentFailure] Sent via Resend to ${data.to}, ID: ${emailData?.id}`);
    return { success: true };
  } catch (error: any) {
    console.error("[PaymentFailure] Error:", error);
    return { success: false, error: error.message };
  }
}

// Invoice Reminder Email
export interface InvoiceReminderEmailData {
  to: string;
  customerName: string;
  invoiceNumber: string;
  dueDate: string;
  totalAmount: string;
  balanceDue: string;
  paymentLink: string;
  reminderType: 'pre_due' | 'on_due' | 'overdue';
  daysUntilDue?: number; // Positive = before due, negative = past due
}

function getReminderSubjectLine(data: InvoiceReminderEmailData): string {
  if (data.reminderType === 'pre_due') {
    return `Payment Reminder: Invoice #${data.invoiceNumber} due in ${data.daysUntilDue} days`;
  } else if (data.reminderType === 'on_due') {
    return `Payment Due Today: Invoice #${data.invoiceNumber}`;
  } else {
    const daysOverdue = Math.abs(data.daysUntilDue || 0);
    return `Overdue Notice: Invoice #${data.invoiceNumber} is ${daysOverdue} days past due`;
  }
}

function getReminderMessage(data: InvoiceReminderEmailData): { heading: string; message: string; urgency: string } {
  if (data.reminderType === 'pre_due') {
    return {
      heading: 'Payment Reminder',
      message: `This is a friendly reminder that Invoice #${data.invoiceNumber} is due in ${data.daysUntilDue} days on ${data.dueDate}.`,
      urgency: 'low'
    };
  } else if (data.reminderType === 'on_due') {
    return {
      heading: 'Payment Due Today',
      message: `Invoice #${data.invoiceNumber} is due today, ${data.dueDate}. Please submit your payment at your earliest convenience.`,
      urgency: 'medium'
    };
  } else {
    const daysOverdue = Math.abs(data.daysUntilDue || 0);
    return {
      heading: 'Overdue Notice',
      message: `Invoice #${data.invoiceNumber} was due on ${data.dueDate} and is now ${daysOverdue} days past due. Please submit payment immediately to avoid late fees.`,
      urgency: 'high'
    };
  }
}

function getInvoiceReminderEmailHtml(data: InvoiceReminderEmailData): string {
  const reminderInfo = getReminderMessage(data);
  const headerColor = data.reminderType === 'overdue' ? '#dc2626' : '#FF6B35';
  
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${reminderInfo.heading} - Invoice #${data.invoiceNumber}</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="background-color: ${headerColor}; padding: 30px 40px; border-radius: 12px 12px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">${reminderInfo.heading}</h1>
              <p style="margin: 8px 0 0 0; color: #ffffff; opacity: 0.9; font-size: 14px;">Invoice #${data.invoiceNumber}</p>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px 0; color: #18181b; font-size: 16px;">
                Dear ${data.customerName},
              </p>
              <p style="margin: 0 0 24px 0; color: #52525b; font-size: 15px; line-height: 1.6;">
                ${reminderInfo.message}
              </p>
              
              <!-- Amount Box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #fafafa; border-radius: 8px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 20px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="color: #52525b; font-size: 14px;">Balance Due:</td>
                        <td style="text-align: right; color: #18181b; font-size: 24px; font-weight: 700;">${formatCurrency(data.balanceDue)}</td>
                      </tr>
                      <tr>
                        <td style="color: #a1a1aa; font-size: 13px; padding-top: 8px;">Due Date:</td>
                        <td style="text-align: right; color: #52525b; font-size: 14px; padding-top: 8px;">${data.dueDate}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              
              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="text-align: center;">
                    <a href="${data.paymentLink}" style="display: inline-block; background-color: ${headerColor}; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">
                      Pay Now
                    </a>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 24px 0 0 0; color: #a1a1aa; font-size: 13px; text-align: center;">
                If you have already made this payment, please disregard this reminder.
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #fafafa; padding: 20px 40px; border-radius: 0 0 12px 12px; text-align: center;">
              <p style="margin: 0; color: #a1a1aa; font-size: 12px;">
                &copy; ${new Date().getFullYear()} ${APP_NAME}. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

export async function sendInvoiceReminderEmail(data: InvoiceReminderEmailData): Promise<{ success: boolean; error?: string }> {
  if (!resend) {
    console.log("RESEND_API_KEY not configured - reminder would be sent to:", data.to);
    return { success: true, error: "Email service not configured" };
  }

  try {
    const fromEmail = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
    const subject = getReminderSubjectLine(data);

    const { data: emailData, error } = await resend.emails.send({
      from: `${APP_NAME} Billing <${fromEmail}>`,
      to: data.to,
      subject,
      html: getInvoiceReminderEmailHtml(data),
    });

    if (error) {
      console.error("Failed to send invoice reminder:", error);
      return { success: false, error: error.message };
    }

    console.log(`Invoice reminder sent to ${data.to}, email ID: ${emailData?.id}`);
    return { success: true };
  } catch (error: any) {
    console.error("Error sending invoice reminder:", error);
    return { success: false, error: error.message };
  }
}

export interface CarrierSubmissionEmailData {
  claimId: string;
  claimType: "auto" | "general_liability";
  dateOfLoss: string;
  accountName: string;
  submittedByName: string;
  submissionNotes?: string;
  recipients: string[];
  cc?: string[];
  attachments: Array<{ filename: string; content: Buffer; contentType: string }>;
}

export async function sendCarrierSubmissionEmail(
  data: CarrierSubmissionEmailData
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!resend) {
    return { success: false, error: "Email service not configured. Set RESEND_API_KEY to enable carrier submissions." };
  }
  if (!data.recipients || data.recipients.length === 0) {
    return { success: false, error: "No recipients specified for carrier submission email." };
  }

  const claimTypeLabel = data.claimType === "general_liability" ? "GENERAL LIABILITY" : "AUTO";
  const shortId = data.claimId.substring(0, 8).toUpperCase();
  const subject = `[DriverHub] NEW CLAIM SUBMISSION – ${claimTypeLabel} – ${data.dateOfLoss} – ${data.accountName} – ClaimID ${shortId}`;

  const doNotContactBanner = data.claimType === "general_liability"
    ? `<div style="background:#fee2e2;border:1px solid #f87171;border-radius:6px;padding:12px 16px;margin-bottom:20px;color:#991b1b;font-weight:600;">
        ⚠ DO NOT CONTACT CLAIMANT — All communications must be handled by the carrier or adjuster.
       </div>`
    : "";

  const notesSection = data.submissionNotes
    ? `<p style="color:#52525b;font-size:15px;margin:16px 0;"><strong>Submission Notes:</strong><br>${data.submissionNotes}</p>`
    : "";

  const fromEmail = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";

  const htmlBody = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Carrier Claim Submission</title></head>
<body style="margin:0;padding:0;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;background-color:#f4f4f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;box-shadow:0 4px 6px rgba(0,0,0,0.1);">
        <tr>
          <td style="background-color:#FF6B35;padding:30px 40px;border-radius:12px 12px 0 0;">
            <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:600;">DriverHub 360</h1>
            <p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">Carrier Claim Submission</p>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 40px;">
            ${doNotContactBanner}
            <h2 style="margin:0 0 20px;color:#18181b;font-size:20px;">New Claim Submission</h2>
            <table width="100%" cellpadding="6" cellspacing="0" style="border-collapse:collapse;margin-bottom:20px;">
              <tr style="background:#f9fafb;"><td style="padding:8px 12px;color:#6b7280;font-size:13px;width:40%;border:1px solid #e5e7eb;"><strong>Claim Type</strong></td><td style="padding:8px 12px;color:#18181b;font-size:14px;border:1px solid #e5e7eb;">${claimTypeLabel}</td></tr>
              <tr><td style="padding:8px 12px;color:#6b7280;font-size:13px;border:1px solid #e5e7eb;"><strong>Claim ID</strong></td><td style="padding:8px 12px;color:#18181b;font-size:14px;border:1px solid #e5e7eb;">${shortId}</td></tr>
              <tr style="background:#f9fafb;"><td style="padding:8px 12px;color:#6b7280;font-size:13px;border:1px solid #e5e7eb;"><strong>Date of Loss</strong></td><td style="padding:8px 12px;color:#18181b;font-size:14px;border:1px solid #e5e7eb;">${data.dateOfLoss}</td></tr>
              <tr><td style="padding:8px 12px;color:#6b7280;font-size:13px;border:1px solid #e5e7eb;"><strong>Account</strong></td><td style="padding:8px 12px;color:#18181b;font-size:14px;border:1px solid #e5e7eb;">${data.accountName}</td></tr>
              <tr style="background:#f9fafb;"><td style="padding:8px 12px;color:#6b7280;font-size:13px;border:1px solid #e5e7eb;"><strong>Submitted By</strong></td><td style="padding:8px 12px;color:#18181b;font-size:14px;border:1px solid #e5e7eb;">${data.submittedByName}</td></tr>
              <tr><td style="padding:8px 12px;color:#6b7280;font-size:13px;border:1px solid #e5e7eb;"><strong>Attachments</strong></td><td style="padding:8px 12px;color:#18181b;font-size:14px;border:1px solid #e5e7eb;">${data.attachments.map(a => a.filename).join(', ') || 'None'}</td></tr>
            </table>
            ${notesSection}
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
            <p style="color:#9ca3af;font-size:12px;margin:0;">Carrier Contact: C. Ruman &amp; Forsternol | crumandforsternol@cfins.com | 800-690-5520</p>
            <p style="color:#9ca3af;font-size:12px;margin:4px 0 0;">This submission was generated by DriverHub 360. Do not reply to this email.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  try {
    const { data: emailData, error } = await resend.emails.send({
      from: `DriverHub Claims <${fromEmail}>`,
      to: data.recipients,
      cc: data.cc && data.cc.length > 0 ? data.cc : undefined,
      subject,
      html: htmlBody,
      text: `DriverHub 360 – New Claim Submission\n\nClaim Type: ${claimTypeLabel}\nClaim ID: ${shortId}\nDate of Loss: ${data.dateOfLoss}\nAccount: ${data.accountName}\nSubmitted By: ${data.submittedByName}\n${data.submissionNotes ? `\nNotes: ${data.submissionNotes}` : ''}\n\nCarrier Contact: crumandforsternol@cfins.com | 800-690-5520`,
      attachments: data.attachments.map(a => ({
        filename: a.filename,
        content: a.content.toString("base64"),
        content_type: a.contentType,
      })),
    });

    if (error) {
      console.error("[CarrierSubmission] Email send error:", error);
      return { success: false, error: error.message };
    }

    console.log(`[CarrierSubmission] Submission email sent, ID: ${emailData?.id}`);
    return { success: true, messageId: emailData?.id };
  } catch (err: any) {
    console.error("[CarrierSubmission] Unexpected error:", err);
    return { success: false, error: err.message };
  }
}

export async function sendTesterAssignedEmail(
  email: string, name: string, ticketNumber: string, title: string, status: string
): Promise<void> {
  if (!resend) { console.log(`[Email] sendTesterAssignedEmail skipped (no RESEND_API_KEY): ${email}`); return; }
  const fromEmail = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
  try {
    await resend.emails.send({
      from: fromEmail,
      to: email,
      subject: `You've been assigned to test AMR ${ticketNumber}`,
      html: `<p>Hi ${name},</p>
<p>You have been assigned as an <strong>Assigned Tester</strong> for the following App Modification Request:</p>
<table style="border-collapse:collapse;margin:16px 0">
  <tr><td style="padding:4px 12px 4px 0;color:#6b7280;font-size:14px">AMR Number</td><td style="padding:4px 0;font-size:14px;font-weight:600">${ticketNumber}</td></tr>
  <tr><td style="padding:4px 12px 4px 0;color:#6b7280;font-size:14px">Title</td><td style="padding:4px 0;font-size:14px">${title}</td></tr>
  <tr><td style="padding:4px 12px 4px 0;color:#6b7280;font-size:14px">Current Status</td><td style="padding:4px 0;font-size:14px">${status}</td></tr>
</table>
<p>You will receive another notification when this AMR reaches <strong>Needs Testing / User Sign-off</strong> and your action is required.</p>
<p>Log in to DriverHub to view the AMR and monitor its progress.</p>`,
    });
  } catch (e) { console.error("[Email] sendTesterAssignedEmail error:", e); }
}

export async function sendCcUpdateEmail(
  email: string, name: string, ticketNumber: string, title: string, changes: string[], actorName: string
): Promise<void> {
  if (!resend) { console.log(`[Email] sendCcUpdateEmail skipped (no RESEND_API_KEY): ${email}`); return; }
  const fromEmail = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
  const changeListHtml = changes.map(c => `<li style="padding:2px 0;font-size:14px">${c}</li>`).join('');
  const changeListText = changes.map(c => `• ${c}`).join('\n');
  try {
    await resend.emails.send({
      from: fromEmail,
      to: email,
      subject: `${ticketNumber} Updated — ${changes.length === 1 ? changes[0] : `${changes.length} changes`}`,
      html: `<p>Hi ${name},</p>
<p>An App Modification Request you are copied on has been updated by <strong>${actorName}</strong>.</p>
<table style="border-collapse:collapse;margin:16px 0">
  <tr><td style="padding:4px 12px 4px 0;color:#6b7280;font-size:14px">AMR Number</td><td style="padding:4px 0;font-size:14px;font-weight:600">${ticketNumber}</td></tr>
  <tr><td style="padding:4px 12px 4px 0;color:#6b7280;font-size:14px">Title</td><td style="padding:4px 0;font-size:14px">${title}</td></tr>
  <tr><td style="padding:4px 12px 4px 0;color:#6b7280;font-size:14px;vertical-align:top">Changes</td><td style="padding:4px 0"><ul style="margin:0;padding-left:20px">${changeListHtml}</ul></td></tr>
</table>
<p>Log in to DriverHub to view the full details.</p>`,
      text: `Hi ${name},\n\nAMR ${ticketNumber} has been updated by ${actorName}.\n\nTitle: ${title}\n\nChanges:\n${changeListText}\n\nLog in to DriverHub to view the full details.`,
    });
  } catch (e) { console.error("[Email] sendCcUpdateEmail error:", e); }
}

export async function sendNeedsTestingEmail(
  email: string, name: string, ticketNumber: string, title: string, _status: string
): Promise<void> {
  if (!resend) { console.log(`[Email] sendNeedsTestingEmail skipped (no RESEND_API_KEY): ${email}`); return; }
  const fromEmail = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
  try {
    await resend.emails.send({
      from: fromEmail,
      to: email,
      subject: `Action Required — AMR ${ticketNumber} is ready for your testing`,
      html: `<p>Hi ${name},</p>
<p>AMR <strong>${ticketNumber}</strong> has entered <strong>Needs Testing / User Sign-off</strong> and your testing and acknowledgment are required.</p>
<table style="border-collapse:collapse;margin:16px 0">
  <tr><td style="padding:4px 12px 4px 0;color:#6b7280;font-size:14px">AMR Number</td><td style="padding:4px 0;font-size:14px;font-weight:600">${ticketNumber}</td></tr>
  <tr><td style="padding:4px 12px 4px 0;color:#6b7280;font-size:14px">Title</td><td style="padding:4px 0;font-size:14px">${title}</td></tr>
  <tr><td style="padding:4px 12px 4px 0;color:#6b7280;font-size:14px">Status</td><td style="padding:4px 0;font-size:14px;color:#d97706;font-weight:600">Needs Testing / User Sign-off</td></tr>
</table>
<p><strong>Please log in to DriverHub, review the changes, and provide your sign-off.</strong></p>`,
    });
  } catch (e) { console.error("[Email] sendNeedsTestingEmail error:", e); }
}
