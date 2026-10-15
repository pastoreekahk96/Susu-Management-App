import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { createLegacyAuditReader } from '../lib/legacy-audit-reader.ts';

// Execute the actual server page with synthetic dependencies, without a Next
// server, application session, or database. Keep the real access reader wired in.
const source = readFileSync(new URL('../app/audit/page.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;
const require = createRequire(import.meta.url);

function page({ grouped = false, authError, databaseError } = {}) {
  let auditReads = 0;
  const record = {
    id: 'private-audit-id', action: 'PRIVATE_ACTION', entityType: 'DailyPayment',
    entityId: 'private-payment-id', beforeJson: '{"paidAmount":0}',
    afterJson: '{"paidAmount":50}', createdAt: new Date('2026-10-15T00:00:00Z'),
    actor: { name: 'Private actor', email: 'private@example.invalid', role: 'ADMIN' },
  };
  const deps = {
    '../../lib/auth': { requireRole: async () => {
      if (authError) throw new Error(authError);
      return { id: 'u', role: 'ADMIN' };
    } },
    '../../lib/prisma': { prisma: { $transaction: async read => read({
      group: { findFirst: async () => {
        if (databaseError) throw databaseError;
        return grouped ? { id: 'foreign-group' } : null;
      } },
      auditLog: { findMany: async () => { auditReads++; return [record]; } },
    }) } },
    '../../lib/legacy-audit-reader': { createLegacyAuditReader },
    'next/navigation': { redirect: url => { throw new Error(`REDIRECT:${url}`); } },
    'next/link': { __esModule: true, default: ({ children, ...props }) => React.createElement('a', props, children) },
    '../theme-toggle': { __esModule: true, default: () => null },
  };
  const pageModule = { exports: {} };
  new Function('require', 'module', 'exports', compiled)(
    name => Object.hasOwn(deps, name) ? deps[name] : require(name), pageModule, pageModule.exports,
  );
  return { render: async () => renderToStaticMarkup(await pageModule.exports.default()), auditReads: () => auditReads };
}

test('grouped installation renders only generic denial, with no financial or actor data', async () => {
  const fixture = page({ grouped: true });
  const html = await fixture.render();
  assert.match(html, /role="alert"/);
  assert.match(html, /Audit history unavailable/);
  assert.doesNotMatch(html, /private|PRIVATE_ACTION|Recent entries|Recent activity|before-state|after-state|System/);
  assert.equal(fixture.auditReads(), 0);
});

test('ungrouped administrator retains the actual read-only legacy history view', async () => {
  const fixture = page();
  const html = await fixture.render();
  assert.match(html, /PRIVATE_ACTION/);
  assert.match(html, /private-payment-id/);
  assert.match(html, /private@example.invalid/);
  assert.match(html, /Recent activity/);
  assert.doesNotMatch(html, /Audit history unavailable/);
  assert.equal(fixture.auditReads(), 1);
});

test('page redirects unauthorized users and never substitutes history after a database failure', async () => {
  for (const [authError, destination] of [['AUTH_REQUIRED', '/login'], ['FORBIDDEN', '/']]) {
    const fixture = page({ authError });
    await assert.rejects(fixture.render, { message: `REDIRECT:${destination}` });
    assert.equal(fixture.auditReads(), 0);
  }
  const failure = new Error('database unavailable');
  const fixture = page({ databaseError: failure });
  await assert.rejects(fixture.render, error => error === failure);
  assert.equal(fixture.auditReads(), 0);
});
