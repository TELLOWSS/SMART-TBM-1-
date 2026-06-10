
export enum TeamCategory {
  FORMWORK = '형틀',
  REBAR = '철근',
  SYSTEM = '시스템',
  CONCRETE_SCAFFOLD = '콘크리트비계',
  FINISHING = '할석/미장/견출', 
  DIRECT = '직영',
  GANGFORM = '갱폼',
  ALFORM = '알폼',
  DISMANTLE = '해체정리'
}

export interface TeamOption {
  id: string;
  name: string;
  category: string; 
}

export interface SiteConfig {
  siteName: string;
  managerName: string;
  userApiKey: string | null; // Bring Your Own Key
  linkageTargetRate?: number;
}

export interface RiskAssessmentItem {
  risk: string;
  measure: string;
}

export interface SafetyGuideline {
  content: string;
  level: 'HIGH' | 'GENERAL'; // 상, 중/하
  category: string; // 공통, 철근, 형틀, 등등...
  actionNote?: string; // 즉시조치 메모
}

export interface MonthlyRiskAssessment {
  id: string;
  type?: 'INITIAL' | 'REGULAR' | 'MONTHLY'; // [NEW] Assessment Type
  month: string; // YYYY-MM
  fileName: string;
  priorities: SafetyGuideline[]; // Structured guidelines instead of strings
  createdAt: number;
}

// [NEW] Transparent Scoring Rubric
export interface ScoreRubric {
  logQuality: number; // 30 points max
  focus: number;      // 30 points max
  voice: number;      // 20 points max
  ppe: number;        // 20 points max
  deductions: string[]; // Reasons for lost points
}

// [UPDATED] Deep Insight Analysis Result
export interface TBMAnalysisResult {
  score: number; // 0 to 100
  evaluation: string; // Overall Summary
  
  // [NEW] 4-Point Specific Evaluations (Editable)
  evalLog: string;        // 일지 작성 평가
  evalAttendance: string; // 참석 및 호응도 평가
  evalFocus: string;      // 집중도 평가
  evalLeader: string;     // 주관자(팀장) 리딩 평가

  // [NEW] Analysis Source Indicator
  analysisSource: 'DOCUMENT' | 'VIDEO' | 'MANUAL';
  verificationStatus?: 'VERIFIED' | 'MANUAL';
  videoEvidence?: {
    visualObservations: string[];
    audioObservations: string[];
    limitations: string[];
    sourceDurationSec?: number;
    analyzedDurationSec?: number;
    playbackRate?: number;
  };

  // [NEW] Detailed Rubric for Transparency
  rubric: ScoreRubric;

  // [NEW] Feature: Smart Coaching (From PDF 'Reading to Leading')
  leaderCoaching: {
    actionItem: string; // Specific action to take (e.g., "Raise voice volume")
    rationale: string; // Why this matters
  };

  // Basic Metrics
  details: {
    participation: 'GOOD' | 'BAD' | 'MODERATE';
    voiceClarity: 'CLEAR' | 'MUFFLED' | 'NONE';
    ppeStatus: 'GOOD' | 'BAD';
    interaction: boolean; 
  };

  // [NEW] Feature 3: Worker Focus Check (Zone-based Heatmap Data)
  focusAnalysis: {
    overall: number; // 0-100 score
    distractedCount: number; // Number of distracted workers detected
    focusZones: {
      front: 'HIGH' | 'LOW';
      back: 'HIGH' | 'LOW';
      side: 'HIGH' | 'LOW';
    };
  };

  // [NEW] Feature 2: TBM Bias Analyst (Blind Spots)
  insight: {
    mentionedTopics: string[]; // Topics actually discussed
    missingTopics: string[]; // Critical topics missed (Blind Spots)
    suggestion: string; // Actionable coaching advice
  };

  feedback: string[]; // Specific feedback points
}

// [NEW] Interface for raw extracted data before saving as entry
export interface ExtractedTBMData {
  teamName: string;
  leaderName: string;
  attendeesCount: number;
  workDescription: string;
  riskFactors: RiskAssessmentItem[];
  safetyFeedback: string[];
  // [UPDATED] Added date detection support
  detectedDate?: string; // YYYY-MM-DD format extracted from document
  videoAnalysis?: TBMAnalysisResult; // Pass through analysis
}

export interface TBMEntry {
  id: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  teamId: string;
  teamName: string;
  teamIds?: string[];
  teamNames?: string[];
  leaderName: string;
  attendeesCount: number;
  workDescription: string;
  locationBuildingScope?: string; // 예: 101동, 전체동, 외곽구간
  locationArea?: string; // 예: 지하주차장, 외부계단, 옥상
  locationDetail?: string; // 예: B2 서측 램프 앞, 2호 외부계단 3~5층
  todayInstalledItems?: string; // 금일 설치한 사항
  managerRequiredInstallItems?: string; // 관리자가 추가 설치해야 할 항목
  riskFactors: RiskAssessmentItem[];
  safetyFeedback: string[]; // New: AI generated feedback (3-5 items)
  
  // Media Fields (Separated)
  tbmPhotoUrl?: string; // Main proof photo
  tbmVideoUrl?: string; // Video recording of TBM
  tbmVideoFileName?: string; // Filename of the uploaded video
  
  // New: AI Video Analysis
  videoAnalysis?: TBMAnalysisResult;

  // Legacy support fields (optional)
  mediaUrl?: string; 
  mediaType?: 'image' | 'video' | null;

  originalLogImageUrl?: string; // URL for the paper log photo or PDF preview
  originalLogMimeType?: string; // To distinguish PDF vs Image
  logPageNumber?: number; // 다중페이지 일지의 페이지 번호(1부터 시작)
  logPageGroupId?: string; // 같은 일지 묶음을 식별하는 그룹 ID
  linkedRiskAssessmentId?: string;
  linkedRiskAssessmentLabel?: string;
  linkedRiskAssessmentMatchedByMonth?: boolean;
  linkedRiskAssessmentHighCount?: number;
  linkedRiskAssessmentActionNoteCount?: number;
  createdAt: number;
  
  // [NEW] Digital Integrity Seal
  integrityHash?: string; // Simulated hash for legal defense
}

export interface WeatherData {
  temp: number;
  condition: string;
}

// Smart TBM Command Category (v1)
export type CommandPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type CommandStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'DONE' | 'DELAYED';
export type CommandDelayReason = 'MATERIAL' | 'MANPOWER' | 'WEATHER' | 'OTHER';

export interface CommandStatusHistoryItem {
  from: CommandStatus;
  to: CommandStatus;
  changedAt: number;
  note?: string;
}

export interface CommandBriefingItem {
  id: string;
  date: string; // YYYY-MM-DD
  riskTitle: string;
  impact: string;
  immediateAction: string;
  teamId?: string;
  teamName?: string;
  sourceEntryIds: string[];
  createdAt: number;
}

export interface CommandTask {
  id: string;
  date: string; // YYYY-MM-DD
  title: string;
  instruction: string;
  assigneeTeamId?: string;
  assigneeTeamName?: string;
  assigneeName?: string;
  dueAt?: string; // ISO datetime
  priority: CommandPriority;
  status: CommandStatus;
  rationale: string;
  kpi?: string;
  evidenceImageUrls?: string[];
  evidenceComment?: string;
  delayReason?: CommandDelayReason;
  delayComment?: string;
  statusHistory?: CommandStatusHistoryItem[];
  sourceAnalysisSnapshotId?: string;
  sourceEntryIds?: string[];
  createdAt: number;
  updatedAt: number;
}

export interface CommandDailyReport {
  date: string; // YYYY-MM-DD
  totalCommands: number;
  completedCommands: number;
  delayedCommands: number;
  completionRate: number; // 0-100
  delayRate: number; // 0-100
  topRisks: string[];
  summary: string;
}

export interface TeamNormalizationLog {
  id: string;
  actedAt: number;
  actor: string;
  sourceLabel: string;
  action: 'MAP_TO_EXISTING' | 'PROMOTE_AND_MAP';
  targetTeamId: string;
  targetTeamName: string;
  affectedCount: number;
}

export type TeamNormalizationRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type TeamNormalizationReasonCode = 'MISLABEL' | 'UNASSIGNED_CLEANUP' | 'DATA_QUALITY' | 'TEAM_REORG' | 'EXTERNAL_AUDIT' | 'OTHER';

export interface TeamNormalizationRequest {
  id: string;
  requestedAt: number;
  requestedBy: string;
  sourceLabel: string;
  action: 'MAP_TO_EXISTING' | 'PROMOTE_AND_MAP';
  targetTeamId?: string;
  targetTeamName?: string;
  status: TeamNormalizationRequestStatus;
  reviewReasonCode?: TeamNormalizationReasonCode;
  reviewComment?: string;
  reviewedAt?: number;
  reviewedBy?: string;
}

export interface LabSnapshot {
  id: string;
  label: string;
  savedAt: string;
  filter: {
    teamIds: string[];
    riskLabel: string | null;
    period: '7D' | '30D' | 'THIS_MONTH' | 'CUSTOM' | 'ALL';
    customStart: string;
    customEnd: string;
  };
  avgScore: number;
  totalEntries: number;
  totalPeople: number;
  topRisk: string;
}

export interface AppActivityLog {
  id: string;
  timestamp: number;
  message: string;
}