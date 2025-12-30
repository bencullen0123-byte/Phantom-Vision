// Pulse Mailer - Resend integration for recovery and protection emails
// Uses Replit Resend connector for authentication

import { Resend } from 'resend';
import type { Merchant, GhostTarget } from '@shared/schema';

let connectionSettings: any;

const CURRENCY_SYMBOLS: Record<string, string> = {
  gbp: "\u00a3",
  usd: "$",
  eur: "\u20ac",
  cad: "C$",
  aud: "A$",
  jpy: "\u00a5",
};

function formatCurrency(cents: number, currency: string = "gbp"): string {
  const symbol = CURRENCY_SYMBOLS[currency.toLowerCase()] || "\u00a3";
  const amount = (cents / 100).toFixed(2);
  return `${symbol}${amount}`;
}

async function getCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=resend',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  if (!connectionSettings || (!connectionSettings.settings.api_key)) {
    throw new Error('Resend not connected');
  }
  return {
    apiKey: connectionSettings.settings.api_key, 
    fromEmail: connectionSettings.settings.from_email
  };
}

async function getUncachableResendClient() {
  const { apiKey, fromEmail } = await getCredentials();
  return {
    client: new Resend(apiKey),
    fromEmail
  };
}

function getGreeting(customerName: string): string {
  if (customerName && customerName !== "Unknown Customer" && customerName !== "ENCRYPTION_ERROR") {
    return customerName.split(' ')[0];
  }
  return "there";
}

function getRecoveryEmailHtml(
  customerName: string, 
  businessName: string, 
  amount: number, 
  invoiceUrl: string,
  currency: string
): string {
  const greeting = getGreeting(customerName);
  const formattedAmount = formatCurrency(amount, currency);
  
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payment Update Required</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5; line-height: 1.6;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f4f4f5;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 560px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <tr>
            <td style="padding: 40px 40px 30px;">
              <h1 style="margin: 0 0 20px; font-size: 24px; font-weight: 600; color: #18181b;">
                Hi ${greeting},
              </h1>
              <p style="margin: 0 0 20px; font-size: 16px; color: #3f3f46;">
                It looks like the latest payment of <strong style="color: #18181b;">${formattedAmount}</strong> for <strong style="color: #18181b;">${businessName}</strong> didn't go through.
              </p>
              <p style="margin: 0 0 30px; font-size: 16px; color: #3f3f46;">
                To keep your access active, please update your payment method using the button below.
              </p>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="border-radius: 6px; background-color: #2563eb;">
                    <a href="${invoiceUrl}" target="_blank" style="display: inline-block; padding: 14px 28px; font-size: 16px; font-weight: 600; color: #ffffff; text-decoration: none; border-radius: 6px;">
                      Update Payment Method
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 40px 30px; border-top: 1px solid #e4e4e7;">
              <p style="margin: 0; font-size: 14px; color: #71717a;">
                If you've already resolved this, please disregard this message.
              </p>
            </td>
          </tr>
        </table>
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 560px; margin: 20px auto 0;">
          <tr>
            <td style="text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #a1a1aa;">
                This email was sent by ${businessName}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function getRecoveryEmailText(
  customerName: string, 
  businessName: string, 
  amount: number, 
  invoiceUrl: string,
  currency: string
): string {
  const greeting = getGreeting(customerName);
  const formattedAmount = formatCurrency(amount, currency);
  
  return `Hi ${greeting},

It looks like the latest payment of ${formattedAmount} for ${businessName} didn't go through.

To keep your access active, please update your payment method here:
${invoiceUrl}

If you've already resolved this, please disregard this message.

Thanks,
${businessName}`;
}

function getProtectionEmailHtml(
  customerName: string, 
  businessName: string, 
  amount: number, 
  portalUrl: string,
  currency: string,
  expMonth: number,
  expYear: number
): string {
  const greeting = getGreeting(customerName);
  const formattedAmount = formatCurrency(amount, currency);
  const expDate = `${expMonth.toString().padStart(2, '0')}/${expYear}`;
  
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Card Expires Soon</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5; line-height: 1.6;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f4f4f5;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 560px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <tr>
            <td style="padding: 40px 40px 30px;">
              <h1 style="margin: 0 0 20px; font-size: 24px; font-weight: 600; color: #18181b;">
                Hi ${greeting},
              </h1>
              <p style="margin: 0 0 20px; font-size: 16px; color: #3f3f46;">
                We noticed the card on file for your <strong style="color: #18181b;">${businessName}</strong> subscription expires on <strong style="color: #f59e0b;">${expDate}</strong>.
              </p>
              <p style="margin: 0 0 10px; font-size: 16px; color: #3f3f46;">
                Your current subscription:
              </p>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 0 0 25px; padding: 15px 20px; background-color: #fafafa; border-radius: 6px; width: 100%;">
                <tr>
                  <td style="font-size: 14px; color: #71717a;">Monthly amount</td>
                  <td style="text-align: right; font-size: 16px; font-weight: 600; color: #18181b;">${formattedAmount}</td>
                </tr>
              </table>
              <p style="margin: 0 0 30px; font-size: 16px; color: #3f3f46;">
                To avoid any interruption to your service, please update your payment method before it expires.
              </p>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="border-radius: 6px; background-color: #16a34a;">
                    <a href="${portalUrl}" target="_blank" style="display: inline-block; padding: 14px 28px; font-size: 16px; font-weight: 600; color: #ffffff; text-decoration: none; border-radius: 6px;">
                      Update Card Now
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 40px 30px; border-top: 1px solid #e4e4e7;">
              <p style="margin: 0; font-size: 14px; color: #71717a;">
                If you've already updated your card, please disregard this message.
              </p>
            </td>
          </tr>
        </table>
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 560px; margin: 20px auto 0;">
          <tr>
            <td style="text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #a1a1aa;">
                This email was sent by ${businessName}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function getProtectionEmailText(
  customerName: string, 
  businessName: string, 
  amount: number, 
  portalUrl: string,
  currency: string,
  expMonth: number,
  expYear: number
): string {
  const greeting = getGreeting(customerName);
  const formattedAmount = formatCurrency(amount, currency);
  const expDate = `${expMonth.toString().padStart(2, '0')}/${expYear}`;
  
  return `Hi ${greeting},

We noticed the card on file for your ${businessName} subscription expires on ${expDate}.

Your current subscription: ${formattedAmount}/month

To avoid any interruption to your service, please update your payment method before it expires:
${portalUrl}

If you've already updated your card, please disregard this message.

Thanks,
${businessName}`;
}

function parseExpireInfo(failureReason: string | null): { expMonth: number; expYear: number } | null {
  if (!failureReason) return null;
  const match = failureReason.match(/card_expiring_(\d+)_(\d+)/);
  if (!match) return null;
  return {
    expMonth: parseInt(match[1], 10),
    expYear: parseInt(match[2], 10)
  };
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
  dryRun?: boolean;
}

export async function sendPulseEmail(
  target: GhostTarget,
  merchant: Merchant,
  trackingUrl: string
): Promise<SendEmailResult> {
  const businessName = merchant.businessName || 'Your Service Provider';
  const currency = merchant.defaultCurrency || 'gbp';
  const isProtection = target.status === 'impending';
  const emailType = isProtection ? 'Protection' : 'Recovery';
  
  console.log(`[PULSE MAILER] Preparing ${emailType} email for merchant ${merchant.id}`);
  
  let subject: string;
  let htmlContent: string;
  let textContent: string;
  
  if (isProtection) {
    const expireInfo = parseExpireInfo(target.failureReason);
    const expMonth = expireInfo?.expMonth || 1;
    const expYear = expireInfo?.expYear || 2026;
    
    subject = `Keep your access: Your card for ${businessName} expires soon`;
    htmlContent = getProtectionEmailHtml(
      target.customerName,
      businessName,
      target.amount,
      trackingUrl,
      currency,
      expMonth,
      expYear
    );
    textContent = getProtectionEmailText(
      target.customerName,
      businessName,
      target.amount,
      trackingUrl,
      currency,
      expMonth,
      expYear
    );
  } else {
    subject = `Action Required: Payment failed for ${businessName}`;
    htmlContent = getRecoveryEmailHtml(
      target.customerName,
      businessName,
      target.amount,
      trackingUrl,
      currency
    );
    textContent = getRecoveryEmailText(
      target.customerName,
      businessName,
      target.amount,
      trackingUrl,
      currency
    );
  }
  
  // DRY RUN MODE: Log email content if Resend is not connected
  try {
    await getCredentials();
  } catch (error: any) {
    console.log(`[PULSE MAILER] DRY RUN - Resend not connected`);
    console.log(`[PULSE MAILER] ═══════════════════════════════════════════════════`);
    console.log(`[PULSE MAILER] ${emailType} Email - DRY RUN`);
    console.log(`[PULSE MAILER] To: ${target.email}`);
    console.log(`[PULSE MAILER] From: ${businessName}`);
    console.log(`[PULSE MAILER] Reply-To: ${merchant.supportEmail || 'not set'}`);
    console.log(`[PULSE MAILER] Subject: ${subject}`);
    console.log(`[PULSE MAILER] ───────────────────────────────────────────────────`);
    console.log(`[PULSE MAILER] HTML Content:`);
    console.log(htmlContent);
    console.log(`[PULSE MAILER] ═══════════════════════════════════════════════════`);
    
    return {
      success: true,
      dryRun: true,
      messageId: `dry-run-${Date.now()}`
    };
  }

  try {
    const { client, fromEmail } = await getUncachableResendClient();
    const replyTo = merchant.supportEmail || undefined;

    const result = await client.emails.send({
      from: `${businessName} <${fromEmail}>`,
      to: [target.email],
      replyTo: replyTo,
      subject: subject,
      html: htmlContent,
      text: textContent,
    });

    if (result.error) {
      console.error(`[PULSE MAILER] Resend error:`, result.error);
      return {
        success: false,
        error: result.error.message
      };
    }

    console.log(`[PULSE MAILER] ${emailType} email sent successfully: ${result.data?.id}`);
    return {
      success: true,
      messageId: result.data?.id
    };

  } catch (error: any) {
    console.error(`[PULSE MAILER] Failed to send email:`, error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Legacy function for backward compatibility
export async function sendRecoveryEmail(
  to: string,
  customerName: string,
  amount: number,
  invoiceUrl: string,
  merchant: Merchant
): Promise<SendEmailResult> {
  console.log(`[PULSE MAILER] Sending recovery email for merchant ${merchant.id}`);

  const businessName = merchant.businessName || 'Your Service Provider';
  const currency = merchant.defaultCurrency || 'gbp';
  
  const htmlContent = getRecoveryEmailHtml(customerName, businessName, amount, invoiceUrl, currency);
  const textContent = getRecoveryEmailText(customerName, businessName, amount, invoiceUrl, currency);
  const subject = `Action Required: Payment failed for ${businessName}`;
  
  // DRY RUN MODE
  try {
    await getCredentials();
  } catch (error: any) {
    console.log(`[PULSE MAILER] DRY RUN - Resend not connected`);
    console.log(`[PULSE MAILER] ═══════════════════════════════════════════════════`);
    console.log(`[PULSE MAILER] Recovery Email - DRY RUN`);
    console.log(`[PULSE MAILER] To: ${to}`);
    console.log(`[PULSE MAILER] Subject: ${subject}`);
    console.log(`[PULSE MAILER] ───────────────────────────────────────────────────`);
    console.log(htmlContent);
    console.log(`[PULSE MAILER] ═══════════════════════════════════════════════════`);
    
    return {
      success: true,
      dryRun: true,
      messageId: `dry-run-${Date.now()}`
    };
  }

  try {
    const { client, fromEmail } = await getUncachableResendClient();
    const replyTo = merchant.supportEmail || undefined;

    const result = await client.emails.send({
      from: `${businessName} <${fromEmail}>`,
      to: [to],
      replyTo: replyTo,
      subject: subject,
      html: htmlContent,
      text: textContent,
    });

    if (result.error) {
      console.error(`[PULSE MAILER] Resend error:`, result.error);
      return {
        success: false,
        error: result.error.message
      };
    }

    console.log(`[PULSE MAILER] Email sent successfully: ${result.data?.id}`);
    return {
      success: true,
      messageId: result.data?.id
    };

  } catch (error: any) {
    console.error(`[PULSE MAILER] Failed to send email:`, error);
    return {
      success: false,
      error: error.message
    };
  }
}
