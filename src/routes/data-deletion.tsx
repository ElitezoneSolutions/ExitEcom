import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/data-deletion")({
  component: DataDeletion,
});

// Public, unauthenticated page. The URL (https://dash.exitecom.com/data-deletion)
// is used as the "Data Deletion Instructions URL" in the Meta (Facebook)
// Developer portal. Same plain document styling as the Privacy Policy page.
const LAST_UPDATED = "8 June 2026";
const CONTACT_EMAIL = "privacy@exitecom.com";

function DataDeletion() {
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
        <h1 className="font-display text-3xl font-bold">
          User Data Deletion Instructions
        </h1>
        <p className="text-sm text-[var(--text-muted)] mt-2">
          Last updated: {LAST_UPDATED}
        </p>

        <div className="mt-8 flex flex-col gap-8 text-[15px] leading-relaxed text-[var(--text-secondary)]">
          <Section title="Overview">
            <p>
              ExitEcom (at <strong>dash.exitecom.com</strong>) lets you connect
              data sources — such as your Shopify store and your Meta (Facebook)
              Ads account — so we can build your Exit Readiness Score. You can
              delete the data we hold about you at any time, using any of the
              options below.
            </p>
          </Section>

          <Section title="Option 1 — Disconnect a data source (instant)">
            <p>
              To delete the data pulled from a specific source while keeping
              your account:
            </p>
            <ol className="list-decimal pl-6 mt-3 flex flex-col gap-2">
              <li>Sign in to ExitEcom and open the “Data Sources” page.</li>
              <li>
                Find the connected source (e.g. <strong>Meta Ads</strong> or{" "}
                <strong>Shopify</strong>) and click <strong>Disconnect</strong>.
              </li>
              <li>
                Confirm. This immediately deletes the data we pulled from that
                source and revokes the stored access token.
              </li>
            </ol>
          </Section>

          <Section title="Option 2 — Delete your entire account">
            <p>
              To permanently delete your ExitEcom account and all associated
              data (profile, connected-source data, computed reports), email{" "}
              <a
                href={`mailto:${CONTACT_EMAIL}?subject=Account%20and%20data%20deletion%20request`}
                className="text-[var(--accent)] hover:underline"
              >
                {CONTACT_EMAIL}
              </a>{" "}
              from the email address on your account, with the subject{" "}
              <em>“Account and data deletion request”</em>. We verify the
              request and permanently delete your data, typically within 30
              days.
            </p>
          </Section>

          <Section title="Option 3 — Revoke access from Facebook">
            <p>
              You can also remove ExitEcom’s access to your Facebook data
              directly from Facebook:
            </p>
            <ol className="list-decimal pl-6 mt-3 flex flex-col gap-2">
              <li>
                Go to Facebook <strong>Settings &amp; privacy</strong> →{" "}
                <strong>Settings</strong> →{" "}
                <strong>Business Integrations</strong> (or{" "}
                <strong>Apps and Websites</strong>).
              </li>
              <li>
                Find <strong>ExitEcom</strong> in the list and choose{" "}
                <strong>Remove</strong>.
              </li>
            </ol>
            <p className="mt-3">
              Revoking access on Facebook stops any future access. To also
              delete the ad data we already pulled, use Option 1 or Option 2
              above.
            </p>
          </Section>

          <Section title="What gets deleted">
            <ul className="list-disc pl-6 flex flex-col gap-2">
              <li>The access token for the disconnected source.</li>
              <li>
                The data we pulled from it (for Meta: ad account metadata,
                spend, insights and campaign breakdown; for Shopify: orders,
                products and customers).
              </li>
              <li>
                With full account deletion: your profile and any computed
                reports as well.
              </li>
            </ul>
            <p className="mt-3">
              We may retain limited records where required by law, after which
              they are deleted.
            </p>
          </Section>

          <Section title="Contact">
            <p>
              Questions or deletion requests:{" "}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="text-[var(--accent)] hover:underline"
              >
                {CONTACT_EMAIL}
              </a>
              . See also our{" "}
              <Link
                to="/privacy"
                className="text-[var(--accent)] hover:underline"
              >
                Privacy Policy
              </Link>{" "}
              and{" "}
              <Link
                to="/terms"
                className="text-[var(--accent)] hover:underline"
              >
                Terms &amp; Conditions
              </Link>
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
