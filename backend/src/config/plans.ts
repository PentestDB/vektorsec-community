/**
 * Plan / Tier configuration for the vektorsec commercial offering.
 *
 * Plans are now stored dynamically in MongoDB (see models/Plan and
 * services/plan.service). This module provides a compatibility layer so
 * existing callers (billing, payment, usage-limit) can keep using the same
 * synchronous-style API. All functions delegate to the DB-backed plan service.
 */

import {
  getPlanOrFree,
  isPlanId as dbIsPlanId,
  listAllPlans,
  listEnabledPlans,
} from "../services/plan.service";

export type PlanId = string;

export interface PlanLimits {
  maxConcurrentSessions: number;
  maxSessionsPerPeriod: number;
  maxAgentIterations: number;
  maxWorkspaces: number;
  maxMcpTokens: number;
  advancedTools: boolean;
  swarmEnabled: boolean;
  prioritySupport: boolean;
  auditLogRetention: boolean;
  maxTeamMembers: number;
  /** Maximum cumulative tokens a user can use on a trial (no time expiry). */
  maxTokensPerTrial: number;
}


export interface Plan {
  id: PlanId;
  name: string;
  description: string;
  priceMonthly: number;
  priceAnnual: number;
  limits: PlanLimits;
  features: string[];
}

export const DEFAULT_PLAN: PlanId = "free";

export const PLAN_IDS: PlanId[] = ["free", "pro", "team", "enterprise"];

/**
 * Get a plan by id, falling back to the free plan.
 * Async wrapper around the DB-backed plan service.
 */
export async function getPlan(planId: string): Promise<Plan> {
  const doc = await getPlanOrFree(planId);
  return {
    id: doc.planId,
    name: doc.name,
    description: doc.description,
    priceMonthly: doc.priceMonthly,
    priceAnnual: doc.priceAnnual,
    limits: doc.limits,
    features: doc.features,
  };
}

/**
 * Check whether a planId exists in the DB.
 */
export async function isPlanId(value: string): Promise<boolean> {
  return dbIsPlanId(value);
}

/**
 * Get the full plan catalog (all plans, including disabled).
 */
export async function getPlanCatalog(): Promise<Plan[]> {
  const docs = await listAllPlans();
  return docs.map((d) => ({
    id: d.planId,
    name: d.name,
    description: d.description,
    priceMonthly: d.priceMonthly,
    priceAnnual: d.priceAnnual,
    limits: d.limits,
    features: d.features,
  }));
}

/**
 * Get enabled plans (public catalog for pricing page / checkout).
 */
export async function getEnabledPlanCatalog(): Promise<Plan[]> {
  const docs = await listEnabledPlans();
  return docs.map((d) => ({
    id: d.planId,
    name: d.name,
    description: d.description,
    priceMonthly: d.priceMonthly,
    priceAnnual: d.priceAnnual,
    limits: d.limits,
    features: d.features,
  }));
}

// Backward-compatible static PLANS map (used only as a fallback / reference).
export const PLANS: Record<string, Plan> = {
  free: {
    id: "free",
    name: "Free",
    description: "For individuals exploring the platform.",
    priceMonthly: 0,
    priceAnnual: 0,
    limits: {
      maxConcurrentSessions: 1,
      maxSessionsPerPeriod: 10,
      maxAgentIterations: 25,
      maxWorkspaces: 1,
      maxMcpTokens: 2,
      advancedTools: false,
      swarmEnabled: false,
      prioritySupport: false,
      auditLogRetention: false,
      maxTeamMembers: 1,
      maxTokensPerTrial: 50000,
    },
    features: [
      "1 concurrent session",

      "10 sessions / month",
      "25 agent iterations / session",
      "1 workspace",
      "2 MCP tokens",
    ],
  },
  pro: {
    id: "pro",
    name: "Pro",
    description: "For professional pentesters and security researchers.",
    priceMonthly: 49,
    priceAnnual: 39,
    limits: {
      maxConcurrentSessions: 3,
      maxSessionsPerPeriod: 0,
      maxAgentIterations: 100,
      maxWorkspaces: 5,
      maxMcpTokens: 10,
      advancedTools: true,
      swarmEnabled: false,
      prioritySupport: false,
      auditLogRetention: true,
      maxTeamMembers: 1,
      maxTokensPerTrial: 50000,
    },
    features: [
      "3 concurrent sessions",

      "Unlimited sessions",
      "100 agent iterations / session",
      "5 workspaces",
      "10 MCP tokens",
      "Advanced tools (Burp, Caido, VNC)",
      "Audit log retention",
    ],
  },
  team: {
    id: "team",
    name: "Team",
    description: "For small security teams collaborating on engagements.",
    priceMonthly: 149,
    priceAnnual: 119,
    limits: {
      maxConcurrentSessions: 10,
      maxSessionsPerPeriod: 0,
      maxAgentIterations: 200,
      maxWorkspaces: 20,
      maxMcpTokens: 50,
      advancedTools: true,
      swarmEnabled: true,
      prioritySupport: true,
      auditLogRetention: true,
      maxTeamMembers: 10,
      maxTokensPerTrial: 50000,
    },
    features: [
      "10 concurrent sessions",

      "Unlimited sessions",
      "200 agent iterations / session",
      "20 workspaces",
      "50 MCP tokens",
      "Swarm / multi-agent orchestration",
      "Priority support",
      "Up to 10 team members",
    ],
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    description: "For large organizations with custom requirements.",
    priceMonthly: 499,
    priceAnnual: 399,
    limits: {
      maxConcurrentSessions: 50,
      maxSessionsPerPeriod: 0,
      maxAgentIterations: 200,
      maxWorkspaces: 100,
      maxMcpTokens: 200,
      advancedTools: true,
      swarmEnabled: true,
      prioritySupport: true,
      auditLogRetention: true,
      maxTeamMembers: 100,
      maxTokensPerTrial: 50000,
    },
    features: [
      "50 concurrent sessions",

      "Unlimited sessions",
      "200 agent iterations / session",
      "100 workspaces",
      "200 MCP tokens",
      "Swarm / multi-agent orchestration",
      "Priority support",
      "Up to 100 team members",
      "Custom integrations",
    ],
  },
};
