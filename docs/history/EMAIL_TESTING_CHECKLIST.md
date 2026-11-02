> **Note:** the email diagnostics panel and the "Email Configuration Test" send (`/api/send-test-email`, `/api/email-diagnostics`) described in this document have been removed from the app. Sandbox-error translation remains.

# Email Delivery System - Testing Checklist

## ✅ Pre-Testing Setup

- [ ] All code built successfully (`npm run build` exits with 0)
- [ ] No TypeScript errors in build output
- [ ] `.env.local` has required variables:
  - RESEND_API_KEY
  - EMAIL_FROM (set to `onboarding@resend.dev` or your domain)
  - ADMIN_EMAIL (set to your email)
  - NEXT_PUBLIC_APP_URL
- [ ] App starts without crashing
- [ ] Logged in as admin user (email matches ADMIN_EMAIL)

---

## 📋 Test 1: Startup Diagnostics

**What to Check:** Email configuration logged at startup

**Steps:**
1. Start the application: `npm run dev`
2. Check terminal/console output
3. Look for lines starting with `[App Startup]`

**Expected Output:**
```
[App Startup] ✅ Email Provider: Resend
   Status: Connected
   Mode: 🧪 Sandbox
   Sender: onboarding@resend.dev
   Sandbox Recipient: charlieyoults123@gmail.com
```

**Test Result:**
- [ ] See email diagnostics logged
- [ ] Shows "Connected" (not "Disconnected")
- [ ] Shows correct sender address
- [ ] Shows correct mode (Sandbox or Production)

**If Failed:**
- [ ] Check RESEND_API_KEY in .env.local
- [ ] Check ADMIN_EMAIL matches your email
- [ ] Restart app
- [ ] Check console for error messages

---

## 📋 Test 2: Settings Page Navigation

**What to Check:** Email tab appears in settings

**Steps:**
1. Navigate to `/settings`
2. Look for navigation tabs

**Expected Output:**
- Tabs visible: General | Services | Loyalty program | Email | Billing

**Test Result:**
- [ ] "Email" tab appears in settings navigation
- [ ] Can click "Email" tab
- [ ] Page loads without errors
- [ ] URL changes to `/settings/email`

**If Failed:**
- [ ] Hard refresh page (Ctrl+Shift+R)
- [ ] Check browser console for JavaScript errors
- [ ] Verify SettingsTabs component updated

---

## 📋 Test 3: Email Diagnostics Panel Load

**What to Check:** Diagnostics panel displays on email settings page

**Steps:**
1. Go to Settings → Email
2. Wait for diagnostics to load

**Expected Output:**
Panel shows:
- Email Provider Status: ✅ Connected
- Mode: 🧪 Sandbox (Testing)
- Sender Address: onboarding@resend.dev
- Sandbox warning box (if in sandbox mode)
- "Send Test Email" button

**Test Result:**
- [ ] Diagnostics load within 2 seconds
- [ ] Status shows Connected/Disconnected
- [ ] Mode shows Sandbox or Production
- [ ] Sender address displays
- [ ] Sandbox warning shows if applicable
- [ ] Button is enabled/disabled appropriately

**If Failed:**
- [ ] Check browser console for fetch errors
- [ ] Verify `/api/email-diagnostics` endpoint is accessible
- [ ] Check admin permission (must be ADMIN_EMAIL)
- [ ] Look for error message in panel

---

## 📋 Test 4: Send Test Email

**What to Check:** Test email endpoint works and sends email

**Steps:**
1. On Settings → Email page
2. Click "Send Test Email" button
3. Wait for success message
4. Check your email (ADMIN_EMAIL address)

**Expected Output:**
- Button shows "Sending..." state
- Success message appears: "Test email sent to your@email.com"
- Email arrives in inbox within 30 seconds
- Email subject: "Pentriq Email Configuration Test"

**Email Content Should Include:**
- "Pentriq Email Configuration Test" heading
- Sender address (onboarding@resend.dev or your domain)
- Recipient address (your@email.com)
- Timestamp
- App URL

**Test Result:**
- [ ] Button disabled during send
- [ ] Success message displays
- [ ] Email arrives
- [ ] Email contains correct information
- [ ] From address shows "Pentriq Test" label

**If Failed:**
- [ ] Check ADMIN_EMAIL in .env.local
- [ ] Check RESEND_API_KEY is valid
- [ ] Check browser console for JavaScript errors
- [ ] Check server console for `[Test Email]` log messages
- [ ] Check spam folder for test email
- [ ] Verify Resend account is in sandbox mode with correct allowed recipient

---

## 📋 Test 5: CSV Import & Send Review

**What to Check:** Sandbox restrictions work correctly

**Steps:**
1. Create test CSV with customer not matching admin email:
   ```
   name,email
   Test Customer,test@example.com
   ```
2. Go to Customers → Import CSV
3. Upload file
4. On imported customer, click "Send Now"

**Expected Output:**
- Error message appears with clear explanation
- Database logs human-readable error message
- Error message contains: "Email blocked by Resend Sandbox Mode"
- Error message specifies the allowed email address

**Test Result:**
- [ ] Send fails (expected in sandbox)
- [ ] Error is human-readable (not generic "Failed")
- [ ] Error explains sandbox limitation
- [ ] Error suggests domain verification

**If Failed:**
- [ ] Email might have been sent if matching admin email
- [ ] Try different customer email
- [ ] Check `messages.last_error` in database
- [ ] Verify sandbox mode is active

---

## 📋 Test 6: Database Error Storage

**What to Check:** Human-readable errors stored in database

**Steps:**
1. Do the CSV import and send failure (Test 5)
2. Open database viewer or query:
   ```sql
   SELECT id, status, last_error FROM messages 
   ORDER BY created_at DESC LIMIT 1;
   ```

**Expected Output:**
```
id          | status | last_error
msg_123     | queued | Email blocked by Resend Sandbox Mode. Only 
            |        | charlieyoults123@gmail.com can receive test emails...
```

**Test Result:**
- [ ] `status` is "queued" (not failed permanently)
- [ ] `last_error` contains human-readable message
- [ ] Error is not generic or technical

**If Failed:**
- [ ] Check message status value
- [ ] Verify error message field is populated
- [ ] Check server console for send failure logs

---

## 📋 Test 7: Sandbox Error Message Transform

**What to Check:** Resend errors are properly transformed

**Server Console Should Show:**
```
[Send Review] ❌ Send failed: Email blocked by Resend Sandbox Mode...
```

**Database Should Show:**
Human-readable error, NOT raw Resend error like:
```
You can only send testing emails to your own email address...
```

**Test Result:**
- [ ] Server logs show human-readable error
- [ ] Database shows human-readable error
- [ ] Not showing raw provider error
- [ ] Error includes helpful next steps

**If Failed:**
- [ ] Check transformResendError() is being called
- [ ] Check imports in messaging.ts
- [ ] Look for parsing errors in email-sandbox.ts

---

## 📋 Test 8: Admin-Only Access

**What to Check:** Non-admin users cannot access email endpoints

**Steps:**
1. Create non-admin user account (different email)
2. Log in as non-admin
3. Try to access `/settings/email`

**Expected Output:**
- Non-admin can see Settings page
- Non-admin redirected or cannot access Email tab
- API endpoints return 401 Unauthorized

**Test Result:**
- [ ] Non-admin cannot view email settings
- [ ] API endpoints reject non-admin requests
- [ ] Proper authorization checks in place

**If Failed:**
- [ ] Check admin check in isAdminEmail()
- [ ] Verify ADMIN_EMAIL environment variable
- [ ] Check API endpoint authorization

---

## 📋 Test 9: Production Mode (If Domain Verified)

**What to Check:** System correctly detects production mode

**Setup:**
- Verify domain in Resend account
- Update EMAIL_FROM to your domain email
- Restart app

**Expected Output:**
Console shows:
```
[App Startup] ✅ Email Provider: Resend
   Status: Connected
   Mode: 🚀 Production
   Sender: noreply@yourdomain.com
   Verified Domain: yourdomain.com
```

Settings page shows:
- Mode: 🚀 Production
- Verified Domain: yourdomain.com
- No sandbox warning

**Test Result:**
- [ ] Console shows Production mode
- [ ] Settings page shows production status
- [ ] No sandbox restrictions on sending
- [ ] Can send to any email address

**If Failed:**
- [ ] Verify domain in Resend dashboard
- [ ] Confirm EMAIL_FROM uses verified domain
- [ ] Restart app
- [ ] Hard refresh settings page

---

## 📋 Test 10: Console Output on Successful Send

**What to Check:** Logging is comprehensive

**Steps:**
1. When admin email matches sandbox recipient:
2. Import CSV with matching email
3. Click "Send Now"

**Expected Output in Console:**
```
[Send Review] Starting send for message: msg_xyz
[Send Review] Message found, customer_id: cust_abc, status: queued
[Send Review] Customer found: charlieyoults123@gmail.com, Business: My Business
[Send Review] Rendering message for channel: email
[Send Review] Message rendered, subject: "Your review request"
[Send Review] Sending via Resend to: charlieyoults123@gmail.com
[Email Send] Preparing to send email to charlieyoults123@gmail.com
[Email Send] From: My Business via Pentriq <onboarding@resend.dev>
[Email Send] Subject: Your review request
[Email Send] ✅ Email sent successfully to charlieyoults123@gmail.com
[Send Review] Resend accepted email, updating message status to sent
[Send Review] Message status updated to sent: msg_xyz
[Send Review] Advancing journey enrollment: ...
[Send Review] ✅ Send complete: msg_xyz
```

**Test Result:**
- [ ] All steps logged with [Send Review] prefix
- [ ] Email send steps logged with [Email Send] prefix
- [ ] Success indicators (✅) visible
- [ ] Logs are in chronological order
- [ ] Final success message shows

**If Failed:**
- [ ] Check review-queue.ts logging statements
- [ ] Check messaging.ts logging statements
- [ ] Verify console.log calls are not commented out

---

## 📊 Summary & Sign-Off

### Test Results

| Test | Status | Notes |
|------|--------|-------|
| 1. Startup Diagnostics | [ ] Pass [ ] Fail | |
| 2. Settings Navigation | [ ] Pass [ ] Fail | |
| 3. Diagnostics Panel | [ ] Pass [ ] Fail | |
| 4. Test Email | [ ] Pass [ ] Fail | |
| 5. CSV Send (Sandbox) | [ ] Pass [ ] Fail | |
| 6. Database Errors | [ ] Pass [ ] Fail | |
| 7. Error Transform | [ ] Pass [ ] Fail | |
| 8. Admin-Only Access | [ ] Pass [ ] Fail | |
| 9. Production Mode | [ ] Pass [ ] Fail | [Optional if domain verified] |
| 10. Console Logging | [ ] Pass [ ] Fail | |

### Overall Status

- [ ] All tests passed ✅ Ready for deployment
- [ ] Some tests failed - See notes below

### Failed Tests - Troubleshooting Notes

```
[Document any failures and troubleshooting steps taken]




```

### Sign-Off

- [ ] Tested by: ________________
- [ ] Date: ________________
- [ ] Environment: ________________ (localhost / staging / production)
- [ ] Notes: ________________

---

## 🆘 Support

If tests fail:

1. **Check logs first:**
   - Server console for `[Send Review]` and `[Email Send]` messages
   - Browser console (F12) for JavaScript errors
   - Database for `messages.last_error` values

2. **Verify environment:**
   - All .env.local variables set
   - RESEND_API_KEY is valid
   - ADMIN_EMAIL matches your email

3. **Try common fixes:**
   - Restart app: Stop dev server, run `npm run dev` again
   - Hard refresh browser: Ctrl+Shift+R (not just Ctrl+R)
   - Clear cache: `rm -rf .next`

4. **Check recent changes:**
   - Review modified files in this session
   - Look for any import errors
   - Verify TypeScript compilation

5. **Still stuck?**
   - Check EMAIL_DELIVERY_IMPROVEMENT.md for architecture details
   - Review error messages in database (most detailed)
   - Look at server logs for exact failure point
