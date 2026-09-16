// Browser-safe shared definitions for the agent state machine.

export const AGENT_STATES = [
  "IDLE",
  "RECEIVE_JOB_URL",
  "RECEIVE_RESUME",
  "OPEN_JOB",
  "CHECK_LOGIN",
  "HANDLE_ACCOUNT",
  "HANDLE_VERIFICATION",
  "INSPECT_APPLICATION",
  "EXTRACT_FIELDS",
  "MAP_FIELDS",
  "FILL_FIELDS",
  "HANDLE_MISSING_INFORMATION",
  "UPLOAD_RESUME",
  "VALIDATE",
  "REVIEW",
  "USER_APPROVAL",
  "SUBMIT",
  "VERIFY_SUBMISSION",
  "SAVE_APPLICATION",
  "COMPLETED",
  "BLOCKED",
] as const;

export type AgentState = (typeof AGENT_STATES)[number];

export type StepStatus = "pending" | "running" | "done" | "waiting" | "skipped" | "failed";

export const STEP_PLAN: { state: AgentState; label: string }[] = [
  { state: "OPEN_JOB", label: "Opening job website" },
  { state: "CHECK_LOGIN", label: "Checking account" },
  { state: "INSPECT_APPLICATION", label: "Reading application" },
  { state: "EXTRACT_FIELDS", label: "Detecting fields" },
  { state: "MAP_FIELDS", label: "Matching fields to your details" },
  { state: "FILL_FIELDS", label: "Filling personal information" },
  { state: "HANDLE_MISSING_INFORMATION", label: "Completing screening questions" },
  { state: "HANDLE_VERIFICATION", label: "Human verification / OTP" },
  { state: "UPLOAD_RESUME", label: "Uploading resume" },
  { state: "VALIDATE", label: "Validating application" },
  { state: "REVIEW", label: "Final review" },
  { state: "SUBMIT", label: "Submit" },
  { state: "VERIFY_SUBMISSION", label: "Verifying submission" },
];

export const APPLICATION_STATUSES = [
  "in_progress",
  "needs_input",
  "waiting_for_worker",
  "mapping_fields",
  "ready_for_review",
  "submitted",
  "blocked",
  "failed",
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const STATUS_LABEL: Record<string, string> = {
  in_progress: "In progress",
  needs_input: "Needs your answer",
  waiting_for_worker: "Waiting for browser worker",
  mapping_fields: "Fields detected — ready to analyze",
  ready_for_review: "Ready for review",
  submitted: "Submitted",
  blocked: "Blocked by website",
  failed: "Failed",
};

export type FieldSource =
  | "account_profile"
  | "resume"
  | "saved_answer"
  | "user_answer"
  | "drafted"
  | "unavailable";

export const SOURCE_LABEL: Record<string, string> = {
  account_profile: "Account Profile",
  resume: "Resume",
  saved_answer: "Previously approved answer",
  user_answer: "Your answer",
  drafted: "Drafted from job + resume",
  unavailable: "Not available",
};

/** Personal / legal facts the agent must never infer or draft. */
export const NEVER_GUESS_KEYS = [
  "citizenship",
  "work_authorization",
  "sponsorship",
  "visa",
  "salary",
  "compensation",
  "disability",
  "veteran",
  "gender",
  "race",
  "ethnicity",
  "date_of_birth",
  "cgpa",
  "gpa",
  "percentage",
  "years_of_experience",
  "notice_period",
  "criminal",
  "background_check",
  "certification",
  "employment_history",
  "relocate",
];
