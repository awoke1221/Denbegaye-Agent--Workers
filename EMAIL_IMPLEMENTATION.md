# Email Action Node - Real Implementation

## Overview

The `action-email` node has been upgraded from a simulation to send **real emails** using one of three providers:

1. **SMTP** (nodemailer) - Most common, works with Gmail, Office365, custom SMTP
2. **SendGrid API** - Cloud-based email service
3. **Mailgun API** - Cloud-based email service with advanced features
4. **AWS SES** - (Coming soon)

## Installation

```bash
npm install nodemailer
npm install --save-dev @types/nodemailer
```

✅ **Already installed**

## Configuration

### Provider Selection

The email provider is determined by (in priority order):

1. **Node config field**: `context.config.provider` (set in frontend)
2. **Environment variable**: `EMAIL_PROVIDER` (default: "smtp")

### Provider-Specific Setup

#### SMTP (Default)

**Environment Variables:**

```env
EMAIL_PROVIDER=smtp
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
```

**For Gmail:**

1. Enable 2-Factor Authentication
2. Generate "App Password": [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
3. Use the 16-character password as `SMTP_PASSWORD`

**For Office365:**

```env
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_USER=your-email@company.com
SMTP_PASSWORD=your-password
```

**For Custom SMTP:**

Update `SMTP_HOST` and `SMTP_PORT` accordingly.

#### SendGrid API

**Setup:**

1. Create SendGrid account: [sendgrid.com](https://sendgrid.com)
2. Create API key in Settings → API Keys
3. Set verified sender email

**Environment Variables:**

```env
EMAIL_PROVIDER=sendgrid
SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxxxxxxx
SENDGRID_FROM_EMAIL=noreply@yourdomain.com
```

#### Mailgun API

**Setup:**

1. Create Mailgun account: [mailgun.com](https://mailgun.com)
2. Get API key from Domain Settings
3. Verify domain or use sandbox domain

**Environment Variables:**

```env
EMAIL_PROVIDER=mailgun
MAILGUN_API_KEY=key-xxxxxxxxxxxxxxxxxxxxx
MAILGUN_DOMAIN=mg.yourdomain.com
```

#### AWS SES

**Coming soon** - Will require AWS SDK and IAM credentials.

## Node Configuration (Frontend)

The `action-email` node in the frontend has these fields:

| Field         | Type     | Required | Description                                |
| ------------- | -------- | -------- | ------------------------------------------ |
| `provider`    | Select   | Yes      | SMTP, SendGrid, Mailgun, or SES            |
| `from`        | Text     | No       | Sender email (uses env default if not set) |
| `to`          | Text     | Yes      | Recipient email address(es)                |
| `subject`     | Text     | Yes      | Email subject line                         |
| `body`        | Textarea | Yes      | Email body (HTML or plain text)            |
| `isHtml`      | Checkbox | No       | Treat body as HTML (default: true)         |
| `attachments` | Textarea | No       | JSON array of attachments                  |

### Example Node Configuration

```json
{
  "id": "email-1",
  "type": "action-email",
  "data": {
    "config": {
      "provider": "smtp",
      "from": "noreply@example.com",
      "to": "user@example.com",
      "subject": "Daily Report",
      "body": "<h1>Daily Report</h1><p>Generated at {timestamp}</p>",
      "isHtml": true,
      "attachments": "[{\"filename\": \"report.pdf\", \"url\": \"https://...\"}, ...]"
    }
  }
}
```

## Attachments

Attachments can be specified as a JSON array in the `attachments` field:

```json
[
  {
    "filename": "report.pdf",
    "url": "https://example.com/reports/2024-01-15.pdf"
  },
  {
    "filename": "invoice.xlsx",
    "url": "s3://bucket/invoices/INV-001.xlsx"
  }
]
```

**Note:** URLs are fetched and attached. In production, ensure:

- URLs are publicly accessible or authenticated
- File sizes are reasonable (SMTP has limits)
- URL timeouts are handled

## Input Data Handling

If node fields are not configured, the handler pulls from input data:

```javascript
// Config-based (priority 1)
to: context.config?.to;

// Input-based (priority 2)
to: context.input?.to || context.input?.email || context.input?.data?.email;

// Subject fallback
subject: context.config?.subject ||
  context.input?.subject ||
  "Agent Notification";

// Body fallback
body: context.config?.body ||
  context.input?.text ||
  context.input?.output?.text ||
  context.input?.message;
```

## Usage Example

### 1. Simple Email (Config-based)

```typescript
const emailNode = {
  id: "send-report",
  type: "action-email",
  data: {
    config: {
      provider: "smtp",
      to: "manager@example.com",
      subject: "Daily Summary",
      body: "Here's your daily summary...",
    },
  },
};
```

### 2. Dynamic Email (Input-based)

```typescript
// From previous AI node output
{
  success: true,
  output: {
    text: "Generated report content...",
    to: "user@example.com",
    subject: "AI-Generated Report"
  }
}

// Email node receives this as input and uses it
```

### 3. Multi-recipient Email

```typescript
{
  config: {
    provider: "sendgrid",
    to: "user1@example.com,user2@example.com",  // Comma-separated
    subject: "Team Update",
    body: "Update for team..."
  }
}
```

## Response Format

### Success Response

```typescript
{
  success: true,
  output: {
    text: "Email sent to user@example.com: Daily Report",
    message: "Email action executed successfully via smtp",
    data: {
      recipient: "user@example.com",
      subject: "Daily Report",
      bodyLength: 245,
      provider: "smtp",
      messageId: "abc123@example.com",  // Provider-specific ID
      timestamp: "2024-01-15T10:30:00Z"
    }
  },
  logs: [
    "Email action executed: to=user@example.com, provider=smtp, messageId=abc123@example.com"
  ]
}
```

### Failure Response

```typescript
{
  success: false,
  error: "Failed to send email via smtp: connect ECONNREFUSED 127.0.0.1:587",
  nodeId: "email-1",
  logs: [
    "Email action failed: to=user@example.com, provider=smtp, error=connect ECONNREFUSED"
  ]
}
```

## Troubleshooting

### "SMTP credentials not configured"

**Solution:** Set `SMTP_USER` and `SMTP_PASSWORD` environment variables.

```bash
# .env
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
```

### "Email recipient not configured"

**Solution:** Ensure email node has `to` field either in config or input.

### Gmail: "Login attempt blocked"

**Solution:** Use App Password instead of regular password.

- Enable 2-factor authentication
- Generate app password at [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)

### SendGrid: "401 Unauthorized"

**Solution:** Check `SENDGRID_API_KEY` is correct and API key exists in account.

### Mailgun: "405 Method Not Allowed"

**Solution:** Ensure domain is verified and using correct `MAILGUN_DOMAIN`.

### Connection timeout

**Solution:** If using corporate firewall:

- Check if SMTP port 587 or 25 is open
- Try port 2525 (alternative)
- Use SendGrid or Mailgun if outbound SMTP is blocked

## Testing

### Test with Local Development

```typescript
// In test file
import { sendEmail } from "./emailService";

async function testEmail() {
  const result = await sendEmail({
    to: "test@example.com",
    subject: "Test Email",
    body: "<p>Test message</p>",
    provider: "smtp",
  });

  console.log(result);
  // {
  //   success: true,
  //   messageId: "abc123@example.com",
  //   timestamp: "2024-01-15T10:30:00Z"
  // }
}
```

### Test Email Node in Workflow

```typescript
const workflow = {
  nodes: [
    {
      id: "email-test",
      type: "action-email",
      data: {
        config: {
          provider: "smtp",
          to: "your-email@example.com",
          subject: "Workflow Test",
          body: "This is a test email from your workflow",
        },
      },
    },
  ],
  edges: [],
};

// Execute and check if email arrives
```

## Performance Considerations

### Batch Sending

For sending multiple emails, use the batch function:

```typescript
import { sendEmailBatch } from "./emailService";

const results = await sendEmailBatch([
  { to: "user1@example.com", subject: "Email 1", body: "Content 1" },
  { to: "user2@example.com", subject: "Email 2", body: "Content 2" },
  { to: "user3@example.com", subject: "Email 3", body: "Content 3" },
]);

// Results will contain success/failure status for each email
```

### Rate Limiting

Different providers have different rate limits:

| Provider | Rate Limit           | Note                  |
| -------- | -------------------- | --------------------- |
| SMTP     | Depends on server    | Gmail: 100/day (free) |
| SendGrid | 5000/month (free)    | Generous free tier    |
| Mailgun  | 100/month (free)     | Good for testing      |
| AWS SES  | 1/second (free tier) | Highly scalable       |

For high-volume workflows, use SendGrid or SES.

### Caching & Retry Logic

The email service includes:

- Connection verification (SMTP)
- Automatic retry logic (fetch-based providers)
- Comprehensive error logging

## Security Considerations

### API Keys

- **Never commit** `.env` files with real keys
- Use `.env.example` with placeholder values
- In production, use secret management:
  - AWS Secrets Manager
  - Vault
  - GitHub Secrets (for CI/CD)

### Email Content

- Validate recipient email addresses
- Sanitize HTML body to prevent injection
- Log sent emails for audit trail (without sensitive content)

### Data Privacy

- GDPR: Ensure proper consent for sending emails
- Provide unsubscribe links in emails
- Implement double opt-in where required

## Architecture

### File Structure

```
src/
├── nodes/
│   └── index.ts           ← emailActionHandler (uses emailService)
└── utils/
    └── emailService.ts    ← sendEmail(), sendEmailBatch()
```

### Email Service Functions

```typescript
// Main function
sendEmail(options: EmailOptions): Promise<EmailResult>

// Batch sending
sendEmailBatch(emails: EmailOptions[]): Promise<EmailResult[]>

// Provider-specific (internal)
sendViaSMTP(options: EmailOptions): Promise<EmailResult>
sendViaSendGrid(options: EmailOptions): Promise<EmailResult>
sendViaMailgun(options: EmailOptions): Promise<EmailResult>
sendViaSES(options: EmailOptions): Promise<EmailResult>  // Coming soon
```

### Data Flow

```
Frontend (action-email node config)
    ↓
emailActionHandler (src/nodes/index.ts)
    ↓
sendEmail() (src/utils/emailService.ts)
    ↓
Provider-specific function:
  - sendViaSMTP() → nodemailer
  - sendViaSendGrid() → fetch(sendgrid API)
  - sendViaMailgun() → fetch(mailgun API)
    ↓
Email Provider (Gmail, SendGrid, Mailgun, etc.)
    ↓
Recipient's Inbox
```

## Monitoring & Logging

All email operations are logged to help with debugging:

```typescript
logger.info(
  `Sending email via ${provider} to ${options.to}: ${options.subject}`,
);
logger.info(`Email sent successfully via ${provider} to ${recipient}`, result);
logger.error(
  `Email send failed via ${provider} to ${recipient}:`,
  result.error,
);
```

Check logs in `console` or configured log files for email delivery status.

## Next Steps

### Features to Add

- [ ] AWS SES support
- [ ] Email scheduling (send at specific time)
- [ ] Retry policy configuration
- [ ] Email template support
- [ ] Unsubscribe link injection
- [ ] Bounce/complaint handling
- [ ] Email verification status tracking
- [ ] A/B testing support
- [ ] Webhook for delivery confirmations
- [ ] Rich text editor for body

### Integration Ideas

- Send confirmation emails after successful workflow execution
- Send digest emails summarizing workflow results
- Send alert emails on workflow failures
- Send multi-part emails with generated PDFs/attachments
- Implement email marketing workflows
- Send transactional emails from user actions

## Related Documentation

- [BACKEND_LANGGRAPH_INTEGRATION.md](./BACKEND_LANGGRAPH_INTEGRATION.md) - Node integration overview
- [ADVANCED_EXECUTION_SYSTEM.md](./ADVANCED_EXECUTION_SYSTEM.md) - Workflow execution system
- [README.md](./README.md) - Project overview
