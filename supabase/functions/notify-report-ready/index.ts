// "Your result is ready" email, sent when a superadmin approves a report
// request.
//
// This is a Supabase Edge Function (Deno), NOT part of the Vite app — it is
// deployed separately:
//
//   supabase functions deploy notify-report-ready
//   supabase secrets set SMTP_HOST=... SMTP_PORT=465 SMTP_USER=... \
//     SMTP_PASS=... SMTP_FROM="ExitEcom <notifications@exitecom.com>"
//
// The SMTP credentials are the same ones configured for your project's auth
// emails, but Supabase does not expose those to Edge Functions automatically —
// they have to be set as function secrets as above.
//
// Called only from the server (service-role) in
// src/lib/admin/reportRequests.ts. Verify-JWT stays ON: the service-role key is
// sent as the Authorization bearer, so an anonymous caller can't send mail
// through this endpoint.

// nodemailer rather than a Deno-native SMTP client: it negotiates STARTTLS on
// port 587 correctly (Gmail's submission port), which is what most providers
// expect. A denomailer implementation crashed the worker on connect.
import nodemailer from "npm:nodemailer@6.9.16";

interface Payload {
  email: string;
  name?: string | null;
  toolName: string;
  url: string;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c] ?? c,
  );

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let payload: Payload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const { email, name, toolName, url } = payload;
  if (!email || !toolName || !url) {
    return json({ error: "email, toolName and url are required" }, 400);
  }

  const host = Deno.env.get("SMTP_HOST");
  const port = Number(Deno.env.get("SMTP_PORT") ?? "465");
  const username = Deno.env.get("SMTP_USER");
  const password = Deno.env.get("SMTP_PASS");
  const from = Deno.env.get("SMTP_FROM") ?? "ExitEcom <no-reply@exitecom.com>";

  if (!host || !username || !password) {
    // Surfaced to the admin UI as "approved, but not emailed" rather than
    // failing the approval itself.
    return json({ error: "SMTP is not configured for this function." }, 500);
  }

  const greeting = name ? `Hi ${name},` : "Hi,";
  const safeTool = escapeHtml(toolName);
  const safeUrl = escapeHtml(url);

  const text = `${greeting}

Your ${toolName} has been reviewed and is ready to view:

${url}

— ExitEcom
exitecom.com`;

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#faf8f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1c1917">
    <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e7e0d8;border-radius:8px;padding:32px">
      <div style="font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:#a8a29e">ExitEcom</div>
      <h1 style="font-size:22px;margin:16px 0 0">Your ${safeTool} is ready</h1>
      <p style="font-size:15px;line-height:1.6;color:#57534e">${escapeHtml(greeting)} your ${safeTool} has been reviewed and is now available in your dashboard.</p>
      <p style="margin:28px 0">
        <a href="${safeUrl}" style="display:inline-block;background:#b45309;color:#fff;text-decoration:none;padding:12px 22px;border-radius:6px;font-size:14px">View your result</a>
      </p>
      <p style="font-size:12px;color:#a8a29e;margin:0">If the button doesn't work, paste this into your browser:<br>${safeUrl}</p>
    </div>
    <p style="max-width:520px;margin:16px auto 0;font-size:11px;color:#a8a29e;text-align:center">ExitEcom · exitecom.com</p>
  </body>
</html>`;

  // `secure` means implicit TLS from the first byte (465). On 587 we connect in
  // the clear and upgrade with STARTTLS, which nodemailer does automatically.
  const transport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user: username, pass: password },
  });

  try {
    await transport.sendMail({
      from,
      to: email,
      subject: `Your ${toolName} is ready`,
      text,
      html,
    });
    return json({ ok: true });
  } catch (err) {
    console.error("[notify-report-ready] send failed", err);
    return json(
      { error: err instanceof Error ? err.message : String(err) },
      502,
    );
  } finally {
    transport.close();
  }
});
