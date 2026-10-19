/**
 * Meta Messenger Platform 24-Hour Policy & Messaging Window Validation Helper.
 * Strictly adheres to official Meta Graph API v21.0 messaging rules:
 * - Standard messages (RESPONSE) are permitted strictly within 24 hours of the user's last incoming message.
 * - Outgoing messages DO NOT extend or refresh the 24-hour window.
 * - Timestamps must be valid UTC timestamps within the preceding 24 hours.
 * - Future timestamps (allowing a max 60s clock skew) are strictly rejected.
 * - Recipients without valid PSIDs or with opted-out consent status are strictly ineligible.
 * - Recipients belonging to a different Facebook Page ID must never be mixed.
 */

export const META_24_HOUR_WINDOW_MS = 24 * 60 * 60 * 1000;
export const MAX_CLOCK_DRIFT_TOLERANCE_MS = 60 * 1000; // 60s tolerance for network/clock drift

export interface IncomingMessage24hCheck {
  isWithin24Hours: boolean;
  reason: string;
  diffMs?: number;
  diffHours?: number;
}

export interface Recipient24hEligibilityCheck {
  eligible: boolean;
  reason: string;
  isWithin24Hours: boolean;
}

/**
 * Validates whether an incoming message timestamp falls within Meta's 24-hour messaging window.
 * Internal comparisons use UTC milliseconds.
 */
export function validateIncomingMessage24HourWindow(
  lastIncomingMessageAt?: string | null,
  nowMs: number = Date.now()
): IncomingMessage24hCheck {
  if (!lastIncomingMessageAt || typeof lastIncomingMessageAt !== 'string' || !lastIncomingMessageAt.trim()) {
    return {
      isWithin24Hours: false,
      reason: 'Missing incoming message timestamp',
    };
  }

  const incomingTime = new Date(lastIncomingMessageAt.trim()).getTime();
  if (isNaN(incomingTime) || incomingTime <= 0) {
    return {
      isWithin24Hours: false,
      reason: 'Invalid incoming message timestamp',
    };
  }

  // Reject future timestamps beyond permissible clock drift
  if (incomingTime > nowMs + MAX_CLOCK_DRIFT_TOLERANCE_MS) {
    return {
      isWithin24Hours: false,
      reason: 'Future incoming message timestamp rejected',
      diffMs: nowMs - incomingTime,
    };
  }

  const diffMs = nowMs - incomingTime;

  // Exact 24-hour boundary is inclusive (diffMs <= 24 * 60 * 60 * 1000)
  if (diffMs < -MAX_CLOCK_DRIFT_TOLERANCE_MS) {
    return {
      isWithin24Hours: false,
      reason: 'Future incoming message timestamp',
      diffMs,
    };
  }

  if (diffMs > META_24_HOUR_WINDOW_MS) {
    const hours = (diffMs / (60 * 60 * 1000)).toFixed(1);
    return {
      isWithin24Hours: false,
      reason: `Incoming message was received ${hours}h ago (exceeds 24-hour window)`,
      diffMs,
      diffHours: Number(hours),
    };
  }

  // Active within 24h window
  const safeDiffMs = Math.max(0, diffMs);
  const hours = (safeDiffMs / (60 * 60 * 1000)).toFixed(1);
  return {
    isWithin24Hours: true,
    reason: `Incoming message received ${hours}h ago (within 24-hour window)`,
    diffMs: safeDiffMs,
    diffHours: Number(hours),
  };
}

/**
 * Validates complete recipient eligibility for the "Last 24 Hours" Broadcaster filter.
 * Verifies:
 * 1. Valid PSID is present.
 * 2. Recipient belongs to the active Page (if pageId provided, cannot belong to a different Page).
 * 3. Consent is not opted-out.
 * 4. Genuine incoming message timestamp is strictly within the previous 24 hours.
 */
export function isRecipientEligibleFor24HourFilter(
  recipient: {
    psid?: string | null;
    lastIncomingMessageAt?: string | null;
    pageId?: string | null;
    consentStatus?: string | null;
  },
  activePageId?: string | null,
  nowMs: number = Date.now()
): Recipient24hEligibilityCheck {
  const psid = (recipient.psid || '').trim();
  if (!psid) {
    return {
      eligible: false,
      isWithin24Hours: false,
      reason: 'Missing Facebook PSID (Page-Scoped ID)',
    };
  }

  // Page isolation guard: ensure recipient does not belong to a different Facebook Page
  if (activePageId && recipient.pageId && recipient.pageId.trim() !== activePageId.trim()) {
    return {
      eligible: false,
      isWithin24Hours: false,
      reason: `Recipient belongs to a different Facebook Page (${recipient.pageId})`,
    };
  }

  if (recipient.consentStatus === 'opted_out') {
    return {
      eligible: false,
      isWithin24Hours: false,
      reason: 'Recipient has opted out or unsubscribed from messaging',
    };
  }

  const windowCheck = validateIncomingMessage24HourWindow(recipient.lastIncomingMessageAt, nowMs);
  if (!windowCheck.isWithin24Hours) {
    return {
      eligible: false,
      isWithin24Hours: false,
      reason: windowCheck.reason,
    };
  }

  return {
    eligible: true,
    isWithin24Hours: true,
    reason: windowCheck.reason,
  };
}
