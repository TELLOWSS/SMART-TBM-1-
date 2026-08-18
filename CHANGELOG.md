# 변경 기록 (Changelog)

이 문서는 프로젝트의 주요 변경 사항을 날짜 기준으로 관리합니다.

## 2026-08-18

### ✅ 오후 TBM 작업 내용 기본값 및 표시 보강 ('오전과 동일함')
- `utils/teamUtils.ts`: `getWorkDescriptionDisplay` 헬퍼 함수 추가 (오후 TBM 세션에서 작업 내용이 비어있거나 '작업없음'/'내용 없음'인 경우 '오전과 동일함' 반환)
- `components/TBMForm.tsx`: 오후 세션 선택/시간 변경 시 작업 내용 자동 설정 및 저정 시 '오전과 동일함' 기본값 적용, 플레이스홀더 보강
- `components/ReportView.tsx` & `components/Dashboard.tsx`: 보고서 및 대시보드에서 오후 TBM 작업 내용을 '오전과 동일함'으로 명확하게 표시하도록 일관화

## 2026-06-09

### ✅ 스마트TBM지휘 Phase 3 & 4 E2E 통합 검증 완료
- `SAFETY_DATALAB_V2_TRACKER.md`
  - 스마트TBM지휘 Phase 3 (이행체크/증빙) 및 Phase 4 (지휘리포트/회고)의 모든 E2E 시나리오 실검증 통과 및 클리어 상태 전환
  - 자동/수동 검증 결과 및 증빙 기록 6개 필드 반영 완료
- `components/SafetyDataLab.tsx`
  - E2E 런타임 상에서 검증용 지시 생성, 상태전이 순환 검증, 지연 사유 및 상세 사유 자동 저장 검증
  - 증빙 완료 사진 제거 및 상태 유지성 검증
  - 일일 지휘 리포트 복사, 검증 로그 및 클리어 요약 1줄의 클립보드 복사 정상 동작 확인
  - 기간 필터링 전환 시 대시보드 및 리스트 실시간 업데이트 확인
  - API 키 부재 시 AI 전략 분석 클릭 시 400 Bad Request에 대한 예외 처리 및 UI 유지성 검증

## 2026-05-27

### ✅ TBM 동영상 AI 평가문안 종합화 (나열형 억제 + 검증·계획 포함)
- `services/geminiService.ts`
  - 영상 분석 프롬프트 규칙을 종합 평가 중심으로 재정의: `evaluation`에 종합판정/업그레이드·수정보강 확인검증/잔여 리스크/다음 계획을 필수 포함
  - 세부 항목(`evalLog/evalAttendance/evalFocus/evalLeader`)은 작업일보식 장문 나열을 금지하고 핵심 근거 요약으로 제한
  - 후처리에 종합 문단 합성 로직 추가로 실제 저장되는 `evaluation`을 항상 종합형 문체로 고정
  - 텍스트/하드코드 fallback 경로도 동일한 종합형 문체(확인검증 + 실행계획 포함)로 일관화
  - 종합 문안 자동검사 규칙 추가: 필수 토큰(`종합판정:`/`확인검증:`/`다음 계획:`), 나열형 패턴, 최소 분량을 점검하고 미충족 시 `rubric.deductions`에 자동 경고 및 감점 반영
- `components/ReportView.tsx`
  - `rubric.deductions`에 자동검사 경고/자동보정 항목이 포함된 경우 AI 점수 헤더에 `문안 보정 적용` 배지 표시
  - `종합 의견` 블록 하단에 보정 사유 요약(`rubric.deductions` 기반) 표시를 추가해 보고서 단계에서도 자동보정 원인을 즉시 확인 가능하도록 개선
- `components/TBMForm.tsx`
  - 작성 단계 AI 분석 결과 헤더에도 동일 조건(`rubric.deductions` 자동검사 경고/자동보정)으로 `문안 보정 적용` 배지 표시
  - `종합 의견` 입력 영역 하단에 보정 사유 요약(`rubric.deductions` 기반) 표시를 추가해 자동보정 원인을 즉시 확인 가능하도록 개선
  - 보정 사유 요약 문구를 운영자 친화 표현으로 치환(예: `분량 부족`→`종합 의견 길이 보완 필요`, `나열형 패턴 포함`→`항목 나열형 문장 패턴 보정 적용`)
- `components/SafetyDataLab.tsx`
  - 비침습 메모리 누수 방어 보강: 복사 완료 플래그 reset용 `setTimeout`을 추적/정리하는 공용 스케줄러 추가
  - 포커스 하이라이트 연쇄 타이머(`2200ms/400ms/2400ms`)를 ref로 관리하고 재진입/언마운트 시 `clearTimeout` 보장
  - 언마운트 cleanup에서 잔여 ephemeral 타이머 일괄 정리
  - 기능 점검 보강: 공유요약/지휘리포트/검증로그/클리어요약 복사 실패 시 무음 종료되지 않도록 오류 안내 및 콘솔 로그 추가
  - CSV 내보내기 실패 시 사용자 안내 문구를 추가해 다운로드 설정/브라우저 권한 문제를 즉시 식별 가능하도록 개선
- `components/TBMForm.tsx`
  - 토스트 자동닫힘 타이머를 언마운트 cleanup에서 `clearTimeout` 처리해 orphan callback 가능성 차단
  - 영상 AI 분석 완료/실패 안내에 실행 소요시간(초) 표기를 추가해 기능 점검 시 재현 시간 기록이 가능하도록 보강
- `components/ReportView.tsx`
  - PDF/이미지 내보내기 완료/실패 안내에 실행 소요시간(초) 표기를 추가해 대량 내보내기 점검 추적성을 강화
- `SAFETY_DATALAB_V2_TRACKER.md`
  - 동영상 AI 평가문안 종합화 배경, 반영 원칙, 실검증 체크리스트(나열형 재발/문맥 일치/실행가능 계획) 추가
  - 실영상 3건 기준 빠른 실행 템플릿, 종합 문안 4/4 판정표, 작업 로그 복붙 문구 추가
  - 샘플 A/B/C 기준 `좋은 예/나쁜 예` 문안 예시 추가로 현장 판정 기준 명확화
  - 전체 확인검증 후 수정보강 계획 추가(메모리 누수/기능 점검/업그레이드/기존 로직 비수정 보강 원칙 및 실행 순서)
  - 4차 마감 패키지 추가: 반영 완료 항목(코드)과 현장 실행 잔여 검증 항목을 분리해 종료 판정 기준 명확화
  - 남은 4개 현장 검증 항목을 60~90분 압축 실행 스크립트와 결과 기록 템플릿으로 정리해 즉시 마감 실행 가능 상태로 보강
  - 당일 실행 체크(한 줄 진행표) 추가로 현장 실행/완료 판정 입력을 단일 표에서 처리 가능하도록 개선

## 2026-05-26

### ✅ 런타임 검증 준비 점검 (Command Phase 3/4)
- `components/SafetyDataLab.tsx`
  - Command 검증 액션 경로 점검 완료: `검증 5건 생성` → `상태전이 검증` 반복 → 상태이력 `10건+` 판정
  - 검증 데이터 격리(`VALCMD-` prefix) 경로 확인으로 운영 데이터 오염 방지 규칙 재확인
  - 검증 로그/클리어 요약 복사 경로 존재 확인(Phase 3/4 실검증 즉시 수행 가능 상태)
- `SAFETY_DATALAB_V2_TRACKER.md`
  - 로컬 실행 전제(`npm install`/`.env.local`/`npm run dev`) + 자동/수동 검증 + 증빙 입력 필드를 포함한 실검증 실행 템플릿 추가
  - 실검증 완료 시 `Command Phase 3/4`를 `[x]`로 전환할 수 있는 판정 기준(Phase3/Phase4 조건 + 작업로그 반영 규칙) 추가
  - 실검증 직후 기록용 `Done/In Progress` 작업로그 복붙 템플릿 추가
  - 오늘 날짜(2026-05-26) 기준 즉시 입력용 완료/진행중 1줄 로그 스니펫 추가
  - Command/PDF/반응형 검증 우선순위와 완료 기준을 포함한 `다음 실행 계획 (2026-05-26)` 섹션 추가
- 실행환경 메모
  - 현재 GitHub VFS 세션에서는 터미널 기반 `npm run dev/build` 직접 실행 경로가 없어 실브라우저 검증은 로컬 실행 환경에서 진행 필요

### ✅ PSI 쇼케이스 & 브리핑 섹션 모바일 반응형 최적화 2차
- `components/Dashboard.tsx`
  - `PSIShowcaseSection` 반응형 개선
    - 헤더 레이아웃 md: → sm: 적용, 패딩 및 갭 모바일 축소 (p-4 → p-3, gap-3 → gap-2 md:gap-3)
    - 제목 텍스트 크기 text-lg md:text-xl → text-base sm:text-lg md:text-xl, line-clamp-2 적용
    - PC/Mobile 카드 내부 텍스트 반응형 사이즈 (text-[10px] → text-[9px] md:text-[10px] 등)
    - 모바일 플로우 카드 line-clamp-1 추가로 텍스트 오버플로우 방지
  - `PSIOverviewSection` 반응형 개선
    - 헤더 제목에서 "(01~09)" 제거, 벰 텍스트 line-clamp-2 추가
    - 카드 최소 높이 min-h-[140px] md:min-h-[160px] 추가로 균일한 높이 유지
    - 카드 제목 line-clamp-2, 요약 line-clamp-3으로 오버플로우 관리
    - 카드 레이아웃 md:grid-cols-2 xl:grid-cols-3 → sm:grid-cols-2 lg:grid-cols-3 (더 빨리 반응)
    - 카드 패딩 및 갭 모바일 축소 (p-3.5 → p-2.5 md:p-3.5, gap-3 → gap-2 md:gap-3)
  - Dashboard 헤더 배지 스택 반응형 최적화
    - 헤더 레이아웃 md:flex-row → sm:flex-row, 타이틀 크기 text-xl sm:text-2xl
    - 배지 갭 gap-1 md:gap-1.5, 패딩 px-1.5 md:px-2 py-0.5 md:py-1 (모바일 축소)
    - 배지 텍스트 크기 text-[9px] md:text-[10px], 아이콘 크기 scale-75 md:scale-100 또는 size 조정
    - whitespace-nowrap 및 line-clamp 적용으로 배지 줄바꿈 제어

### ✅ PSI 브랜드 정렬 1차 (아이덴티티/헤더 톤 정합)
- `components/Navigation.tsx`
  - 사이드바 브랜드 타이틀을 `HUIGANG`에서 `PSI`로 변경
  - 헤더 서브카피를 `Human Risk Intelligence`로 정렬
  - 브랜드 로고를 PSI 워드마크 중심 톤으로 보정
- `components/Dashboard.tsx`
  - 상단 타이틀을 `PSI Human Risk Intelligence`로 개편
  - 서브카피를 예측·사람중심 메시지로 교체
  - 핵심 가치 배지(인간 중심/예측 기반/안전 문화/데이터 기반) 추가
  - 첨부 시안(01~09) 구조를 반영한 `PSI 소개 브리핑` 카드 섹션 추가
  - 첨부 시안 2번 구조를 반영한 `PC Dashboard + Mobile App` 히어로 쇼케이스 섹션 추가
- `components/SystemIdentityModal.tsx`
  - 시스템 타이틀을 `PSI HRI OS`로 정렬
  - 설명 문구 버전 및 시스템 식별자(`PSI-HRI-CORE-V4`) 정합화
- `components/ReportView.tsx`
  - 전자 무결성 씰 하단 문구를 `PSI HRI`로 정렬


## 2026-05-12

### ✅ TBM 동영상 OCR/분석 응답 신뢰성 보강 (영문 출력/무관 답변 억제)
- `services/geminiService.ts`
  - `evaluateTBMVideo` 프롬프트를 한국어 중심 규칙으로 강화(서술형 필드 한국어 강제, 추측 금지, JSON 전용 출력)
  - 영상 분석 응답 후처리 검증 추가: 영문 응답/빈 응답/문맥 무관 문장을 한국어 기본문으로 자동 보정
  - 작업/위험요인 기반 문맥 키워드 검증을 통해 엉뚱한 피드백 유입 억제
  - 루브릭 점수 범위(0~25) 보정 및 감점 사유/피드백 정규화로 이상치 방어
  - `analyzeMasterLog` OCR 추출 프롬프트에 "문서에 없는 내용 추측 금지" 규칙을 명시
  - OCR 결과 필드(`teamName`, `leaderName`, `workDescription`, `riskFactors`, `safetyFeedback`) 한국어 정규화 및 기본값 보강

## 2026-05-09

### ✅ 보고서 내보내기 진행 상태 UX 강화
- `components/ReportView.tsx`
  - 누락됐던 `lockExportLayout` / `convertSvgToImage` 함수 정의를 복구해 PDF·이미지 내보내기 공통 런타임 오류(ReferenceError) 제거
  - 다건 PDF를 브라우저 인쇄 대신 캡처 기반 `jsPDF` 생성 경로로 전환해 페이지 밀림/잘림 가능성 완화
  - 다건 PDF(5건+/8건+)에서는 캡처 스케일/JPEG 품질을 자동 낮추는 경량 모드를 적용해 메모리 사용량 완화
  - 이미지 ZIP은 `dataURL(base64)` 대신 `Blob` 기반으로 묶도록 변경해 다건 변환 시 메모리 사용량과 실패 확률 완화
  - 다건 이미지 ZIP(6건+/10건+)에도 캡처 해상도/JPEG 품질 자동 조정 경량 모드 적용
  - 이미지 ZIP 내보내기 시 캡처 진행률 + ZIP 압축 퍼센트 + 다운로드 시작 단계 표시 추가
  - 데스크톱 상단 진행 바, 모바일 하단 고정 진행 패널, 성공/오류 배너를 추가해 내보내기 상태를 즉시 확인 가능하도록 개선
  - 내보내기 완료 시 실제 파일명과 다운로드 위치 확인 안내를 표시하도록 보강
  - 브라우저별 다운로드 위치/차단 설정 안내(Chrome/Edge/Firefox/Safari) 추가
  - 내보내기 중 `닫기`/`수정`/`삭제` 동작을 비활성화하고 작업 중 오버레이를 표시해 중단 위험 감소

## 2026-05-06

### ✅ 스마트TBM지휘 Phase 3/4 자동 검증 보강
- `components/SafetyDataLab.tsx`
  - `상태전이 검증` 자동화가 반복 실행 시 동일 상태에 멈추지 않고 다음 단계로 계속 순환되도록 보강
  - `DELAYED` 전이 시 지연 사유(`MATERIAL`)와 상세 코멘트를 자동 입력하도록 개선
  - `DONE` 전이 시 placeholder 증빙 이미지와 완료 코멘트를 자동 생성해 검증 준비 시간을 단축
  - 자동 검증/정리 액션을 `VALCMD-` 검증용 지시에만 적용하도록 제한해 실제 운영 지시 데이터 변경 위험 제거
  - 결과적으로 `검증 5건 생성` 후 `상태전이 검증`을 2회 실행하면 상태 이력 10건 이상 누적 검증 가능

## 2026-05-05

### ✅ 백업/복구 범위 확장 + 심층연구소 복구 동기화
- `App.tsx`
  - 전체 백업(`ALL`) 범위에 `activityLogs`, 심층연구소 스냅샷(`labSnapshots`), 스마트TBM 지시 워크플로우(`commandTasks`) 포함
  - 복구 시 위 3개 데이터도 병합/중복제거 후 저장하도록 확장
  - 심층연구소 화면이 열려 있는 상태에서도 복구 직후 로컬 저장 데이터가 즉시 반영되도록 `storageRevision` 동기화 추가
- `components/SafetyDataLab.tsx`
  - 스냅샷/지시 워크플로우 로컬 저장값 재동기화 유틸 추가
  - 복구 후 즉시 화면 반영을 위한 `storageRevision` prop 대응
- `utils/backupValidation.ts`, `types.ts`
  - 백업 스키마에 `activityLogs`, `labSnapshots`, `commandTasks` 타입 검증 추가

### ✅ 출력 보고서 모달 안정화
- `components/ReportView.tsx`
  - 깨진 `useEffect` 구문 정리로 정적 오류 제거
  - 모달 오픈 시 포커스 이동, `ESC` 닫기, 닫을 때 이전 포커스 복원 추가
  - 모바일 폭 기준 미리보기 축소 스케일 자동 보정

## 2026-04-30

### ✅ 모바일 3대 회귀 이슈 수정 (동영상 재생·채점·위험성평가 등록)
- `components/TBMForm.tsx`
  - 동영상 업로드 시 큐 아이템에 `tbmVideoFile`, `tbmVideoPreview`, `videoAnalysis` 동시 저장해 탭 전환 후 상태 소실 방지
  - `<video>` 태그에 `playsInline preload="metadata"` 추가 → 모바일 인라인 재생 허용
- `components/RiskAssessmentManager.tsx`
  - `fileInputRef` 선택 시 JSON 파일을 감지해 복구 경로로 자동 분기
  - 등록 파일 MIME 정규화 (`normalizedMime`) 후 Gemini 전달
  - `accept` 속성에 `.json,application/json` 추가로 iOS/Android 탐색기 노출 보장

### ✅ 수기 일지 OCR 분석 복구 + 신뢰성 구조 개선
- `components/TBMForm.tsx`
  - **근본 원인 제거**: `announceStatus`가 `sr-only` 전용이라 모든 AI 오류가 화면에 표시되지 않던 문제 → 화면 최상단 **토스트 배너** (`toastMessage` state)로 교체
  - **HEIC/HEIF 자동 변환**: iOS 카메라 HEIC 사진을 `normalizeImageToJpeg()` 캔버스 함수로 JPEG 변환 후 전송 (4096px 최대 해상도 제한 포함)
  - **API 키 사전 점검**: `checkApiKeyOrThrow()` → 키 미설정 시 분석 버튼 클릭 즉시 명확한 안내 메시지 표시
  - **구체 오류 메시지**: API_KEY_MISSING / 429(사용량 초과) / network 오류를 각각 구분해 한글로 표시
  - 오류 시 토스트 8초, 성공·정보는 4초 자동 소멸 + ✕ 수동 닫기
- `services/geminiService.ts`
  - `analyzeMasterLog`: `safeMimeType` 변수로 Gemini 미지원 MIME → `image/jpeg` 자동 폴백
  - `extractMonthlyPriorities`: PDF/이미지 MIME 정규화 동일 적용

### ✅ 모바일 터치 타겟 44px 통일 + 채점 텍스트영역 리사이즈 허용
- `components/Dashboard.tsx` — 팀별 보정 우선순위 "전체 보기" 버튼 `min-h-[40px]` → `min-h-[44px]`
- `components/TBMForm.tsx`
  - 삭제 버튼 `min-h-[40px]` → `min-h-[44px]`
  - 작성 완료/전체 저장 버튼 `min-h-[42px]` → `min-h-[44px]`
  - 4가지 채점 텍스트영역 `resize-none h-16` → `resize-y min-h-[64px]` (수직 리사이즈 허용)
- `components/RiskAssessmentManager.tsx` — 전체/상위험만 필터 버튼 `min-h-[40px]` → `min-h-[44px]`

### ✅ 동영상 채점 폼 UX 개선 + 출력 보고서 평가 텍스트 추가
- `components/TBMForm.tsx`
  - 4가지 채점 항목 라벨에 번호(①②③④) 추가 → 평가자 가독성 향상
- `components/ReportView.tsx`
  - `AI 심층 정밀 진단` 섹션에 evalLog/evalAttendance/evalFocus/evalLeader 텍스트 평가 블록 추가
  - 루브릭 게이지 바 아래 2×2 카드 형태로 항목별 평가 텍스트 표시 (`line-clamp-2` 적용)
  - 4가지 텍스트가 모두 비어 있으면 블록 미표시 (빈 화면 방지)

---

## 2026-04-29

### ✅ TBM 동영상 관리자 직접 채점 기능 추가
- `components/TBMForm.tsx`
  - 동영상 업로드 직후 기본값 채점 폼 자동 활성화
  - 4가지 평가 항목(일지 작성/참석 참여도/작업자 집중도/팀장 리딩) 수동 입력 가능
  - AI 분석은 선택사항(옵션 버튼)이 아닌 보조 역할로 변경
  - 관리자가 동영상을 보면서 실시간으로 점수 수정 및 의견 입력 가능
  - 모바일 환경에서도 비디오 플레이어 호버 시 재생 버튼 오버레이 표시

### ✅ TBM 영상 분석 ETA 정밀화(프로파일 보정)
- `components/TBMForm.tsx`
  - 영상 분석 ETA 계산에 파일 크기 + 압축 프로파일(`BALANCED/FAST/ULTRA_FAST`) 보정값을 반영
  - 진행률 기반 추정치와 보정 추정치를 혼합해 초반 ETA 흔들림을 완화
  - 캐시 재사용 시에도 동일 보정 기준을 적용해 재분석 ETA 일관성 강화

### ✅ 보관소 초기필터 원터치 해제 + 심층연구소 다중팀 필터 확장
- `components/ReportCenter.tsx`
  - 대시보드 전달 초기필터 배지에 `초기필터 해제` 액션 추가
  - 원터치 해제 시 팀/연계상태/보정필요 프리필터를 기본값으로 즉시 복귀
- `components/SafetyDataLab.tsx`
  - 팀 필터를 단일 선택에서 다중 선택으로 확장(`teamIds`)
  - 팀 열지도 선택을 토글 누적으로 변경해 여러 팀 동시 Drill-Down 지원
  - 마스터 팀 목록에 없는 팀도 엔트리 기반으로 필터 대상에 자동 포함
  - `미지정 팀` 버킷을 추가해 팀 누락 데이터도 분석 범위에서 제외되지 않도록 보정
  - 공유 요약/지휘 리포트/AI 분석 컨텍스트에 다중 팀 범위를 반영
- `components/SafetyDataLab.tsx`, `App.tsx`
  - `Unknown Team Normalization Queue` 추가(기존팀 치환 / 신규팀 등록+치환)
  - 미등록 팀 발생 건수/최근일자 기준 큐를 제공해 평가자 승인·실무자 정규화 동선을 분리
  - 정규화 실행 시 `entries`/`teams`를 앱 상태 및 저장소에 즉시 반영
  - 정규화 작업 이력(누가/언제/무엇/몇건)을 저장하고 심층연구소 내 최근 이력 카드로 표시
- `utils/backupValidation.ts`, `App.tsx`
  - 전체 백업/복구 범위에 `teamNormalizationLogs`를 포함해 운영 이력의 연속성 보장
- `App.tsx`, `components/Dashboard.tsx`
  - 팀 정규화 로그 적재 시 최신 스냅샷 기반으로 병합하도록 보강해 동시 액션 경합 시 로그 누락 위험 완화
  - 날씨 요청에 request sequence 가드를 추가해 이전 요청 응답이 최신 상태를 덮어쓰는 충돌(stale response) 방지
- `components/SafetyDataLab.tsx`
  - 정규화 작업 이력 카드에 기간 필터(`오늘/7일/30일`) 추가
  - 선택 기간 기준 이력만 조회하도록 필터링 로직 추가
  - 선택 기간 기준 이력 CSV 내보내기 기능 추가
- `App.tsx`, `components/SafetyDataLab.tsx`, `types.ts`, `utils/backupValidation.ts`
  - 정규화 동선을 `요청 → 승인/반려` 워크플로우로 전환
  - 승인/반려 시 사유코드(`오기입/미지정정리/품질개선/팀개편/대외점검/기타`) 및 검토 메모 기록
  - 승인 대기/요청 처리 이력 보드 추가, 승인 시 실제 정규화 실행 및 로그 누적
  - `teamNormalizationRequests` 저장/백업/복구 연계로 워크플로우 상태 지속성 보장
- `components/SafetyDataLab.tsx`
  - Phase C 운영 KPI 추가: 요청 SLA(대기 건수/평균 대기시간/최장 대기시간/24시간 초과 건수)
  - 반려 사유 Top 통계 카드 추가로 반려 패턴 분석 지원
  - KPI 임계치 기반 운영 경보 배지 추가(`24h 초과 대기`, `평균 대기 12h+`, `반려 누적 5건+`)
- `App.tsx`, `components/Dashboard.tsx`
  - 팀 정규화 요청 상태를 기반으로 대시보드용 경보 요약 지표(`critical/warning/pending`)를 계산해 전달
  - 대시보드 상단 헤더에 `CRITICAL/WARNING` 경보 배지 및 심층연구소 즉시 이동 액션 추가
  - 대시보드 `데이터 연구소` 카드에 정규화 경보 건수 배지를 노출해 초기 화면에서 운영 리스크 선인지 강화
- `App.tsx`, `components/Dashboard.tsx`, `components/SafetyDataLab.tsx`
  - 대시보드 경보 라벨 클릭 시 심층연구소 `Unknown Team Normalization Queue` 섹션으로 딥링크 포커스 연동
  - 심층연구소 진입 시 대상 섹션 자동 스크롤 및 일시 하이라이트로 조치 구간 인지성 강화
  - 포커스 진입 시 첫 번째 승인 대기 요청 카드도 자동 스크롤 + 에머랄드 링 하이라이트로 즉시 조치 유도
- `components/Dashboard.tsx`
  - 모바일 상단 부제목 정렬/줄바꿈을 보강해 텍스트 우측 쏠림 현상 완화
  - 상단 영문 부제목을 한글 문구로 전환해 모바일 가독성 개선
- `components/SafetyDataLab.tsx`
  - 심층연구소 주요 영문 UI 라벨을 한글로 전환(안전 점수/팀 활동 히트맵/미등록 팀 정규화 대기열/스마트TBM 지휘 섹션 등)
  - 히트맵/워크플로우 카드 텍스트에 `min-w-0`/줄바꿈/축약 클래스 보강으로 글자 겹침·넘침 완화
  - 잔여 영문 라벨(상태/우선순위/경보/기간비교/지연사유 표기)을 한글로 추가 통일해 심층연구소 UI 한글 일관성 강화
- `components/Dashboard.tsx`, `components/ReportCenter.tsx`
  - 대시보드/문서보관소 잔여 영문 라벨(`CRITICAL/WARNING`, `Last 7 Days`, `Top`, `Document Archive`, `Unknown` 등)을 한글로 통일
  - 기상 경보 레벨 문구, 시스템 상태 배지, 이미지 대체텍스트를 한글화해 현장 가독성 및 접근성 강화
- `components/RiskAssessmentManager.tsx`, `components/TBMForm.tsx`, `App.tsx`
  - 위험성평가 화면 분석 HUD/통계 라벨(`AI Analysis`, `Processing`, `Top Risk Categories`, `Base/Updates/New Regular` 등) 한글 통일
  - TBM 저장 로직의 기본 팀명 `Unknown`을 `미지정`으로 통일해 UI/유효성 조건 일관성 확보
  - 앱 복구 오버레이 영문 안내(`System Restoring`, `Serializing & Saving`, `% Complete`)를 한글로 전환
- `README.md`
  - 대용량 기능 운영을 위한 한국어 사용자 설명서(화면별 기능, 역할별 가이드, 운영 시나리오, 백업/복구, 체크리스트) 확장
- `SAFETY_DATALAB_V2_IMPLEMENTATION_PLAN.md`, `SAFETY_DATALAB_V2_TRACKER.md`
  - 운영 로그 및 구현 메모 동기화

### ✅ 모바일 대시보드 긴 팀명 overflow 안정화
- `components/Dashboard.tsx`
  - `팀별 보정 우선순위` 카드의 팀명 표시를 `truncate` 중심에서 `break-words` 기반으로 전환해 긴 팀명도 카드 내에서 안정적으로 표시
  - `실시간 활동(금일)` 헤더의 선택 팀 배지에 모바일 최대 폭/말줄임 처리를 추가해 상단 레이아웃 깨짐 방지
  - 실시간 목록 팀명/시각 행에 폭 제한을 추가해 긴 팀명에서도 시각 정보가 밀리지 않도록 보정
- `SAFETY_DATALAB_V2_IMPLEMENTATION_PLAN.md`, `SAFETY_DATALAB_V2_TRACKER.md`
  - 후속 모바일 미세조정 항목 및 작업 로그 동기화

### ✅ 스마트TBM지휘 카테고리 계획 추가
- `SAFETY_DATALAB_V2_IMPLEMENTATION_PLAN.md`
  - 확장 카테고리 `스마트TBM지휘` 신규 정의
  - Command Phase 1~4(지휘브리핑/지시발령/이행체크/지휘리포트)와 Clear 기준 추가
  - 즉시 착수 항목(`types.ts`, `SafetyDataLab.tsx`, 트래커 보드) 명시
- `SAFETY_DATALAB_V2_TRACKER.md`
  - 스마트TBM지휘 상태 보드 및 운영 체크리스트 추가
  - 작업 로그에 카테고리 확장 반영

### ✅ 스마트TBM지휘 초기 스키마 구현 착수
- `types.ts`
  - 지시 카테고리용 타입 추가: `CommandTask`, `CommandBriefingItem`, `CommandDailyReport`
  - 상태/우선순위/지연사유 타입(`CommandStatus`, `CommandPriority`, `CommandDelayReason`) 추가
- `SAFETY_DATALAB_V2_IMPLEMENTATION_PLAN.md`, `SAFETY_DATALAB_V2_TRACKER.md`
  - 즉시 착수 항목 1번 완료 처리 및 작업 로그 반영

### ✅ 스마트TBM지휘 지휘브리핑 스켈레톤 반영
- `components/SafetyDataLab.tsx`
  - `Smart TBM Command Briefing (Draft)` 섹션 추가
  - 기존 위험 스펙트럼 상위 3건 기반 브리핑 카드(위험명/건수/즉시조치/KPI) 표시
  - 데이터 없음 fallback 메시지 추가
- `SAFETY_DATALAB_V2_IMPLEMENTATION_PLAN.md`, `SAFETY_DATALAB_V2_TRACKER.md`
  - 즉시 착수 항목 2번 완료 처리 및 작업 로그 반영

### ✅ 스마트TBM지휘 Command Phase 2 착수 + 모바일 최적화
- `components/SafetyDataLab.tsx`
  - Command Workflow 섹션 추가(지시 생성/상태변경/삭제)
  - 지시 데이터 localStorage 저장(`smart_tbm_command_tasks_v1`)
  - 팀 필터와 연동된 지시 목록 표시
  - 모바일 반응형 개선: 헤더 액션 스택/폼 그리드/목록 레이아웃 최적화, 터치 타겟 높이 보강
- `SAFETY_DATALAB_V2_IMPLEMENTATION_PLAN.md`, `SAFETY_DATALAB_V2_TRACKER.md`
  - Command Phase 1 Cleared 반영
  - Command Phase 2를 In Progress로 상태 업데이트

### ✅ AI 추천 지시-워크플로우 병합
- `components/SafetyDataLab.tsx`
  - AI 지시 카드 영역에 `지시 워크플로우로 가져오기` 액션 추가
  - AI 카드 → Command Task 변환 시 우선순위/담당팀/기한(dueAt) 매핑 적용
  - 동일 제목+지시내용 기준 중복 방지 후 저장
- `SAFETY_DATALAB_V2_IMPLEMENTATION_PLAN.md`, `SAFETY_DATALAB_V2_TRACKER.md`
  - Command Phase 2 Cleared(2026-04-29) 반영

### ✅ 스마트TBM지휘 Command Phase 3 착수
- `components/SafetyDataLab.tsx`
  - 지시 카드별 이행 증빙 이미지 첨부/삭제(최대 3장) 및 코멘트 입력 추가
  - 지연 사유 코드(`MATERIAL/MANPOWER/WEATHER/OTHER`) 및 상세 사유 입력 추가
  - 입력값을 Command Task 저장소(localStorage)와 동기화
  - 상태 변경 시 `statusHistory` 누적 저장 및 카드 내 이력 조회 UI 추가
- `types.ts`
  - `CommandStatusHistoryItem` 타입 및 `CommandTask.statusHistory` 필드 추가
- `SAFETY_DATALAB_V2_IMPLEMENTATION_PLAN.md`, `SAFETY_DATALAB_V2_TRACKER.md`
  - Command Phase 3 진행 상태(In Progress) 반영

### ✅ 스마트TBM지휘 Command Phase 4 초안 반영
- `components/SafetyDataLab.tsx`
  - `Smart TBM Command Daily Report (Phase 4 Draft)` 섹션 추가
  - 지표 카드(총지시/완료/지연/완료율/지연율) 및 지연사유 Top/위험요인 Top3 요약 추가
  - `지휘 리포트 복사` 액션 추가(클립보드 공유 텍스트)
  - 재발위험 지표(`recurrenceRiskScore`, `recurrenceRiskLevel`) 및 공유 텍스트 반영
  - 상태전이 누적 건수(`totalStatusTransitions`) 및 Phase3 기준 충족 배지(10건+) 추가
  - 검증 지원 액션 추가: `검증용 5건 생성`, `상태전이 자동 검증`
  - 트래커 입력 지원 액션 추가: `검증 로그 1줄 복사`(Done/In Progress 자동 판정)
  - 검증 운영 지원 액션 추가: `검증용 데이터 정리`(VALCMD 샘플 일괄 제거)
  - 통합 검증 상태 카드 추가: 증빙/지연사유/리포트 데이터 충족 여부 및 완료 조건 시각화
  - `클리어 요약 1줄 복사` 액션 추가: Command Phase3/4 Clear 후보 로그 자동 생성
- `SAFETY_DATALAB_V2_IMPLEMENTATION_PLAN.md`, `SAFETY_DATALAB_V2_TRACKER.md`
  - Command Phase 4 진행 상태(In Progress) 반영

### ✅ 문서 상태 정합화
- `SAFETY_DATALAB_V2_TRACKER.md`
  - 스마트TBM지휘 구현 완료 로그를 `Done` 기준으로 정리
  - 잔여 항목을 `Command Phase3/4 실검증 실행` 1건으로 축약
- `SAFETY_DATALAB_V2_IMPLEMENTATION_PLAN.md`
  - 진행 상태 요약에 스마트TBM지휘 현재 단계(기능구현 완료 + 실검증 대기) 명시

### ✅ 모바일 UX 개선 (등록/지휘)
- `components/TBMForm.tsx`
  - 모바일 우선 레이아웃으로 재구성(고정 2분할 → 세로 스택)
  - 헤더 액션/대기열/입력 폼 그리드 반응형 조정 및 터치 조작성 개선
  - 모바일 하단 고정 저장 바 및 현재 입력 요약/진척 표시 추가
  - 모바일 `미디어 / 입력데이터` 탭 전환 추가로 입력란 전체폭 확보
- `components/SafetyDataLab.tsx`
  - 통합 검증 상태 카드에 `평가자 관점`/`실무자 관점` 충족 배지 추가
  - 모바일 빠른 검증 액션 바(검증 로그 복사/클리어 요약 복사) 추가

### ✅ 위험성평가 모바일 최적화 (평가자/실무자 관점)
- `components/RiskAssessmentManager.tsx`
  - 모바일 1차 탭 전환 추가: `평가목록 / 평가내용`
  - 모바일 작업영역 2차 탭 전환 추가: `실무도구 / 최종목록`
  - 고정 2열 구조를 모바일 우선 세로 흐름으로 재구성하고 터치 타겟 최소 높이 보강
  - 평가 항목 카드의 수정/삭제 액션을 모바일에서 항상 노출되도록 조정
  - 평가자용 요약(상위험 수, 비교추적) / 실무자용 요약(등록·수정·삭제 동선) 카드 추가
  - 검색창/액션 버튼/빈 상태 CTA를 모바일 폭에 맞춰 전체폭 중심으로 재배치
  - 평가 선택 시 자동 상세 전환, 수동 추가 후 자동 목록 복귀, `상위험만` 필터 추가
  - 모바일 하단 고정 액션바 추가: `평가목록 / 실무도구 / 최종목록 / 상위험` 전환 + 문서추가 바로가기
  - 상위험 카드 및 편집모드에 `즉시조치 메모` 저장 필드 추가
  - 상위위험 `TOP 3` 상단 요약 카드와 `즉시조치 메모 복사` 버튼 추가
  - 평가 목록에 `기준 정보 / 운영 정보` 아코디언 축소 추가
  - `상위위험 고정 섹션` 및 `즉시조치 메모 일괄 복사` 추가
- `types.ts`, `utils/backupValidation.ts`
  - `SafetyGuideline.actionNote` 필드 및 백업 검증 스키마 반영

### ✅ 스마트TBM 등록-위험성평가 연계 가시화/정밀화
- `App.tsx`, `components/TBMForm.tsx`
  - TBM 등록 화면에 현재 연계된 위험성평가 상태 카드 추가
  - TBM 입력 일자와 같은 `월간 위험성평가`를 우선 연결하도록 보강
  - 연계 데이터는 수기 일지 OCR, 안전 코멘트 생성, 동영상 평가에 공통 사용되도록 유지
  - 연계된 상위위험/즉시조치 메모를 TBM 위험요인/대책 초안으로 `단건/일괄 가져오기` 추가
  - 선택 팀 기준으로 연계 추천을 우선 정렬하고, 조치메모를 안전 코멘트로 즉시 반영하는 액션 추가
  - TBM 저장 시 사용된 위험성평가 ID/라벨/연계조건(동일월 여부) 메타데이터 기록
- `components/Dashboard.tsx`, `components/ReportCenter.tsx`, `components/ReportView.tsx`
  - 저장 후 이력/문서 목록/출력 보고서에서 연계된 위험성평가 라벨과 동일월 연계 여부를 표시

### ✅ 위험성평가 연계 운영 필터/경보/지표 확장
- `components/ReportCenter.tsx`
  - 문서 보관소에 `연계 전체 / 연계 있음 / 미연계` 필터 추가
  - 데이터 패키지 `manifest.json`에 연계 필터 상태 저장
- `components/Dashboard.tsx`
  - 금일 TBM 기준 `미연계 / 동일월 미일치 / 동일월 연계` 현황 경보 카드 추가
- `components/SafetyDataLab.tsx`
  - 위험성평가 연계 사용률, 동일월 연계율, 평균 상위위험 수 KPI 카드 추가

### ✅ 위험성평가 연계 운영 후속 고도화
- `components/ReportCenter.tsx`
  - `동일월 연계 / 동일월 미일치` 세부 필터 추가
- `components/Dashboard.tsx`
  - 경보 카드에서 `연계 보정 바로가기` 및 보관소 이동 액션 추가
- `components/SafetyDataLab.tsx`
  - 팀별 연계율/동일월 연계율 Top 보드 추가

### ✅ 위험성평가 연계 운영 모니터링 추가 확장
- `components/ReportCenter.tsx`
  - 보관소 카드에 `연계 보정 필요 / 동일월 확인 필요` 배지 추가
- `components/Dashboard.tsx`
  - 금일 경보를 팀별 우선순위 묶음으로 표시
- `components/SafetyDataLab.tsx`
  - 최근 6개월 `연계율 / 동일월 연계율` 추이 차트 추가

### ✅ 위험성평가 연계 운영 탐색성 추가 개선
- `components/ReportCenter.tsx`
  - `보정 필요만` 빠른 토글 추가
  - 패키지 `manifest`에 보정 토글 상태 저장
- `components/SafetyDataLab.tsx`
  - 월별 연계 추이 차트 범위를 `3M / 6M / 12M`으로 즉시 전환 가능하게 확장

### ✅ 위험성평가 연계 운영 가시성 추가 보강
- `components/Dashboard.tsx`
  - 팀별 경보 카드 클릭 시 해당 팀 금일 TBM만 실시간 목록에서 확인 가능
- `components/ReportCenter.tsx`
  - 현재 목록 기준 `미연계 / 미일치 / 동일월 연계` 요약 배너 추가
- `components/SafetyDataLab.tsx`
  - 월별 연계 추이 차트에 목표선(`90%`) 추가

### ✅ 위험성평가 연계 운영 액션/운영값 추가 보강
- `components/Dashboard.tsx`
  - 선택된 경보 팀 기준으로 `보정 바로가기` 대상도 해당 팀 우선으로 연결
- `components/ReportCenter.tsx`
  - 보정 요약 배너에 `보정 필요만 켜기/해제` 원클릭 액션 추가
- `components/SafetyDataLab.tsx`
  - 연계율 목표선을 저장형 운영값으로 전환(`80/90/95` 프리셋 + 직접 입력)

### ✅ 위험성평가 연계 운영 전역설정/세부필터 확장
- `types.ts`, `utils/siteConfigStorage.ts`, `utils/backupValidation.ts`
  - `SiteConfig.linkageTargetRate` 추가 및 저장/복구 스키마 확장
- `components/SettingsModal.tsx`, `App.tsx`, `components/SafetyDataLab.tsx`
  - 연계율 목표값을 설정 화면에서 전역 관리하고 연구소 차트와 동기화
- `components/ReportCenter.tsx`
  - 보정 요약 배너에 `미연계만`, `미일치만` 원클릭 액션 추가

### ✅ 대시보드→보관소 팀 필터 컨텍스트 전달
- `components/Dashboard.tsx`, `App.tsx`, `components/ReportCenter.tsx`
  - 대시보드에서 선택한 이슈 팀을 보관소 이동 시 함께 전달
  - 보관소 진입 시 해당 팀 필터가 자동 적용되도록 연동

### ✅ 대시보드→보관소 세부 보정 필터 컨텍스트 전달
- `components/Dashboard.tsx`, `App.tsx`, `components/ReportCenter.tsx`
  - 대시보드 경보 카드에서 `미연계만 보기`, `미일치만 보기` 액션 추가
  - 보관소 진입 시 팀 + 링크 상태(`all/unlinked/mismatched`)를 함께 자동 적용

### ✅ 모바일 상단 UX/기준치/초기필터 가시화 보강
- `components/Dashboard.tsx`
  - 모바일 메인 상단 헤더 정렬 개선(`items-start`, 상단 여백 보정)
  - 기상 경보 기준에서 타워크레인 풍속 임계값을 `15m/s 이상`으로 상향
- `components/ReportCenter.tsx`
  - 보관소 상단에 초기 필터 상태 배지 추가(예: `대시보드 전달: 미연계`)

### ✅ 통합대시보드 모바일 최상단 간격 미세 조정
- `components/Dashboard.tsx`
  - 모바일에서 헤더/배너/첫 카드 구간 간격을 1단계 축소(`space-y`, `gap`, `pb`, `mb`)

### ✅ 통합대시보드 모바일 경보카드 터치 개선
- `components/Dashboard.tsx`
  - 연계 점검 경보 카드 액션 버튼을 모바일 그리드로 재배치
  - 버튼 최소 높이(`44px`) 적용으로 터치 오동작 감소

### ✅ 통합대시보드 모바일 팀우선순위 터치 개선
- `components/Dashboard.tsx`
  - 팀별 보정 우선순위 카드 버튼에 최소 높이(`44px`) 적용
  - `전체 보기` 버튼도 모바일 터치 기준에 맞춰 높이/패딩 보강

### ✅ 전일 기록 확인 검증 및 후속 진행 착수
- `SAFETY_DATALAB_V2_TRACKER.md`
  - 전일(2026-04-28) 구현 항목의 코드 교차검증 결과를 작업 로그에 추가
  - 실행환경 제약(GitHub VFS 미마운트)으로 로컬 셸 빌드 검증이 Blocked 상태임을 기록
  - 출력물 실검증(화면/PDF/이미지 비교) 작업을 `In Progress`로 반영
  - 단건/다건 기준의 실출력 검증 상세 체크리스트와 결과 템플릿 추가
- `SAFETY_DATALAB_V2_IMPLEMENTATION_PLAN.md`
  - 진행 상태를 `완료 유지 + 후속 검증 진행중`으로 갱신
  - 2026-04-29 검증 메모(핵심 지점 확인, 에디터 오류 0건, 빌드 제약) 추가
  - 2026-04-29 다음작업 실행 절차(단건→다건 출력 검증 순서) 상세화
  - 오늘 종료 조건(Done Definition) 명시

### ✅ 검증 기록 자동화 보강
- `SAFETY_DATALAB_V2_TRACKER.md`
  - 작업 로그 복붙용 문구(정상완료/이슈/재검증) 추가
  - 2026-04-29 마감 체크리스트(완료 처리 기준) 추가

### ✅ 문서 내보내기 추가 안정화
- `components/ReportView.tsx`
  - 내보내기 대상 페이지 탐색 범위를 모달 내부(`reportDialogRef`)로 제한해 오탐 캡처 가능성 축소
  - 페이지가 0건일 때 즉시 안내 후 종료하는 가드 추가
  - 단건 이미지 다운로드 파일명에도 특수문자 치환 적용(다건 ZIP 규칙과 일치)

## 2026-04-28

### ✅ TBM 모바일 동영상 업로드 안정성 보강
- `components/TBMForm.tsx`
  - 모바일 브라우저 대응 파일 판별 로직 보강: MIME(`video/*`) + 확장자(`.mp4/.mov/.m4v/.3gp/.webm/.avi/.mkv`) 동시 검증
  - 동일 파일 재선택 시 `change` 이벤트 누락 방지를 위해 파일 입력값 초기화 로직 추가
  - 업로드 입력 `accept`를 모바일 촬영/전송 파일 확장자까지 확장해 선택 호환성 개선
  - 비정상(0 byte) 파일 방어 및 사용자 안내 메시지 강화

### ✅ 위험성평가 업로드 형식 검증 강화 (복구 JSON / 문서분석 PDF·이미지)
- `components/RiskAssessmentManager.tsx`
  - 위험성평가 복구 업로드에 JSON 형식 가드 추가(비JSON 파일 사전 차단 및 안내 메시지 노출)
  - 백업/복구 및 문서분석 버튼 라벨·툴팁·aria 문구를 형식 기준으로 명확화
  - 사용 동선을 `데이터 복구(JSON)` / `문서 분석(PDF/이미지)`로 분리해 운영 혼동 최소화

### ✅ TBM 동영상 업로드/고속 코칭 처리 개선
- `components/TBMForm.tsx`
  - 동영상 업로드 시 파일 형식 검증(`video/*`) 추가
  - 신규 영상 선택 시 이전 분석 결과/압축 캐시 자동 초기화
  - 재분석 시 동일 파일 압축 결과 캐시 재사용으로 응답 체감 속도 개선
  - 분석 상태 메시지에 압축/분석 단계와 결과 용량 안내 추가
- `utils/videoUtils.ts`
  - 파일 크기 기반 자동 압축 프로파일 도입(`BALANCED`/`FAST`/`ULTRA_FAST`)
  - 대용량 영상은 더 높은 배속/낮은 해상도로 빠른 코칭 분석 우선 처리
  - 압축 결과 메타(원본MB/결과KB/프로파일) 반환으로 호출부 상태 피드백 강화

### ✅ 대시보드/심층연구소 모바일 라벨 축약
- `components/Dashboard.tsx`
  - 연계 점검 카드의 안내 문구를 모바일 중심으로 축약(`미정합 상태`, `미연계/미일치/연계` 요약)
  - 액션 버튼 라벨 길이 축소(`보정 이동`, `보관소 전체 확인`, `미연계만`, `미일치만`)
  - 팀명 포함 액션 라벨에 `truncate` 적용으로 긴 팀명에서도 버튼 폭 안정화
- `components/SafetyDataLab.tsx`
  - 지휘 워크플로우/일일 리포트 헤더 및 검증 버튼 라벨 축약
  - 상태 검증 배지 문구를 짧게 통일(`통합검증 충족/진행`, `이력검증 충족(10+)`)

### ✅ 모달/등록화면 잔여 영문 최종 통일
- `components/HistoryModal.tsx`
  - 헤더/배지/타임라인 고정 문구의 영문 표기를 한글로 정리(`Devlog`, `System Evolution History`, `NEW`, `Project Initiated` 등)
  - 마일스톤 제목·설명의 영문 괄호 표현을 현장 용어 중심 한글 문구로 통일
- `components/SystemIdentityModal.tsx`
  - 시스템 아이덴티티 배지 및 상태 설명의 혼용 영문을 한글화(`Ultra Fast`, `Verified`, `Failover`, `Client-Side` 등)
  - 기술 식별자(모델명/버전/ID)는 유지하고 사용자 안내 문구만 한국어로 정리
- `components/TBMForm.tsx`
  - AI 진단 카드의 잔여 영문 라벨(`Total Score`, `Leader's Action Card`, `Master Safety Review`, `Data Entry`)을 한글 통일


### ✅ 안정화/버그 수정
- `components/TBMForm.tsx`
  - `handleSaveAll` 함수에서 `await onSave(...)` 사용에 맞춰 `async` 선언 추가
  - Vercel 빌드 오류 해결: `"await" can only be used inside an "async" function`
- `components/Dashboard.tsx`
  - 기상 아이콘 ternary 구문 내 잘못 삽입된 `aria-label` 문자열 제거
  - Vercel 빌드 오류 해결: `Expected identifier but found "\`${"`

### ✅ 확인 다이얼로그 공통화
- 신규 추가
  - `hooks/useConfirmDialog.ts`
  - `components/common/ConfirmDialog.tsx`
- 적용 파일
  - `App.tsx`
  - `components/SettingsModal.tsx`
  - `components/ReportCenter.tsx`
  - `components/RiskAssessmentManager.tsx`
- 변경 내용
  - 네이티브 `confirm()` 제거 및 Promise 기반 `requestConfirm()` 패턴 통일
  - 포커스 트랩, ESC 닫기, 이전 포커스 복원 등 접근성 동작 공통 제공

### ✅ 다이얼로그 시맨틱 확장
- `variant` 프리셋 도입: `default | danger | warning`
- 파괴적 작업(삭제)에는 `danger`, 경고성 진행에는 `warning` 적용

### ✅ 접근성 개선
- `App.tsx`
  - 복구 오버레이에 `role="progressbar"` 및 ARIA 값 반영
  - 루트에 `aria-busy` 반영
  - 상태 안내 라이브 리전(`aria-live`) 유지/강화

### ✅ 배포 환경 안정화
- `package.json`
  - `engines` 추가
    - `node: >=20 <23`
    - `npm: >=10`

### ✅ 구현 계획/기록관리 체계 추가
- 신규 문서
  - `SAFETY_DATALAB_V2_IMPLEMENTATION_PLAN.md`
  - `SAFETY_DATALAB_V2_TRACKER.md`
- 반영 내용
  - 안전데이터 심층연구소 v2를 단계별(Phase 1~4)로 순차 실행하는 계획서 정의
  - 체크리스트/작업로그/Clear 기록 테이블을 통한 진행·완료 관리 체계 도입

### ✅ 안전데이터 심층연구소 v2 Phase 1 구현
- `components/SafetyDataLab.tsx`
  - 기간 필터 추가: 최근 7일 / 최근 30일 / 당월 / 전체 / 커스텀
  - 다중 필터 상태 구조 도입: 팀 + 위험 + 기간 동시 적용
  - 필터 상태 뱃지 및 일괄 초기화 동작 반영
  - 커스텀 기간 입력(start/end) UI 및 기간 기반 분석 데이터셋 분리

### ✅ Phase 1 검증/기록 관리 업데이트
- `SAFETY_DATALAB_V2_IMPLEMENTATION_PLAN.md`
  - Phase 1 검증 케이스 10종 정의
  - 빌드 통과 항목 체크 완료
- `SAFETY_DATALAB_V2_TRACKER.md`
  - 검증 케이스 표(10종) 추가
  - 작업 로그에 빌드 검증 성공 이력 추가

### ✅ 안전데이터 심층연구소 v2 Phase 2 상세 구현
- `components/SafetyDataLab.tsx`
  - `RISK_KEYWORD_DICT` 모듈 레벨 상수로 분리 (카테고리 체계 포함: 추락/낙하/전도, 장비/환경, 화학/게 사고)
  - 트렌드 바 첫트 스케일 개선: `/10` 고정값 → `maxTrendCount` 동적 최대값 기준
  - `filteredAnalysis`에 `maxTrendCount` 추가 반환
- Phase 2 Cleared (2026-04-28) — 빌드 통과

### ✅ 안전데이터 심층연구소 v2 Phase 4 구현
- `components/SafetyDataLab.tsx`
  - `LabSnapshot` 인터페이스 + `SNAPSHOT_STORAGE_KEY` 상수 추가
  - `compareAnalysis` useMemo: 전주/전월 대비 건수·점수·인원 5개 비교 지표 계산
  - `handleSaveSnapshot`: 현재 분석 상태를 localStorage에 최대 10개 보존
  - `handleDeleteSnapshot`: 스냅샷 개별 삭제
  - `handleExportCSV`: 필터 적용된 entries를 BOM UTF-8 CSV로 다운로드
  - `handleCopyShareText`: 분석 요약을 클립보드에 복사 + 완료 피드백 (`copyDone`)
  - `filteredAnalysis`에 `filteredEntries` 반환 추가 (CSV 내보내기 연결)
  - 렌더링: "Period Comparison" 비교 지표 5행 카드 + "Snapshot & Export" 패널 추가
- Phase 4 Cleared (2026-04-28) — 빌드 통과 (`✓ built in 5.26s`)

### ✅ 문서 내보내기 균형감 보정 (PDF/이미지)
- `components/ReportView.tsx`
  - html2canvas 캡처 스케일을 디바이스 픽셀 비율 기반으로 조정 (`2~3` 범위)
  - 캡처 시 `windowWidth/windowHeight`를 A4 기준(`794x1123`)으로 고정
  - 전역 강제 `letter-spacing`/`img height:auto` 제거로 텍스트·그리드 변형 최소화
  - 내보내기 전용 레이아웃 강제 CSS(`.row/.col/.h-*`)로 화면/출력 간 비율 일치 강화
  - 캡처 직전 `lockExportLayout()` 적용으로 주요 셀/그리드/이미지의 계산 크기 고정 (브라우저별 미세 틀어짐 완화)
  - `lockExportLayout()` 정밀화: 반올림 대신 소수점(px) 보존 + min/max 동시 고정으로 누적 오차 완화
  - 이미지 preload 단계에 `img.decode()` 추가로 렌더 완료 시점 동기화 강화
  - 내보내기 클론 문서에 폰트 스택 강제 지정으로 화면/출력 텍스트 폭 차이 최소화

### 🎉 안전데이터 심층연구소 v2 — All Phases Cleared (2026-04-28)

---
### ✅ 안전데이터 심층연구소 v2 Phase 3 구현
- `components/SafetyDataLab.tsx`
  - `CommandOrder` 인터페이스 + `PRIORITY_CONFIG` 상수 추가 (CRITICAL / HIGH / MEDIUM)
  - `CommandOrderCard` 컴포넌트 신규 구현 (담당팀 / 우선순위 / 기한 / 근거 / KPI 카드)
  - AI 프롬프트를 JSON 배열 반환 요청 구조로 변경
  - JSON 파싱 성공 시 카드 렌더링, 실패 시 raw 텍스트 fallback 처리
  - 로딩 스켈레톤 / 오류 상태 / 재시도 버튼 UX 추가
  - 카드 닫기(X) 버튼 및 터미널 닫기 버튼 추가
- Phase 3 Cleared (2026-04-28) — 빌드 통과

---
## 기록 원칙
- 기능 단위로 묶어서 기록
- 파일 경로 + 핵심 변경 요약을 함께 기재
- 배포 영향이 있는 변경은 별도 섹션으로 명시
- 배포 단위 기록은 `RELEASE_TEMPLATE.md`를 사용
