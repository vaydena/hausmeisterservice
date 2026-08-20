import 'server-only';
import { serverEnv } from '@/lib/env';

/**
 * PayPal-Anbindung über die Orders-API v2, direkt per `fetch` — bewusst ohne
 * SDK (die offiziellen Node-SDKs sind teils unmaintained) und ohne Webhook.
 * Der Ablauf ist redirect-basiert: Server erzeugt eine Order → der Zahler wird
 * zur PayPal-Freigabe-URL weitergeleitet → PayPal kehrt auf unsere
 * Return-Route zurück, die die Order captured und das Abo freischaltet. Die
 * Echtheit sichert die eingeloggte Owner-Session + der Mandanten-Abgleich in
 * der Finalize-Action, nicht eine Webhook-Signatur.
 */

const SANDBOX_BASE = 'https://api-m.sandbox.paypal.com';
const LIVE_BASE = 'https://api-m.paypal.com';

export function isPaypalConfigured(): boolean {
  const env = serverEnv();
  return Boolean(env.PAYPAL_CLIENT_ID && env.PAYPAL_CLIENT_SECRET);
}

function getBaseUrl(): string {
  // Nur exakt "live" schaltet auf die Produktions-API; alles andere (inkl.
  // ungesetzt) bleibt sicherheitshalber Sandbox.
  return serverEnv().PAYPAL_ENV === 'live' ? LIVE_BASE : SANDBOX_BASE;
}

function requireCredentials(): { clientId: string; clientSecret: string } {
  const env = serverEnv();
  if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_CLIENT_SECRET) {
    throw new Error(
      'PAYPAL_CLIENT_ID und PAYPAL_CLIENT_SECRET fehlen. In der Umgebung ergänzen.',
    );
  }
  return { clientId: env.PAYPAL_CLIENT_ID, clientSecret: env.PAYPAL_CLIENT_SECRET };
}

// Token wird pro Node-Worker im Modul gecacht, mit 60s Sicherheitsabstand.
let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }

  const { clientId, clientSecret } = requireCredentials();
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const response = await fetch(`${getBaseUrl()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
    cache: 'no-store',
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`PayPal-Auth fehlgeschlagen (${response.status}): ${text}`);
  }

  const data = (await response.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return data.access_token;
}

export interface PaypalOrder {
  id: string;
  approvalUrl: string;
}

export async function createPaypalOrder(params: {
  amountEur: number;
  invoiceId: string;
  description: string;
  returnUrl: string;
  cancelUrl: string;
}): Promise<PaypalOrder> {
  const token = await getAccessToken();

  const response = await fetch(`${getBaseUrl()}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [
        {
          reference_id: params.invoiceId,
          description: params.description,
          amount: {
            currency_code: 'EUR',
            value: params.amountEur.toFixed(2),
          },
        },
      ],
      application_context: {
        brand_name: 'Vaydena',
        locale: 'de-DE',
        user_action: 'PAY_NOW',
        shipping_preference: 'NO_SHIPPING',
        return_url: params.returnUrl,
        cancel_url: params.cancelUrl,
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`PayPal-Order fehlgeschlagen (${response.status}): ${text}`);
  }

  const data = (await response.json()) as {
    id: string;
    links: { href: string; rel: string }[];
  };
  const approval = data.links.find((link) => link.rel === 'approve');
  if (!approval) {
    throw new Error('PayPal-Order ohne Approve-Link erhalten.');
  }
  return { id: data.id, approvalUrl: approval.href };
}

export interface PaypalCapture {
  captureId: string;
  status: string;
}

export async function capturePaypalOrder(orderId: string): Promise<PaypalCapture> {
  const token = await getAccessToken();

  const response = await fetch(
    `${getBaseUrl()}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
      body: '{}',
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`PayPal-Capture fehlgeschlagen (${response.status}): ${text}`);
  }

  const data = (await response.json()) as {
    status: string;
    purchase_units?: {
      payments?: { captures?: { id: string; status: string }[] };
    }[];
  };
  const capture = data.purchase_units?.[0]?.payments?.captures?.[0];
  if (!capture || capture.status !== 'COMPLETED') {
    throw new Error(
      `PayPal-Capture nicht abgeschlossen (Status: ${capture?.status ?? 'unbekannt'}).`,
    );
  }
  return { captureId: capture.id, status: data.status };
}
