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
exports.SchedulerService = void 0;
exports.getScheduler = getScheduler;
const cron = __importStar(require("node-cron"));
const supabaseClient_1 = require("./supabaseClient");
class SchedulerService {
    constructor(executionEngine) {
        this.jobs = new Map();
        this.executionEngine = executionEngine;
        this.loadScheduledJobs();
    }
    // Load all enabled scheduled jobs from database
    async loadScheduledJobs() {
        try {
            const { data: jobs, error } = await supabaseClient_1.supabase
                .from("scheduledJobs")
                .select("*")
                .eq("enabled", true);
            if (error) {
                console.error("Failed to load scheduled jobs:", error);
                return;
            }
            for (const job of jobs) {
                this.scheduleJob(job);
            }
            console.log(`Loaded ${jobs.length} scheduled jobs`);
        }
        catch (error) {
            console.error("Error loading scheduled jobs:", error);
        }
    }
    // Schedule a job
    scheduleJob(job) {
        try {
            // Validate cron expression
            if (!cron.validate(job.cronExpression)) {
                console.error(`Invalid cron expression for job ${job.id}: ${job.cronExpression}`);
                return;
            }
            // Cancel existing job if it exists
            this.cancelJob(job.id);
            // Create new scheduled task
            const task = cron.schedule(job.cronExpression, async () => {
                await this.executeScheduledJob(job);
            }, {
                timezone: job.timezone || "UTC",
            });
            this.jobs.set(job.id, task);
            console.log(`Scheduled job ${job.id} (${job.name}) with cron: ${job.cronExpression}`);
        }
        catch (error) {
            console.error(`Failed to schedule job ${job.id}:`, error);
        }
    }
    // Execute a scheduled job
    async executeScheduledJob(job) {
        try {
            console.log(`Executing scheduled job: ${job.name} (${job.id})`);
            // Get workflow definition
            const { data: workflow, error: workflowError } = await supabaseClient_1.supabase
                .from("agentWorkflows")
                .select("*")
                .eq("id", job.workflowId)
                .single();
            if (workflowError || !workflow) {
                console.error(`Workflow not found for job ${job.id}:`, workflowError);
                await this.updateJobStatus(job.id, "failure");
                return;
            }
            // Execute workflow
            const result = await this.executionEngine.execute(workflow, {
                userId: job.userId,
                variables: job.payload || {},
            });
            // Update job status
            const status = result.status === "success" ? "success" : "failure";
            await this.updateJobStatus(job.id, status);
            console.log(`Scheduled job ${job.id} completed with status: ${status}`);
        }
        catch (error) {
            console.error(`Scheduled job ${job.id} failed:`, error);
            await this.updateJobStatus(job.id, "failure");
        }
    }
    // Update job status in database
    async updateJobStatus(jobId, status) {
        try {
            await supabaseClient_1.supabase
                .from("scheduledJobs")
                .update({
                lastRun: new Date().toISOString(),
                lastStatus: status,
                updatedAt: new Date().toISOString(),
            })
                .eq("id", jobId);
        }
        catch (error) {
            console.error(`Failed to update job status for ${jobId}:`, error);
        }
    }
    // Public methods
    // Create a new scheduled job
    async createJob(jobData) {
        try {
            const job = {
                ...jobData,
                id: `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                createdAt: new Date(),
                updatedAt: new Date(),
            };
            const { data, error } = await supabaseClient_1.supabase
                .from("scheduledJobs")
                .insert({
                id: job.id,
                workflowId: job.workflowId,
                userId: job.userId,
                cronExpression: job.cronExpression,
                name: job.name,
                description: job.description,
                enabled: job.enabled,
                timezone: job.timezone,
                payload: job.payload,
                createdAt: job.createdAt.toISOString(),
                updatedAt: job.updatedAt.toISOString(),
            })
                .select()
                .single();
            if (error) {
                throw new Error(error.message);
            }
            // Schedule the job if enabled
            if (job.enabled) {
                this.scheduleJob(job);
            }
            return job.id;
        }
        catch (error) {
            console.error("Failed to create scheduled job:", error);
            throw error;
        }
    }
    // Update an existing job
    async updateJob(jobId, updates) {
        try {
            const { error } = await supabaseClient_1.supabase
                .from("scheduledJobs")
                .update({
                ...updates,
                updatedAt: new Date().toISOString(),
            })
                .eq("id", jobId);
            if (error) {
                throw new Error(error.message);
            }
            // Reload job and reschedule if needed
            const job = await this.getJob(jobId);
            if (job) {
                if (job.enabled) {
                    this.scheduleJob(job);
                }
                else {
                    this.cancelJob(jobId);
                }
            }
        }
        catch (error) {
            console.error(`Failed to update job ${jobId}:`, error);
            throw error;
        }
    }
    // Delete a job
    async deleteJob(jobId) {
        try {
            // Cancel the scheduled task
            this.cancelJob(jobId);
            // Delete from database
            const { error } = await supabaseClient_1.supabase
                .from("scheduledJobs")
                .delete()
                .eq("id", jobId);
            if (error) {
                throw new Error(error.message);
            }
        }
        catch (error) {
            console.error(`Failed to delete job ${jobId}:`, error);
            throw error;
        }
    }
    // Get a job by ID
    async getJob(jobId) {
        try {
            const { data, error } = await supabaseClient_1.supabase
                .from("scheduledJobs")
                .select("*")
                .eq("id", jobId)
                .single();
            if (error) {
                return null;
            }
            return {
                ...data,
                createdAt: new Date(data.createdAt),
                updatedAt: new Date(data.updatedAt),
                nextRun: data.nextRun ? new Date(data.nextRun) : undefined,
                lastRun: data.lastRun ? new Date(data.lastRun) : undefined,
            };
        }
        catch (error) {
            console.error(`Failed to get job ${jobId}:`, error);
            return null;
        }
    }
    // Get all jobs for a user
    async getUserJobs(userId) {
        try {
            const { data, error } = await supabaseClient_1.supabase
                .from("scheduledJobs")
                .select("*")
                .eq("userId", userId)
                .order("createdAt", { ascending: false });
            if (error) {
                throw new Error(error.message);
            }
            return data.map((job) => ({
                ...job,
                createdAt: new Date(job.createdAt),
                updatedAt: new Date(job.updatedAt),
                nextRun: job.nextRun ? new Date(job.nextRun) : undefined,
                lastRun: job.lastRun ? new Date(job.lastRun) : undefined,
            }));
        }
        catch (error) {
            console.error(`Failed to get jobs for user ${userId}:`, error);
            return [];
        }
    }
    // Enable/disable a job
    async toggleJob(jobId, enabled) {
        await this.updateJob(jobId, { enabled });
        if (enabled) {
            const job = await this.getJob(jobId);
            if (job) {
                this.scheduleJob(job);
            }
        }
        else {
            this.cancelJob(jobId);
        }
    }
    // Cancel a scheduled job
    cancelJob(jobId) {
        const task = this.jobs.get(jobId);
        if (task) {
            task.destroy();
            this.jobs.delete(jobId);
        }
    }
    // Validate cron expression
    validateCronExpression(expression) {
        return cron.validate(expression);
    }
    // Get next run time for a cron expression
    getNextRunTime(expression, timezone) {
        try {
            // This is a simplified implementation
            // In a real-world scenario, you'd use a more sophisticated cron parser
            const now = new Date();
            // For now, return a placeholder - you'd need a proper cron parser library
            return new Date(now.getTime() + 24 * 60 * 60 * 1000); // Next day
        }
        catch {
            return null;
        }
    }
    // Cleanup method
    destroy() {
        for (const task of this.jobs.values()) {
            task.destroy();
        }
        this.jobs.clear();
    }
}
exports.SchedulerService = SchedulerService;
// Export singleton instance
let schedulerInstance = null;
function getScheduler(executionEngine) {
    if (!schedulerInstance && executionEngine) {
        schedulerInstance = new SchedulerService(executionEngine);
    }
    return schedulerInstance;
}
