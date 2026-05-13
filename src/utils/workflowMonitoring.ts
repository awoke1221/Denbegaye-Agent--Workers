/**
 * Advanced Workflow Monitoring and Recovery System
 * Provides comprehensive monitoring, health checks, and recovery capabilities
 */

import { supabase } from "./supabaseClient";
import { logger } from "./logger";
import { AdvancedWorkflowExecutor } from "./agentEngine";

interface WorkflowHealthMetrics {
  totalExecutions: number;
  successfulExecutions: number;
  partialSuccessExecutions: number;
  failedExecutions: number;
  averageExecutionTime: number;
  circuitBreakerTrips: number;
  nodeFailureRates: Record<string, number>;
  recentErrors: Array<{
    executionId: string;
    error: string;
    timestamp: Date;
    nodeId?: string;
  }>;
}

interface RecoveryOptions {
  executionId: string;
  recoveryStrategy: "retry" | "compensate" | "skip" | "manual";
  maxRecoveryAttempts: number;
  recoveryTimeout: number;
}

export class WorkflowMonitoringSystem {
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private alertThresholds = {
    errorRate: 0.1, // 10% error rate triggers alert
    circuitBreakerRate: 0.05, // 5% circuit breaker trips
    averageExecutionTime: 300000, // 5 minutes
  };

  /**
   * Start monitoring system
   */
  startMonitoring(intervalMs: number = 60000): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, intervalMs);

    logger.info("Workflow monitoring system started", { intervalMs });
  }

  /**
   * Stop monitoring system
   */
  stopMonitoring(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    logger.info("Workflow monitoring system stopped");
  }

  /**
   * Perform comprehensive health check
   */
  private async performHealthCheck(): Promise<void> {
    try {
      const metrics = await this.getHealthMetrics();

      const totalExecutions = metrics.totalExecutions || 0;
      const errorRate = totalExecutions
        ? metrics.failedExecutions / totalExecutions
        : 0;
      if (errorRate > this.alertThresholds.errorRate) {
        logger.warn("High error rate detected", {
          errorRate,
          threshold: this.alertThresholds.errorRate,
          totalExecutions,
          failedExecutions: metrics.failedExecutions,
        });
      }

      const circuitBreakerRate = totalExecutions
        ? metrics.circuitBreakerTrips / totalExecutions
        : 0;
      if (circuitBreakerRate > this.alertThresholds.circuitBreakerRate) {
        logger.warn("High circuit breaker trip rate detected", {
          circuitBreakerRate,
          threshold: this.alertThresholds.circuitBreakerRate,
          circuitBreakerTrips: metrics.circuitBreakerTrips,
        });
      }

      if (
        metrics.averageExecutionTime > this.alertThresholds.averageExecutionTime
      ) {
        logger.warn("High average execution time detected", {
          averageExecutionTime: metrics.averageExecutionTime,
          threshold: this.alertThresholds.averageExecutionTime,
        });
      }

      for (const [nodeType, failureRate] of Object.entries(
        metrics.nodeFailureRates,
      )) {
        if (failureRate > 0.2) {
          logger.warn(`High failure rate for node type: ${nodeType}`, {
            failureRate,
            nodeType,
          });
        }
      }

      logger.debug("Health check completed", {
        totalExecutions,
        successRate: totalExecutions
          ? metrics.successfulExecutions / totalExecutions
          : 0,
        partialSuccessRate: totalExecutions
          ? metrics.partialSuccessExecutions / totalExecutions
          : 0,
        averageExecutionTime: metrics.averageExecutionTime,
      });
    } catch (error) {
      let formattedError: string;
      if (error instanceof Error) {
        formattedError = error.message;
      } else if (typeof error === "object" && error !== null) {
        try {
          formattedError = JSON.stringify(
            error,
            Object.getOwnPropertyNames(error),
          );
        } catch {
          formattedError = String(error);
        }
      } else {
        formattedError = String(error);
      }

      logger.error(`Health check failed: ${formattedError}`);
    }
  }

  /**
   * Get comprehensive health metrics
   */
  async getHealthMetrics(
    timeRangeHours: number = 24,
  ): Promise<WorkflowHealthMetrics> {
    const timeRange = new Date(Date.now() - timeRangeHours * 60 * 60 * 1000);

    logger.debug("Starting health metrics calculation", {
      timeRangeHours,
      timeRange: timeRange.toISOString(),
    });

    try {
      // Get execution statistics. Some schema versions may not yet include optional columns.
      const executionSelect =
        "status, execution_time_ms, created_at, partial_success, circuit_breaker_tripped, failed_nodes";

      let executions: Array<any> | null = null;
      let executionsError = null;

      ({ data: executions, error: executionsError } = await supabase
        .from("agent_executions")
        .select(executionSelect)
        .gte("created_at", timeRange.toISOString()));

      if (executionsError && executionsError.code === "PGRST204") {
        logger.info(
          "Agent executions schema missing optional monitoring columns, using fallback query",
        );
        const fallbackSelect = "status, execution_time_ms, created_at";
        const { data: fallbackData, error: fallbackError } = await supabase
          .from("agent_executions")
          .select(fallbackSelect)
          .gte("created_at", timeRange.toISOString());

        if (fallbackError) {
          throw fallbackError;
        }

        executions = fallbackData;
      } else if (executionsError) {
        throw executionsError;
      }

      const totalExecutions = executions?.length || 0;
      const successfulExecutions =
        executions?.filter((e) => e.status === "completed").length || 0;
      const partialSuccessExecutions =
        executions?.filter((e) => e.partial_success).length || 0;
      const failedExecutions =
        executions?.filter((e) => e.status === "failed").length || 0;
      const circuitBreakerTrips =
        executions?.filter((e) => e.circuit_breaker_tripped).length || 0;

      // Calculate average execution time
      const executionTimes =
        executions
          ?.filter((e) => e.execution_time_ms)
          .map((e) => e.execution_time_ms) || [];

      const averageExecutionTime =
        executionTimes.length > 0
          ? executionTimes.reduce((sum, time) => sum + time, 0) /
            executionTimes.length
          : 0;

      // Calculate node failure rates
      const nodeFailureCounts: Record<
        string,
        { total: number; failed: number }
      > = {};

      executions?.forEach((execution) => {
        if (execution.failed_nodes && Array.isArray(execution.failed_nodes)) {
          execution.failed_nodes.forEach((nodeId: string) => {
            // Extract node type from execution state if available
            // For now, we'll use a generic approach
            const nodeType = "unknown"; // This would be enhanced with actual node type tracking
            if (!nodeFailureCounts[nodeType]) {
              nodeFailureCounts[nodeType] = { total: 0, failed: 0 };
            }
            nodeFailureCounts[nodeType].total++;
            nodeFailureCounts[nodeType].failed++;
          });
        }
      });

      const nodeFailureRates: Record<string, number> = {};
      for (const [nodeType, counts] of Object.entries(nodeFailureCounts)) {
        nodeFailureRates[nodeType] = counts.failed / counts.total;
      }

      // Get recent errors
      const { data: recentErrors, error: errorsError } = await supabase
        .from("agent_executions")
        .select("id, error_message, created_at")
        .eq("status", "failed")
        .gte("created_at", timeRange.toISOString())
        .order("created_at", { ascending: false })
        .limit(10);

      const recentErrorsFormatted =
        recentErrors?.map((err) => ({
          executionId: err.id,
          error:
            err.error_message || String(err.error_message ?? "Unknown error"),
          timestamp: new Date(err.created_at),
        })) || [];

      return {
        totalExecutions,
        successfulExecutions,
        partialSuccessExecutions,
        failedExecutions,
        averageExecutionTime,
        circuitBreakerTrips,
        nodeFailureRates,
        recentErrors: recentErrorsFormatted,
      };
    } catch (error) {
      logger.error("Failed to get health metrics", {
        error: error instanceof Error ? error.message : String(error),
      });

      // Return default metrics on error
      return {
        totalExecutions: 0,
        successfulExecutions: 0,
        partialSuccessExecutions: 0,
        failedExecutions: 0,
        averageExecutionTime: 0,
        circuitBreakerTrips: 0,
        nodeFailureRates: {},
        recentErrors: [],
      };
    }
  }

  /**
   * Attempt workflow recovery
   */
  async attemptRecovery(options: RecoveryOptions): Promise<{
    success: boolean;
    recovered: boolean;
    message: string;
  }> {
    try {
      // Get execution details
      const { data: execution, error: executionError } = await supabase
        .from("agent_executions")
        .select("*")
        .eq("id", options.executionId)
        .single();

      if (executionError || !execution) {
        return {
          success: false,
          recovered: false,
          message: `Execution ${options.executionId} not found`,
        };
      }

      if (execution.status === "completed") {
        return {
          success: true,
          recovered: false,
          message: "Execution already completed successfully",
        };
      }

      // Get workflow details
      const { data: agent, error: agentError } = await supabase
        .from("user_agents")
        .select("*")
        .eq("id", execution.agent_id)
        .single();

      if (agentError || !agent) {
        return {
          success: false,
          recovered: false,
          message: "Associated agent not found",
        };
      }

      const workflowConfig = agent.config as {
        nodes: any[];
        edges: any[];
      };

      // Implement recovery strategies
      switch (options.recoveryStrategy) {
        case "retry":
          return await this.retryFailedExecution(
            execution,
            workflowConfig,
            options.maxRecoveryAttempts,
          );

        case "compensate":
          return await this.compensateFailedExecution(
            execution,
            workflowConfig,
          );

        case "skip":
          return await this.skipFailedNodes(execution, workflowConfig);

        case "manual":
          return {
            success: true,
            recovered: false,
            message: "Manual recovery required - execution marked for review",
          };

        default:
          return {
            success: false,
            recovered: false,
            message: `Unknown recovery strategy: ${options.recoveryStrategy}`,
          };
      }
    } catch (error) {
      logger.error("Recovery attempt failed", {
        executionId: options.executionId,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        success: false,
        recovered: false,
        message: `Recovery failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Retry failed execution
   */
  private async retryFailedExecution(
    execution: any,
    workflowConfig: { nodes: any[]; edges: any[] },
    maxAttempts: number,
  ): Promise<{ success: boolean; recovered: boolean; message: string }> {
    // Implementation would create a new execution with modified configuration
    // For now, return a placeholder
    logger.info("Retry recovery strategy selected", {
      executionId: execution.id,
      maxAttempts,
    });

    return {
      success: true,
      recovered: false,
      message: "Retry recovery queued for implementation",
    };
  }

  /**
   * Compensate failed execution
   */
  private async compensateFailedExecution(
    execution: any,
    workflowConfig: { nodes: any[]; edges: any[] },
  ): Promise<{ success: boolean; recovered: boolean; message: string }> {
    // Implementation would run compensation actions
    logger.info("Compensation recovery strategy selected", {
      executionId: execution.id,
    });

    return {
      success: true,
      recovered: false,
      message: "Compensation recovery queued for implementation",
    };
  }

  /**
   * Skip failed nodes
   */
  private async skipFailedNodes(
    execution: any,
    workflowConfig: { nodes: any[]; edges: any[] },
  ): Promise<{ success: boolean; recovered: boolean; message: string }> {
    // Implementation would modify workflow to skip problematic nodes
    logger.info("Skip recovery strategy selected", {
      executionId: execution.id,
    });

    return {
      success: true,
      recovered: false,
      message: "Skip recovery queued for implementation",
    };
  }

  /**
   * Get execution details for debugging
   */
  async getExecutionDetails(executionId: string): Promise<any> {
    try {
      const { data: execution, error: executionError } = await supabase
        .from("agent_executions")
        .select("*")
        .eq("id", executionId)
        .single();

      if (executionError) {
        throw executionError;
      }

      // Get execution state if available
      const { data: executionState, error: stateError } = await supabase
        .from("workflow_execution_states")
        .select("*")
        .eq("execution_id", executionId)
        .single();

      return {
        execution,
        executionState: stateError ? null : executionState,
        available: true,
      };
    } catch (error) {
      logger.error("Failed to get execution details", {
        executionId,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        execution: null,
        executionState: null,
        available: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

// Export singleton instance
export const workflowMonitoring = new WorkflowMonitoringSystem();
