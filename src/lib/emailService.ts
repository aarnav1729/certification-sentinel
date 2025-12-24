/**
 * Microsoft Graph API Email Service
 * 
 * This is sample code for sending emails via Microsoft Graph API.
 * To use this in production, you'll need:
 * 1. Azure AD App Registration with Mail.Send permission
 * 2. Client ID, Client Secret, and Tenant ID
 * 3. A backend service (Edge Function) to securely store credentials
 */

import { Certification, EmailRecipient, EmailLog, addEmailLog } from './db';
import { getExpiryStatus, ExpiryStatus, formatDate, getDaysUntilExpiry } from './expiryUtils';

interface GraphEmailPayload {
  message: {
    subject: string;
    body: {
      contentType: 'HTML';
      content: string;
    };
    toRecipients: Array<{
      emailAddress: {
        address: string;
        name?: string;
      };
    }>;
  };
  saveToSentItems: boolean;
}

/**
 * Sample Microsoft Graph API email sending function
 * In production, this should be implemented as an Edge Function with secure credential storage
 */
export const sendEmailViaGraph = async (
  accessToken: string,
  to: { email: string; name?: string }[],
  subject: string,
  htmlContent: string
): Promise<boolean> => {
  const payload: GraphEmailPayload = {
    message: {
      subject,
      body: {
        contentType: 'HTML',
        content: htmlContent,
      },
      toRecipients: to.map((recipient) => ({
        emailAddress: {
          address: recipient.email,
          name: recipient.name,
        },
      })),
    },
    saveToSentItems: true,
  };

  try {
    const response = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.error('Failed to send email:', await response.text());
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error sending email:', error);
    return false;
  }
};

/**
 * Generate beautiful HTML email template for certification expiry
 */
export const generateExpiryEmailHTML = (
  certification: Certification,
  milestone: string,
  isOverdue: boolean = false
): string => {
  const daysUntil = getDaysUntilExpiry(certification.validityUpto);
  const daysText = isOverdue
    ? `${Math.abs(daysUntil || 0)} days overdue`
    : `${daysUntil} days remaining`;

  const headerColor = isOverdue ? '#dc2626' : '#f59e0b';
  const headerText = isOverdue ? 'OVERDUE ALERT' : 'EXPIRY REMINDER';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Certification ${isOverdue ? 'Overdue' : 'Expiry'} Alert</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8f9fa;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="width: 100%; max-width: 600px; border-collapse: collapse; background-color: #ffffff; border-radius: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">
          
          <!-- Header -->
          <tr>
            <td style="padding: 32px; background: linear-gradient(135deg, ${headerColor}, ${isOverdue ? '#991b1b' : '#d97706'}); border-radius: 16px 16px 0 0;">
              <table role="presentation" style="width: 100%;">
                <tr>
                  <td>
                    <h1 style="margin: 0; color: #ffffff; font-size: 14px; text-transform: uppercase; letter-spacing: 2px; font-weight: 600;">
                      ⚡ ${headerText}
                    </h1>
                    <h2 style="margin: 12px 0 0 0; color: #ffffff; font-size: 28px; font-weight: 700;">
                      ${certification.plant} - ${certification.type}
                    </h2>
                    <p style="margin: 8px 0 0 0; color: rgba(255,255,255,0.9); font-size: 16px;">
                      ${milestone} • ${daysText}
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 32px;">
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                
                <!-- Alert Box -->
                <tr>
                  <td style="padding: 20px; background-color: ${isOverdue ? '#fef2f2' : '#fffbeb'}; border-radius: 12px; border-left: 4px solid ${headerColor};">
                    <p style="margin: 0; color: ${isOverdue ? '#991b1b' : '#92400e'}; font-size: 15px; line-height: 1.6;">
                      ${isOverdue 
                        ? `<strong>Immediate Action Required:</strong> This certification has expired. Please renew immediately to ensure compliance.`
                        : `<strong>Action Required:</strong> Please initiate the renewal process to avoid any compliance issues.`
                      }
                    </p>
                  </td>
                </tr>

                <!-- Details -->
                <tr>
                  <td style="padding-top: 32px;">
                    <h3 style="margin: 0 0 16px 0; color: #374151; font-size: 16px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">
                      Certification Details
                    </h3>
                  </td>
                </tr>

                <tr>
                  <td>
                    <table role="presentation" style="width: 100%; border-collapse: collapse;">
                      <tr>
                        <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb;">
                          <span style="color: #6b7280; font-size: 14px;">Registration No.</span><br>
                          <span style="color: #111827; font-size: 16px; font-weight: 500;">${certification.rNo}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb;">
                          <span style="color: #6b7280; font-size: 14px;">Type</span><br>
                          <span style="color: #111827; font-size: 16px; font-weight: 500;">${certification.type}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb;">
                          <span style="color: #6b7280; font-size: 14px;">Validity Period</span><br>
                          <span style="color: #111827; font-size: 16px; font-weight: 500;">${formatDate(certification.validityFrom)} - ${formatDate(certification.validityUpto)}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb;">
                          <span style="color: #6b7280; font-size: 14px;">Status</span><br>
                          <span style="color: ${isOverdue ? '#dc2626' : '#059669'}; font-size: 16px; font-weight: 600;">${isOverdue ? 'EXPIRED' : certification.status}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 12px 0;">
                          <span style="color: #6b7280; font-size: 14px;">Address</span><br>
                          <span style="color: #111827; font-size: 14px;">${certification.address}</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Standards -->
                ${certification.standard ? `
                <tr>
                  <td style="padding-top: 24px;">
                    <h4 style="margin: 0 0 8px 0; color: #6b7280; font-size: 13px; text-transform: uppercase; letter-spacing: 1px;">Applicable Standards</h4>
                    <p style="margin: 0; color: #374151; font-size: 13px; line-height: 1.6; background-color: #f3f4f6; padding: 12px; border-radius: 8px;">
                      ${certification.standard.replace(/\n/g, '<br>')}
                    </p>
                  </td>
                </tr>
                ` : ''}

              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px; background-color: #f9fafb; border-radius: 0 0 16px 16px; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #6b7280; font-size: 13px; line-height: 1.6;">
                This is an automated notification from <strong>CertTracker</strong>. 
                ${isOverdue 
                  ? 'You will receive daily reminders until this certification is renewed or removed.'
                  : 'You will receive additional reminders as the expiry date approaches.'
                }
              </p>
              <p style="margin: 12px 0 0 0; color: #9ca3af; font-size: 12px;">
                To stop receiving these notifications, please update the certification or modify your email settings.
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
};

/**
 * Get the milestone label based on expiry status
 */
export const getMilestoneLabel = (status: ExpiryStatus): string => {
  const labels: Record<ExpiryStatus, string> = {
    'overdue': 'Overdue',
    'day-before': '1 Day Before Expiry',
    'week': '1 Week Before Expiry',
    '2-weeks': '2 Weeks Before Expiry',
    'month': '1 Month Before Expiry',
    '3-months': '3 Months Before Expiry',
    '6-months': '6 Months Before Expiry',
    'safe': 'Valid',
  };
  return labels[status];
};

/**
 * Process certifications and send notifications
 * This should be called periodically (e.g., daily via cron job)
 */
export const processCertificationNotifications = async (
  certifications: Certification[],
  recipients: EmailRecipient[],
  accessToken: string
): Promise<void> => {
  const activeRecipients = recipients.filter((r) => r.isActive);
  
  if (activeRecipients.length === 0) {
    console.log('No active recipients configured');
    return;
  }

  for (const cert of certifications) {
    const status = getExpiryStatus(cert.validityUpto);
    
    // Only send notifications for relevant statuses
    if (status === 'safe') continue;

    const isOverdue = status === 'overdue';
    const milestone = getMilestoneLabel(status);
    const subject = isOverdue
      ? `🚨 OVERDUE: ${cert.plant} ${cert.type} Certification Has Expired`
      : `⚠️ REMINDER: ${cert.plant} ${cert.type} Certification - ${milestone}`;

    const htmlContent = generateExpiryEmailHTML(cert, milestone, isOverdue);

    // Send to all active recipients
    const success = await sendEmailViaGraph(
      accessToken,
      activeRecipients.map((r) => ({ email: r.email, name: r.name })),
      subject,
      htmlContent
    );

    // Log the email
    for (const recipient of activeRecipients) {
      await addEmailLog({
        certificationId: cert.id,
        recipientEmail: recipient.email,
        emailType: isOverdue ? 'overdue' : 'reminder',
        milestone,
        sentAt: new Date().toISOString(),
        status: success ? 'sent' : 'failed',
      });
    }
  }
};

/**
 * Sample Edge Function implementation (Supabase/Deno)
 * 
 * Deploy this as an edge function and call it daily via a cron job:
 * 
 * ```typescript
 * // supabase/functions/send-certification-emails/index.ts
 * 
 * import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
 * 
 * const GRAPH_CLIENT_ID = Deno.env.get('GRAPH_CLIENT_ID');
 * const GRAPH_CLIENT_SECRET = Deno.env.get('GRAPH_CLIENT_SECRET');
 * const GRAPH_TENANT_ID = Deno.env.get('GRAPH_TENANT_ID');
 * 
 * async function getGraphAccessToken(): Promise<string> {
 *   const tokenUrl = `https://login.microsoftonline.com/${GRAPH_TENANT_ID}/oauth2/v2.0/token`;
 *   
 *   const response = await fetch(tokenUrl, {
 *     method: 'POST',
 *     headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
 *     body: new URLSearchParams({
 *       client_id: GRAPH_CLIENT_ID!,
 *       client_secret: GRAPH_CLIENT_SECRET!,
 *       scope: 'https://graph.microsoft.com/.default',
 *       grant_type: 'client_credentials',
 *     }),
 *   });
 *   
 *   const data = await response.json();
 *   return data.access_token;
 * }
 * 
 * serve(async (req) => {
 *   // Get access token
 *   const accessToken = await getGraphAccessToken();
 *   
 *   // Fetch certifications and recipients from your database
 *   // Process and send emails
 *   
 *   return new Response(JSON.stringify({ success: true }), {
 *     headers: { 'Content-Type': 'application/json' },
 *   });
 * });
 * ```
 */
