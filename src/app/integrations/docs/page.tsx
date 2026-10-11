import type { Metadata } from 'next';
import Link from 'next/link';
import { Logo } from '@/components/logo';
import { LegalLinks } from '@/components/legal-links';
import { getAppUrl } from '@/lib/brand';

export const metadata: Metadata = { title: 'Integration docs' };

const Code = ({ children }: { children: string }) => (
  <pre className="mt-3 overflow-x-auto rounded-lg bg-surface-muted p-4 text-xs leading-5 text-ink-2">{children}</pre>
);
const H = ({ children }: { children: string }) => <h2 className="mt-10 text-lg font-semibold text-ink">{children}</h2>;
const P = ({ children }: { children: React.ReactNode }) => <p className="mt-2 text-[15px] leading-7 text-ink-2">{children}</p>;

export default function IntegrationDocsPage() {
  const base = getAppUrl();
  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto w-full max-w-3xl px-4 py-6">
        <Link href="/" aria-label="Pentriq home"><Logo /></Link>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-16">
        <h1 className="text-3xl font-semibold tracking-tight text-ink">Send service events to Pentriq</h1>
        <P>
          When a job is completed in your booking tool, CRM or spreadsheet, send it to Pentriq. We create the
          customer if they are new (matched by email), record the service visit and update their stats. Find your
          API key in Settings → Integrations.
        </P>

        <H>Endpoint</H>
        <Code>{`POST ${base}/api/integrations/service-completed
Content-Type: application/json
x-api-key: YOUR_API_KEY`}</Code>

        <H>Request body</H>
        <Code>{`{
  "customerName": "John Smith",
  "email": "john@email.com",
  "phone": "07123456789",
  "amountSpent": 350,
  "serviceDate": "2026-10-08"
}`}</Code>
        <P>
          Required: <code>customerName</code>, <code>email</code>, <code>serviceDate</code> (YYYY-MM-DD or DD/MM/YYYY, not
          in the future). Optional: <code>phone</code>, <code>amountSpent</code> (0 or more; text like &quot;350&quot; or
          &quot;£350.00&quot; is accepted, which is what most automation tools send).
        </P>

        <H>Responses</H>
        <P>Success (200). Sending the same customer, date and amount again is safe: it returns <code>duplicate: true</code> and records nothing new.</P>
        <Code>{`{
  "success": true,
  "customerId": "…",
  "visitId": "…",
  "customerCreated": true,
  "duplicate": false
}`}</Code>
        <P>Validation error (400):</P>
        <Code>{`{
  "success": false,
  "errors": ["Email is required"]
}`}</Code>
        <P>A missing or wrong API key returns 401.</P>

        <H>Example: Google Sheets with an automation tool</H>
        <P>1. Create a Google Sheet with these columns in row 1:</P>
        <Code>{`Name | Email | Phone | AmountSpent | ServiceDate
John Smith | john@email.com | 07123456789 | 350 | 2026-10-08`}</Code>
        <P>2. In your automation tool (Zapier, Make, n8n), create a workflow triggered by <b>Google Sheets → New Spreadsheet Row</b> and pick your sheet.</P>
        <P>3. Add a <b>Webhook / HTTP POST</b> action and set:</P>
        <Code>{`URL:           ${base}/api/integrations/service-completed
Payload Type:  Json
Data:          customerName → Name
               email        → Email
               phone        → Phone
               amountSpent  → AmountSpent
               serviceDate  → ServiceDate
Headers:       x-api-key    → YOUR_API_KEY`}</Code>
        <P>4. Test the action, then add a row to your sheet. Check Settings → Integrations → Recent events to see it arrive.</P>
        <P>The same setup works for Microsoft Bookings, Jobber, ServiceM8, HubSpot and any other tool that can send a webhook: only the trigger changes.</P>
      </main>
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-6">
          <p className="text-[13px] text-ink-3">&copy; {new Date().getFullYear()} Pentriq</p>
          <LegalLinks />
        </div>
      </footer>
    </div>
  );
}
