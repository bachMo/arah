/**
 * Routing Middleware Vercel : relaie /api/* vers l'API Arah!.
 *
 * Le site et l'API restent sur la même origine pour le navigateur (cookie de session, protection CSRF),
 * et l'adresse réelle de l'API reste dans une variable d'environnement (API_ORIGIN) plutôt que dans le dépôt.
 * Avec ngrok, l'en-tête ngrok-skip-browser-warning évite la page d'avertissement du plan gratuit.
 */

declare const process: { env: Record<string, string | undefined> };

export const config = { matcher: "/api/:path*" };

const HOP_BY_HOP = ["host", "connection", "content-length", "keep-alive", "transfer-encoding", "upgrade"];

function json(status: number, detail: string): Response {
  return new Response(JSON.stringify({ detail }), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

export default async function middleware(request: Request): Promise<Response> {
  const origin = process.env.API_ORIGIN?.trim().replace(/\/+$/, "");
  if (!origin) return json(503, "L'API n'est pas configurée (variable API_ORIGIN manquante).");

  const incoming = new URL(request.url);
  const target = `${origin}${incoming.pathname}${incoming.search}`;

  const headers = new Headers(request.headers);
  for (const name of HOP_BY_HOP) headers.delete(name);
  headers.set("ngrok-skip-browser-warning", "1");
  headers.set("accept-encoding", "identity");
  headers.set("x-forwarded-host", incoming.host);
  headers.set("x-forwarded-proto", "https");

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? await request.arrayBuffer() : undefined,
      redirect: "manual",
    });
  } catch {
    return json(502, "L'API est injoignable pour le moment. Réessaie dans un instant.");
  }

  // ngrok répond en HTML quand le tunnel est coupé : on renvoie une erreur lisible par le site.
  if (upstream.headers.get("ngrok-error-code")) {
    return json(502, "L'API est hors ligne pour le moment. Réessaie dans un instant.");
  }

  const responseHeaders = new Headers(upstream.headers);
  for (const name of ["content-encoding", "content-length", "transfer-encoding", "connection"]) {
    responseHeaders.delete(name);
  }
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}
