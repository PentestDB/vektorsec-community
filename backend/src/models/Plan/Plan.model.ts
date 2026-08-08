import mongoose from "mongoose";
const Schema = mongoose.Schema;

/**
 * Dynamic plan configuration stored in MongoDB.
 * Admins can create/edit/delete plans from the admin panel without code changes.
 */

export interface PlanLimits {
  /** Maximum number of concurrent active sessions. */
  maxConcurrentSessions: number;
  /** Maximum number of sessions per billing period (0 = unlimited). */
  maxSessionsPerPeriod: number;
  /** Maximum agent iterations per session. */
  maxAgentIterations: number;
  /** Maximum number of workspaces. */
  maxWorkspaces: number;
  /** Maximum number of MCP tokens. */
  maxMcpTokens: number;
  /** Whether advanced tools (burp, caido, vnc) are enabled. */
  advancedTools: boolean;
  /** Whether swarm / multi-agent orchestration is enabled. */
  swarmEnabled: boolean;
  /** Whether priority support is included. */
  prioritySupport: boolean;
  /** Whether audit log retention is enabled. */
  auditLogRetention: boolean;
  /** Maximum number of team members. */
  maxTeamMembers: number;
  /**
   * Maximum combined tokens per day (requests+responses) across all channels
   * (telegram / online / platform). 0 = unlimited.
   * Admins set this via the admin panel to protect against excessive API costs.
   */
  maxTokensPerDay: number;
  /**
   * Maximum API requests per day across all channels. 0 = unlimited.
   */
  maxRequestsPerDay: number;
  /**
   * Maximum cumulative tokens a user can use on a trial (no time expiry —
   * the trial ends when this cap is reached). 0 = unlimited.
   */
  maxTokensPerTrial: number;
}


/** Channel-based pricing for a single channel. */

export interface ChannelPricing {
  /** Monthly price in USD. 0 = free. */
  priceMonthly: number;
  /** Annual price in USD (per month equivalent). 0 = not offered. */
  priceAnnual: number;
  /** One-time lifetime price (platform channel). 0 = not offered. */
  priceLifetime: number;
  /** One-time enterprise price (platform channel). 0 = not offered. */
  priceEnterprise: number;
  /** Whether this channel is offered for this plan. */
  enabled: boolean;
}

/** Pricing per channel. Admins set these via the admin panel. */
export interface ChannelPricingMap {
  telegram?: ChannelPricing;
  online?: ChannelPricing;
  platform?: ChannelPricing;
}

export interface PlanDoc extends mongoose.Document {
  /** Unique plan id (e.g. "free", "pro", "team", "enterprise"). */
  planId: string;
  name: string;
  description: string;
  /** Monthly price in USD. 0 = free. (legacy / default channel) */
  priceMonthly: number;
  /** Annual price in USD (per month equivalent). 0 = not offered. */
  priceAnnual: number;
  /** Channel-based pricing (telegram / online / platform). */
  channelPricing: ChannelPricingMap;
  limits: PlanLimits;
  /** Feature flags surfaced to the frontend for UI gating. */
  features: string[];
  /** Whether this plan is active / purchasable. */
  enabled: boolean;
  /** Display order in the pricing page. */
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}


const PlanSchema = new Schema(
  {
    planId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    description: { type: String, default: "" },
    priceMonthly: { type: Number, default: 0 },
    priceAnnual: { type: Number, default: 0 },
    channelPricing: {
      type: {
        telegram: {
          type: {
            priceMonthly: { type: Number, default: 0 },
            priceAnnual: { type: Number, default: 0 },
            priceLifetime: { type: Number, default: 0 },
            priceEnterprise: { type: Number, default: 0 },
            enabled: { type: Boolean, default: false },
          },
          default: undefined,
        },
        online: {
          type: {
            priceMonthly: { type: Number, default: 0 },
            priceAnnual: { type: Number, default: 0 },
            priceLifetime: { type: Number, default: 0 },
            priceEnterprise: { type: Number, default: 0 },
            enabled: { type: Boolean, default: false },
          },
          default: undefined,
        },
        platform: {
          type: {
            priceMonthly: { type: Number, default: 0 },
            priceAnnual: { type: Number, default: 0 },
            priceLifetime: { type: Number, default: 0 },
            priceEnterprise: { type: Number, default: 0 },
            enabled: { type: Boolean, default: false },
          },
          default: undefined,
        },
      },
      default: undefined,
    },
    limits: {

      maxConcurrentSessions: { type: Number, default: 1 },
      maxSessionsPerPeriod: { type: Number, default: 10 },
      maxAgentIterations: { type: Number, default: 25 },
      maxWorkspaces: { type: Number, default: 1 },
      maxMcpTokens: { type: Number, default: 2 },
      advancedTools: { type: Boolean, default: false },
      swarmEnabled: { type: Boolean, default: false },
      prioritySupport: { type: Boolean, default: false },
      auditLogRetention: { type: Boolean, default: false },
      maxTeamMembers: { type: Number, default: 1 },
      maxTokensPerDay: { type: Number, default: 0 },
      maxRequestsPerDay: { type: Number, default: 0 },
      maxTokensPerTrial: { type: Number, default: 0 },
    },
    features: { type: [String], default: [] },

    enabled: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default mongoose.model<PlanDoc>("Plan", PlanSchema);
