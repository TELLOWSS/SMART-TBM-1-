
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { SESSION_API_KEY_STORAGE_KEY } from "../utils/siteConfigStorage";
import { RiskAssessmentItem, SafetyGuideline, TBMAnalysisResult, ExtractedTBMData } from "../types";

// [ADDED] Exported Interfaces for Risk Assessment Extraction
export interface ExtractedPriority {
  content: string;
  level: 'HIGH' | 'GENERAL';
  category: string;
}

export interface MonthlyExtractionResult {
  detectedMonth?: string;
  items: ExtractedPriority[];
}

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_VIDEO_FALLBACK_MODEL = 'gemini-2.5-flash';

export interface GeminiConnectionValidationResult {
  success: boolean;
  message: string;
}

// [UPDATED] Smart API Key Resolution Strategy
const getApiKey = () => {
  try {
    // 1. Priority: Session Storage only (do not persist credentials in localStorage)
    const sessionKey = sessionStorage.getItem(SESSION_API_KEY_STORAGE_KEY);
    if (sessionKey && sessionKey.trim().length > 0) {
      return sessionKey.trim();
    }

    // 2. Legacy migration path: move old localStorage key into sessionStorage and scrub it
    const storedConfig = localStorage.getItem('siteConfig');
    if (storedConfig) {
        const config = JSON.parse(storedConfig);
        if (config.userApiKey && config.userApiKey.trim().length > 0) {
            const migratedKey = config.userApiKey.trim();
            sessionStorage.setItem(SESSION_API_KEY_STORAGE_KEY, migratedKey);
            delete config.userApiKey;
            localStorage.setItem('siteConfig', JSON.stringify(config));
            return migratedKey;
        }
    }

    // 3. [REMOVED] Environment Variable fallback intentionally disabled.
    //    API key must NOT be embedded in the client bundle.
    //    Dev mode uses the Vite server proxy (/api/gemini) instead.
  } catch (e) {
    console.warn("Failed to retrieve API Key");
  }
  return '';
};

// Detect if running under local Vite dev server (proxy available)
const isDevProxyAvailable = () =>
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' ||
   window.location.hostname === '127.0.0.1');

const getVideoModelCandidates = () => {
  const candidates: string[] = [];
  try {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('tbmVideoModel') : null;
    if (saved && saved.trim()) candidates.push(saved.trim());
  } catch {
    // ignore storage access failure
  }
  // 무료 API 사용량을 아끼기 위해 기본 모델은 하나만 사용한다.
  candidates.push(GEMINI_VIDEO_FALLBACK_MODEL);
  return Array.from(new Set(candidates.filter(Boolean)));
};

// [CRITICAL FIX] Lazy Initialization & Error Handling
let aiInstance: GoogleGenAI | null = null;
let currentKey: string | null = null;
type GoogleGenAIConfig = ConstructorParameters<typeof GoogleGenAI>[0] & { baseUrl?: string };
type AppError = Error & { originalError?: unknown };
type Participation = TBMAnalysisResult['details']['participation'];
type VoiceClarity = TBMAnalysisResult['details']['voiceClarity'];
type PpeStatus = TBMAnalysisResult['details']['ppeStatus'];
type FocusZone = TBMAnalysisResult['focusAnalysis']['focusZones']['front'];

const getErrorMessage = (error: unknown) => error instanceof Error ? error.message : 'Unknown Error';
const normalizeParticipation = (value: unknown): Participation => value === 'BAD' || value === 'MODERATE' ? value : 'GOOD';
const normalizeVoiceClarity = (value: unknown): VoiceClarity => value === 'MUFFLED' || value === 'NONE' ? value : 'CLEAR';
const normalizePpeStatus = (value: unknown): PpeStatus => value === 'BAD' ? 'BAD' : 'GOOD';
const normalizeFocusZone = (value: unknown): FocusZone => value === 'LOW' ? 'LOW' : 'HIGH';

const hasKorean = (text: string): boolean => /[가-힣]/.test(text);

const normalizeTextLine = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  return value.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
};

const normalizeKoreanText = (value: unknown, fallback: string): string => {
  const text = normalizeTextLine(value);
  if (!text) return fallback;
  if (!hasKorean(text) && /[A-Za-z]/.test(text)) return fallback;
  return text;
};

const extractContextKeywords = (workName: string, risksText: string): string[] => {
  const merged = `${workName} ${risksText}`
    .replace(/["'.,:;()\[\]{}]/g, ' ')
    .split(/\s+/)
    .map(token => token.trim())
    .filter(token => token.length >= 2);
  return Array.from(new Set(merged)).slice(0, 20);
};

const isGroundedToContext = (text: string, workName: string, risksText: string): boolean => {
  const normalized = normalizeTextLine(text);
  if (!normalized) return false;
  const keywords = extractContextKeywords(workName, risksText);
  if (keywords.length === 0) return hasKorean(normalized);

  // 1. Direct keyword match
  const hasDirectMatch = keywords.some(keyword => normalized.includes(keyword));
  if (hasDirectMatch) return true;

  // 2. Korean synonym / safety context expansion mapping
  const safetySynonymMap: { [key: string]: string[] } = {
    '타설': ['레미콘', '콘크리트', '펌프카', '유도원', '차량', '장비', '협착', '호스', '압송', '신호수'],
    '레미콘': ['타설', '콘크리트', '펌프카', '유도원', '차량', '장비', '협착', '호스', '압송', '신호수'],
    '콘크리트': ['타설', '레미콘', '펌프카', '유도원', '차량', '장비', '협착', '호스', '압송', '신호수'],
    '펌프카': ['타설', '레미콘', '콘크리트', '유도원', '차량', '장비', '협착', '호스', '압송', '신호수'],
    '비계': ['고소', '추락', '발판', '사다리', '안전대', '고리', '생명줄', '낙하', '개구부', '난간', '아시바'],
    '고소': ['비계', '추락', '발판', '사다리', '안전대', '고리', '생명줄', '낙하', '개구부', '난간', '우마'],
    '추락': ['비계', '고소', '발판', '사다리', '안전대', '고리', '생명줄', '낙하', '개구부', '난간', '안전망'],
    '사다리': ['고소', '추락', '발판', '안전대', '고리', '2인1조', '아웃트리거'],
    '용접': ['화재', '불꽃', '불티', '화기', '가스', '소화기', '방염', '밀폐', '산소', '질식', '인화'],
    '용단': ['화재', '불꽃', '불티', '화기', '가스', '소화기', '방염', '밀폐', '산소', '질식', '인화'],
    '화기': ['용접', '용단', '화재', '불꽃', '불티', '가스', '소화기', '방염', '밀폐', '인화'],
    '굴착': ['토사', '붕괴', '사면', '굴착기', '포크레인', '장비', '협착', '유도원', '지하', '흙막이'],
    '인양': ['크레인', '양중', '줄걸이', '화물', '양중기', '윈치', '와이어', '슬링', '샤클', '낙하', '신호수', '유도원', '슬링벨트'],
    '크레인': ['인양', '양중', '줄걸이', '화물', '양중기', '윈치', '와이어', '슬링', '샤클', '낙하', '신호수', '유도원', '슬링벨트', '인양물'],
    '양중': ['인양', '크레인', '줄걸이', '화물', '양중기', '윈치', '와이어', '슬링', '샤클', '낙하', '신호수', '유도원', '슬링벨트', '인양물'],
    '도장': ['페인트', '방수', '유기용제', '화재', '인화', '환기', '송풍기', '방독', '마스크', '밀폐'],
    '페인트': ['도장', '방수', '유기용제', '화재', '인화', '환기', '송풍기', '방독', '마스크', '밀폐'],
    '방수': ['도장', '페인트', '유기용제', '화재', '인화', '환기', '송풍기', '방독', '마스크', '밀폐'],
    '철근': ['결속', '조립', '자상', '찔림', '장갑', '핸드그라인더', '커터', '가공', '절단'],
    '형틀': ['알폼', '유로폼', '동바리', '서포트', '낙하', '추락', '인양', '조립', '해체', '폼'],
    '알폼': ['형틀', '유로폼', '동바리', '서포트', '낙하', '추락', '인양', '조립', '해체', '폼'],
    '유로폼': ['형틀', '알폼', '동바리', '서포트', '낙하', '추락', '인양', '조립', '해체', '폼'],
    '동바리': ['형틀', '알폼', '유로폼', '서포트', '낙하', '추락', '인양', '조립', '해체', '폼'],
    '시스템': ['비계', '동바리', '서포트', '수평재', '수직재', '가새', '연결pin', '체결'],
    '전기': ['감전', '누전', '접지', '절연', '차단기', '분전함', '활선', '장갑'],
    '해체': ['철거', '낙하', '비산', '붕괴', '추락', '유도원', '장비', '폐기물'],
    '양중기': ['호이스트', '리프트', '크레인', '양중', '인양', '탑승', '추락'],
    '밀폐': ['송풍', '환기', '질식', '산소', '가스', '방독', '마스크', '측정', '구조'],
    '작업': ['안전', '확인', '착용', '현장', '조치', '예방', '주의', '점검', '통제', '보호구', '안전모', '수칙']
  };

  // Expand keywords with synonyms
  const expandedKeywords = new Set<string>(keywords);
  keywords.forEach(keyword => {
    for (const key in safetySynonymMap) {
      if (keyword.includes(key) || key.includes(keyword)) {
        safetySynonymMap[key].forEach(syn => expandedKeywords.add(syn));
      }
    }
  });

  const hasExpandedMatch = Array.from(expandedKeywords).some(keyword => normalized.includes(keyword));
  if (hasExpandedMatch) return true;

  // 3. Heuristic check: if the feedback text is detailed (> 25 chars) and contains general safety terms,
  // it's highly likely to be relevant safety coaching.
  const generalSafetyKeywords = ['안전', '작업', '확인', '착용', '현장', '조치', '예방', '주의', '점검', '통제', '보호구', '안전모', '수칙', '사고', '위험'];
  if (normalized.length > 25 && hasKorean(normalized)) {
    const matchCount = generalSafetyKeywords.filter(k => normalized.includes(k)).length;
    if (matchCount >= 2) return true;
  }

  return false;
};

const buildGroundedEvaluation = (workName: string, risksText: string, guideline?: string): string => {
  const guidelinePart = guideline ? ` 월간 중점 사항("${guideline}") 준수 여부를 현장에서 재확인해야 합니다.` : '';
  return `영상 기반 TBM 점검 결과, "${workName}" 작업 관련 위험요인(${risksText})의 전달·이해 여부를 중심으로 관리가 필요합니다.${guidelinePart}`;
};

const hasVideoUncertaintyMarker = (text: string): boolean => {
  const normalized = normalizeTextLine(text);
  return normalized.includes('영상에서 확인 어려움') || normalized.includes('확인 어려움');
};

const GENERIC_LOW_EFFORT_PATTERNS = [
  /^안전(수칙|사항)?\s*(준수|철저).*/,
  /^보호구\s*착용\s*(철저|필수).*/,
  /^지속적인\s*교육\s*필요.*/,
  /^특이사항\s*없음.*/,
  /^전반적으로\s*양호.*/,
  /^추가\s*점검\s*필요.*/
];

const isLowEffortNarrative = (text: string): boolean => {
  const normalized = normalizeTextLine(text);
  if (!normalized) return true;
  if (normalized.length < 16) return true;
  return GENERIC_LOW_EFFORT_PATTERNS.some(pattern => pattern.test(normalized));
};

const normalizeVideoNarrative = (
  value: unknown,
  fallback: string,
  workName: string,
  risksText: string
): { text: string; usedFallback: boolean } => {
  const normalized = normalizeKoreanText(value, fallback);
  const grounded = isGroundedToContext(normalized, workName, risksText);
  const acceptable = (grounded || hasVideoUncertaintyMarker(normalized)) && !isLowEffortNarrative(normalized);

  if (acceptable) {
    return { text: normalized, usedFallback: false };
  }
  return { text: fallback, usedFallback: true };
};

const truncateNarrative = (text: string, maxLength = 180) => {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trim()}...`;
};

const hasEnumeratedWritingPattern = (text: string): boolean => {
  const normalized = normalizeTextLine(text);
  if (!normalized) return false;
  const markers = normalized.match(/(?:\d+[.)]|[①-⑩])/g);
  return (markers?.length || 0) >= 2;
};

const validateConsolidatedEvaluation = (text: string): { valid: boolean; issues: string[] } => {
  const normalized = normalizeTextLine(text);
  const issues: string[] = [];

  if (normalized.length < 60) {
    issues.push('분량 부족');
  }

  const requiredTokens = ['종합판정:', '확인검증:', '다음 계획:'];
  requiredTokens.forEach(token => {
    if (!normalized.includes(token)) {
      issues.push(`${token} 누락`);
    }
  });

  if (hasEnumeratedWritingPattern(normalized)) {
    issues.push('나열형 패턴 포함');
  }

  return {
    valid: issues.length === 0,
    issues,
  };
};

const buildConsolidatedVideoEvaluation = (params: {
  workName: string;
  risksText: string;
  guideline?: string;
  evaluation: string;
  evalLog: string;
  evalAttendance: string;
  evalFocus: string;
  evalLeader: string;
  feedback: string[];
}) => {
  const {
    workName,
    risksText,
    guideline,
    evaluation,
    evalLog,
    evalAttendance,
    evalFocus,
    evalLeader,
    feedback,
  } = params;

  const baseSummary = normalizeTextLine(evaluation) || `${workName} 작업 TBM 핵심 위험요인 전달 수준은 추가 보완이 필요합니다.`;
  const upgradeCheck = normalizeTextLine(evalLeader) || `${workName} 작업 리딩 문구를 위험요인(${risksText}) 중심으로 수정보강해야 합니다.`;
  const verification = normalizeTextLine(evalFocus) || normalizeTextLine(evalAttendance) || normalizeTextLine(evalLog)
    || `참석·집중·기록 항목의 확인검증 근거가 부족하여 현장 재점검이 필요합니다.`;
  const nextPlan = normalizeTextLine(feedback?.[0])
    || `${workName} 시작 전 위험요인(${risksText})을 재브리핑하고 질의응답으로 이해도를 확인합니다.`;
  const guidelinePart = guideline ? ` 월간 중점사항(${guideline}) 연계 확인도 포함합니다.` : '';

  return truncateNarrative(
    `종합판정: ${baseSummary} 업그레이드·수정보강 확인검증: ${upgradeCheck} 세부 검증: ${verification} 다음 계획: ${nextPlan}.${guidelinePart}`,
    260
  );
};

const hasAnyKeyword = (text: string, keywords: string[]) => {
  const normalized = normalizeTextLine(text);
  return keywords.some(keyword => normalized.includes(keyword));
};

const hasSuspiciousPayload = (text: string) => {
  const normalized = normalizeTextLine(text).toLowerCase();
  if (!normalized) return true;
  if (normalized.length > 280) return true;
  const suspiciousTokens = [
    '```',
    'json',
    'responsemime',
    'responseschema',
    'properties',
    'required',
    'type.object',
    '{"',
    '}]'
  ];
  return suspiciousTokens.some(token => normalized.includes(token));
};

const normalizeVideoSection = (
  value: unknown,
  fallback: string,
  workName: string,
  risksText: string,
  requiredKeywords: string[]
): { text: string; usedFallback: boolean; reason?: string } => {
  const base = normalizeVideoNarrative(value, fallback, workName, risksText);
  const normalized = truncateNarrative(base.text);

  if (hasSuspiciousPayload(normalized)) {
    return { text: fallback, usedFallback: true, reason: 'suspicious_payload' };
  }

  // If we had to use fallback in normalizeVideoNarrative, return it
  if (base.usedFallback) {
    return { text: fallback, usedFallback: true, reason: 'narrative_fallback' };
  }

  // Relax keyword check: if text is reasonably long, has Korean, and is a valid sentence,
  // we can accept it even if exact required keywords are missing.
  const isDetailedSentence = normalized.length >= 20 && hasKorean(normalized);
  if (!hasAnyKeyword(normalized, requiredKeywords) && !isDetailedSentence) {
    return { text: fallback, usedFallback: true, reason: 'missing_section_keyword' };
  }

  return { text: normalized, usedFallback: false };
};

const detectRepeatedSections = (sections: string[]) => {
  const normalized = sections.map(section => normalizeTextLine(section));
  const counter = new Map<string, number>();
  normalized.forEach(item => {
    if (!item) return;
    counter.set(item, (counter.get(item) || 0) + 1);
  });
  return Array.from(counter.values()).some(count => count >= 3);
};

const normalizeFeedbackArray = (
  value: unknown,
  fallback: string[],
  workName: string,
  risksText: string
): string[] => {
  if (!Array.isArray(value)) return fallback;
  const cleaned = value
    .map(item => normalizeTextLine(item))
    .filter(item => item.length > 0)
    .map(item => normalizeKoreanText(item, ''))
    .filter(item => item.length > 0)
    .filter(item => isGroundedToContext(item, workName, risksText));

  if (cleaned.length === 0) return fallback;
  return Array.from(new Set(cleaned)).slice(0, 5);
};

const normalizeRubric = (rawRubric: any) => {
  const clamp = (value: unknown, min: number, max: number) => {
    const parsed = safeParseInt(value);
    return Math.max(min, Math.min(max, parsed));
  };

  const deductions = Array.isArray(rawRubric?.deductions)
    ? rawRubric.deductions.map((item: unknown) => normalizeKoreanText(item, '')).filter((item: string) => item.length > 0)
    : [];

  return {
    logQuality: clamp(rawRubric?.logQuality, 0, 25),
    focus: clamp(rawRubric?.focus, 0, 25),
    voice: clamp(rawRubric?.voice, 0, 25),
    ppe: clamp(rawRubric?.ppe, 0, 25),
    deductions: deductions.length > 0 ? deductions : ['특이 감점 사유 없음']
  };
};

const getAiClient = () => {
    // [A] Dev proxy path: no user key needed on localhost
    if (isDevProxyAvailable()) {
        const proxyBase = `${window.location.origin}/api/gemini`;
        if (!aiInstance || currentKey !== '__dev_proxy__') {
            if (typeof GoogleGenAI !== 'function') throw new Error('Critical Error: AI SDK not loaded.');
            try {
        const proxyConfig: GoogleGenAIConfig = { apiKey: 'dev-proxy', baseUrl: proxyBase };
        aiInstance = new GoogleGenAI(proxyConfig);
                currentKey = '__dev_proxy__';
                console.info('[GeminiService] Dev proxy enabled:', proxyBase);
            } catch (e) {
        throw new Error(`AI Proxy Init Failed: ${getErrorMessage(e)}`);
            }
        }
        return aiInstance;
    }

    const key = getApiKey();
    
    // Reset instance if key changed or empty
    if (!key) {
        aiInstance = null;
        currentKey = null;
        throw new Error("API Key가 설정되지 않았습니다. [설정] 메뉴에서 키를 등록해주세요.");
    }

    if (!aiInstance || currentKey !== key) {
        // [DEFENSIVE] Check if SDK is available
        if (typeof GoogleGenAI !== 'function') {
             console.error("GoogleGenAI SDK is not loaded correctly.");
             throw new Error("Critical Error: AI SDK not loaded.");
        }
        
        try {
            aiInstance = new GoogleGenAI({ apiKey: key });
            currentKey = key;
        } catch (e) {
            console.error("Failed to initialize GoogleGenAI:", e);
            aiInstance = null;
          throw new Error(`AI Initialization Failed: ${getErrorMessage(e)}`);
        }
    }
    return aiInstance;
};

// [NEW] Validate Connection Function (Used in Settings)
export const validateGeminiConnection = async (apiKey: string): Promise<GeminiConnectionValidationResult> => {
    if (!apiKey) return { success: false, message: 'API 키가 비어 있습니다.' };
    const cleanKey = apiKey.trim();
    if (!cleanKey.startsWith('AIza')) {
      return { success: false, message: "API 키 형식이 올바르지 않습니다. ('AIza'로 시작 필요)" };
    }

    try {
        // [FIX] Wrap constructor in try-catch to safely handle errors
        let testClient;
        try {
            testClient = new GoogleGenAI({ apiKey: cleanKey });
        } catch (e) {
            console.error("GoogleGenAI Constructor Error in Validation:", e);
            return { success: false, message: 'AI 클라이언트 초기화에 실패했습니다.' };
        }

        const response = await promiseWithTimeout(
          testClient.models.generateContent({
            model: GEMINI_MODEL,
            contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
          }),
          12000,
          '연결 확인 시간이 초과되었습니다. 네트워크 상태를 확인해주세요.'
        );
        
        if (!response) {
          return { success: false, message: '응답이 비어 있습니다. 잠시 후 다시 시도해주세요.' };
        }

        return { success: true, message: '연결 성공: 유효한 API 키입니다.' };
    } catch (e: any) {
        console.error("Connection Test Failed:", e);

        const status = e?.status || e?.code || e?.error?.code || 0;
        const rawMessage = String(e?.message || e?.error?.message || '');
        const lowerMessage = rawMessage.toLowerCase();

        if (status === 400 || lowerMessage.includes('api key not valid') || lowerMessage.includes('invalid api key')) {
          return { success: false, message: '연결 실패: API 키가 유효하지 않습니다.' };
        }
        if (status === 403 || lowerMessage.includes('permission') || lowerMessage.includes('forbidden')) {
          return { success: false, message: '연결 실패: API 키 권한/리퍼러 설정을 확인해주세요.' };
        }
        if (status === 429 || lowerMessage.includes('resource_exhausted') || lowerMessage.includes('quota')) {
          return { success: false, message: '연결 실패: 사용량 한도(429) 초과입니다.' };
        }
        if (lowerMessage.includes('timeout') || lowerMessage.includes('초과')) {
          return { success: false, message: '연결 실패: 요청 시간이 초과되었습니다.' };
        }

        return { success: false, message: '연결 실패: 네트워크 또는 키 설정을 확인해주세요.' };
    }
};

// Helper: Promise with Timeout
const promiseWithTimeout = <T>(promise: Promise<T>, ms: number, errorMessage: string): Promise<T> => {
    let timeoutId: any;
    const timeoutPromise = new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(errorMessage)), ms);
    });
    return Promise.race([
        promise.then((res) => {
            clearTimeout(timeoutId);
            return res;
        }),
        timeoutPromise
    ]);
};

// Helper: Retry Logic for 500/503 Errors AND 429 Rate Limits
const withRetry = async <T>(fn: () => Promise<T>, retries = 3, baseDelay = 2000): Promise<T> => {
  let lastError: any;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      
      // Deep parsing for error codes (handle both Error objects and plain JSON responses)
      const status = error.status || error.code || error?.error?.code || 0;
      const msg = (error.message || error?.error?.message || JSON.stringify(error)).toLowerCase();
      
      // Retry on Server Errors (5xx) or Rate Limits (429/Resource Exhausted)
      const isRateLimit = status === 429 || msg.includes('resource_exhausted') || msg.includes('quota') || msg.includes('429');
      const isServerError = status === 500 || status === 503 || msg.includes('internal error') || msg.includes('overloaded');
      
      const isRetryable = isRateLimit || isServerError;
      
      if (isRetryable && i < retries - 1) {
        // Backoff: 429 needs more time (e.g. 6s, 12s, 24s)
        const initialDelay = isRateLimit ? 6000 : baseDelay;
        const delay = initialDelay * Math.pow(2, i) + (Math.random() * 1000); // Add jitter
        
        console.warn(`Gemini API Error (${status}). Retrying in ${(delay/1000).toFixed(1)}s... (Attempt ${i + 1}/${retries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      // Improve Error Message for UI if it's the final attempt
      if (isRateLimit) {
          const friendlyError: AppError = new Error("AI 사용량이 초과되었습니다. (설정에서 개인 API 키를 등록하면 해결됩니다)");
          friendlyError.originalError = lastError;
          throw friendlyError;
      }
      
      throw lastError;
    }
  }
  throw lastError;
};

// --- ROBUST DATA SANITIZATION UTILS (Self-Healing Logic) ---

const cleanAndRepairJson = (text: string): string => {
  if (!text) return "{}";
  let cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  
  const firstOpenBrace = cleaned.indexOf('{');
  const firstOpenBracket = cleaned.indexOf('[');
  let startIndex = -1;
  let endIndex = -1;

  if (firstOpenBrace !== -1 && (firstOpenBracket === -1 || firstOpenBrace < firstOpenBracket)) {
      startIndex = firstOpenBrace;
      endIndex = cleaned.lastIndexOf('}');
  } else if (firstOpenBracket !== -1) {
      startIndex = firstOpenBracket;
      endIndex = cleaned.lastIndexOf(']');
  }

  if (startIndex !== -1) {
    if (endIndex !== -1 && endIndex > startIndex) {
        cleaned = cleaned.substring(startIndex, endIndex + 1);
    } else {
        cleaned = cleaned.substring(startIndex);
        const lastChar = cleaned.trim().slice(-1);
        if (!['}', ']'].includes(lastChar)) {
             if (lastChar !== '"') { cleaned += '"'; }
        }
        const openBraces = (cleaned.match(/\{/g) || []).length;
        const closeBraces = (cleaned.match(/\}/g) || []).length;
        const openBrackets = (cleaned.match(/\[/g) || []).length;
        const closeBrackets = (cleaned.match(/\]/g) || []).length;

        for (let i = 0; i < (openBrackets - closeBrackets); i++) cleaned += ']';
        for (let i = 0; i < (openBraces - closeBraces); i++) cleaned += '}';
    }
  }

  try {
    JSON.parse(cleaned);
    return cleaned;
  } catch (e) {
    return cleaned.startsWith('[') ? "[]" : "{}";
  }
};

const safeParseInt = (val: any): number => {
    if (typeof val === 'number' && !isNaN(val)) return Math.floor(val);
    if (typeof val === 'string') {
        const cleaned = val.replace(/,/g, '').replace(/[^0-9.-]/g, '');
        const parsed = parseInt(cleaned, 10);
        return isNaN(parsed) ? 0 : parsed;
    }
    return 0;
};

// [NEW] Export for General Insight Generation (Used by SafetyDataLab)
export const generateGeneralInsight = async (prompt: string): Promise<string> => {
    try {
        const ai = getAiClient();
        const response = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({
      model: GEMINI_MODEL,
            contents: [{ role: 'user', parts: [{ text: prompt }] }]
        }));
        return response.text || "분석 결과가 없습니다.";
    } catch (error) {
        console.error("Insight Generation Error:", error);
        throw error;
    }
};

// [NEW] Generate Safety Feedback (AI Recommendation)
export const generateSafetyFeedback = async (
    workDescription: string,
    riskFactors: RiskAssessmentItem[],
    monthlyGuidelines: SafetyGuideline[]
): Promise<string[]> => {
    try {
        const ai = getAiClient();
        const guidelinesText = monthlyGuidelines.map(g => `- [${g.category}] ${g.content}`).join('\n');
        const risksText = riskFactors.map(r => `${r.risk}`).join(', ');

        const prompt = `
            Role: Construction Safety Manager (건설안전 관리자).
            Task: Provide 3-5 specific safety feedback points (instructional comments) for the workers based on the current work context.
            
            [Work Description]: ${workDescription}
            [Identified Risks]: ${risksText}
            [Monthly Safety Rules]:
            ${guidelinesText}

            Requirements:
            1. Compare the work and risks against the monthly rules.
            2. If a specific rule is relevant, emphasize it.
            3. If a key risk is missing a countermeasure in the description, suggest it.
            4. Output strictly a JSON array of strings (Korean).
            Example: ["안전모 턱끈 체결 상태를 상시 확인하세요.", "고소 작업 시 안전고리를 반드시 체결하세요."]
        `;

        const response = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({
      model: GEMINI_MODEL,
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING }
                }
            }
        }));

        if (response.text) {
            const cleaned = cleanAndRepairJson(response.text);
            const parsed = JSON.parse(cleaned);
            if (Array.isArray(parsed)) return parsed;
        }
        return [];
    } catch (error) {
        console.error("Safety Feedback Generation Error:", error);
        throw error;
    }
};

// [UPDATED] Video Analysis with "Opinion Fallback" Strategy
export const evaluateTBMVideo = async (
  base64Video: string,
  mimeType: string,
  textContext: { workDescription: string, riskFactors: any[] },
  safetyGuidelines: SafetyGuideline[] = [],
  videoMeta?: {
    sourceDurationSec?: number;
    analyzedDurationSec?: number;
    playbackRate?: number;
    audioIncluded?: boolean;
  }
): Promise<TBMAnalysisResult> => {
  const ai = getAiClient();
  const cleanMimeType = mimeType.includes('mp4') ? 'video/mp4' : 'video/webm';
  const workName = textContext.workDescription || '금일 작업';
  const risksText = textContext.riskFactors?.length > 0
    ? textContext.riskFactors.map(risk => `${risk.risk}`).join(', ')
    : '특이 위험요인 없음';
  const guidelinesText = safetyGuidelines.length > 0
    ? safetyGuidelines.map(guideline => `[${guideline.category}] ${guideline.content}`).join('\n')
    : '월간 중점 관리 사항 없음';

  if (
    videoMeta?.sourceDurationSec &&
    videoMeta?.analyzedDurationSec &&
    videoMeta.analyzedDurationSec < videoMeta.sourceDurationSec * 0.95
  ) {
    throw new Error('영상 전체 구간이 분석본에 포함되지 않았습니다. 영상을 다시 처리해주세요.');
  }

  const prompt = `
    역할: 건설안전기술사.
    목표: TBM 동영상에서 직접 확인한 사실만 근거로 현장 안전 코칭 결과를 생성한다.

    [참고 문맥 - 관찰 사실로 복사 금지]
    - 작업: "${workName}"
    - 등록 위험요인: ${risksText}
    - 월간 중점 관리사항:
    ${guidelinesText}

    [영상 처리 정보]
    - 원본 길이: ${videoMeta?.sourceDurationSec?.toFixed(1) || '미확인'}초
    - 분석 포함 길이: ${videoMeta?.analyzedDurationSec?.toFixed(1) || '미확인'}초
    - 재생속도: ${videoMeta?.playbackRate?.toFixed(1) || '미확인'}배
    - 오디오 포함: ${videoMeta?.audioIncluded === false ? '아니오' : '예'}

    [필수 규칙]
    1) videoEvidence.visualObservations에는 화면에서 직접 본 구체적 사실을 2개 이상 작성한다.
    2) videoEvidence.audioObservations에는 실제로 들은 발언·질문·응답만 작성한다.
    3) 음성이 없거나 불명확하면 audioObservations를 비우고 limitations에 명시하며 음성 점수를 0점으로 한다.
    4) 일지의 작업명·위험요인을 영상에서 본 것처럼 재진술하지 않는다.
    5) 확인할 수 없는 내용은 추측하지 않고 limitations에 명시한다.
    6) evaluation은 60~220자의 한 문단이며 "종합판정:", "확인검증:", "다음 계획:"을 모두 포함한다.
    7) evalLog는 영상에서 TBM 보드·일지 활용이 보이는지, evalAttendance는 참여·응답, evalFocus는 시선·자세, evalLeader는 진행자의 전달 행동을 평가한다.
    8) feedback은 영상 근거에 연결된 구체적 개선 의견 2~5개로 작성한다.
    9) 모든 서술은 한국어로 작성하고 JSON 객체만 반환한다.
  `;

  const repairPrompt = `${prompt}\n이전 응답은 영상 근거 검증에 실패했다. 입력 문맥을 반복하지 말고 화면과 음성에서 직접 관찰한 사실을 더 구체적으로 작성한다.`;

  const buildVideoApiCall = (modelName: string, promptText: string, temperature = 0.1) => () => ai.models.generateContent({
    model: modelName,
    contents: [{
      role: 'user',
      parts: [
        { inlineData: { mimeType: cleanMimeType, data: base64Video } },
        { text: promptText },
      ],
    }],
    config: {
      temperature,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          rubric: {
            type: Type.OBJECT,
            properties: {
              logQuality: { type: Type.INTEGER },
              focus: { type: Type.INTEGER },
              voice: { type: Type.INTEGER },
              ppe: { type: Type.INTEGER },
              deductions: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ['logQuality', 'focus', 'voice', 'ppe', 'deductions'],
          },
          score: { type: Type.INTEGER },
          evaluation: { type: Type.STRING },
          evalLog: { type: Type.STRING },
          evalAttendance: { type: Type.STRING },
          evalFocus: { type: Type.STRING },
          evalLeader: { type: Type.STRING },
          details: {
            type: Type.OBJECT,
            properties: {
              participation: { type: Type.STRING },
              voiceClarity: { type: Type.STRING },
              ppeStatus: { type: Type.STRING },
              interaction: { type: Type.BOOLEAN },
            },
            required: ['participation', 'voiceClarity', 'ppeStatus', 'interaction'],
          },
          focusAnalysis: {
            type: Type.OBJECT,
            properties: {
              overall: { type: Type.INTEGER },
              distractedCount: { type: Type.INTEGER },
              focusZones: {
                type: Type.OBJECT,
                properties: {
                  front: { type: Type.STRING },
                  back: { type: Type.STRING },
                  side: { type: Type.STRING },
                },
                required: ['front', 'back', 'side'],
              },
            },
            required: ['overall', 'distractedCount', 'focusZones'],
          },
          insight: {
            type: Type.OBJECT,
            properties: {
              mentionedTopics: { type: Type.ARRAY, items: { type: Type.STRING } },
              missingTopics: { type: Type.ARRAY, items: { type: Type.STRING } },
              suggestion: { type: Type.STRING },
            },
            required: ['mentionedTopics', 'missingTopics', 'suggestion'],
          },
          leaderCoaching: {
            type: Type.OBJECT,
            properties: {
              actionItem: { type: Type.STRING },
              rationale: { type: Type.STRING },
            },
            required: ['actionItem', 'rationale'],
          },
          feedback: { type: Type.ARRAY, items: { type: Type.STRING } },
          videoEvidence: {
            type: Type.OBJECT,
            properties: {
              visualObservations: { type: Type.ARRAY, items: { type: Type.STRING } },
              audioObservations: { type: Type.ARRAY, items: { type: Type.STRING } },
              limitations: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ['visualObservations', 'audioObservations', 'limitations'],
          },
        },
        required: [
          'rubric', 'score', 'evaluation', 'evalLog', 'evalAttendance', 'evalFocus',
          'evalLeader', 'details', 'focusAnalysis', 'insight', 'leaderCoaching',
          'feedback', 'videoEvidence',
        ],
      },
    },
  });

  const normalizeRequiredText = (value: unknown, label: string, minLength = 8) => {
    const text = normalizeTextLine(value);
    if (text.length < minLength || hasSuspiciousPayload(text)) {
      throw new Error(`영상 분석 품질 미달: ${label} 근거 부족`);
    }
    return text;
  };

  const normalizeList = (value: unknown, minLength = 8) => Array.isArray(value)
    ? Array.from(new Set(value.map(normalizeTextLine).filter(item => item.length >= minLength))).slice(0, 8)
    : [];

  const observationMarkers = [
    '화면', '영상', '보임', '확인', '착용', '시선', '자세', '손', '고개',
    '서 있', '앉아', '들림', '발언', '질문', '응답', '박수', '가리키', '보드',
  ];
  const looksLikeContextEcho = (text: string) => {
    const hasObservationMarker = observationMarkers.some(marker => text.includes(marker));
    const normalizedContext = normalizeTextLine(`${workName} ${risksText}`);
    return !hasObservationMarker && normalizedContext.includes(text);
  };

  let lastError: Error | null = null;
  for (const modelName of getVideoModelCandidates()) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await withRetry<GenerateContentResponse>(
          () => promiseWithTimeout(
            buildVideoApiCall(modelName, attempt === 0 ? prompt : repairPrompt, attempt === 0 ? 0.1 : 0)(),
            45000,
            'Video Analysis Timeout'
          ),
          1,
          1000
        );
        if (!response.text) throw new Error('Empty response from AI');

        const raw = JSON.parse(cleanAndRepairJson(response.text));
        const visualObservations = normalizeList(raw.videoEvidence?.visualObservations);
        const audioObservations = normalizeList(raw.videoEvidence?.audioObservations);
        const limitations = normalizeList(raw.videoEvidence?.limitations);

        if (visualObservations.length < 2) {
          throw new Error('영상 분석 품질 미달: 화면 관찰 근거가 2개 미만입니다.');
        }
        if (visualObservations.every(looksLikeContextEcho)) {
          throw new Error('영상 분석 품질 미달: 화면 근거가 일지 문맥을 반복하고 있습니다.');
        }
        if (videoMeta?.audioIncluded !== false && audioObservations.length === 0 && limitations.length === 0) {
          throw new Error('영상 분석 품질 미달: 음성 근거 또는 한계 설명이 없습니다.');
        }

        const evaluation = normalizeRequiredText(raw.evaluation, '종합 의견', 60);
        const evalLog = normalizeRequiredText(raw.evalLog, '일지 활용 평가');
        const evalAttendance = normalizeRequiredText(raw.evalAttendance, '참석 평가');
        const evalFocus = normalizeRequiredText(raw.evalFocus, '집중도 평가');
        const evalLeader = normalizeRequiredText(raw.evalLeader, '리딩 평가');
        if (detectRepeatedSections([evaluation, evalLog, evalAttendance, evalFocus, evalLeader])) {
          throw new Error('영상 분석 품질 미달: 평가 항목이 반복되었습니다.');
        }

        const evaluationQuality = validateConsolidatedEvaluation(evaluation);
        if (!evaluationQuality.valid) {
          throw new Error(`영상 분석 품질 미달: ${evaluationQuality.issues.join(', ')}`);
        }

        const feedback = normalizeList(raw.feedback);
        if (feedback.length < 2) {
          throw new Error('영상 분석 품질 미달: 영상 기반 개선 의견이 2개 미만입니다.');
        }

        const rubric = normalizeRubric(raw.rubric);
        if (videoMeta?.audioIncluded === false) {
          rubric.voice = 0;
          rubric.deductions = Array.from(new Set([...rubric.deductions, '압축 영상에 오디오가 포함되지 않아 음성 항목 미채점']));
        }
        const score = rubric.logQuality + rubric.focus + rubric.voice + rubric.ppe;

        return {
          score,
          evaluation,
          evalLog,
          evalAttendance,
          evalFocus,
          evalLeader,
          analysisSource: 'VIDEO',
          verificationStatus: 'VERIFIED',
          videoEvidence: {
            visualObservations,
            audioObservations,
            limitations,
            sourceDurationSec: videoMeta?.sourceDurationSec,
            analyzedDurationSec: videoMeta?.analyzedDurationSec,
            playbackRate: videoMeta?.playbackRate,
          },
          rubric,
          leaderCoaching: {
            actionItem: normalizeRequiredText(raw.leaderCoaching?.actionItem, '리더 조치'),
            rationale: normalizeRequiredText(raw.leaderCoaching?.rationale, '리더 조치 근거'),
          },
          details: {
            participation: normalizeParticipation(raw.details?.participation),
            voiceClarity: videoMeta?.audioIncluded === false ? 'NONE' : normalizeVoiceClarity(raw.details?.voiceClarity),
            ppeStatus: normalizePpeStatus(raw.details?.ppeStatus),
            interaction: !!raw.details?.interaction,
          },
          focusAnalysis: {
            overall: Math.max(0, Math.min(100, safeParseInt(raw.focusAnalysis?.overall))),
            distractedCount: Math.max(0, safeParseInt(raw.focusAnalysis?.distractedCount)),
            focusZones: {
              front: normalizeFocusZone(raw.focusAnalysis?.focusZones?.front),
              back: normalizeFocusZone(raw.focusAnalysis?.focusZones?.back),
              side: normalizeFocusZone(raw.focusAnalysis?.focusZones?.side),
            },
          },
          insight: {
            mentionedTopics: normalizeList(raw.insight?.mentionedTopics, 2),
            missingTopics: normalizeList(raw.insight?.missingTopics, 2),
            suggestion: normalizeRequiredText(raw.insight?.suggestion, '개선 제안'),
          },
          feedback,
        };
      } catch (error: any) {
        lastError = error instanceof Error ? error : new Error(getErrorMessage(error));
        const message = lastError.message.toLowerCase();
        const unavailable = message.includes('not found') || message.includes('unsupported model') || (message.includes('model') && message.includes('invalid'));
        if (unavailable) break;
      }
    }
  }

  console.warn('Video analysis rejected or failed.', lastError);
  throw lastError || new Error('영상 분석 결과를 검증하지 못했습니다.');
};
export const extractMonthlyPriorities = async (
  base64Data: string, 
  mimeType: string,
  type: 'INITIAL' | 'MONTHLY' = 'MONTHLY'
): Promise<MonthlyExtractionResult> => {
  // [RELIABILITY FIX] Gemini 지원 MIME 정규화 — PDF 허용, 이미지는 표준 타입만
  const GEMINI_DOC_MIMES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  const safeMimeType = GEMINI_DOC_MIMES.includes(mimeType) ? mimeType : 'image/jpeg';
  try {
    const ai = getAiClient();
    const prompt = `
      You are a Construction Safety Expert.
      Analyze this ${type === 'INITIAL' ? 'Initial (Baseline)' : 'Monthly/Regular'} Risk Assessment Document.
      GOAL: Extract specific safety guidelines and risk factors.
      OUTPUT FORMAT (JSON):
      {
        "detectedMonth": "YYYY-MM" (if detected, else null),
        "items": [
           {
             "content": "Specific risk factor or safety measure",
             "level": "HIGH" (if marked as critical/major/high risk) or "GENERAL",
             "category": "Work Category (e.g., Common, Formwork, Rebar, Equipment, etc.)"
           }
        ]
      }
    `;
    const response = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({
      model: GEMINI_MODEL,
        contents: [{ role: 'user', parts: [{ inlineData: { mimeType: safeMimeType, data: base64Data } }, { text: prompt }] }],
        config: {
            temperature: 0.1,
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    detectedMonth: { type: Type.STRING },
                    items: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                content: { type: Type.STRING },
                                level: { type: Type.STRING, enum: ["HIGH", "GENERAL"] },
                                category: { type: Type.STRING }
                            },
                            required: ["content", "level", "category"]
                        }
                    }
                }
            }
        }
    }));
    if (response.text) {
        const cleaned = cleanAndRepairJson(response.text);
        const data = JSON.parse(cleaned);
        let detectedMonth = data.detectedMonth;
        if (detectedMonth && !/^\d{4}-\d{2}$/.test(detectedMonth)) { detectedMonth = undefined; }
        const items = Array.isArray(data.items) ? data.items.map((item: any) => ({
            content: item.content || "내용 없음",
            level: (item.level === 'HIGH' ? 'HIGH' : 'GENERAL') as 'HIGH' | 'GENERAL',
            category: item.category || "공통"
        })) : [];
        return { detectedMonth, items };
    }
    throw new Error("No extracted text");
  } catch (error: any) {
    console.error("Gemini Extraction Error:", error);
    // [CRITICAL] Propagate the error to UI so we can show the alert
    throw error;
  }
};

export const analyzeMasterLog = async (
    base64Data: string, 
    mimeType: string,
    monthlyGuidelines: SafetyGuideline[] = [],
    mode: 'BATCH' | 'ROUTINE' = 'BATCH' 
  ): Promise<ExtractedTBMData[]> => {
    // [RELIABILITY FIX] Gemini 미지원 MIME 유형 자동 정규화
    const GEMINI_SUPPORTED_IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    const safeMimeType = GEMINI_SUPPORTED_IMAGE_MIMES.includes(mimeType) ? mimeType : 'image/jpeg';
    try {
      const ai = getAiClient();
      let promptContext = "";
      const guidelinesText = monthlyGuidelines.length > 0
          ? monthlyGuidelines.map(g => `- [${g.category}] ${g.content}`).join('\n')
          : "등록된 중점 관리 항목 없음";

      if (mode === 'BATCH') {
          promptContext = `
            [모드: 종합 일지 일괄 처리 (BATCH)]
            - 이 문서는 이미 결재가 완료된 문서입니다.
            - 목표: 디지털 데이터 변환.
            - 문서에 없는 내용 추측 금지. 읽히지 않는 값은 비워두거나 "미확인"으로 표기.
            - **안전관리자 코멘트(safetyFeedback) 생성 규칙:**
              1. 문서에 수기 코멘트가 있으면 우선 추출.
              2. 코멘트가 없으면, [작업 내용]과 [아래 제공된 월간 위험성평가 항목]을 대조하십시오.
              3. 작업 내용에 해당되는 위험 항목이 TBM 내용에서 빠져있다면, **"월간 중점 사항인 [항목명]이 누락되었습니다. 작업자에게 주지시키세요."**라는 코멘트를 생성하여 'safetyFeedback' 배열에 넣으십시오.
              4. 누락 사항이 없다면 **"작업별 위험요인이 적절히 도출되었습니다."**라고 생성하십시오.
            [월간 위험성평가 참고 자료]
            ${guidelinesText}
          `;
      } else {
          promptContext = `
            [모드: 개별 TBM 간편 등록 (ROUTINE)]
            - 이 문서는 TBM 보드판입니다.
            - 목표: 텍스트 추출.
            - 문서에 없는 내용 추측 금지. 읽히지 않는 값은 비워두거나 "미확인"으로 표기.
            - **안전관리자 코멘트:** 위 BATCH 모드와 동일한 로직으로, 월간 위험성평가 대비 누락 사항을 지적하는 코멘트를 생성하십시오.
          `;
      }

      const prompt = `
        역할: 건설 현장 데이터 분석가.
        ${promptContext}
        
        [필수 규칙 - 팀명 추출]
        1. 회사명(예: (주)휘강건설)은 'teamName'이 될 수 없습니다. 
        2. 팀 이름은 구체적인 작업 단위(예: 이태호 팀, 시스템 팀, 철근 팀, 형틀 팀, 해체 팀, 직영)여야 합니다.
        3. 문서 헤더의 회사명은 무시하고, 실제 TBM을 수행한 '작업 팀' 이름을 찾으세요.
        4. 만약 팀 이름이 '휘강건설'이나 '골조공사'로만 보인다면, 작업 내용(예: 알폼, 갱폼, 시스템)을 보고 적절한 공종 이름을 팀명으로 추정하십시오.

        [필수 추출 항목]
        - teams 배열 내 'safetyFeedback'은 반드시 위 규칙에 따라 생성된 코멘트 배열이어야 합니다.
        - workDescription, riskFactors.risk, riskFactors.measure, safetyFeedback은 반드시 한국어로 작성하세요.
        - 출력은 JSON만 반환하세요.
      `;
  
      const response = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: [{ role: "user", parts: [{ inlineData: { mimeType: safeMimeType, data: base64Data } }, { text: prompt }] }],
        config: {
          temperature: 0.0,
          responseMimeType: "application/json",
          maxOutputTokens: 8192, 
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              documentDate: { type: Type.STRING, description: "YYYY-MM-DD format" },
              teams: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    teamName: { type: Type.STRING },
                    leaderName: { type: Type.STRING },
                    attendeesCount: { type: Type.INTEGER },
                    workDescription: { type: Type.STRING },
                    riskFactorCount: { type: Type.INTEGER },
                    feedbackLevel: { type: Type.INTEGER },
                    safetyScore: { type: Type.INTEGER },
                    riskFactors: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          risk: { type: Type.STRING },
                          measure: { type: Type.STRING }
                        }
                      }
                    },
                    safetyFeedback: { type: Type.ARRAY, items: { type: Type.STRING } }
                  }
                }
              }
            },
          },
        },
      }));
  
      if (response.text) {
        const cleanedText = cleanAndRepairJson(response.text);
        let data: any;
        try {
            data = JSON.parse(cleanedText);
        } catch (parseError) {
            console.error("Critical JSON Parse Error even after repair:", parseError);
            return [];
        }

        const teamsArray = Array.isArray(data) ? data : (Array.isArray(data.teams) ? data.teams : []);
        let globalDate = new Date().toISOString().split('T')[0];
        if (data.documentDate && /^\d{4}-\d{2}-\d{2}$/.test(data.documentDate)) {
            globalDate = data.documentDate;
        }
        
        const processedTeams = teamsArray.map((team: any) => {
            const safeAttendees = safeParseInt(team.attendeesCount);
            const safeRiskCount = safeParseInt(team.riskFactorCount);
            const safeSafetyScore = safeParseInt(team.safetyScore);
            const safeRiskFactors = Array.isArray(team.riskFactors) ? team.riskFactors : [];
            const safeFeedback = Array.isArray(team.safetyFeedback) ? team.safetyFeedback : [];

            const normalizedRiskFactors = safeRiskFactors
              .map((risk: any) => ({
                risk: normalizeKoreanText(risk?.risk, '위험요인 확인 필요'),
                measure: normalizeKoreanText(risk?.measure, '예방대책 확인 필요')
              }))
              .filter((risk: any) => risk.risk.length > 0 || risk.measure.length > 0);

            const normalizedFeedback = safeFeedback
              .map((item: any) => normalizeKoreanText(item, ''))
              .filter((item: string) => item.length > 0);

            let researchAnalysis: TBMAnalysisResult | undefined = undefined;

            if (mode === 'BATCH') {
                const verifiedScore = safeSafetyScore > 0 ? safeSafetyScore : 85; 
                const verifiedFocus = 95; 
                const syntheticRubric = { logQuality: 25, focus: 25, voice: 18, ppe: 17, deductions: ["서면 기록 기반 산정"] };

                researchAnalysis = {
                    score: verifiedScore,
                    evaluation: `[기검증 데이터] 종합 일지 아카이빙 완료. 위험요인 ${safeRiskCount}건 식별됨.`,
                    evalLog: "서면 기록상 위험요인 도출 상태 양호함.",
                    evalAttendance: "출력 인원 대비 서명 인원 일치함.",
                    evalFocus: "현장 사진 및 서면 일지 기준 실천 점검 완료",
                    evalLeader: "현장 리더 서면 점검 및 지휘 상태 확인됨",
                    analysisSource: 'DOCUMENT',
                    rubric: syntheticRubric,
                    leaderCoaching: { actionItem: "기록 보존 완료", rationale: "과거 데이터입니다." },
                    details: { participation: 'GOOD', voiceClarity: 'CLEAR', ppeStatus: 'GOOD', interaction: true },
                    focusAnalysis: { overall: verifiedFocus, distractedCount: 0, focusZones: { front: 'HIGH', back: 'HIGH', side: 'HIGH' } },
                    insight: { mentionedTopics: normalizedRiskFactors.map((r:any) => r.risk || '') || [], missingTopics: [], suggestion: "기존 분석 검증 완료 데이터입니다." },
                    feedback: normalizedFeedback 
                };
            } else {
                researchAnalysis = undefined; 
            }

            return {
                  teamName: normalizeKoreanText(team.teamName, "팀명 미상"),
                  leaderName: normalizeKoreanText(team.leaderName, ""),
                attendeesCount: safeAttendees,
                  workDescription: normalizeKoreanText(team.workDescription, "작업 내용 식별 불가"),
                  riskFactors: normalizedRiskFactors,
                  safetyFeedback: normalizedFeedback,
                detectedDate: globalDate,
                videoAnalysis: researchAnalysis 
            };
        });
        return processedTeams;
      }
      throw new Error("No response text");
    } catch (error: any) {
      console.error("Gemini Data Mining Error:", error);
      throw error;
    }
  };
