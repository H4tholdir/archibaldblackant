import { describe, it, expect } from 'vitest';
import { buildEffectiveContactQuery } from './notification-settings.repository';

describe('buildEffectiveContactQuery', () => {
  it('usa COALESCE per email e whatsapp', () => {
    const q = buildEffectiveContactQuery();
    expect(q).toContain('COALESCE(ns.email_override, c.email)');
    expect(q).toContain('COALESCE(ns.whatsapp_override, c.mobile)');
  });
});
