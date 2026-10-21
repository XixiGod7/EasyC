export interface AccessSecrets {
  EASYC_USERNAME?: string;
  EASYC_PASSWORD?: string;
}

async function equalCredentials(actual: string, expected: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [left, right] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(actual)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  const bytes = new Uint8Array(right);
  return new Uint8Array(left).reduce((difference, byte, i) => difference | (byte ^ bytes[i]), 0) === 0;
}

// Fail closed until access credentials have been configured as Worker secrets.
export async function authorizeRequest(request: Request, env: AccessSecrets): Promise<Response | null> {
  if (!env.EASYC_USERNAME || !env.EASYC_PASSWORD) {
    return new Response("EasyC access credentials have not been configured.", {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const authorization = request.headers.get("Authorization") ?? "";
  const match = /^Basic\s+([^\s]+)$/i.exec(authorization);
  if (match) {
    try {
      if (await equalCredentials(atob(match[1]), `${env.EASYC_USERNAME}:${env.EASYC_PASSWORD}`)) {
        return null;
      }
    } catch {
      // Invalid Base64 credentials receive the same challenge as a missing header.
    }
  }

  return new Response("Please sign in to EasyC.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="EasyC", charset="UTF-8"',
      "Cache-Control": "no-store",
    },
  });
}
