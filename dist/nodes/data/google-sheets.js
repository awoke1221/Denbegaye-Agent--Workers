"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.googleSheetsNode = void 0;
const zod_1 = require("zod");
const googleapis_1 = require("googleapis");
// Google Sheets Node
const googleSheetsConfigSchema = zod_1.z.object({
    accessToken: zod_1.z.string().min(1),
    refreshToken: zod_1.z.string().optional(),
    clientId: zod_1.z.string().min(1),
    clientSecret: zod_1.z.string().min(1),
    spreadsheetId: zod_1.z.string().optional(),
});
const googleSheetsNode = {
    id: "google-sheets",
    type: "data-google-sheets",
    name: "Google Sheets",
    description: "Read and write data to Google Sheets",
    category: "data",
    icon: "📊",
    color: "#0F9D58",
    configSchema: googleSheetsConfigSchema,
    inputs: [
        {
            id: "action",
            label: "Action",
            type: "string",
            required: true,
            description: "Action to perform (read, write, append, update)",
        },
        {
            id: "spreadsheetId",
            label: "Spreadsheet ID",
            type: "string",
            required: false,
            description: "Google Sheets spreadsheet ID",
        },
        {
            id: "range",
            label: "Range",
            type: "string",
            required: true,
            description: "Sheet range (e.g., Sheet1!A1:B10)",
        },
        {
            id: "data",
            label: "Data",
            type: "any",
            required: false,
            description: "Data to write or update",
        },
        {
            id: "valueInputOption",
            label: "Value Input Option",
            type: "string",
            required: false,
            description: "How to interpret input values",
        },
    ],
    outputs: [
        {
            id: "data",
            label: "Sheet Data",
            type: "array",
            description: "Retrieved sheet data",
        },
        {
            id: "updatedRange",
            label: "Updated Range",
            type: "string",
            description: "Range that was updated",
        },
        {
            id: "updatedRows",
            label: "Updated Rows",
            type: "number",
            description: "Number of rows updated",
        },
        {
            id: "response",
            label: "API Response",
            type: "object",
            description: "Google Sheets API response",
        },
    ],
    validation: {
        input: zod_1.z.object({
            action: zod_1.z.enum(["read", "write", "append", "update"]),
            spreadsheetId: zod_1.z.string().optional(),
            range: zod_1.z.string().min(1),
            data: zod_1.z.any().optional(),
            valueInputOption: zod_1.z.enum(["RAW", "USER_ENTERED"]).default("RAW"),
        }),
        output: zod_1.z.object({
            data: zod_1.z.array(zod_1.z.array(zod_1.z.any())),
            updatedRange: zod_1.z.string().optional(),
            updatedRows: zod_1.z.number().optional(),
            response: zod_1.z.any(),
        }),
    },
    handler: async (context) => {
        const startTime = Date.now();
        const logs = [];
        try {
            const config = googleSheetsConfigSchema.parse(context.config);
            const input = context.validation.input.parse(context.input);
            logs.push(`Performing Google Sheets ${input.action} action`);
            // Set up OAuth2 client
            const oauth2Client = new googleapis_1.google.auth.OAuth2(config.clientId, config.clientSecret);
            oauth2Client.setCredentials({
                access_token: config.accessToken,
                refresh_token: config.refreshToken,
            });
            const sheets = googleapis_1.google.sheets({ version: "v4", auth: oauth2Client });
            const spreadsheetId = input.spreadsheetId || config.spreadsheetId;
            if (!spreadsheetId) {
                throw new Error("Spreadsheet ID not provided");
            }
            let response;
            let data = [];
            let updatedRange = "";
            let updatedRows = 0;
            switch (input.action) {
                case "read":
                    response = await sheets.spreadsheets.values.get({
                        spreadsheetId,
                        range: input.range,
                    });
                    data = response.data.values || [];
                    break;
                case "write":
                    if (!input.data) {
                        throw new Error("Data required for write action");
                    }
                    // Ensure data is in the correct format
                    const writeData = Array.isArray(input.data)
                        ? input.data
                        : [input.data];
                    response = await sheets.spreadsheets.values.update({
                        spreadsheetId,
                        range: input.range,
                        valueInputOption: input.valueInputOption,
                        requestBody: {
                            values: writeData,
                        },
                    });
                    updatedRange = response.data.updatedRange || "";
                    updatedRows = response.data.updatedRows || 0;
                    break;
                case "append":
                    if (!input.data) {
                        throw new Error("Data required for append action");
                    }
                    // Ensure data is in the correct format
                    const appendData = Array.isArray(input.data)
                        ? input.data
                        : [input.data];
                    response = await sheets.spreadsheets.values.append({
                        spreadsheetId,
                        range: input.range,
                        valueInputOption: input.valueInputOption,
                        requestBody: {
                            values: appendData,
                        },
                    });
                    updatedRange = response.data.updates?.updatedRange || "";
                    updatedRows = response.data.updates?.updatedRows || 0;
                    break;
                case "update":
                    if (!input.data) {
                        throw new Error("Data required for update action");
                    }
                    // Ensure data is in the correct format
                    const updateData = Array.isArray(input.data)
                        ? input.data
                        : [input.data];
                    response = await sheets.spreadsheets.values.update({
                        spreadsheetId,
                        range: input.range,
                        valueInputOption: input.valueInputOption,
                        requestBody: {
                            values: updateData,
                        },
                    });
                    updatedRange = response.data.updatedRange || "";
                    updatedRows = response.data.updatedRows || 0;
                    break;
                default:
                    throw new Error(`Action ${input.action} not implemented`);
            }
            logs.push(`Google Sheets ${input.action} completed successfully`);
            return {
                success: true,
                output: {
                    data,
                    updatedRange,
                    updatedRows,
                    response: response.data,
                },
                logs,
                executionTime: Date.now() - startTime,
            };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logs.push(`Google Sheets action failed: ${errorMessage}`);
            return {
                success: false,
                error: errorMessage,
                logs,
                executionTime: Date.now() - startTime,
            };
        }
    },
};
exports.googleSheetsNode = googleSheetsNode;
