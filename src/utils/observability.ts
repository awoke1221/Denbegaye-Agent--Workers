// Observability and logging utilities for workflow execution

export enum NodeStatus {
  PENDING = "pending",
  RUNNING = "running",
  COMPLETED = "completed",
  FAILED = "failed",
  SKIPPED = "skipped",
  RETRYING = "retrying",
}

export interface ExecutionStatus {
  executionId: string;
  workflowId: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  progress: number;
  startTime: Date;
  endTime?: Date;
  nodeStatuses: Record<string, NodeStatusInfo>;
  logs: ExecutionLog[];
  errors: string[];
  metrics: {
    nodesExecuted: number;
    totalExecutionTime: number;
    memoryUsed: number;
    apiCalls: number;
    retries: number;
  };
  duration?: number;
}

export interface NodeStatusInfo {
  nodeId: string;
  type: string;
  label: string;
  status: NodeStatus;
  progress: number;
  startTime?: Date;
  endTime?: Date;
  attempts?: number;
  error?: string;
}

export interface ExecutionLog {
  id: string;
  executionId: string;
  workflowId: string;
  nodeId?: string;
  timestamp: Date;
  level: "info" | "warn" | "error" | "debug";
  message: string;
  data?: Record<string, any>;
  metadata?: Record<string, any>;
}

// In-memory storage for active executions (in production, use Redis/database)
class ExecutionStore {
  private executions = new Map<string, ExecutionStatus>();
  private listeners = new Map<string, Set<(status: ExecutionStatus) => void>>();

  createExecution(executionId: string, workflowId: string): ExecutionStatus {
    const status: ExecutionStatus = {
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

  updateExecution(
    executionId: string,
    updates: Partial<ExecutionStatus>,
  ): void {
    const execution = this.executions.get(executionId);
    if (!execution) return;
    Object.assign(execution, updates);
    this.notifyListeners(executionId, execution);
  }

  updateNodeStatus(
    executionId: string,
    nodeId: string,
    nodeStatus: Partial<NodeStatusInfo>,
  ): void {
    const execution = this.executions.get(executionId);
    if (!execution) return;

    if (!execution.nodeStatuses[nodeId]) {
      execution.nodeStatuses[nodeId] = {
        nodeId,
        type: "",
        label: "",
        status: NodeStatus.PENDING,
        progress: 0,
        ...nodeStatus,
      };
    } else {
      Object.assign(execution.nodeStatuses[nodeId], nodeStatus);
    }
    this.notifyListeners(executionId, execution);
  }

  addLog(executionId: string, log: ExecutionLog): void {
    const execution = this.executions.get(executionId);
    if (!execution) return;
    execution.logs.push(log);
    this.notifyListeners(executionId, execution);
  }

  addError(executionId: string, error: string): void {
    const execution = this.executions.get(executionId);
    if (!execution) return;
    execution.errors.push(error);
    this.notifyListeners(executionId, execution);
  }

  getExecution(executionId: string): ExecutionStatus | undefined {
    return this.executions.get(executionId);
  }

  getAllExecutions(): ExecutionStatus[] {
    return Array.from(this.executions.values());
  }

  subscribe(
    executionId: string,
    callback: (status: ExecutionStatus) => void,
  ): () => void {
    if (!this.listeners.has(executionId)) {
      this.listeners.set(executionId, new Set());
    }
    this.listeners.get(executionId)!.add(callback);

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

  private notifyListeners(executionId: string, status: ExecutionStatus): void {
    const listeners = this.listeners.get(executionId);
    if (listeners) {
      listeners.forEach((callback) => {
        try {
          callback(status);
        } catch (error) {
          console.error("Error in execution listener:", error);
        }
      });
    }
  }

  // Cleanup old executions (keep last 100, remove older than 24 hours)
  cleanup(): void {
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
export const executionStore = new ExecutionStore();

// Cleanup old executions every hour
setInterval(() => executionStore.cleanup(), 60 * 60 * 1000);

// Enhanced logging function
export function createObservableLogger(
  executionId: string,
  workflowId: string,
) {
  return {
    log: (
      nodeId: string | undefined,
      level: "info" | "warn" | "error" | "debug",
      message: string,
      data?: Record<string, any>,
      metadata?: Record<string, any>,
    ): ExecutionLog => {
      const log: ExecutionLog = {
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
      executionStore.addLog(executionId, log);
      return log;
    },

    updateNodeStatus: (
      nodeId: string,
      status: Partial<NodeStatusInfo>,
    ): void => {
      executionStore.updateNodeStatus(executionId, nodeId, status);
    },

    updateExecutionStatus: (updates: Partial<ExecutionStatus>): void => {
      executionStore.updateExecution(executionId, updates);
    },

    addError: (error: string): void => {
      executionStore.addError(executionId, error);
    },
  };
}
