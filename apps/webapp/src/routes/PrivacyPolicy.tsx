import { Link } from 'react-router'
import { useAuth } from '../hooks/use-auth'

function PrivacyPolicy(): React.ReactElement {
  const { user, loading } = useAuth()

  return (
    <main className="flex min-h-screen items-start justify-center bg-background px-4 py-12">
      <div className="w-full max-w-2xl space-y-8">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Privacy Policy</h1>
          {!loading && user && (
            <Link to="/settings" className="text-sm text-muted-foreground hover:underline">
              Back to settings
            </Link>
          )}
          {!loading && !user && (
            <Link to="/sign-up" className="text-sm text-muted-foreground hover:underline">
              Back to sign up
            </Link>
          )}
        </div>

        <p className="text-sm text-muted-foreground leading-relaxed">
          Last updated: March 2026
        </p>

        <p className="text-sm text-muted-foreground leading-relaxed">
          mycscompanion is a learning platform that helps developers build computer science
          fundamentals through hands-on Go programming. This policy describes how we collect,
          use, and protect your information.
        </p>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">Information We Collect</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            We collect the following information when you use mycscompanion:
          </p>
          <ul className="list-disc pl-6 text-sm text-muted-foreground space-y-1">
            <li>Account information — email address and display name, provided via Firebase Auth</li>
            <li>Background questionnaire responses — your role, experience level, and primary programming language</li>
            <li>Code submissions — Go source code you submit for evaluation</li>
            <li>Benchmark results — performance measurements from your code executions</li>
            <li>AI tutor conversations — messages exchanged with the Socratic tutor</li>
            <li>Session data — code snapshots and session summaries for progress tracking</li>
            <li>Learning progress — milestone completion status and advancement history</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">How We Use Your Information</h2>
          <ul className="list-disc pl-6 text-sm text-muted-foreground space-y-1">
            <li>Providing and operating the learning platform</li>
            <li>Tracking your progress through milestones</li>
            <li>Powering AI tutor interactions to support your learning</li>
            <li>Running performance benchmarks and displaying results</li>
            <li>Improving the service and learning experience</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">Third-Party Services</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            We use the following third-party services to operate mycscompanion:
          </p>
          <ul className="list-disc pl-6 text-sm text-muted-foreground space-y-1">
            <li>
              <strong className="text-foreground">Firebase Auth</strong> — handles authentication
              and session management. Your email and authentication credentials are processed by Firebase.
            </li>
            <li>
              <strong className="text-foreground">Anthropic API</strong> — powers the AI tutor.
              Your conversation content is sent to Anthropic to generate responses.
            </li>
            <li>
              <strong className="text-foreground">Sentry</strong> — error tracking for platform
              stability. Only platform errors are reported — your code content is never sent to Sentry.
            </li>
            <li>
              <strong className="text-foreground">Fly.io</strong> — code execution environment.
              Your Go code runs in isolated virtual machines on Fly.io infrastructure.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">Data Retention</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Your data is retained for as long as your account is active. When you delete your
            account, all associated data is permanently and immediately removed from our systems.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">Your Rights</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            You have the following rights regarding your data:
          </p>
          <ul className="list-disc pl-6 text-sm text-muted-foreground space-y-1">
            <li>
              <strong className="text-foreground">Export your data</strong> — download a complete
              JSON archive of all your data from Account Settings.
            </li>
            <li>
              <strong className="text-foreground">Delete your account</strong> — permanently and
              irreversibly delete your account and all associated data from Account Settings.
            </li>
            <li>
              <strong className="text-foreground">Access your information</strong> — view your
              profile information in Account Settings at any time.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">Data Security</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            We protect your data with the following measures:
          </p>
          <ul className="list-disc pl-6 text-sm text-muted-foreground space-y-1">
            <li>All data is transmitted over HTTPS</li>
            <li>Database queries use parameterized statements to prevent injection attacks</li>
            <li>Authentication is handled by Firebase Auth with secure token management</li>
            <li>Code execution runs in isolated environments</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">Cookies</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            mycscompanion uses essential cookies only. Firebase Auth requires a session cookie
            to keep you signed in. We do not use tracking cookies, analytics cookies, or any
            third-party advertising cookies. No cookie consent banner is needed because we only
            use cookies that are strictly necessary for the service to function.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">Changes to This Policy</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            We may update this privacy policy from time to time. Changes will be reflected on
            this page with an updated date. Continued use of mycscompanion after changes
            constitutes acceptance of the updated policy.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">Contact Us</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            If you have questions about this privacy policy or your data, please reach out
            through your Account Settings page.
          </p>
        </section>
      </div>
    </main>
  )
}

export { PrivacyPolicy }
