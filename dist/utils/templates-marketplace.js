"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.templateCategories = exports.builtInTemplates = void 0;
exports.getTemplatesByCategory = getTemplatesByCategory;
exports.searchTemplates = searchTemplates;
exports.getFeaturedTemplates = getFeaturedTemplates;
exports.getTemplateById = getTemplateById;
// Built-in templates
exports.builtInTemplates = [
    {
        id: 'ai-social-media-growth-agent',
        name: 'AI Social Media Growth Agent',
        description: 'Autonomously generates, improves, stores, and optionally posts high-quality social media content using AI, memory, and tool integrations.',
        category: 'Social Media',
        tags: ['AI', 'Social Media', 'Content Generation', 'Marketing'],
        author: {
            name: 'Denbegnaye Team',
            avatar: '/avatars/team.png',
        },
        rating: 4.8,
        downloads: 1250,
        createdAt: '2024-01-15T00:00:00Z',
        updatedAt: '2024-03-01T00:00:00Z',
        version: '1.2.0',
        featured: true,
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
                        prompt: 'Research current trends and viral content in {topic}',
                        model: 'gemini-pro',
                    },
                },
            },
            {
                id: '4',
                type: 'ai-reasoning',
                position: { x: 680, y: 120 },
                data: {
                    label: 'Content Generation',
                    description: 'Generate engaging social media content based on research and past posts.',
                    config: {
                        prompt: 'Create viral social media content about {topic} using these trends: {trends} and style from: {pastPosts}',
                        model: 'gemini-pro',
                    },
                },
            },
            {
                id: '5',
                type: 'memory-store',
                position: { x: 880, y: 80 },
                data: {
                    label: 'Store Generated Content',
                    description: 'Save the generated content to memory for future reference.',
                    config: {
                        memoryType: 'firestore',
                        collection: 'social_content',
                        data: '{generatedContent}',
                    },
                },
            },
            {
                id: '6',
                type: 'action-twitter',
                position: { x: 1080, y: 120 },
                data: {
                    label: 'Post to Twitter',
                    description: 'Optionally post the generated content to Twitter.',
                    config: {
                        enabled: false,
                        content: '{generatedContent}',
                    },
                },
            },
        ],
        edges: [
            { id: 'e1-2', source: '1', target: '2', type: 'default' },
            { id: 'e1-3', source: '1', target: '3', type: 'default' },
            { id: 'e2-4', source: '2', target: '4', type: 'default' },
            { id: 'e3-4', source: '3', target: '4', type: 'default' },
            { id: 'e4-5', source: '4', target: '5', type: 'default' },
            { id: 'e5-6', source: '5', target: '6', type: 'default' },
        ],
    },
    {
        id: 'email-automation-agent',
        name: 'Email Marketing Automation Agent',
        description: 'Automates email campaign creation, personalization, and scheduling with AI-powered content generation.',
        category: 'Marketing',
        tags: ['Email', 'Marketing', 'Automation', 'AI'],
        author: {
            name: 'Denbegnaye Team',
            avatar: '/avatars/team.png',
        },
        rating: 4.6,
        downloads: 890,
        createdAt: '2024-02-01T00:00:00Z',
        updatedAt: '2024-03-15T00:00:00Z',
        version: '1.1.0',
        featured: true,
        nodes: [
            {
                id: '1',
                type: 'manual-input',
                position: { x: 80, y: 120 },
                data: {
                    label: 'Campaign Brief',
                    description: 'Enter campaign details, target audience, and goals.',
                    config: {
                        inputType: 'textarea',
                        placeholder: 'Campaign for product launch targeting tech professionals...',
                    },
                },
            },
            {
                id: '2',
                type: 'ai-reasoning',
                position: { x: 280, y: 80 },
                data: {
                    label: 'Audience Analysis',
                    description: 'Analyze target audience preferences and behavior.',
                    config: {
                        prompt: 'Analyze the target audience for this campaign: {brief}',
                        model: 'gemini-pro',
                    },
                },
            },
            {
                id: '3',
                type: 'ai-reasoning',
                position: { x: 480, y: 120 },
                data: {
                    label: 'Content Generation',
                    description: 'Generate personalized email content and subject lines.',
                    config: {
                        prompt: 'Create compelling email content for: {brief} targeting: {audience}',
                        model: 'gemini-pro',
                    },
                },
            },
            {
                id: '4',
                type: 'action-email',
                position: { x: 680, y: 80 },
                data: {
                    label: 'Send Test Email',
                    description: 'Send a test email to verify content and formatting.',
                    config: {
                        to: 'test@example.com',
                        subject: '{subjectLine}',
                        content: '{emailContent}',
                    },
                },
            },
            {
                id: '5',
                type: 'schedule-manager',
                position: { x: 880, y: 120 },
                data: {
                    label: 'Schedule Campaign',
                    description: 'Schedule the email campaign for optimal delivery time.',
                    config: {
                        schedule: '0 9 * * 1', // Monday 9 AM
                        action: 'send_campaign',
                    },
                },
            },
        ],
        edges: [
            { id: 'e1-2', source: '1', target: '2', type: 'default' },
            { id: 'e1-3', source: '1', target: '3', type: 'default' },
            { id: 'e2-3', source: '2', target: '3', type: 'default' },
            { id: 'e3-4', source: '3', target: '4', type: 'default' },
            { id: 'e4-5', source: '4', target: '5', type: 'default' },
        ],
    },
    {
        id: 'data-analysis-agent',
        name: 'Data Analysis & Reporting Agent',
        description: 'Automatically analyzes datasets, generates insights, and creates comprehensive reports with visualizations.',
        category: 'Analytics',
        tags: ['Data', 'Analytics', 'Reporting', 'AI'],
        author: {
            name: 'Denbegnaye Team',
            avatar: '/avatars/team.png',
        },
        rating: 4.7,
        downloads: 675,
        createdAt: '2024-01-20T00:00:00Z',
        updatedAt: '2024-02-28T00:00:00Z',
        version: '1.0.5',
        nodes: [
            {
                id: '1',
                type: 'file-input',
                position: { x: 80, y: 120 },
                data: {
                    label: 'Data Source',
                    description: 'Upload or connect to data source (CSV, API, database).',
                    config: {
                        fileType: 'csv',
                        maxSize: '10MB',
                    },
                },
            },
            {
                id: '2',
                type: 'ai-reasoning',
                position: { x: 280, y: 80 },
                data: {
                    label: 'Data Analysis',
                    description: 'Analyze data patterns, trends, and key insights.',
                    config: {
                        prompt: 'Analyze this dataset and identify key patterns, trends, and insights: {data}',
                        model: 'gemini-pro',
                    },
                },
            },
            {
                id: '3',
                type: 'ai-reasoning',
                position: { x: 480, y: 120 },
                data: {
                    label: 'Generate Report',
                    description: 'Create a comprehensive report with visualizations and recommendations.',
                    config: {
                        prompt: 'Create a detailed report based on this analysis: {insights}',
                        model: 'gemini-pro',
                    },
                },
            },
            {
                id: '4',
                type: 'action-save-db',
                position: { x: 680, y: 80 },
                data: {
                    label: 'Save Report',
                    description: 'Save the generated report to the database.',
                    config: {
                        table: 'reports',
                        data: '{report}',
                    },
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
        id: 'customer-support-agent',
        name: 'AI Customer Support Agent',
        description: 'Handles customer inquiries, provides instant responses, and escalates complex issues automatically.',
        category: 'Customer Service',
        tags: ['Support', 'AI', 'Automation', 'Customer Service'],
        author: {
            name: 'Denbegnaye Team',
            avatar: '/avatars/team.png',
        },
        rating: 4.5,
        downloads: 920,
        createdAt: '2024-02-10T00:00:00Z',
        updatedAt: '2024-03-10T00:00:00Z',
        version: '1.1.2',
        nodes: [
            {
                id: '1',
                type: 'webhook-input',
                position: { x: 80, y: 120 },
                data: {
                    label: 'Customer Inquiry',
                    description: 'Receive customer inquiries via webhook or chat integration.',
                    config: {
                        webhookUrl: '/api/webhooks/support',
                        expectedFields: ['message', 'customerId', 'priority'],
                    },
                },
            },
            {
                id: '2',
                type: 'ai-reasoning',
                position: { x: 280, y: 80 },
                data: {
                    label: 'Analyze Inquiry',
                    description: 'Categorize and analyze the customer inquiry.',
                    config: {
                        prompt: 'Analyze this customer inquiry and determine category, sentiment, and urgency: {message}',
                        model: 'gemini-pro',
                    },
                },
            },
            {
                id: '3',
                type: 'logic-condition',
                position: { x: 480, y: 120 },
                data: {
                    label: 'Check Complexity',
                    description: 'Determine if the inquiry requires human intervention.',
                    config: {
                        condition: 'complexity === "high" || sentiment === "negative"',
                        trueLabel: 'Escalate',
                        falseLabel: 'Auto-Respond',
                    },
                },
            },
            {
                id: '4',
                type: 'ai-reasoning',
                position: { x: 680, y: 40 },
                data: {
                    label: 'Generate Response',
                    description: 'Generate an appropriate automated response.',
                    config: {
                        prompt: 'Generate a helpful response for this customer inquiry: {message}',
                        model: 'gemini-pro',
                    },
                },
            },
            {
                id: '5',
                type: 'action-email',
                position: { x: 880, y: 80 },
                data: {
                    label: 'Escalate to Human',
                    description: 'Send escalation notification to support team.',
                    config: {
                        to: 'support@company.com',
                        subject: 'Customer Support Escalation',
                        content: 'Complex inquiry from customer {customerId}: {message}',
                    },
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
];
// Categories for marketplace filtering
exports.templateCategories = [
    'All',
    'Social Media',
    'Marketing',
    'Analytics',
    'Customer Service',
    'E-commerce',
    'Content Creation',
    'Automation',
    'Data Processing',
    'Communication',
];
// Helper functions
function getTemplatesByCategory(category) {
    if (category === 'All')
        return exports.builtInTemplates;
    return exports.builtInTemplates.filter(template => template.category === category);
}
function searchTemplates(query) {
    const lowercaseQuery = query.toLowerCase();
    return exports.builtInTemplates.filter(template => template.name.toLowerCase().includes(lowercaseQuery) ||
        template.description.toLowerCase().includes(lowercaseQuery) ||
        template.tags.some(tag => tag.toLowerCase().includes(lowercaseQuery)) ||
        template.category.toLowerCase().includes(lowercaseQuery));
}
function getFeaturedTemplates() {
    return exports.builtInTemplates.filter(template => template.featured);
}
function getTemplateById(id) {
    return exports.builtInTemplates.find(template => template.id === id);
}
