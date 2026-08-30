export const metadata = {
  title: "Privacy Policy | Career Command Center",
  description: "How Career Command Center handles your data.",
};

export default function PrivacyPage() {
  return (
    <div className="bg-[#F7F9FB] min-h-screen">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-[36px] font-semibold text-primary leading-tight tracking-[-0.02em] mb-4">
          Privacy Policy
        </h1>
        <p className="text-sm text-on-surface-variant mb-8">
          Last updated: August 2026
        </p>

        <div className="bg-white rounded-xl border border-outline-variant p-8 space-y-6 text-sm text-on-surface leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-primary mb-3">
              Your Privacy Matters
            </h2>
            <p>
              Career Command Center is committed to protecting your personal
              information. This policy explains what data we collect, how we use
              it, and your rights regarding your information.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-primary mb-3">
              Data We Collect
            </h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>Account information (email address, name)</li>
              <li>Career data you upload (resumes, work history, skills)</li>
              <li>Job descriptions you submit for tailoring</li>
              <li>Application tracking data you enter</li>
              <li>Usage analytics to improve our service</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-primary mb-3">
              How We Use Your Data
            </h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>Generate AI-tailored resumes based on your career history</li>
              <li>Provide ATS optimization and scoring</li>
              <li>Track your job applications</li>
              <li>Operate, secure, and evaluate the service</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-primary mb-3">
              Data Security
            </h2>
            <p>
              The application uses managed hosting, database, email, analytics,
              and AI providers. Data may be sent to configured providers when
              needed to deliver a feature. Operational secrets stored through
              the admin configuration path are encrypted with AES-256-GCM, and
              transport security depends on the connected provider.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-primary mb-3">
              Your Rights
            </h2>
            <p>
              This repository and public deployment are a technical portfolio
              demonstration. Do not upload confidential or regulated data.
              Questions or removal requests should use the repository&apos;s
              documented security-reporting process.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
