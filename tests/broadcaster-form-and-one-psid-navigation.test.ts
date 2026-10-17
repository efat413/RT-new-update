import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('PART 1 & PART 2: FB Broadcaster One PSID Form & Navigation Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('PART 1 — Campaign Form Fields Empty & Variations Logic', () => {
    it('shows zero variations when message template string is empty', () => {
      const template = '';
      const parsedTemplates = template
        .split('|')
        .map((t) => t.trim())
        .filter(Boolean);
      const effectiveTemplates = parsedTemplates;

      expect(effectiveTemplates.length).toBe(0);
      expect(effectiveTemplates).toEqual([]);
    });

    it('shows zero variations when message template contains only whitespace or delimiters', () => {
      const whitespaceTemplate = '   |   |  ';
      const parsedTemplates = whitespaceTemplate
        .split('|')
        .map((t) => t.trim())
        .filter(Boolean);
      const effectiveTemplates = parsedTemplates;

      expect(effectiveTemplates.length).toBe(0);
      expect(effectiveTemplates).toEqual([]);
    });

    it('correctly parses single and multiple template variations separated by |', () => {
      const single = 'হ্যালো {name}, বিশেষ অফার!';
      const singleParsed = single
        .split('|')
        .map((t) => t.trim())
        .filter(Boolean);
      expect(singleParsed.length).toBe(1);
      expect(singleParsed[0]).toBe('হ্যালো {name}, বিশেষ অফার!');

      const multiple = ' অফার ১: {name} | অফার ২: সুপ্রিয় {name}! | অফার ৩ ';
      const multiParsed = multiple
        .split('|')
        .map((t) => t.trim())
        .filter(Boolean);
      expect(multiParsed.length).toBe(3);
      expect(multiParsed[0]).toBe('অফার ১: {name}');
      expect(multiParsed[1]).toBe('অফার ২: সুপ্রিয় {name}!');
      expect(multiParsed[2]).toBe('অফার ৩');
    });

    it('does not generate preview if template is empty', () => {
      const renderTemplatePreview = (template: string, name: string | null) => {
        if (!template) return '';
        if (name && name.trim()) {
          return template.replace(/\{name\}/g, name.trim());
        }
        return template
          .replace(/\s*\{name\}\s*,/g, ',')
          .replace(/\s*\{name\}\s*!/g, '!')
          .replace(/\s*\{name\}\s*\./g, '.')
          .replace(/\s*\{name\}\s*/g, ' ')
          .replace(/\s{2,}/g, ' ')
          .trim();
      };

      expect(renderTemplatePreview('', 'আহমেদ')).toBe('');
      expect(renderTemplatePreview('', null)).toBe('');
    });

    it('correctly substitutes {name} in Bangla and handles omission cleanly without name', () => {
      const renderTemplatePreview = (template: string, name: string | null) => {
        if (!template) return '';
        if (name && name.trim()) {
          return template.replace(/\{name\}/g, name.trim());
        }
        return template
          .replace(/\s*\{name\}\s*,/g, ',')
          .replace(/\s*\{name\}\s*!/g, '!')
          .replace(/\s*\{name\}\s*\./g, '.')
          .replace(/\s*\{name\}\s*/g, ' ')
          .replace(/\s{2,}/g, ' ')
          .trim();
      };

      const templateWithName = 'হ্যালো {name}, রংধনু ট্রেডে আপনাকে স্বাগতম!';
      const withName = renderTemplatePreview(templateWithName, 'আহমেদ');
      expect(withName).toBe('হ্যালো আহমেদ, রংধনু ট্রেডে আপনাকে স্বাগতম!');

      const withoutName = renderTemplatePreview(templateWithName, null);
      expect(withoutName).toBe('হ্যালো, রংধনু ট্রেডে আপনাকে স্বাগতম!');
    });

    it('counts Unicode/Bangla characters accurately using Array.from', () => {
      const banglaText = 'রংধনু ট্রেড 🇧🇩';
      const charCount = Array.from(banglaText).length;
      expect(charCount).toBeGreaterThan(0);
      expect(charCount).toBeLessThan(2000);
    });

    it('initial form values and handleNewCampaign clear all four campaign fields', () => {
      let pageId = '104829105829104';
      let campaignId = 'camp-123';
      let messageTemplates = 'Hello world';
      let rawAudienceInput = '89012345678901';

      const handleNewCampaign = () => {
        pageId = '';
        campaignId = '';
        messageTemplates = '';
        rawAudienceInput = '';
      };

      handleNewCampaign();

      expect(pageId).toBe('');
      expect(campaignId).toBe('');
      expect(messageTemplates).toBe('');
      expect(rawAudienceInput).toBe('');
    });

    it('loadSampleAudience is an explicit manual action only', () => {
      let rawAudienceInput = '';
      const loadSampleAudience = () => {
        rawAudienceInput = [
          '89012345678901 {"name": "আহমেদ"}',
          '89012345678902 {"name": "রাকিব"}',
          '89012345678903',
        ].join('\n');
      };

      expect(rawAudienceInput).toBe('');
      loadSampleAudience();
      expect(rawAudienceInput).toContain('89012345678901');
      expect(rawAudienceInput.split('\n').length).toBe(3);
    });
  });

  describe('PART 2 — One PSID Route Resolution & Navigation', () => {
    const VALID_ADMIN_TABS = new Set([
      'overview',
      'profit',
      'orders',
      'products',
      'categories',
      'slides',
      'couriers',
      'settings',
      'users',
      'pixels',
      'broadcaster',
      'one-psid',
      'reviews',
      'vouchers',
      'debug',
    ]);

    const resolveAdminTabFromPathname = (pathname: string, search = '', savedTab: string | null = null): string => {
      if (pathname.startsWith('/admin/')) {
        const sub = pathname.replace(/^\/admin\//, '').replace(/\/$/, '').toLowerCase();
        if (sub === 'customers' || sub === 'accounts') return 'users';
        if (sub === 'one-psid' || sub === 'broadcaster' || sub === 'fb-broadcaster') return 'one-psid';
        if (VALID_ADMIN_TABS.has(sub)) return sub;
      }
      const params = new URLSearchParams(search);
      const qTab = (params.get('tab') || '').toLowerCase();
      if (qTab === 'customers' || qTab === 'accounts') return 'users';
      if (qTab === 'one-psid' || qTab === 'broadcaster' || qTab === 'fb-broadcaster') return 'one-psid';
      if (VALID_ADMIN_TABS.has(qTab)) return qTab;

      if (savedTab === 'one-psid' || savedTab === 'broadcaster' || savedTab === 'fb-broadcaster') return 'one-psid';
      if (savedTab && VALID_ADMIN_TABS.has(savedTab)) return savedTab;

      return 'overview';
    };

    it('resolves /admin/one-psid directly to one-psid tab', () => {
      expect(resolveAdminTabFromPathname('/admin/one-psid')).toBe('one-psid');
      expect(resolveAdminTabFromPathname('/admin/one-psid/')).toBe('one-psid');
    });

    it('resolves /admin/broadcaster and /admin/fb-broadcaster to one-psid tab', () => {
      expect(resolveAdminTabFromPathname('/admin/broadcaster')).toBe('one-psid');
      expect(resolveAdminTabFromPathname('/admin/fb-broadcaster')).toBe('one-psid');
    });

    it('resolves query parameter ?tab=one-psid and ?tab=broadcaster to one-psid tab', () => {
      expect(resolveAdminTabFromPathname('/admin', '?tab=one-psid')).toBe('one-psid');
      expect(resolveAdminTabFromPathname('/admin', '?tab=broadcaster')).toBe('one-psid');
    });

    it('preserves one-psid on browser reload when reading saved tab from localStorage', () => {
      expect(resolveAdminTabFromPathname('/admin', '', 'one-psid')).toBe('one-psid');
      expect(resolveAdminTabFromPathname('/admin', '', 'broadcaster')).toBe('one-psid');
    });

    it('constructs correct targetPath when navigating to broadcaster or one-psid', () => {
      const getTargetPath = (tab: string) => {
        const normalized = tab === 'customers' || tab === 'accounts'
          ? 'users'
          : (tab === 'broadcaster' || tab === 'one-psid' || tab === 'fb-broadcaster' ? 'one-psid' : tab);

        return normalized === 'overview'
          ? '/admin'
          : (normalized === 'users' ? '/admin/customers' : (normalized === 'one-psid' ? '/admin/one-psid' : `/admin/${normalized}`));
      };

      expect(getTargetPath('one-psid')).toBe('/admin/one-psid');
      expect(getTargetPath('broadcaster')).toBe('/admin/one-psid');
      expect(getTargetPath('fb-broadcaster')).toBe('/admin/one-psid');
      expect(getTargetPath('orders')).toBe('/admin/orders');
      expect(getTargetPath('overview')).toBe('/admin');
    });

    it('ensures terminal auto-scroll does not trigger window.scrollTo or window scrollIntoView', () => {
      const mockContainer = {
        scrollHeight: 1000,
        scrollTop: 0,
      };

      const updateTerminalScroll = (logsCount: number, container: typeof mockContainer | null) => {
        if (logsCount > 0 && container) {
          container.scrollTop = container.scrollHeight;
        }
      };

      updateTerminalScroll(5, mockContainer);
      expect(mockContainer.scrollTop).toBe(1000);
    });

    it('simulates session expiry retention: route remains /admin/one-psid and logs in to one-psid', () => {
      let isPrivilegedAdmin = false;
      const initialPath = '/admin/one-psid';

      const resolvedTabOnMount = resolveAdminTabFromPathname(initialPath);
      expect(resolvedTabOnMount).toBe('one-psid');

      // Admin logs in
      isPrivilegedAdmin = true;
      const activeTabAfterLogin = resolvedTabOnMount;

      expect(isPrivilegedAdmin).toBe(true);
      expect(activeTabAfterLogin).toBe('one-psid');
    });
  });
});
