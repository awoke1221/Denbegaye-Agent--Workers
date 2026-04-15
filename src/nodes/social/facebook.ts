import { z } from "zod";
import {
  NodeDefinition,
  NodeExecutionContext,
  NodeExecutionResult,
  nodeRegistry,
} from "../index";
import axios from "axios";

// Facebook Node
const facebookConfigSchema = z.object({
  accessToken: z.string().min(1),
  apiVersion: z.string().default("v18.0"),
  timeout: z.number().min(1000).max(300000).default(30000),
});

const facebookNode: NodeDefinition = {
  id: "facebook-api",
  type: "social-facebook",
  name: "Facebook",
  description: "Post updates and interact with Facebook API",
  category: "social",
  icon: "👥",
  color: "#1877F2",

  configSchema: facebookConfigSchema,

  inputs: [
    {
      id: "action",
      label: "Action",
      type: "string",
      required: true,
      description: "Action to perform (post, getPosts, comment, etc.)",
    },
    {
      id: "pageId",
      label: "Page ID",
      type: "string",
      required: false,
      description: "Facebook Page ID",
    },
    {
      id: "content",
      label: "Content",
      type: "string",
      required: false,
      description: "Post content or comment text",
    },
    {
      id: "postId",
      label: "Post ID",
      type: "string",
      required: false,
      description: "Post ID for comments or reactions",
    },
    {
      id: "media",
      label: "Media URL",
      type: "string",
      required: false,
      description: "Media file URL",
    },
  ],

  outputs: [
    {
      id: "postId",
      label: "Post ID",
      type: "string",
      description: "The created post ID",
    },
    {
      id: "posts",
      label: "Posts",
      type: "array",
      description: "Retrieved posts",
    },
    {
      id: "response",
      label: "API Response",
      type: "object",
      description: "Facebook API response",
    },
  ],

  validation: {
    input: z.object({
      action: z.enum(["post", "getPosts", "comment", "like", "getComments"]),
      pageId: z.string().optional(),
      content: z.string().optional(),
      postId: z.string().optional(),
      media: z.string().url().optional(),
    }),
    output: z.object({
      postId: z.string().optional(),
      posts: z.array(z.any()),
      response: z.any(),
    }),
  },

  handler: async (
    context: NodeExecutionContext,
  ): Promise<NodeExecutionResult> => {
    const startTime = Date.now();
    const logs: string[] = [];

    try {
      const config = facebookConfigSchema.parse(context.config);
      const input = context.validation.input.parse(context.input);

      const { accessToken, apiVersion } = config;
      const baseUrl = `https://graph.facebook.com/${apiVersion}`;

      logs.push(`Performing Facebook ${input.action} action`);

      let response;
      let postId = "";
      let posts = [];

      switch (input.action) {
        case "post":
          if (!input.pageId) {
            throw new Error("Page ID required for post action");
          }
          if (!input.content) {
            throw new Error("Content required for post action");
          }

          const postData: any = {
            message: input.content,
            access_token: accessToken,
          };

          if (input.media) {
            // Handle media posts
            postData.link = input.media;
          }

          response = await axios.post(
            `${baseUrl}/${input.pageId}/feed`,
            postData,
            {
              timeout: config.timeout,
            },
          );

          postId = response.data.id;
          break;

        case "getPosts":
          if (!input.pageId) {
            throw new Error("Page ID required for getPosts action");
          }

          response = await axios.get(`${baseUrl}/${input.pageId}/posts`, {
            params: {
              access_token: accessToken,
              limit: 10,
            },
            timeout: config.timeout,
          });

          posts = response.data.data || [];
          break;

        case "comment":
          if (!input.postId) {
            throw new Error("Post ID required for comment action");
          }
          if (!input.content) {
            throw new Error("Content required for comment action");
          }

          response = await axios.post(
            `${baseUrl}/${input.postId}/comments`,
            {
              message: input.content,
              access_token: accessToken,
            },
            {
              timeout: config.timeout,
            },
          );

          postId = response.data.id;
          break;

        case "like":
          if (!input.postId) {
            throw new Error("Post ID required for like action");
          }

          response = await axios.post(
            `${baseUrl}/${input.postId}/likes`,
            {
              access_token: accessToken,
            },
            {
              timeout: config.timeout,
            },
          );

          break;

        case "getComments":
          if (!input.postId) {
            throw new Error("Post ID required for getComments action");
          }

          response = await axios.get(`${baseUrl}/${input.postId}/comments`, {
            params: {
              access_token: accessToken,
              limit: 10,
            },
            timeout: config.timeout,
          });

          posts = response.data.data || [];
          break;

        default:
          throw new Error(`Action ${input.action} not implemented`);
      }

      logs.push(`Facebook ${input.action} completed successfully`);

      return {
        success: true,
        output: {
          postId,
          posts,
          response: response.data,
        },
        logs,
        executionTime: Date.now() - startTime,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logs.push(`Facebook action failed: ${errorMessage}`);

      return {
        success: false,
        error: errorMessage,
        logs,
        executionTime: Date.now() - startTime,
      };
    }
  },
};

export { facebookNode };
