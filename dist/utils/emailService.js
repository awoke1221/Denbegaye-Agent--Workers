"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendEmail = sendEmail;
exports.sendEmailBatch = sendEmailBatch;
const nodemailer_1 = __importDefault(require("nodemailer"));
const logger_1 = require("./logger");
/**
 * Send email via SMTP (nodemailer)
 */
async function sendViaSMTP(options) {
    try {
        const smtpConfig = options.smtpConfig || {
            host: process.env.SMTP_HOST || "smtp.gmail.com",
            port: parseInt(process.env.SMTP_PORT || "587"),
            secure: process.env.SMTP_SECURE === "true",
            auth: {
                user: process.env.SMTP_USER || "",
                pass: process.env.SMTP_PASSWORD || "",
            },
        };
        if (!smtpConfig.auth.user || !smtpConfig.auth.pass) {
            throw new Error("SMTP credentials not configured (SMTP_USER and SMTP_PASSWORD required)");
        }
        const transporter = nodemailer_1.default.createTransport(smtpConfig);
        // Verify connection
        await transporter.verify();
        const mailOptions = {
            from: options.from || smtpConfig.auth.user,
            to: options.to,
            subject: options.subject,
            [options.html ? "html" : "text"]: options.body,
            attachments: options.attachments
                ? await Promise.all(options.attachments.map(async (att) => {
                    // In production, you'd fetch from URL
                    return {
                        filename: att.filename,
                        path: att.url,
                    };
                }))
                : undefined,
        };
        const info = await transporter.sendMail(mailOptions);
        logger_1.logger.info(`Email sent successfully via SMTP to ${options.to}:`, info.messageId);
        return {
            success: true,
            messageId: info.messageId,
            timestamp: new Date().toISOString(),
        };
    }
    catch (error) {
        logger_1.logger.error("SMTP email send failed:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
            timestamp: new Date().toISOString(),
        };
    }
}
/**
 * Send email via SendGrid API
 */
async function sendViaSendGrid(options) {
    try {
        const apiKey = options.sendGridApiKey || process.env.SENDGRID_API_KEY;
        if (!apiKey) {
            throw new Error("SendGrid API key not configured (SENDGRID_API_KEY)");
        }
        const url = "https://api.sendgrid.com/v3/mail/send";
        const payload = {
            personalizations: [
                {
                    to: [{ email: options.to }],
                },
            ],
            from: {
                email: options.from ||
                    process.env.SENDGRID_FROM_EMAIL ||
                    "noreply@example.com",
            },
            subject: options.subject,
            content: [
                {
                    type: options.html ? "text/html" : "text/plain",
                    value: options.body,
                },
            ],
            attachments: options.attachments
                ? options.attachments.map((att) => ({
                    filename: att.filename,
                    content: att.url, // In production, fetch and base64 encode
                    type: "application/octet-stream",
                    disposition: "attachment",
                }))
                : undefined,
        };
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify(payload),
        });
        if (!response.ok) {
            const errorData = await response.text();
            throw new Error(`SendGrid API error: ${response.status} - ${errorData}`);
        }
        const messageId = response.headers.get("X-Message-Id") || "unknown";
        logger_1.logger.info(`Email sent successfully via SendGrid to ${options.to}`);
        return {
            success: true,
            messageId,
            timestamp: new Date().toISOString(),
        };
    }
    catch (error) {
        logger_1.logger.error("SendGrid email send failed:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
            timestamp: new Date().toISOString(),
        };
    }
}
/**
 * Send email via Mailgun API
 */
async function sendViaMailgun(options) {
    try {
        const apiKey = options.mailgunApiKey || process.env.MAILGUN_API_KEY;
        const domain = options.mailgunDomain || process.env.MAILGUN_DOMAIN;
        if (!apiKey || !domain) {
            throw new Error("Mailgun credentials not configured (MAILGUN_API_KEY and MAILGUN_DOMAIN required)");
        }
        const url = `https://api.mailgun.net/v3/${domain}/messages`;
        const formData = new URLSearchParams();
        formData.append("from", options.from || `noreply@${domain}`);
        formData.append("to", options.to);
        formData.append("subject", options.subject);
        if (options.html) {
            formData.append("html", options.body);
        }
        else {
            formData.append("text", options.body);
        }
        // Add attachments if provided
        if (options.attachments) {
            for (const att of options.attachments) {
                // In production, you'd fetch from URL and append as file
                formData.append("attachment", att.url);
            }
        }
        const response = await fetch(url, {
            method: "POST",
            headers: {
                Authorization: `Basic ${Buffer.from(`api:${apiKey}`).toString("base64")}`,
            },
            body: formData,
        });
        if (!response.ok) {
            const errorData = await response.text();
            throw new Error(`Mailgun API error: ${response.status} - ${errorData}`);
        }
        const data = await response.json();
        const messageId = data.id || "unknown";
        logger_1.logger.info(`Email sent successfully via Mailgun to ${options.to}`);
        return {
            success: true,
            messageId,
            timestamp: new Date().toISOString(),
        };
    }
    catch (error) {
        logger_1.logger.error("Mailgun email send failed:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
            timestamp: new Date().toISOString(),
        };
    }
}
/**
 * Send email via AWS SES
 * (Placeholder for future implementation)
 */
async function sendViaSES(options) {
    try {
        // AWS SDK would be needed for this
        throw new Error("AWS SES support coming soon");
    }
    catch (error) {
        logger_1.logger.error("SES email send failed:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
            timestamp: new Date().toISOString(),
        };
    }
}
/**
 * Main email sending function
 * Chooses provider based on config or environment
 */
async function sendEmail(options) {
    // Determine provider
    const provider = options.provider || process.env.EMAIL_PROVIDER || "smtp";
    logger_1.logger.info(`Sending email via ${provider} to ${options.to}: ${options.subject}`);
    switch (provider) {
        case "sendgrid":
            return sendViaSendGrid(options);
        case "mailgun":
            return sendViaMailgun(options);
        case "ses":
            return sendViaSES(options);
        case "smtp":
        default:
            return sendViaSMTP(options);
    }
}
/**
 * Batch email sending
 */
async function sendEmailBatch(emails) {
    try {
        const results = await Promise.allSettled(emails.map((email) => sendEmail(email)));
        return results.map((result, index) => {
            if (result.status === "fulfilled") {
                return result.value;
            }
            else {
                return {
                    success: false,
                    error: result.reason instanceof Error
                        ? result.reason.message
                        : String(result.reason),
                    timestamp: new Date().toISOString(),
                };
            }
        });
    }
    catch (error) {
        logger_1.logger.error("Batch email send failed:", error);
        return [
            {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                timestamp: new Date().toISOString(),
            },
        ];
    }
}
