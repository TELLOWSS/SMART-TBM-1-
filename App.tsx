
import React, { useState, Suspense, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Navigation } from './components/Navigation';
import { Dashboard } from './components/Dashboard';
import { TBMForm } from './components/TBMForm';
import { RiskAssessmentManager } from './components/RiskAssessmentManager';
import { ReportView } from './components/ReportView';
import { ReportCenter } from './components/ReportCenter';
import { SafetyDataLab, SNAPSHOT_STORAGE_KEY, COMMAND_TASK_STORAGE_KEY } from './components/SafetyDataLab';
import { HistoryModal } from './components/HistoryModal';
import { SettingsModal } from './components/SettingsModal'; 
import { SystemIdentityModal } from './components/SystemIdentityModal';
import { ConfirmDialog } from './components/common/ConfirmDialog';
import { TEAMS } from './constants';
import { hasSupportedBackupShape, validateBackupPayload, MAX_BACKUP_FILE_COUNT, MAX_BACKUP_FILE_SIZE, type BackupPayload } from './utils/backupValidation';
import { loadStoredSiteConfig, persistSiteConfig } from './utils/siteConfigStorage';
import { StorageDB } from './utils/storageDB';
import { buildEntryTeamPayload, getEntryTeamIds, getEntryTeamLabel, getEntryTeamNames } from './utils/teamUtils';
import { useConfirmDialog } from './hooks/useConfirmDialog';
import { TBMEntry, TeamOption, MonthlyRiskAssessment, SafetyGuideline, SiteConfig, TeamNormalizationLog, TeamNormalizationRequest, TeamNormalizationReasonCode, AppActivityLog, LabSnapshot, CommandTask as SmartCommandTask } from './types';
import { Database } from 'lucide-react';

// [UPDATED] Restore Progress Overlay Component
const RestoreOverlay = ({ progress }: { progress: number }) => {
    return createPortal(
        <div className="fixed inset-0 z-[999999] bg-slate-900/90 backdrop-blur-md flex flex-col items-center justify-center animate-fade-in text-white" role="status" aria-live="polite" aria-atomic="true">
            <div className="bg-slate-800 p-8 rounded-3xl border border-slate-700 shadow-2xl flex flex-col items-center max-w-sm w-full mx-4 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/20 rounded-full blur-[60px] pointer-events-none"></div>
                
                <div className="relative z-10 flex flex-col items-center">
                    <div className="relative w-20 h-20 mb-6 flex items-center justify-center">
                        <div className="absolute inset-0 rounded-full border-2 border-emerald-500 animate-ping opacity-20"></div>
                        <Database size={48} className="text-emerald-400 animate-pulse" />
                    </div>
                    <h3 className="text-xl font-black mb-2">시스템 복구 중...</h3>
                    <p className="text-sm text-slate-400 mb-6 text-center">데이터베이스 트랜잭션 기록 중...<br/>안전한 저장을 위해 브라우저를 닫지 마세요.</p>
                    
                    <div className="w-full bg-slate-700 rounded-full h-3 overflow-hidden mb-2" role="progressbar" aria-label="데이터 복구 진행률" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
                        <div 
                            className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-300"
                            style={{ width: `${progress}%` }}
                        ></div>
                    </div>
                    <p className="sr-only">데이터 복구 진행률 {progress}%</p>
                    <span className="text-xs font-mono text-emerald-400 font-bold flex justify-between w-full">
                        <span>직렬화 및 저장 중...</span>
                        <span>{progress}% 완료</span>
                    </span>
                </div>
            </div>
        </div>,
        document.body
    );
};

type HeapPerformance = Performance & { memory?: { usedJSHeapSize?: number } };
type RestorePayloadObject = Partial<BackupPayload> & Record<string, unknown>;

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const getUsedHeapSize = () => (performance as HeapPerformance).memory?.usedJSHeapSize ?? null;
const getErrorMessage = (error: unknown) => error instanceof Error ? error.message : '알 수 없는 오류';
const createLegacyId = () => `LEGACY-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
const LAST_VIEW_STORAGE_KEY = 'tbmLastView';
const ALLOWED_VIEWS = new Set(['dashboard', 'new', 'risk-assessment', 'reports', 'data-lab']);

const isRestoreEntry = (value: unknown): value is TBMEntry => {
    if (!isRecord(value)) return false;
    return typeof value.date === 'string' || typeof value.id === 'string' || typeof value.teamName === 'string';
};

const isRestoreAssessment = (value: unknown): value is Partial<MonthlyRiskAssessment> & Record<string, unknown> => {
    if (!isRecord(value)) return false;
    return typeof value.month === 'string';
};

const isRestoreTeam = (value: unknown): value is TeamOption => {
    if (!isRecord(value)) return false;
    return typeof value.id === 'string' && typeof value.name === 'string';
};

const sanitizeAssessment = (assessment: Partial<MonthlyRiskAssessment> & Record<string, unknown>): MonthlyRiskAssessment => ({
    id: typeof assessment.id === 'string' && assessment.id ? assessment.id : createLegacyId(),
    type: assessment.type === 'INITIAL' || assessment.type === 'REGULAR' || assessment.type === 'MONTHLY' ? assessment.type : undefined,
    month: typeof assessment.month === 'string' ? assessment.month : '',
    fileName: typeof assessment.fileName === 'string' ? assessment.fileName : 'legacy-import',
    priorities: Array.isArray(assessment.priorities) ? assessment.priorities as SafetyGuideline[] : [],
    createdAt: typeof assessment.createdAt === 'number' ? assessment.createdAt : Date.now(),
});

const readStoredArray = <T,>(storageKey: string): T[] => {
    try {
        const raw = localStorage.getItem(storageKey);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed as T[] : [];
    } catch {
        return [];
    }
};

const COMMAND_STATUSES = new Set(['NOT_STARTED', 'IN_PROGRESS', 'DONE', 'DELAYED']);
const COMMAND_PRIORITIES = new Set(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']);

const isRestoreActivityLog = (value: unknown): value is AppActivityLog => {
    if (!isRecord(value)) return false;
    return typeof value.id === 'string' && typeof value.timestamp === 'number' && typeof value.message === 'string';
};

const isRestoreLabSnapshot = (value: unknown): value is LabSnapshot => {
    if (!isRecord(value)) return false;
    return typeof value.id === 'string'
        && typeof value.label === 'string'
        && typeof value.savedAt === 'string'
        && isRecord(value.filter);
};

const isRestoreCommandTask = (value: unknown): value is SmartCommandTask => {
    if (!isRecord(value)) return false;
    return typeof value.id === 'string'
        && typeof value.title === 'string'
        && typeof value.instruction === 'string'
        && typeof value.rationale === 'string'
        && typeof value.createdAt === 'number'
        && typeof value.updatedAt === 'number'
        && typeof value.status === 'string'
        && COMMAND_STATUSES.has(value.status)
        && typeof value.priority === 'string'
        && COMMAND_PRIORITIES.has(value.priority);
};

type DataLabFocusTarget = 'NORMALIZATION_WORKFLOW' | null;

const App = () => {
  const [currentView, setCurrentView] = useState('dashboard');
  const [entries, setEntries] = useState<TBMEntry[]>([]);
  const [teams, setTeams] = useState<TeamOption[]>(TEAMS);
  const [assessments, setAssessments] = useState<MonthlyRiskAssessment[]>([]);
  const [signatures, setSignatures] = useState<{ safety: string | null; site: string | null }>({ safety: null, site: null });
    const [teamNormalizationLogs, setTeamNormalizationLogs] = useState<TeamNormalizationLog[]>([]);
        const [teamNormalizationRequests, setTeamNormalizationRequests] = useState<TeamNormalizationRequest[]>([]);
  
  // [NEW] Site Config State
  const [siteConfig, setSiteConfig] = useState<SiteConfig>({
      siteName: '용인 푸르지오 원클러스터 2,3단지',
      managerName: '박성훈 부장',
      userApiKey: null,
      linkageTargetRate: 90,
  });
  
  const [reportTargetEntries, setReportTargetEntries] = useState<TBMEntry[]>([]);
    const [reportPrefillTeamName, setReportPrefillTeamName] = useState<string | null>(null);
    const [reportPrefillLinkStatus, setReportPrefillLinkStatus] = useState<'all' | 'unlinked' | 'mismatched'>('all');
  const [showReportModal, setShowReportModal] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showIdentity, setShowIdentity] = useState(false); 
    const [dataLabFocusTarget, setDataLabFocusTarget] = useState<DataLabFocusTarget>(null);
  
  const [isRestoring, setIsRestoring] = useState(false); 
  const [restoreProgress, setRestoreProgress] = useState(0); 
    const [appStatusMessage, setAppStatusMessage] = useState('');
        const [activityLogs, setActivityLogs] = useState<AppActivityLog[]>([]);
        const [dataLabStorageRevision, setDataLabStorageRevision] = useState(0);

  const [editingEntry, setEditingEntry] = useState<TBMEntry | null>(null);
  const [entryMode, setEntryMode] = useState<'ROUTINE' | 'BATCH'>('ROUTINE');
  const mountedRef = useRef(true);
    const normalizationLogsRef = useRef<TeamNormalizationLog[]>([]);
    const normalizationRequestsRef = useRef<TeamNormalizationRequest[]>([]);
        const activityLogsRef = useRef<AppActivityLog[]>([]);
    const { confirmDialogState, requestConfirm, closeConfirmDialog } = useConfirmDialog();

    React.useEffect(() => {
            normalizationLogsRef.current = teamNormalizationLogs;
    }, [teamNormalizationLogs]);

    React.useEffect(() => {
        normalizationRequestsRef.current = teamNormalizationRequests;
    }, [teamNormalizationRequests]);

    React.useEffect(() => {
        activityLogsRef.current = activityLogs;
    }, [activityLogs]);

  const appendActivityLog = async (message: string) => {
      const normalizedMessage = message.trim();
      if (!normalizedMessage) return;

      const latest = activityLogsRef.current[0];
      if (latest && latest.message === normalizedMessage && Date.now() - latest.timestamp < 2000) {
          return;
      }

      const nextLog: AppActivityLog = {
          id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          timestamp: Date.now(),
          message: normalizedMessage,
      };
      const updatedLogs = [nextLog, ...(activityLogsRef.current || [])].slice(0, 120);
      activityLogsRef.current = updatedLogs;
      if (mountedRef.current) setActivityLogs(updatedLogs);
      await StorageDB.set('activityLogs', updatedLogs);
  };

  const announceStatus = (message: string, persist = true) => {
      if (!mountedRef.current) return;
      setAppStatusMessage('');
      requestAnimationFrame(() => {
          if (mountedRef.current) {
              setAppStatusMessage(message);
          }
      });
      if (persist) {
          void appendActivityLog(message);
      }
  };

    React.useEffect(() => {
    mountedRef.current = true;
    const loadData = async () => {
        const storedLastView = localStorage.getItem(LAST_VIEW_STORAGE_KEY);
        if (storedLastView && ALLOWED_VIEWS.has(storedLastView) && mountedRef.current) {
            setCurrentView(storedLastView);
        }

        // 1. Critical Config (Sync Load priority)
        const loadedConfig = loadStoredSiteConfig({
            siteName: '용인 푸르지오 원클러스터 2,3단지',
            managerName: '박성훈 부장',
            userApiKey: null,
            linkageTargetRate: 90,
        });
        if (mountedRef.current) setSiteConfig(loadedConfig);

        // 2. Data Load
        const storedEntries = await StorageDB.get<TBMEntry[]>('entries');
        if (storedEntries && mountedRef.current) setEntries(storedEntries);
        
        const storedAssessments = await StorageDB.get<MonthlyRiskAssessment[]>('assessments');
        if (storedAssessments && mountedRef.current) setAssessments(storedAssessments);
        
        const storedSignatures = await StorageDB.get<{ safety: string | null; site: string | null }>('signatures');
        if (storedSignatures && mountedRef.current) setSignatures(storedSignatures);

        const storedTeams = await StorageDB.get<TeamOption[]>('teams');
        if (storedTeams && storedTeams.length > 0) {
            if (mountedRef.current) setTeams(storedTeams);
        } else {
            await StorageDB.set('teams', TEAMS);
            if (mountedRef.current) setTeams(TEAMS);
        }

        const storedNormalizationLogs = await StorageDB.get<TeamNormalizationLog[]>('teamNormalizationLogs');
        if (storedNormalizationLogs && mountedRef.current) {
            setTeamNormalizationLogs(storedNormalizationLogs);
        }

        const storedNormalizationRequests = await StorageDB.get<TeamNormalizationRequest[]>('teamNormalizationRequests');
        if (storedNormalizationRequests && mountedRef.current) {
            setTeamNormalizationRequests(storedNormalizationRequests);
        }

        const storedActivityLogs = await StorageDB.get<AppActivityLog[]>('activityLogs');
        if (storedActivityLogs && storedActivityLogs.length > 0 && mountedRef.current) {
            setActivityLogs(storedActivityLogs);
            activityLogsRef.current = storedActivityLogs;
            const latest = storedActivityLogs[0];
            announceStatus(`직전 작업 복원: ${latest.message}`, false);
        }
    };
    loadData();
        return () => { mountedRef.current = false; };
  }, []);

  React.useEffect(() => {
      if (!ALLOWED_VIEWS.has(currentView)) return;
      localStorage.setItem(LAST_VIEW_STORAGE_KEY, currentView);
  }, [currentView]);

  const handleSaveEntry = async (data: TBMEntry | TBMEntry[], shouldExit = true) => {
      let updatedEntries = [...entries];
      if (Array.isArray(data)) {
          updatedEntries = [...data, ...entries];
      } else {
          const existingIndex = entries.findIndex(e => e.id === data.id);
          if (existingIndex >= 0) {
              updatedEntries[existingIndex] = data;
          } else {
              updatedEntries = [data, ...entries];
          }
      }
      setEntries(updatedEntries);
      await StorageDB.set('entries', updatedEntries);
      if (shouldExit) {
        setCurrentView('dashboard');
        setEditingEntry(null);
      }
      return true;
  };

  const handleRequestDelete = async (id: string) => {
      const isConfirmed = await requestConfirm('정말 삭제하시겠습니까?', { title: '기록 삭제', variant: 'danger' });
      if (!isConfirmed) return;

      const updated = entries.filter(e => e.id !== id);
      setEntries(updated);
      await StorageDB.set('entries', updated);
      announceStatus('기록이 삭제되었습니다.');
  };

  const handleBulkDelete = async (ids: string[]) => {
      if (ids.length === 0) return;
      const isConfirmed = await requestConfirm(`선택한 ${ids.length}건의 데이터를 영구 삭제하시겠습니까?\n(이 작업은 되돌릴 수 없습니다)`, {
          title: '일괄 삭제',
          confirmLabel: '삭제',
          variant: 'danger'
      });
      if (!isConfirmed) return;

      const updated = entries.filter(e => !ids.includes(e.id));
      setEntries(updated);
      await StorageDB.set('entries', updated);
      announceStatus(`${ids.length}건의 기록이 삭제되었습니다.`);
  };

  const handleSaveAssessment = async (data: MonthlyRiskAssessment[]) => {
      setAssessments(data);
      await StorageDB.set('assessments', data);
  };

  const handleUpdateSignature = async (role: 'safety' | 'site', dataUrl: string) => {
      const newSigs = { ...signatures, [role]: dataUrl };
      setSignatures(newSigs);
      await StorageDB.set('signatures', newSigs);
  };

  // [NEW] Update Site Config
  const handleUpdateSiteConfig = (newConfig: SiteConfig) => {
      const cleanConfig = {
          ...newConfig,
          userApiKey: newConfig.userApiKey?.trim() || null
      };
      setSiteConfig(cleanConfig);
      persistSiteConfig(cleanConfig);
  };

  const handleAddTeam = async (name: string, category: string) => {
      const newTeam: TeamOption = {
          id: `team-${Date.now()}`,
          name: name,
          category: category
      };
      const updatedTeams = [...teams, newTeam];
      setTeams(updatedTeams);
      await StorageDB.set('teams', updatedTeams);
  };

  const handleDeleteTeam = async (id: string) => {
      const isConfirmed = await requestConfirm('팀을 삭제하시겠습니까? (기존 일지 데이터는 유지됩니다)', { title: '팀 삭제', confirmLabel: '삭제', variant: 'danger' });
      if (!isConfirmed) return;

      const updatedTeams = teams.filter(t => t.id !== id);
      setTeams(updatedTeams);
      await StorageDB.set('teams', updatedTeams);
      announceStatus('팀 정보가 삭제되었습니다.');
  };

  const resolveEntryTeamLabel = (entry: TBMEntry) => {
      return getEntryTeamLabel(entry, teams);
  };

  const appendTeamNormalizationLog = async (payload: Omit<TeamNormalizationLog, 'id' | 'actedAt' | 'actor'>) => {
      const newLog: TeamNormalizationLog = {
          id: `tnl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          actedAt: Date.now(),
          actor: siteConfig.managerName || '관리자',
          ...payload,
      };
      const updatedLogs = [newLog, ...(normalizationLogsRef.current || [])].slice(0, 200);
      setTeamNormalizationLogs(updatedLogs);
      normalizationLogsRef.current = updatedLogs;
      await StorageDB.set('teamNormalizationLogs', updatedLogs);
  };

  const updateTeamNormalizationRequests = async (nextRequests: TeamNormalizationRequest[]) => {
      const sorted = [...nextRequests].sort((left, right) => right.requestedAt - left.requestedAt).slice(0, 300);
      setTeamNormalizationRequests(sorted);
      normalizationRequestsRef.current = sorted;
      await StorageDB.set('teamNormalizationRequests', sorted);
  };

  const handleRequestNormalization = async (payload: {
      sourceLabel: string;
      action: 'MAP_TO_EXISTING' | 'PROMOTE_AND_MAP';
      targetTeamId?: string;
      targetTeamName?: string;
  }) => {
      const requestedBy = siteConfig.managerName || '실무자';
      const duplicate = (normalizationRequestsRef.current || []).some(request =>
          request.status === 'PENDING'
          && request.sourceLabel === payload.sourceLabel
          && request.action === payload.action
          && (request.targetTeamId || '') === (payload.targetTeamId || '')
      );
      if (duplicate) {
          announceStatus('동일한 정규화 요청이 이미 대기 중입니다.');
          return;
      }

      const request: TeamNormalizationRequest = {
          id: `tnr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          requestedAt: Date.now(),
          requestedBy,
          sourceLabel: payload.sourceLabel,
          action: payload.action,
          targetTeamId: payload.targetTeamId,
          targetTeamName: payload.targetTeamName,
          status: 'PENDING',
      };

      await updateTeamNormalizationRequests([request, ...(normalizationRequestsRef.current || [])]);
      announceStatus(`${payload.sourceLabel} 정규화 요청이 등록되었습니다.`);
  };

  const handleNormalizeUnknownTeam = async (sourceLabel: string, targetTeamId: string) => {
      const targetTeam = teams.find(team => team.id === targetTeamId);
      if (!targetTeam) {
          announceStatus('선택한 대상 팀을 찾을 수 없습니다.');
          return false;
      }

      let affectedCount = 0;
      const updatedEntries = entries.map(entry => {
          const label = resolveEntryTeamLabel(entry);
          if (label !== sourceLabel) return entry;
          affectedCount += 1;
          return {
              ...entry,
              ...buildEntryTeamPayload([targetTeam.id], teams),
          };
      });

      if (affectedCount === 0) {
          announceStatus('정규화 대상 기록이 없습니다.');
          return false;
      }

      setEntries(updatedEntries);
      await Promise.all([
          StorageDB.set('entries', updatedEntries),
          appendTeamNormalizationLog({
              sourceLabel,
              action: 'MAP_TO_EXISTING',
              targetTeamId: targetTeam.id,
              targetTeamName: targetTeam.name,
              affectedCount,
          })
      ]);
      announceStatus(`${sourceLabel} 항목을 ${targetTeam.name} 팀으로 정규화했습니다.`);
      return true;
  };

  const handlePromoteUnknownTeam = async (sourceLabel: string) => {
      const cleanLabel = sourceLabel.trim();
      if (!cleanLabel || cleanLabel === '미지정 팀') {
          announceStatus('미지정 팀은 신규 등록 대신 기존 팀으로 치환해 주세요.');
          return false;
      }

      const existingTeam = teams.find(team => team.name.trim() === cleanLabel);
      if (existingTeam) {
          return handleNormalizeUnknownTeam(cleanLabel, existingTeam.id);
      }

      const newTeam: TeamOption = {
          id: `team-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: cleanLabel,
          category: '미분류',
      };
      const updatedTeams = [...teams, newTeam];
      let affectedCount = 0;
      const updatedEntries = entries.map(entry => {
          const label = resolveEntryTeamLabel(entry);
          if (label !== cleanLabel) return entry;
          affectedCount += 1;
          return {
              ...entry,
              ...buildEntryTeamPayload([newTeam.id], updatedTeams),
          };
      });

      setTeams(updatedTeams);
      setEntries(updatedEntries);
      await Promise.all([
          StorageDB.set('teams', updatedTeams),
          StorageDB.set('entries', updatedEntries),
          appendTeamNormalizationLog({
              sourceLabel: cleanLabel,
              action: 'PROMOTE_AND_MAP',
              targetTeamId: newTeam.id,
              targetTeamName: newTeam.name,
              affectedCount,
          })
      ]);
      announceStatus(`${cleanLabel} 팀을 신규 등록하고 기존 기록을 정규화했습니다.`);
      return true;
  };

  const handleApproveNormalizationRequest = async (requestId: string, reasonCode: TeamNormalizationReasonCode, comment?: string) => {
      const target = (normalizationRequestsRef.current || []).find(request => request.id === requestId);
      if (!target || target.status !== 'PENDING') {
          announceStatus('승인 대상 요청을 찾을 수 없습니다.');
          return;
      }

      const reviewer = siteConfig.managerName || '평가자';
      let succeeded = false;
      if (target.action === 'MAP_TO_EXISTING' && target.targetTeamId) {
          succeeded = await handleNormalizeUnknownTeam(target.sourceLabel, target.targetTeamId);
      } else if (target.action === 'PROMOTE_AND_MAP') {
          succeeded = await handlePromoteUnknownTeam(target.sourceLabel);
      }

      if (!succeeded) {
          announceStatus('정규화 승인 처리 중 반영에 실패했습니다. 조건을 다시 확인해주세요.');
          return;
      }

      const updated = (normalizationRequestsRef.current || []).map(request =>
          request.id === requestId
              ? {
                  ...request,
                  status: 'APPROVED' as const,
                  reviewReasonCode: reasonCode,
                  reviewComment: comment?.trim() || undefined,
                  reviewedAt: Date.now(),
                  reviewedBy: reviewer,
              }
              : request
      );
      await updateTeamNormalizationRequests(updated);
      announceStatus(`${target.sourceLabel} 요청을 승인 처리했습니다.`);
  };

  const handleRejectNormalizationRequest = async (requestId: string, reasonCode: TeamNormalizationReasonCode, comment?: string) => {
      const target = (normalizationRequestsRef.current || []).find(request => request.id === requestId);
      if (!target || target.status !== 'PENDING') {
          announceStatus('반려 대상 요청을 찾을 수 없습니다.');
          return;
      }

      const reviewer = siteConfig.managerName || '평가자';
      const updated = (normalizationRequestsRef.current || []).map(request =>
          request.id === requestId
              ? {
                  ...request,
                  status: 'REJECTED' as const,
                  reviewReasonCode: reasonCode,
                  reviewComment: comment?.trim() || undefined,
                  reviewedAt: Date.now(),
                  reviewedBy: reviewer,
              }
              : request
      );
      await updateTeamNormalizationRequests(updated);
      announceStatus(`${target.sourceLabel} 요청을 반려 처리했습니다.`);
  };

  const handleBackupData = (scope: 'ALL' | 'TBM' | 'RISK') => {
      try {
          const backupData: BackupPayload = {
              version: '3.1.0',
              backupDate: new Date().toISOString(),
              scope: scope
          };

          if (scope === 'ALL' || scope === 'TBM') {
              backupData.entries = entries;
          }
          if (scope === 'ALL' || scope === 'RISK') {
              backupData.assessments = assessments;
          }
          if (scope === 'ALL') {
              backupData.teams = teams;
              backupData.signatures = signatures;
              backupData.teamNormalizationLogs = teamNormalizationLogs as any;
              backupData.teamNormalizationRequests = teamNormalizationRequests as any;
              backupData.activityLogs = activityLogs;
              backupData.labSnapshots = readStoredArray<LabSnapshot>(SNAPSHOT_STORAGE_KEY) as any;
              backupData.commandTasks = readStoredArray<SmartCommandTask>(COMMAND_TASK_STORAGE_KEY) as any;
              // [SECURITY FIX] Exclude API key from backup file to prevent credential leakage
              const { userApiKey: _stripped, ...siteConfigSafe } = siteConfig;
              backupData.siteConfig = siteConfigSafe;
          }

          const suffix = scope === 'ALL' ? 'FULL' : scope === 'TBM' ? 'TBM_LOGS' : 'RISK_DATA';
          const dataStr = JSON.stringify(backupData, null, 2);
          const blob = new Blob([dataStr], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `SAPA_${suffix}_BACKUP_${new Date().toISOString().slice(0, 10)}.json`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          announceStatus(`백업 파일 생성 완료: ${suffix} 범위 데이터를 저장했습니다.`);
      } catch (error) {
          console.error('Backup export failed:', error);
          announceStatus(`백업 파일 생성 중 오류가 발생했습니다: ${getErrorMessage(error)}`);
      }
  };

  // [FIXED] Soft-Refresh Restore Logic (No Page Reload)
  const handleRestoreData = async (files: FileList) => {
      // [FIX] Guard against oversized or excessive files to prevent OOM
      if (files.length > MAX_BACKUP_FILE_COUNT) {
          announceStatus(`복구 중단: 한 번에 최대 ${MAX_BACKUP_FILE_COUNT}개의 파일만 처리할 수 있습니다.`);
          return;
      }

      // [C] 총 파일 크기 예산 검사 (합산 200 MB 초과 시 조기 경고)
      const TOTAL_SIZE_BUDGET = 200 * 1024 * 1024;
      let totalInputSize = 0;
      for (let i = 0; i < files.length; i++) {
          if (files[i].size > MAX_BACKUP_FILE_SIZE) {
              announceStatus(`복구 중단: ${files[i].name} 파일이 크기 제한을 초과했습니다. 최대 50MB 파일만 복구 가능합니다.`);
              return;
          }
          totalInputSize += files[i].size;
      }
      if (totalInputSize > TOTAL_SIZE_BUDGET) {
          announceStatus(`복구 중단: 총 파일 용량 ${(totalInputSize / 1024 / 1024).toFixed(1)}MB가 너무 큽니다. 한 번에 200MB 이하로 처리해 주세요.`);
          return;
      }

      // [C] 메모리 사용량 기준점 로그 (Chrome DevTools Memory API)
      const memStart = getUsedHeapSize();
      if (memStart !== null) {
          console.info(`[Restore] 시작 힙: ${(memStart / 1024 / 1024).toFixed(1)} MB`);
      }
      setIsRestoring(true);
      setRestoreProgress(0);
    announceStatus('데이터 복구를 시작했습니다.');

      // Temporary storage for merge
      let mergedEntries = [...entries];
      let mergedAssessments = [...assessments];
      let mergedTeams = [...teams];
      let mergedSignatures = { ...signatures };
      let mergedConfig = { ...siteConfig };
    let mergedTeamNormalizationLogs = [...teamNormalizationLogs];
            let mergedTeamNormalizationRequests = [...teamNormalizationRequests];
            let mergedActivityLogs = [...activityLogs];
            let mergedLabSnapshots = readStoredArray<LabSnapshot>(SNAPSHOT_STORAGE_KEY);
            let mergedCommandTasks = readStoredArray<SmartCommandTask>(COMMAND_TASK_STORAGE_KEY);
      
      let totalFound = 0;

      try {
          const fileArray = Array.from(files);
          
          for (let i = 0; i < fileArray.length; i++) {
              const file = fileArray[i];
              const text = await new Promise<string>((resolve) => {
                  const reader = new FileReader();
                  reader.onload = () => resolve(reader.result as string);
                  reader.onerror = () => resolve("{}");
                  reader.readAsText(file);
              });

              try {
                  const json = JSON.parse(text);
                  // [UPDATED] Use Zod validation first, then fall back to shape check
                  const validated = validateBackupPayload(json);
                  if (!validated && !hasSupportedBackupShape(json)) {
                      console.warn("Skipping unsupported backup schema:", file.name);
                      continue;
                  }
                  const payloadObject: RestorePayloadObject | null = validated ?? (isRecord(json) ? json : null);
                  
                  // Strategy 1: Standard Backup Format (Object with keys)
                  if (payloadObject) {
                      let fileFound = false;
                      if (Array.isArray(payloadObject.entries)) {
                          const validEntries = payloadObject.entries.filter(isRestoreEntry);
                          mergedEntries = [...validEntries, ...mergedEntries]; 
                          totalFound += validEntries.length;
                          fileFound = true;
                      }
                      if (Array.isArray(payloadObject.assessments)) {
                          const validAss = (payloadObject.assessments as any[]).filter(isRestoreAssessment).map(sanitizeAssessment);
                          mergedAssessments = [...validAss, ...mergedAssessments];
                          totalFound += validAss.length;
                          fileFound = true;
                      }
                      if (Array.isArray(payloadObject.teams)) {
                          const existingIds = new Set(mergedTeams.map(t => t.id));
                          payloadObject.teams.filter(isRestoreTeam).forEach((t) => {
                              if (!existingIds.has(t.id)) {
                                  mergedTeams.push(t);
                                  totalFound++;
                              }
                          });
                          fileFound = true;
                      }
                      if (Array.isArray(payloadObject.teamNormalizationLogs)) {
                          const validLogs = (payloadObject.teamNormalizationLogs as any[]).filter((log): log is TeamNormalizationLog => {
                              return !!log && typeof log === 'object'
                                  && typeof (log as TeamNormalizationLog).id === 'string'
                                  && typeof (log as TeamNormalizationLog).actedAt === 'number'
                                  && typeof (log as TeamNormalizationLog).sourceLabel === 'string'
                                  && typeof (log as TeamNormalizationLog).targetTeamId === 'string';
                          });
                          mergedTeamNormalizationLogs = [...validLogs, ...mergedTeamNormalizationLogs];
                          totalFound += validLogs.length;
                          fileFound = true;
                      }
                      if (Array.isArray(payloadObject.teamNormalizationRequests)) {
                          const validRequests = (payloadObject.teamNormalizationRequests as any[]).filter((request): request is TeamNormalizationRequest => {
                              return !!request && typeof request === 'object'
                                  && typeof (request as TeamNormalizationRequest).id === 'string'
                                  && typeof (request as TeamNormalizationRequest).requestedAt === 'number'
                                  && typeof (request as TeamNormalizationRequest).sourceLabel === 'string'
                                  && ((request as TeamNormalizationRequest).status === 'PENDING' || (request as TeamNormalizationRequest).status === 'APPROVED' || (request as TeamNormalizationRequest).status === 'REJECTED');
                          });
                          mergedTeamNormalizationRequests = [...validRequests, ...mergedTeamNormalizationRequests];
                          totalFound += validRequests.length;
                          fileFound = true;
                      }
                      if (Array.isArray(payloadObject.activityLogs)) {
                          const validActivityLogs = payloadObject.activityLogs.filter(isRestoreActivityLog);
                          mergedActivityLogs = [...validActivityLogs, ...mergedActivityLogs];
                          totalFound += validActivityLogs.length;
                          fileFound = true;
                      }
                      if (Array.isArray(payloadObject.labSnapshots)) {
                          const validSnapshots = (payloadObject.labSnapshots as any[]).filter(isRestoreLabSnapshot);
                          mergedLabSnapshots = [...validSnapshots, ...mergedLabSnapshots];
                          totalFound += validSnapshots.length;
                          fileFound = true;
                      }
                      if (Array.isArray(payloadObject.commandTasks)) {
                          const validCommandTasks = (payloadObject.commandTasks as any[]).filter(isRestoreCommandTask);
                          mergedCommandTasks = [...validCommandTasks, ...mergedCommandTasks];
                          totalFound += validCommandTasks.length;
                          fileFound = true;
                      }
                      if (isRecord(payloadObject.signatures)) {
                          mergedSignatures = { ...mergedSignatures, ...payloadObject.signatures };
                      }
                      if (isRecord(payloadObject.siteConfig)) {
                          // [FIX] 복구 파일에 API 키가 없어도 현재 키를 유지 (보안상 백업에서 제외됨)
                          mergedConfig = { ...mergedConfig, ...payloadObject.siteConfig, userApiKey: siteConfig.userApiKey };
                      }
                      
                      // Fallback: If no standard keys, search recursively for arrays
                      if (!fileFound) {
                          Object.keys(payloadObject).forEach(key => {
                              const arr = payloadObject[key];
                              if (Array.isArray(arr) && arr.length > 0) {
                                  const first = arr[0];
                                  if (isRestoreEntry(first)) {
                                      const validEntries = arr.filter(isRestoreEntry);
                                      mergedEntries = [...validEntries, ...mergedEntries];
                                      totalFound += validEntries.length;
                                  } else if (isRestoreAssessment(first)) {
                                      const validAssessments = arr.filter(isRestoreAssessment).map(sanitizeAssessment);
                                      mergedAssessments = [...validAssessments, ...mergedAssessments];
                                      totalFound += validAssessments.length;
                                  }
                              }
                          });
                      }
                  } 
                  // Strategy 2: Raw Array (Legacy TBM Array)
                  else if (Array.isArray(json) && json.length > 0) {
                      const first = json[0];
                      if (isRestoreEntry(first)) {
                          const validEntries = json.filter(isRestoreEntry);
                          mergedEntries = [...validEntries, ...mergedEntries];
                          totalFound += validEntries.length;
                      } else if (isRestoreAssessment(first)) {
                          const validAssessments = json.filter(isRestoreAssessment).map(sanitizeAssessment);
                          mergedAssessments = [...validAssessments, ...mergedAssessments];
                          totalFound += validAssessments.length;
                      }
                  }
              } catch (e) {
                  console.warn("Skipping invalid file:", file.name);
              }
              
              if (mountedRef.current) {
                  setRestoreProgress(Math.round(((i + 1) / fileArray.length) * 50));
              }
              // [C] GC 양보: 이벤트 루프를 비워 브라우저가 메모리를 회수할 시간을 줌
              await new Promise(resolve => setTimeout(resolve, 10));
              // [C] 파일별 힙 사용량 기록
              const memMid = getUsedHeapSize();
              if (memMid !== null) {
                  console.debug(`[Restore] ${file.name} 처리 후 힙: ${(memMid / 1024 / 1024).toFixed(1)} MB`);
              }
          }

          if (totalFound === 0) {
              if (mountedRef.current) {
                  announceStatus('복구할 유효한 데이터가 파일에 없습니다.');
                  setIsRestoring(false);
              }
              return;
          }

          // De-duplicate Entries (restore-first precedence + safe fallback key)
          const uniqueEntryMap = new Map<string, TBMEntry>();
          mergedEntries.forEach(entry => {
              if (!entry || typeof entry !== 'object') return;

              const normalizedEntry: TBMEntry = {
                  ...entry,
                  riskFactors: Array.isArray(entry.riskFactors) ? entry.riskFactors : [],
                  safetyFeedback: Array.isArray(entry.safetyFeedback) ? entry.safetyFeedback : [],
                  createdAt: typeof entry.createdAt === 'number' ? entry.createdAt : (entry.date ? Date.parse(entry.date) : Date.now()),
                  ...buildEntryTeamPayload(getEntryTeamIds(entry), teams, getEntryTeamNames(entry, teams)),
              };

              const rawId = normalizedEntry.id;
              const hasStableId =
                  (typeof rawId === 'string' && rawId.trim().length > 0)
                  || typeof rawId === 'number';

              const key = hasStableId
                  ? `id:${String(rawId)}`
                  : `legacy:${normalizedEntry.date || ''}|${getEntryTeamLabel(normalizedEntry, teams)}|${(normalizedEntry.time || '').trim()}|${(normalizedEntry.workDescription || '').trim()}`;

              // Keep first occurrence so newly restored records (prepended earlier) win over stale local copies.
              if (!uniqueEntryMap.has(key)) {
                  uniqueEntryMap.set(key, normalizedEntry);
              }
          });
          const finalEntries = Array.from(uniqueEntryMap.values());

          // De-duplicate Assessments (restore-first precedence)
          const uniqueAssMap = new Map<string, MonthlyRiskAssessment>();
          mergedAssessments.forEach(assessment => {
              if (!assessment || typeof assessment !== 'object') return;
              const key = (typeof assessment.id === 'string' && assessment.id.trim().length > 0)
                  ? `id:${assessment.id}`
                  : `month:${assessment.month || ''}|type:${assessment.type || 'MONTHLY'}`;
              if (!uniqueAssMap.has(key)) {
                  uniqueAssMap.set(key, assessment);
              }
          });
          const finalAssessments = Array.from(uniqueAssMap.values());

          const uniqueLogMap = new Map<string, TeamNormalizationLog>();
          mergedTeamNormalizationLogs.forEach(log => {
              if (!log?.id) return;
              uniqueLogMap.set(log.id, log);
          });
          const finalNormalizationLogs = Array.from(uniqueLogMap.values())
              .sort((a, b) => b.actedAt - a.actedAt)
              .slice(0, 200);

          const uniqueRequestMap = new Map<string, TeamNormalizationRequest>();
          mergedTeamNormalizationRequests.forEach(request => {
              if (!request?.id) return;
              uniqueRequestMap.set(request.id, request);
          });
          const finalNormalizationRequests = Array.from(uniqueRequestMap.values())
              .sort((a, b) => b.requestedAt - a.requestedAt)
              .slice(0, 300);

          const uniqueActivityLogMap = new Map<string, AppActivityLog>();
          mergedActivityLogs.forEach(log => {
              if (!log?.id) return;
              if (!uniqueActivityLogMap.has(log.id)) {
                  uniqueActivityLogMap.set(log.id, log);
              }
          });
          const finalActivityLogs = Array.from(uniqueActivityLogMap.values())
              .sort((a, b) => b.timestamp - a.timestamp)
              .slice(0, 120);

          const uniqueSnapshotMap = new Map<string, LabSnapshot>();
          mergedLabSnapshots.forEach(snapshot => {
              if (!snapshot?.id) return;
              if (!uniqueSnapshotMap.has(snapshot.id)) {
                  uniqueSnapshotMap.set(snapshot.id, snapshot);
              }
          });
          const finalLabSnapshots = Array.from(uniqueSnapshotMap.values())
              .sort((a, b) => (b.savedAt || '').localeCompare(a.savedAt || ''))
              .slice(0, 10);

          const uniqueCommandTaskMap = new Map<string, SmartCommandTask>();
          mergedCommandTasks.forEach(task => {
              if (!task?.id) return;
              if (!uniqueCommandTaskMap.has(task.id)) {
                  uniqueCommandTaskMap.set(task.id, task);
              }
          });
          const finalCommandTasks = Array.from(uniqueCommandTaskMap.values())
              .sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));

          if (mountedRef.current) setRestoreProgress(70);

          // Save to DB
          await StorageDB.set('entries', finalEntries);
          await StorageDB.set('assessments', finalAssessments);
          await StorageDB.set('teams', mergedTeams);
          await StorageDB.set('signatures', mergedSignatures);
          await StorageDB.set('teamNormalizationLogs', finalNormalizationLogs);
          await StorageDB.set('teamNormalizationRequests', finalNormalizationRequests);
          await StorageDB.set('activityLogs', finalActivityLogs);
          localStorage.setItem(SNAPSHOT_STORAGE_KEY, JSON.stringify(finalLabSnapshots));
          localStorage.setItem(COMMAND_TASK_STORAGE_KEY, JSON.stringify(finalCommandTasks));
          // [SECURITY FIX] API 키는 sessionStorage에만 보관
          persistSiteConfig(mergedConfig);

          if (mountedRef.current) setRestoreProgress(100);
          await new Promise(r => setTimeout(r, 800));

          // Soft Update (No Reload)
          if (mountedRef.current) {
              setEntries(finalEntries);
              setAssessments(finalAssessments);
              setTeams(mergedTeams);
              setSignatures(mergedSignatures);
              setSiteConfig(mergedConfig);
              setTeamNormalizationLogs(finalNormalizationLogs);
              setTeamNormalizationRequests(finalNormalizationRequests);
              setActivityLogs(finalActivityLogs);
              activityLogsRef.current = finalActivityLogs;
              setDataLabStorageRevision(prev => prev + 1);
          }
          
          if (mountedRef.current) {
              setIsRestoring(false);
              setIsSettingsOpen(false); // Close modal
          }

          // [C] 완료 후 힙 증가량 요약
          const memEnd = getUsedHeapSize();
          if (memStart !== null && memEnd !== null) {
              const delta = ((memEnd - memStart) / 1024 / 1024).toFixed(1);
              const sign = Number(delta) >= 0 ? '+' : '';
              console.info(`[Restore] 완료. 힙 변화: ${sign}${delta} MB (최종 ${(memEnd / 1024 / 1024).toFixed(1)} MB)`);
          }
          
          if (mountedRef.current) {
              announceStatus(`데이터 복구 완료: 총 ${totalFound}건의 데이터가 처리되었습니다.`);
              setCurrentView('dashboard'); // Navigate to home
          }

      } catch (err) {
          console.error("Critical Restore Error:", err);
          if (mountedRef.current) {
              announceStatus(`복구 중 치명적 오류가 발생했습니다: ${getErrorMessage(err)}`);
              setIsRestoring(false);
          }
      }
  };

  // [NEW] Data Optimization: Robust Deduplication for TBM and Risk Assessments
  const handleOptimizeData = async () => {
      // 1. Optimize TBM Entries (Comparison: Date + Team + Time)
      const uniqueEntryMap = new Map<string, TBMEntry>();
      let duplicatesCount = 0;

      // Sort by Quality then Recency
      // Prioritize: Video > Photo > Recency
      const sortedEntries = [...entries].sort((a, b) => {
          const scoreA = (a.videoAnalysis ? 10 : 0) + (a.tbmPhotoUrl ? 5 : 0);
          const scoreB = (b.videoAnalysis ? 10 : 0) + (b.tbmPhotoUrl ? 5 : 0);
          if (scoreB !== scoreA) return scoreB - scoreA;
          return (b.createdAt || 0) - (a.createdAt || 0); // Newer wins
      });

      sortedEntries.forEach(entry => {
          // Normalize key to prevent whitespace mismatches
          const d = (entry.date || '').trim();
          const t = getEntryTeamLabel(entry, teams).trim();
          const tm = (entry.time || '').trim();
          
          if (!d) return; // Skip invalid data

          const key = `${d}|${t}|${tm}`;
          if (uniqueEntryMap.has(key)) {
              duplicatesCount++;
          } else {
              uniqueEntryMap.set(key, entry);
          }
      });
      const optimizedEntries = Array.from(uniqueEntryMap.values());

      // 2. Optimize Risk Assessments (Comparison: Month + Type)
      const uniqueAssMap = new Map<string, MonthlyRiskAssessment>();
      let duplicatesAss = 0;
      
      // Filter out totally invalid ones (missing month)
      const validAssessments = assessments.filter(a => a && a.month);
      
      // Sort: Content Length > Newer
      // Keep the one with the most content (priorities)
      validAssessments.sort((a, b) => {
          const lenA = Array.isArray(a.priorities) ? a.priorities.length : 0;
          const lenB = Array.isArray(b.priorities) ? b.priorities.length : 0;
          if (lenB !== lenA) return lenB - lenA; // Keep one with more data
          return (b.createdAt || 0) - (a.createdAt || 0);
      });

      validAssessments.forEach(ass => {
          // Normalize Key: e.g., "2024-01|MONTHLY"
          const m = (ass.month || '').trim();
          const type = (ass.type || 'MONTHLY').trim();
          
          const key = `${m}|${type}`;
          
          if (uniqueAssMap.has(key)) {
              duplicatesAss++;
          } else {
              // Sanitize while we are here: Ensure ID and Priorities array exist
              const safeAss = { ...ass };
              if (!Array.isArray(safeAss.priorities)) safeAss.priorities = [];
              if (!safeAss.id) safeAss.id = `FIXED-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
              uniqueAssMap.set(key, safeAss);
          }
      });
      const optimizedAssessments = Array.from(uniqueAssMap.values());

      if (duplicatesCount === 0 && duplicatesAss === 0) {
          announceStatus('삭제할 중복 데이터가 없습니다. 이미 최적화된 상태입니다.');
          return;
      }
      
      // Commit Changes
      await StorageDB.set('entries', optimizedEntries);
      await StorageDB.set('assessments', optimizedAssessments);
      
      // Update State Immediately
      setEntries(optimizedEntries);
      setAssessments(optimizedAssessments);
      
      announceStatus(`최적화 완료: TBM 일지 중복 ${duplicatesCount}건, 위험성평가 중복 ${duplicatesAss}건을 제거했습니다.`);
  };

  const handleEditEntry = (entry: TBMEntry) => {
      setEditingEntry(entry);
      setEntryMode('ROUTINE');
      setCurrentView('new');
  };

  const linkedRiskAssessment = useMemo(() => {
      const valid = [...assessments].filter(a => Array.isArray(a.priorities) && a.priorities.length > 0);
      if (valid.length === 0) return undefined;

      return valid.sort((a, b) => {
          // 1. MONTHLY(월간/수시) 우선
          const monthlyWeightA = a.type === 'MONTHLY' ? 1 : 0;
          const monthlyWeightB = b.type === 'MONTHLY' ? 1 : 0;
          if (monthlyWeightA !== monthlyWeightB) {
              return monthlyWeightB - monthlyWeightA;
          }

          // 2. 최신 월(month) 우선
          const monthA = a.month || '';
          const monthB = b.month || '';
          if (monthA !== monthB) {
              return monthB.localeCompare(monthA);
          }

          // 3. 최신 등록일(createdAt) 우선
          return (b.createdAt ?? 0) - (a.createdAt ?? 0);
      })[0];
  }, [assessments]);

  const monthlyGuidelines: SafetyGuideline[] = useMemo(() => {
      return linkedRiskAssessment?.priorities ?? [];
  }, [linkedRiskAssessment]);

  const dashboardNormalizationAlertSummary = useMemo(() => {
      const now = Date.now();
      const pendingRequests = teamNormalizationRequests.filter(request => request.status === 'PENDING');
      const reviewedRequests = teamNormalizationRequests.filter(request => request.status !== 'PENDING');

      const pendingAgesHours = pendingRequests.map(request => Math.max(0, (now - request.requestedAt) / (1000 * 60 * 60)));
      const pendingAvgHours = pendingAgesHours.length > 0
          ? Number((pendingAgesHours.reduce((sum, age) => sum + age, 0) / pendingAgesHours.length).toFixed(1))
          : 0;
      const pendingOver24h = pendingAgesHours.filter(age => age >= 24).length;
      const rejectedCount = reviewedRequests.filter(request => request.status === 'REJECTED').length;

      const alerts: Array<{ level: 'critical' | 'warning'; label: string }> = [];
      if (pendingOver24h >= 3) {
          alerts.push({ level: 'critical', label: '24시간 초과 대기 다수(3건+)' });
      } else if (pendingOver24h > 0) {
          alerts.push({ level: 'warning', label: '24시간 초과 대기 발생' });
      }
      if (pendingAvgHours >= 12) {
          alerts.push({ level: 'warning', label: '평균 대기시간 12시간 이상' });
      }
      if (rejectedCount >= 5) {
          alerts.push({ level: 'warning', label: '반려 누적 5건 이상' });
      }

      return {
          criticalCount: alerts.filter(alert => alert.level === 'critical').length,
          warningCount: alerts.filter(alert => alert.level === 'warning').length,
          pendingCount: pendingRequests.length,
          pendingOver24h,
          topAlertLabel: alerts[0]?.label || null,
      };
  }, [teamNormalizationRequests]);
  return (
    <div className="flex bg-slate-50 min-h-screen font-sans text-slate-900" aria-busy={isRestoring}>
            <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{appStatusMessage}</p>
      {isRestoring && <RestoreOverlay progress={restoreProgress} />}
      
      <Navigation 
        currentView={currentView} 
                setCurrentView={(view) => {
                        if (view === 'reports') {
                                setReportPrefillTeamName(null);
                        setReportPrefillLinkStatus('all');
                        }
                        setCurrentView(view);
                }}
                managerName={siteConfig.managerName}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onShowHistory={() => setShowHistory(true)}
        onShowIdentity={() => setShowIdentity(true)} 
        onNewEntryClick={() => { setEditingEntry(null); setEntryMode('ROUTINE'); setCurrentView('new'); }}
      />
      
      <main className="flex-1 ml-0 md:ml-72 p-4 md:p-8 overflow-x-hidden">
        <Suspense fallback={<div className="flex items-center justify-center h-screen"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div></div>}>
            {(() => {
                switch (currentView) {
                  case 'new':
                    return <TBMForm 
                        onSave={handleSaveEntry} 
                        onCancel={() => setCurrentView('dashboard')}
                        monthlyGuidelines={monthlyGuidelines}
                        riskAssessments={assessments}
                        linkedRiskAssessment={linkedRiskAssessment ? {
                            id: linkedRiskAssessment.id,
                            fileName: linkedRiskAssessment.fileName,
                            label: linkedRiskAssessment.type === 'INITIAL'
                                ? '최초 위험성평가'
                                : linkedRiskAssessment.type === 'REGULAR'
                                ? '정기 위험성평가'
                                : '월간/수시 위험성평가',
                            total: linkedRiskAssessment.priorities.length,
                            high: linkedRiskAssessment.priorities.filter(item => item.level === 'HIGH').length,
                            actionNotes: linkedRiskAssessment.priorities.filter(item => !!item.actionNote?.trim()).length,
                        } : undefined}
                        initialData={editingEntry || undefined}
                        onDelete={handleRequestDelete}
                        teams={teams}
                        mode={entryMode}
                    />;
                  case 'risk-assessment':
                    return <RiskAssessmentManager 
                        assessments={assessments} 
                        onSave={handleSaveAssessment}
                        onRestoreData={handleRestoreData} 
                    />;
                  case 'reports':
                    return <ReportCenter 
                        entries={entries} 
                        onOpenPrintModal={(targetEntries) => { setReportTargetEntries(targetEntries); setShowReportModal(true); }}
                        signatures={signatures}
                        teams={teams}
                        initialTeamName={reportPrefillTeamName}
                        initialLinkStatus={reportPrefillLinkStatus}
                        onDelete={handleRequestDelete} 
                        onBulkDelete={handleBulkDelete}
                    />;
                  case 'data-lab': 
                    return <SafetyDataLab 
                        entries={entries} 
                        teams={teams} 
                        onBackupData={handleBackupData} 
                        onRestoreData={handleRestoreData}
                        siteConfig={siteConfig}
                        onRequestNormalization={handleRequestNormalization}
                        onApproveNormalizationRequest={handleApproveNormalizationRequest}
                        onRejectNormalizationRequest={handleRejectNormalizationRequest}
                        normalizationLogs={teamNormalizationLogs}
                        normalizationRequests={teamNormalizationRequests}
                                                focusTarget={dataLabFocusTarget}
                                                onFocusTargetHandled={() => setDataLabFocusTarget(null)}
                        storageRevision={dataLabStorageRevision}
                    />;
                  default:
                    return <Dashboard 
                        entries={entries}
                        siteName={siteConfig.siteName} // [NEW] Pass Config
                        normalizationAlertSummary={dashboardNormalizationAlertSummary}
                        onViewReport={() => { setReportTargetEntries(entries); setShowReportModal(true); }} 
                        onNavigateToReports={(options) => {
                            setReportPrefillTeamName(options?.teamName?.trim() || null);
                            setReportPrefillLinkStatus(options?.linkStatus || 'all');
                            setCurrentView('reports');
                        }} 
                        onNavigateToDataLab={(options) => {
                            setDataLabFocusTarget(options?.focusTarget || null);
                            setCurrentView('data-lab');
                        }}
                        onNewEntry={()=>{setEditingEntry(null); setEntryMode('ROUTINE'); setCurrentView('new')}} 
                        onEdit={handleEditEntry} 
                        onOpenSettings={()=>setIsSettingsOpen(true)} 
                        onDelete={handleRequestDelete} 
                        onPrintSingle={(entry) => { setReportTargetEntries([entry]); setShowReportModal(true); }} 
                    />;
                }
            })()}
        </Suspense>
      </main>

      {showReportModal && (
          <ReportView 
            entries={reportTargetEntries} 
            teams={teams}
            siteName={siteConfig.siteName} // [NEW] Pass Config
            onClose={() => setShowReportModal(false)}
            signatures={signatures}
            onUpdateSignature={handleUpdateSignature}
            onEdit={(entry) => { setShowReportModal(false); handleEditEntry(entry); }}
            onDelete={async (id) => { await handleRequestDelete(id); setShowReportModal(false); }}
          />
      )}

    {showHistory && <HistoryModal onClose={() => setShowHistory(false)} recentActivities={activityLogs} />}
      
      {showIdentity && <SystemIdentityModal onClose={() => setShowIdentity(false)} />}
      
      <SettingsModal 
         isOpen={isSettingsOpen} 
         onClose={() => setIsSettingsOpen(false)} 
         signatures={signatures}
         onUpdateSignature={handleUpdateSignature}
         teams={teams}
         onAddTeam={handleAddTeam}
         onDeleteTeam={handleDeleteTeam}
         onBackupData={handleBackupData}
         onRestoreData={handleRestoreData}
         onOptimizeData={handleOptimizeData}
         siteConfig={siteConfig} // [NEW] Pass Config
         onUpdateSiteConfig={handleUpdateSiteConfig} // [NEW] Handler
      />

        <ConfirmDialog
            isOpen={confirmDialogState.isOpen}
            title={confirmDialogState.title}
            message={confirmDialogState.message}
            confirmLabel={confirmDialogState.confirmLabel}
            cancelLabel={confirmDialogState.cancelLabel}
            variant={confirmDialogState.variant}
            onConfirm={() => closeConfirmDialog(true)}
            onCancel={() => closeConfirmDialog(false)}
        />
    </div>
  );
};

export default App;