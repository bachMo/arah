export type Option = { value: string; label: string };

export type Taxonomy = {
  sectors: Option[];
  countries: Option[];
  org_types: Option[];
  opportunity_kinds: Option[];
  doc_types: Option[];
  profile_kinds: Option[];
  contract_types: Option[];
  experience_levels: Option[];
};

export type ProfileKind = "organization" | "candidate" | "recruiter";

export type PublicConfig = {
  app_name: string;
  environment: string;
  llm: { enabled: boolean; provider: string | null };
  google_enabled: boolean;
  whatsapp_enabled: boolean;
  demo_data: boolean;
  github_url: string;
  contact_email: string;
  donations: { paytech: boolean; wave: string | null; orange_money: string | null; monthly_goal_xof: number };
};

export type User = {
  id: string;
  email: string;
  full_name: string;
  is_verified: boolean;
  is_admin: boolean;
  has_password: boolean;
  has_profile: boolean;
  profile_kind: ProfileKind | null;
  created_at: string;
};

export type Profile = {
  organization_name: string;
  org_type: string;
  description: string;
  sectors: string[];
  skills: string[];
  countries: string[];
  keywords_include: string[];
  keywords_exclude: string[];
  certifications: string[];
  opportunity_kinds: string[];
  budget_min: number | null;
  budget_max: number | null;
  team_size: number | null;
  past_references: string;
  profile_kind: ProfileKind;
  job_title: string;
  contract_types: string[];
  experience_level: string | null;
  remote_ok: boolean;
  updated_at?: string | null;
};

export type ProfileSuggestion = Omit<Profile, "description" | "certifications" | "team_size" | "past_references"> & {
  method: string;
};

export type MatchStatus = "new" | "interested" | "preparing" | "submitted" | "ignored" | "won" | "lost";

export type Criterion = { label: string; met: boolean | null };

export type Match = {
  score: number;
  reasons: string[];
  criteria: Criterion[];
  risks: string[];
  method: string;
  status: MatchStatus;
  feedback: "relevant" | "not_relevant" | null;
  created_at: string;
};

export type Opportunity = {
  id: string;
  title: string;
  issuer: string;
  url: string;
  country: string | null;
  kind: string;
  sectors: string[];
  summary: string;
  budget_amount: number | null;
  budget_currency: string | null;
  budget_xof: number | null;
  published_at: string | null;
  deadline_at: string | null;
  is_demo: boolean;
  contract_type: string | null;
  experience_level: string | null;
  location: string;
  remote: boolean;
  source: { slug: string; name: string };
  match: Match | null;
};

export type OpportunityDetail = Opportunity & {
  description: string;
  documents_required: string[];
  eligibility: string[];
  keywords: string[];
  language: string;
  enrichment_method: string;
  apply_info: string;
  has_preparation: boolean;
};

export type JobSubmission = {
  id: string;
  status: "pending" | "approved" | "rejected";
  title: string;
  company: string;
  contract_type: string;
  experience_level: string | null;
  country: string;
  location: string;
  remote: boolean;
  sectors: string[];
  description: string;
  apply_url: string;
  apply_email: string;
  deadline_at: string | null;
  review_note: string;
  reviewed_at: string | null;
  opportunity_id: string | null;
  created_at: string;
  candidates: number;
};

export type Page<T> = { items: T[]; total: number; page: number; pages: number };

export type RadarSummary = {
  counts: Partial<Record<MatchStatus, number>>;
  active: number;
  deadlines_this_week: number;
  new_today: number;
  unseen: number;
  best_score: number;
};

export type TimelineItem = {
  id: string;
  title: string;
  issuer: string;
  deadline: string;
  days_left: number;
  prep_days: number;
  feasible: boolean;
  status: MatchStatus;
  score: number;
};

export type CheckItem = { id: string; label: string; done: boolean; category?: string | null; source?: string | null };
export type OutlineSection = { title: string; points: string[] };

export type Preparation = {
  id: string;
  opportunity_id: string;
  requirements: CheckItem[];
  checklist: CheckItem[];
  outline: OutlineSection[];
  letter: string;
  notes: string;
  source_document_name: string;
  method: string;
  validated_at: string | null;
  updated_at: string;
};

export type VaultDocument = {
  id: string;
  doc_type: string;
  label: string;
  reference: string;
  issued_on: string | null;
  expires_on: string | null;
  notes: string;
  updated_at: string;
};

export type AlertSettings = {
  alert_frequency: "daily" | "weekly" | "off";
  alert_min_score: number;
  alert_email: boolean;
  alert_whatsapp: boolean;
  reminders_enabled: boolean;
  whatsapp_number: string | null;
  full_name: string | null;
};

export type SectorStat = {
  value: string;
  label: string;
  count: number;
  recent: number;
  previous: number;
  trend: number;
  avg_budget_xof: number | null;
};

export type Observatory = {
  totals: { open: number; open_budget_xof: number; this_week: number; sources: number; users: number };
  by_sector: SectorStat[];
  monthly: { month: string; count: number }[];
  by_country: { value: string; label: string; count: number }[];
  top_issuers: { label: string; count: number }[];
  by_kind: { value: string; label: string; count: number }[];
  emerging_keywords: { label: string; count: number; growth: number }[];
};

export type Position =
  | { ready: false }
  | {
      ready: true;
      sector_offers: number;
      eligible_offers: number;
      share: number;
      avg_score: number;
      gaps: { label: string; kind: "document" | "competence"; offers: number; hint: string }[];
      radar: { label: string; demand: number; has: boolean }[];
    };

export type StarNode = {
  id: string;
  title: string;
  issuer: string;
  x: number;
  y: number;
  z: number;
  size: number;
  urgency: "high" | "medium" | "low" | "none";
  deadline: string | null;
  cluster: number;
  score: number | null;
  sector: string | null;
  kind: string;
};

export type ConstellationData = {
  nodes: StarNode[];
  clusters: { id: number; label: string; size: number; x: number; y: number; z: number }[];
  personal: boolean;
};

export type RunStep = { t: string; level: "info" | "warning" | "error"; agent: string; message: string };

export type AgentRun = {
  id: string;
  kind: string;
  trigger: string;
  status: "running" | "success" | "partial" | "failed";
  started_at: string;
  finished_at: string | null;
  stats: Record<string, number>;
  steps: RunStep[];
  tokens: number;
  cost_xof: number;
};

export type MonthTotals = { month?: string; costs_xof: number; llm_xof: number; donations_xof: number };

export type Transparency = {
  month: MonthTotals & { goal_xof: number; lines: { label: string; amount_xof: number }[] };
  history: (MonthTotals & { month: string })[];
  runs: AgentRun[];
  sources: {
    slug: string;
    name: string;
    kind: string;
    url: string;
    description: string;
    enabled: boolean;
    last_run_at: string | null;
    last_status: string;
    last_found: number;
  }[];
  donors: { name: string; amount_xof: number; message: string; date: string | null }[];
  llm_usage: { purpose: string; calls: number; tokens: number; cost_xof: number }[];
};
