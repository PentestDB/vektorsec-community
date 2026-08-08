import { Request, Response } from "express";
import {
  createPlan,
  deletePlan,
  listAllPlans,
  listEnabledPlans,
  updatePlan,
} from "../services/plan.service";

/**
 * GET /api/plans
 * Public: list enabled plans for the pricing page / checkout.
 */
export async function getPublicPlans(req: Request, res: Response) {
  try {
    const plans = await listEnabledPlans();
    return res.status(200).json({ plans });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to load plans" });
  }
}

/**
 * GET /api/plans/admin
 * Admin: list all plans (including disabled).
 */
export async function getAdminPlans(req: Request, res: Response) {
  try {
    const plans = await listAllPlans();
    return res.status(200).json({ plans });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to load plans" });
  }
}

/**
 * POST /api/plans/admin
 * Admin: create a new plan.
 */
export async function createPlanHandler(req: Request, res: Response) {
  try {
    const { planId, name, description, priceMonthly, priceAnnual, channelPricing, limits, features, enabled, sortOrder } =
      req.body ?? {};

    if (!planId || !name) {
      return res.status(400).json({ message: "planId and name are required" });
    }

    const plan = await createPlan({
      planId: String(planId).trim().toLowerCase(),
      name: String(name),
      description: description ? String(description) : undefined,
      priceMonthly: typeof priceMonthly === "number" ? priceMonthly : undefined,
      priceAnnual: typeof priceAnnual === "number" ? priceAnnual : undefined,
      channelPricing,
      limits,
      features: Array.isArray(features) ? features.map(String) : undefined,
      enabled: typeof enabled === "boolean" ? enabled : undefined,
      sortOrder: typeof sortOrder === "number" ? sortOrder : undefined,
    });

    return res.status(201).json({ message: "Plan created", plan });
  } catch (error: any) {
    return res.status(400).json({ message: error?.message || "Failed to create plan" });
  }
}


/**
 * PUT /api/plans/admin/:planId
 * Admin: update an existing plan.
 */
export async function updatePlanHandler(req: Request, res: Response) {
  try {
    const { planId } = req.params;
    const { name, description, priceMonthly, priceAnnual, channelPricing, limits, features, enabled, sortOrder } =
      req.body ?? {};

    const plan = await updatePlan(planId, {
      name: name !== undefined ? String(name) : undefined,
      description: description !== undefined ? String(description) : undefined,
      priceMonthly: typeof priceMonthly === "number" ? priceMonthly : undefined,
      priceAnnual: typeof priceAnnual === "number" ? priceAnnual : undefined,
      channelPricing,
      limits,
      features: Array.isArray(features) ? features.map(String) : undefined,
      enabled: typeof enabled === "boolean" ? enabled : undefined,
      sortOrder: typeof sortOrder === "number" ? sortOrder : undefined,
    });


    return res.status(200).json({ message: "Plan updated", plan });
  } catch (error: any) {
    return res.status(400).json({ message: error?.message || "Failed to update plan" });
  }
}

/**
 * DELETE /api/plans/admin/:planId
 * Admin: delete a plan.
 */
export async function deletePlanHandler(req: Request, res: Response) {
  try {
    const { planId } = req.params;
    await deletePlan(planId);
    return res.status(200).json({ message: `Plan "${planId}" deleted` });
  } catch (error: any) {
    return res.status(400).json({ message: error?.message || "Failed to delete plan" });
  }
}
