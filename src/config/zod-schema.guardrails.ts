/**
 * Zod validation schema for guardrail configuration.
 */

import { z } from "zod";

const DangerCategorySchema = z.enum([
  "file_destruction",
  "system_modification",
  "network_exposure",
  "credential_access",
  "privilege_escalation",
  "data_exfiltration",
  "irreversible_change",
]);

const GuardrailActionBehaviorSchema = z.enum([
  "block",
  "confirm_detailed",
  "confirm_brief",
  "warn",
  "autonomous",
]);

const GuardrailCategoryOverrideSchema = z
  .object({
    behavior: GuardrailActionBehaviorSchema.optional(),
    neverAutonomous: z.boolean().optional(),
  })
  .strict();

const DecayConfigSchema = z
  .object({
    gracePeriodDays: z.number().int().min(0).max(365).optional(),
    dailyDecayRate: z.number().min(0).max(1).optional(),
    floorScore: z.number().min(0).max(1).optional(),
  })
  .strict()
  .optional();

const RateLimitsSchema = z
  .object({
    maxDailyIncrease: z.number().min(0).max(1).optional(),
    minApprovalIntervalSeconds: z.number().int().min(0).optional(),
    maxAutonomousPerHour: z.number().int().min(0).optional(),
  })
  .strict()
  .optional();

export const GuardrailsSchema = z
  .object({
    preset: z.enum(["conservative", "balanced", "max_autonomy", "custom"]).optional(),
    categories: z.record(DangerCategorySchema, GuardrailCategoryOverrideSchema).optional(),
    warnAutoApproveSeconds: z.number().min(0).max(30).optional(),
    adaptiveTrust: z.boolean().optional(),
    decay: DecayConfigSchema,
    rateLimits: RateLimitsSchema,
    hardBlockPatterns: z.array(z.string()).optional(),
    trustedPatterns: z.array(z.string()).optional(),
  })
  .strict()
  .optional();
