> **Note:** the email diagnostics panel and the "Email Configuration Test" send (`/api/send-test-email`, `/api/email-diagnostics`) described in this document have been removed from the app. Sandbox-error translation remains.

# Quick Start: Email Diagnostics & Sandbox Detection

## 🚀 What You Can Do Now

### 1. View Email Configuration
- Go to **Settings → Email Configuration**
- See real-time status of your Resend connection
- Check if you're in sandbox or production mode
- View your current sender address

### 2. Send Test Email
- Click **"Send Test Email"** button in email settings
- Verify the entire email pipeline works
- Receive test email with configuration details
- Confirm sender address and formatting

### 3. See Sandbox Warnings
When sending emails in sandbox mode fails, users see:

**Before:**
```
Failed
```

**After:**
```
Email blocked by Resend Sandbox Mode. Only charlieyoults123@gmail.com can receive 
test emails until a sending domain is verified. Visit resend.com/domains to add 
a custom domain.
```

### 4. Monitor in Logs
When the app starts, check the server console:

```
[App Startup] ✅ Email Provider: Resend
   Status: Connected
   Mode: 🧪 Sandbox
   Sender: onboarding@resend.dev
   Sandbox Recipient: charlieyoults123@gmail.com
```

## 🔧 Current Setup

- **Mode:** Sandbox (testing only)
- **Allowed Recipient:** charlieyoults123@gmail.com (your email)
- **Sender:** onboarding@resend.dev (Resend's shared test domain)
- **Status:** ✅ Connected and working

## 📋 Common Scenarios

### Scenario 1: Testing Review Requests
Current Status: ✅ Works in sandbox mode
- Import CSV with customers
- Click "Send Now" on a review request
- **Will fail** if customer email ≠ charlieyoults123@gmail.com
- See human-readable error explaining sandbox limitation

### Scenario 2: Switching to Production
When ready to send to real customers:

1. Visit [resend.com/domains](https://resend.com/domains)
2. Add and verify your domain (e.g., `mail@yourcompany.com`)
3. Update your `.env.local`:
   ```bash
   EMAIL_FROM=noreply@yourcompany.com
   ```
4. Restart Pentriq
5. Try sending again - now works with all customer emails

### Scenario 3: Checking Email Delivery
- Open **Settings → Email Configuration**
- Check "Email Provider Status" section
- Status shows: ✅ Connected / ❌ Disconnected
- Mode shows: 🧪 Sandbox / 🚀 Production
- Sender shows: Current EMAIL_FROM value

## 📊 API Endpoints (Admin Only)

### GET /api/email-diagnostics
Returns current email configuration:
```json
{
  "connected": true,
  "mode": "sandbox",
  "senderAddress": "onboarding@resend.dev",
  "allowedRecipient": "charlieyoults123@gmail.com",
  "verifiedDomain": null
}
```

### POST /api/send-test-email
Sends test email to admin:
```json
{
  "success": true,
  "message": "Test email sent to charlieyoults123@gmail.com"
}
```

## 🛠️ Environment Variables

Required:
```bash
RESEND_API_KEY=re_xxxxxxxxxxxxx
EMAIL_FROM=onboarding@resend.dev  # or your domain
ADMIN_EMAIL=charlieyoults123@gmail.com
```

## ❓ Troubleshooting

### Email sends but dashboard shows "Failed"
- Check the `messages.last_error` field in database
- If sandbox error, customer email must match `charlieyoults123@gmail.com`
- Verify RESEND_API_KEY is set correctly

### "Missing RESEND_API_KEY" error
- Check `.env.local` has `RESEND_API_KEY`
- Restart the app
- Check server logs for configuration status

### Test email button is disabled
- Email provider is disconnected
- Check `.env.local` - RESEND_API_KEY may be invalid
- Check server logs for detailed error

### Seeing old sandbox warnings after domain verified
- Cache issue - do a hard page refresh (Ctrl+Shift+R)
- Restart the app to clear cached diagnostics

## 📚 Full Documentation

See `EMAIL_DELIVERY_IMPROVEMENT.md` for:
- Detailed architecture
- Complete file list
- Testing checklist
- Future enhancements

## ✅ You're All Set!

Your email system is now:
- ✅ Configured for testing
- ✅ Diagnostics ready
- ✅ Error messages are human-readable
- ✅ One-click test email available
- ✅ Prepared for production (just need domain verification)

**Next steps when you want to go live:**
1. Add domain to Resend
2. Update EMAIL_FROM in environment
3. Restart app
4. Start sending to customers!
