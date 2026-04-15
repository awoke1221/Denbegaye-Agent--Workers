import { z } from "zod";
import {
  NodeDefinition,
  NodeExecutionContext,
  NodeExecutionResult,
  nodeRegistry,
} from "../index";
import { google } from "googleapis";

// Google Sheets Node
const googleSheetsConfigSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().optional(),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  spreadsheetId: z.string().optional(),
});

const googleSheetsNode: NodeDefinition = {
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
    input: z.object({
      action: z.enum(["read", "write", "append", "update"]),
      spreadsheetId: z.string().optional(),
      range: z.string().min(1),
      data: z.any().optional(),
      valueInputOption: z.enum(["RAW", "USER_ENTERED"]).default("RAW"),
    }),
    output: z.object({
      data: z.array(z.array(z.any())),
      updatedRange: z.string().optional(),
      updatedRows: z.number().optional(),
      response: z.any(),
    }),
  },

  handler: async (
    context: NodeExecutionContext,
  ): Promise<NodeExecutionResult> => {
    const startTime = Date.now();
    const logs: string[] = [];

    try {
      const config = googleSheetsConfigSchema.parse(context.config);
      const input = context.validation.input.parse(context.input);

      logs.push(`Performing Google Sheets ${input.action} action`);

      // Set up OAuth2 client
      const oauth2Client = new google.auth.OAuth2(
        config.clientId,
        config.clientSecret,
      );

      oauth2Client.setCredentials({
        access_token: config.accessToken,
        refresh_token: config.refreshToken,
      });

      const sheets = google.sheets({ version: "v4", auth: oauth2Client });
      const spreadsheetId = input.spreadsheetId || config.spreadsheetId;

      if (!spreadsheetId) {
        throw new Error("Spreadsheet ID not provided");
      }

      let response;
      let data: any[][] = [];
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
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
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

export { googleSheetsNode };
