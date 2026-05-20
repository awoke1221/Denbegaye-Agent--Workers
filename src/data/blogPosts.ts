export interface BlogPost {
  slug: string;
  title: string;
  summary: string;
  date: string;
  author: string;
  readingTime: string;
  tags: string[];
  sections: Array<{
    type: "heading" | "paragraph" | "list" | "code";
    title?: string;
    text?: string;
    items?: string[];
    code?: string;
  }>;
}

export const blogPosts: BlogPost[] = [
  {
    slug: "how-denbegnaye-works",
    title: "How Denbegnaye Works: AI workflows made simple",
    summary:
      "Learn the core concepts behind Denbegnaye, including visual workflows, agent execution, and how to turn ideas into automated systems.",
    date: "2026-05-21",
    author: "Denbegnaye Team",
    readingTime: "5 min",
    tags: ["Platform Guide", "Overview", "AI Workflows"],
    sections: [
      {
        type: "paragraph",
        text: "Denbegnaye is built around visual AI workflows that connect AI models, APIs, and automation steps in one interface. Each workflow is a sequence of nodes that manage data, make decisions, and trigger actions.",
      },
      {
        type: "heading",
        title: "Why Denbegnaye is different",
      },
      {
        type: "list",
        items: [
          "Visual workflow builder for rapid design and iteration",
          "Built-in integrations for APIs, databases, and webhooks",
          "Scalable execution with backend worker services",
          "Rich post-run insights and logs for debugging",
        ],
      },
      {
        type: "heading",
        title: "How to use the platform",
      },
      {
        type: "list",
        items: [
          "Create an account and sign in from the homepage",
          "Open the Agent Builder and add nodes to your workflow",
          "Configure each node to use AI, external data, or API actions",
          "Run the workflow and review execution logs in the dashboard",
        ],
      },
      {
        type: "paragraph",
        text: "This post helps you understand what Denbegnaye does and where tutorial content fits. Use the blog to learn the platform step by step, or follow our advanced guides to build production-ready agents.",
      },
    ],
  },
  {
    slug: "build-your-first-agent",
    title: "Build Your First Agent in Denbegnaye",
    summary:
      "A step-by-step walkthrough for building your first AI agent, from account setup to workflow execution and review.",
    date: "2026-05-21",
    author: "Denbegnaye Team",
    readingTime: "7 min",
    tags: ["Tutorial", "Getting Started", "Agent Builder"],
    sections: [
      {
        type: "heading",
        title: "Step 1: Sign up and log in",
      },
      {
        type: "paragraph",
        text: "Create an account using the signup page, then log in. The dashboard gives you access to the Agent Builder, templates, and account settings.",
      },
      {
        type: "heading",
        title: "Step 2: Open the Agent Builder",
      },
      {
        type: "paragraph",
        text: "Navigate to the Agent Builder and start a new workflow. The canvas lets you drag and place nodes, connect them, and configure the logic in each step.",
      },
      {
        type: "heading",
        title: "Step 3: Add a simple workflow",
      },
      {
        type: "list",
        items: [
          "Add an AI model node for natural language reasoning",
          "Add a tool or API node to enrich the result",
          "Connect the nodes so data flows from one step to the next",
          "Save and validate the workflow configuration",
        ],
      },
      {
        type: "heading",
        title: "Step 4: Run and inspect results",
      },
      {
        type: "paragraph",
        text: "Use the execution monitor to run the workflow. Review logs, outputs, and any errors to confirm the agent behaves the way you expect.",
      },
    ],
  },
  {
    slug: "tutorial-api-integration-workflow",
    title: "Advanced Tutorial: API integration workflow",
    summary:
      "Create a workflow that connects an AI step with an external API, demonstrating how Denbegnaye handles real-world automation scenarios.",
    date: "2026-05-21",
    author: "Denbegnaye Team",
    readingTime: "8 min",
    tags: ["Advanced", "API Integration", "Workflow"],
    sections: [
      {
        type: "heading",
        title: "Why external API integrations matter",
      },
      {
        type: "paragraph",
        text: "Integrating an API allows your agent to fetch live data, call third-party services, or send notifications. This makes your workflows practical and useful beyond simple text generation.",
      },
      {
        type: "heading",
        title: "Step 1: Choose your API integration",
      },
      {
        type: "list",
        items: [
          "Select an API node in the builder",
          "Enter the service endpoint and authentication details",
          "Map outputs from the AI node into the API request",
        ],
      },
      {
        type: "heading",
        title: "Step 2: Add error handling and logging",
      },
      {
        type: "list",
        items: [
          "Use conditional nodes for success and failure paths",
          "Log API response details for later review",
          "Notify yourself or trigger follow-up actions on failure",
        ],
      },
      {
        type: "paragraph",
        text: "Once the workflow is configured, run it in the execution monitor. The blog is the perfect place to keep adding advanced guides for integrations, scaling and production-ready deployment.",
      },
    ],
  },
];

export const getAllBlogPosts = (): BlogPost[] => blogPosts;

export const getBlogPostBySlug = (slug: string): BlogPost | undefined =>
  blogPosts.find((post) => post.slug === slug);
