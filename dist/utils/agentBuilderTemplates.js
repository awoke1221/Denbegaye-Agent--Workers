"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentBuilderTemplates = void 0;
exports.AgentBuilderTemplates = [
    {
        id: 'ai-social-media-growth-agent',
        name: 'AI Social Media Growth Agent',
        description: 'Autonomously generates, improves, stores, and optionally posts high-quality social media content using AI, memory, and tool integrations.',
        category: 'Social Media',
        nodes: [
            {
                id: '1',
                type: 'manual-input',
                position: { x: 80, y: 120 },
                data: {
                    label: 'User Topic Input',
                    description: 'Enter a topic, niche, or keyword for content generation.',
                    config: {
                        inputType: 'text',
                        placeholder: 'e.g. AI tools for productivity',
                    },
                },
            },
            {
                id: '2',
                type: 'memory-long-term',
                position: { x: 280, y: 80 },
                data: {
                    label: 'Retrieve Past Posts',
                    description: 'Fetch relevant past posts from Firestore to guide style and tone.',
                    config: {
                        memoryType: 'firestore',
                        query: 'topic = {input}',
                        output: 'examples, styleSummary',
                    },
                },
            },
            {
                id: '3',
                type: 'ai-reasoning',
                position: { x: 480, y: 40 },
                data: {
                    label: 'AI Trend Research',
                    description: 'Analyze current trends, viral hooks, and audience insights.',
                    config: {
                        model: 'gpt-4',
                        prompt: `You are a social media strategist. Given the topic "{input}", analyze current trends, viral angles, and audience insights. Output:\n- 3 trending angles\n- 3 viral hooks\n- 3 audience insights\nUse concise, actionable language.`,
                    },
                },
            },
            {
                id: '4',
                type: 'ai-reasoning',
                position: { x: 680, y: 80 },
                data: {
                    label: 'AI Content Generator',
                    description: 'Generate 3–5 high-quality social media posts.',
                    config: {
                        model: 'gpt-4',
                        prompt: `Using the topic "{input}", past style "{styleSummary}", and research:\nGenerate 3–5 social media posts. Each post must have:\n- Hook\n- Value\n- CTA\nFormat:\nPost 1:\nHook: ...\nValue: ...\nCTA: ...\n(Repeat for each post)`,
                    },
                },
            },
            {
                id: '5',
                type: 'ai-reasoning',
                position: { x: 880, y: 120 },
                data: {
                    label: 'AI Post Optimizer',
                    description: 'Refine the best post for engagement and platform style.',
                    config: {
                        model: 'gpt-4',
                        prompt: `Given the best post:\n- Optimize for engagement, clarity, and platform style (Twitter/Telegram).\n- Rewrite if needed for maximum impact.\nOutput only the improved post.`,
                    },
                },
            },
            {
                id: '6',
                type: 'logic-if',
                position: { x: 1080, y: 120 },
                data: {
                    label: 'Select Best Post',
                    description: 'Auto-select or allow user to choose the best post.',
                    config: {
                        condition: 'autoSelect || userSelection',
                        options: ['Auto', 'Manual'],
                    },
                },
            },
            {
                id: '7',
                type: 'action-save-db',
                position: { x: 1280, y: 80 },
                data: {
                    label: 'Save to Firestore',
                    description: 'Store generated content, timestamp, and topic.',
                    config: {
                        db: 'firestore',
                        collection: 'social_posts',
                        fields: ['content', 'timestamp', 'topic'],
                    },
                },
            },
            {
                id: '8',
                type: 'tool-external',
                position: { x: 1480, y: 40 },
                data: {
                    label: 'Social Media Integration',
                    description: 'Prepare for posting to Twitter or Telegram.',
                    config: {
                        platforms: ['twitter', 'telegram'],
                        apiIntegration: true,
                        autoPost: false,
                    },
                },
            },
            {
                id: '9',
                type: 'manual-input',
                position: { x: 1680, y: 120 },
                data: {
                    label: 'Display Final Result',
                    description: 'Show the final post to the user for review or copy.',
                    config: {
                        outputType: 'display',
                    },
                },
            },
        ],
        edges: [
            { id: 'e1-2', source: '1', target: '2', type: 'default' },
            { id: 'e2-3', source: '2', target: '3', type: 'default' },
            { id: 'e3-4', source: '3', target: '4', type: 'default' },
            { id: 'e4-5', source: '4', target: '5', type: 'default' },
            { id: 'e5-6', source: '5', target: '6', type: 'default' },
            { id: 'e6-7', source: '6', target: '7', type: 'default' },
            { id: 'e7-8', source: '7', target: '8', type: 'default' },
            { id: 'e8-9', source: '8', target: '9', type: 'default' },
        ],
    },
    {
        id: 'social-content-generator',
        name: 'Social Media Content Generator',
        description: 'Generate and post social content using AI templates.',
        category: 'Social Media',
        nodes: [
            {
                id: '1',
                type: 'ai-openai',
                position: { x: 200, y: 100 },
                data: {
                    label: 'AI Content Generator',
                    config: { model: 'gpt-4', prompt: 'Create social post' },
                },
            },
            {
                id: '2',
                type: 'action-twitter',
                position: { x: 600, y: 100 },
                data: { label: 'Post to Twitter/X', config: { hashtag: '#AI' } },
            },
        ],
        edges: [{ id: 'e1-2', source: '1', target: '2', type: 'default' }],
    },
    {
        id: 'email-autoresponder',
        name: 'Email Auto-Responder',
        description: 'Automatically respond to incoming emails using Google Gemini AI and send replies via Gmail with Google authentication.',
        category: 'Communication',
        nodes: [
            {
                id: '1',
                type: 'webhook-input',
                position: { x: 200, y: 80 },
                data: {
                    label: 'Email Webhook',
                    description: 'Receives incoming emails via webhook',
                    config: { path: '/emails' },
                },
            },
            {
                id: '2',
                type: 'ai-reasoning',
                position: { x: 440, y: 80 },
                data: {
                    label: 'Gemini AI Response',
                    description: 'Generate intelligent email responses using Google Gemini',
                    config: {
                        geminiApiKey: '',
                        prompt: 'You are a professional email assistant. Generate a helpful, concise response to this email inquiry. Keep it professional and under 200 words.',
                    },
                },
            },
            {
                id: '3',
                type: 'action-email',
                position: { x: 680, y: 80 },
                data: {
                    label: 'Send Gmail Response',
                    description: 'Send the AI-generated response via Gmail',
                    config: {
                        to: '{sender_email}',
                        subject: 'Re: {original_subject}',
                        useGoogleAuth: true,
                    },
                },
            },
        ],
        edges: [
            { id: 'e1-2', source: '1', target: '2', type: 'default' },
            { id: 'e2-3', source: '2', target: '3', type: 'default' },
        ],
    },
    {
        id: 'lead-qualification',
        name: 'Lead Qualification Bot',
        description: 'Ask leads questions and score/interact with logic nodes.',
        category: 'Sales',
        nodes: [
            {
                id: '1',
                type: 'manual-input',
                position: { x: 220, y: 120 },
                data: { label: 'Manual Lead Input' },
            },
            {
                id: '2',
                type: 'logic-if',
                position: { x: 460, y: 120 },
                data: {
                    label: 'Qualification Check',
                    config: { condition: 'score > 70' },
                },
            },
            {
                id: '3',
                type: 'action-email',
                position: { x: 700, y: 80 },
                data: { label: 'Send Follow-up' },
            },
            {
                id: '4',
                type: 'action-telegram',
                position: { x: 700, y: 180 },
                data: { label: 'Send Q/A to Telegram' },
            },
        ],
        edges: [
            { id: 'e1-2', source: '1', target: '2', type: 'default' },
            { id: 'e2-3', source: '2', target: '3', type: 'default' },
            { id: 'e2-4', source: '2', target: '4', type: 'default' },
        ],
    },
    {
        id: 'meeting-notes-summarizer',
        name: 'Meeting Notes Summarizer',
        description: 'Summarize meeting notes from Google Calendar/Meet and email the summary.',
        category: 'Productivity',
        nodes: [
            {
                id: '1',
                type: 'tool-api',
                position: { x: 180, y: 80 },
                data: {
                    label: 'Google Calendar API',
                    config: { api: 'google-calendar', apiKeyRequired: true },
                },
            },
            {
                id: '2',
                type: 'memory-short-term',
                position: { x: 380, y: 80 },
                data: { label: 'Short-Term Memory', config: { contextWindow: 4096 } },
            },
            {
                id: '3',
                type: 'ai-reasoning',
                position: { x: 580, y: 80 },
                data: {
                    label: 'AI Summarizer',
                    config: {
                        model: 'gpt-4',
                        prompt: 'Summarize the meeting notes clearly and concisely.',
                    },
                },
            },
            {
                id: '4',
                type: 'action-email',
                position: { x: 780, y: 80 },
                data: {
                    label: 'Send Summary Email',
                    config: { provider: 'gmail', apiKeyRequired: true },
                },
            },
        ],
        edges: [
            { id: 'e1-2', source: '1', target: '2', type: 'default' },
            { id: 'e2-3', source: '2', target: '3', type: 'default' },
            { id: 'e3-4', source: '3', target: '4', type: 'default' },
        ],
    },
    {
        id: 'report-generator',
        name: 'Report Generator',
        description: 'Generate structured reports from input data and send via email or webhook.',
        category: 'Business',
        nodes: [
            {
                id: '1',
                type: 'manual-input',
                position: { x: 180, y: 120 },
                data: { label: 'Manual Data Input' },
            },
            {
                id: '2',
                type: 'memory-long-term',
                position: { x: 380, y: 120 },
                data: { label: 'Long-Term Memory (RAG)', config: { vectorDb: true } },
            },
            {
                id: '3',
                type: 'ai-reasoning',
                position: { x: 580, y: 120 },
                data: {
                    label: 'AI Report Generator',
                    config: {
                        model: 'gpt-4',
                        prompt: 'Generate a detailed report from the provided data.',
                    },
                },
            },
            {
                id: '4',
                type: 'action-email',
                position: { x: 780, y: 80 },
                data: {
                    label: 'Send Report Email',
                    config: { provider: 'gmail', apiKeyRequired: true },
                },
            },
            {
                id: '5',
                type: 'action-webhook',
                position: { x: 780, y: 180 },
                data: {
                    label: 'Send to Webhook',
                    config: { url: 'https://example.com/report' },
                },
            },
        ],
        edges: [
            { id: 'e1-2', source: '1', target: '2', type: 'default' },
            { id: 'e2-3', source: '2', target: '3', type: 'default' },
            { id: 'e3-4', source: '3', target: '4', type: 'default' },
            { id: 'e3-5', source: '3', target: '5', type: 'default' },
        ],
    },
    {
        id: 'task-automation-assistant',
        name: 'Task Automation Assistant',
        description: 'Automate repetitive tasks using AI, memory, and external APIs.',
        category: 'Productivity',
        nodes: [
            {
                id: '1',
                type: 'event-schedule',
                position: { x: 180, y: 100 },
                data: { label: 'Scheduled Trigger', config: { cron: '0 9 * * *' } },
            },
            {
                id: '2',
                type: 'memory-vector',
                position: { x: 380, y: 100 },
                data: { label: 'Vector Memory', config: { embeddings: true } },
            },
            {
                id: '3',
                type: 'ai-reasoning',
                position: { x: 580, y: 100 },
                data: {
                    label: 'AI Task Planner',
                    config: {
                        model: 'gpt-4',
                        prompt: "Plan and automate today's tasks.",
                    },
                },
            },
            {
                id: '4',
                type: 'tool-api',
                position: { x: 780, y: 60 },
                data: {
                    label: 'Gmail API',
                    config: { api: 'gmail', apiKeyRequired: true },
                },
            },
            {
                id: '5',
                type: 'tool-api',
                position: { x: 780, y: 140 },
                data: {
                    label: 'Google Calendar API',
                    config: { api: 'google-calendar', apiKeyRequired: true },
                },
            },
        ],
        edges: [
            { id: 'e1-2', source: '1', target: '2', type: 'default' },
            { id: 'e2-3', source: '2', target: '3', type: 'default' },
            { id: 'e3-4', source: '3', target: '4', type: 'default' },
            { id: 'e3-5', source: '3', target: '5', type: 'default' },
        ],
    },
    // ===========================================
    // ADVANCED MULTI-AGENT WORKFLOW TEMPLATES
    // ===========================================
    {
        id: 'multi-agent-customer-support-hub',
        name: 'Multi-Agent Customer Support Hub',
        description: 'Advanced customer support system with triage, AI response generation, escalation, and CRM integration. Handles multiple channels and languages.',
        category: 'Customer Support',
        nodes: [
            {
                id: '1',
                type: 'webhook-input',
                position: { x: 100, y: 100 },
                data: {
                    label: '📧 Multi-Channel Input (Email/Chat/Social)',
                    description: 'Receives customer inquiries from Gmail, Slack, Twitter, and web forms.',
                    config: {
                        channels: ['gmail', 'slack', 'twitter', 'web'],
                        apiKeyRequired: false,
                        webhookUrl: '/api/webhooks/support',
                        rateLimit: 100,
                        timeout: 30000,
                        fileUpload: false,
                        customHeaders: {},
                    },
                },
            },
            {
                id: '2',
                type: 'logic-if',
                position: { x: 350, y: 50 },
                data: {
                    label: '🔍 Triage Agent - Priority Check',
                    description: 'Analyzes urgency keywords and sentiment to route high-priority issues.',
                    config: {
                        condition: 'priority === "urgent" || sentiment < -0.5',
                        apiKeyRequired: false,
                        threshold: { urgency: 0.8, sentiment: -0.5 },
                        keywords: ['urgent', 'emergency', 'asap', 'critical'],
                        timeout: 5000,
                        fileUpload: false,
                        customLogic: '',
                    },
                },
            },
            {
                id: '3',
                type: 'ai-reasoning',
                position: { x: 600, y: 20 },
                data: {
                    label: '🤖 Gemini AI - Complex Response',
                    description: 'Generates detailed responses for technical or complex inquiries using Google Gemini.',
                    config: {
                        model: 'gemini-pro',
                        modelOptions: ['gemini-pro', 'gemini-1.5-pro', 'gemini-pro-vision'],
                        prompt: 'Provide a comprehensive, empathetic response to this customer inquiry. Include troubleshooting steps if applicable. Keep it professional and under 500 words.',
                        apiKeyRequired: true,
                        temperature: 0.7,
                        maxTokens: 1000,
                        timeout: 60000,
                        retryAttempts: 3,
                        systemPrompt: 'You are a senior customer support specialist with 10+ years experience.',
                        fileUpload: false,
                        customInstructions: '',
                    },
                },
            },
            {
                id: '4',
                type: 'ai-reasoning',
                position: { x: 600, y: 120 },
                data: {
                    label: '⚡ GPT-4 - Quick Response',
                    description: 'Handles routine inquiries with fast, accurate responses using OpenAI GPT-4.',
                    config: {
                        model: 'gpt-4',
                        modelOptions: ['gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo'],
                        prompt: 'Give a concise, helpful response to this standard customer question. Keep it under 150 words.',
                        apiKeyRequired: true,
                        temperature: 0.5,
                        maxTokens: 300,
                        timeout: 30000,
                        retryAttempts: 2,
                        systemPrompt: 'You are a friendly customer support assistant.',
                        fileUpload: false,
                        customInstructions: '',
                    },
                },
            },
            {
                id: '5',
                type: 'logic-if',
                position: { x: 850, y: 70 },
                data: {
                    label: '✅ Quality Check Agent',
                    description: 'Validates response quality and flags for human review if confidence is low.',
                    config: {
                        condition: 'confidence > 0.8 && !contains_sensitive_info',
                        apiKeyRequired: false,
                        confidenceThreshold: 0.8,
                        sensitiveKeywords: ['password', 'credit card', 'ssn', 'personal'],
                        autoEscalate: true,
                        timeout: 10000,
                        fileUpload: false,
                        customLogic: '',
                    },
                },
            },
            {
                id: '6',
                type: 'action-email',
                position: { x: 1100, y: 30 },
                data: {
                    label: '📧 Gmail Auto-Reply',
                    description: 'Sends AI-generated response via Gmail with professional formatting.',
                    config: {
                        provider: 'gmail',
                        useGoogleAuth: true,
                        apiKeyRequired: true,
                        template: 'support_response',
                        signature: 'Best regards,\nCustomer Support Team',
                        attachments: false,
                        tracking: true,
                        timeout: 30000,
                        retryAttempts: 2,
                        fileUpload: true,
                        customHeaders: {},
                    },
                },
            },
            {
                id: '7',
                type: 'action-telegram',
                position: { x: 1100, y: 100 },
                data: {
                    label: '📱 Telegram Notification',
                    description: 'Notifies support team via Telegram for urgent or escalated issues.',
                    config: {
                        botToken: '',
                        chatId: '',
                        apiKeyRequired: true,
                        message: '🚨 Urgent customer issue requires attention: {summary}',
                        priority: 'high',
                        timeout: 15000,
                        retryAttempts: 3,
                        fileUpload: true,
                        customButtons: [],
                    },
                },
            },
            {
                id: '8',
                type: 'action-save-db',
                position: { x: 1350, y: 70 },
                data: {
                    label: '💾 CRM Update (Supabase)',
                    description: 'Logs interaction in customer database with tags, sentiment, and resolution status.',
                    config: {
                        table: 'customer_interactions',
                        fields: ['customer_id', 'issue_type', 'resolution', 'sentiment', 'priority'],
                        apiKeyRequired: true,
                        batchSize: 10,
                        timeout: 20000,
                        retryAttempts: 2,
                        fileUpload: false,
                        customFields: {},
                    },
                },
            },
            {
                id: '9',
                type: 'logic-if',
                position: { x: 350, y: 150 },
                data: {
                    label: '🌐 Language Detection',
                    description: 'Detects customer language and routes to appropriate AI model for multilingual support.',
                    config: {
                        condition: 'language === "en"',
                        apiKeyRequired: false,
                        supportedLanguages: ['en', 'es', 'fr', 'de', 'zh', 'ja'],
                        confidenceThreshold: 0.9,
                        timeout: 5000,
                        fileUpload: false,
                        customLogic: '',
                    },
                },
            },
            {
                id: '10',
                type: 'ai-reasoning',
                position: { x: 600, y: 200 },
                data: {
                    label: '🌍 Multilingual AI (Claude)',
                    description: 'Handles non-English inquiries using Anthropic Claude for accurate translations and responses.',
                    config: {
                        model: 'claude-3-sonnet',
                        modelOptions: ['claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku'],
                        prompt: "Respond in the customer's language: {detected_language}. Provide culturally appropriate support. Keep it professional and under 300 words.",
                        apiKeyRequired: true,
                        temperature: 0.6,
                        maxTokens: 600,
                        timeout: 45000,
                        retryAttempts: 3,
                        systemPrompt: 'You are a multilingual customer support specialist fluent in multiple languages.',
                        fileUpload: false,
                        customInstructions: '',
                    },
                },
            },
        ],
        edges: [
            { id: 'e1-2', source: '1', target: '2', type: 'default' },
            { id: 'e1-9', source: '1', target: '9', type: 'default' },
            { id: 'e2-3', source: '2', target: '3', type: 'default' },
            { id: 'e9-4', source: '9', target: '4', type: 'default' },
            { id: 'e9-10', source: '9', target: '10', type: 'default' },
            { id: 'e3-5', source: '3', target: '5', type: 'default' },
            { id: 'e4-5', source: '4', target: '5', type: 'default' },
            { id: 'e10-5', source: '10', target: '5', type: 'default' },
            { id: 'e5-6', source: '5', target: '6', type: 'default' },
            { id: 'e5-7', source: '5', target: '7', type: 'default' },
            { id: 'e6-8', source: '6', target: '8', type: 'default' },
            { id: 'e7-8', source: '7', target: '8', type: 'default' },
        ],
    },
    {
        id: 'ai-content-creation-pipeline',
        name: 'AI Content Creation Pipeline',
        description: 'Multi-agent content generation system with research, writing, editing, SEO optimization, and cross-platform publishing.',
        category: 'Content Creation',
        nodes: [
            {
                id: '1',
                type: 'manual-input',
                position: { x: 100, y: 100 },
                data: {
                    label: '📝 Content Brief Input',
                    description: 'Enter topic, target audience, tone, and content goals.',
                    config: { fields: ['topic', 'audience', 'tone', 'word_count', 'platforms'] },
                },
            },
            {
                id: '2',
                type: 'ai-reasoning',
                position: { x: 350, y: 50 },
                data: {
                    label: '🔍 Research Agent (Perplexity AI)',
                    description: 'Conducts deep research on topic using web search and knowledge bases.',
                    config: {
                        model: 'perplexity',
                        prompt: 'Research comprehensive information about {topic} for {audience}. Include statistics, trends, and expert insights.',
                    },
                },
            },
            {
                id: '3',
                type: 'memory-vector',
                position: { x: 350, y: 150 },
                data: {
                    label: '🧠 Content Memory Retrieval',
                    description: 'Retrieves similar past content and brand guidelines from vector database.',
                    config: { collection: 'content_history', similarity_threshold: 0.8 },
                },
            },
            {
                id: '4',
                type: 'ai-reasoning',
                position: { x: 600, y: 30 },
                data: {
                    label: '✍️ Writing Agent (GPT-4)',
                    description: 'Generates first draft using research data and memory context.',
                    config: {
                        model: 'gpt-4',
                        prompt: 'Write a compelling {content_type} about {topic} for {audience} in {tone}. Use the research and maintain brand voice.',
                    },
                },
            },
            {
                id: '5',
                type: 'ai-reasoning',
                position: { x: 600, y: 130 },
                data: {
                    label: '🎨 Creative Enhancement (DALL-E)',
                    description: 'Generates or suggests images, graphics, and visual elements.',
                    config: {
                        model: 'dall-e-3',
                        prompt: 'Create image descriptions and visual concepts for this content.',
                    },
                },
            },
            {
                id: '6',
                type: 'ai-reasoning',
                position: { x: 850, y: 50 },
                data: {
                    label: '📈 SEO Optimization Agent',
                    description: 'Optimizes content for search engines with keywords, meta descriptions, and readability.',
                    config: {
                        model: 'gpt-4',
                        prompt: 'Optimize this content for SEO. Add keywords, improve structure, and enhance readability.',
                    },
                },
            },
            {
                id: '7',
                type: 'logic-if',
                position: { x: 850, y: 150 },
                data: {
                    label: '✅ Quality Gate',
                    description: 'Checks content quality, plagiarism, and brand compliance before publishing.',
                    config: { condition: 'quality_score > 85 && plagiarism_check < 5%' },
                },
            },
            {
                id: '8',
                type: 'action-twitter',
                position: { x: 1100, y: 30 },
                data: {
                    label: '🐦 Twitter/X Publishing',
                    description: 'Posts optimized content to Twitter with hashtags and scheduling.',
                    config: { hashtags: true, scheduling: true, character_limit: 280 },
                },
            },
            {
                id: '9',
                type: 'action-facebook',
                position: { x: 1100, y: 90 },
                data: {
                    label: '📘 Facebook Page Post',
                    description: 'Publishes to Facebook with images and engagement optimization.',
                    config: { page_id: '', include_images: true, boost_option: false },
                },
            },
            {
                id: '10',
                type: 'action-tiktok',
                position: { x: 1100, y: 150 },
                data: {
                    label: '🎵 TikTok Video Script',
                    description: 'Generates TikTok video scripts and posts to TikTok for Business.',
                    config: { video_length: 60, trending_sounds: true, hashtags: true },
                },
            },
            {
                id: '11',
                type: 'action-save-db',
                position: { x: 1350, y: 90 },
                data: {
                    label: '💾 Content Analytics Storage',
                    description: 'Stores published content with performance tracking and engagement metrics.',
                    config: { table: 'content_analytics', track_engagement: true },
                },
            },
        ],
        edges: [
            { id: 'e1-2', source: '1', target: '2', type: 'default' },
            { id: 'e1-3', source: '1', target: '3', type: 'default' },
            { id: 'e2-4', source: '2', target: '4', type: 'default' },
            { id: 'e3-4', source: '3', target: '4', type: 'default' },
            { id: 'e4-5', source: '4', target: '5', type: 'default' },
            { id: 'e4-6', source: '4', target: '6', type: 'default' },
            { id: 'e5-7', source: '5', target: '7', type: 'default' },
            { id: 'e6-7', source: '6', target: '7', type: 'default' },
            { id: 'e7-8', source: '7', target: '8', type: 'default' },
            { id: 'e7-9', source: '7', target: '9', type: 'default' },
            { id: 'e7-10', source: '7', target: '10', type: 'default' },
            { id: 'e8-11', source: '8', target: '11', type: 'default' },
            { id: 'e9-11', source: '9', target: '11', type: 'default' },
            { id: 'e10-11', source: '10', target: '11', type: 'default' },
        ],
    },
    {
        id: 'automated-sales-funnel',
        name: 'Automated Sales Funnel',
        description: 'Complete sales automation with lead generation, qualification, nurturing, and conversion tracking across multiple channels.',
        category: 'Sales',
        nodes: [
            {
                id: '1',
                type: 'webhook-input',
                position: { x: 100, y: 100 },
                data: {
                    label: '🌐 Lead Capture Webhook',
                    description: 'Receives leads from website forms, social media, and advertising platforms.',
                    config: { sources: ['website', 'facebook_ads', 'google_ads', 'linkedin'] },
                },
            },
            {
                id: '2',
                type: 'logic-if',
                position: { x: 350, y: 50 },
                data: {
                    label: '🎯 Lead Scoring Agent',
                    description: 'Scores leads based on demographics, behavior, and engagement data.',
                    config: { condition: 'score >= 75' },
                },
            },
            {
                id: '3',
                type: 'ai-reasoning',
                position: { x: 600, y: 20 },
                data: {
                    label: '🤖 Personalized Outreach (Gemini)',
                    description: 'Creates personalized email sequences based on lead profile and interests.',
                    config: {
                        model: 'gemini-pro',
                        prompt: 'Craft a personalized sales email sequence for this lead. Include value proposition and call-to-action.',
                    },
                },
            },
            {
                id: '4',
                type: 'action-email',
                position: { x: 850, y: 20 },
                data: {
                    label: '📧 Gmail Sequence Send',
                    description: 'Sends personalized email sequence with A/B testing and tracking.',
                    config: {
                        sequence: ['intro', 'value_prop', 'objection_handling', 'close'],
                        ab_test: true,
                    },
                },
            },
            {
                id: '5',
                type: 'logic-if',
                position: { x: 350, y: 150 },
                data: {
                    label: '📞 Qualification Check',
                    description: 'Routes low-scoring leads to nurturing campaigns instead of direct sales.',
                    config: { condition: 'score < 75' },
                },
            },
            {
                id: '6',
                type: 'ai-reasoning',
                position: { x: 600, y: 120 },
                data: {
                    label: '📈 Nurture Content Generator',
                    description: 'Creates educational content series for lead nurturing.',
                    config: {
                        model: 'gpt-4',
                        prompt: 'Create a 5-part email nurture sequence about {topic} for {industry} professionals.',
                    },
                },
            },
            {
                id: '7',
                type: 'action-email',
                position: { x: 850, y: 120 },
                data: {
                    label: '📬 Mailchimp Nurture Campaign',
                    description: 'Adds leads to automated nurture sequences in Mailchimp.',
                    config: { list_id: '', segments: ['cold', 'warm', 'hot'] },
                },
            },
            {
                id: '8',
                type: 'logic-if',
                position: { x: 1100, y: 70 },
                data: {
                    label: '📊 Engagement Tracking',
                    description: 'Monitors email opens, clicks, and responses to move leads through funnel.',
                    config: { condition: 'engagement_score > 60' },
                },
            },
            {
                id: '9',
                type: 'action-telegram',
                position: { x: 1350, y: 30 },
                data: {
                    label: '💬 Telegram Sales Notification',
                    description: 'Alerts sales team for high-engagement leads requiring personal follow-up.',
                    config: { channel: 'sales-team', priority: 'high' },
                },
            },
            {
                id: '10',
                type: 'tool-api',
                position: { x: 1350, y: 110 },
                data: {
                    label: '📅 Calendly Integration',
                    description: 'Schedules demo calls for qualified leads using Calendly API.',
                    config: { event_type: 'demo', duration: 30 },
                },
            },
            {
                id: '11',
                type: 'action-save-db',
                position: { x: 1600, y: 70 },
                data: {
                    label: '📊 CRM Pipeline Update',
                    description: 'Updates lead status in CRM with conversion tracking and revenue attribution.',
                    config: { table: 'sales_pipeline', stages: ['lead', 'qualified', 'demo', 'closed'] },
                },
            },
        ],
        edges: [
            { id: 'e1-2', source: '1', target: '2', type: 'default' },
            { id: 'e1-5', source: '1', target: '5', type: 'default' },
            { id: 'e2-3', source: '2', target: '3', type: 'default' },
            { id: 'e3-4', source: '3', target: '4', type: 'default' },
            { id: 'e5-6', source: '5', target: '6', type: 'default' },
            { id: 'e6-7', source: '6', target: '7', type: 'default' },
            { id: 'e4-8', source: '4', target: '8', type: 'default' },
            { id: 'e7-8', source: '7', target: '8', type: 'default' },
            { id: 'e8-9', source: '8', target: '9', type: 'default' },
            { id: 'e8-10', source: '8', target: '10', type: 'default' },
            { id: 'e9-11', source: '9', target: '11', type: 'default' },
            { id: 'e10-11', source: '10', target: '11', type: 'default' },
        ],
    },
    {
        id: 'social-media-management-suite',
        name: 'Social Media Management Suite',
        description: 'Comprehensive social media automation with content creation, scheduling, engagement monitoring, and cross-platform analytics.',
        category: 'Social Media',
        nodes: [
            {
                id: '1',
                type: 'event-schedule',
                position: { x: 100, y: 100 },
                data: {
                    label: '⏰ Content Scheduling Trigger',
                    description: 'Triggers content creation and posting based on optimal posting times.',
                    config: { cron: '0 9,14,18 * * *', timezone: 'UTC' },
                },
            },
            {
                id: '2',
                type: 'ai-reasoning',
                position: { x: 350, y: 50 },
                data: {
                    label: '🎨 Content Ideation (Midjourney)',
                    description: 'Generates creative content ideas and visual concepts using AI.',
                    config: {
                        model: 'midjourney',
                        prompt: 'Generate 5 creative social media post ideas for {niche} with visual descriptions.',
                    },
                },
            },
            {
                id: '3',
                type: 'memory-vector',
                position: { x: 350, y: 150 },
                data: {
                    label: '📚 Brand Content Library',
                    description: 'Retrieves brand-approved content, templates, and past performance data.',
                    config: { collection: 'brand_assets', include_performance: true },
                },
            },
            {
                id: '4',
                type: 'ai-reasoning',
                position: { x: 600, y: 30 },
                data: {
                    label: '✍️ Copywriting Agent (GPT-4)',
                    description: 'Writes platform-optimized copy for each social media channel.',
                    config: {
                        model: 'gpt-4',
                        prompt: 'Write engaging social media copy for {platform} about {topic}. Include emojis and hashtags.',
                    },
                },
            },
            {
                id: '5',
                type: 'tool-api',
                position: { x: 600, y: 130 },
                data: {
                    label: '🖼️ Canva Design Automation',
                    description: 'Creates visual assets using Canva API with brand templates.',
                    config: { template_id: '', brand_colors: true, export_formats: ['png', 'jpg'] },
                },
            },
            {
                id: '6',
                type: 'logic-if',
                position: { x: 850, y: 80 },
                data: {
                    label: '📊 Performance Prediction',
                    description: 'Predicts engagement potential and optimizes posting strategy.',
                    config: { condition: 'predicted_engagement > 50' },
                },
            },
            {
                id: '7',
                type: 'action-twitter',
                position: { x: 1100, y: 30 },
                data: {
                    label: '🐦 Twitter/X Posting',
                    description: 'Posts to Twitter with optimal timing, hashtags, and thread creation.',
                    config: { auto_thread: true, poll_inclusion: false, media_upload: true },
                },
            },
            {
                id: '8',
                type: 'action-facebook',
                position: { x: 1100, y: 90 },
                data: {
                    label: '📘 Facebook & Instagram',
                    description: 'Cross-posts to Facebook and Instagram with carousel and stories.',
                    config: { cross_post: true, instagram_stories: true, boost_budget: 10 },
                },
            },
            {
                id: '9',
                type: 'action-tiktok',
                position: { x: 1100, y: 150 },
                data: {
                    label: '🎵 TikTok Creator',
                    description: 'Creates and uploads short-form video content to TikTok.',
                    config: { video_generation: true, trending_audio: true, duet_stitch: false },
                },
            },
            {
                id: '10',
                type: 'action-linkedin',
                position: { x: 1350, y: 60 },
                data: {
                    label: '💼 LinkedIn Professional',
                    description: 'Posts B2B content to LinkedIn with article publishing and groups.',
                    config: { article_publish: true, groups: true, professional_network: true },
                },
            },
            {
                id: '11',
                type: 'webhook-input',
                position: { x: 1350, y: 120 },
                data: {
                    label: '💬 Engagement Monitoring',
                    description: 'Monitors mentions, DMs, and comments across all platforms.',
                    config: { platforms: ['twitter', 'facebook', 'instagram', 'linkedin', 'tiktok'] },
                },
            },
            {
                id: '12',
                type: 'ai-reasoning',
                position: { x: 1600, y: 90 },
                data: {
                    label: '🤖 Auto-Response Agent',
                    description: 'Generates intelligent responses to comments and messages.',
                    config: {
                        model: 'gpt-4',
                        prompt: 'Respond professionally to this social media interaction. Maintain brand voice.',
                    },
                },
            },
            {
                id: '13',
                type: 'action-save-db',
                position: { x: 1850, y: 90 },
                data: {
                    label: '📈 Analytics Dashboard',
                    description: 'Stores engagement metrics, reach data, and performance insights.',
                    config: { table: 'social_analytics', real_time_updates: true },
                },
            },
        ],
        edges: [
            { id: 'e1-2', source: '1', target: '2', type: 'default' },
            { id: 'e1-3', source: '1', target: '3', type: 'default' },
            { id: 'e2-4', source: '2', target: '4', type: 'default' },
            { id: 'e3-5', source: '3', target: '5', type: 'default' },
            { id: 'e4-6', source: '4', target: '6', type: 'default' },
            { id: 'e5-6', source: '5', target: '6', type: 'default' },
            { id: 'e6-7', source: '6', target: '7', type: 'default' },
            { id: 'e6-8', source: '6', target: '8', type: 'default' },
            { id: 'e6-9', source: '6', target: '9', type: 'default' },
            { id: 'e7-10', source: '7', target: '10', type: 'default' },
            { id: 'e8-10', source: '8', target: '10', type: 'default' },
            { id: 'e9-10', source: '9', target: '10', type: 'default' },
            { id: 'e10-11', source: '10', target: '11', type: 'default' },
            { id: 'e11-12', source: '11', target: '12', type: 'default' },
            { id: 'e12-13', source: '12', target: '13', type: 'default' },
        ],
    },
    {
        id: 'ai-content-calendar-manager',
        name: 'AI Content Calendar Manager',
        description: 'Plans 30-day content calendars based on brand pillars, trending topics, and past performance data.',
        category: 'Social Media',
        nodes: [
            {
                id: '1',
                type: 'manual-input',
                position: { x: 100, y: 100 },
                data: {
                    label: '📝 Brand Strategy Input',
                    description: 'Comprehensive input for brand voice, content pillars, audience persona, and strategic guidelines.',
                    config: {
                        inputType: 'structured',
                        fields: [
                            {
                                name: 'brandVoice',
                                label: 'Brand Voice Document',
                                type: 'textarea',
                                required: true,
                                placeholder: 'Describe your brand voice, tone, personality, and communication style...',
                                validation: { minLength: 50, maxLength: 2000 },
                            },
                            {
                                name: 'contentPillars',
                                label: 'Content Pillars',
                                type: 'textarea',
                                required: true,
                                placeholder: 'List your core content pillars/themes (e.g., Education, Entertainment, Community)...',
                                validation: { minLength: 20, maxLength: 1000 },
                            },
                            {
                                name: 'audiencePersona',
                                label: 'Audience Persona',
                                type: 'textarea',
                                required: true,
                                placeholder: 'Detailed audience persona including demographics, interests, pain points, goals...',
                                validation: { minLength: 50, maxLength: 1500 },
                            },
                            {
                                name: 'brandGuidelines',
                                label: 'Brand Guidelines (Optional)',
                                type: 'file',
                                required: false,
                                accept: '.pdf,.doc,.docx,.txt',
                                maxSize: 10485760, // 10MB
                            },
                        ],
                        apiKeyRequired: false,
                        timeout: 30000,
                        fileUpload: true,
                        validationEnabled: true,
                        customValidation: '',
                        autoSave: true,
                        previewEnabled: true,
                    },
                },
            },
            {
                id: '2',
                type: 'tool-external',
                position: { x: 350, y: 100 },
                data: {
                    label: '📊 Multi-Platform Analytics Hub',
                    description: 'Advanced data aggregation from YouTube, TikTok, LinkedIn, Instagram, and Twitter with intelligent filtering and normalization.',
                    config: {
                        platforms: ['youtube', 'tiktok', 'linkedin', 'instagram', 'twitter'],
                        apiIntegration: true,
                        dataType: 'performance_metrics',
                        metrics: [
                            'views',
                            'likes',
                            'comments',
                            'shares',
                            'engagement_rate',
                            'reach',
                            'impressions',
                            'clicks',
                            'save_rate',
                            'watch_time',
                        ],
                        dateRange: { days: 30, includeToday: false },
                        aggregation: 'daily',
                        filtering: {
                            minEngagement: 0.01,
                            excludeBoosted: false,
                            contentTypes: ['post', 'story', 'reel', 'video', 'carousel'],
                        },
                        normalization: {
                            standardizeMetrics: true,
                            handleMissingData: 'interpolate',
                            outlierDetection: true,
                        },
                        authentication: {
                            oauthRequired: true,
                            apiKeysRequired: true,
                            rateLimitHandling: 'exponential_backoff',
                        },
                        errorHandling: {
                            retryAttempts: 3,
                            fallbackData: true,
                            timeout: 60000,
                        },
                        caching: {
                            enabled: true,
                            ttl: 3600000, // 1 hour
                        },
                        batchProcessing: true,
                        realTimeUpdates: false,
                    },
                },
            },
            {
                id: '3',
                type: 'ai-reasoning',
                position: { x: 600, y: 100 },
                data: {
                    label: '🎯 Performance Intelligence Analyzer',
                    description: 'Advanced AI analysis of performance data using statistical modeling and machine learning to identify top-performing content themes.',
                    config: {
                        model: 'gpt-4',
                        modelOptions: ['gpt-4', 'gpt-4-turbo', 'claude-3-opus', 'gemini-pro'],
                        prompt: `Analyze the provided performance data across all platforms and identify:
            
            TOP-PERFORMING THEMES ANALYSIS:
            1. Statistical Analysis: Calculate engagement rates, growth trends, and correlation coefficients
            2. Content Theme Clustering: Group similar content by themes using NLP techniques
            3. Performance Scoring: Create weighted scoring system (engagement 40%, reach 30%, conversion 30%)
            4. Trend Identification: Detect rising vs declining themes using time-series analysis
            5. Platform Optimization: Identify best-performing themes per platform
            
            OUTPUT FORMAT:
            - Top 5 Themes with performance scores
            - Theme performance by platform matrix
            - Recommended content allocation percentages
            - Risk analysis for theme saturation`,
                        apiKeyRequired: true,
                        temperature: 0.3,
                        maxTokens: 2000,
                        timeout: 90000,
                        retryAttempts: 3,
                        systemPrompt: 'You are an expert data analyst and content strategist with deep knowledge of social media analytics and statistical modeling.',
                        fileUpload: false,
                        customInstructions: 'Use advanced statistical methods and provide actionable insights with confidence intervals.',
                        contextWindow: 128000,
                        responseFormat: 'structured_json',
                        qualityThreshold: 0.85,
                        fallbackModel: 'gpt-3.5-turbo',
                    },
                },
            },
            {
                id: '4',
                type: 'ai-reasoning',
                position: { x: 850, y: 100 },
                data: {
                    label: '🔍 Trend Research Intelligence',
                    description: 'Comprehensive trend research using multiple data sources including social listening, search trends, and industry reports.',
                    config: {
                        model: 'gpt-4',
                        modelOptions: ['gpt-4', 'claude-3-sonnet', 'perplexity', 'gemini-pro'],
                        prompt: `Conduct comprehensive trend research for the niche based on brand pillars and audience persona:
            
            TREND ANALYSIS FRAMEWORK:
            1. Social Listening: Monitor conversations, hashtags, and sentiment across platforms
            2. Search Trend Analysis: Google Trends, keyword research, and search intent
            3. Industry Reports: Latest reports from relevant industry sources
            4. Competitor Analysis: Trending content from top competitors
            5. Seasonal & Cultural Trends: Calendar events, holidays, cultural moments
            6. Emerging Platforms: New features and trending formats
            
            OUTPUT REQUIREMENTS:
            - Current trending topics with momentum scores
            - Trend lifecycle stage (emerging, peaking, declining)
            - Audience resonance prediction
            - Brand alignment assessment
            - Content opportunity matrix`,
                        apiKeyRequired: true,
                        temperature: 0.4,
                        maxTokens: 2500,
                        timeout: 120000,
                        retryAttempts: 4,
                        systemPrompt: 'You are a senior trend researcher and cultural analyst with expertise in social media trends and consumer behavior.',
                        fileUpload: false,
                        customInstructions: 'Cross-reference multiple data sources and provide trend velocity metrics.',
                        contextWindow: 128000,
                        responseFormat: 'comprehensive_report',
                        qualityThreshold: 0.9,
                        fallbackModel: 'claude-3-haiku',
                        externalDataSources: ['google_trends', 'social_listening', 'industry_reports'],
                    },
                },
            },
            {
                id: '5',
                type: 'ai-reasoning',
                position: { x: 1100, y: 100 },
                data: {
                    label: '📅 Strategic Calendar Architect',
                    description: 'AI-powered content calendar generation using advanced scheduling algorithms and strategic distribution patterns.',
                    config: {
                        model: 'gpt-4',
                        modelOptions: ['gpt-4', 'claude-3-opus', 'gpt-4-turbo'],
                        prompt: `Create a strategic 30-day content calendar using advanced planning algorithms:
            
            CALENDAR ARCHITECTURE:
            1. Strategic Distribution: Optimize posting frequency and timing based on audience behavior
            2. Theme Rotation: Balance top-performing themes with trend exploration (70/30 split)
            3. Platform Optimization: Platform-specific content strategies and cross-promotion
            4. Seasonal Timing: Align with calendar events, holidays, and optimal posting windows
            5. Content Sequencing: Logical flow and narrative arcs across the month
            6. Performance Prediction: Estimate engagement potential for each piece of content
            
            CALENDAR STRUCTURE:
            - Daily content topics with strategic rationale
            - Platform distribution matrix
            - Content series and themes
            - Engagement prediction scores
            - Backup content suggestions`,
                        apiKeyRequired: true,
                        temperature: 0.2,
                        maxTokens: 3000,
                        timeout: 150000,
                        retryAttempts: 3,
                        systemPrompt: 'You are a master content strategist and calendar architect with expertise in content marketing and audience engagement optimization.',
                        fileUpload: false,
                        customInstructions: 'Use algorithmic optimization and provide detailed strategic rationale for each decision.',
                        contextWindow: 128000,
                        responseFormat: 'calendar_json',
                        qualityThreshold: 0.95,
                        fallbackModel: 'gpt-4-turbo',
                        optimizationAlgorithm: 'genetic_algorithm',
                        predictiveModeling: true,
                    },
                },
            },
            {
                id: '6',
                type: 'ai-reasoning',
                position: { x: 1350, y: 100 },
                data: {
                    label: '🎭 Content Format Optimizer',
                    description: 'Intelligent content format assignment using machine learning to match content types with audience preferences and platform algorithms.',
                    config: {
                        model: 'gpt-4',
                        modelOptions: ['gpt-4', 'claude-3-sonnet', 'gemini-pro'],
                        prompt: `Optimize content formats for maximum engagement using advanced format intelligence:
            
            FORMAT OPTIMIZATION MATRIX:
            1. Platform Algorithm Analysis: Current best-performing formats per platform
            2. Audience Preference Mapping: Format preferences by demographic and psychographic
            3. Content-Format Matching: Optimal format for each content type and topic
            4. Trend-Based Format Selection: Emerging formats and viral potential
            5. Cross-Platform Strategy: Format variations for multi-platform distribution
            
            FORMAT TYPES TO ASSIGN:
            - Video (Short-form, Long-form, Live)
            - Carousel/Image Series
            - Text/Thread Posts
            - Stories/Reels
            - Interactive Content (Polls, Q&A)
            - Mixed Media
            
            OUTPUT: Format assignment with performance prediction and strategic rationale`,
                        apiKeyRequired: true,
                        temperature: 0.3,
                        maxTokens: 1500,
                        timeout: 75000,
                        retryAttempts: 2,
                        systemPrompt: 'You are a content format specialist with deep knowledge of social media algorithms and audience engagement patterns.',
                        fileUpload: false,
                        customInstructions: 'Use data-driven format selection with algorithmic optimization.',
                        contextWindow: 64000,
                        responseFormat: 'format_matrix',
                        qualityThreshold: 0.8,
                        fallbackModel: 'gpt-3.5-turbo',
                        algorithmDriven: true,
                        realTimeOptimization: false,
                    },
                },
            },
            {
                id: '7',
                type: 'ai-reasoning',
                position: { x: 1600, y: 100 },
                data: {
                    label: '📋 Professional Content Brief Generator',
                    description: 'Enterprise-grade content brief creation with detailed specifications, creative direction, and performance metrics.',
                    config: {
                        model: 'gpt-4',
                        modelOptions: ['gpt-4', 'claude-3-opus', 'gpt-4-turbo'],
                        prompt: `Generate comprehensive, professional content briefs for each calendar item:
            
            BRIEF SPECIFICATIONS:
            1. Content Objective: Clear goal and key performance indicators
            2. Target Audience: Specific segment and psychographic profile
            3. Key Messages: Core value propositions and talking points
            4. Creative Direction: Visual style, tone, and brand alignment
            5. Technical Requirements: Format specifications and platform optimizations
            6. Call-to-Action: Specific CTA with expected conversion metrics
            7. Success Metrics: Measurable outcomes and tracking requirements
            8. Backup Content: Alternative approaches and contingency plans
            
            PROFESSIONAL FORMAT:
            - Executive Summary
            - Content Specifications
            - Creative Guidelines
            - Technical Requirements
            - Performance Expectations
            - Approval Workflow`,
                        apiKeyRequired: true,
                        temperature: 0.1,
                        maxTokens: 4000,
                        timeout: 180000,
                        retryAttempts: 3,
                        systemPrompt: 'You are a senior content strategist and creative director with expertise in developing high-converting content briefs.',
                        fileUpload: false,
                        customInstructions: 'Create enterprise-grade briefs with detailed specifications and measurable objectives.',
                        contextWindow: 128000,
                        responseFormat: 'professional_brief',
                        qualityThreshold: 0.95,
                        fallbackModel: 'claude-3-sonnet',
                        templateDriven: true,
                        complianceChecking: true,
                    },
                },
            },
            {
                id: '8',
                type: 'tool-external',
                position: { x: 1850, y: 100 },
                data: {
                    label: '📊 Enterprise Spreadsheet Publisher',
                    description: 'Advanced Google Sheets integration with automated formatting, data visualization, and collaborative features.',
                    config: {
                        platform: 'google_sheets',
                        apiIntegration: true,
                        outputFormat: 'spreadsheet',
                        spreadsheetConfig: {
                            title: 'AI Content Calendar - {brand_name} - {month_year}',
                            templateId: 'content_calendar_template_v2',
                            tabs: [
                                'Calendar Overview',
                                'Content Briefs',
                                'Performance Tracking',
                                'Analytics Dashboard',
                            ],
                            formatting: {
                                conditionalFormatting: true,
                                dataValidation: true,
                                charts: true,
                                pivotTables: true,
                            },
                        },
                        dataStructure: {
                            calendarSheet: {
                                columns: [
                                    'Date',
                                    'Platform',
                                    'Content_Type',
                                    'Topic',
                                    'Brief_Status',
                                    'Performance_Goal',
                                    'Assignee',
                                ],
                                dateFormat: 'MM/DD/YYYY',
                                autoSort: true,
                                filters: true,
                            },
                            briefsSheet: {
                                richText: true,
                                images: true,
                                hyperlinks: true,
                                comments: true,
                            },
                        },
                        automation: {
                            formulas: true,
                            scripts: true,
                            triggers: true,
                            notifications: true,
                        },
                        collaboration: {
                            sharingPermissions: 'editor',
                            comments: true,
                            versionHistory: true,
                            realTimeEditing: true,
                        },
                        authentication: {
                            serviceAccount: true,
                            oauthScopes: ['spreadsheets', 'drive'],
                            tokenRefresh: true,
                        },
                        errorHandling: {
                            retryAttempts: 3,
                            backupCreation: true,
                            timeout: 120000,
                        },
                        exportOptions: {
                            pdf: true,
                            csv: true,
                            excel: true,
                            json: true,
                        },
                        integration: {
                            calendarSync: true,
                            crmIntegration: false,
                            analyticsSync: true,
                        },
                    },
                },
            },
        ],
        edges: [
            { id: 'e1-2', source: '1', target: '2', type: 'default' },
            { id: 'e2-3', source: '2', target: '3', type: 'default' },
            { id: 'e3-4', source: '3', target: '4', type: 'default' },
            { id: 'e4-5', source: '4', target: '5', type: 'default' },
            { id: 'e5-6', source: '5', target: '6', type: 'default' },
            { id: 'e6-7', source: '6', target: '7', type: 'default' },
            { id: 'e7-8', source: '7', target: '8', type: 'default' },
        ],
    },
];
