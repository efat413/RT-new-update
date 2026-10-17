/**
 * Facebook Broadcaster Concurrent Queue Worker
 * Demonstrates and enforces concurrent race protection across parallel workers.
 * Incorporates server-side delay jitter and checkpoint awareness.
 */

import { D1Database } from './types';
import {
  dispatchSingleRecipient,
  DispatchItemResult,
  RecipientInput,
  TelemetryEvent,
} from './broadcasterService';
import {
  parseMessageTemplates,
  renderMessageForRecipient,
  validateDelayConfig,
  calculateRandomDelayMs,
} from './broadcasterSecurity';
import { getBroadcasterCampaignJob } from './db';

export interface ConcurrentWorkerConfig {
  workerCount: number;
  minDelaySec?: number;
  maxDelaySec?: number;
  batchSize?: number;
  batchPauseSec?: number;
  rateLimitDelayMs?: number;
  timeoutMs?: number;
  metaApiEndpoint?: string;
  customFetch?: typeof fetch;
}

export interface WorkerExecutionTrace {
  workerId: number;
  psid: string;
  action: 'RESERVATION_ATTEMPT' | 'RESERVATION_WON' | 'RESERVATION_LOST_SUPPRESSED' | 'DISPATCH_COMPLETED';
  timestamp: string;
  detail?: string;
}

export interface ConcurrentDispatchResult {
  totalProcessed: number;
  deliveredCount: number;
  ambiguousCount: number;
  failedCount: number;
  skippedRaceCount: number;
  traces: WorkerExecutionTrace[];
  results: DispatchItemResult[];
  telemetryLogs: TelemetryEvent[];
}

/**
 * Runs parallel queue workers against a list of recipients.
 * Concurrency is actively stressed to demonstrate that simultaneous workers
 * competing for the exact same recipient PSID cannot cause double sends.
 * Also enforces configured server delays so workers cannot bypass rate controls.
 */
export async function runConcurrentBroadcasterQueue(
  db: D1Database,
  params: {
    pageId: string;
    campaignId: string;
    messageText: string;
    recipients: RecipientInput[];
    pageAccessToken?: string;
    config?: Partial<ConcurrentWorkerConfig>;
  }
): Promise<ConcurrentDispatchResult> {
  const { pageId, campaignId, messageText, pageAccessToken } = params;
  const workerCount = Math.max(1, params.config?.workerCount || 3);
  const timeoutMs = params.config?.timeoutMs ?? 7000;
  const customFetch = params.config?.customFetch;
  const metaApiEndpoint = params.config?.metaApiEndpoint;

  const templates = parseMessageTemplates(messageText);

  // Validate delay parameters
  const delayCheck = validateDelayConfig(
    params.config?.minDelaySec ?? 0,
    params.config?.maxDelaySec ?? 0
  );

  const queue = [...params.recipients];
  let processedIndex = 0;
  const traces: WorkerExecutionTrace[] = [];
  const results: DispatchItemResult[] = [];
  const telemetryLogs: TelemetryEvent[] = [];

  let deliveredCount = 0;
  let ambiguousCount = 0;
  let failedCount = 0;
  let skippedRaceCount = 0;

  // Worker task runner
  async function workerLoop(workerId: number) {
    while (queue.length > 0) {
      // Check pause / stop status
      const checkJob = await getBroadcasterCampaignJob(db, campaignId);
      if (checkJob?.status === 'PAUSED' || checkJob?.status === 'STOPPED') {
        break;
      }

      // Check if concurrent batch limit has been reached
      if (params.config?.batchSize && deliveredCount >= params.config.batchSize) {
        break;
      }

      const recipient = queue.shift();
      if (!recipient) break;

      const currentIndex = processedIndex++;

      traces.push({
        workerId,
        psid: recipient.psid,
        action: 'RESERVATION_ATTEMPT',
        timestamp: new Date().toISOString(),
        detail: `Worker ${workerId} attempting atomic reservation for PSID ${recipient.psid}`,
      });

      // Render message template variation with safe {name} substitution
      const rendered = renderMessageForRecipient({
        templates,
        recipientIndex: currentIndex,
        recipientPsid: recipient.psid,
        recipientName: recipient.name,
      });

      const itemRes = await dispatchSingleRecipient(db, {
        pageId,
        recipientPsid: recipient.psid,
        campaignId,
        messageText: rendered.text,
        pageAccessToken,
        metaApiEndpoint,
        timeoutMs,
        customFetch,
      });

      if (itemRes.status === 'SKIPPED') {
        skippedRaceCount++;
        traces.push({
          workerId,
          psid: recipient.psid,
          action: 'RESERVATION_LOST_SUPPRESSED',
          timestamp: new Date().toISOString(),
          detail: `Worker ${workerId} lost atomic race or hit historical record. Duplicate dispatch suppressed.`,
        });
      } else {
        if (itemRes.status === 'DELIVERED') deliveredCount++;
        else if (itemRes.status === 'AMBIGUOUS') ambiguousCount++;
        else if (itemRes.status === 'FAILED') failedCount++;

        traces.push({
          workerId,
          psid: recipient.psid,
          action: 'DISPATCH_COMPLETED',
          timestamp: new Date().toISOString(),
          detail: `Worker ${workerId} completed with status ${itemRes.status}`,
        });
      }

      results.push(itemRes);
      telemetryLogs.push(itemRes.telemetryEvent);

      // Enforce server-side delay per worker
      if (delayCheck.valid && delayCheck.max > 0) {
        const delayMs = calculateRandomDelayMs(delayCheck.min, delayCheck.max);
        await new Promise((r) => setTimeout(r, delayMs));
      } else if (params.config?.rateLimitDelayMs) {
        await new Promise((r) => setTimeout(r, params.config!.rateLimitDelayMs));
      }
    }
  }

  // Spawn parallel worker pool
  const workerPromises = Array.from({ length: workerCount }, (_, idx) => workerLoop(idx + 1));
  await Promise.all(workerPromises);

  return {
    totalProcessed: results.length,
    deliveredCount,
    ambiguousCount,
    failedCount,
    skippedRaceCount,
    traces,
    results,
    telemetryLogs,
  };
}
