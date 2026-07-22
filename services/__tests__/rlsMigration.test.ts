/// <reference types="jest" />
/// <reference types="node" />

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

it('defines scoped RLS policies instead of unrelated-account read access', () => {
  const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations/202607230001_phase3.sql'), 'utf8');
  expect(sql).toContain('alter table public.incidents enable row level security');
  expect(sql).toContain('private.is_assigned_guardian(id, (select auth.uid()))');
  expect(sql).toContain('user_id = (select auth.uid())');
  expect(sql).not.toMatch(/create policy[\s\S]{0,180}to authenticated[\s\S]{0,80}using\s*\(\s*true\s*\)/i);
});
