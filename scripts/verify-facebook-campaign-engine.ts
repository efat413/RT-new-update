import {
  createFacebookCampaignInD1,
  getFacebookCampaignByIdFromD1,
  updateFacebookCampaignStatusInD1,
  updateFacebookCampaignDelaysInD1,
  processNextCampaignQueueItemInD1,
  recordMetaDeliveryWatermarkInD1,
} from '../src/server/db';
import { Env } from '../src/server/types';

// Standalone in-memory D1 mock for verify script
class StandaloneMockD1 {
  public tables = {
    fb_campaigns: new Map<string, any>(),
    fb_campaign_queue: new Map<string, any>(),
  };

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
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
          return { success: true, meta: { changes: 1 } };
        }
        if (clean.includes('INSERT OR IGNORE INTO fb_campaign_queue')) {
          const [id, campaign_id, recipient_id, recipient_name, psid, phone, is_within_24h, has_consent, message_text] = args;
          const exists = Array.from(db.tables.fb_campaign_queue.values()).some(
            (q) => q.campaign_id === campaign_id && q.recipient_id === recipient_id
          );
          if (exists) return { success: true, meta: { changes: 0 } };
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
        if (clean.includes('UPDATE fb_campaigns SET min_delay = ?, max_delay = ?')) {
          const [minD, maxD, id] = args;
          const row = db.tables.fb_campaigns.get(id);
          if (row) {
            row.min_delay = minD;
            row.max_delay = maxD;
            return { success: true, meta: { changes: 1 } };
          }
        }
        if (clean.includes("UPDATE fb_campaigns SET status = 'paused'")) {
          const [id] = args;
          const row = db.tables.fb_campaigns.get(id);
          if (row) {
            row.status = 'paused';
            return { success: true, meta: { changes: 1 } };
          }
        }
        if (clean.includes("UPDATE fb_campaigns SET status = 'running'")) {
          const [id] = args;
          const row = db.tables.fb_campaigns.get(id);
          if (row) {
            row.status = 'running';
            return { success: true, meta: { changes: 1 } };
          }
        }
        if (clean.includes("UPDATE fb_campaign_queue SET status = 'cancelled'")) {
          const [cid] = args;
          for (const q of db.tables.fb_campaign_queue.values()) {
            if (q.campaign_id === cid && (q.status === 'pending' || q.status === 'processing')) {
              q.status = 'cancelled';
            }
          }
          return { success: true, meta: { changes: 1 } };
        }
        if (clean.includes("UPDATE fb_campaigns SET status = 'cancelled'")) {
          const [id] = args;
          const row = db.tables.fb_campaigns.get(id);
          if (row) {
            row.status = 'cancelled';
            row.remaining_count = 0;
            return { success: true, meta: { changes: 1 } };
          }
        }
        if (clean.includes("UPDATE fb_campaign_queue SET status = 'processing'")) {
          const [id] = args;
          const q = db.tables.fb_campaign_queue.get(id);
          if (q && q.status === 'pending') {
            q.status = 'processing';
            return { success: true, meta: { changes: 1 } };
          }
          return { success: false, meta: { changes: 0 } };
        }
        if (clean.includes("UPDATE fb_campaign_queue SET status = 'accepted'")) {
          const [mid, delay, id] = args;
          const q = db.tables.fb_campaign_queue.get(id);
          if (q) {
            q.status = 'accepted';
            q.meta_message_id = mid;
            q.delay_used_seconds = delay;
            return { success: true, meta: { changes: 1 } };
          }
        }
        if (clean.includes('UPDATE fb_campaigns SET accepted_count = accepted_count + 1')) {
          const [id] = args;
          const row = db.tables.fb_campaigns.get(id);
          if (row) {
            row.accepted_count++;
            row.remaining_count = Math.max(0, row.remaining_count - 1);
            return { success: true, meta: { changes: 1 } };
          }
        }
        if (clean.includes("UPDATE fb_campaign_queue SET status = 'skipped'")) {
          const [reason, delay, id] = args;
          const q = db.tables.fb_campaign_queue.get(id);
          if (q) {
            q.status = 'skipped';
            q.skip_reason = reason;
            q.delay_used_seconds = delay;
            return { success: true, meta: { changes: 1 } };
          }
        }
        if (clean.includes('UPDATE fb_campaigns SET skipped_count = skipped_count + 1')) {
          const [id] = args;
          const row = db.tables.fb_campaigns.get(id);
          if (row) {
            row.skipped_count++;
            row.remaining_count = Math.max(0, row.remaining_count - 1);
            return { success: true, meta: { changes: 1 } };
          }
        }
        if (clean.includes("UPDATE fb_campaign_queue SET status = 'delivered'")) {
          const [watermark, id] = args;
          const q = db.tables.fb_campaign_queue.get(id);
          if (q) {
            q.status = 'delivered';
            q.delivered_watermark = watermark;
            return { success: true, meta: { changes: 1 } };
          }
        }
        if (clean.includes('UPDATE fb_campaigns SET delivered_count = delivered_count + 1')) {
          const [id] = args;
          const row = db.tables.fb_campaigns.get(id);
          if (row) {
            row.delivered_count++;
            return { success: true, meta: { changes: 1 } };
          }
        }
        if (clean.includes("UPDATE fb_campaigns SET status = 'completed'")) {
          const [id] = args;
          const row = db.tables.fb_campaigns.get(id);
          if (row) {
            row.status = 'completed';
            row.remaining_count = 0;
            return { success: true, meta: { changes: 1 } };
          }
        }
        return { success: true, meta: { changes: 0 } };
      },
      async first<T = any>() {
        if (clean.includes('SELECT * FROM fb_campaigns WHERE id = ?') || clean.includes('SELECT remaining_count FROM fb_campaigns WHERE id = ?')) {
          const [id] = args;
          return (db.tables.fb_campaigns.get(id) || null) as unknown as T;
        }
        if (clean.includes("SELECT * FROM fb_campaign_queue WHERE campaign_id = ? AND status = 'pending'")) {
          const [cid] = args;
          for (const q of db.tables.fb_campaign_queue.values()) {
            if (q.campaign_id === cid && q.status === 'pending') return q as unknown as T;
          }
          return null as unknown as T;
        }
        if (clean.includes("status = 'processing'")) {
          const [cid] = args;
          let count = 0;
          for (const q of db.tables.fb_campaign_queue.values()) {
            if (q.campaign_id === cid && q.status === 'processing') count++;
          }
          return { count } as unknown as T;
        }
        if (clean.includes("status IN ('pending', 'processing')")) {
          const [cid] = args;
          let count = 0;
          for (const q of db.tables.fb_campaign_queue.values()) {
            if (q.campaign_id === cid && (q.status === 'pending' || q.status === 'processing')) count++;
          }
          return { count } as unknown as T;
        }
        if (clean.includes('WHERE meta_message_id = ?')) {
          const [mid] = args;
          for (const q of db.tables.fb_campaign_queue.values()) {
            if (q.meta_message_id === mid) return { id: q.id, campaign_id: q.campaign_id, status: q.status } as unknown as T;
          }
          return null as unknown as T;
        }
        if (clean.includes('SELECT * FROM fb_campaign_queue WHERE id = ?')) {
          const [id] = args;
          return (db.tables.fb_campaign_queue.get(id) || null) as unknown as T;
        }
        return null as unknown as T;
      },
      async all() {
        if (clean.includes('SELECT * FROM fb_campaign_queue WHERE campaign_id = ?')) {
          const [cid] = args;
          const items = Array.from(db.tables.fb_campaign_queue.values()).filter((q) => q.campaign_id === cid);
          return { results: items };
        }
        return { results: [] };
      },
    });

    return stmt();
  }
}

async function verifyFacebookCampaignEngine() {
  console.log('=== VERIFYING FACEBOOK BROADCASTER CAMPAIGN ENGINE (PART 5) ===\n');

  let passed = 0;
  let failed = 0;

  function assert(title: string, condition: boolean) {
    if (condition) {
      console.log(`✅ PASS: ${title}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${title}`);
      failed++;
    }
  }

  const db: any = new StandaloneMockD1();
  const env: Env = {
    DB: db,
    JWT_SECRET: 'test-secret-at-least-32-chars-long-12345678',
  };

  // Test 1: Persistent Campaign Creation & Deduplication
  const recipients = [
    { id: 'usr-1', name: 'Tanvir', psid: 'psid_1', isWithin24Hours: true, personalizedText: 'Hey Tanvir' },
    { id: 'usr-2', name: 'Nusrat', psid: 'psid_2', isWithin24Hours: true, personalizedText: 'Hey Nusrat' },
    { id: 'usr-1', name: 'Tanvir (Dup)', psid: 'psid_1', isWithin24Hours: true, personalizedText: 'Hey Tanvir 2' },
  ];

  const createRes = await createFacebookCampaignInD1(
    db,
    {
      name: 'Eid Special Campaign',
      audienceType: 'page_contacts',
      tag: 'NONE',
      messageTemplate: 'Hey {name}',
      minDelay: 2.0,
      maxDelay: 3.0,
    },
    recipients
  );

  assert('Campaign persisted with status draft', createRes.campaign.status === 'draft');
  assert('Recipients deduplicated correctly (2 unique out of 3 submitted)', createRes.queuedCount === 2);
  assert('Remaining count matches total queued', createRes.campaign.remainingCount === 2);

  // Test 2: Random delay generation within configured 2-3s range
  const step1 = await processNextCampaignQueueItemInD1(db, createRes.campaign.id, env);
  assert('First item processed successfully', step1.success === true);
  assert('Fresh random delay generated within 2.0s - 3.0s range', step1.delayUsedSeconds! >= 2.0 && step1.delayUsedSeconds! <= 3.0);
  assert('Item accepted and remaining count decremented to 1', step1.remainingCount === 1);

  // Test 3: Live dynamic delay update during active campaign
  const delayUpdate = await updateFacebookCampaignDelaysInD1(db, createRes.campaign.id, 4.0, 5.0);
  assert('Admin successfully changed delay range during campaign to 4.0s - 5.0s', delayUpdate.success === true);

  const step2 = await processNextCampaignQueueItemInD1(db, createRes.campaign.id, env);
  assert('Second item uses updated delay range (4.0s - 5.0s)', step2.delayUsedSeconds! >= 4.0 && step2.delayUsedSeconds! <= 5.0);
  assert('Campaign completes when all items finished', step2.completed === true && step2.campaignStatus === 'completed');

  // Test 4: Pause & Resume Controls
  const pauseTestRecs = [
    { id: 'p-1', name: 'User P1', psid: 'psid_p1', isWithin24Hours: true },
    { id: 'p-2', name: 'User P2', psid: 'psid_p2', isWithin24Hours: true },
  ];
  const c2 = await createFacebookCampaignInD1(db, { name: 'Pause Test', audienceType: 'page_contacts', tag: 'NONE', messageTemplate: 'Test' }, pauseTestRecs);
  await processNextCampaignQueueItemInD1(db, c2.campaign.id, env);

  const pauseRes = await updateFacebookCampaignStatusInD1(db, c2.campaign.id, 'paused');
  assert('Campaign successfully paused in D1', pauseRes.status === 'paused');

  const blockedStep = await processNextCampaignQueueItemInD1(db, c2.campaign.id, env);
  assert('Processing safely blocked while campaign is paused', blockedStep.success === false && blockedStep.campaignStatus === 'paused');

  const resumeRes = await updateFacebookCampaignStatusInD1(db, c2.campaign.id, 'running');
  assert('Campaign successfully resumed in D1', resumeRes.status === 'running');

  const resumedStep = await processNextCampaignQueueItemInD1(db, c2.campaign.id, env);
  assert('Resumed execution completes remaining items', resumedStep.success === true && resumedStep.completed === true);

  // Test 5: Cancel Control
  const cancelTestRecs = [
    { id: 'c-1', name: 'User C1', psid: 'psid_c1', isWithin24Hours: true },
    { id: 'c-2', name: 'User C2', psid: 'psid_c2', isWithin24Hours: true },
  ];
  const c3 = await createFacebookCampaignInD1(db, { name: 'Cancel Test', audienceType: 'page_contacts', tag: 'NONE', messageTemplate: 'Test' }, cancelTestRecs);
  const cancelRes = await updateFacebookCampaignStatusInD1(db, c3.campaign.id, 'cancelled');
  assert('Campaign cancelled and remaining queue aborted', cancelRes.status === 'cancelled');

  const cancelledCampDetails = await getFacebookCampaignByIdFromD1(db, c3.campaign.id);
  assert('Campaign remaining count set to 0 in D1', cancelledCampDetails.campaign?.remainingCount === 0);
  assert('Remaining queue items marked cancelled', cancelledCampDetails.queue.every((q) => q.status === 'cancelled'));

  // Test 6: Policy Guard (24h window enforcement)
  const policyRecs = [
    { id: 'pol-1', name: 'Stale Contact', psid: 'psid_stale', isWithin24Hours: false },
  ];
  const c4 = await createFacebookCampaignInD1(db, { name: 'Policy Test', audienceType: 'page_contacts', tag: 'NONE', messageTemplate: 'Hi' }, policyRecs);
  const polStep = await processNextCampaignQueueItemInD1(db, c4.campaign.id, env);
  assert('Outside 24h untagged recipient safely skipped with policy reason', polStep.item?.status === 'skipped');
  assert('Skip reason mentions 24-hour messaging window', polStep.item?.skipReason?.includes('24-hour') === true);

  // Test 7: Delivery watermark tracking via Meta Webhook
  const delivRecs = [
    { id: 'del-1', name: 'Delivery Recipient', psid: 'psid_deliv', isWithin24Hours: true },
  ];
  const c5 = await createFacebookCampaignInD1(db, { name: 'Delivery Test', audienceType: 'page_contacts', tag: 'NONE', messageTemplate: 'Hi' }, delivRecs);
  const delStep = await processNextCampaignQueueItemInD1(db, c5.campaign.id, env);
  const mid = delStep.item?.metaMessageId;
  assert('Queue item accepted with Meta message ID', Boolean(mid));

  let c5Details = await getFacebookCampaignByIdFromD1(db, c5.campaign.id);
  assert('Before webhook receipt: accepted=1, delivered=0', c5Details.campaign?.acceptedCount === 1 && c5Details.campaign?.deliveredCount === 0);

  await recordMetaDeliveryWatermarkInD1(db, [mid!], Date.now());
  c5Details = await getFacebookCampaignByIdFromD1(db, c5.campaign.id);
  assert('After webhook delivery receipt: delivered increments to 1', c5Details.campaign?.deliveredCount === 1);
  assert('Queue item status transitions to delivered', c5Details.queue[0].status === 'delivered');

  console.log(`\n========================================`);
  console.log(`Total Passed: ${passed} | Total Failed: ${failed}`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

verifyFacebookCampaignEngine().catch((err) => {
  console.error('Fatal verification error:', err);
  process.exit(1);
});
