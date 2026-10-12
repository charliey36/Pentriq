import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalLinks } from '@/components/legal-links';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Logo } from '@/components/logo';
import { ThemeToggleButton } from '@/components/theme-toggle-button';
import { Icon, type IconName } from '@/components/ui/icons';
import { toneStyle, type Tone } from '@/components/ui/tones';
import { ProductPreview } from '@/components/marketing/product-preview';

export const metadata: Metadata = {
  alternates: { canonical: '/' },
};

const features: { title: string; description: string; icon: IconName; tone: Tone }[] = [
  {
    title: 'Automatic review requests',
    description:
      'A three-step email sequence \u2014 request, day-3 reminder, day-7 final reminder \u2014 that stops the moment a customer clicks or responds.',
    icon: 'mail',
    tone: 'sky',
  },
  {
    title: 'Private feedback, always offered',
    description:
      'Every request includes the public review link and a private feedback option, for everyone. Never gated by sentiment.',
    icon: 'shield',
    tone: 'emerald',
  },
  {
    title: 'Rebooking reminders',
    description:
      'Know when each customer is due back based on the service they booked, and nudge them to book again automatically.',
    icon: 'calendar',
    tone: 'violet',
  },
  {
    title: 'Loyalty and referrals',
    description:
      'Reward visits, reviews and referrals with points. Generate referral codes and see who brings in new customers.',
    icon: 'gift',
    tone: 'amber',
  },
  {
    title: 'Dynamic segments',
    description:
      'Build live segments like \u201c60+ days since last visit and £200+ lifetime value\u201d that never go stale.',
    icon: 'funnel',
    tone: 'rose',
  },
  {
    title: 'Analytics you can explain',
    description:
      'Click-through rate, 30-day rebooking rate, revenue from reminders, and a customer health score based on recency, frequency and spend.',
    icon: 'chart',
    tone: 'teal',
  },
];

const steps: { title: string; description: string; icon: IconName; tone: Tone }[] = [
  {
    title: 'Add your customers',
    description: 'One at a time after a visit, or import your existing list from a CSV in seconds.',
    icon: 'users',
    tone: 'emerald',
  },
  {
    title: 'Pentriq follows up',
    description:
      'Emails go out after the delay you choose, with reminders and automatic retries. No manual chasing.',
    icon: 'bolt',
    tone: 'sky',
  },
  {
    title: 'Watch it add up',
    description: 'Track clicks, rebookings and loyalty from one dashboard, and act on what you see.',
    icon: 'chart',
    tone: 'violet',
  },
];

const compliance = [
  {
    title: 'No review gating',
    description:
      'Every customer sees the public review link and the private option, regardless of how they might rate you (FTC 16 CFR Part 465 and Google policy).',
  },
  {
    title: 'Unsubscribe in every email',
    description:
      'Opt-outs stop all future sends and cancel anything already scheduled, keeping you on the right side of CAN-SPAM.',
  },
  {
    title: 'Retries, not silent failures',
    description:
      'Failed sends are retried with exponential backoff up to five times, and anything that still fails is surfaced on your dashboard.',
  },
];

const heroGradient = 'linear-gradient(135deg, #064e3b 0%, #065f46 28%, #0f766e 66%, #0e7490 100%)';

function SectionHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description?: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="eyebrow text-brand-700 dark:text-brand-400">{eyebrow}</p>
      <h2 className="mt-3 text-balance text-3xl font-semibold tracking-[-0.035em] text-ink sm:text-[42px] sm:leading-[1.1]">
        {title}
      </h2>
      {description && <p className="mt-4 text-pretty text-base leading-7 text-ink-3">{description}</p>}
    </div>
  );
}

export default async function HomePage() {
  const supabase = createClient();
  const { data } = await supabase.auth.getUser();

  if (data.user) {
    redirect('/dashboard');
  }

  return (
    <div className="min-h-screen overflow-x-clip">
      <header className="glass sticky top-0 z-30 border-b border-line/80">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" aria-label="Pentriq home" className="rounded-md">
            <Logo />
          </Link>

          <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
            {[
              ['Features', '#features'],
              ['How it works', '#how-it-works'],
              ['Compliance', '#compliance'],
              ['Blog', '/blog'],
            ].map(([label, href]) => (
              <a
                key={href}
                href={href}
                className="rounded-lg px-3 py-2 text-sm font-medium text-ink-3 transition-colors hover:bg-surface-muted/70 hover:text-ink"
              >
                {label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-1.5">
            <ThemeToggleButton />
            <Link href="/login" className="btn btn-ghost btn-sm">
              Log in
            </Link>
            <Link href="/signup" className="btn btn-primary btn-sm">
              Get started
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative isolate overflow-hidden">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
            <div className="absolute left-1/2 top-[-140px] h-[520px] w-[900px] -translate-x-1/2 animate-float-slow rounded-full bg-emerald-400/30 blur-[110px] dark:bg-emerald-500/25" />
            <div className="absolute right-[4%] top-8 h-[340px] w-[340px] animate-float-slower rounded-full bg-sky-400/25 blur-[100px] dark:bg-sky-500/20" />
            <div className="absolute left-[3%] top-28 h-[300px] w-[300px] animate-float-slow rounded-full bg-violet-400/25 blur-[100px] dark:bg-violet-500/20" />
            <div className="bg-grid absolute inset-0 [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,black_15%,transparent_75%)]" />
          </div>

          <div className="relative mx-auto max-w-6xl px-4 pb-8 pt-16 text-center sm:px-6 sm:pt-24 lg:px-8">
            <p className="mx-auto inline-flex animate-fade-in-up items-center gap-2.5 rounded-full border border-line bg-surface/80 px-4 py-1.5 text-xs font-medium text-ink-2 shadow-sm backdrop-blur">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-500" />
              </span>
              AI-powered reputation management
            </p>

            <h1 className="mx-auto mt-7 max-w-4xl animate-fade-in-up text-balance text-[42px] font-semibold leading-[1.04] tracking-[-0.045em] text-ink [animation-delay:60ms] sm:text-6xl lg:text-[76px]">
              Turn happy customers into{' '}
              <span className="bg-gradient-to-r from-emerald-600 via-teal-500 to-sky-500 bg-clip-text text-transparent dark:from-emerald-300 dark:via-teal-300 dark:to-sky-300">
                reviews, repeat visits and referrals
              </span>
            </h1>

            <p className="mx-auto mt-6 max-w-2xl animate-fade-in-up text-pretty text-base leading-7 text-ink-3 [animation-delay:120ms] sm:text-lg sm:leading-8">
              Pentriq is an AI-powered reputation management platform that helps you collect, monitor,
              analyse and improve customer reviews &mdash; and brings customers back for their next
              visit &mdash; so your reputation and repeat revenue grow without the manual follow-up.
            </p>

            <div className="mt-9 flex animate-fade-in-up flex-wrap items-center justify-center gap-3 [animation-delay:180ms]">
              <Link href="/signup" className="btn btn-primary btn-lg">
                Get started
                <Icon name="arrowRight" className="h-4 w-4" strokeWidth={2} />
              </Link>
              <a href="#how-it-works" className="btn btn-secondary btn-lg">
                See how it works
              </a>
            </div>

            <ul className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[13px] text-ink-3">
              {[
                'Private feedback on every request',
                'Unsubscribe link in every email',
                'Set up in minutes',
              ].map((item) => (
                <li key={item} className="inline-flex items-center gap-1.5">
                  <Icon name="check" className="h-3.5 w-3.5 text-brand-600 dark:text-brand-400" strokeWidth={2.6} />
                  {item}
                </li>
              ))}
            </ul>

            <div className="relative mx-auto mt-16 max-w-5xl animate-fade-in-up [animation-delay:240ms]">
              <div
                aria-hidden="true"
                className="absolute -inset-x-6 -top-8 bottom-6 -z-10 rounded-[3rem] bg-gradient-to-b from-emerald-400/35 via-teal-400/10 to-transparent blur-3xl dark:from-emerald-500/25"
              />

              {/* Floating notification chips: part of the illustration, not real events. */}
              <div className="pointer-events-none absolute -left-6 top-28 z-10 hidden animate-float-slow lg:block">
                <div className="glass flex items-center gap-3 rounded-2xl border border-line px-4 py-3 text-left shadow-pop">
                  <span style={toneStyle('sky')} className="tone-tile flex h-9 w-9 items-center justify-center rounded-xl">
                    <Icon name="mail" className="h-[18px] w-[18px]" />
                  </span>
                  <span>
                    <span className="block text-[13px] font-semibold text-ink">Review request sent</span>
                    <span className="block text-xs text-ink-3">Maya Patel &middot; just now</span>
                  </span>
                </div>
              </div>
              <div className="pointer-events-none absolute -right-6 top-60 z-10 hidden animate-float-slower lg:block">
                <div className="glass flex items-center gap-3 rounded-2xl border border-line px-4 py-3 text-left shadow-pop">
                  <span style={toneStyle('rose')} className="tone-tile flex h-9 w-9 items-center justify-center rounded-xl">
                    <Icon name="chat" className="h-[18px] w-[18px]" />
                  </span>
                  <span>
                    <span className="block text-[13px] font-semibold text-ink">New private feedback</span>
                    <span className="block text-xs text-ink-3">4 stars &middot; ready to reply</span>
                  </span>
                </div>
              </div>

              <div className="rounded-[22px] bg-gradient-to-b from-white/70 via-white/25 to-white/5 p-px shadow-float dark:from-white/25 dark:via-white/10 dark:to-white/5">
                <div className="[mask-image:linear-gradient(to_bottom,black_82%,transparent)]">
                  <ProductPreview className="rounded-[21px] border-0" />
                </div>
              </div>
              <p className="mt-4 text-xs text-ink-4">Illustrative dashboard with sample data.</p>
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="scroll-mt-20 py-20 sm:py-28">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <SectionHeading
              eyebrow="Features"
              title="Everything you need to earn and keep happy customers"
              description="One platform for the follow-up that most service businesses never have time to do."
            />

            <ul className="mt-14 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((feature) => (
                <li
                  key={feature.title}
                  style={toneStyle(feature.tone)}
                  className="card-interactive spotlight tone-wash group overflow-hidden p-6"
                >
                  <span className="tone-tile flex h-12 w-12 items-center justify-center rounded-2xl transition-transform duration-300 ease-out-expo group-hover:-rotate-3 group-hover:scale-110">
                    <Icon name={feature.icon} className="h-6 w-6" strokeWidth={1.6} />
                  </span>
                  <h3 className="mt-6 text-[17px] font-semibold tracking-[-0.02em] text-ink">{feature.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-ink-3">{feature.description}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="scroll-mt-20 border-y border-line bg-surface/70 py-20 backdrop-blur sm:py-28">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <SectionHeading eyebrow="How it works" title="Up and running in three steps" />

            <ol className="mt-14 grid grid-cols-1 gap-5 md:grid-cols-3">
              {steps.map((step, index) => (
                <li key={step.title} style={toneStyle(step.tone)} className="card tone-wash relative overflow-hidden p-6">
                  <div className="flex items-center justify-between">
                    <span className="tone-tile flex h-11 w-11 items-center justify-center rounded-xl">
                      <Icon name={step.icon} className="h-5 w-5" strokeWidth={1.7} />
                    </span>
                    <span className="text-5xl font-semibold leading-none tracking-[-0.05em] text-ink/[0.07] dark:text-white/[0.08]">
                      0{index + 1}
                    </span>
                  </div>
                  <h3 className="mt-6 text-lg font-semibold tracking-[-0.02em] text-ink">{step.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-ink-3">{step.description}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Compliance / trust */}
        <section id="compliance" className="scroll-mt-20 px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
          <div className="relative isolate mx-auto max-w-6xl overflow-hidden rounded-3xl bg-brand-950 px-6 py-14 shadow-hero sm:px-12 sm:py-16">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_80%_at_85%_0%,rgba(52,211,153,0.32),transparent_65%),radial-gradient(40%_60%_at_0%_100%,rgba(20,184,166,0.28),transparent_70%)]"
            />
            <div className="relative grid gap-12 lg:grid-cols-5">
              <div className="lg:col-span-2">
                <span className="tone-tile flex h-12 w-12 items-center justify-center rounded-2xl">
                  <Icon name="shield" className="h-6 w-6" strokeWidth={1.6} />
                </span>
                <h2 className="mt-6 text-balance text-3xl font-semibold tracking-[-0.035em] text-white sm:text-4xl">
                  Built to keep you on the right side of the rules
                </h2>
                <p className="mt-4 text-pretty text-base leading-7 text-brand-100/80">
                  Fake or gated reviews put your reputation at risk. Pentriq enforces compliant behavior in
                  the product itself, not just in a policy page.
                </p>
              </div>

              <ul className="space-y-6 lg:col-span-3">
                {compliance.map((item) => (
                  <li key={item.title} className="flex gap-4">
                    <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-brand-400/20 text-brand-200 ring-1 ring-inset ring-brand-300/30">
                      <Icon name="check" className="h-3.5 w-3.5" strokeWidth={2.6} />
                    </span>
                    <div>
                      <h3 className="text-[15px] font-semibold text-white">{item.title}</h3>
                      <p className="mt-1 text-sm leading-6 text-brand-100/70">{item.description}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="px-4 pb-20 sm:px-6 sm:pb-28 lg:px-8">
          <div
            className="relative isolate mx-auto max-w-5xl overflow-hidden rounded-3xl px-6 py-16 text-center shadow-hero sm:px-12"
            style={{ backgroundImage: heroGradient }}
          >
            <div aria-hidden="true" className="absolute -right-20 -top-24 -z-10 h-80 w-80 animate-float-slow rounded-full bg-emerald-300/30 blur-3xl" />
            <div aria-hidden="true" className="absolute -bottom-32 left-1/4 -z-10 h-72 w-72 animate-float-slower rounded-full bg-cyan-300/25 blur-3xl" />
            <div
              aria-hidden="true"
              className="absolute inset-0 -z-10 opacity-[0.14] [background-image:linear-gradient(to_right,white_1px,transparent_1px),linear-gradient(to_bottom,white_1px,transparent_1px)] [background-size:44px_44px] [mask-image:radial-gradient(ellipse_at_center,black_5%,transparent_70%)]"
            />
            <h2 className="mx-auto max-w-2xl text-balance text-3xl font-semibold tracking-[-0.035em] text-white sm:text-[42px] sm:leading-[1.1]">
              Ready to put your follow-up on autopilot?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-pretty text-base leading-7 text-emerald-50/80">
              Create your account, add your Google review link, and add your first customer. Pentriq
              takes it from there.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/signup"
                className="inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-[15px] font-semibold text-brand-800 shadow-[0_14px_28px_-10px_rgb(0_0_0/0.5)] transition duration-200 hover:-translate-y-px hover:bg-brand-50"
              >
                Get started
                <Icon name="arrowRight" className="h-4 w-4" strokeWidth={2} />
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center gap-2 rounded-xl border border-white/25 bg-white/10 px-6 py-3 text-[15px] font-medium text-white backdrop-blur transition duration-200 hover:-translate-y-px hover:bg-white/20"
              >
                Log in
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line bg-surface/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row sm:px-6 lg:px-8">
          <Logo />
          <p className="text-[13px] text-ink-3">&copy; {new Date().getFullYear()} Pentriq. All rights reserved.</p>
          <nav aria-label="Footer" className="flex items-center gap-5 text-[13px] font-medium text-ink-3">
            <Link href="/login" className="transition-colors hover:text-ink">
              Log in
            </Link>
            <Link href="/signup" className="transition-colors hover:text-ink">
              Sign up
            </Link>
          </nav>
          <LegalLinks />
        </div>
      </footer>
    </div>
  );
}
