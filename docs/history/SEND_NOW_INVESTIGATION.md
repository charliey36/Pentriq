# Send Now Review Request Pipeline - Investigation & Fixes

## Complete Send Flow (Traced)

### 1. UI Layer: Send Now Button
**File:** `src/app/(app)/customers/review-row-actions.tsx`  
**Location:** Line 17, 19, 36  
**Action:** Calls `sendReviewNow(messageId)`

```typescript
onClick={() => start(async () => setError((await sendReviewNow(messageId)).message.includes('failed') ? 'Failed' : ''))}
```

### 2. Server Action: sendReviewNow
**File:** `src/app/(app)/customers/actions.ts`  
**Location:** Line 56-78  
**Purpose:** Gets message ID(s) and calls `sendQueuedReview()` for each

```typescript
export async function sendReviewNow(messageId?: string): Promise<ReviewActionResult> {
  // If messageId provided: send that one
  // Else: send next batch of queued messages (up to 25)
  for (const id of ids) {
    const res = await sendQueuedReview(supabase, business.id, id);
    if (res.ok) sent += 1;
    else errors.push(res.error ?? 'error');
  }
}
```

### 3. Core Send Function: sendQueuedReview
**File:** `src/lib/review-queue.ts`  
**Location:** Line 13-50  
**Flow:**
1. Load message from database
2. Load customer & business details
3. Check if customer unsubscribed
4. Render email template
5. Call `sendMessage()` to send via email provider
6. Update message status to 'sent'
7. Advance journey enrollment if applicable

### 4. Messaging Abstraction: sendMessage
**File:** `src/lib/messaging.ts`  
**Location:** Routes to channel-specific send function  
**For email:** Calls `sendEmail()`

### 5. Email Provider: Resend
**File:** `src/lib/messaging.ts`  
**Location:** Line 39-58 (`sendEmail` function)  
**Flow:**
1. Validates email address provided
2. Gets Resend client (from RESEND_API_KEY)
3. Calls `resend.emails.send()`
4. Handles response and throws error if failed

---

## Comprehensive Logging Added

### review-queue.ts Logging

```
[Send Review] Starting send for message: {messageId}
[Send Review] Message found, customer_id: {id}, status: {status}
[Send Review] Customer found: {email}, Business: {name}
[Send Review] Rendering message for channel: email
[Send Review] Message rendered, subject: "{subject}"
[Send Review] Sending via Resend to: {email}
[Send Review] Resend accepted email, updating message status to sent
[Send Review] Message status updated to sent: {messageId}
[Send Review] Advancing journey enrollment: {enrollmentId}
[Send Review] ✅ Send complete: {messageId}
[Send Review] ❌ Send failed: {error}
```

### messaging.ts Logging

```
[Email Send] Preparing to send email to {email}
[Email Send] From: {label} <{from}>
[Email Send] Subject: {subject}
[Email Send] ✅ Email sent successfully to {email}
[Email Send] ❌ Resend error: {error}
```

---

## Configuration Validation Checklist

### Required Environment Variables
- ✅ `RESEND_API_KEY` - Must be set for email sending to work
- ✅ `EMAIL_FROM` - Sender address (defaults to `onboarding@resend.dev` if not set)
- ✅ `NEXT_PUBLIC_APP_URL` - Used for tracking/feedback/unsubscribe links

### Database Requirements
- ✅ `messages` table with columns: id, customer_id, business_id, status, sent_at, last_error, journey_enrollment_id
- ✅ `customers` table with columns: id, email, name, unsubscribed_at
- ✅ `businesses` table with columns: id, name, google_review_url

### Resend Configuration
- ✅ API key validated on first call to `getResendClient()`
- ✅ Sender address must be verified in Resend dashboard or use `onboarding@resend.dev` (sandbox)
- ✅ Error handling: Catches and logs provider errors

---

## Files Modified

1. **src/lib/review-queue.ts**
   - Added step-by-step logging for message lookup, customer load, rendering, and sending
   - Logs customer ID, business name, email address, and send status
   - Logs journey advancement

2. **src/lib/messaging.ts**
   - Added Resend call logging showing from address, to address, and subject
   - Logs success and provider errors with full error details

---

## Testing the Send Flow

After restart, when you click "Send Now":

1. Check server console logs for the `[Send Review]` and `[Email Send]` prefixed lines
2. They will show exactly where the process fails (if it does)
3. The error will include the actual provider error code and message
4. Message status and error reason stored in database's `last_error` field

---

## Next Steps

1. **Restart the application** - Logging changes require app reload
2. **Import a customer** - Create a review request
3. **Click Send Now** - Trigger the send flow
4. **Check server logs** - Look for [Send Review] and [Email Send] messages
5. **Verify database** - Check that messages.status and messages.last_error are updated

The comprehensive logging will make it clear exactly where any failure occurs.

