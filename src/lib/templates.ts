import { renderSupportFooter } from '@/lib/email-templates/support-footer';
import { escapeHtml } from '@/lib/html';
import { assertCompliantReviewLinks } from '@/lib/compliance';
import type { MessageChannel } from '@/lib/messaging';
import type { Database } from '@/lib/database.types';
import { renderReviewRequestEmail } from '@/lib/email-templates/review-request';
import { APP_NAME } from '@/lib/brand';

export type MessagePurpose = Database['public']['Tables']['messages']['Row']['purpose'];

export type RenderedMessage = { subject?: string; html?: string; text: string };

type TemplateContext = {
  businessName: string;
  customerName: string;
  publicReviewUrl?: string | null;
  privateFeedbackUrl?: string;
  unsubscribeUrl?: string;
  rebookingUrl?: string;
  referralCode?: string;
  loyaltyPointsBalance?: number;
  /** The business's own contact email; shown as "Need help?" when set, hidden otherwise. */
  contactEmail?: string | null;
};

function wrapEmailHtml(bodyHtml: string, footerHtml: string): string {
  return `
    <div style="font-family: -apple-system, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; color: #0f172a;">
      ${bodyHtml}
      ${footerHtml}
    </div>
  `;
}

function unsubscribeFooterHtml(businessName: string, unsubscribeUrl?: string, contactEmail?: string | null): string {
  const safeBusinessName = escapeHtml(businessName);
  return `
    <p style="font-size: 13px; color: #64748b; margin: 24px 0 8px;">
      Sent by ${safeBusinessName} via ${APP_NAME}.
    </p>
    ${renderSupportFooter(contactEmail).html}
    ${
      unsubscribeUrl
        ? `<p style="font-size: 13px; color: #94a3b8; margin: 0;">
            <a href="${unsubscribeUrl}" style="color: #94a3b8; text-decoration: underline;">Unsubscribe</a> from future emails.
          </p>`
        : ''
    }
  `;
}

/**
 * Renders a message for a given purpose/channel. This is the one place
 * template copy lives, so businesses customizing their messaging (future
 * work) or an AI-drafting feature (see lib/ai.ts) have a single integration
 * point rather than duplicated copy per call site.
 *
 * review_request and review_reminder both render BOTH the public review
 * link (if configured) and the private feedback link — see
 * assertCompliantReviewLinks. There is no code path here that reads a
 * rating/sentiment and conditionally omits either link.
 */
export function renderMessage(
  purpose: MessagePurpose,
  channel: MessageChannel,
  ctx: TemplateContext
): RenderedMessage {
  const name = escapeHtml(ctx.customerName);
  const business = escapeHtml(ctx.businessName);

  switch (purpose) {
    case 'review_request':
    case 'review_reminder': {
      assertCompliantReviewLinks({
        publicReviewUrl: ctx.publicReviewUrl ?? null,
        privateFeedbackUrl: ctx.privateFeedbackUrl ?? '',
      });

      const isReminder = purpose === 'review_reminder';

      const intro = isReminder
        ? `Just a quick reminder — we'd still love to hear about your visit to ${business}.`
        : `Thanks for visiting ${business}. We'd love your feedback.`;

      if (channel === 'email') {
        // Branded, responsive layout lives in lib/email-templates. Both the
        // public review link (when configured) and the private feedback link
        // are passed through unconditionally.
        const email = renderReviewRequestEmail({
          variant: isReminder ? 'reminder' : 'request',
          customerName: ctx.customerName,
          businessName: ctx.businessName,
          reviewLink: ctx.publicReviewUrl,
          privateFeedbackUrl: ctx.privateFeedbackUrl,
          unsubscribeUrl: ctx.unsubscribeUrl,
          businessContact: { email: ctx.contactEmail },
        });
        return { subject: email.subject, html: email.html, text: email.text };
      }

      // SMS/WhatsApp: short, link-forward, same dual-link requirement.
      const text = `Hi ${ctx.customerName}, ${intro} ${
        ctx.publicReviewUrl ? `Review: ${ctx.publicReviewUrl} ` : ''
      }Feedback: ${ctx.privateFeedbackUrl}`;
      return { text };
    }

    case 'rebooking_reminder': {
      if (channel === 'email') {
        const email = renderReviewRequestEmail({
          variant: 'rebooking',
          customerName: ctx.customerName,
          businessName: ctx.businessName,
          rebookingLink: ctx.rebookingUrl,
          unsubscribeUrl: ctx.unsubscribeUrl,
          businessContact: { email: ctx.contactEmail },
        });
        return { subject: email.subject, html: email.html, text: email.text };
      }
      const intro = `Whenever you're ready, we'd love to see you again at ${ctx.businessName}.`;
      return { text: `Hi ${ctx.customerName}, ${intro}${ctx.rebookingUrl ? ` ${ctx.rebookingUrl}` : ''}` };
    }

    case 'win_back': {
      const intro = `We miss you! It's been a while since we've seen you at ${business} — come back and see what's new.`;
      if (channel === 'email') {
        const subject = `We miss you at ${ctx.businessName}`;
        const html = wrapEmailHtml(
          `<p style="font-size: 16px; margin: 0 0 16px;">Hi ${name},</p>
           <p style="font-size: 16px; line-height: 1.5; margin: 0 0 8px;">${intro}</p>`,
          unsubscribeFooterHtml(ctx.businessName, ctx.unsubscribeUrl, ctx.contactEmail)
        );
        return { subject, html, text: `Hi ${ctx.customerName}, ${intro}` };
      }
      return { text: `Hi ${ctx.customerName}, ${intro}` };
    }

    case 'birthday': {
      const intro = `Happy birthday from everyone at ${business}! 🎉`;
      if (channel === 'email') {
        const subject = `Happy birthday from ${ctx.businessName}!`;
        const html = wrapEmailHtml(
          `<p style="font-size: 16px; margin: 0 0 16px;">Hi ${name},</p>
           <p style="font-size: 16px; line-height: 1.5; margin: 0 0 8px;">${intro}</p>`,
          unsubscribeFooterHtml(ctx.businessName, ctx.unsubscribeUrl, ctx.contactEmail)
        );
        return { subject, html, text: `Hi ${ctx.customerName}, ${intro}` };
      }
      return { text: `Hi ${ctx.customerName}, ${intro}` };
    }

    case 'referral': {
      const intro = `Thanks for being a loyal customer of ${business}! Share your referral code and you'll both get rewarded.`;
      const codeText = ctx.referralCode ? ` Your code: ${ctx.referralCode}` : '';
      if (channel === 'email') {
        const subject = `Refer a friend to ${ctx.businessName}`;
        const html = wrapEmailHtml(
          `<p style="font-size: 16px; margin: 0 0 16px;">Hi ${name},</p>
           <p style="font-size: 16px; line-height: 1.5; margin: 0 0 8px;">${intro}${codeText}</p>`,
          unsubscribeFooterHtml(ctx.businessName, ctx.unsubscribeUrl, ctx.contactEmail)
        );
        return { subject, html, text: `Hi ${ctx.customerName}, ${intro}${codeText}` };
      }
      return { text: `Hi ${ctx.customerName}, ${intro}${codeText}` };
    }

    case 'loyalty': {
      const intro = `You now have ${ctx.loyaltyPointsBalance ?? 0} loyalty points with ${business}!`;
      if (channel === 'email') {
        const subject = `Your loyalty points at ${ctx.businessName}`;
        const html = wrapEmailHtml(
          `<p style="font-size: 16px; margin: 0 0 16px;">Hi ${name},</p>
           <p style="font-size: 16px; line-height: 1.5; margin: 0 0 8px;">${intro}</p>`,
          unsubscribeFooterHtml(ctx.businessName, ctx.unsubscribeUrl, ctx.contactEmail)
        );
        return { subject, html, text: `Hi ${ctx.customerName}, ${intro}` };
      }
      return { text: `Hi ${ctx.customerName}, ${intro}` };
    }

    default: {
      return { text: `Hi ${ctx.customerName}, message from ${ctx.businessName}.` };
    }
  }
}
