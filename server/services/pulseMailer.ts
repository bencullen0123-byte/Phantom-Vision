// Pulse Mailer - Resend integration for recovery emails
// Uses Replit Resend connector for authentication

import { Resend } from 'resend';
import type { Merchant } from '@shared/schema';

let connectionSettings: any;

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

function getDefaultEmailTemplate(customerName: string, businessName: string, amount: number, invoiceUrl: string): string {
  const formattedAmount = `$${(amount / 100).toFixed(2)}`;
  // Use first name only for friendlier greeting, fallback to "there" if unknown
  const greeting = customerName && customerName !== "Unknown Customer" && customerName !== "ENCRYPTION_ERROR"
    ? customerName.split(' ')[0]
    : "there";
  return `Hi ${greeting},

It looks like the latest payment of ${formattedAmount} for ${businessName} didn't go through.

You can update your payment method and clear the balance here:
${invoiceUrl}

Thanks!`;
}

function parseCustomTemplate(
  template: string, 
  customerName: string,
  businessName: string, 
  amount: number, 
  invoiceUrl: string
): string {
  const formattedAmount = `$${(amount / 100).toFixed(2)}`;
  // Use first name only for [Name] placeholder, fallback to "there" if unknown
  const greeting = customerName && customerName !== "Unknown Customer" && customerName !== "ENCRYPTION_ERROR"
    ? customerName.split(' ')[0]
    : "there";
  return template
    .replace(/\[Name\]/g, greeting)
    .replace(/\[Business\]/g, businessName)
    .replace(/\[Amount\]/g, formattedAmount)
    .replace(/\[invoiceUrl\]/g, invoiceUrl);
}

export interface SendRecoveryEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export async function sendRecoveryEmail(
  to: string,
  customerName: string,
  amount: number,
  invoiceUrl: string,
  merchant: Merchant
): Promise<SendRecoveryEmailResult> {
  // SECURITY: Never log PII (email/customerName) - only log anonymized identifiers
  console.log(`[PULSE MAILER] Sending recovery email for merchant ${merchant.id}`);

  try {
    const { client, fromEmail } = await getUncachableResendClient();
    
    const businessName = merchant.businessName || 'Your Service Provider';
    const replyTo = merchant.supportEmail || undefined;

    let emailContent: string;
    if (merchant.customEmailTemplate) {
      emailContent = parseCustomTemplate(
        merchant.customEmailTemplate,
        customerName,
        businessName, 
        amount, 
        invoiceUrl
      );
    } else {
      emailContent = getDefaultEmailTemplate(customerName, businessName, amount, invoiceUrl);
    }

    const result = await client.emails.send({
      from: `${businessName} <${fromEmail}>`,
      to: [to],
      replyTo: replyTo,
      subject: `Action Required: Payment Update for ${businessName}`,
      text: emailContent,
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
