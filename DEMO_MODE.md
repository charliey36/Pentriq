# Demo Mode - Polished Testing Experience

## Overview

Added demo mode to Pentriq so that when you click "Send Now" on demo/test accounts, it shows a successful send without actually hitting Resend. This makes demos look polished and professional.

## What It Does

When you click "Send Now" on any customer with a demo email (*.example.com, demo@, test@, etc.), the system:

1. ✅ Detects it's a demo account
2. ✅ Simulates sending the email (no actual network call)
3. ✅ Updates the message status to "sent"
4. ✅ Shows success to the user
5. ✅ Logs clearly to console that it was simulated

Real customers (after you add a proper domain) continue to send via Resend normally.

## Demo Email Detection

These emails are treated as demo accounts:
- `*.example.com` (seed data)
- `demo@pentriq.app` (test account)
- `*.test`, `*.invalid`, `localhost` (reserved test domains)

## Console Output

When you send to a demo account:
```
[Send Review] Demo customer detected: alice.johnson@example.com
[Send Review] Sending to demo customer: alice.johnson@example.com
[Demo Mode] Simulating email send to alice.johnson@example.com
[Demo Mode]   Subject: "Your review request"
[Demo Mode]   Message ID: msg_123
[Demo Mode]   ✅ Demo email "sent" (simulated for polished demo)
[Send Review] Demo send simulated, updating message status to sent
[Send Review] Message status updated to sent: msg_123
[Send Review] ✅ Send complete: msg_123
```

## Files Created

- `src/lib/demo-mode.ts` (68 lines)
  - `isDemoEmail()` - Detects demo email addresses
  - `isDemoCustomer()` - Detects demo customers
  - `simulateDemoEmailSend()` - Simulates successful send
  - `formatDemoSendLog()` - Logging helper

## Files Modified

- `src/lib/review-queue.ts` 
  - Imports demo mode utilities
  - Checks if customer is demo
  - Routes to simulation or real send accordingly

## How to Test

1. Import the demo CSV (run `npm run seed` if you haven't)
2. Go to Customers page
3. Find a demo customer (e.g., "Alice Johnson" with alice.johnson@example.com)
4. Click "Send Now"
5. ✅ Shows success immediately
6. Check console to see `[Demo Mode]` logs
7. Message status shows "sent" in the database

## For Your Demos

Now when you demo Pentriq:
- ✅ Click "Send Now" on any seeded customer
- ✅ Shows "sent" status immediately
- ✅ Looks polished and professional
- ✅ No "failed" errors on test data
- ✅ Journey enrollment still advances
- ✅ All UI updates work normally

When you add real customers and verify your domain in Resend:
- ✅ Real emails go through Resend normally
- ✅ Demo detection doesn't interfere
- ✅ Production-ready from day one

## Build Status

✅ Build successful
✅ TypeScript strict mode
✅ No breaking changes
✅ Zero impact on real sends

Ready for testing!
