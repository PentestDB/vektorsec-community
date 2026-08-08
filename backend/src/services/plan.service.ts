import Plan, {
  ChannelPricingMap,
  PlanDoc,
  PlanLimits,
} from "../models/Plan/Plan.model";


/**
 * Plan service.
 *
 * Manages dynamic plan configurations stored in MongoDB. Admins can
 * create/edit/delete plans from the admin panel without code changes.
 */

/** Default plans seeded on first run so the system works out of the box. */
export const DEFAULT_PLANS = [
  {
    planId: "free",
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
      maxTokensPerDay: 10000,
      maxRequestsPerDay: 50,
      maxTokensPerTrial: 50000,
    },
    features: [
      "1 concurrent session",
      "10 sessions / month",
      "25 agent iterations / session",
      "1 workspace",
      "2 MCP tokens",
      "10,000 tokens / day",
    ],

    enabled: true,
    sortOrder: 0,
  },
  {
    planId: "pro",
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
      maxTokensPerDay: 50000,
      maxRequestsPerDay: 200,
    },
    features: [
      "3 concurrent sessions",
      "Unlimited sessions",
      "100 agent iterations / session",
      "5 workspaces",
      "10 MCP tokens",
      "Advanced tools (Burp, Caido, VNC)",
      "Audit log retention",
      "50,000 tokens / day",
    ],
    enabled: true,
    sortOrder: 1,
  },
  {
    planId: "team",
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
      maxTokensPerDay: 150000,
      maxRequestsPerDay: 500,
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
      "150,000 tokens / day",
    ],
    enabled: true,
    sortOrder: 2,
  },
  {
    planId: "enterprise",
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
      maxTokensPerDay: 500000,
      maxRequestsPerDay: 2000,
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
      "500,000 tokens / day",
    ],
    enabled: true,
    sortOrder: 3,
  },
];

/**
 * Seed default plans if the collection is empty.
 * Called once at server startup.
 */
export async function ensureDefaultPlans(): Promise<void> {
  const count = await Plan.countDocuments();
  if (count === 0) {
    await Plan.insertMany(DEFAULT_PLANS);
  }
}

/**
 * Get all plans (admin view, includes disabled).
 */
export async function listAllPlans(): Promise<PlanDoc[]> {
  return Plan.find().sort({ sortOrder: 1 });
}

/**
 * Get enabled plans (public, for pricing page / checkout).
 */
export async function listEnabledPlans(): Promise<PlanDoc[]> {
  return Plan.find({ enabled: true }).sort({ sortOrder: 1 });
}

/**
 * Get a single plan by planId.
 */
export async function getPlanById(planId: string): Promise<PlanDoc | null> {
  return Plan.findOne({ planId });
}

/**
 * Get a plan by planId, falling back to the "free" plan if not found.
 */
export async function getPlanOrFree(planId: string): Promise<PlanDoc> {
  const plan = await Plan.findOne({ planId });
  if (plan) return plan;
  const free = await Plan.findOne({ planId: "free" });
  if (free) return free;
  // Last resort: return a minimal free plan object.
  return {
    planId: "free",
    name: "Free",
    description: "",
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
      maxTokensPerDay: 10000,
      maxRequestsPerDay: 50,
      maxTokensPerTrial: 50000,
    },
    features: [],
    enabled: true,
    sortOrder: 0,
  } as unknown as PlanDoc;

}

/**
 * Check whether a planId exists in the DB.
 */
export async function isPlanId(planId: string): Promise<boolean> {
  const plan = await Plan.findOne({ planId });
  return !!plan;
}

/**
 * Create a new plan (admin only).
 */
export async function createPlan(data: {
  planId: string;
  name: string;
  description?: string;
  priceMonthly?: number;
  priceAnnual?: number;
  channelPricing?: ChannelPricingMap;
  limits?: Partial<PlanLimits>;
  features?: string[];
  enabled?: boolean;
  sortOrder?: number;
}): Promise<PlanDoc> {
  const existing = await Plan.findOne({ planId: data.planId });
  if (existing) {
    throw new Error(`Plan "${data.planId}" already exists`);
  }
  return Plan.create({
    planId: data.planId,
    name: data.name,
    description: data.description ?? "",
    priceMonthly: data.priceMonthly ?? 0,
    priceAnnual: data.priceAnnual ?? 0,
    channelPricing: data.channelPricing,
    limits: {

      maxConcurrentSessions: data.limits?.maxConcurrentSessions ?? 1,
      maxSessionsPerPeriod: data.limits?.maxSessionsPerPeriod ?? 10,
      maxAgentIterations: data.limits?.maxAgentIterations ?? 25,
      maxWorkspaces: data.limits?.maxWorkspaces ?? 1,
      maxMcpTokens: data.limits?.maxMcpTokens ?? 2,
      advancedTools: data.limits?.advancedTools ?? false,
      swarmEnabled: data.limits?.swarmEnabled ?? false,
      prioritySupport: data.limits?.prioritySupport ?? false,
      auditLogRetention: data.limits?.auditLogRetention ?? false,
      maxTeamMembers: data.limits?.maxTeamMembers ?? 1,
      maxTokensPerDay: data.limits?.maxTokensPerDay ?? 0,
      maxRequestsPerDay: data.limits?.maxRequestsPerDay ?? 0,
      maxTokensPerTrial: data.limits?.maxTokensPerTrial ?? 0,
    },
    features: data.features ?? [],

    enabled: data.enabled ?? true,
    sortOrder: data.sortOrder ?? 0,
  });
}

/**
 * Update an existing plan (admin only).
 */
export async function updatePlan(
  planId: string,
  data: {
    name?: string;
    description?: string;
    priceMonthly?: number;
    priceAnnual?: number;
    channelPricing?: ChannelPricingMap;
    limits?: Partial<PlanLimits>;
    features?: string[];
    enabled?: boolean;
    sortOrder?: number;
  }
): Promise<PlanDoc> {
  const plan = await Plan.findOne({ planId });
  if (!plan) {
    throw new Error(`Plan "${planId}" not found`);
  }

  if (data.name !== undefined) plan.name = data.name;
  if (data.description !== undefined) plan.description = data.description;
  if (data.priceMonthly !== undefined) plan.priceMonthly = data.priceMonthly;
  if (data.priceAnnual !== undefined) plan.priceAnnual = data.priceAnnual;
  if (data.channelPricing !== undefined) plan.channelPricing = data.channelPricing;
  if (data.enabled !== undefined) plan.enabled = data.enabled;
  if (data.sortOrder !== undefined) plan.sortOrder = data.sortOrder;
  if (data.features !== undefined) plan.features = data.features;


  if (data.limits) {
    if (data.limits.maxConcurrentSessions !== undefined)
      plan.limits.maxConcurrentSessions = data.limits.maxConcurrentSessions;
    if (data.limits.maxSessionsPerPeriod !== undefined)
      plan.limits.maxSessionsPerPeriod = data.limits.maxSessionsPerPeriod;
    if (data.limits.maxAgentIterations !== undefined)
      plan.limits.maxAgentIterations = data.limits.maxAgentIterations;
    if (data.limits.maxWorkspaces !== undefined)
      plan.limits.maxWorkspaces = data.limits.maxWorkspaces;
    if (data.limits.maxMcpTokens !== undefined)
      plan.limits.maxMcpTokens = data.limits.maxMcpTokens;
    if (data.limits.advancedTools !== undefined)
      plan.limits.advancedTools = data.limits.advancedTools;
    if (data.limits.swarmEnabled !== undefined)
      plan.limits.swarmEnabled = data.limits.swarmEnabled;
    if (data.limits.prioritySupport !== undefined)
      plan.limits.prioritySupport = data.limits.prioritySupport;
    if (data.limits.auditLogRetention !== undefined)
      plan.limits.auditLogRetention = data.limits.auditLogRetention;
    if (data.limits.maxTeamMembers !== undefined)
      plan.limits.maxTeamMembers = data.limits.maxTeamMembers;
    if (data.limits.maxTokensPerDay !== undefined)
      plan.limits.maxTokensPerDay = data.limits.maxTokensPerDay;
    if (data.limits.maxRequestsPerDay !== undefined)
      plan.limits.maxRequestsPerDay = data.limits.maxRequestsPerDay;
    if (data.limits.maxTokensPerTrial !== undefined)
      plan.limits.maxTokensPerTrial = data.limits.maxTokensPerTrial;
  }

  return plan.save();

}

/**
 * Delete a plan (admin only). Cannot delete the "free" plan.
 */
export async function deletePlan(planId: string): Promise<void> {
  if (planId === "free") {
    throw new Error("Cannot delete the free plan");
  }
  const result = await Plan.deleteOne({ planId });
  if (result.deletedCount === 0) {
    throw new Error(`Plan "${planId}" not found`);
  }
}
