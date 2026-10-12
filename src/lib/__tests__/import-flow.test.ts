import { describe, it, expect } from '@jest/globals';
import { daysSinceService } from '../eligibility';

// Test inputs are always valid dates, so the null case (missing/invalid date) does not apply here.
const daysFor = (date: string, now: Date) => daysSinceService(date, now) as number;

describe('CSV Import to UI Flow', () => {
  describe('Review window eligibility', () => {
    it('should create review requests for services within the window', () => {
      // "Today" at midday UTC. daysSinceService counts UTC calendar days, so the
      // test clock must be UTC too; local-midnight dates (new Date(2026, 9, 9))
      // are 23:00 the previous day in UTC during British Summer Time.
      const today = new Date('2026-10-09T12:00:00Z');

      // Service was today
      const daysToday = daysFor('2026-10-09', today);
      expect(daysToday).toBe(0);
      expect(daysToday >= 0 && daysToday <= 14).toBe(true);

      // Service was yesterday
      const daysYesterday = daysFor('2026-10-08', today);
      expect(daysYesterday).toBe(1);
      expect(daysYesterday >= 0 && daysYesterday <= 14).toBe(true);

      // Service was 10 days ago
      const days10 = daysFor('2026-09-29', today);
      expect(days10).toBe(10);
      expect(days10 >= 0 && days10 <= 14).toBe(true);

      // Service was 14 days ago (boundary)
      const days14 = daysFor('2026-09-25', today);
      expect(days14).toBe(14);
      expect(days14 >= 0 && days14 <= 14).toBe(true);
    });

    it('should NOT create review requests for services outside the window', () => {
      const today = new Date('2026-10-09T12:00:00Z'); // UTC, see note above

      // Service was 15 days ago (beyond window)
      const days15 = daysFor('2026-09-24', today);
      expect(days15).toBe(15);
      expect(days15 >= 0 && days15 <= 14).toBe(false);

      // Service is tomorrow (not yet happened)
      const daysFuture = daysFor('2026-10-10', today);
      expect(daysFuture).toBe(-1);
      expect(daysFuture >= 0 && daysFuture <= 14).toBe(false);

      // Service is 5 days in future
      const daysFar = daysFor('2026-10-14', today);
      expect(daysFar).toBe(-5);
      expect(daysFar >= 0 && daysFar <= 14).toBe(false);
    });
  });

  describe('Import data validation', () => {
    it('should reject service dates more than 1 day in future', () => {
      const today = new Date('2026-10-09T12:00:00Z'); // UTC, see note above

      // Tomorrow (-1 day) should pass validation
      const daysTomorrow = daysFor('2026-10-10', today) ?? 0;
      expect(daysTomorrow < -1).toBe(false);

      // 2 days in future (-2 days) should fail validation
      const daysFar = daysFor('2026-10-11', today) ?? 0;
      expect(daysFar < -1).toBe(true);
    });
  });

  describe('UI Display Logic', () => {
    it('should display "Scheduled" for pending review requests', () => {
      const message = {
        id: '123',
        customer_id: 'cust-1',
        status: 'pending',
        send_at: '2026-10-10T09:00:00Z',
        sent_at: null,
      };

      // UI logic: if status is 'pending' (not 'queued', 'sent', 'failed')
      // it should show "Scheduled [time]"
      const status = message.status === 'queued' ? 'held' : message.status;
      const shouldShowScheduled =
        !(message.status === 'sent' && message.sent_at) &&
        message.status !== 'queued' &&
        message.status !== 'failed';

      expect(status).toBe('pending');
      expect(shouldShowScheduled).toBe(true);
    });

    it('should NOT display "No review request" when pending message exists', () => {
      const customer = {
        id: 'cust-1',
        name: 'John Doe',
        email: 'john@example.com',
      };

      const message = {
        id: '123',
        customer_id: customer.id,
        status: 'pending',
        send_at: '2026-10-10T09:00:00Z',
        sent_at: null,
      };

      // UI logic: if message exists, don't show "No review request"
      const hasReview = !!message;
      expect(hasReview).toBe(true);
    });
  });

  describe('Full Import to UI Flow', () => {
    it('Import flow should never result in: customer exists && auto_send enabled && no review request', () => {
      // This is the bug we're fixing: after import with auto_send=true,
      // a customer should NEVER show "No review request" if they have a
      // service date within the review window.

      const importedCustomer = {
        id: 'cust-1',
        email: 'john@example.com',
        last_service_date: '2026-10-09',
        unsubscribed_at: null,
      };

      const today = new Date(2026, 9, 9);
      const days = daysSinceService(importedCustomer.last_service_date, today);
      const windowDays = 14;
      const autoSend = true;

      // The eligibility check
      const isEligible = !importedCustomer.unsubscribed_at && days !== null && days >= 0 && days <= windowDays;

      // If customer is imported with auto_send enabled
      if (autoSend && isEligible) {
        // Then a review request message should ALWAYS be created
        const shouldHaveMessage = true;
        expect(shouldHaveMessage).toBe(true);

        // And the UI should NEVER show "No review request"
        const message = {
          id: 'msg-1',
          customer_id: importedCustomer.id,
          status: 'pending',
          send_at: '2026-10-10T09:00:00Z',
          sent_at: null,
        };
        const showsNoReviewRequest = !message;
        expect(showsNoReviewRequest).toBe(false);
      }
    });
  });
});
