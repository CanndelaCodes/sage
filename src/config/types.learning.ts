export type LearningEventSource =
  | "sage_session"
  | "browser"
  | "app_focus"
  | "tool_usage"
  | "review_decision"
  | "skill_mutation";

export type LearningReviewTiming = "after-task" | "after-every-turn" | "idle-batch";

export type LearningReviewModelPolicy = "hybrid-local-first" | "current-best" | "local-only";

export type LearningConfig = {
  enabled?: boolean;
  sources?: {
    sageSessions?: boolean;
    browser?: {
      enabled?: boolean;
    };
    appFocus?: {
      enabled?: boolean;
    };
  };
  review?: {
    timing?: LearningReviewTiming;
    modelPolicy?: LearningReviewModelPolicy;
  };
  skills?: {
    autoApply?: boolean;
  };
  curator?: {
    enabled?: boolean;
    intervalHours?: number;
    minIdleHours?: number;
  };
};
