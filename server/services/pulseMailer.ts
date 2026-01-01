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

// Strategy-specific subject lines and messaging (Sprint 3.1)
interface StrategyContent {
  subject: string;
  headline: string;
  body: string;
  ctaText: string;
  ctaColor: string;
}

function getStrategyContent(
  strategy: string | null,
  businessName: string,
  formattedAmount: string
): StrategyContent {
  switch (strategy) {
    case 'technical_bridge':
      // 3DS authentication issues - friendly technical explanation
      return {
        subject: `Action needed: Complete authentication for ${businessName}`,
        headline: `Quick security check needed`,
        body: `Your recent payment of <strong style="color: #18181b;">${formattedAmount}</strong> for <strong style="color: #18181b;">${businessName}</strong> requires additional authentication to complete. This is a standard security step used by your bank to protect your account.`,
        ctaText: `Complete Authentication`,
        ctaColor: '#7c3aed' // Purple for technical
      };
    
    case 'card_refresh':
      // Card issues (expired, declined) - direct card update request
      return {
        subject: `Update your card for ${businessName}`,
        headline: `Your payment method needs updating`,
        body: `The card on file for your <strong style="color: #18181b;">${businessName}</strong> subscription couldn't be charged (<strong style="color: #18181b;">${formattedAmount}</strong>). This often happens with expired or replaced cards. Please update your payment method to keep your access active.`,
        ctaText: `Update Card Now`,
        ctaColor: '#ea580c' // Orange for card issues
      };
    
    case 'high_value_manual':
      // High-value invoices - VIP treatment
      return {
        subject: `Important: Payment issue for your ${businessName} account`,
        headline: `We noticed an issue with your payment`,
        body: `A payment of <strong style="color: #18181b;">${formattedAmount}</strong> for your <strong style="color: #18181b;">${businessName}</strong> account didn't go through. As a valued customer, we wanted to reach out personally. Please use the link below to resolve this at your convenience.`,
        ctaText: `View Invoice`,
        ctaColor: '#d97706' // Amber for VIP
      };
    
    case 'smart_retry':
    default:
      // Soft declines - gentle nudge, likely temporary issue
      return {
        subject: `Action Required: Payment failed for ${businessName}`,
        headline: `Hi there,`,
        body: `It looks like the latest payment of <strong style="color: #18181b;">${formattedAmount}</strong> for <strong style="color: #18181b;">${businessName}</strong> didn't go through. This is often a temporary issue. Please try again using the button below.`,
        ctaText: `Retry Payment`,
        ctaColor: '#2563eb' // Blue for retry
      };
  }
}

function getRecoveryEmailHtml(
  customerName: string, 
  businessName: string, 
  amount: number, 
  invoiceUrl: string,
  currency: string,
  brandColor: string = '#2563eb',
  strategy: string | null = null
): string {
  const greeting = getGreeting(customerName);
  const formattedAmount = formatCurrency(amount, currency);
  const content = getStrategyContent(strategy, businessName, formattedAmount);
  
  // Use strategy-specific color if default, otherwise use merchant's brand color
  const ctaColor = brandColor === '#6366f1' ? content.ctaColor : brandColor;
  
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
                ${content.headline.includes('Hi') ? content.headline : `Hi ${greeting},`}
              </h1>
              <p style="margin: 0 0 20px; font-size: 16px; color: #3f3f46;">
                ${content.body}
              </p>
              <p style="margin: 0 0 30px; font-size: 16px; color: #3f3f46;">
                Click below to resolve this quickly:
              </p>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="border-radius: 6px; background-color: ${ctaColor};">
                    <a href="${invoiceUrl}" target="_blank" style="display: inline-block; padding: 14px 28px; font-size: 16px; font-weight: 600; color: #ffffff; text-decoration: none; border-radius: 6px;">
                      ${content.ctaText}
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
  currency: string,
  strategy: string | null = null
): string {
  const greeting = getGreeting(customerName);
  const formattedAmount = formatCurrency(amount, currency);
  const content = getStrategyContent(strategy, businessName, formattedAmount);
  
  // Strip HTML tags from body for text version
  const textBody = content.body.replace(/<[^>]+>/g, '');
  
  return `Hi ${greeting},

${textBody}

${content.ctaText}: ${invoiceUrl}

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
  expYear: number,
  brandColor: string = '#16a34a'
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
                  <td style="border-radius: 6px; background-color: ${brandColor};">
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
  const brandColor = merchant.brandColor || '#6366f1';
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
      expYear,
      brandColor
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
    // Use strategy-specific content (Sprint 3.1 Golden Hour)
    const formattedAmount = formatCurrency(target.amount, currency);
    const strategyContent = getStrategyContent(target.recoveryStrategy || null, businessName, formattedAmount);
    subject = strategyContent.subject;
    htmlContent = getRecoveryEmailHtml(
      target.customerName,
      businessName,
      target.amount,
      trackingUrl,
      currency,
      brandColor,
      target.recoveryStrategy || null
    );
    textContent = getRecoveryEmailText(
      target.customerName,
      businessName,
      target.amount,
      trackingUrl,
      currency,
      target.recoveryStrategy || null
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
  const brandColor = merchant.brandColor || '#6366f1';
  
  const htmlContent = getRecoveryEmailHtml(customerName, businessName, amount, invoiceUrl, currency, brandColor);
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

// Sprint 3.1: Golden Hour Email Trigger
// Sends strategy-specific recovery email immediately after ghost creation
// Guardrails: Only sends if emailCount === 0 and status === 'pending'
export async function sendGoldenHourEmail(
  targetId: string,
  storage: any // Avoid circular import - passed from caller
): Promise<SendEmailResult> {
  console.log(`[GOLDEN HOUR] Evaluating target ${targetId} for immediate email`);
  
  try {
    // Fetch target with guardrail checks
    const target = await storage.getGhostTarget(targetId);
    
    if (!target) {
      console.log(`[GOLDEN HOUR] Target ${targetId} not found - skipping`);
      return { success: false, error: 'Target not found' };
    }
    
    // Guardrail 1: Only send first email
    if (target.emailCount > 0) {
      console.log(`[GOLDEN HOUR] Target ${targetId} already emailed (count: ${target.emailCount}) - skipping`);
      return { success: false, error: 'Already emailed' };
    }
    
    // Guardrail 2: Only send to pending status (not recovered, protected, or exhausted)
    if (target.status !== 'pending') {
      console.log(`[GOLDEN HOUR] Target ${targetId} not pending (status: ${target.status}) - skipping`);
      return { success: false, error: `Invalid status: ${target.status}` };
    }
    
    // Fetch merchant for branding
    const merchant = await storage.getMerchant(target.merchantId);
    if (!merchant) {
      console.log(`[GOLDEN HOUR] Merchant not found for target ${targetId} - skipping`);
      return { success: false, error: 'Merchant not found' };
    }
    
    // Check if Auto-Pilot is enabled
    if (!merchant.autoPilotEnabled) {
      console.log(`[GOLDEN HOUR] Auto-Pilot disabled for merchant ${merchant.id} - queued for manual review`);
      return { success: false, error: 'Auto-Pilot disabled' };
    }
    
    // Build tracking URL
    const baseUrl = process.env.REPLIT_DEV_DOMAIN 
      ? `https://${process.env.REPLIT_DEV_DOMAIN}`
      : process.env.REPL_SLUG && process.env.REPL_OWNER
        ? `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`
        : 'http://localhost:5000';
    const trackingUrl = `${baseUrl}/api/l/${target.id}`;
    
    // Send strategy-specific email
    console.log(`[GOLDEN HOUR] Sending ${target.recoveryStrategy || 'smart_retry'} email to ${target.email.replace(/(.{3}).*@/, '$1...@')}`);
    
    const result = await sendPulseEmail(target, merchant, trackingUrl);
    
    if (result.success) {
      // Update email status (increment count, set timestamp)
      await storage.updateGhostEmailStatus(target.id);
      
      console.log(`[GOLDEN HOUR] Email sent successfully for target ${targetId} (${result.dryRun ? 'DRY RUN' : 'LIVE'})`);
      
      // Log to system for Intelligence Feed
      await storage.createSystemLog({
        jobName: 'golden_hour_email',
        status: 'success',
        details: JSON.stringify({
          type: 'golden_hour_trigger',
          targetId: target.id,
          strategy: target.recoveryStrategy || 'smart_retry',
          amount: target.amount,
          dryRun: result.dryRun || false,
          timestamp: new Date().toISOString()
        }),
        errorMessage: null
      });
    }
    
    return result;
    
  } catch (error: any) {
    console.error(`[GOLDEN HOUR] Error processing target ${targetId}:`, error.message);
    return {
      success: false,
      error: error.message
    };
  }
}
