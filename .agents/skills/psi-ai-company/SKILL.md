---
name: psi-ai-company
description: Apply PSI AI STUDIO named roles (아틀라스, 나비, 루미, 코어, 세이프, 키퍼, 프루프) to SMART TBM; resume work from GitHub, verify product-specific CI/Vercel and avoid cross-product changes.
version: 1.0.0
---

# SMART TBM / PSI AI STUDIO 역할 운영 스킬

공통 표준: https://github.com/TELLOWSS/NEW-PSI/blob/main/skills/psi-ai-company/SKILL.md
명부/실제 프로젝트 등록부: https://github.com/TELLOWSS/NEW-PSI/tree/main/config

**이 저장소 제품 신원:** GitHub `TELLOWSS/SMART-TBM-1-`, Vercel `tbm`, 프로젝트 ID `prj_9ft10r9T9PWXBaRl7isZ4tUfKSmY`. 이 저장소의 `AGENTS.md`와 `docs/psi-ai-company/PRODUCT_PROFILE.md`를 먼저 확인한다. 위 공통 표준 파일이 연결된 GitHub에서 읽히지 않으면 읽은 척하지 않는다.

## 호출명과 책임
- 아틀라스(ATLAS): CTO, 과제 분배·PR 통합/결재. 제품 소유자 승인 대체 금지.
- 나비(NAVI): 사용자 여정·초보자 이해·다국어·접근성.
- 루미(LUMI): 브랜드 디자인·그래픽·모바일 반응형.
- 코어(CORE): 기능 코드·API·성능·Vercel.
- 세이프(SAFI): 위험성평가·교육 안전성·AI 사실/추정 구분.
- 키퍼(KEEPER): 데이터·권한·개인정보·외부 송신·삭제 검토.
- 프루프(PROOF): 독립 QA, CI 실패 시 배포 차단, 증빙 감사.

> 애칭은 업무 책임 역할이다. 독립 AI 일곱 명이 상시 실행 중이거나 새 ChatGPT 채팅에 이 스킬이 자동 설치된다는 의미가 아니다.

## 새 채팅에서 반드시 할 일
1. GitHub `TELLOWSS/SMART-TBM-1-`의 `main`, `AGENTS.md`, 열린 PR, Actions 실행 상태를 조회한다.
2. 이 제품에 대한 실제 Vercel 배포, production SHA, 운영 도메인을 확인한다.
3. 요청을 담당 명칭/교차검토/위험도/테스트/수용기준/미완료로 분류한다.
4. 이 제품 브랜치/PR로만 구현하고, 해당 제품의 QA 명령(프로필에 정의)과 CI, preview를 검증한다.
5. 모든 검증이 통과한 뒤에만 main 병합·Vercel 운영 동기화를 검토한다.
6. 작업 후 부서별 발견사항/개선사항/CI·PR·배포 증거/미검증 항목을 보고한다.
7. NEW-PSI, SMART TBM, ZERO DAY 사이에 코드·사진·작업자 데이터·비밀키·게임 에셋을 자동 혼합하지 않는다.

## 제품별 우선순위
NEW-PSI와 관계 있으나 별도 프로그램·데이터·출시

SMART TBM은 NEW-PSI의 하위 화면이 아니며 원본 교육·TBM 절차와 데이터 책임을 독립 유지한다.

## 기본 검사
패키지 및 실제 CI 확인 후 `npm run build` 를 해당 저장소의 지원 범위에서 실행한다. 코드/에셋·데이터·비용 변경은 테스트만으로 사람의 최종 승인 절차를 대신하지 못한다.
