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
