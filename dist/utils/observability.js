"use strict";
// Observability and logging utilities for workflow execution
Object.defineProperty(exports, "__esModule", { value: true });
exports.executionStore = exports.NodeStatus = void 0;
exports.createObservableLogger = createObservableLogger;
var NodeStatus;
(function (NodeStatus) {
    NodeStatus["PENDING"] = "pending";
    NodeStatus["RUNNING"] = "running";
    NodeStatus["COMPLETED"] = "completed";
    NodeStatus["FAILED"] = "failed";
    NodeStatus["SKIPPED"] = "skipped";
    NodeStatus["RETRYING"] = "retrying";
})(NodeStatus || (exports.NodeStatus = NodeStatus = {}));
// In-memory storage for active executions (in production, use Redis/database)
class ExecutionStore {
    constructor() {
        this.executions = new Map();
        this.listeners = new Map();
    }
    createExecution(executionId, workflowId) {
        const status = {
            executionId,
            workflowId,
            status: "queued",
            progress: 0,
            startTime: new Date(),
            nodeStatuses: {},
            logs: [],
            errors: [],
            metrics: {
                nodesExecuted: 0,
                totalExecutionTime: 0,
                memoryUsed: 0,
                apiCalls: 0,
                retries: 0,
            },
        };
        this.executions.set(executionId, status);
        return status;
    }
    updateExecution(executionId, updates) {
        const execution = this.executions.get(executionId);
        if (!execution)
            return;
        Object.assign(execution, updates);
        this.notifyListeners(executionId, execution);
    }
    updateNodeStatus(executionId, nodeId, nodeStatus) {
        const execution = this.executions.get(executionId);
        if (!execution)
            return;
        if (!execution.nodeStatuses[nodeId]) {
            execution.nodeStatuses[nodeId] = {
                nodeId,
                type: "",
                label: "",
                status: NodeStatus.PENDING,
                progress: 0,
                ...nodeStatus,
            };
        }
        else {
            Object.assign(execution.nodeStatuses[nodeId], nodeStatus);
        }
        this.notifyListeners(executionId, execution);
    }
    addLog(executionId, log) {
        const execution = this.executions.get(executionId);
        if (!execution)
            return;
        execution.logs.push(log);
        this.notifyListeners(executionId, execution);
    }
    addError(executionId, error) {
        const execution = this.executions.get(executionId);
        if (!execution)
            return;
        execution.errors.push(error);
        this.notifyListeners(executionId, execution);
    }
    getExecution(executionId) {
        return this.executions.get(executionId);
    }
    getAllExecutions() {
        return Array.from(this.executions.values());
    }
    subscribe(executionId, callback) {
        if (!this.listeners.has(executionId)) {
            this.listeners.set(executionId, new Set());
        }
        this.listeners.get(executionId).add(callback);
        // Send current status immediately
        const execution = this.executions.get(executionId);
        if (execution) {
            callback(execution);
        }
        // Return unsubscribe function
        return () => {
            const listeners = this.listeners.get(executionId);
            if (listeners) {
                listeners.delete(callback);
                if (listeners.size === 0) {
                    this.listeners.delete(executionId);
                }
            }
        };
    }
    notifyListeners(executionId, status) {
        const listeners = this.listeners.get(executionId);
        if (listeners) {
            listeners.forEach((callback) => {
                try {
                    callback(status);
                }
                catch (error) {
                    console.error("Error in execution listener:", error);
                }
            });
        }
    }
    // Cleanup old executions (keep last 100, remove older than 24 hours)
    cleanup() {
        const now = Date.now();
        const executions = Array.from(this.executions.entries());
        // Keep only last 100 executions
        if (executions.length > 100) {
            executions
                .sort(([, a], [, b]) => b.startTime.getTime() - a.startTime.getTime())
                .slice(100)
                .forEach(([id]) => {
                this.executions.delete(id);
                this.listeners.delete(id);
            });
        }
        // Remove executions older than 24 hours
        executions.forEach(([id, execution]) => {
            if (now - execution.startTime.getTime() > 24 * 60 * 60 * 1000) {
                this.executions.delete(id);
                this.listeners.delete(id);
            }
        });
    }
}
// Global execution store instance
exports.executionStore = new ExecutionStore();
// Cleanup old executions every hour
setInterval(() => exports.executionStore.cleanup(), 60 * 60 * 1000);
// Enhanced logging function
function createObservableLogger(executionId, workflowId) {
    return {
        log: (nodeId, level, message, data, metadata) => {
            const log = {
                id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                executionId,
                workflowId,
                nodeId,
                timestamp: new Date(),
                level,
                message,
                data,
                metadata,
            };
            exports.executionStore.addLog(executionId, log);
            return log;
        },
        updateNodeStatus: (nodeId, status) => {
            exports.executionStore.updateNodeStatus(executionId, nodeId, status);
        },
        updateExecutionStatus: (updates) => {
            exports.executionStore.updateExecution(executionId, updates);
        },
        addError: (error) => {
            exports.executionStore.addError(executionId, error);
        },
    };
}
