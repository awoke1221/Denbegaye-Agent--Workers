# Backend Email Handler - Updated Configuration Guide

## Overview

The backend `emailActionHandler` needs to be updated to properly extract and use the provider-specific configuration fields from the frontend email node.

---

## Current State

The backend email service (`src/utils/emailService.ts`) already supports:

- ✅ SMTP provider
- ✅ SendGrid provider
- ✅ Mailgun provider
- ✅ AWS SES provider (placeholder)

The `emailActionHandler` (in `src/nodes/index.ts`) needs to be updated to map frontend field names to backend parameters.

---

## Frontend Configuration Mapping

### Field Name Normalization

The frontend sends configuration with these field names:

**SMTP Fields:**

- `Provider` → provider = "smtp"
- `SMTP Host` → smtpConfig.host
- `SMTP Port` → smtpConfig.port
- `SMTP Secure` → smtpConfig.secure
- `SMTP User` → smtpConfig.auth.user
- `SMTP Password` → smtpConfig.auth.pass
- `From` → from

**SendGrid Fields:**

- `Provider` → provider = "sendgrid"
- `SendGrid API Key` → sendGridApiKey
- `SendGrid From Email` → from
- `To` → to (common)
- `Subject` → subject (common)
- `Body` → body (common)

**Mailgun Fields:**

- `Provider` → provider = "mailgun"
- `Mailgun API Key` → mailgunApiKey
- `Mailgun Domain` → mailgunDomain
- `To` → to (common)
- `Subject` → subject (common)
- `Body` → body (common)

**AWS SES Fields:**

- `Provider` → provider = "ses"
- `AWS Region` → awsRegion
- `AWS Access Key` → awsAccessKey
- `AWS Secret Key` → awsSecretKey
- `To` → to (common)
- `Subject` → subject (common)
- `Body` → body (common)

**Common Fields:**

- `From` → from
- `To` → to
- `Subject` → subject
- `Body` → body
- `Is HTML` → isHtml
- `Attachments` → attachments

---

## Updated emailActionHandler Implementation

Here's the updated handler that properly extracts the provider-specific configuration:

```typescript
const emailActionHandler = async (context: any) => {
  try {
    // Extract provider first
    const provider =
      context.config?.Provider ||
      context.config?.provider ||
      process.env.EMAIL_PROVIDER ||
      "smtp";

    // Normalize config keys (handle both camelCase and space-separated)
    const config = normalizeEmailConfig(context.config || {});

    // Extract common fields
    const recipient =
      config.to ||
      context.input?.email ||
      context.input?.to ||
      context.input?.data?.email ||
      "";
    const subject =
      config.subject || context.input?.subject || "Agent Notification";
    const body =
      config.body ||
      context.input?.text ||
      context.input?.output?.text ||
      context.input?.message ||
      "";
    const from = config.from || process.env.SMTP_USER;
    const isHtml = config.isHtml !== false; // Default to HTML
    const attachments = config.attachments || [];

    // Validate required fields
    if (!recipient) {
      return {
        success: false,
        error: "Email recipient not configured (To field required)",
        nodeId: context.nodeId,
      };
    }

    if (!subject) {
      return {
        success: false,
        error: "Email subject not configured (Subject field required)",
        nodeId: context.nodeId,
      };
    }

    if (!body) {
      return {
        success: false,
        error: "Email body not configured (Body field required)",
        nodeId: context.nodeId,
      };
    }

    // Parse attachments if they're a JSON string
    let parsedAttachments: Array<{ filename: string; url: string }> = [];
    if (attachments) {
      if (typeof attachments === "string") {
        try {
          parsedAttachments = JSON.parse(attachments);
        } catch (e) {
          logger.warn("Failed to parse attachments as JSON", e);
          parsedAttachments = [];
        }
      } else if (Array.isArray(attachments)) {
        parsedAttachments = attachments;
      }
    }

    // Build provider-specific options
    let emailOptions: EmailOptions = {
      to: recipient,
      from,
      subject,
      body,
      html: isHtml,
      attachments: parsedAttachments,
      provider: provider as "smtp" | "sendgrid" | "mailgun" | "ses",
    };

    // Add provider-specific configuration
    switch (provider.toLowerCase()) {
      case "smtp": {
        const smtpConfig = {
          host: config.smtpHost || config["SMTP Host"] || process.env.SMTP_HOST,
          port: parseInt(
            String(
              config.smtpPort ||
                config["SMTP Port"] ||
                process.env.SMTP_PORT ||
                587,
            ),
          ),
          secure:
            config.smtpSecure !== undefined
              ? config.smtpSecure
              : config["SMTP Secure"] === true ||
                process.env.SMTP_SECURE === "true",
          auth: {
            user:
              config.smtpUser ||
              config["SMTP User"] ||
              process.env.SMTP_USER ||
              "",
            pass:
              config.smtpPassword ||
              config["SMTP Password"] ||
              process.env.SMTP_PASSWORD ||
              "",
          },
        };

        if (!smtpConfig.auth.user || !smtpConfig.auth.pass) {
          return {
            success: false,
            error:
              "SMTP credentials not configured (SMTP User and SMTP Password required)",
            nodeId: context.nodeId,
          };
        }

        emailOptions.smtpConfig = smtpConfig;
        break;
      }

      case "sendgrid": {
        const sendgridApiKey =
          config.sendgridApiKey ||
          config["SendGrid API Key"] ||
          process.env.SENDGRID_API_KEY;

        if (!sendgridApiKey) {
          return {
            success: false,
            error: "SendGrid API key not configured",
            nodeId: context.nodeId,
          };
        }

        emailOptions.sendGridApiKey = sendgridApiKey;
        emailOptions.from =
          config.sendgridFromEmail ||
          config["SendGrid From Email"] ||
          from ||
          process.env.SENDGRID_FROM_EMAIL;

        break;
      }

      case "mailgun": {
        const mailgunApiKey =
          config.mailgunApiKey ||
          config["Mailgun API Key"] ||
          process.env.MAILGUN_API_KEY;
        const mailgunDomain =
          config.mailgunDomain ||
          config["Mailgun Domain"] ||
          process.env.MAILGUN_DOMAIN;

        if (!mailgunApiKey || !mailgunDomain) {
          return {
            success: false,
            error:
              "Mailgun credentials not configured (API Key and Domain required)",
            nodeId: context.nodeId,
          };
        }

        emailOptions.mailgunApiKey = mailgunApiKey;
        emailOptions.mailgunDomain = mailgunDomain;
        break;
      }

      case "ses": {
        const awsRegion =
          config.awsRegion || config["AWS Region"] || process.env.AWS_REGION;
        const awsAccessKey =
          config.awsAccessKey ||
          config["AWS Access Key"] ||
          process.env.AWS_ACCESS_KEY_ID;
        const awsSecretKey =
          config.awsSecretKey ||
          config["AWS Secret Key"] ||
          process.env.AWS_SECRET_ACCESS_KEY;

        if (!awsRegion || !awsAccessKey || !awsSecretKey) {
          return {
            success: false,
            error:
              "AWS SES credentials not configured (Region, Access Key, and Secret Key required)",
            nodeId: context.nodeId,
          };
        }

        // Store for SES handler
        emailOptions["_awsRegion"] = awsRegion;
        emailOptions["_awsAccessKey"] = awsAccessKey;
        emailOptions["_awsSecretKey"] = awsSecretKey;
        break;
      }

      default:
        return {
          success: false,
          error: `Unknown email provider: ${provider}`,
          nodeId: context.nodeId,
        };
    }

    // Send the email
    const result = await sendEmail(emailOptions);

    if (result.success) {
      logger.info(
        `Email sent successfully via ${provider} to ${recipient}`,
        result,
      );
      return {
        success: true,
        output: {
          text: `Email sent to ${recipient}: ${subject}`,
          message: `Email action executed successfully via ${provider}`,
          data: {
            recipient,
            subject,
            bodyLength: body.length,
            provider,
            messageId: result.messageId,
            timestamp: result.timestamp,
          },
        },
        logs: [
          `Email action executed: to=${recipient}, provider=${provider}, messageId=${result.messageId}`,
        ],
      };
    } else {
      logger.error(
        `Email send failed via ${provider} to ${recipient}:`,
        result.error,
      );
      return {
        success: false,
        error: `Failed to send email via ${provider}: ${result.error}`,
        nodeId: context.nodeId,
        logs: [
          `Email action failed: to=${recipient}, provider=${provider}, error=${result.error}`,
        ],
      };
    }
  } catch (error) {
    logger.error("Email action handler error:", error);
    return {
      success: false,
      error: `Email action error: ${error instanceof Error ? error.message : String(error)}`,
      nodeId: context.nodeId,
      logs: [
        `Email action error: ${error instanceof Error ? error.message : String(error)}`,
      ],
    };
  }
};

// Helper function to normalize config keys
function normalizeEmailConfig(
  config: Record<string, any>,
): Record<string, any> {
  const normalized: Record<string, any> = {};

  for (const [key, value] of Object.entries(config)) {
    // Convert "SMTP Host" to smtpHost, "SendGrid API Key" to sendgridApiKey, etc.
    const lowerKey = key.toLowerCase().replace(/\s+/g, "");

    // Map space-separated keys to camelCase
    if (key.includes("SMTP")) {
      if (key === "SMTP Host") normalized.smtpHost = value;
      else if (key === "SMTP Port") normalized.smtpPort = value;
      else if (key === "SMTP Secure") normalized.smtpSecure = value;
      else if (key === "SMTP User") normalized.smtpUser = value;
      else if (key === "SMTP Password") normalized.smtpPassword = value;
    } else if (key.includes("SendGrid")) {
      if (key === "SendGrid API Key") normalized.sendgridApiKey = value;
      else if (key === "SendGrid From Email")
        normalized.sendgridFromEmail = value;
    } else if (key.includes("Mailgun")) {
      if (key === "Mailgun API Key") normalized.mailgunApiKey = value;
      else if (key === "Mailgun Domain") normalized.mailgunDomain = value;
    } else if (key.includes("AWS")) {
      if (key === "AWS Region") normalized.awsRegion = value;
      else if (key === "AWS Access Key") normalized.awsAccessKey = value;
      else if (key === "AWS Secret Key") normalized.awsSecretKey = value;
    } else if (key === "Provider") {
      normalized.provider = value;
    } else if (key === "From") {
      normalized.from = value;
    } else if (key === "To") {
      normalized.to = value;
    } else if (key === "Subject") {
      normalized.subject = value;
    } else if (key === "Body") {
      normalized.body = value;
    } else if (key === "Is HTML") {
      normalized.isHtml = value;
    } else if (key === "Attachments") {
      normalized.attachments = value;
    } else {
      // Keep original key if not recognized
      normalized[key] = value;
    }
  }

  return normalized;
}
```

---

## Integration Steps

1. **Update emailActionHandler** in `src/nodes/index.ts`
   - Replace with the new implementation above
   - Add the `normalizeEmailConfig` helper function

2. **Test configuration extraction**

   ```bash
   npm test -- emailService.test.ts
   ```

3. **Test with frontend workflow**
   - Create workflow with email node
   - Select different providers
   - Verify correct fields appear
   - Execute and check email delivery

---

## Configuration Priority Order

The handler uses this priority for extracting values:

1. **Node config** (from frontend) - Highest priority
2. **Input data** (from previous node output)
3. **Environment variables** - Fallback
4. **Defaults** - Last resort

Example:

```typescript
// SMTP Host priority:
const host =
  config.smtpHost || // From frontend node config
  config["SMTP Host"] || // Alternative format from frontend
  process.env.SMTP_HOST || // Environment variable
  "smtp.gmail.com"; // Default (optional)
```

---

## Error Handling

The handler provides clear error messages for:

- Missing recipient (To field)
- Missing subject
- Missing body
- Missing provider credentials
- Invalid provider type
- Configuration format errors

Examples:

```
"Email recipient not configured (To field required)"
"SMTP credentials not configured (SMTP User and SMTP Password required)"
"SendGrid API key not configured"
"Unknown email provider: invalid-provider"
```

---

## Logging

All operations are logged with provider and recipient:

```
Email sent successfully via smtp to user@example.com
Email action failed: to=user@example.com, provider=sendgrid, error=Invalid API key
```

---

## Testing Configuration Extraction

To test the configuration mapping:

```typescript
// Test SMTP config extraction
const context = {
  config: {
    Provider: "smtp",
    "SMTP Host": "smtp.gmail.com",
    "SMTP Port": 587,
    "SMTP Secure": false,
    "SMTP User": "test@gmail.com",
    "SMTP Password": "app_password",
    To: "recipient@example.com",
    Subject: "Test",
    Body: "Test email",
  },
};

// Handler should:
// 1. Extract provider = 'smtp'
// 2. Build smtpConfig with host, port, secure, auth
// 3. Extract common fields (to, subject, body)
// 4. Send via SMTP
```

---

## Backward Compatibility

The handler remains backward compatible with:

- Old configuration format (camelCase)
- Environment variable fallbacks
- Input data from previous nodes
- Legacy node structures

---

## Files to Update

1. **`src/nodes/index.ts`**
   - Replace `emailActionHandler` implementation
   - Add `normalizeEmailConfig` helper function

2. **`src/utils/emailService.ts`**
   - No changes needed (already supports all providers)

3. **Test files**
   - Update tests to use new config format
   - Test provider-specific scenarios

---

## Summary

✅ **What Changed:**

- Updated emailActionHandler to extract provider-specific config
- Added config normalization for space-separated field names
- Improved error messages for missing credentials
- Better logging with provider and recipient info

✅ **Benefits:**

- Properly uses frontend's provider-specific fields
- Flexible - supports both old and new formats
- Clear error messages for debugging
- Provider credentials safely handled
- Backward compatible

---

## Next Steps

1. Update `emailActionHandler` in `src/nodes/index.ts`
2. Test with frontend workflows
3. Monitor logs for proper config extraction
4. Verify email delivery with each provider
5. Collect user feedback on UX
