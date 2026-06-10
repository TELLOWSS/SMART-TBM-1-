import { z } from 'zod';

export const MAX_BACKUP_FILE_SIZE = 50 * 1024 * 1024;
export const MAX_BACKUP_FILE_COUNT = 20;
export const KNOWN_BACKUP_KEYS = ['version', 'backupDate', 'scope', 'entries', 'assessments', 'teams', 'signatures', 'siteConfig', 'teamNormalizationLogs', 'teamNormalizationRequests', 'activityLogs', 'labSnapshots', 'commandTasks'] as const;

// ============================================
// Zod Schemas for Runtime Backup Validation
// ============================================

const RiskAssessmentItemSchema = z.object({
  risk: z.string().optional(),
  measure: z.string().optional(),
}).passthrough();

const SafetyGuidelineSchema = z.object({
  content: z.string().optional(),
  level: z.enum(['HIGH', 'GENERAL']).optional(),
  category: z.string().optional(),
  actionNote: z.string().optional(),
}).passthrough();

const MonthlyRiskAssessmentSchema = z.object({
  id: z.string().optional(),
  month: z.string(),
  fileName: z.string().optional(),
  priorities: z.array(SafetyGuidelineSchema).optional(),
  createdAt: z.number().optional(),
}).passthrough();

const TBMEntrySchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  date: z.string(),
  time: z.string().optional(),
  teamId: z.string().optional(),
  teamName: z.string().optional(),
  teamIds: z.array(z.string()).optional(),
  teamNames: z.array(z.string()).optional(),
  leaderName: z.string().optional(),
  attendeesCount: z.number().optional(),
  workDescription: z.string().optional(),
  locationBuildingScope: z.string().optional(),
  locationArea: z.string().optional(),
  locationDetail: z.string().optional(),
  todayInstalledItems: z.string().optional(),
  managerRequiredInstallItems: z.string().optional(),
  riskFactors: z.array(RiskAssessmentItemSchema).optional(),
  safetyFeedback: z.array(z.string()).optional(),
  tbmPhotoUrl: z.string().optional(),
  tbmVideoUrl: z.string().optional(),
  videoAnalysis: z.any().optional(),
}).passthrough();

const TeamOptionSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string().optional(),
}).passthrough();

const SiteConfigSchema = z.object({
  siteName: z.string().optional(),
  managerName: z.string().optional(),
  userApiKey: z.string().nullable().optional(),
  linkageTargetRate: z.number().min(0).max(100).optional(),
}).passthrough();

const SignaturesSchema = z.object({
  safety: z.string().nullable().optional(),
  site: z.string().nullable().optional(),
}).passthrough();

const TeamNormalizationLogSchema = z.object({
  id: z.string(),
  actedAt: z.number(),
  actor: z.string(),
  sourceLabel: z.string(),
  action: z.enum(['MAP_TO_EXISTING', 'PROMOTE_AND_MAP']),
  targetTeamId: z.string(),
  targetTeamName: z.string(),
  affectedCount: z.number(),
}).passthrough();

const TeamNormalizationRequestSchema = z.object({
  id: z.string(),
  requestedAt: z.number(),
  requestedBy: z.string(),
  sourceLabel: z.string(),
  action: z.enum(['MAP_TO_EXISTING', 'PROMOTE_AND_MAP']),
  targetTeamId: z.string().optional(),
  targetTeamName: z.string().optional(),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']),
  reviewReasonCode: z.enum(['MISLABEL', 'UNASSIGNED_CLEANUP', 'DATA_QUALITY', 'TEAM_REORG', 'EXTERNAL_AUDIT', 'OTHER']).optional(),
  reviewComment: z.string().optional(),
  reviewedAt: z.number().optional(),
  reviewedBy: z.string().optional(),
}).passthrough();

const AppActivityLogSchema = z.object({
  id: z.string(),
  timestamp: z.number(),
  message: z.string(),
}).passthrough();

const LabSnapshotSchema = z.object({
  id: z.string(),
  label: z.string(),
  savedAt: z.string(),
  filter: z.object({
    teamIds: z.array(z.string()).optional(),
    riskLabel: z.string().nullable().optional(),
    period: z.enum(['7D', '30D', 'THIS_MONTH', 'CUSTOM', 'ALL']).optional(),
    customStart: z.string().optional(),
    customEnd: z.string().optional(),
  }).passthrough().optional(),
  avgScore: z.number().optional(),
  totalEntries: z.number().optional(),
  totalPeople: z.number().optional(),
  topRisk: z.string().optional(),
}).passthrough();

const CommandStatusHistoryItemSchema = z.object({
  from: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'DONE', 'DELAYED']),
  to: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'DONE', 'DELAYED']),
  changedAt: z.number(),
  note: z.string().optional(),
}).passthrough();

const CommandTaskSchema = z.object({
  id: z.string(),
  date: z.string(),
  title: z.string(),
  instruction: z.string(),
  assigneeTeamId: z.string().optional(),
  assigneeTeamName: z.string().optional(),
  assigneeName: z.string().optional(),
  dueAt: z.string().optional(),
  priority: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']),
  status: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'DONE', 'DELAYED']),
  rationale: z.string(),
  kpi: z.string().optional(),
  evidenceImageUrls: z.array(z.string()).optional(),
  evidenceComment: z.string().optional(),
  delayReason: z.enum(['MATERIAL', 'MANPOWER', 'WEATHER', 'OTHER']).optional(),
  delayComment: z.string().optional(),
  statusHistory: z.array(CommandStatusHistoryItemSchema).optional(),
  sourceAnalysisSnapshotId: z.string().optional(),
  sourceEntryIds: z.array(z.string()).optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
}).passthrough();

/** Full typed backup payload schema */
export const BackupPayloadSchema = z.object({
  version: z.string().optional(),
  scope: z.enum(['ALL', 'TBM', 'RISK']).optional(),
  backupDate: z.string().optional(),
  entries: z.array(TBMEntrySchema).optional(),
  assessments: z.array(MonthlyRiskAssessmentSchema).optional(),
  teams: z.array(TeamOptionSchema).optional(),
  signatures: SignaturesSchema.optional(),
  siteConfig: SiteConfigSchema.optional(),
  teamNormalizationLogs: z.array(TeamNormalizationLogSchema).optional(),
  teamNormalizationRequests: z.array(TeamNormalizationRequestSchema).optional(),
  activityLogs: z.array(AppActivityLogSchema).optional(),
  labSnapshots: z.array(LabSnapshotSchema).optional(),
  commandTasks: z.array(CommandTaskSchema).optional(),
}).passthrough();

export type BackupPayload = z.infer<typeof BackupPayloadSchema>;

/**
 * Runtime-safe backup payload validation using Zod.
 * Returns the validated payload or null if it fails.
 */
export const validateBackupPayload = (payload: unknown): BackupPayload | null => {
  const result = BackupPayloadSchema.safeParse(payload);
  if (!result.success) {
    console.warn('[BackupValidation] Zod parse failed:', result.error.issues.slice(0, 5));
    return null;
  }
  return result.data;
};

// ============================================

const isPlainObject = (value: unknown): value is Record<string, any> => {
  return !!value && typeof value === 'object' && !Array.isArray(value);
};

const isLikelyTbmEntry = (value: unknown) => {
  if (!isPlainObject(value)) return false;
  return typeof value.date === 'string' || typeof value.workDescription === 'string' || typeof value.teamName === 'string';
};

const isLikelyRiskAssessment = (value: unknown) => {
  if (!isPlainObject(value)) return false;
  return typeof value.month === 'string' && Array.isArray(value.priorities);
};

const isLikelyTeamOption = (value: unknown) => {
  if (!isPlainObject(value)) return false;
  return typeof value.id === 'string' && typeof value.name === 'string';
};

const isSupportedArrayBackup = (value: unknown[]) => {
  if (value.length === 0) return false;
  return value.every(item => isLikelyTbmEntry(item) || isLikelyRiskAssessment(item) || isLikelyTeamOption(item));
};

export const hasSupportedBackupShape = (value: unknown) => {
  if (Array.isArray(value)) return isSupportedArrayBackup(value);
  if (!isPlainObject(value)) return false;
  if (KNOWN_BACKUP_KEYS.some(key => key in value)) return true;
  return Object.values(value).some(Array.isArray);
};

/** Count TBM entries, risk assessments, and teams in a backup payload */
export const summarizeBackupPayload = (payload: unknown) => {
  let totalTbm = 0;
  let totalRisk = 0;
  let totalTeam = 0;
  let hasData = false;

  const countItems = (items: unknown) => Array.isArray(items) ? items.length : 0;

  // Try strict Zod validation first
  const validated = validateBackupPayload(payload);
  if (validated) {
    if (Array.isArray(validated.entries) && validated.entries.length > 0) {
      totalTbm = validated.entries.length;
      hasData = true;
    }
    if (Array.isArray(validated.assessments) && validated.assessments.length > 0) {
      totalRisk = validated.assessments.length;
      hasData = true;
    }
    if (Array.isArray(validated.teams) && validated.teams.length > 0) {
      totalTeam = validated.teams.length;
      hasData = true;
    }
    // If validated but no known keys, try array heuristic
    if (!hasData && Array.isArray(payload)) {
      const arr = payload as any[];
      totalTbm = arr.filter(item => item?.workDescription || item?.date || item?.teamName).length;
      totalRisk = arr.filter(item => item?.month && item?.priorities).length;
      hasData = totalTbm > 0 || totalRisk > 0;
    }
    return { totalTbm, totalRisk, totalTeam, hasData };
  }

  // Fallback: heuristic scan for non-strict formats
  if (Array.isArray(payload)) {
    const tbmCount = (payload as any[]).filter(item => item?.workDescription || item?.date).length;
    const riskCount = (payload as any[]).filter(item => item?.month && item?.priorities).length;
    totalTbm = tbmCount;
    totalRisk = riskCount;
    hasData = tbmCount > 0 || riskCount > 0;
    return { totalTbm, totalRisk, totalTeam, hasData };
  }

  if (isPlainObject(payload)) {
    if (payload.entries) { totalTbm += countItems(payload.entries); hasData = true; }
    if (payload.assessments) { totalRisk += countItems(payload.assessments); hasData = true; }
    if (payload.teams) { totalTeam += countItems(payload.teams); hasData = true; }

    if (!hasData) {
      Object.keys(payload).forEach(key => {
        const arr = payload[key];
        if (!Array.isArray(arr) || arr.length === 0) return;
        const first = arr[0];
        if (first?.workDescription || first?.date) { totalTbm += arr.length; hasData = true; }
        else if (first?.month && first?.priorities) { totalRisk += arr.length; hasData = true; }
        else if (first?.category && first?.name) { totalTeam += arr.length; hasData = true; }
      });
    }
  }

  return { totalTbm, totalRisk, totalTeam, hasData };
};
