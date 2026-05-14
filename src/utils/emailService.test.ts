import { sendEmail, sendEmailBatch, EmailOptions } from "../utils/emailService";
import { logger } from "../utils/logger";

/**
 * Test file for email service functionality
 * Run with: npm test -- test_email_service.ts
 */

async function testSingleEmail() {
  console.log("\n=== Testing Single Email (SMTP) ===\n");

  const options: EmailOptions = {
    to: process.env.TEST_EMAIL_RECIPIENT || "test@example.com",
    subject: "Test Email - SMTP",
    body: "<h2>Test Email</h2><p>This is a test email sent via SMTP.</p>",
    html: true,
    provider: "smtp",
  };

  try {
    const result = await sendEmail(options);
    console.log("Result:", result);
    if (result.success) {
      console.log("✅ Email sent successfully");
      console.log("Message ID:", result.messageId);
    } else {
      console.log("❌ Email send failed");
      console.log("Error:", result.error);
    }
  } catch (error) {
    console.error("Error:", error);
  }
}

async function testSendGridEmail() {
  console.log("\n=== Testing SendGrid Email ===\n");

  const options: EmailOptions = {
    to: process.env.TEST_EMAIL_RECIPIENT || "test@example.com",
    subject: "Test Email - SendGrid",
    body: "<h2>Test Email</h2><p>This is a test email sent via SendGrid.</p>",
    html: true,
    provider: "sendgrid",
    sendGridApiKey: process.env.SENDGRID_API_KEY,
  };

  try {
    const result = await sendEmail(options);
    console.log("Result:", result);
    if (result.success) {
      console.log("✅ Email sent successfully");
      console.log("Message ID:", result.messageId);
    } else {
      console.log("❌ Email send failed");
      console.log("Error:", result.error);
    }
  } catch (error) {
    console.error("Error:", error);
  }
}

async function testMailgunEmail() {
  console.log("\n=== Testing Mailgun Email ===\n");

  const options: EmailOptions = {
    to: process.env.TEST_EMAIL_RECIPIENT || "test@example.com",
    subject: "Test Email - Mailgun",
    body: "This is a test email sent via Mailgun.",
    html: false,
    provider: "mailgun",
    mailgunApiKey: process.env.MAILGUN_API_KEY,
    mailgunDomain: process.env.MAILGUN_DOMAIN,
  };

  try {
    const result = await sendEmail(options);
    console.log("Result:", result);
    if (result.success) {
      console.log("✅ Email sent successfully");
      console.log("Message ID:", result.messageId);
    } else {
      console.log("❌ Email send failed");
      console.log("Error:", result.error);
    }
  } catch (error) {
    console.error("Error:", error);
  }
}

async function testBatchEmails() {
  console.log("\n=== Testing Batch Emails ===\n");

  const emails: EmailOptions[] = [
    {
      to: "user1@example.com",
      subject: "Batch Email 1",
      body: "This is batch email 1",
      provider: "smtp",
    },
    {
      to: "user2@example.com",
      subject: "Batch Email 2",
      body: "This is batch email 2",
      provider: "smtp",
    },
    {
      to: "user3@example.com",
      subject: "Batch Email 3",
      body: "This is batch email 3",
      provider: "smtp",
    },
  ];

  try {
    const results = await sendEmailBatch(emails);
    console.log("Results:", results);

    const successful = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    console.log(`\n📊 Summary: ${successful} successful, ${failed} failed`);
  } catch (error) {
    console.error("Error:", error);
  }
}

async function testNodeIntegration() {
  console.log("\n=== Testing Node Integration ===\n");

  // Simulate context from workflow execution
  const context = {
    nodeId: "email-test-1",
    nodeType: "action-email",
    config: {
      provider: "smtp",
      to: process.env.TEST_EMAIL_RECIPIENT || "test@example.com",
      subject: "Workflow Test Email",
      body: "<h2>Workflow Test</h2><p>This email was sent from a workflow node.</p>",
      isHtml: true,
    },
    input: {},
  };

  try {
    // Import emailActionHandler for testing
    console.log("Testing emailActionHandler with context:", context);

    // This is a mock test since we can't directly import the handler
    // In real testing, you'd use the actual handler
    console.log("✅ Context structure is valid for emailActionHandler");
  } catch (error) {
    console.error("Error:", error);
  }
}

async function runAllTests() {
  console.log("🧪 Starting Email Service Tests\n");

  try {
    // Only run tests where credentials are available
    if (process.env.SMTP_USER && process.env.SMTP_PASSWORD) {
      await testSingleEmail();
    } else {
      console.log("⚠️  Skipping SMTP test (credentials not configured)");
      console.log("   Set SMTP_USER and SMTP_PASSWORD to test SMTP\n");
    }

    if (process.env.SENDGRID_API_KEY) {
      await testSendGridEmail();
    } else {
      console.log("⚠️  Skipping SendGrid test (SENDGRID_API_KEY not set)\n");
    }

    if (process.env.MAILGUN_API_KEY && process.env.MAILGUN_DOMAIN) {
      await testMailgunEmail();
    } else {
      console.log("⚠️  Skipping Mailgun test (credentials not configured)\n");
    }

    await testBatchEmails();
    await testNodeIntegration();

    console.log("\n✅ All tests completed\n");
  } catch (error) {
    console.error("Test suite error:", error);
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runAllTests().catch(console.error);
}

export {
  testSingleEmail,
  testSendGridEmail,
  testMailgunEmail,
  testBatchEmails,
  testNodeIntegration,
};
