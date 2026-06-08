import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/terms")({
  component: Terms,
});

// Public, unauthenticated page at https://dash.exitecom.com/terms. Linked from
// the connect flows and used in the Meta/Google API review submissions. Same
// plain document styling as the Privacy Policy and Data Deletion pages.
const LAST_UPDATED = "8 June 2026";
const CONTACT_EMAIL = "privacy@exitecom.com";

function Terms() {
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
          Terms &amp; Conditions
        </h1>
        <p className="text-sm text-[var(--text-muted)] mt-2">
          Last updated: {LAST_UPDATED}
        </p>

        <div className="mt-8 flex flex-col gap-8 text-[15px] leading-relaxed text-[var(--text-secondary)]">
          <Section title="1. Agreement to these terms">
            <p>
              These Terms &amp; Conditions ("Terms") govern your access to and
              use of ExitEcom (the "Service") at{" "}
              <strong>dash.exitecom.com</strong>, operated by ExitEcom ("we",
              "us"). By creating an account or using the Service, you agree to
              these Terms and to our{" "}
              <Link
                to="/privacy"
                className="text-[var(--accent)] hover:underline"
              >
                Privacy Policy
              </Link>
              . If you do not agree, do not use the Service.
            </p>
          </Section>

          <Section title="2. What ExitEcom does">
            <p>
              ExitEcom helps e-commerce business owners assess how ready their
              business is to sell. It connects to data sources you authorise
              (such as your Shopify store, Meta Ads and Google Ads accounts) and
              produces an Exit Readiness Score, an indicative valuation range, a
              risk analysis and improvement recommendations. These outputs are
              informational estimates (see section 6).
            </p>
          </Section>

          <Section title="3. Eligibility and accounts">
            <p>
              You must be at least 18 years old and, where you connect a
              business or its data, authorised to act on behalf of that
              business. You are responsible for the accuracy of the information
              you provide, for keeping your login credentials secure, and for
              all activity under your account. Notify us promptly of any
              unauthorised use.
            </p>
          </Section>

          <Section title="4. Connecting your data sources">
            <p>
              When you connect a platform, you grant ExitEcom permission to read
              the data covered by the scopes shown at connection time. You
              confirm that you have the right to connect that account and share
              its data with us. ExitEcom requests <strong>read-only</strong>{" "}
              access and does not create, modify, pause or manage anything on
              your connected accounts. Your use of those platforms remains
              subject to their own terms (e.g. Shopify, Meta, Google). You can
              disconnect a source at any time; see our{" "}
              <Link
                to="/data-deletion"
                className="text-[var(--accent)] hover:underline"
              >
                Data Deletion Instructions
              </Link>
              .
            </p>
          </Section>

          <Section title="5. Acceptable use">
            <p>You agree not to:</p>
            <ul className="list-disc pl-6 mt-3 flex flex-col gap-2">
              <li>
                use the Service unlawfully, or connect data you are not
                authorised to access;
              </li>
              <li>
                attempt to gain unauthorised access to the Service, other users'
                data, or our systems;
              </li>
              <li>
                reverse engineer, scrape, resell, or build a competing product
                from the Service or its outputs;
              </li>
              <li>
                interfere with or disrupt the Service, or circumvent rate limits
                or security measures.
              </li>
            </ul>
          </Section>

          <Section title="6. Not professional advice">
            <p>
              The Exit Readiness Score, valuation ranges, risk findings and
              recommendations are{" "}
              <strong>estimates generated from the data available</strong> and
              are provided for informational purposes only. They are{" "}
              <strong>not</strong> financial, investment, accounting, legal or
              tax advice, and are not a guarantee of any sale price, outcome or
              valuation. You should obtain independent professional advice
              before making decisions about your business. You are solely
              responsible for decisions you make based on the Service.
            </p>
          </Section>

          <Section title="7. Intellectual property">
            <p>
              The Service, including its software, scoring methodology, design
              and content, is owned by ExitEcom and protected by intellectual
              property laws. We grant you a limited, non-exclusive,
              non-transferable right to use the Service for your own business
              purposes. Your data remains yours; you grant us the limited
              licence needed to operate and provide the Service to you.
            </p>
          </Section>

          <Section title="8. Third-party services">
            <p>
              ExitEcom relies on third-party services (including Shopify, Meta,
              Google, our hosting/database provider, and optional AI text
              assistance). We are not responsible for those services, their
              availability, or their terms. Your connections to them are subject
              to their respective agreements.
            </p>
          </Section>

          <Section title="9. Disclaimers">
            <p>
              The Service is provided "as is" and "as available", without
              warranties of any kind, whether express or implied, including
              fitness for a particular purpose, accuracy, or uninterrupted or
              error-free operation. We do not warrant that the outputs will be
              accurate or complete.
            </p>
          </Section>

          <Section title="10. Limitation of liability">
            <p>
              To the maximum extent permitted by law, ExitEcom will not be
              liable for any indirect, incidental, special, consequential or
              punitive damages, or for any loss of profits, revenue, data or
              goodwill, arising from your use of the Service. Our total
              liability for any claim relating to the Service will not exceed
              the greater of the amount you paid us in the 12 months before the
              claim, or USD 100.
            </p>
          </Section>

          <Section title="11. Termination">
            <p>
              You may stop using the Service and delete your account at any
              time. We may suspend or terminate access if you breach these Terms
              or use the Service in a way that risks harm to us, other users, or
              the connected platforms. On termination, the licence granted to
              you ends; data deletion is handled as described in our Privacy
              Policy and Data Deletion Instructions.
            </p>
          </Section>

          <Section title="12. Changes">
            <p>
              We may update the Service and these Terms from time to time. When
              we make material changes to the Terms we will update the "Last
              updated" date above and, where appropriate, notify you in the app.
              Continued use after changes take effect constitutes acceptance.
            </p>
          </Section>

          <Section title="13. Governing law">
            <p>
              These Terms are governed by the laws of the jurisdiction in which
              ExitEcom operates, without regard to conflict-of-law rules.
              Disputes will be subject to the courts of that jurisdiction.
            </p>
          </Section>

          <Section title="14. Contact">
            <p>
              Questions about these Terms?{" "}
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
                to="/data-deletion"
                className="text-[var(--accent)] hover:underline"
              >
                Data Deletion Instructions
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
