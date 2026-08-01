// Server-only Twilio WhatsApp helpers.
// Credentials resolve per-tenant first, then fall back to the platform account.

export type TwilioCreds = {
  accountSid: string;
  authToken: string;
  from: string;
  source: "tenant" | "platform";
};

export function platformCreds(): TwilioCreds | null {
  const accountSid = process.env["TWILIO_ACCOUNT_SID"];
  const authToken = process.env["TWILIO_AUTH_TOKEN"];
  const from = process.env["TWILIO_WHATSAPP_FROM"];
  if (!accountSid || !authToken || !from) return null;
  return { accountSid, authToken, from, source: "platform" };
}

export function resolveCreds(
  settings: {
    account_sid?: string | null;
    auth_token?: string | null;
    sender_number?: string | null;
    use_platform_sender?: boolean | null;
    is_active?: boolean | null;
  } | null,
): TwilioCreds | null {
  if (
    settings &&
    settings.is_active &&
    !settings.use_platform_sender &&
    settings.account_sid &&
    settings.auth_token &&
    settings.sender_number
  ) {
    return {
      accountSid: settings.account_sid,
      authToken: settings.auth_token,
      from: settings.sender_number,
      source: "tenant",
    };
  }
  return platformCreds();
}

function waAddr(n: string) {
  const trimmed = n.trim();
  return trimmed.startsWith("whatsapp:") ? trimmed : `whatsapp:${trimmed}`;
}

export type SendResult = { ok: true; sid: string; status: string } | { ok: false; error: string };

export async function sendWhatsApp(
  creds: TwilioCreds,
  opts: { to: string; body: string; mediaUrl?: string | null; statusCallback?: string | null },
): Promise<SendResult> {
  const params = new URLSearchParams({
    To: waAddr(opts.to),
    From: waAddr(creds.from),
    Body: opts.body,
  });
  if (opts.mediaUrl) params.set("MediaUrl", opts.mediaUrl);
  if (opts.statusCallback) params.set("StatusCallback", opts.statusCallback);

  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${creds.accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(`${creds.accountSid}:${creds.authToken}`)}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params,
      },
    );
    const json = (await res.json()) as { sid?: string; status?: string; message?: string };
    if (!res.ok) {
      console.error(`Twilio send failed [${res.status}]: ${JSON.stringify(json)}`);
      return { ok: false, error: json.message || `Twilio error ${res.status}` };
    }
    return { ok: true, sid: json.sid ?? "", status: json.status ?? "queued" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error" };
  }
}

// Replaces {{name}} style placeholders.
export function renderBody(body: string, vars: Record<string, string>) {
  return body.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k: string) => vars[k] ?? "");
}

// Concurrency-limited map so large campaigns don't stampede Twilio.
export async function pooled<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>) {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      out[i] = await fn(items[i]!);
    }
  });
  await Promise.all(workers);
  return out;
}