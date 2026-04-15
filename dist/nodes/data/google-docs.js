"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.googleDocsNode = void 0;
const zod_1 = require("zod");
const googleapis_1 = require("googleapis");
// Google Docs Node
const googleDocsConfigSchema = zod_1.z.object({
    accessToken: zod_1.z.string().min(1),
    refreshToken: zod_1.z.string().optional(),
    clientId: zod_1.z.string().min(1),
    clientSecret: zod_1.z.string().min(1),
});
const googleDocsNode = {
    id: "google-docs",
    type: "data-google-docs",
    name: "Google Docs",
    description: "Create and edit Google Docs documents",
    category: "data",
    icon: "📄",
    color: "#4285F4",
    configSchema: googleDocsConfigSchema,
    inputs: [
        {
            id: "action",
            label: "Action",
            type: "string",
            required: true,
            description: "Action to perform (create, read, update, get)",
        },
        {
            id: "documentId",
            label: "Document ID",
            type: "string",
            required: false,
            description: "Google Docs document ID",
        },
        {
            id: "title",
            label: "Title",
            type: "string",
            required: false,
            description: "Document title for create action",
        },
        {
            id: "content",
            label: "Content",
            type: "string",
            required: false,
            description: "Text content to add or update",
        },
        {
            id: "index",
            label: "Insert Index",
            type: "number",
            required: false,
            description: "Position to insert content",
        },
    ],
    outputs: [
        {
            id: "document",
            label: "Document",
            type: "object",
            description: "Document metadata and content",
        },
        {
            id: "documentId",
            label: "Document ID",
            type: "string",
            description: "Created or updated document ID",
        },
        {
            id: "content",
            label: "Content",
            type: "string",
            description: "Document text content",
        },
        {
            id: "response",
            label: "API Response",
            type: "object",
            description: "Google Docs API response",
        },
    ],
    validation: {
        input: zod_1.z.object({
            action: zod_1.z.enum(["create", "read", "update", "get"]),
            documentId: zod_1.z.string().optional(),
            title: zod_1.z.string().optional(),
            content: zod_1.z.string().optional(),
            index: zod_1.z.number().optional(),
        }),
        output: zod_1.z.object({
            document: zod_1.z.any().optional(),
            documentId: zod_1.z.string().optional(),
            content: zod_1.z.string().optional(),
            response: zod_1.z.any(),
        }),
    },
    handler: async (context) => {
        const startTime = Date.now();
        const logs = [];
        try {
            const config = googleDocsConfigSchema.parse(context.config);
            const input = context.validation.input.parse(context.input);
            logs.push(`Performing Google Docs ${input.action} action`);
            // Set up OAuth2 client
            const oauth2Client = new googleapis_1.google.auth.OAuth2(config.clientId, config.clientSecret);
            oauth2Client.setCredentials({
                access_token: config.accessToken,
                refresh_token: config.refreshToken,
            });
            const docs = googleapis_1.google.docs({ version: "v1", auth: oauth2Client });
            let response;
            let document = null;
            let documentId = "";
            let content = "";
            switch (input.action) {
                case "create":
                    if (!input.title) {
                        throw new Error("Title required for create action");
                    }
                    response = await docs.documents.create({
                        requestBody: {
                            title: input.title,
                        },
                    });
                    document = response.data;
                    documentId = response.data.documentId;
                    break;
                case "read":
                case "get":
                    if (!input.documentId) {
                        throw new Error("Document ID required for read action");
                    }
                    response = await docs.documents.get({
                        documentId: input.documentId,
                    });
                    document = response.data;
                    // Extract text content from the document
                    if (document?.body?.content) {
                        content = extractTextFromDocument(document.body.content);
                    }
                    break;
                case "update":
                    if (!input.documentId) {
                        throw new Error("Document ID required for update action");
                    }
                    if (!input.content) {
                        throw new Error("Content required for update action");
                    }
                    const requests = [];
                    if (input.index !== undefined) {
                        // Insert text at specific position
                        requests.push({
                            insertText: {
                                location: {
                                    index: input.index,
                                },
                                text: input.content,
                            },
                        });
                    }
                    else {
                        // Append to end of document
                        const docBody = document?.body?.content || [];
                        const endIndex = docBody.reduce((max, element) => {
                            return Math.max(max, element.endIndex || 0);
                        }, 0) || 1;
                        requests.push({
                            insertText: {
                                location: {
                                    index: endIndex - 1,
                                },
                                text: input.content,
                            },
                        });
                    }
                    response = await docs.documents.batchUpdate({
                        documentId: input.documentId,
                        requestBody: {
                            requests,
                        },
                    });
                    documentId = input.documentId;
                    break;
                default:
                    throw new Error(`Action ${input.action} not implemented`);
            }
            logs.push(`Google Docs ${input.action} completed successfully`);
            return {
                success: true,
                output: {
                    document,
                    documentId,
                    content,
                    response: response.data,
                },
                logs,
                executionTime: Date.now() - startTime,
            };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logs.push(`Google Docs action failed: ${errorMessage}`);
            return {
                success: false,
                error: errorMessage,
                logs,
                executionTime: Date.now() - startTime,
            };
        }
    },
};
exports.googleDocsNode = googleDocsNode;
// Helper function to extract text from Google Docs content
function extractTextFromDocument(content) {
    let text = "";
    for (const element of content) {
        if (element.paragraph) {
            for (const paragraphElement of element.paragraph.elements || []) {
                if (paragraphElement.textRun) {
                    text += paragraphElement.textRun.content;
                }
            }
        }
    }
    return text;
}
