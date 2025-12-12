
export enum TeamCategory {
  FORMWORK = '형틀',
  REBAR = '철근',
  SYSTEM = '시스템',
  CONCRETE_SCAFFOLD = '콘크리트비계',
  FINISHING = '할석/미장/견출', // New Category
  DIRECT = '직영',
}

export interface TeamOption {
  id: string;
  name: string;
  category: TeamCategory;
}

export interface RiskAssessmentItem {
  risk: string;
  measure: string;
}

export interface SafetyGuideline {
  content: string;
  level: 'HIGH' | 'GENERAL'; // 상, 중/하
  category: string; // 공통, 철근, 형틀, 등등...
}

export interface MonthlyRiskAssessment {
  id: string;
  month: string; // YYYY-MM
  fileName: string;
  priorities: SafetyGuideline[]; // Structured guidelines instead of strings
  createdAt: number;
}

// [UPDATED] Deep Insight Analysis Result
export interface TBMAnalysisResult {
  score: number; // 0 to 100
  evaluation: string; // One line summary
  
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

export interface TBMEntry {
  id: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  teamId: string;
  teamName: string;
  leaderName: string;
  attendeesCount: number;
  workDescription: string;
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
  createdAt: number;
}

export interface WeatherData {
  temp: number;
  condition: string;
}
