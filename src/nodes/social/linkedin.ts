import { z } from "zod";
import {
  NodeDefinition,
  NodeExecutionContext,
  NodeExecutionResult,
  nodeRegistry,
} from "../index";
import axios from "axios";

// LinkedIn Node
const linkedinConfigSchema = z.object({
  accessToken: z.string().min(1),
  apiVersion: z.string().default("v2"),
  timeout: z.number().min(1000).max(300000).default(30000),
});

const linkedinNode: NodeDefinition = {
  id: "linkedin-api",
  type: "social-linkedin",
  name: "LinkedIn",
  description: "Post updates and interact with LinkedIn API",
  category: "social",
  icon: "💼",
  color: "#0077B5",

  configSchema: linkedinConfigSchema,

  inputs: [
    {
      id: "action",
      label: "Action",
      type: "string",
      required: true,
      description: "Action to perform (post, share, comment, etc.)",
    },
    {
      id: "content",
      label: "Content",
      type: "string",
      required: true,
      description: "The content to post or share",
    },
    {
      id: "visibility",
      label: "Visibility",
      type: "string",
      required: false,
      description: "Post visibility (PUBLIC, CONNECTIONS)",
    },
    {
      id: "urn",
      label: "LinkedIn URN",
      type: "string",
      required: false,
      description: "LinkedIn URN for specific actions",
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
      id: "response",
      label: "API Response",
      type: "object",
      description: "LinkedIn API response",
    },
  ],

  validation: {
    input: z.object({
      action: z.enum(["post", "share", "comment"]),
      content: z.string().min(1),
      visibility: z.enum(["PUBLIC", "CONNECTIONS"]).default("PUBLIC"),
      urn: z.string().optional(),
    }),
    output: z.object({
      postId: z.string(),
      response: z.any(),
    }),
  },

  handler: async (
    context: NodeExecutionContext,
  ): Promise<NodeExecutionResult> => {
    const startTime = Date.now();
    const logs: string[] = [];

    try {
      const config = linkedinConfigSchema.parse(context.config);
      const input = context.validation.input.parse(context.input);

      const { accessToken, apiVersion } = config;
      const baseUrl = `https://api.linkedin.com/${apiVersion}`;

      logs.push(`Performing LinkedIn ${input.action} action`);

      const headers = {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
      };

      let response;
      let postId = "";

      switch (input.action) {
        case "post":
          // Create a post
          const postData = {
            author: "urn:li:person:YOUR_PERSON_URN", // This would need to be fetched
            lifecycleState: "PUBLISHED",
            specificContent: {
              "com.linkedin.ugc.ShareContent": {
                shareCommentary: {
                  text: input.content,
                },
                shareMediaCategory: "NONE",
              },
            },
            visibility: {
              "com.linkedin.ugc.MemberNetworkVisibility": input.visibility,
            },
          };

          response = await axios.post(`${baseUrl}/ugcPosts`, postData, {
            headers,
            timeout: config.timeout,
          });

          postId = response.data.id;
          break;

        case "share":
          // Share existing content
          if (!input.urn) {
            throw new Error("URN required for share action");
          }

          const shareData = {
            content: {
              contentEntities: [
                {
                  entityLocation: input.urn,
                  thumbnails: [],
                },
              ],
              title: "",
              description: input.content,
            },
            distribution: {
              linkedInDistributionTarget: {},
            },
            owner: "urn:li:person:YOUR_PERSON_URN",
            subject: input.content,
            text: {
              text: input.content,
            },
          };

          response = await axios.post(`${baseUrl}/shares`, shareData, {
            headers,
            timeout: config.timeout,
          });

          postId = response.data.id;
          break;

        case "comment":
          // Add comment to a post
          if (!input.urn) {
            throw new Error("URN required for comment action");
          }

          const commentData = {
            actor: "urn:li:person:YOUR_PERSON_URN",
            message: {
              text: input.content,
            },
            object: input.urn,
          };

          response = await axios.post(
            `${baseUrl}/socialActions/${input.urn}/comments`,
            commentData,
            {
              headers,
              timeout: config.timeout,
            },
          );

          postId = response.data.id;
          break;

        default:
          throw new Error(`Action ${input.action} not implemented`);
      }

      logs.push(`LinkedIn ${input.action} completed successfully`);

      return {
        success: true,
        output: {
          postId,
          response: response.data,
        },
        logs,
        executionTime: Date.now() - startTime,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logs.push(`LinkedIn action failed: ${errorMessage}`);

      return {
        success: false,
        error: errorMessage,
        logs,
        executionTime: Date.now() - startTime,
      };
    }
  },
};

export { linkedinNode };
