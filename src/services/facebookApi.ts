import { getAuthToken } from './authApi';
import { FacebookConfigStatus } from '../server/facebookMessenger';

export async function fetchFacebookStatus(): Promise<{ success: boolean; status?: FacebookConfigStatus; error?: string }> {
  try {
    const token = getAuthToken();
    const res = await fetch('/api/admin/facebook/status', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      credentials: 'include',
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.success) {
      return { success: true, status: data.status };
    }
    return { success: false, error: data.error || `HTTP ${res.status}` };
  } catch (err: any) {
    return { success: false, error: err.message || 'Network error fetching Meta status.' };
  }
}

export async function testFacebookConnection(): Promise<{
  success: boolean;
  status: number;
  pageId?: string;
  pageName?: string;
  category?: string;
  error?: string;
  errorCategory?: string;
  errorCode?: number;
  errorSubcode?: number;
  errorType?: string;
  mismatch?: boolean;
  diagnostics?: {
    category: string;
    code?: number;
    subcode?: number;
    type?: string;
    fbtraceId?: string;
  };
}> {
  try {
    const token = getAuthToken();
    const res = await fetch('/api/admin/facebook/test-connection', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      credentials: 'include',
    });
    const data = await res.json().catch(() => ({}));
    return data;
  } catch (err: any) {
    return { success: false, status: 502, error: err.message || 'Connection test failed.' };
  }
}

export async function sendFacebookMessage(payload: {
  recipientPsid: string;
  text: string;
  tag?: string;
  isWithin24Hours?: boolean;
  recipientName?: string;
  orderNumber?: string;
}): Promise<{
  success: boolean;
  status: number;
  messageId?: string;
  recipientId?: string;
  error?: string;
  policyBlocked?: boolean;
  notConfigured?: boolean;
}> {
  try {
    const token = getAuthToken();
    const res = await fetch('/api/admin/facebook/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
      credentials: 'include',
    });
    const data = await res.json().catch(() => ({}));
    return data;
  } catch (err: any) {
    return { success: false, status: 502, error: err.message || 'Network error during dispatch.' };
  }
}

export async function createFacebookCampaign(payload: {
  name: string;
  audienceType: string;
  tag: string;
  messageTemplate: string;
  minDelay?: number;
  maxDelay?: number;
  recipients: Array<{
    id: string;
    name: string;
    psid?: string;
    phone?: string;
    isWithin24Hours?: boolean;
    hasMarketingConsent?: boolean;
    orderNumber?: string;
    personalizedText?: string;
  }>;
}): Promise<{ success: boolean; campaign?: any; queuedCount?: number; error?: string }> {
  try {
    const token = getAuthToken();
    const res = await fetch('/api/admin/facebook/campaigns', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
      credentials: 'include',
    });
    const data = await res.json().catch(() => ({}));
    return data;
  } catch (err: any) {
    return { success: false, error: err.message || 'Network error creating campaign.' };
  }
}

export async function fetchFacebookCampaigns(): Promise<{ success: boolean; campaigns?: any[]; error?: string }> {
  try {
    const token = getAuthToken();
    const res = await fetch('/api/admin/facebook/campaigns', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      credentials: 'include',
    });
    const data = await res.json().catch(() => ({}));
    return data;
  } catch (err: any) {
    return { success: false, error: err.message || 'Network error fetching campaigns.' };
  }
}

export async function fetchFacebookCampaignDetails(
  campaignId: string
): Promise<{ success: boolean; campaign?: any; queue?: any[]; error?: string }> {
  try {
    const token = getAuthToken();
    const res = await fetch(`/api/admin/facebook/campaigns/${encodeURIComponent(campaignId)}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      credentials: 'include',
    });
    const data = await res.json().catch(() => ({}));
    return data;
  } catch (err: any) {
    return { success: false, error: err.message || 'Network error fetching campaign details.' };
  }
}

export async function pauseFacebookCampaign(
  campaignId: string
): Promise<{ success: boolean; status?: string; error?: string }> {
  try {
    const token = getAuthToken();
    const res = await fetch(`/api/admin/facebook/campaigns/${encodeURIComponent(campaignId)}/pause`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      credentials: 'include',
    });
    const data = await res.json().catch(() => ({}));
    return data;
  } catch (err: any) {
    return { success: false, error: err.message || 'Network error pausing campaign.' };
  }
}

export async function resumeFacebookCampaign(
  campaignId: string
): Promise<{ success: boolean; status?: string; error?: string }> {
  try {
    const token = getAuthToken();
    const res = await fetch(`/api/admin/facebook/campaigns/${encodeURIComponent(campaignId)}/resume`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      credentials: 'include',
    });
    const data = await res.json().catch(() => ({}));
    return data;
  } catch (err: any) {
    return { success: false, error: err.message || 'Network error resuming campaign.' };
  }
}

export async function cancelFacebookCampaign(
  campaignId: string
): Promise<{ success: boolean; status?: string; error?: string }> {
  try {
    const token = getAuthToken();
    const res = await fetch(`/api/admin/facebook/campaigns/${encodeURIComponent(campaignId)}/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      credentials: 'include',
    });
    const data = await res.json().catch(() => ({}));
    return data;
  } catch (err: any) {
    return { success: false, error: err.message || 'Network error cancelling campaign.' };
  }
}

export async function updateFacebookCampaignDelays(
  campaignId: string,
  minDelay: number,
  maxDelay: number
): Promise<{ success: boolean; minDelay?: number; maxDelay?: number; error?: string }> {
  try {
    const token = getAuthToken();
    const res = await fetch(`/api/admin/facebook/campaigns/${encodeURIComponent(campaignId)}/delays`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ minDelay, maxDelay }),
      credentials: 'include',
    });
    const data = await res.json().catch(() => ({}));
    return data;
  } catch (err: any) {
    return { success: false, error: err.message || 'Network error updating delays.' };
  }
}

export async function processFacebookCampaignNext(
  campaignId: string
): Promise<{
  success: boolean;
  item?: any;
  delayUsedSeconds?: number;
  completed?: boolean;
  campaignStatus?: string;
  remainingCount?: number;
  error?: string;
}> {
  try {
    const token = getAuthToken();
    const res = await fetch(`/api/admin/facebook/campaigns/${encodeURIComponent(campaignId)}/process-next`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      credentials: 'include',
    });
    const data = await res.json().catch(() => ({}));
    return data;
  } catch (err: any) {
    return { success: false, error: err.message || 'Network error processing queue item.' };
  }
}

export async function fetchFacebookRecipients(
  audienceType?: string,
  options?: {
    pageId?: string;
    filter?: string;
  }
): Promise<{ success: boolean; recipients?: any[]; error?: string }> {
  try {
    const token = getAuthToken();
    const params = new URLSearchParams();
    if (audienceType) params.set('audienceType', audienceType);
    if (options?.pageId) params.set('pageId', options.pageId);
    if (options?.filter) params.set('filter', options.filter);
    const queryString = params.toString() ? `?${params.toString()}` : '';
    const res = await fetch(`/api/admin/facebook/recipients${queryString}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      credentials: 'include',
    });
    const data = await res.json().catch(() => ({}));
    return data;
  } catch (err: any) {
    return { success: false, error: err.message || 'Network error fetching recipients.' };
  }
}

export async function subscribeFacebookPage(): Promise<{
  success: boolean;
  status: number;
  message?: string;
  error?: string;
}> {
  try {
    const token = getAuthToken();
    const res = await fetch('/api/admin/facebook/subscribe-page', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      credentials: 'include',
    });
    const data = await res.json().catch(() => ({}));
    return data;
  } catch (err: any) {
    return { success: false, status: 502, error: err.message || 'Network error subscribing page.' };
  }
}


