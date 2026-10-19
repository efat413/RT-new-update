import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleApiRequest } from '../src/server/router';
import {
  saveFacebookMessageTemplateInD1,
  getFacebookMessageTemplatesFromD1,
  getFacebookMessageTemplateByIdFromD1,
  deleteFacebookMessageTemplateFromD1,
  createFacebookCampaignInD1,
  processNextCampaignQueueItemInD1,
} from '../src/server/db';
import { createAuthToken, getAuthSecret } from '../src/server/auth';
import { Env, UserRow } from '../src/server/types';

class MockD1WithTemplates {
  public tables = {
    fb_message_templates: new Map<string, any>(),
    fb_campaigns: new Map<string, any>(),
    fb_campaign_queue: new Map<string, any>(),
    fb_recipients: new Map<string, any>(),
    users: new Map<string, any>(),
    audit_logs: [] as any[],
  };

  constructor() {
    this.tables.users.set('admin-1', {
      id: 'admin-1',
      email: 'admin@rongdhonutrade.com',
      role: 'admin',
      password_hash: 'pbkdf2:600000:mockSalt:mockHash',
      full_name: 'Admin User',
      created_at: new Date().toISOString(),
    });
    this.tables.users.set('customer-1', {
      id: 'customer-1',
      email: 'customer@gmail.com',
      role: 'customer',
      password_hash: 'pbkdf2:600000:mockSalt:mockHash',
      full_name: 'Customer User',
      created_at: new Date().toISOString(),
    });
  }

  prepare(query: string) {
    const db = this;
    const clean = query.trim().replace(/\s+/g, ' ');

    const stmt = (args: any[] = []) => ({
      bind(...newArgs: any[]) {
        return stmt(newArgs);
      },

      async run() {
        if (clean.startsWith('CREATE TABLE') || clean.startsWith('CREATE INDEX') || clean.startsWith('CREATE UNIQUE INDEX')) {
          return { success: true, meta: { changes: 0 } };
        }

        // INSERT INTO fb_message_templates
        if (clean.includes('INSERT INTO fb_message_templates')) {
          const [id, template_name, message_content, tag, created_by] = args;
          db.tables.fb_message_templates.set(id, {
            id,
            template_name,
            message_content,
            tag: tag || 'NONE',
            created_by: created_by || null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
          return { success: true, meta: { changes: 1 } };
        }

        // UPDATE fb_message_templates
        if (clean.includes('UPDATE fb_message_templates SET')) {
          const [template_name, message_content, tag, id] = args;
          const existing = db.tables.fb_message_templates.get(id);
          if (existing) {
            db.tables.fb_message_templates.set(id, {
              ...existing,
              template_name,
              message_content,
              tag: tag || 'NONE',
              updated_at: new Date().toISOString(),
            });
            return { success: true, meta: { changes: 1 } };
          }
          return { success: true, meta: { changes: 0 } };
        }

        // DELETE FROM fb_message_templates
        if (clean.includes('DELETE FROM fb_message_templates WHERE id = ?')) {
          const [id] = args;
          const existed = db.tables.fb_message_templates.delete(id);
          return { success: true, meta: { changes: existed ? 1 : 0 } };
        }

        // Audit log insert
        if (clean.includes('INSERT INTO audit_logs')) {
          db.tables.audit_logs.push(args);
          return { success: true, meta: { changes: 1 } };
        }

        // Campaign inserts
        if (clean.includes('INSERT INTO fb_campaigns')) {
          const [id, name, audience_type, tag, message_template, min_delay, max_delay, total_queued, remaining_count, created_by] = args;
          db.tables.fb_campaigns.set(id, {
            id,
            name,
            audience_type,
            tag,
            message_template,
            status: 'draft',
            min_delay,
            max_delay,
            total_queued,
            accepted_count: 0,
            delivered_count: 0,
            skipped_count: 0,
            failed_count: 0,
            remaining_count,
            created_by,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
          return { success: true, meta: { changes: 1 } };
        }

        if (clean.includes('INSERT OR IGNORE INTO fb_campaign_queue')) {
          const [id, campaign_id, recipient_id, recipient_name, psid, phone, is_within_24h, has_consent, message_text] = args;
          db.tables.fb_campaign_queue.set(id, {
            id,
            campaign_id,
            recipient_id,
            recipient_name,
            psid,
            phone,
            is_within_24h,
            has_consent,
            message_text,
            status: 'pending',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
          return { success: true, meta: { changes: 1 } };
        }

        return { success: true, meta: { changes: 0 } };
      },

      async first<T = any>(): Promise<T | null> {
        if (clean.includes('FROM users')) {
          const arg0 = args[0] ? String(args[0]).toLowerCase() : '';
          const arg1 = args[1] ? String(args[1]) : '';
          for (const user of db.tables.users.values()) {
            if (
              user.id === arg0 ||
              user.id === arg1 ||
              user.email.toLowerCase() === arg0 ||
              user.email.toLowerCase() === arg1
            ) {
              return user as T;
            }
          }
          return null;
        }
        if (clean.includes('FROM fb_message_templates WHERE id = ?')) {
          return (db.tables.fb_message_templates.get(args[0]) as T) || null;
        }
        if (clean.includes('FROM fb_campaigns WHERE id = ?')) {
          return (db.tables.fb_campaigns.get(args[0]) as T) || null;
        }
        return null;
      },

      async all<T = any>(): Promise<{ results: T[] }> {
        if (clean.includes('FROM fb_message_templates')) {
          const list = Array.from(db.tables.fb_message_templates.values());
          return { results: list as T[] };
        }
        return { results: [] };
      },
    });

    return stmt();
  }
}

describe('PART 2: Custom Saved Message Templates Suite', () => {
  let mockDb: MockD1WithTemplates;
  let env: Env;
  let adminToken: string;
  let customerToken: string;

  beforeEach(async () => {
    mockDb = new MockD1WithTemplates();
    env = {
      DB: mockDb as any,
      ADMIN_SECRET: 'test-admin-secret-broadcaster-123',
      FB_PAGE_ACCESS_TOKEN: 'EAABmock_token_123',
      FB_PAGE_ID: '10987654321',
      FB_APP_SECRET: 'mock_app_secret_123',
      FB_WEBHOOK_VERIFY_TOKEN: 'mock_webhook_token',
      PRODUCTION_ORIGIN: 'https://rongdhonutrade.com',
      DEV_ADMIN_PASSWORD: 'DevPassword123!',
    };

    adminToken = await createAuthToken(
      {
        userId: 'admin-1',
        email: 'admin@rongdhonutrade.com',
        role: 'admin',
      },
      getAuthSecret(env)
    );

    customerToken = await createAuthToken(
      {
        userId: 'customer-1',
        email: 'customer@gmail.com',
        role: 'customer',
      },
      getAuthSecret(env)
    );
  });

  // 1. Direct D1 Database Operations
  describe('1. Direct D1 Template CRUD Functions', () => {
    it('creates and saves a message template to D1', async () => {
      const template = await saveFacebookMessageTemplateInD1(mockDb as any, {
        templateName: 'Customer Follow-up',
        messageContent: 'আসসালামু আলাইকুম {name}, RONGDHONU TRADE-এ যোগাযোগ করার জন্য ধন্যবাদ।',
        tag: 'NONE',
        createdBy: 'admin@rongdhonutrade.com',
      });

      expect(template.id).toBeDefined();
      expect(template.templateName).toBe('Customer Follow-up');
      expect(template.messageContent).toContain('আসসালামু আলাইকুম');
      expect(template.tag).toBe('NONE');
      expect(mockDb.tables.fb_message_templates.has(template.id)).toBe(true);
    });

    it('retrieves saved templates from D1', async () => {
      await saveFacebookMessageTemplateInD1(mockDb as any, {
        templateName: 'Order Notification',
        messageContent: 'প্রিয় {name}, আপনার অর্ডার #{order_number} বুক করা হয়েছে।',
        tag: 'POST_PURCHASE_UPDATE',
        createdBy: 'admin@rongdhonutrade.com',
      });

      const list = await getFacebookMessageTemplatesFromD1(mockDb as any);
      expect(list.length).toBe(1);
      expect(list[0].templateName).toBe('Order Notification');
      expect(list[0].tag).toBe('POST_PURCHASE_UPDATE');
    });

    it('updates an existing template in D1 without creating duplicate', async () => {
      const created = await saveFacebookMessageTemplateInD1(mockDb as any, {
        templateName: 'VIP Discount Notice',
        messageContent: 'হ্যালো {name}, আপনার জন্য ১০% ছাড় কোড: {discount_code}।',
        tag: 'NONE',
        createdBy: 'admin@rongdhonutrade.com',
      });

      const updated = await saveFacebookMessageTemplateInD1(mockDb as any, {
        id: created.id,
        templateName: 'VIP Discount Notice - Updated',
        messageContent: 'হ্যালো {name}, আপনার জন্য ২০% বিশেষ ছাড়!',
        tag: 'ACCOUNT_UPDATE',
      });

      expect(updated.id).toBe(created.id);
      expect(updated.templateName).toBe('VIP Discount Notice - Updated');
      expect(updated.tag).toBe('ACCOUNT_UPDATE');

      const all = await getFacebookMessageTemplatesFromD1(mockDb as any);
      expect(all.length).toBe(1);
    });

    it('deletes an existing template from D1', async () => {
      const created = await saveFacebookMessageTemplateInD1(mockDb as any, {
        templateName: 'Temporary Notice',
        messageContent: 'Notice content',
        tag: 'NONE',
      });

      expect(mockDb.tables.fb_message_templates.has(created.id)).toBe(true);

      const deleted = await deleteFacebookMessageTemplateFromD1(mockDb as any, created.id);
      expect(deleted).toBe(true);
      expect(mockDb.tables.fb_message_templates.has(created.id)).toBe(false);
    });
  });

  // 2. HTTP API Endpoints & RBAC Security
  describe('2. HTTP API Endpoints & Authorization Boundary', () => {
    it('blocks unauthenticated access with 401', async () => {
      const req = new Request('https://rongdhonutrade.com/api/admin/facebook/templates', {
        method: 'GET',
      });
      const res = await handleApiRequest(req, env);
      expect(res.status).toBe(401);
    });

    it('blocks non-admin users (e.g. regular customers) with 403', async () => {
      const req = new Request('https://rongdhonutrade.com/api/admin/facebook/templates', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${customerToken}`,
        },
      });
      const res = await handleApiRequest(req, env);
      expect(res.status).toBe(403);
    });

    it('allows authenticated admin to list templates (GET)', async () => {
      await saveFacebookMessageTemplateInD1(mockDb as any, {
        templateName: 'Admin Template 1',
        messageContent: 'Test content 1',
        tag: 'NONE',
      });

      const req = new Request('https://rongdhonutrade.com/api/admin/facebook/templates', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });
      const res = await handleApiRequest(req, env);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.templates)).toBe(true);
      expect(data.templates.length).toBe(1);
    });

    it('validates template creation payload: rejects missing templateName with 400', async () => {
      const req = new Request('https://rongdhonutrade.com/api/admin/facebook/templates', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          templateName: '',
          messageContent: 'Valid message content',
        }),
      });
      const res = await handleApiRequest(req, env);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/template name is required/i);
    });

    it('validates template creation payload: rejects missing messageContent with 400', async () => {
      const req = new Request('https://rongdhonutrade.com/api/admin/facebook/templates', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          templateName: 'Valid Name',
          messageContent: '   ',
        }),
      });
      const res = await handleApiRequest(req, env);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/message content is required/i);
    });

    it('creates a new template via POST and records audit log', async () => {
      const req = new Request('https://rongdhonutrade.com/api/admin/facebook/templates', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          templateName: 'Customer Inbound Reply',
          messageContent: 'সালাম {name}, রঙধনু ট্রেড এ আপনাকে স্বাগতম!',
          tag: 'NONE',
        }),
      });
      const res = await handleApiRequest(req, env);
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.template.templateName).toBe('Customer Inbound Reply');

      expect(mockDb.tables.audit_logs.length).toBeGreaterThan(0);
    });

    it('updates an existing template via PUT /api/admin/facebook/templates/:id', async () => {
      const created = await saveFacebookMessageTemplateInD1(mockDb as any, {
        templateName: 'Draft Template',
        messageContent: 'Initial draft',
        tag: 'NONE',
      });

      const req = new Request(`https://rongdhonutrade.com/api/admin/facebook/templates/${created.id}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          templateName: 'Finalized Template',
          messageContent: 'Updated message variation {name}',
          tag: 'POST_PURCHASE_UPDATE',
        }),
      });
      const res = await handleApiRequest(req, env);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.template.templateName).toBe('Finalized Template');
      expect(data.template.tag).toBe('POST_PURCHASE_UPDATE');
    });

    it('deletes a template via DELETE /api/admin/facebook/templates/:id', async () => {
      const created = await saveFacebookMessageTemplateInD1(mockDb as any, {
        templateName: 'To Be Deleted',
        messageContent: 'Delete me',
      });

      const req = new Request(`https://rongdhonutrade.com/api/admin/facebook/templates/${created.id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });
      const res = await handleApiRequest(req, env);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(mockDb.tables.fb_message_templates.has(created.id)).toBe(false);
    });
  });

  // 3. Dynamic Variables & Variation Compatibility
  describe('3. Dynamic Variable Substitution & Variation Delimiters', () => {
    const substituteVariables = (text: string, recipient: any, settings: any) => {
      return text
        .replace(/{name}/g, recipient.name || 'সম্মানিত ক্রেতা')
        .replace(/{order_number}/g, recipient.orderNumber || 'N/A')
        .replace(/{phone}/g, settings?.phone || '01518739561')
        .replace(/{discount_code}/g, 'RONGDHONU10')
        .replace(/{shop_name}/g, settings?.siteName || 'Rongdhonu Trade');
    };

    it('replaces all legitimate dynamic variables safely without code execution', () => {
      const raw = 'আসসালামু আলাইকুম {name}! আপনার অর্ডার #{order_number} কনফার্ম হয়েছে। যোগাযোগ: {phone}, কুপন: {discount_code}, শপ: {shop_name}।';
      const recipient = { name: 'রহিম খান', orderNumber: 'RT-12345' };
      const settings = { phone: '01518739561', siteName: 'রঙধনু ট্রেড' };

      const result = substituteVariables(raw, recipient, settings);
      expect(result).toContain('রহিম খান');
      expect(result).toContain('RT-12345');
      expect(result).toContain('01518739561');
      expect(result).toContain('RONGDHONU10');
      expect(result).toContain('রঙধনু ট্রেড');
    });

    it('handles missing recipient variables gracefully with fallbacks rather than undefined or broken tokens', () => {
      const raw = 'হ্যালো {name}, আপনার অর্ডার #{order_number} প্রস্তুত।';
      const emptyRecipient = { name: '', orderNumber: '' };
      const result = substituteVariables(raw, emptyRecipient, {});
      expect(result).toContain('সম্মানিত ক্রেতা');
      expect(result).toContain('N/A');
      expect(result).not.toContain('{name}');
      expect(result).not.toContain('{order_number}');
      expect(result).not.toContain('undefined');
    });

    it('parses message variations using both "---" and "|" delimiters cleanly', () => {
      const splitVariations = (raw: string) => {
        if (!raw.trim()) return [];
        if (raw.includes('---')) {
          return raw.split('---').map((v) => v.trim()).filter(Boolean);
        }
        return raw.split('|').map((v) => v.trim()).filter(Boolean);
      };

      const pipeDelimited = 'Hello {name} | Hey {name}! Thanks for contacting us | আসসালামু আলাইকুম {name}';
      const pipeVars = splitVariations(pipeDelimited);
      expect(pipeVars.length).toBe(3);
      expect(pipeVars[0]).toBe('Hello {name}');
      expect(pipeVars[1]).toBe('Hey {name}! Thanks for contacting us');
      expect(pipeVars[2]).toBe('আসসালামু আলাইকুম {name}');

      const dashDelimited = 'Variation A\n---\nVariation B\n---\nVariation C';
      const dashVars = splitVariations(dashDelimited);
      expect(dashVars.length).toBe(3);
      expect(dashVars[0]).toBe('Variation A');
      expect(dashVars[1]).toBe('Variation B');
      expect(dashVars[2]).toBe('Variation C');
    });
  });

  // 4. Built-in Preset Compatibility & Campaign Dispatch Integration
  describe('4. Built-in Preset Compatibility & Dispatch Engine Integration', () => {
    it('creates a custom template copy from a built-in preset without modifying the preset', async () => {
      const builtInPreset = {
        id: 'post_purchase_update',
        name: 'Post-Purchase Order Confirmation',
        variations: ['প্রিয় {name}, আপনার অর্ডার #{order_number} প্রস্তুত!'],
      };

      // Admin loads preset and saves customized copy
      const customTemplate = await saveFacebookMessageTemplateInD1(mockDb as any, {
        templateName: 'Customized Copy of Post-Purchase',
        messageContent: builtInPreset.variations[0] + ' বিশেষ অফার পেতে সাথে থাকুন।',
        tag: 'POST_PURCHASE_UPDATE',
      });

      expect(customTemplate.id).not.toBe(builtInPreset.id);
      expect(customTemplate.templateName).toBe('Customized Copy of Post-Purchase');
      expect(builtInPreset.variations[0]).toBe('প্রিয় {name}, আপনার অর্ডার #{order_number} প্রস্তুত!');
    });

    it('dispatches a persistent campaign in D1 using a saved template and Last 24 Hours recipient filter', async () => {
      // 1. Create a saved template
      const savedTmpl = await saveFacebookMessageTemplateInD1(mockDb as any, {
        templateName: '24h Flash Follow-up',
        messageContent: 'হ্যালো {name}, আপনার পছন্দের আইটেমটি এখনো স্টকে আছে!',
        tag: 'NONE',
      });

      // 2. Queue recipients (including Last 24 Hours sender)
      const campaignRes = await createFacebookCampaignInD1(
        mockDb as any,
        {
          name: 'Flash Sale Broadcast',
          audienceType: 'page_contacts',
          tag: 'NONE',
          messageTemplate: savedTmpl.messageContent,
        },
        [
          {
            id: 'recip-24h-1',
            name: 'Recent Sender',
            psid: 'PSID_24H_VALID',
            isWithin24Hours: true,
            hasMarketingConsent: true,
            personalizedText: savedTmpl.messageContent.replace('{name}', 'Recent Sender'),
          },
        ]
      );

      expect(campaignRes.campaign.id).toBeDefined();
      expect(campaignRes.queuedCount).toBe(1);
      expect(campaignRes.campaign.messageTemplate).toBe(savedTmpl.messageContent);

      const queueItem = Array.from(mockDb.tables.fb_campaign_queue.values())[0];
      expect(queueItem).toBeDefined();
      expect(queueItem.message_text).toBe('হ্যালো Recent Sender, আপনার পছন্দের আইটেমটি এখনো স্টকে আছে!');
    });
  });
});
