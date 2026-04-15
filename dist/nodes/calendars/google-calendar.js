"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.googleCalendarNode = void 0;
const zod_1 = require("zod");
const googleapis_1 = require("googleapis");
// Google Calendar Node
const googleCalendarConfigSchema = zod_1.z.object({
    accessToken: zod_1.z.string().min(1),
    refreshToken: zod_1.z.string().optional(),
    clientId: zod_1.z.string().min(1),
    clientSecret: zod_1.z.string().min(1),
    calendarId: zod_1.z.string().default("primary"),
    timezone: zod_1.z.string().default("UTC"),
});
const googleCalendarNode = {
    id: "google-calendar",
    type: "calendar-google",
    name: "Google Calendar",
    description: "Create, read, and manage Google Calendar events",
    category: "calendar",
    icon: "📅",
    color: "#4285F4",
    configSchema: googleCalendarConfigSchema,
    inputs: [
        {
            id: "action",
            label: "Action",
            type: "string",
            required: true,
            description: "Action to perform (create, list, update, delete)",
        },
        {
            id: "eventData",
            label: "Event Data",
            type: "object",
            required: false,
            description: "Event data for create/update actions",
        },
        {
            id: "eventId",
            label: "Event ID",
            type: "string",
            required: false,
            description: "Event ID for update/delete actions",
        },
        {
            id: "calendarId",
            label: "Calendar ID",
            type: "string",
            required: false,
            description: "Calendar ID (overrides config)",
        },
        {
            id: "timeMin",
            label: "Start Time",
            type: "string",
            required: false,
            description: "Start time for listing events",
        },
        {
            id: "timeMax",
            label: "End Time",
            type: "string",
            required: false,
            description: "End time for listing events",
        },
    ],
    outputs: [
        {
            id: "event",
            label: "Event",
            type: "object",
            description: "Single event data",
        },
        {
            id: "events",
            label: "Events",
            type: "array",
            description: "List of events",
        },
        {
            id: "eventId",
            label: "Event ID",
            type: "string",
            description: "Created or updated event ID",
        },
        {
            id: "response",
            label: "API Response",
            type: "object",
            description: "Google Calendar API response",
        },
    ],
    validation: {
        input: zod_1.z.object({
            action: zod_1.z.enum(["create", "list", "get", "update", "delete"]),
            eventData: zod_1.z
                .object({
                summary: zod_1.z.string(),
                description: zod_1.z.string().optional(),
                start: zod_1.z.object({
                    dateTime: zod_1.z.string().optional(),
                    date: zod_1.z.string().optional(),
                    timeZone: zod_1.z.string().optional(),
                }),
                end: zod_1.z.object({
                    dateTime: zod_1.z.string().optional(),
                    date: zod_1.z.string().optional(),
                    timeZone: zod_1.z.string().optional(),
                }),
                location: zod_1.z.string().optional(),
                attendees: zod_1.z
                    .array(zod_1.z.object({
                    email: zod_1.z.string().email(),
                    displayName: zod_1.z.string().optional(),
                }))
                    .optional(),
            })
                .optional(),
            eventId: zod_1.z.string().optional(),
            calendarId: zod_1.z.string().optional(),
            timeMin: zod_1.z.string().optional(),
            timeMax: zod_1.z.string().optional(),
        }),
        output: zod_1.z.object({
            event: zod_1.z.any().optional(),
            events: zod_1.z.array(zod_1.z.any()),
            eventId: zod_1.z.string().optional(),
            response: zod_1.z.any(),
        }),
    },
    handler: async (context) => {
        const startTime = Date.now();
        const logs = [];
        try {
            const config = googleCalendarConfigSchema.parse(context.config);
            const input = context.validation.input.parse(context.input);
            logs.push(`Performing Google Calendar ${input.action} action`);
            // Set up OAuth2 client
            const oauth2Client = new googleapis_1.google.auth.OAuth2(config.clientId, config.clientSecret);
            oauth2Client.setCredentials({
                access_token: config.accessToken,
                refresh_token: config.refreshToken,
            });
            const calendar = googleapis_1.google.calendar({ version: "v3", auth: oauth2Client });
            const calendarId = input.calendarId || config.calendarId;
            let response;
            let event = null;
            let events = [];
            let eventId = "";
            switch (input.action) {
                case "create":
                    if (!input.eventData) {
                        throw new Error("Event data required for create action");
                    }
                    response = await calendar.events.insert({
                        calendarId,
                        requestBody: {
                            ...input.eventData,
                            start: {
                                ...input.eventData.start,
                                timeZone: input.eventData.start.timeZone || config.timezone,
                            },
                            end: {
                                ...input.eventData.end,
                                timeZone: input.eventData.end.timeZone || config.timezone,
                            },
                        },
                    });
                    event = response.data;
                    eventId = response.data.id;
                    break;
                case "list":
                    const listParams = {
                        calendarId,
                        singleEvents: true,
                        orderBy: "startTime",
                    };
                    if (input.timeMin) {
                        listParams.timeMin = input.timeMin;
                    }
                    if (input.timeMax) {
                        listParams.timeMax = input.timeMax;
                    }
                    response = await calendar.events.list(listParams);
                    events = response.data.items || [];
                    break;
                case "get":
                    if (!input.eventId) {
                        throw new Error("Event ID required for get action");
                    }
                    response = await calendar.events.get({
                        calendarId,
                        eventId: input.eventId,
                    });
                    event = response.data;
                    break;
                case "update":
                    if (!input.eventId) {
                        throw new Error("Event ID required for update action");
                    }
                    if (!input.eventData) {
                        throw new Error("Event data required for update action");
                    }
                    response = await calendar.events.update({
                        calendarId,
                        eventId: input.eventId,
                        requestBody: {
                            ...input.eventData,
                            start: {
                                ...input.eventData.start,
                                timeZone: input.eventData.start.timeZone || config.timezone,
                            },
                            end: {
                                ...input.eventData.end,
                                timeZone: input.eventData.end.timeZone || config.timezone,
                            },
                        },
                    });
                    event = response.data;
                    eventId = response.data.id;
                    break;
                case "delete":
                    if (!input.eventId) {
                        throw new Error("Event ID required for delete action");
                    }
                    response = await calendar.events.delete({
                        calendarId,
                        eventId: input.eventId,
                    });
                    // Delete returns empty response
                    break;
                default:
                    throw new Error(`Action ${input.action} not implemented`);
            }
            logs.push(`Google Calendar ${input.action} completed successfully`);
            return {
                success: true,
                output: {
                    event,
                    events,
                    eventId,
                    response: response.data,
                },
                logs,
                executionTime: Date.now() - startTime,
            };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logs.push(`Google Calendar action failed: ${errorMessage}`);
            return {
                success: false,
                error: errorMessage,
                logs,
                executionTime: Date.now() - startTime,
            };
        }
    },
};
exports.googleCalendarNode = googleCalendarNode;
