
import { GoogleGenAI, Type } from "@google/genai";
import { RiskAssessmentItem, SafetyGuideline, TBMAnalysisResult } from "../types";

const apiKey = process.env.API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

export interface ExtractedPriority {
  content: string;
  level: 'HIGH' | 'GENERAL';
  category: string;
}

export interface MonthlyExtractionResult {
  items: ExtractedPriority[];
  detectedMonth?: string;
}

// [UPDATED] Deep Insight TBM Video Evaluation
export const evaluateTBMVideo = async (base64Video: string, mimeType: string, workDescription?: string): Promise<TBMAnalysisResult> => {
  try {
    // Simplify MIME type to generic video/webm if it's complex
    // This helps avoid codec mismatch errors on the API side
    let cleanMimeType = 'video/webm'; 
    if (mimeType.includes('mp4')) cleanMimeType = 'video/mp4';

    console.log(`Sending video to Gemini (Safe Mode): ${cleanMimeType}`);

    const workContext = workDescription ? `작업 내용: "${workDescription}"` : "작업 내용: 일반 골조 공사";

    // Updated Prompt: Explicitly handle silent video & Force Korean Output
    const prompt = `
      역할: 당신은 한국 건설 현장의 20년차 베테랑 안전 전문가입니다.
      임무: 제공된 10초 분량의 [무음(Silent)] TBM 영상을 시각적으로 정밀 분석하여, **반드시 한국어(Korean)**로 안전 점검 리포트를 작성하십시오.
      
      [분석 목표]
      1. Worker Focus (집중도): 작업자들의 시선 처리, 딴짓 여부, 리더를 향한 주목도를 파악하십시오.
      2. Safety Check (안전 상태): 안전모 턱끈 체결, 보호구 착용 상태, 복장 불량을 찾아내십시오.
      3. Leader (리더십): (소리가 없으므로) 리더의 제스처, 지시하는 손동작의 명확성을 보고 '활발함'을 추정하십시오.

      ${workContext}

      [출력 규칙 - ⚠️ 모든 텍스트는 한국어로 작성하십시오]
      1. evaluation (종합 평가): 작업자들의 전반적인 태도와 분위기를 한국어로 구체적으로 서술하십시오. (예: "작업자들의 시선이 리더에게 집중되어 있으며, 보호구 착용 상태가 매우 모범적입니다.")
      2. insight.missingTopics (누락 위험): 영상 내 작업 환경을 볼 때, TBM에서 반드시 언급했어야 하는데 누락된 것으로 보이는 '잠재적 위험'을 한국어로 지적하십시오. (예: "고소 작업 시 추락 방지 대책", "신호수 배치 확인")
      3. insight.suggestion (AI 제안): 이를 해결하기 위한 구체적인 코칭 멘트를 한국어로 작성하십시오.
      4. feedback: 관리자에게 주는 3가지 핵심 조언을 한국어로 작성하십시오.

      JSON 형식으로 응답하십시오.
    `;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash", 
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType: cleanMimeType, data: base64Video } },
            { text: prompt }
          ]
        }
      ],
      config: {
        responseMimeType: "application/json",
        // Relaxed Schema: Removed strict ENUMs to prevent 400 Errors on validation
        responseSchema: {
          type: Type.OBJECT,
          properties: {
             score: { type: Type.INTEGER },
             evaluation: { type: Type.STRING },
             details: {
               type: Type.OBJECT,
               properties: {
                 participation: { type: Type.STRING }, // GOOD, BAD, MODERATE
                 voiceClarity: { type: Type.STRING },  // CLEAR, MUFFLED, NONE
                 ppeStatus: { type: Type.STRING },     // GOOD, BAD
                 interaction: { type: Type.BOOLEAN }
               }
             },
             focusAnalysis: {
                type: Type.OBJECT,
                properties: {
                    overall: { type: Type.INTEGER },
                    distractedCount: { type: Type.INTEGER },
                    focusZones: {
                        type: Type.OBJECT,
                        properties: {
                            front: { type: Type.STRING }, // HIGH, LOW
                            back: { type: Type.STRING },
                            side: { type: Type.STRING }
                        }
                    }
                }
             },
             insight: {
                 type: Type.OBJECT,
                 properties: {
                     mentionedTopics: { type: Type.ARRAY, items: { type: Type.STRING } },
                     missingTopics: { type: Type.ARRAY, items: { type: Type.STRING } },
                     suggestion: { type: Type.STRING }
                 }
             },
             feedback: {
               type: Type.ARRAY,
               items: { type: Type.STRING }
             }
          }
        },
      },
    });

    if (response.text) {
      const raw = JSON.parse(response.text);
      // Normalize data to match Typescript interfaces strictly after receiving
      return {
          score: raw.score || 0,
          evaluation: raw.evaluation || "분석 완료",
          details: {
              participation: (raw.details?.participation || 'MODERATE') as any,
              voiceClarity: (raw.details?.voiceClarity || 'MUFFLED') as any,
              ppeStatus: (raw.details?.ppeStatus || 'GOOD') as any,
              interaction: !!raw.details?.interaction
          },
          focusAnalysis: {
              overall: raw.focusAnalysis?.overall || 0,
              distractedCount: raw.focusAnalysis?.distractedCount || 0,
              focusZones: {
                  front: (raw.focusAnalysis?.focusZones?.front || 'HIGH') as any,
                  back: (raw.focusAnalysis?.focusZones?.back || 'HIGH') as any,
                  side: (raw.focusAnalysis?.focusZones?.side || 'HIGH') as any
              }
          },
          insight: {
              mentionedTopics: raw.insight?.mentionedTopics || [],
              missingTopics: raw.insight?.missingTopics || [],
              suggestion: raw.insight?.suggestion || "안전 수칙을 준수하세요."
          },
          feedback: raw.feedback || []
      };
    }
    throw new Error("No response text");

  } catch (error: any) {
    console.error("Gemini Insight Error:", error);
    // Graceful Error Handling
    return {
      score: 0,
      evaluation: "영상 형식 문제로 분석 실패 (Code: 400). 다시 시도해주세요.",
      details: { participation: 'MODERATE', voiceClarity: 'NONE', ppeStatus: 'GOOD', interaction: false },
      focusAnalysis: { overall: 0, distractedCount: 0, focusZones: { front: 'LOW', back: 'LOW', side: 'LOW' } },
      insight: { mentionedTopics: [], missingTopics: [], suggestion: "재촬영 권장" },
      feedback: ["네트워크 상태 확인 필요"]
    };
  }
};

// ... (Rest of the file remains unchanged: extractMonthlyPriorities, analyzeTBMLog)
export const extractMonthlyPriorities = async (base64Data: string, mimeType: string): Promise<MonthlyExtractionResult> => {
  try {
    const prompt = `
      당신은 건설 현장 안전 문서 분석 전문가입니다.
      제공된 '월간 위험성평가표' 이미지를 분석하여 데이터를 추출하십시오.

      [🚨 긴급 수정 요청: 등급 오분류 및 중복 방지]
      사용자가 "상등급이 아닌데 상으로 분류된다"고 지적했습니다. 다음 규칙을 생명처럼 지키십시오.

      1. **함정 단어 필터링 (Trap Word Exclusion) - 절대 등급으로 착각하지 말 것**:
         - 텍스트 내용 중에 **'상'** 글자가 있어도 등급이 아닙니다.
         - **오분류 금지 단어**: '작업 상부', '상태 점검', '낙하 비래상(물체에 맞음)', '신체 부상', '이상 유무', '안전성 향상', '영상'.
         - 위 단어들에 포함된 '상'은 무시하십시오.

      2. **등급(Level) 판단의 유일한 기준**:
         - 오직 표의 **'등급', '위험성', '평가'라고 적힌 좁은 열(Column)**에 있는 값만 보십시오.
         - 그 칸에 정확히 **'상'**, **'High'**, **'4'**, **'5'**가 단독으로 적혀 있을 때만 **HIGH**입니다.
         - '중', '하', '보통', '낮음'이거나 등급 칸이 비어있으면 무조건 **GENERAL**입니다.
         - **판단이 애매하면 무조건 GENERAL(일반)로 분류하십시오.**

      3. **1행 1항목 원칙 (Row Integrity)**:
         - 표의 한 행(Row)에 적힌 내용은 절대 분리하지 말고 하나로 합치십시오.
         - 줄바꿈이 있다고 해서 새로운 항목으로 만들지 마십시오.
         - **[위험요인] + [대책]** 을 하나로 묶으십시오.

      4. **텍스트 변형 금지**:
         - 중복 방지를 위해, AI가 문장을 요약하거나 의역하지 마십시오.
         - 문서에 적힌 글자 그대로(Typo 포함) 추출하십시오. 그래야 시스템이 중복을 걸러낼 수 있습니다.
         
      5. **문서 날짜(월) 자동 인식**:
         - 문서 상단이나 제목 주변에 적힌 날짜(예: 2025년 12월, 2025.12, Dec 2025)를 찾으십시오.
         - 이를 **YYYY-MM** 형식(예: 2025-12)으로 변환하여 \`detectedMonth\` 필드에 넣으십시오. 날짜가 없으면 null입니다.

      [출력 데이터 구조]
      - detectedMonth: 문서 해당 월 (YYYY-MM)
      - items: 배열
         - content: 위험요인과 대책을 합친 문장
         - level: HIGH 또는 GENERAL
         - category: 공종 (형틀, 철근, 전기, 설비, 공통 등)
    `;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType: mimeType, data: base64Data } },
            { text: prompt }
          ]
        }
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
             detectedMonth: { type: Type.STRING, description: "문서 상단의 날짜를 분석하여 YYYY-MM 형식으로 반환 (예: 2025-12)" },
             items: {
               type: Type.ARRAY,
               items: {
                 type: Type.OBJECT,
                 properties: {
                   content: { type: Type.STRING, description: "위험요인 및 대책 (텍스트 변형 없이 그대로)" },
                   level: { type: Type.STRING, enum: ["HIGH", "GENERAL"], description: "함정 단어('상태', '비래상')를 제외한 실제 위험 등급" },
                   category: { type: Type.STRING, description: "적용 공종" }
                 },
                 required: ["content", "level", "category"]
               }
             }
          },
          required: ["items"]
        },
      },
    });

    if (response.text) {
      return JSON.parse(response.text) as MonthlyExtractionResult;
    }
    return { items: [] };
  } catch (error: any) {
    console.error("Gemini Monthly Analysis Error:", error);
    if (error.message?.includes('Rpc failed') || error.status === 500) {
        alert("구글 AI 서버 연결 불안정(Network Error). 잠시 후 다시 시도해주세요.");
    }
    return { items: [{ content: "분석 서버 연결 실패 (직접 입력 권장)", level: "GENERAL", category: "공통" }] };
  }
};

export const generateRiskAssessment = async (
  teamName: string,
  workDescription: string
): Promise<RiskAssessmentItem[]> => {
  return [
      { risk: "작업 반경 내 접근 통제 미흡", measure: "신호수 배치 및 접근 금지 표지판 설치" },
      { risk: "개인 보호구 착용 상태 불량", measure: "작업 전 보호구 착용 상태 상호 점검" },
      { risk: "장비와 작업자 간 충돌 위험", measure: "장비 유도원 배치 및 사각지대 확인" },
  ];
};

export const analyzeTBMLog = async (
  base64Data: string, 
  mimeType: string,
  monthlyGuidelines: SafetyGuideline[] = [],
  targetTeamName?: string
): Promise<{
  teamName: string;
  leaderName: string;
  attendeesCount: number;
  workDescription: string;
  riskFactors: RiskAssessmentItem[];
  safetyFeedback: string[];
}> => {
  try {
    const guidelinesPrompt = monthlyGuidelines.length > 0
      ? JSON.stringify(monthlyGuidelines)
      : '[]';

    let contextInstruction = "";
    if (targetTeamName) {
      contextInstruction = `
      [중요: 타겟 팀 분석 모드]
      문서에서 **'${targetTeamName}'** 팀(또는 유사 이름) 섹션을 찾아 데이터를 추출하세요.
      `;
    }

    const prompt = `
      당신은 건설 현장 안전 전문가 '박성훈 부장'입니다.
      제공된 'T.B.M 일지' 이미지를 분석하여 JSON 데이터를 반환하세요.

      ${contextInstruction}

      [1단계: 필기체 및 삭제/수정 사항 인식 (Critical)]
      1. **취소선(Strikethrough) 처리 (가장 중요)**:
         - 텍스트 위나 중간에 **가로줄(ㅡ)이나 두 줄(=)**이 그어진 경우, 이는 **삭제된 내용**입니다. 절대 추출하지 마십시오.
         - 예: "7명" 숫자에 줄이 그어져 있고 옆에 "6명"이 있다면, "6명"만 추출합니다.
      
      2. **데이터 추출**:
         - teamName: 팀명 
         - leaderName: 팀장 이름
         - attendeesCount: 실제 참석 인원
         - workDescription: 금일 작업 내용
         - riskFactors: 위험요인 및 대책 (문서에 적힌 그대로 추출)

      [2단계: 공종별 맞춤형 안전 피드백 생성]
      다음의 '월간 중점 관리 사항' 데이터베이스를 참고하여, 현재 작업 내용에 대한 안전 피드백을 생성합니다.
      
      참고 데이터베이스: ${guidelinesPrompt}

      **피드백 생성 규칙**:
      1. 해당 팀의 공종(형틀, 철근 등)과 작업 내용(workDescription)을 파악하십시오.
      2. 데이터베이스에서 해당 공종에 적용되거나 '공통'인 항목 중, **작업 내용과 직접적으로 관련된 위험 요인**을 찾으십시오.
      3. 작업자가 놓칠 수 있는 부분이나 강조해야 할 사항을 3~5개 선정하여 반환하십시오.
      4. 만약 데이터베이스에 관련 항목이 없다면, 일반적인 안전 수칙을 제안하십시오.
    `;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType: mimeType, data: base64Data } },
            { text: prompt }
          ]
        }
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            teamName: { type: Type.STRING },
            leaderName: { type: Type.STRING },
            attendeesCount: { type: Type.INTEGER },
            workDescription: { type: Type.STRING },
            riskFactors: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  risk: { type: Type.STRING },
                  measure: { type: Type.STRING },
                },
              }
            },
            safetyFeedback: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            }
          },
        },
      },
    });

    if (response.text) {
      const data = JSON.parse(response.text);
      return {
        teamName: data.teamName || '',
        leaderName: data.leaderName || '',
        attendeesCount: data.attendeesCount || 0,
        workDescription: data.workDescription || '',
        riskFactors: data.riskFactors || [],
        safetyFeedback: data.safetyFeedback || []
      };
    }
    throw new Error("No response text");
  } catch (error: any) {
    console.error("Gemini Vision Error:", error);
    if (error.message?.includes('Rpc failed') || error.status === 500) {
       alert("AI 분석 서버 응답 없음(Timeout). 잠시 후 다시 시도하거나 직접 입력해주세요.");
    }
    return {
      teamName: targetTeamName || '',
      leaderName: '',
      attendeesCount: 0,
      workDescription: '',
      riskFactors: [],
      safetyFeedback: ["AI 서버 연결 불안정: 수동으로 입력해주세요."]
    };
  }
};
