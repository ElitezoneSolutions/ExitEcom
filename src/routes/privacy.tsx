import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
  component: PrivacyPolicy,
});

// Public, unauthenticated page. The URL (https://dash.exitecom.com/privacy) is
// used as the Privacy Policy URL in the Meta (Facebook) Developer portal and is
// linked from the OAuth connect flow. Plain document styling, app CSS variables.
const LAST_UPDATED = "8 June 2026";
const CONTACT_EMAIL = "privacy@exitecom.com";

function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <header className="border-b border-[var(--border-warm)] bg-white">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="font-display text-lg font-bold">
            ExitEcom
          </Link>
          <Link
            to="/login"
            className="text-sm text-[var(--accent)] hover:text-[var(--accent-muted)] font-medium"
          >
            Sign in
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="font-display text-3xl font-bold">Privacy Policy</h1>
        <p className="text-sm text-[var(--text-muted)] mt-2">
          Last updated: {LAST_UPDATED}
        </p>

        <div className="mt-8 flex flex-col gap-8 text-[15px] leading-relaxed text-[var(--text-secondary)]">
          <Section title="1. Who we are">
            <p>
              ExitEcom (“ExitEcom”, “we”, “us”) operates the platform at{" "}
              <strong>dash.exitecom.com</strong>, which helps e-commerce
              business owners assess how ready their business is to sell. We do
              this by connecting to the data sources you authorise — such as
              your Shopify store and Meta (Facebook) Ads account — and computing
              an Exit Readiness Score, valuation range, and risk analysis from
              that data.
            </p>
            <p className="mt-3">
              This policy explains what we collect, how we use it, who we share
              it with, and the choices and rights you have. It applies to your
              use of the ExitEcom dashboard and any data sources you connect to
              it.
            </p>
          </Section>

          <Section title="2. Information we collect">
            <p>We collect only what we need to provide the service:</p>
            <ul className="list-disc pl-6 mt-3 flex flex-col gap-2">
              <li>
                <strong>Account information.</strong> Your name and email
                address, used to create and secure your account (handled by our
                authentication provider).
              </li>
              <li>
                <strong>Business profile.</strong> Details you enter about your
                business (industry, channel, country, revenue range, exit
                timeframe, and similar).
              </li>
              <li>
                <strong>Shopify data (if connected).</strong> Orders, products
                and customers read from your store via Shopify’s API, used to
                reconstruct your revenue, margins and customer economics.
              </li>
              <li>
                <strong>Meta (Facebook) Ads data (if connected).</strong> When
                you connect via Facebook Login, we request the read-only{" "}
                <code>ads_read</code> permission and read your ad account
                metadata, spend, performance insights and campaign breakdown. We
                use this to verify your marketing efficiency (ROAS, CAC) for
                your score.
              </li>
              <li>
                <strong>Financial inputs.</strong> Any costs, P&amp;L figures or
                other financial details you choose to upload or enter.
              </li>
              <li>
                <strong>Technical data.</strong> Basic session and security data
                needed to keep you logged in and protect your account.
              </li>
            </ul>
            <p className="mt-3">
              We only access data from a connected platform after you explicitly
              authorise it, and only the read-only scopes listed at connection
              time. We do not post, publish, or make changes on your connected
              accounts.
            </p>
          </Section>

          <Section title="3. How we use your information">
            <ul className="list-disc pl-6 flex flex-col gap-2">
              <li>
                To compute your Exit Readiness Score, valuation range, risk
                analysis and optimisation recommendations.
              </li>
              <li>
                To display your data and reports back to you in the dashboard.
              </li>
              <li>To operate, secure, maintain and improve the service.</li>
              <li>
                To communicate with you about your account or the service when
                necessary.
              </li>
            </ul>
            <p className="mt-3">
              We do <strong>not</strong> sell your personal information or your
              connected platform data, and we do not use it for advertising.
            </p>
          </Section>

          <Section title="4. How we store and protect it">
            <p>
              Your data is stored in our managed database provider with
              row-level security, so each account can only access its own data.
              Data is transmitted over encrypted connections (HTTPS). Access
              tokens for connected platforms are stored server-side against your
              account and are never exposed to your browser or shared with other
              users.
            </p>
          </Section>

          <Section title="5. Sharing and third-party services">
            <p>
              We do not share your data with third parties except with the
              service providers that make ExitEcom work, and only as needed to
              provide the service:
            </p>
            <ul className="list-disc pl-6 mt-3 flex flex-col gap-2">
              <li>
                <strong>Hosting &amp; database (Supabase).</strong> Stores your
                account, business profile and connected-source data.
              </li>
              <li>
                <strong>Data sources (Shopify, Meta).</strong> We read data from
                these platforms when you connect them, subject to their own
                terms and policies.
              </li>
              <li>
                <strong>AI text assistance (Google Gemini), optional.</strong>{" "}
                Used only to polish the wording of risk and recommendation copy
                and to tidy display labels. It is never used to make decisions
                about you, and the platform functions fully without it.
              </li>
            </ul>
            <p className="mt-3">
              We may also disclose information if required by law, or to protect
              the rights, safety and security of ExitEcom and our users.
            </p>
          </Section>

          <Section title="6. Data retention and deletion">
            <p>
              We keep your data for as long as your account is active. You are
              in control:
            </p>
            <ul className="list-disc pl-6 mt-3 flex flex-col gap-2">
              <li>
                <strong>Disconnect a source.</strong> Disconnecting Shopify or
                Meta Ads from the Data Sources page deletes the data we pulled
                from that source and revokes the stored access token.
              </li>
              <li>
                <strong>Delete your account.</strong> You can request deletion
                of your account and all associated data at any time by emailing{" "}
                <a
                  href={`mailto:${CONTACT_EMAIL}`}
                  className="text-[var(--accent)] hover:underline"
                >
                  {CONTACT_EMAIL}
                </a>
                . We will action verified requests promptly.
              </li>
            </ul>
            <p className="mt-3">
              You can also revoke ExitEcom’s access to your Facebook data at any
              time from your Facebook account’s Business Integrations / Apps and
              Websites settings. For step-by-step instructions, see our{" "}
              <Link
                to="/data-deletion"
                className="text-[var(--accent)] hover:underline"
              >
                Data Deletion Instructions
              </Link>
              .
            </p>
          </Section>

          <Section title="7. Your rights">
            <p>
              Depending on where you live, you may have the right to access,
              correct, export or delete your personal data, and to object to or
              restrict certain processing. To exercise any of these rights,
              contact us at{" "}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="text-[var(--accent)] hover:underline"
              >
                {CONTACT_EMAIL}
              </a>
              .
            </p>
          </Section>

          <Section title="8. Children">
            <p>
              ExitEcom is a business tool not directed to anyone under 18, and
              we do not knowingly collect data from children.
            </p>
          </Section>

          <Section title="9. Changes to this policy">
            <p>
              We may update this policy from time to time. When we make material
              changes, we will update the “Last updated” date above and, where
              appropriate, notify you in the app.
            </p>
          </Section>

          <Section title="10. Contact us">
            <p>
              Questions about this policy or your data? Email us at{" "}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="text-[var(--accent)] hover:underline"
              >
                {CONTACT_EMAIL}
              </a>
              .
            </p>
          </Section>
        </div>
      </main>

      <footer className="border-t border-[var(--border-warm)] mt-8">
        <div className="max-w-3xl mx-auto px-6 py-6 text-xs text-[var(--text-muted)]">
          © {LAST_UPDATED.split(" ").pop()} ExitEcom. All rights reserved.
        </div>
      </footer>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="font-display text-xl font-semibold text-[var(--text-primary)] mb-3">
        {title}
      </h2>
      {children}
    </section>
  );
}
