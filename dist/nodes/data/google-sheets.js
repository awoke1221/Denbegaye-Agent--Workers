"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.googleSheetsTriggerNode = exports.googleSheetsNode = void 0;
const zod_1 = require("zod");
const googleapis_1 = require("googleapis");
const crypto = __importStar(require("crypto"));
// Google Sheets Configuration Schema
const googleSheetsConfigSchema = zod_1.z.object({
    authMethod: zod_1.z.enum(["manual", "google-oauth"]).default("manual"),
    // Manual auth fields
    accessToken: zod_1.z.string().optional(),
    refreshToken: zod_1.z.string().optional(),
    clientId: zod_1.z.string().optional(),
    clientSecret: zod_1.z.string().optional(),
    // Supabase OAuth fields
    providerToken: zod_1.z.string().optional(),
    spreadsheetId: zod_1.z.string().optional(),
});
// Google Sheets Trigger Configuration Schema
const googleSheetsTriggerConfigSchema = zod_1.z.object({
    authMethod: zod_1.z.enum(["manual", "google-oauth"]).default("manual"),
    // Manual auth fields
    accessToken: zod_1.z.string().optional(),
    refreshToken: zod_1.z.string().optional(),
    clientId: zod_1.z.string().optional(),
    clientSecret: zod_1.z.string().optional(),
    // Supabase OAuth fields
    providerToken: zod_1.z.string().optional(),
    spreadsheetId: zod_1.z.string().min(1),
    sheetName: zod_1.z.string().min(1),
    triggerType: zod_1.z.enum(["onNewRow", "onRowChanged", "onSheetChanged"]),
    checkInterval: zod_1.z.number().min(1000).default(60000), // 60 seconds
    useHeaderRow: zod_1.z.boolean().default(true),
});
// Helper function to create OAuth2 client
function createOAuth2Client(config) {
    if (config.authMethod === "google-oauth") {
        if (!config.providerToken) {
            throw new Error("Provider token required for Google OAuth authentication");
        }
        // For Supabase OAuth, we use the provider token directly
        const oauth2Client = new googleapis_1.google.auth.OAuth2();
        oauth2Client.setCredentials({
            access_token: config.providerToken,
        });
        return oauth2Client;
    }
    else {
        // Manual auth
        if (!config.accessToken || !config.clientId || !config.clientSecret) {
            throw new Error("Access token, client ID, and client secret required for manual authentication");
        }
        const oauth2Client = new googleapis_1.google.auth.OAuth2(config.clientId, config.clientSecret);
        oauth2Client.setCredentials({
            access_token: config.accessToken,
            refresh_token: config.refreshToken,
        });
        return oauth2Client;
    }
}
// Helper function to get spreadsheet ID
function getSpreadsheetId(input, config) {
    return input.spreadsheetId || config.spreadsheetId || "";
}
// Helper function to build range from sheetName
function buildRange(sheetName, range) {
    if (range)
        return range;
    return `${sheetName}!A:Z`;
}
// Helper function to convert data to arrays
function convertDataToArrays(data, headers) {
    if (Array.isArray(data) && Array.isArray(data[0])) {
        return data; // Already array of arrays
    }
    if (Array.isArray(data) && typeof data[0] === "object") {
        // Array of objects, convert using headers
        if (!headers)
            throw new Error("Headers required for object data conversion");
        return data.map((row) => headers.map((header) => row[header] || ""));
    }
    if (typeof data === "object") {
        // Single object
        if (!headers)
            throw new Error("Headers required for object data conversion");
        return [headers.map((header) => data[header] || "")];
    }
    throw new Error("Invalid data format");
}
// Helper function to convert arrays to objects
function convertArraysToObjects(data, headers, includeRowNumbers = false, startRow = 0) {
    if (!headers)
        return data.map((row, index) => ({
            ...row,
            ...(includeRowNumbers ? { _rowNumber: startRow + index + 1 } : {}),
        }));
    return data.map((row, index) => {
        const obj = {};
        headers.forEach((header, i) => {
            obj[header] = row[i] || "";
        });
        if (includeRowNumbers)
            obj._rowNumber = startRow + index + 1;
        return obj;
    });
}
// Helper function to hash data for comparison
function hashData(data) {
    return crypto.createHash("md5").update(JSON.stringify(data)).digest("hex");
}
// Helper function to parse Google API error
function parseGoogleError(error) {
    if (error.response?.data?.error?.message) {
        return `Google API Error: ${error.response.data.error.message}`;
    }
    return error.message || String(error);
}
/**
 * Read values from a Google Sheets range
 */
async function handleRead(sheets, spreadsheetId, range, useHeaderRow, includeRowNumbers) {
    const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range,
    });
    const values = response.data.values || [];
    const rowCount = values.length;
    const isEmpty = rowCount === 0;
    let data;
    if (useHeaderRow && values.length > 0) {
        const headers = values[0];
        const dataRows = values.slice(1);
        data = convertArraysToObjects(dataRows, headers, includeRowNumbers, 1);
    }
    else {
        data = convertArraysToObjects(values, undefined, includeRowNumbers, 0);
    }
    return { data, rowCount, isEmpty };
}
/**
 * Append rows to a Google Sheets range
 */
async function handleAppend(sheets, spreadsheetId, range, data, valueInputOption, headers) {
    const values = convertDataToArrays(data, headers);
    const response = await sheets.spreadsheets.values.append({
        spreadsheetId,
        range,
        valueInputOption,
        requestBody: { values },
    });
    const updatedRange = response.data.updates?.updatedRange || "";
    const updatedRows = response.data.updates?.updatedRows || 0;
    // Get total row count
    const sheetName = range.split("!")[0];
    const metadata = await sheets.spreadsheets.get({ spreadsheetId });
    const sheet = metadata.data.sheets?.find((s) => s.properties?.title === sheetName);
    const rowCount = sheet?.properties?.gridProperties?.rowCount || 0;
    return { updatedRange, updatedRows, rowCount };
}
/**
 * Update a specific range in Google Sheets
 */
async function handleUpdate(sheets, spreadsheetId, range, data, valueInputOption, headers) {
    const values = convertDataToArrays(data, headers);
    const response = await sheets.spreadsheets.values.update({
        spreadsheetId,
        range,
        valueInputOption,
        requestBody: { values },
    });
    const updatedRange = response.data.updatedRange || "";
    const updatedRows = response.data.updatedRows || 0;
    // Get total row count
    const sheetName = range.split("!")[0];
    const metadata = await sheets.spreadsheets.get({ spreadsheetId });
    const sheet = metadata.data.sheets?.find((s) => s.properties?.title === sheetName);
    const rowCount = sheet?.properties?.gridProperties?.rowCount || 0;
    return { updatedRange, updatedRows, rowCount };
}
/**
 * Delete rows by row index
 */
async function handleDelete(sheets, spreadsheetId, sheetId, rowIndexes) {
    // Sort in descending order to avoid index shifting
    rowIndexes.sort((a, b) => b - a);
    const requests = rowIndexes.map((rowIndex) => ({
        deleteDimension: {
            range: {
                sheetId,
                dimension: "ROWS",
                startIndex: rowIndex - 1, // 0-based
                endIndex: rowIndex,
            },
        },
    }));
    await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests },
    });
    // Get updated row count
    const metadata = await sheets.spreadsheets.get({ spreadsheetId });
    const sheet = metadata.data.sheets?.find((s) => s.properties?.sheetId === sheetId);
    const rowCount = sheet?.properties?.gridProperties?.rowCount || 0;
    return { affectedRows: rowIndexes.length, rowCount };
}
/**
 * Clear all values in a range
 */
async function handleClear(sheets, spreadsheetId, range) {
    await sheets.spreadsheets.values.clear({
        spreadsheetId,
        range,
    });
    // Get row count
    const sheetName = range.split("!")[0];
    const metadata = await sheets.spreadsheets.get({ spreadsheetId });
    const sheet = metadata.data.sheets?.find((s) => s.properties?.title === sheetName);
    const rowCount = sheet?.properties?.gridProperties?.rowCount || 0;
    return { clearedRange: range, rowCount };
}
/**
 * Find rows where a specific column matches a value
 */
async function handleFind(sheets, spreadsheetId, range, column, value, useHeaderRow, includeRowNumbers) {
    const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range,
    });
    const values = response.data.values || [];
    const headers = useHeaderRow && values.length > 0 ? values[0] : null;
    const dataRows = useHeaderRow ? values.slice(1) : values;
    let columnIndex;
    if (typeof column === "string" && headers) {
        columnIndex = headers.indexOf(column);
        if (columnIndex === -1)
            throw new Error(`Column "${column}" not found in headers`);
    }
    else if (typeof column === "number") {
        columnIndex = column - 1; // 1-based to 0-based
    }
    else {
        throw new Error("Invalid column specification");
    }
    const matchingRows = [];
    dataRows.forEach((row, index) => {
        if (row[columnIndex] == value) {
            // Loose equality for string/number comparison
            const startRow = useHeaderRow ? 1 : 0;
            if (headers) {
                const obj = {};
                headers.forEach((header, i) => (obj[header] = row[i] || ""));
                if (includeRowNumbers)
                    obj._rowNumber = startRow + index + 1;
                matchingRows.push(obj);
            }
            else {
                const obj = [...row];
                if (includeRowNumbers)
                    obj._rowNumber = startRow + index + 1;
                matchingRows.push(obj);
            }
        }
    });
    return {
        data: matchingRows,
        rowCount: matchingRows.length,
        isEmpty: matchingRows.length === 0,
    };
}
/**
 * Upsert: find a row by column+value, update if found, append if not
 */
async function handleUpsert(sheets, spreadsheetId, range, column, value, data, valueInputOption, useHeaderRow) {
    const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range,
    });
    const values = response.data.values || [];
    const headers = useHeaderRow && values.length > 0 ? values[0] : null;
    const dataRows = useHeaderRow ? values.slice(1) : values;
    let columnIndex;
    if (typeof column === "string" && headers) {
        columnIndex = headers.indexOf(column);
        if (columnIndex === -1)
            throw new Error(`Column "${column}" not found in headers`);
    }
    else if (typeof column === "number") {
        columnIndex = column - 1;
    }
    else {
        throw new Error("Invalid column specification");
    }
    const rowIndex = dataRows.findIndex((row) => row[columnIndex] == value);
    if (rowIndex !== -1) {
        // Update existing row
        const updateRange = `${range.split("!")[0]}!${String.fromCharCode(65 + columnIndex)}${useHeaderRow ? rowIndex + 2 : rowIndex + 1}`;
        const updateData = convertDataToArrays(data, headers);
        const response = await sheets.spreadsheets.values.update({
            spreadsheetId,
            range: updateRange,
            valueInputOption,
            requestBody: { values: updateData },
        });
        const updatedRange = response.data.updatedRange || "";
        const updatedRows = response.data.updatedRows || 0;
        // Get row count
        const sheetName = range.split("!")[0];
        const metadata = await sheets.spreadsheets.get({ spreadsheetId });
        const sheet = metadata.data.sheets?.find((s) => s.properties?.title === sheetName);
        const rowCount = sheet?.properties?.gridProperties?.rowCount || 0;
        return { action: "updated", updatedRange, updatedRows, rowCount };
    }
    else {
        // Append new row
        const appendData = convertDataToArrays(data, headers);
        const response = await sheets.spreadsheets.values.append({
            spreadsheetId,
            range,
            valueInputOption,
            requestBody: { values: appendData },
        });
        const updatedRange = response.data.updates?.updatedRange || "";
        const updatedRows = response.data.updates?.updatedRows || 0;
        // Get row count
        const sheetName = range.split("!")[0];
        const metadata = await sheets.spreadsheets.get({ spreadsheetId });
        const sheet = metadata.data.sheets?.find((s) => s.properties?.title === sheetName);
        const rowCount = sheet?.properties?.gridProperties?.rowCount || 0;
        return { action: "appended", updatedRange, updatedRows, rowCount };
    }
}
/**
 * Create a new Google Spreadsheet
 */
async function handleCreateSpreadsheet(sheets, title) {
    const response = await sheets.spreadsheets.create({
        requestBody: {
            properties: { title },
        },
    });
    const spreadsheetId = response.data.spreadsheetId;
    const spreadsheetUrl = response.data.spreadsheetUrl;
    return { spreadsheetId, spreadsheetUrl };
}
/**
 * Add a new sheet/tab to an existing spreadsheet
 */
async function handleCreateSheet(sheets, spreadsheetId, sheetName) {
    const response = await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
            requests: [
                {
                    addSheet: {
                        properties: { title: sheetName },
                    },
                },
            ],
        },
    });
    const sheet = response.data.replies?.[0]?.addSheet;
    return {
        sheetId: sheet.properties.sheetId,
        sheetName: sheet.properties.title,
    };
}
/**
 * Delete a sheet by name or sheetId
 */
async function handleDeleteSheet(sheets, spreadsheetId, sheetName, sheetId) {
    if (!sheetId && !sheetName)
        throw new Error("Either sheetName or sheetId must be provided");
    if (!sheetId) {
        // Get sheetId from name
        const metadata = await sheets.spreadsheets.get({ spreadsheetId });
        const sheet = metadata.data.sheets?.find((s) => s.properties?.title === sheetName);
        if (!sheet)
            throw new Error(`Sheet "${sheetName}" not found`);
        sheetId = sheet.properties?.sheetId;
        if (!sheetId)
            throw new Error(`Sheet "${sheetName}" has no sheetId`);
    }
    await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
            requests: [
                {
                    deleteSheet: { sheetId },
                },
            ],
        },
    });
    return { deletedSheetId: sheetId, deletedSheetName: sheetName || "" };
}
/**
 * Get spreadsheet metadata
 */
async function handleGetMetadata(sheets, spreadsheetId) {
    const response = await sheets.spreadsheets.get({ spreadsheetId });
    const title = response.data.properties?.title || "";
    const sheetsList = response.data.sheets?.map((sheet) => ({
        sheetId: sheet.properties?.sheetId,
        name: sheet.properties?.title,
        rowCount: sheet.properties?.gridProperties?.rowCount || 0,
        columnCount: sheet.properties?.gridProperties?.columnCount || 0,
    })) || [];
    return { title, sheets: sheetsList };
}
/**
 * List accessible Google Sheets spreadsheets for the authenticated account
 */
async function handleListSpreadsheets(authClient, query) {
    const drive = googleapis_1.google.drive({ version: "v3", auth: authClient });
    const baseQuery = "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false";
    const q = query
        ? `${baseQuery} and name contains '${query.replace(/'/g, "\\'")}'`
        : baseQuery;
    const response = await drive.files.list({
        q,
        fields: "files(id,name)",
        pageSize: 100,
        orderBy: "name",
    });
    const spreadsheets = response.data.files?.map((file) => ({
        id: file.id || "",
        name: file.name || "Untitled spreadsheet",
    })) || [];
    return { spreadsheets };
}
/**
 * Batch update multiple ranges
 */
async function handleBatchUpdate(sheets, spreadsheetId, updates, valueInputOption) {
    const data = updates.map((update) => ({
        range: update.range,
        values: update.values,
    }));
    const response = await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        requestBody: {
            valueInputOption,
            data,
        },
    });
    const updatedRanges = response.data.responses?.map((res) => res.updatedRange || "") || [];
    const totalUpdatedRows = response.data.totalUpdatedRows || 0;
    return { updatedRanges, totalUpdatedRows };
}
/**
 * Apply cell formatting
 */
async function handleFormatCells(sheets, spreadsheetId, range, formatting) {
    const requests = [];
    if (formatting.bold !== undefined ||
        formatting.fontSize !== undefined ||
        formatting.backgroundColor ||
        formatting.textColor) {
        const repeatCell = {
            range: { range },
            cell: { userEnteredFormat: {} },
        };
        if (formatting.bold !== undefined) {
            repeatCell.cell.userEnteredFormat.textFormat = { bold: formatting.bold };
        }
        if (formatting.fontSize !== undefined) {
            repeatCell.cell.userEnteredFormat.textFormat = {
                ...repeatCell.cell.userEnteredFormat.textFormat,
                fontSize: formatting.fontSize,
            };
        }
        if (formatting.backgroundColor) {
            repeatCell.cell.userEnteredFormat.backgroundColor =
                formatting.backgroundColor;
        }
        if (formatting.textColor) {
            repeatCell.cell.userEnteredFormat.textFormat = {
                ...repeatCell.cell.userEnteredFormat.textFormat,
                foregroundColor: formatting.textColor,
            };
        }
        requests.push({ repeatCell });
    }
    if (requests.length > 0) {
        await sheets.spreadsheets.batchUpdate({
            spreadsheetId,
            requestBody: { requests },
        });
    }
    return { formattedRange: range };
}
/**
 * Bulk delete rows
 */
async function handleBulkDeleteRows(sheets, spreadsheetId, sheetId, rowIndexes) {
    // Sort in descending order
    rowIndexes.sort((a, b) => b - a);
    const requests = rowIndexes.map((rowIndex) => ({
        deleteDimension: {
            range: {
                sheetId,
                dimension: "ROWS",
                startIndex: rowIndex - 1,
                endIndex: rowIndex,
            },
        },
    }));
    await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests },
    });
    // Get updated row count
    const metadata = await sheets.spreadsheets.get({ spreadsheetId });
    const sheet = metadata.data.sheets?.find((s) => s.properties?.sheetId === sheetId);
    const rowCount = sheet?.properties?.gridProperties?.rowCount || 0;
    return { affectedRows: rowIndexes.length, rowCount };
}
// Main Google Sheets Node
const googleSheetsNode = {
    id: "google-sheets",
    type: "data-google-sheets",
    name: "Google Sheets",
    description: "Read and write data to Google Sheets with advanced operations",
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
            description: "Action to perform (read, append, update, delete, clear, find, upsert, createSpreadsheet, createSheet, deleteSheet, getMetadata, batchUpdate, formatCells, bulkDeleteRows)",
        },
        {
            id: "spreadsheetId",
            label: "Spreadsheet ID",
            type: "string",
            required: false,
            description: "Google Sheets spreadsheet ID",
        },
        {
            id: "sheetName",
            label: "Sheet Name",
            type: "string",
            required: false,
            description: "Sheet name (alternative to range)",
        },
        {
            id: "query",
            label: "Search Query",
            type: "string",
            required: false,
            description: "Optional search text to filter spreadsheet names when listing accessible sheets",
        },
        {
            id: "range",
            label: "Range",
            type: "string",
            required: false,
            description: "Sheet range (e.g., Sheet1!A1:B10)",
        },
        {
            id: "data",
            label: "Data",
            type: "any",
            required: false,
            description: "Data to write, update, or append",
        },
        {
            id: "valueInputOption",
            label: "Value Input Option",
            type: "string",
            required: false,
            description: "How to interpret input values (RAW or USER_ENTERED)",
        },
        {
            id: "useHeaderRow",
            label: "Use Header Row",
            type: "boolean",
            required: false,
            description: "Treat first row as headers for object conversion",
        },
        {
            id: "includeRowNumbers",
            label: "Include Row Numbers",
            type: "boolean",
            required: false,
            description: "Include _rowNumber in output objects",
        },
        {
            id: "column",
            label: "Column",
            type: "any",
            required: false,
            description: "Column name or index for find/upsert operations",
        },
        {
            id: "value",
            label: "Value",
            type: "any",
            required: false,
            description: "Value to match for find/upsert operations",
        },
        {
            id: "title",
            label: "Title",
            type: "string",
            required: false,
            description: "Title for new spreadsheet",
        },
        {
            id: "sheetId",
            label: "Sheet ID",
            type: "number",
            required: false,
            description: "Sheet ID for delete operations",
        },
        {
            id: "updates",
            label: "Updates",
            type: "array",
            required: false,
            description: "Array of {range, values} for batchUpdate",
        },
        {
            id: "formatting",
            label: "Formatting",
            type: "object",
            required: false,
            description: "Cell formatting options",
        },
        {
            id: "rowIndexes",
            label: "Row Indexes",
            type: "array",
            required: false,
            description: "Array of row indexes for bulk delete",
        },
    ],
    outputs: [
        {
            id: "data",
            label: "Data",
            type: "any",
            description: "Retrieved or processed data",
        },
        {
            id: "rowCount",
            label: "Row Count",
            type: "number",
            description: "Total number of rows",
        },
        {
            id: "isEmpty",
            label: "Is Empty",
            type: "boolean",
            description: "Whether the result is empty",
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
            id: "affectedRange",
            label: "Affected Range",
            type: "string",
            description: "Range affected by the operation",
        },
        {
            id: "affectedRows",
            label: "Affected Rows",
            type: "number",
            description: "Number of rows affected",
        },
        {
            id: "spreadsheetId",
            label: "Spreadsheet ID",
            type: "string",
            description: "Created spreadsheet ID",
        },
        {
            id: "spreadsheetUrl",
            label: "Spreadsheet URL",
            type: "string",
            description: "Created spreadsheet URL",
        },
        {
            id: "sheetId",
            label: "Sheet ID",
            type: "number",
            description: "Created or deleted sheet ID",
        },
        {
            id: "sheetName",
            label: "Sheet Name",
            type: "string",
            description: "Sheet name",
        },
        {
            id: "title",
            label: "Title",
            type: "string",
            description: "Spreadsheet title",
        },
        {
            id: "sheets",
            label: "Sheets",
            type: "array",
            description: "List of sheets with metadata",
        },
        {
            id: "spreadsheets",
            label: "Spreadsheets",
            type: "array",
            description: "List of accessible spreadsheets for the connected Google account",
        },
        {
            id: "updatedRanges",
            label: "Updated Ranges",
            type: "array",
            description: "Ranges updated in batch operation",
        },
        {
            id: "totalUpdatedRows",
            label: "Total Updated Rows",
            type: "number",
            description: "Total rows updated in batch",
        },
        {
            id: "formattedRange",
            label: "Formatted Range",
            type: "string",
            description: "Range that was formatted",
        },
        {
            id: "action",
            label: "Action Performed",
            type: "string",
            description: "Action that was performed (for upsert)",
        },
    ],
    validation: {
        input: zod_1.z.object({
            action: zod_1.z.enum([
                "read",
                "append",
                "update",
                "delete",
                "clear",
                "find",
                "upsert",
                "createSpreadsheet",
                "createSheet",
                "deleteSheet",
                "getMetadata",
                "listSpreadsheets",
                "batchUpdate",
                "formatCells",
                "bulkDeleteRows",
            ]),
            spreadsheetId: zod_1.z.string().optional(),
            sheetName: zod_1.z.string().optional(),
            query: zod_1.z.string().optional(),
            range: zod_1.z.string().optional(),
            data: zod_1.z.any().optional(),
            valueInputOption: zod_1.z.enum(["RAW", "USER_ENTERED"]).default("RAW"),
            useHeaderRow: zod_1.z.boolean().default(true),
            includeRowNumbers: zod_1.z.boolean().default(false),
            column: zod_1.z.union([zod_1.z.string(), zod_1.z.number()]).optional(),
            value: zod_1.z.any().optional(),
            title: zod_1.z.string().optional(),
            sheetId: zod_1.z.number().optional(),
            updates: zod_1.z
                .array(zod_1.z.object({ range: zod_1.z.string(), values: zod_1.z.array(zod_1.z.array(zod_1.z.any())) }))
                .optional(),
            formatting: zod_1.z
                .object({
                bold: zod_1.z.boolean().optional(),
                fontSize: zod_1.z.number().optional(),
                backgroundColor: zod_1.z
                    .object({ red: zod_1.z.number(), green: zod_1.z.number(), blue: zod_1.z.number() })
                    .optional(),
                textColor: zod_1.z
                    .object({ red: zod_1.z.number(), green: zod_1.z.number(), blue: zod_1.z.number() })
                    .optional(),
            })
                .optional(),
            rowIndexes: zod_1.z.array(zod_1.z.number()).optional(),
        }),
        output: zod_1.z.object({
            data: zod_1.z.any(),
            rowCount: zod_1.z.number(),
            isEmpty: zod_1.z.boolean().optional(),
            updatedRange: zod_1.z.string().optional(),
            updatedRows: zod_1.z.number().optional(),
            affectedRange: zod_1.z.string().optional(),
            affectedRows: zod_1.z.number().optional(),
            spreadsheetId: zod_1.z.string().optional(),
            spreadsheetUrl: zod_1.z.string().optional(),
            sheetId: zod_1.z.number().optional(),
            sheetName: zod_1.z.string().optional(),
            title: zod_1.z.string().optional(),
            sheets: zod_1.z.array(zod_1.z.any()).optional(),
            spreadsheets: zod_1.z.array(zod_1.z.any()).optional(),
            updatedRanges: zod_1.z.array(zod_1.z.string()).optional(),
            totalUpdatedRows: zod_1.z.number().optional(),
            formattedRange: zod_1.z.string().optional(),
            action: zod_1.z.string().optional(),
        }),
    },
    handler: async (context) => {
        const startTime = Date.now();
        const logs = [];
        try {
            const config = googleSheetsConfigSchema.parse(context.config);
            const input = context.validation.input.parse(context.input);
            logs.push(`Performing Google Sheets ${input.action} action`);
            const oauth2Client = createOAuth2Client(config);
            const sheets = googleapis_1.google.sheets({ version: "v4", auth: oauth2Client });
            let result = {};
            switch (input.action) {
                case "read": {
                    const spreadsheetId = getSpreadsheetId(input, config);
                    if (!spreadsheetId)
                        throw new Error("Spreadsheet ID required for read");
                    const range = buildRange(input.sheetName || "", input.range);
                    const { data, rowCount, isEmpty } = await handleRead(sheets, spreadsheetId, range, input.useHeaderRow, input.includeRowNumbers);
                    result = { data, rowCount, isEmpty };
                    break;
                }
                case "append": {
                    const spreadsheetId = getSpreadsheetId(input, config);
                    if (!spreadsheetId)
                        throw new Error("Spreadsheet ID required for append");
                    const range = buildRange(input.sheetName || "", input.range);
                    if (!input.data)
                        throw new Error("Data required for append");
                    // Get headers if using header row
                    let headers;
                    if (input.useHeaderRow) {
                        const headerResponse = await sheets.spreadsheets.values.get({
                            spreadsheetId,
                            range: `${range.split("!")[0]}!1:1`,
                        });
                        headers = headerResponse.data.values?.[0];
                    }
                    const { updatedRange, updatedRows, rowCount } = await handleAppend(sheets, spreadsheetId, range, input.data, input.valueInputOption, headers);
                    result = {
                        updatedRange,
                        updatedRows,
                        rowCount,
                        affectedRange: updatedRange,
                        affectedRows: updatedRows,
                    };
                    break;
                }
                case "update": {
                    const spreadsheetId = getSpreadsheetId(input, config);
                    if (!spreadsheetId)
                        throw new Error("Spreadsheet ID required for update");
                    const range = buildRange(input.sheetName || "", input.range);
                    if (!input.data)
                        throw new Error("Data required for update");
                    let headers;
                    if (input.useHeaderRow) {
                        const headerResponse = await sheets.spreadsheets.values.get({
                            spreadsheetId,
                            range: `${range.split("!")[0]}!1:1`,
                        });
                        headers = headerResponse.data.values?.[0];
                    }
                    const { updatedRange, updatedRows, rowCount } = await handleUpdate(sheets, spreadsheetId, range, input.data, input.valueInputOption, headers);
                    result = {
                        updatedRange,
                        updatedRows,
                        rowCount,
                        affectedRange: updatedRange,
                        affectedRows: updatedRows,
                    };
                    break;
                }
                case "delete": {
                    const spreadsheetId = getSpreadsheetId(input, config);
                    if (!spreadsheetId)
                        throw new Error("Spreadsheet ID required for delete");
                    if (!input.rowIndexes || !Array.isArray(input.rowIndexes))
                        throw new Error("rowIndexes array required for delete");
                    // Get sheetId
                    const sheetName = input.sheetName || input.range?.split("!")[0];
                    if (!sheetName)
                        throw new Error("Sheet name required for delete");
                    const metadata = await sheets.spreadsheets.get({ spreadsheetId });
                    const sheet = metadata.data.sheets?.find((s) => s.properties?.title === sheetName);
                    if (!sheet)
                        throw new Error(`Sheet "${sheetName}" not found`);
                    const sheetId = sheet.properties?.sheetId;
                    if (!sheetId)
                        throw new Error(`Sheet "${sheetName}" has no sheetId`);
                    const { affectedRows, rowCount } = await handleDelete(sheets, spreadsheetId, sheetId, input.rowIndexes);
                    result = { affectedRows, rowCount };
                    break;
                }
                case "clear": {
                    const spreadsheetId = getSpreadsheetId(input, config);
                    if (!spreadsheetId)
                        throw new Error("Spreadsheet ID required for clear");
                    const range = buildRange(input.sheetName || "", input.range);
                    const { clearedRange, rowCount } = await handleClear(sheets, spreadsheetId, range);
                    result = { clearedRange, rowCount, affectedRange: clearedRange };
                    break;
                }
                case "find": {
                    const spreadsheetId = getSpreadsheetId(input, config);
                    if (!spreadsheetId)
                        throw new Error("Spreadsheet ID required for find");
                    const range = buildRange(input.sheetName || "", input.range);
                    if (input.column === undefined || input.value === undefined)
                        throw new Error("Column and value required for find");
                    const { data, rowCount, isEmpty } = await handleFind(sheets, spreadsheetId, range, input.column, input.value, input.useHeaderRow, input.includeRowNumbers);
                    result = { data, rowCount, isEmpty };
                    break;
                }
                case "upsert": {
                    const spreadsheetId = getSpreadsheetId(input, config);
                    if (!spreadsheetId)
                        throw new Error("Spreadsheet ID required for upsert");
                    const range = buildRange(input.sheetName || "", input.range);
                    if (input.column === undefined ||
                        input.value === undefined ||
                        !input.data)
                        throw new Error("Column, value, and data required for upsert");
                    let headers;
                    if (input.useHeaderRow) {
                        const headerResponse = await sheets.spreadsheets.values.get({
                            spreadsheetId,
                            range: `${range.split("!")[0]}!1:1`,
                        });
                        headers = headerResponse.data.values?.[0];
                    }
                    const { action, updatedRange, updatedRows, rowCount } = await handleUpsert(sheets, spreadsheetId, range, input.column, input.value, input.data, input.valueInputOption, input.useHeaderRow);
                    result = {
                        action,
                        updatedRange,
                        updatedRows,
                        rowCount,
                        affectedRange: updatedRange,
                        affectedRows: updatedRows,
                    };
                    break;
                }
                case "createSpreadsheet": {
                    if (!input.title)
                        throw new Error("Title required for createSpreadsheet");
                    const { spreadsheetId, spreadsheetUrl } = await handleCreateSpreadsheet(sheets, input.title);
                    result = { spreadsheetId, spreadsheetUrl };
                    break;
                }
                case "createSheet": {
                    const spreadsheetId = getSpreadsheetId(input, config);
                    if (!spreadsheetId)
                        throw new Error("Spreadsheet ID required for createSheet");
                    if (!input.sheetName)
                        throw new Error("Sheet name required for createSheet");
                    const { sheetId, sheetName } = await handleCreateSheet(sheets, spreadsheetId, input.sheetName);
                    result = { sheetId, sheetName };
                    break;
                }
                case "deleteSheet": {
                    const spreadsheetId = getSpreadsheetId(input, config);
                    if (!spreadsheetId)
                        throw new Error("Spreadsheet ID required for deleteSheet");
                    const { deletedSheetId, deletedSheetName } = await handleDeleteSheet(sheets, spreadsheetId, input.sheetName, input.sheetId);
                    result = { sheetId: deletedSheetId, sheetName: deletedSheetName };
                    break;
                }
                case "getMetadata": {
                    const spreadsheetId = getSpreadsheetId(input, config);
                    if (!spreadsheetId)
                        throw new Error("Spreadsheet ID required for getMetadata");
                    const { title, sheets: sheetsList } = await handleGetMetadata(sheets, spreadsheetId);
                    result = { title, sheets: sheetsList };
                    break;
                }
                case "listSpreadsheets": {
                    const { spreadsheets } = await handleListSpreadsheets(oauth2Client, input.query);
                    result = { spreadsheets };
                    break;
                }
                case "batchUpdate": {
                    const spreadsheetId = getSpreadsheetId(input, config);
                    if (!spreadsheetId)
                        throw new Error("Spreadsheet ID required for batchUpdate");
                    if (!input.updates || !Array.isArray(input.updates))
                        throw new Error("Updates array required for batchUpdate");
                    const { updatedRanges, totalUpdatedRows } = await handleBatchUpdate(sheets, spreadsheetId, input.updates, input.valueInputOption);
                    result = { updatedRanges, totalUpdatedRows };
                    break;
                }
                case "formatCells": {
                    const spreadsheetId = getSpreadsheetId(input, config);
                    if (!spreadsheetId)
                        throw new Error("Spreadsheet ID required for formatCells");
                    const range = buildRange(input.sheetName || "", input.range);
                    if (!input.formatting)
                        throw new Error("Formatting object required for formatCells");
                    const { formattedRange } = await handleFormatCells(sheets, spreadsheetId, range, input.formatting);
                    result = { formattedRange };
                    break;
                }
                case "bulkDeleteRows": {
                    const spreadsheetId = getSpreadsheetId(input, config);
                    if (!spreadsheetId)
                        throw new Error("Spreadsheet ID required for bulkDeleteRows");
                    if (!input.rowIndexes || !Array.isArray(input.rowIndexes))
                        throw new Error("rowIndexes array required for bulkDeleteRows");
                    // Get sheetId
                    const sheetName = input.sheetName || input.range?.split("!")[0];
                    if (!sheetName)
                        throw new Error("Sheet name required for bulkDeleteRows");
                    const metadata = await sheets.spreadsheets.get({ spreadsheetId });
                    const sheet = metadata.data.sheets?.find((s) => s.properties?.title === sheetName);
                    if (!sheet)
                        throw new Error(`Sheet "${sheetName}" not found`);
                    const sheetId = sheet.properties?.sheetId;
                    if (!sheetId)
                        throw new Error(`Sheet "${sheetName}" has no sheetId`);
                    const { affectedRows, rowCount } = await handleBulkDeleteRows(sheets, spreadsheetId, sheetId, input.rowIndexes);
                    result = { affectedRows, rowCount };
                    break;
                }
                default:
                    throw new Error(`Action ${input.action} not implemented`);
            }
            logs.push(`Google Sheets ${input.action} completed successfully`);
            return {
                success: true,
                output: result,
                logs,
                executionTime: Date.now() - startTime,
            };
        }
        catch (error) {
            const errorMessage = parseGoogleError(error);
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
// Google Sheets Trigger Node
const googleSheetsTriggerNode = {
    id: "google-sheets-trigger",
    type: "trigger-google-sheets",
    name: "Google Sheets Trigger",
    description: "Triggers on changes to Google Sheets",
    category: "trigger",
    icon: "📊",
    color: "#0F9D58",
    configSchema: googleSheetsTriggerConfigSchema,
    inputs: [], // Trigger nodes don't have inputs
    outputs: [
        {
            id: "newRows",
            label: "New Rows",
            type: "array",
            description: "Newly added rows",
        },
        {
            id: "changedRows",
            label: "Changed Rows",
            type: "array",
            description: "Rows that have changed",
        },
        {
            id: "deletedRows",
            label: "Deleted Rows",
            type: "array",
            description: "Rows that have been deleted",
        },
        {
            id: "triggerType",
            label: "Trigger Type",
            type: "string",
            description: "Type of trigger that fired",
        },
        {
            id: "timestamp",
            label: "Timestamp",
            type: "string",
            description: "Timestamp of the trigger",
        },
    ],
    validation: {
        input: zod_1.z.object({}), // No inputs for triggers
        output: zod_1.z.object({
            newRows: zod_1.z.array(zod_1.z.any()),
            changedRows: zod_1.z.array(zod_1.z.object({
                rowNumber: zod_1.z.number(),
                before: zod_1.z.any(),
                after: zod_1.z.any(),
            })),
            deletedRows: zod_1.z.array(zod_1.z.number()),
            triggerType: zod_1.z.enum(["onNewRow", "onRowChanged", "onSheetChanged"]),
            timestamp: zod_1.z.string(),
        }),
    },
    handler: async (context) => {
        const startTime = Date.now();
        const logs = [];
        try {
            const config = googleSheetsTriggerConfigSchema.parse(context.config);
            logs.push(`Google Sheets trigger checking for ${config.triggerType}`);
            const oauth2Client = createOAuth2Client(config);
            const sheets = googleapis_1.google.sheets({ version: "v4", auth: oauth2Client });
            // Get current data
            const response = await sheets.spreadsheets.values.get({
                spreadsheetId: config.spreadsheetId,
                range: `${config.sheetName}!A:Z`,
            });
            const currentValues = response.data.values || [];
            const currentRowCount = currentValues.length;
            const currentHash = hashData(currentValues);
            // Get previous state from context (assuming it's stored there)
            const triggerState = context.triggerState || {};
            const previousRowCount = triggerState.rowCount || 0;
            const previousHash = triggerState.hash || "";
            const previousValues = triggerState.values || [];
            let newRows = [];
            let changedRows = [];
            let deletedRows = [];
            let triggerType = config.triggerType;
            if (config.triggerType === "onNewRow") {
                if (currentRowCount > previousRowCount) {
                    const startRow = config.useHeaderRow ? 1 : 0;
                    newRows = convertArraysToObjects(currentValues.slice(previousRowCount), config.useHeaderRow ? currentValues[0] : undefined, false, previousRowCount + startRow);
                    triggerType = "onNewRow";
                }
            }
            else if (config.triggerType === "onRowChanged") {
                if (currentHash !== previousHash) {
                    const startRow = config.useHeaderRow ? 1 : 0;
                    const dataRows = config.useHeaderRow
                        ? currentValues.slice(1)
                        : currentValues;
                    const prevDataRows = config.useHeaderRow
                        ? previousValues.slice(1)
                        : previousValues;
                    dataRows.forEach((row, index) => {
                        const rowHash = hashData([row]);
                        const prevRowHash = prevDataRows[index]
                            ? hashData([prevDataRows[index]])
                            : "";
                        if (rowHash !== prevRowHash) {
                            changedRows.push({
                                rowNumber: startRow + index + 1,
                                before: prevDataRows[index] || null,
                                after: row,
                            });
                        }
                    });
                    triggerType = "onRowChanged";
                }
            }
            else if (config.triggerType === "onSheetChanged") {
                if (currentHash !== previousHash) {
                    triggerType = "onSheetChanged";
                    // For sheet changed, we don't populate newRows/changedRows/deletedRows
                    // as the full diff is implied
                }
            }
            // Update trigger state
            context.triggerState = {
                rowCount: currentRowCount,
                hash: currentHash,
                values: currentValues,
            };
            logs.push(`Google Sheets trigger ${triggerType} completed`);
            return {
                success: true,
                output: {
                    newRows,
                    changedRows,
                    deletedRows,
                    triggerType,
                    timestamp: new Date().toISOString(),
                },
                logs,
                executionTime: Date.now() - startTime,
            };
        }
        catch (error) {
            const errorMessage = parseGoogleError(error);
            logs.push(`Google Sheets trigger failed: ${errorMessage}`);
            return {
                success: false,
                error: errorMessage,
                logs,
                executionTime: Date.now() - startTime,
            };
        }
    },
};
exports.googleSheetsTriggerNode = googleSheetsTriggerNode;
