// @samjonaidi-ship-it/universal-auth | src/react/components/scope-catalogs.ts | v0.1.0 | 2026-05-06 | BB
// Persona-keyed default scope catalogs — DELEGATION_CENTER_DESIGN_v1.0.md §10 D3.
//
// Consumers spread to override or extend, e.g.:
//   <DelegationCenter
//     scopeCatalog={{ ...crewScopeCatalog, 'custom:scope': { label: '...' } }}
//     ...
//   />
//
// Scope naming follows `<resource>:<action>` snake-case (matches SCOPE_RE in
// CT BFF identity-v1.js).

import type { ScopeMeta } from '../../flows/delegation.js';

const PROFILE_DEFAULTS: Record<string, ScopeMeta> = {
  'profile:read': {
    label: 'Read your profile',
    explanation: 'Name, avatar, contact info, and personas.',
  },
  'profile:write': {
    label: 'Update your profile',
    explanation: 'Edit name, avatar, contact info, and personas.',
  },
};

const AGENT_DANGER: Record<string, ScopeMeta> = {
  'agent:act_on_behalf': {
    label: 'Act on your behalf',
    danger: true,
    explanation:
      'Lets an autonomous agent take actions as if it were you. Only grant to trusted automations.',
  },
};

export const crewScopeCatalog: Record<string, ScopeMeta> = {
  ...PROFILE_DEFAULTS,
  'timesheets:read': {
    label: 'Read your timesheets',
    explanation: 'View hours, jobcodes, and clock-in events.',
  },
  'timesheets:write': {
    label: 'Edit your timesheets',
    explanation: 'Punch in/out and adjust entries on your behalf.',
  },
  'receipts:read': {
    label: 'Read your receipts',
    explanation: 'View uploaded receipts and reimbursement status.',
  },
  'receipts:write': {
    label: 'Submit receipts on your behalf',
    explanation: 'Upload, edit, or delete receipts.',
  },
  'gps:read': {
    label: 'See your GPS location',
    explanation: 'Read jobsite check-in coordinates.',
  },
  ...AGENT_DANGER,
};

export const homeownerScopeCatalog: Record<string, ScopeMeta> = {
  ...PROFILE_DEFAULTS,
  'property:read': {
    label: 'Read your property records',
    explanation: 'Address, photos, square footage, owner-supplied details.',
  },
  'property:write': {
    label: 'Edit your property records',
    explanation: 'Add or update property details.',
  },
  'services:read': {
    label: 'Read service requests',
    explanation: 'View work orders, estimates, and visit history.',
  },
  'invoices:read': {
    label: 'Read your invoices',
    explanation: 'View pricing, totals, and payment status.',
  },
  'documents:read': {
    label: 'Read shared documents',
    explanation: 'Plans, contracts, warranties associated with your property.',
  },
  ...AGENT_DANGER,
};

export const subcontractorScopeCatalog: Record<string, ScopeMeta> = {
  ...PROFILE_DEFAULTS,
  'jobs:read': {
    label: 'Read assigned jobs',
    explanation: 'Job descriptions, schedules, and contacts.',
  },
  'jobs:write': {
    label: 'Update assigned jobs',
    explanation: 'Mark progress, log site notes, attach files.',
  },
  'invoices:read': {
    label: 'Read invoices you issued',
    explanation: 'View status of invoices submitted to BBInc.',
  },
  'invoices:write': {
    label: 'Submit invoices on your behalf',
    explanation: 'Create new invoices or upload supporting docs.',
  },
  'documents:read': {
    label: 'Read project documents',
    explanation: 'Plans, contracts, change orders for your jobs.',
  },
  ...AGENT_DANGER,
};

export const supplierScopeCatalog: Record<string, ScopeMeta> = {
  ...PROFILE_DEFAULTS,
  'orders:read': {
    label: 'Read purchase orders',
    explanation: 'View open POs and shipment status.',
  },
  'orders:write': {
    label: 'Update orders on your behalf',
    explanation: 'Confirm, modify, or cancel POs.',
  },
  'invoices:read': {
    label: 'Read your invoices',
    explanation: 'View invoice status, totals, and payments.',
  },
  'invoices:write': {
    label: 'Submit invoices on your behalf',
    explanation: 'Issue new supplier invoices.',
  },
  'catalog:read': {
    label: 'Read product catalog',
    explanation: 'View available SKUs, prices, and availability.',
  },
  ...AGENT_DANGER,
};

export const architectScopeCatalog: Record<string, ScopeMeta> = {
  ...PROFILE_DEFAULTS,
  'projects:read': {
    label: 'Read assigned projects',
    explanation: 'Project briefs, schedules, and stakeholders.',
  },
  'projects:write': {
    label: 'Update assigned projects',
    explanation: 'Edit specs, attach drawings, log decisions.',
  },
  'plans:read': {
    label: 'Read drawing sets',
    explanation: 'View construction documents and revisions.',
  },
  'plans:write': {
    label: 'Upload drawings on your behalf',
    explanation: 'Submit new drawing sets and revisions.',
  },
  'documents:read': {
    label: 'Read project documents',
    explanation: 'Specs, RFIs, contracts, change orders.',
  },
  ...AGENT_DANGER,
};
