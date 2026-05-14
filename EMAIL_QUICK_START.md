# Real Email Implementation - Quick Reference

## ✅ What's Been Completed

The `action-email` node now sends **real emails** instead of simulating them.

### Three Email Providers Available:

| Provider     | Best For                              | Setup Time | Cost                 |
| ------------ | ------------------------------------- | ---------- | -------------------- |
| **SMTP**     | Gmail, Office365, corporate email     | 5 mins     | Free                 |
| **SendGrid** | Cloud-based, reliable, good free tier | 10 mins    | Free up to 5K/month  |
| **Mailgun**  | Testing, excellent API                | 10 mins    | Free up to 100/month |

---

## 🚀 Quick Setup (Choose One)

### Option 1: Gmail + SMTP (Easiest for Testing)

```env
# .env file
EMAIL_PROVIDER=smtp
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=xxxxxxxxxxxxxxxx  # App password (not regular password!)
```

**To get Gmail App Password:**

1. Enable 2-Factor Authentication on your Google Account
2. Go to [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
3. Create an app password for "Mail" → "Windows Computer"
4. Copy the 16-character password

### Option 2: SendGrid (Recommended for Production)

```env
EMAIL_PROVIDER=sendgrid
SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
SENDGRID_FROM_EMAIL=noreply@yourdomain.com
```

**To get SendGrid API Key:**

1. Sign up at [sendgrid.com](https://sendgrid.com)
2. Go to Settings → API Keys
3. Create a new API Key
4. Copy it to .env

### Option 3: Mailgun (Great for Testing)

```env
EMAIL_PROVIDER=mailgun
MAILGUN_API_KEY=key-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
MAILGUN_DOMAIN=mg.yourdomain.com
```

**To get Mailgun Keys:**

1. Sign up at [mailgun.com](https://mailgun.com)
2. Go to Domain Settings
3. Copy API Key and Domain

---

## 📝 Using in Workflows

### From Frontend

1. Add `action-email` node to workflow
2. Configure fields:
   - **Provider**: Choose smtp, sendgrid, or mailgun
   - **To**: `user@example.com`
   - **Subject**: `Daily Report`
   - **Body**: `<h2>Report</h2><p>Your content here...</p>`
   - **Is HTML**: ✓ (checked for HTML emails)

3. Connect to previous node
4. Run workflow → Real email is sent!

### Example Workflow

```
Trigger (schedule)
    ↓
AI Node (generates content)
    ↓
Email Node (sends the content)
    ↓
Completion
```

---

## 🧪 Testing

### Test Email Delivery

```bash
# In the backend directory
npm test -- emailService.test.ts
```

This will test:

- ✅ SMTP connection
- ✅ SendGrid API
- ✅ Mailgun API
- ✅ Batch sending

### Manual Test from Frontend

1. Create simple workflow with:
   - Trigger: Manual
   - Action: Email node
   - Config: Your test email address

2. Configure email provider in backend .env
3. Click "Execute" or "Run Workflow"
4. Check your inbox (may take 1-2 seconds)
5. Check backend logs for delivery status

---

## 📊 Response Examples

### Success

```json
{
  "success": true,
  "output": {
    "text": "Email sent to user@example.com: Daily Report",
    "message": "Email action executed successfully via smtp",
    "data": {
      "recipient": "user@example.com",
      "provider": "smtp",
      "messageId": "abc123@example.com",
      "timestamp": "2024-01-15T10:30:00Z"
    }
  }
}
```

### Failure

```json
{
  "success": false,
  "error": "Failed to send email via smtp: connect ECONNREFUSED",
  "nodeId": "email-1"
}
```

---

## 🔧 Troubleshooting

| Problem                           | Solution                                     |
| --------------------------------- | -------------------------------------------- |
| "Recipient not configured"        | Add `to` field in node config                |
| "SMTP credentials not configured" | Set `SMTP_USER` and `SMTP_PASSWORD` in .env  |
| Gmail login blocked               | Use App Password instead of regular password |
| SendGrid 401 error                | Check `SENDGRID_API_KEY` is correct          |
| No email received                 | Check spam folder, verify email address      |
| Connection timeout                | Check firewall, try port 2525 for SMTP       |

---

## 📚 Files Created/Modified

| File                             | What Changed                                          |
| -------------------------------- | ----------------------------------------------------- |
| `src/utils/emailService.ts`      | ✨ NEW - Email service with 4 providers               |
| `src/nodes/index.ts`             | 🔄 UPDATED - Real email sending in emailActionHandler |
| `EMAIL_IMPLEMENTATION.md`        | 📖 NEW - Complete documentation                       |
| `src/utils/emailService.test.ts` | 🧪 NEW - Test suite                                   |

---

## 🎯 Common Workflows

### Daily Report Email

```yaml
Trigger: Schedule (0 8 * * * = 8 AM daily)
  ↓
AI Node: Generate report content
  ↓
Email Node: Send to manager@company.com
  ↓
Log: Mark as completed
```

### User Notification

```yaml
Trigger: Webhook (from external app)
  ↓
Process: Extract email address from webhook
  ↓
Email Node: Send confirmation
  ↓
Done
```

### Batch Email Campaign

```yaml
Trigger: Schedule (weekly)
  ↓
Database: Get all subscriber emails
  ↓
Loop: For each email
  ├─ AI Node: Personalize content
  └─ Email Node: Send email
  ↓
Summary: Log results
```

---

## 🔒 Security Best Practices

1. **Never commit .env files**

   ```bash
   # .gitignore
   .env
   .env.local
   ```

2. **Use environment variables for secrets**

   ```env
   SMTP_PASSWORD=xxxxx      # Not in code
   SENDGRID_API_KEY=xxxxx   # Not in code
   ```

3. **Rotate API keys regularly**
   - SendGrid: Regenerate keys quarterly
   - Mailgun: Monitor API key usage

4. **Validate email addresses**
   - Check format before sending
   - Remove invalid addresses from batch

5. **Log without exposing secrets**
   ✅ "Email sent to user@example.com"
   ❌ "Email sent to user@example.com via sendgrid_key_xxxxx"

---

## 📈 Performance

- **Single email**: ~500ms - 2 seconds
- **Batch (10 emails)**: ~3-10 seconds
- **Rate limits**:
  - SMTP: 100-1000/hour (provider dependent)
  - SendGrid: 5000/month (free tier)
  - Mailgun: 100/month (free tier)

For high-volume use SendGrid or AWS SES.

---

## 🚦 Next Steps

1. ✅ Pick an email provider (SMTP easiest for testing)
2. ✅ Configure .env with provider credentials
3. ✅ Test with test file: `npm test -- emailService.test.ts`
4. ✅ Build workflow with action-email node
5. ✅ Execute and verify email delivery

---

## 📞 Support

For detailed information, see:

- `EMAIL_IMPLEMENTATION.md` - Complete reference
- `src/utils/emailService.ts` - Source code with comments
- `src/utils/emailService.test.ts` - Test examples

---

**Status**: ✅ Ready to use - all code deployed and tested
