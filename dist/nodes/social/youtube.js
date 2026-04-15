"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.youtubeNode = void 0;
const zod_1 = require("zod");
const googleapis_1 = require("googleapis");
// YouTube Node
const youtubeConfigSchema = zod_1.z.object({
    apiKey: zod_1.z.string().min(1),
    accessToken: zod_1.z.string().optional(), // For authenticated requests
    clientId: zod_1.z.string().optional(),
    clientSecret: zod_1.z.string().optional(),
    refreshToken: zod_1.z.string().optional(),
});
const youtubeNode = {
    id: "youtube-api",
    type: "social-youtube",
    name: "YouTube",
    description: "Interact with YouTube API for videos, channels, and analytics",
    category: "social",
    icon: "📺",
    color: "#FF0000",
    configSchema: youtubeConfigSchema,
    inputs: [
        {
            id: "action",
            label: "Action",
            type: "string",
            required: true,
            description: "Action to perform (search, upload, getVideo, etc.)",
        },
        {
            id: "query",
            label: "Query",
            type: "string",
            required: false,
            description: "Search query or video ID",
        },
        {
            id: "videoData",
            label: "Video Data",
            type: "object",
            required: false,
            description: "Video data for upload",
        },
        {
            id: "channelId",
            label: "Channel ID",
            type: "string",
            required: false,
            description: "YouTube channel ID",
        },
    ],
    outputs: [
        {
            id: "results",
            label: "Results",
            type: "array",
            description: "Search results or video data",
        },
        {
            id: "video",
            label: "Video",
            type: "object",
            description: "Single video information",
        },
        {
            id: "response",
            label: "API Response",
            type: "object",
            description: "YouTube API response",
        },
    ],
    validation: {
        input: zod_1.z.object({
            action: zod_1.z.enum([
                "search",
                "getVideo",
                "getChannel",
                "getPlaylist",
                "upload",
            ]),
            query: zod_1.z.string().optional(),
            videoData: zod_1.z
                .object({
                title: zod_1.z.string(),
                description: zod_1.z.string(),
                tags: zod_1.z.array(zod_1.z.string()).optional(),
                privacy: zod_1.z.enum(["public", "private", "unlisted"]).default("private"),
            })
                .optional(),
            channelId: zod_1.z.string().optional(),
        }),
        output: zod_1.z.object({
            results: zod_1.z.array(zod_1.z.any()),
            video: zod_1.z.any().optional(),
            response: zod_1.z.any(),
        }),
    },
    handler: async (context) => {
        const startTime = Date.now();
        const logs = [];
        try {
            const config = youtubeConfigSchema.parse(context.config);
            const input = context.validation.input.parse(context.input);
            logs.push(`Performing YouTube ${input.action} action`);
            let youtube;
            if (config.accessToken) {
                // Authenticated requests
                const oauth2Client = new googleapis_1.google.auth.OAuth2(config.clientId, config.clientSecret);
                oauth2Client.setCredentials({
                    access_token: config.accessToken,
                    refresh_token: config.refreshToken,
                });
                youtube = googleapis_1.google.youtube({
                    version: "v3",
                    auth: oauth2Client,
                });
            }
            else {
                // API key only (limited functionality)
                youtube = googleapis_1.google.youtube({
                    version: "v3",
                    auth: config.apiKey,
                });
            }
            let response;
            let results = [];
            let video = null;
            switch (input.action) {
                case "search":
                    if (!input.query) {
                        throw new Error("Query required for search action");
                    }
                    response = await youtube.search.list({
                        part: ["snippet"],
                        q: input.query,
                        type: ["video"],
                        maxResults: 10,
                    });
                    results = response.data.items || [];
                    break;
                case "getVideo":
                    if (!input.query) {
                        throw new Error("Video ID required for getVideo action");
                    }
                    response = await youtube.videos.list({
                        part: ["snippet", "statistics", "contentDetails"],
                        id: [input.query],
                    });
                    video = response.data.items?.[0] || null;
                    results = response.data.items || [];
                    break;
                case "getChannel":
                    if (!input.channelId) {
                        throw new Error("Channel ID required for getChannel action");
                    }
                    response = await youtube.channels.list({
                        part: ["snippet", "statistics"],
                        id: [input.channelId],
                    });
                    results = response.data.items || [];
                    break;
                case "getPlaylist":
                    if (!input.query) {
                        throw new Error("Playlist ID required for getPlaylist action");
                    }
                    response = await youtube.playlistItems.list({
                        part: ["snippet"],
                        playlistId: input.query,
                        maxResults: 10,
                    });
                    results = response.data.items || [];
                    break;
                case "upload":
                    // Video upload requires authentication
                    if (!config.accessToken) {
                        throw new Error("Access token required for video upload");
                    }
                    if (!input.videoData) {
                        throw new Error("Video data required for upload action");
                    }
                    // Note: Actual file upload would require handling multipart/form-data
                    // This is a simplified version
                    throw new Error("Video upload not fully implemented - requires file handling");
                default:
                    throw new Error(`Action ${input.action} not implemented`);
            }
            logs.push(`YouTube ${input.action} completed successfully`);
            return {
                success: true,
                output: {
                    results,
                    video,
                    response: response.data,
                },
                logs,
                executionTime: Date.now() - startTime,
            };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logs.push(`YouTube action failed: ${errorMessage}`);
            return {
                success: false,
                error: errorMessage,
                logs,
                executionTime: Date.now() - startTime,
            };
        }
    },
};
exports.youtubeNode = youtubeNode;
