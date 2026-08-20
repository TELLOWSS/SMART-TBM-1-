
import React, { useState, useMemo, useRef } from 'react';
import { TBMEntry, TeamOption, CommandTask as SmartCommandTask, CommandPriority as SmartCommandPriority, CommandStatus as SmartCommandStatus, CommandStatusHistoryItem, SiteConfig, TeamNormalizationLog, TeamNormalizationRequest, TeamNormalizationReasonCode, LabSnapshot } from '../types';
import { getEntryTeamIds, getEntryTeamLabel, getEntryTeamNames } from '../utils/teamUtils';
import { BarChart2, TrendingUp, BrainCircuit, Activity, Database, Info, Hexagon, Radar, ShieldCheck, Upload, HardDrive, Search, AlertTriangle, Users, Zap, Layers, FileText, Download, Share2, Target, CheckCircle2, XCircle, Filter, ClipboardList, Plus, Trash2 } from 'lucide-react';
import { generateGeneralInsight } from '../services/geminiService';

interface SafetyDataLabProps {
    entries: TBMEntry[];
    teams: TeamOption[];
    onBackupData: (scope: 'ALL' | 'TBM' | 'RISK') => void;
    onRestoreData: (files: FileList) => void;
    siteConfig?: SiteConfig;
    onRequestNormalization?: (payload: { sourceLabel: string; action: 'MAP_TO_EXISTING' | 'PROMOTE_AND_MAP'; targetTeamId?: string; targetTeamName?: string }) => Promise<void>;
    onApproveNormalizationRequest?: (requestId: string, reasonCode: TeamNormalizationReasonCode, comment?: string) => Promise<void>;
    onRejectNormalizationRequest?: (requestId: string, reasonCode: TeamNormalizationReasonCode, comment?: string) => Promise<void>;
    normalizationLogs?: TeamNormalizationLog[];
    normalizationRequests?: TeamNormalizationRequest[];
    focusTarget?: 'NORMALIZATION_WORKFLOW' | null;
    onFocusTargetHandled?: () => void;
    storageRevision?: number;
}

type PeriodFilter = '7D' | '30D' | 'THIS_MONTH' | 'CUSTOM' | 'ALL';

type LabFilterState = {
    teamIds: string[];
    riskLabel: string | null;
    period: PeriodFilter;
    customStart: string;
    customEnd: string;
};

type TeamScopeOption = {
    id: string;
    name: string;
};

// ============================================================
// [Phase 2] 위험 키워드 사전 — 모듈 레벨 관리 (하드코딩 분리)
// ============================================================
type RiskCategory = '추락/낙하/전도' | '장비/환경' | '화학/게 사고';

interface RiskKeywordDef {
    keyword: string;
    category: RiskCategory;
}

export const RISK_KEYWORD_DICT: RiskKeywordDef[] = [
    // 추락/낙하/전도 그룹
    { keyword: '추락', category: '추락/낙하/전도' },
    { keyword: '낙하', category: '추락/낙하/전도' },
    { keyword: '전도', category: '추락/낙하/전도' },
    { keyword: '비계', category: '추락/낙하/전도' },
    // 장비/환경 그룹
    { keyword: '협착', category: '장비/환경' },
    { keyword: '붕괴', category: '장비/환경' },
    { keyword: '충돌', category: '장비/환경' },
    { keyword: '절단', category: '장비/환경' },
    { keyword: '장비', category: '장비/환경' },
    // 화학/게 사고 그룹
    { keyword: '감전', category: '화학/게 사고' },
    { keyword: '화재', category: '화학/게 사고' },
    { keyword: '질식', category: '화학/게 사고' },
];

const LINKAGE_TARGET_STORAGE_KEY = 'safety_datalab_linkage_target_rate_v1';

// ============================================================
// --- [Visual Component] Neon Donut Chart ---
const NeonDonutChart = ({ score, size = 160 }: { score: number, size?: number }) => {
    const strokeWidth = 12;
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (score / 100) * circumference;
    
    let color = "#10B981"; // Emerald
    if (score < 70) color = "#EF4444"; // Red
    else if (score < 85) color = "#F59E0B"; // Amber

    return (
        <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
            <svg width={size} height={size} className="transform -rotate-90 drop-shadow-[0_0_10px_rgba(16,185,129,0.3)]">
                <circle cx={size/2} cy={size/2} r={radius} stroke="#334155" strokeWidth={strokeWidth} fill="none" />
                <circle 
                    cx={size/2} cy={size/2} r={radius} 
                    stroke={color} strokeWidth={strokeWidth} fill="none"
                    strokeDasharray={circumference} strokeDashoffset={offset}
                    strokeLinecap="round"
                    className="transition-all duration-1000 ease-out"
                />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
                <span className="text-4xl font-black tracking-tighter" style={{ color }}>{score}</span>
                <span className="text-[10px] text-slate-400 font-bold tracking-widest">안전 점수</span>
            </div>
        </div>
    );
};

// --- [Visual Component] Risk Spectrum Bar ---
interface RiskSpectrumBarProps {
    label: string;
    count: number;
    max: number;
    color: string;
    onClick: () => void;
    isActive: boolean;
    isDimmed: boolean;
}
const RiskSpectrumBar: React.FC<RiskSpectrumBarProps> = ({ label, count, max, color, onClick, isActive, isDimmed }) => {
    const width = Math.max((count / max) * 100, 5); // Min 5% width
    return (
        <div 
            onClick={onClick}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onClick();
                }
            }}
            role="button"
            tabIndex={0}
            aria-pressed={isActive}
            aria-label={`${label} 위험요인 필터 ${isActive ? '해제' : '적용'}`}
            className={`flex items-center gap-3 mb-3 group cursor-pointer transition-all duration-300 ${isDimmed ? 'opacity-30 blur-[1px]' : 'opacity-100'}`}
        >
            <div className={`w-16 text-right text-xs font-bold transition-colors ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-white'}`}>{label}</div>
            <div className="flex-1 h-3 bg-slate-800 rounded-full overflow-hidden relative">
                <div 
                    className={`h-full rounded-full ${color} transition-all duration-1000 relative group-hover:brightness-125 ${isActive ? 'ring-2 ring-white brightness-125' : ''}`} 
                    style={{ width: `${width}%` }}
                >
                    <div className="absolute right-0 top-0 bottom-0 w-1 bg-white/50"></div>
                </div>
            </div>
            <div className="w-8 text-xs font-mono text-white font-bold text-right">{count}</div>
        </div>
    );
};

// --- [Visual Component] Team Heatmap Cell ---
interface TeamHeatmapCellProps {
    name: string;
    activity: number;
    score: number;
    maxActivity: number;
    onClick: () => void;
    isActive: boolean;
    isDimmed: boolean;
}
const TeamHeatmapCell: React.FC<TeamHeatmapCellProps> = ({ name, activity, score, maxActivity, onClick, isActive, isDimmed }) => {
    const intensity = Math.min(Math.max((activity / maxActivity), 0.2), 1);
    
    return (
        <div 
            onClick={onClick}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onClick();
                }
            }}
            role="button"
            tabIndex={0}
            aria-pressed={isActive}
            aria-label={`${name} 팀 필터 ${isActive ? '해제' : '적용'}`}
            className={`rounded-xl border p-3 flex flex-col justify-between transition-all duration-300 relative overflow-hidden group cursor-pointer
                ${isActive ? 'scale-105 z-10 ring-2 ring-white shadow-2xl' : 'hover:scale-105 hover:z-10'}
                ${isDimmed ? 'opacity-30 blur-[1px] scale-95' : 'opacity-100'}
            `}
            style={{ 
                backgroundColor: activity > 0 ? `rgba(79, 70, 229, ${intensity * 0.4})` : '#1e293b',
                borderColor: activity > 0 ? `rgba(99, 102, 241, ${intensity})` : '#334155'
            }}
        >
            <div className="flex justify-between items-start min-w-0 gap-1">
                <span className={`text-xs font-bold truncate min-w-0 pr-1 ${activity > 0 ? 'text-white' : 'text-slate-500'}`}>{name}</span>
                {activity > 0 && (
                    <span className={`text-[9px] font-mono px-1.5 rounded shrink-0 ${score >= 80 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                        {score}
                    </span>
                )}
            </div>
            <div className="mt-2">
                <div className="text-xl font-black text-white">{activity}</div>
                <div className="text-[9px] text-slate-400">활동 건수</div>
            </div>
            {activity === 0 && <div className="absolute inset-0 bg-black/40 flex items-center justify-center"><span className="text-[10px] text-slate-500 font-bold">데이터 없음</span></div>}
        </div>
    );
};

// ============================================================
// [Phase 4] 스냅샷 타입
// ============================================================
export const SNAPSHOT_STORAGE_KEY = 'safetylab_snapshots_v1';
export const COMMAND_TASK_STORAGE_KEY = 'smart_tbm_command_tasks_v1';

const readStoredSnapshots = (): LabSnapshot[] => {
    try {
        const parsed = JSON.parse(localStorage.getItem(SNAPSHOT_STORAGE_KEY) || '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
};

const readStoredCommandTasks = (): SmartCommandTask[] => {
    try {
        const parsed = JSON.parse(localStorage.getItem(COMMAND_TASK_STORAGE_KEY) || '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
};

// ============================================================
// [Phase 3] AI 지시 카드 스키마
// ============================================================
type CommandPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM';

interface CommandOrder {
    id: number;
    priority: CommandPriority;
    team: string;
    action: string;
    rationale: string;
    deadline: string;
    kpi: string;
}

const PRIORITY_CONFIG: Record<CommandPriority, { label: string; color: string; border: string; bg: string }> = {
    CRITICAL: { label: '가동 수신', color: 'text-red-400',   border: 'border-red-500/50',   bg: 'bg-red-500/10' },
    HIGH:     { label: '중요',     color: 'text-amber-400', border: 'border-amber-500/50', bg: 'bg-amber-500/10' },
    MEDIUM:   { label: '일반',     color: 'text-blue-400',  border: 'border-blue-500/50',  bg: 'bg-blue-500/10' },
};

const CommandOrderCard: React.FC<{ order: CommandOrder; index: number }> = ({ order, index }) => {
    const cfg = PRIORITY_CONFIG[order.priority] ?? PRIORITY_CONFIG.MEDIUM;
    return (
        <div className={`rounded-2xl border ${cfg.border} ${cfg.bg} p-5 flex flex-col gap-3 transition-all hover:scale-[1.01] animate-fade-in`} style={{ animationDelay: `${index * 80}ms` }}>
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded border ${cfg.border} ${cfg.color}`}>{cfg.label}</span>
                    <span className="text-xs font-bold text-slate-300">{order.team}</span>
                </div>
                <span className="text-[10px] text-slate-500 font-mono">{order.deadline}</span>
            </div>
            <p className="text-sm font-bold text-white leading-snug">{order.action}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-1">
                <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-700/40">
                    <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">근거</p>
                    <p className="text-xs text-slate-300 leading-relaxed">{order.rationale}</p>
                </div>
                <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-700/40">
                    <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">KPI</p>
                    <p className="text-xs text-slate-300 leading-relaxed">{order.kpi}</p>
                </div>
            </div>
        </div>
    );
};

export const SafetyDataLab: React.FC<SafetyDataLabProps> = ({ entries, teams, onBackupData, onRestoreData, siteConfig, onRequestNormalization, onApproveNormalizationRequest, onRejectNormalizationRequest, normalizationLogs = [], normalizationRequests = [], focusTarget, onFocusTargetHandled, storageRevision = 0 }) => {
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [aiCards, setAiCards] = useState<CommandOrder[] | null>(null);
    const [aiRawFallback, setAiRawFallback] = useState<string | null>(null);
    const [analyzeError, setAnalyzeError] = useState(false);
    const [announceMessage, setAnnounceMessage] = useState('');
    // [Phase 4] 스냅샷 / 공유 상태
    const [snapshots, setSnapshots] = useState<LabSnapshot[]>(() => readStoredSnapshots());
    const [copyDone, setCopyDone] = useState(false);
    const [commandShareDone, setCommandShareDone] = useState(false);
    const [validationLogCopied, setValidationLogCopied] = useState(false);
    const [phaseClearLogCopied, setPhaseClearLogCopied] = useState(false);
    const [commandReportCopiedOnce, setCommandReportCopiedOnce] = useState(false);
    const [normalizationFocusFlash, setNormalizationFocusFlash] = useState(false);
    const [focusedRequestId, setFocusedRequestId] = useState<string | null>(null);
    const [unknownTeamTargetMap, setUnknownTeamTargetMap] = useState<Record<string, string>>({});
    const [normalizingUnknownLabel, setNormalizingUnknownLabel] = useState<string | null>(null);
    const [processingRequestId, setProcessingRequestId] = useState<string | null>(null);
    const [reviewReasonMap, setReviewReasonMap] = useState<Record<string, TeamNormalizationReasonCode>>({});
    const [reviewCommentMap, setReviewCommentMap] = useState<Record<string, string>>({});
    const [normalizationLogRange, setNormalizationLogRange] = useState<'TODAY' | '7D' | '30D'>('7D');
    const [commandTasks, setCommandTasks] = useState<SmartCommandTask[]>(() => readStoredCommandTasks());
    const [commandForm, setCommandForm] = useState({
        title: '',
        instruction: '',
        assigneeTeamId: '',
        priority: 'HIGH' as SmartCommandPriority,
        dueAt: '',
        rationale: '',
        kpi: '',
    });
    const [linkageTrendRange, setLinkageTrendRange] = useState<'3M' | '6M' | '12M'>('6M');
    const [linkageTargetRate, setLinkageTargetRate] = useState<number>(() => {
        if (typeof siteConfig?.linkageTargetRate === 'number' && siteConfig.linkageTargetRate >= 0 && siteConfig.linkageTargetRate <= 100) {
            return siteConfig.linkageTargetRate;
        }
        const stored = Number(localStorage.getItem(LINKAGE_TARGET_STORAGE_KEY) || '90');
        if (Number.isFinite(stored) && stored >= 0 && stored <= 100) return stored;
        return 90;
    });
    const [filter, setFilter] = useState<LabFilterState>({
        teamIds: [],
        riskLabel: null,
        period: '30D',
        customStart: '',
        customEnd: ''
    });
    const restoreInputRef = useRef<HTMLInputElement>(null);
    const normalizationSectionRef = useRef<HTMLDivElement>(null);
    const pendingRequestSectionRef = useRef<HTMLDivElement>(null);
    const ephemeralTimerRefs = useRef<number[]>([]);
    const focusFlashTimerRef = useRef<number | null>(null);
    const pendingScrollTimerRef = useRef<number | null>(null);
    const focusedRequestResetTimerRef = useRef<number | null>(null);
    // [FIX] 컴포넌트 언마운트 후 setState 방지
    const mountedRef = useRef(true);
    React.useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);
    React.useEffect(() => {
        return () => {
            if (focusFlashTimerRef.current) {
                window.clearTimeout(focusFlashTimerRef.current);
                focusFlashTimerRef.current = null;
            }
            if (pendingScrollTimerRef.current) {
                window.clearTimeout(pendingScrollTimerRef.current);
                pendingScrollTimerRef.current = null;
            }
            if (focusedRequestResetTimerRef.current) {
                window.clearTimeout(focusedRequestResetTimerRef.current);
                focusedRequestResetTimerRef.current = null;
            }
            ephemeralTimerRefs.current.forEach((id) => window.clearTimeout(id));
            ephemeralTimerRefs.current = [];
        };
    }, []);

    const scheduleEphemeralTimeout = (callback: () => void, delayMs: number) => {
        const timerId = window.setTimeout(() => {
            ephemeralTimerRefs.current = ephemeralTimerRefs.current.filter((id) => id !== timerId);
            if (mountedRef.current) {
                callback();
            }
        }, delayMs);
        ephemeralTimerRefs.current.push(timerId);
        return timerId;
    };
    React.useEffect(() => {
        localStorage.setItem(LINKAGE_TARGET_STORAGE_KEY, String(linkageTargetRate));
    }, [linkageTargetRate]);
    React.useEffect(() => {
        if (typeof siteConfig?.linkageTargetRate === 'number' && siteConfig.linkageTargetRate >= 0 && siteConfig.linkageTargetRate <= 100) {
            setLinkageTargetRate(siteConfig.linkageTargetRate);
        }
    }, [siteConfig?.linkageTargetRate]);

    React.useEffect(() => {
        setSnapshots(readStoredSnapshots());
        setCommandTasks(readStoredCommandTasks());
    }, [storageRevision]);

    React.useEffect(() => {
        if (focusTarget !== 'NORMALIZATION_WORKFLOW') return;

        const timer = window.setTimeout(() => {
            normalizationSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            setNormalizationFocusFlash(true);
            if (focusFlashTimerRef.current) {
                window.clearTimeout(focusFlashTimerRef.current);
            }
            focusFlashTimerRef.current = window.setTimeout(() => setNormalizationFocusFlash(false), 2200);

            // 첫 번째 승인 대기 요청 하이라이트
            const firstPendingId = normalizationRequestsForFocus.current;
            if (firstPendingId) {
                setFocusedRequestId(firstPendingId);
                if (pendingScrollTimerRef.current) {
                    window.clearTimeout(pendingScrollTimerRef.current);
                }
                pendingScrollTimerRef.current = window.setTimeout(() => {
                    pendingRequestSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }, 400);
                if (focusedRequestResetTimerRef.current) {
                    window.clearTimeout(focusedRequestResetTimerRef.current);
                }
                focusedRequestResetTimerRef.current = window.setTimeout(() => setFocusedRequestId(null), 2400);
            }

            onFocusTargetHandled?.();
        }, 80);

        return () => window.clearTimeout(timer);
    }, [focusTarget, onFocusTargetHandled]);

    // 포커스 triggered 시점의 첫 번째 대기 요청 ID를 ref로 유지 (클로저 stale 방지)
    const normalizationRequestsForFocus = useRef<string | null>(null);
    React.useEffect(() => {
        normalizationRequestsForFocus.current = normalizationRequests
            .filter(r => r.status === 'PENDING')
            .sort((a, b) => b.requestedAt - a.requestedAt)[0]?.id || null;
    }, [normalizationRequests]);

    const announceStatus = (message: string) => {
        if (!mountedRef.current) return;
        setAnnounceMessage('');
        requestAnimationFrame(() => {
            if (mountedRef.current) {
                setAnnounceMessage(message);
            }
        });
    };

    const teamScopeOptions = useMemo<TeamScopeOption[]>(() => {
        const options: TeamScopeOption[] = [];
        const usedIds = new Set<string>();
        const usedNames = new Set<string>();
        let hasUnassigned = false;

        teams.forEach(team => {
            const id = (team.id || '').trim();
            const name = (team.name || '').trim();
            if (!id) return;
            const resolvedName = name || id;
            if (!usedIds.has(id)) {
                options.push({ id, name: resolvedName });
                usedIds.add(id);
                usedNames.add(resolvedName);
            }
        });

        entries.forEach(entry => {
            const teamIds = getEntryTeamIds(entry);
            const teamNames = getEntryTeamNames(entry, teams);

            if (teamIds.length > 0) {
                teamIds.forEach((teamId, index) => {
                    if (!usedIds.has(teamId)) {
                        const resolvedName = teamNames[index] || teamId;
                        options.push({ id: teamId, name: resolvedName });
                        usedIds.add(teamId);
                        usedNames.add(resolvedName);
                    }
                });
            }

            if (teamNames.length > 0) {
                teamNames.forEach(teamName => {
                    if (!usedNames.has(teamName)) {
                        const syntheticId = `name:${teamName}`;
                        options.push({ id: syntheticId, name: teamName });
                        usedIds.add(syntheticId);
                        usedNames.add(teamName);
                    }
                });
                return;
            }

            hasUnassigned = true;
        });

        if (hasUnassigned) {
            options.push({ id: '__UNASSIGNED__', name: '미지정 팀' });
        }

        return options.sort((left, right) => left.name.localeCompare(right.name, 'ko'));
    }, [teams, entries]);

    const teamScopeMap = useMemo(() => {
        return new Map(teamScopeOptions.map(option => [option.id, option]));
    }, [teamScopeOptions]);

    const primaryTeamIdByName = useMemo(() => {
        const map = new Map<string, string>();
        teamScopeOptions.forEach(option => {
            if (!map.has(option.name)) {
                map.set(option.name, option.id);
            }
        });
        return map;
    }, [teamScopeOptions]);

    const selectedTeamIdSet = useMemo(() => {
        return new Set(filter.teamIds);
    }, [filter.teamIds]);

    const selectedTeamNames = useMemo(() => {
        return filter.teamIds
            .map(teamId => teamScopeMap.get(teamId)?.name || teamId)
            .filter(name => !!name);
    }, [filter.teamIds, teamScopeMap]);

    const selectedTeamScopeLabel = useMemo(() => {
        if (selectedTeamNames.length === 0) return '전체';
        if (selectedTeamNames.length <= 2) return selectedTeamNames.join(', ');
        return `${selectedTeamNames[0]} 외 ${selectedTeamNames.length - 1}팀`;
    }, [selectedTeamNames]);

    const selectedTeamNameSet = useMemo(() => {
        return new Set(selectedTeamNames);
    }, [selectedTeamNames]);

    const unknownTeamQueue = useMemo(() => {
        const knownTeamIdSet = new Set(teams.map(team => (team.id || '').trim()).filter(Boolean));
        const knownTeamNameSet = new Set(teams.map(team => (team.name || '').trim()).filter(Boolean));

        const grouped = entries.reduce((acc, entry) => {
            const teamIds = getEntryTeamIds(entry);
            const teamNames = getEntryTeamNames(entry, teams);
            const labels = teamNames.length > 0 ? teamNames : [getEntryTeamLabel(entry, teams)];

            labels.forEach((label, index) => {
                const teamId = teamIds[index] || '';
                const isKnownById = teamId ? knownTeamIdSet.has(teamId) : false;
                const isKnownByName = label ? knownTeamNameSet.has(label) : false;
                const isUnknown = !isKnownById && !isKnownByName;
                if (!isUnknown) {
                    return;
                }

                if (!acc[label]) {
                    acc[label] = {
                        sourceLabel: label,
                        count: 0,
                        latestDate: entry.date || '-',
                        hasUnassigned: label === '미지정 팀',
                    };
                }

                acc[label].count += 1;
                if ((entry.date || '') > acc[label].latestDate) {
                    acc[label].latestDate = entry.date || acc[label].latestDate;
                }
            });
            return acc;
        }, {} as Record<string, { sourceLabel: string; count: number; latestDate: string; hasUnassigned: boolean }>);

        const groupedArray = Object.values(grouped) as Array<{ sourceLabel: string; count: number; latestDate: string; hasUnassigned: boolean }>;
        return groupedArray.sort((a, b) => b.count - a.count || b.latestDate.localeCompare(a.latestDate));
    }, [entries, teams]);

    const filteredNormalizationLogs = useMemo(() => {
        const logs = [...normalizationLogs].sort((left, right) => right.actedAt - left.actedAt);
        if (logs.length === 0) return logs;

        const now = new Date();
        const start = new Date(now);

        if (normalizationLogRange === 'TODAY') {
            start.setHours(0, 0, 0, 0);
        } else if (normalizationLogRange === '7D') {
            start.setDate(now.getDate() - 6);
            start.setHours(0, 0, 0, 0);
        } else {
            start.setDate(now.getDate() - 29);
            start.setHours(0, 0, 0, 0);
        }

        return logs.filter(log => log.actedAt >= start.getTime());
    }, [normalizationLogs, normalizationLogRange]);

    const pendingNormalizationRequests = useMemo(() => {
        return normalizationRequests
            .filter(request => request.status === 'PENDING')
            .sort((left, right) => right.requestedAt - left.requestedAt);
    }, [normalizationRequests]);

    const reviewedNormalizationRequests = useMemo(() => {
        return normalizationRequests
            .filter(request => request.status !== 'PENDING')
            .sort((left, right) => (right.reviewedAt || 0) - (left.reviewedAt || 0));
    }, [normalizationRequests]);

    const normalizationWorkflowKpi = useMemo(() => {
        const now = Date.now();
        const pendingAgesHours = pendingNormalizationRequests.map(request => Math.max(0, (now - request.requestedAt) / (1000 * 60 * 60)));
        const pendingAvgHours = pendingAgesHours.length > 0
            ? Number((pendingAgesHours.reduce((sum, age) => sum + age, 0) / pendingAgesHours.length).toFixed(1))
            : 0;
        const pendingMaxHours = pendingAgesHours.length > 0
            ? Number(Math.max(...pendingAgesHours).toFixed(1))
            : 0;
        const pendingOver24h = pendingAgesHours.filter(age => age >= 24).length;

        const rejectedRequests = reviewedNormalizationRequests.filter(request => request.status === 'REJECTED');
        const reasonCounts = rejectedRequests.reduce((acc, request) => {
            const reason = request.reviewReasonCode || 'OTHER';
            acc[reason] = (acc[reason] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        const topRejectedReasons = (Object.entries(reasonCounts) as [string, number][])
            .sort((left, right) => right[1] - left[1])
            .slice(0, 3)
            .map(([reason, count]) => ({ reason, count }));

        return {
            pendingCount: pendingNormalizationRequests.length,
            pendingAvgHours,
            pendingMaxHours,
            pendingOver24h,
            rejectedCount: rejectedRequests.length,
            topRejectedReasons,
        };
    }, [pendingNormalizationRequests, reviewedNormalizationRequests]);

    const normalizationAlertItems = useMemo(() => {
        const alerts: Array<{ key: string; level: 'critical' | 'warning'; label: string }> = [];

        if (normalizationWorkflowKpi.pendingOver24h >= 3) {
            alerts.push({ key: 'pending-over24-critical', level: 'critical', label: '24시간 초과 대기 다수(3건+)'});
        } else if (normalizationWorkflowKpi.pendingOver24h > 0) {
            alerts.push({ key: 'pending-over24-warning', level: 'warning', label: '24시간 초과 대기 발생' });
        }

        if (normalizationWorkflowKpi.pendingAvgHours >= 12) {
            alerts.push({ key: 'pending-avg-warning', level: 'warning', label: '평균 대기시간 12시간 이상' });
        }

        if (normalizationWorkflowKpi.rejectedCount >= 5) {
            alerts.push({ key: 'rejected-high', level: 'warning', label: '반려 누적 5건 이상' });
        }

        return alerts;
    }, [normalizationWorkflowKpi]);

    const reasonCodeLabelMap: Record<TeamNormalizationReasonCode, string> = {
        MISLABEL: '오기입/오분류',
        UNASSIGNED_CLEANUP: '미지정 정리',
        DATA_QUALITY: '데이터 품질 개선',
        TEAM_REORG: '팀 체계 개편',
        EXTERNAL_AUDIT: '대외 점검 대응',
        OTHER: '기타',
    };

    const resolveEntryTeamScopeIds = (entry: TBMEntry) => {
        const resolved = new Set<string>();

        getEntryTeamIds(entry).forEach(teamId => {
            if (teamId && teamScopeMap.has(teamId)) {
                resolved.add(teamId);
            }
        });

        getEntryTeamNames(entry, teams).forEach(teamName => {
            const byName = primaryTeamIdByName.get(teamName);
            if (byName) {
                resolved.add(byName);
                return;
            }
            resolved.add(`name:${teamName}`);
        });

        if (resolved.size === 0) resolved.add('__UNASSIGNED__');
        return Array.from(resolved);
    };

    const resolveEntryTeamScopeId = (entry: TBMEntry) => {
        return resolveEntryTeamScopeIds(entry)[0] || '__UNASSIGNED__';
    };

    const handleUnknownTargetChange = (sourceLabel: string, targetTeamId: string) => {
        setUnknownTeamTargetMap(prev => ({
            ...prev,
            [sourceLabel]: targetTeamId,
        }));
    };

    const handleApplyUnknownNormalization = async (sourceLabel: string) => {
        const targetTeamId = unknownTeamTargetMap[sourceLabel];
        if (!targetTeamId) {
            announceStatus('치환할 대상 팀을 먼저 선택하세요.');
            return;
        }
        if (!onRequestNormalization) {
            announceStatus('정규화 요청 기능을 사용할 수 없습니다.');
            return;
        }

        const targetTeam = teams.find(team => team.id === targetTeamId);
        if (!targetTeam) {
            announceStatus('선택한 대상 팀을 찾을 수 없습니다.');
            return;
        }

        try {
            setNormalizingUnknownLabel(sourceLabel);
            await onRequestNormalization({
                sourceLabel,
                action: 'MAP_TO_EXISTING',
                targetTeamId,
                targetTeamName: targetTeam.name,
            });
            announceStatus(`${sourceLabel} 항목의 정규화 요청을 등록했습니다.`);
        } finally {
            setNormalizingUnknownLabel(null);
        }
    };

    const handlePromoteUnknownTeam = async (sourceLabel: string) => {
        if (!onRequestNormalization) {
            announceStatus('정규화 요청 기능을 사용할 수 없습니다.');
            return;
        }

        try {
            setNormalizingUnknownLabel(sourceLabel);
            await onRequestNormalization({
                sourceLabel,
                action: 'PROMOTE_AND_MAP',
                targetTeamName: sourceLabel,
            });
            announceStatus(`${sourceLabel} 신규팀 등록 요청을 등록했습니다.`);
        } finally {
            setNormalizingUnknownLabel(null);
        }
    };

    const handleRequestReasonChange = (requestId: string, reason: TeamNormalizationReasonCode) => {
        setReviewReasonMap(prev => ({ ...prev, [requestId]: reason }));
    };

    const handleRequestCommentChange = (requestId: string, comment: string) => {
        setReviewCommentMap(prev => ({ ...prev, [requestId]: comment }));
    };

    const handleApproveRequest = async (requestId: string) => {
        if (!onApproveNormalizationRequest) {
            announceStatus('요청 승인 기능을 사용할 수 없습니다.');
            return;
        }

        const reason = reviewReasonMap[requestId] || 'MISLABEL';
        const comment = reviewCommentMap[requestId] || '';

        try {
            setProcessingRequestId(requestId);
            await onApproveNormalizationRequest(requestId, reason, comment);
        } finally {
            setProcessingRequestId(null);
        }
    };

    const handleRejectRequest = async (requestId: string) => {
        if (!onRejectNormalizationRequest) {
            announceStatus('요청 반려 기능을 사용할 수 없습니다.');
            return;
        }

        const reason = reviewReasonMap[requestId] || 'OTHER';
        const comment = reviewCommentMap[requestId] || '';

        try {
            setProcessingRequestId(requestId);
            await onRejectNormalizationRequest(requestId, reason, comment);
        } finally {
            setProcessingRequestId(null);
        }
    };

    const handleExportNormalizationLogsCsv = () => {
        if (filteredNormalizationLogs.length === 0) {
            announceStatus('내보낼 정규화 이력이 없습니다.');
            return;
        }

        const escapeCsv = (value: string) => `"${String(value).replace(/"/g, '""')}"`;
        const header = ['시각', '작업자', '원본팀', '대상팀', '반영건수', '작업유형'];
        const rows = filteredNormalizationLogs.map(log => [
            new Date(log.actedAt).toLocaleString('ko-KR'),
            log.actor,
            log.sourceLabel,
            log.targetTeamName,
            String(log.affectedCount),
            log.action === 'PROMOTE_AND_MAP' ? '신규등록+치환' : '기존팀 치환',
        ]);

        const csv = [header, ...rows]
            .map(cols => cols.map(escapeCsv).join(','))
            .join('\n');

        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `team_normalization_logs_${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
        setTimeout(() => {
            URL.revokeObjectURL(url);
        }, 10000);
        announceStatus(`정규화 이력 ${filteredNormalizationLogs.length}건을 CSV로 내보냈습니다.`);
    };

    const periodEntries = useMemo(() => {
        if (filter.period === 'ALL') return entries;

        const today = new Date();
        const endDate = today.toISOString().slice(0, 10);
        let startDate = '';

        if (filter.period === '7D') {
            const start = new Date(today);
            start.setDate(today.getDate() - 6);
            startDate = start.toISOString().slice(0, 10);
        } else if (filter.period === '30D') {
            const start = new Date(today);
            start.setDate(today.getDate() - 29);
            startDate = start.toISOString().slice(0, 10);
        } else if (filter.period === 'THIS_MONTH') {
            startDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
        } else {
            const hasValidCustom = !!filter.customStart && !!filter.customEnd && filter.customStart <= filter.customEnd;
            if (!hasValidCustom) return entries;
            return entries.filter(e => e.date >= filter.customStart && e.date <= filter.customEnd);
        }

        return entries.filter(e => e.date >= startDate && e.date <= endDate);
    }, [entries, filter.period, filter.customStart, filter.customEnd]);

    // --- 1. Global Analysis (Always calculated from FULL dataset) ---
    // Needed to display the "Menu" (Full list of teams, full list of risks) even when filtered
    const globalAnalysis = useMemo(() => {
        // Team Stats for Heatmap
        const activityByTeamId = periodEntries.reduce((acc, entry) => {
            const teamId = resolveEntryTeamScopeId(entry);
            if (!acc[teamId]) {
                acc[teamId] = { count: 0, scoreSum: 0 };
            }
            acc[teamId].count += 1;
            acc[teamId].scoreSum += (entry.videoAnalysis?.score || 0);
            return acc;
        }, {} as Record<string, { count: number; scoreSum: number }>);

        const teamStats = teamScopeOptions.map(team => {
            const teamStat = activityByTeamId[team.id];
            const count = teamStat?.count || 0;
            const scoreSum = teamStat?.scoreSum || 0;
            const score = count > 0 ? Math.round(scoreSum / count) : 0;
            return { id: team.id, name: team.name, count, score };
        }).sort((a, b) => b.count - a.count);
        const maxTeamActivity = Math.max(...teamStats.map(t => t.count), 1);

        // Risk Stats for Spectrum
        const riskCounts: Record<string, number> = {};
        RISK_KEYWORD_DICT.forEach(d => riskCounts[d.keyword] = 0);
        
        periodEntries.forEach(e => {
            if (e.riskFactors) {
                e.riskFactors.forEach(r => {
                    const text = (r.risk + " " + r.measure).replace(/\s/g, "");
                    RISK_KEYWORD_DICT.forEach(d => {
                        if (text.includes(d.keyword)) riskCounts[d.keyword]++;
                    });
                });
            }
        });
        const riskSpectrum = Object.entries(riskCounts)
            .map(([label, count]) => ({ label, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 7);
        const maxRiskCount = Math.max(...riskSpectrum.map(r => r.count), 1);

        return { teamStats, maxTeamActivity, riskSpectrum, maxRiskCount };
    }, [periodEntries, teamScopeOptions]);

    // --- 2. Filtered Analysis (Calculated based on Selection) ---
    // Used for Score, Trends, and specific details
    const filteredAnalysis = useMemo(() => {
        let filteredEntries = periodEntries;

        if (filter.teamIds.length > 0) {
            filteredEntries = filteredEntries.filter(entry => resolveEntryTeamScopeIds(entry).some(teamId => selectedTeamIdSet.has(teamId)));
        }

        if (filter.riskLabel) {
            filteredEntries = filteredEntries.filter(e => {
                if (!e.riskFactors) return false;
                return e.riskFactors.some(r => (r.risk + r.measure).includes(filter.riskLabel!));
            });
        }

        const totalEntries = filteredEntries.length;
        const totalPeople = filteredEntries.reduce((acc, e) => acc + (e.attendeesCount || 0), 0);
        const linkedEntries = filteredEntries.filter(e => !!e.linkedRiskAssessmentId || !!e.linkedRiskAssessmentLabel);
        const sameMonthLinkedEntries = linkedEntries.filter(e => e.linkedRiskAssessmentMatchedByMonth);
        const linkedUsageRate = totalEntries > 0 ? Math.round((linkedEntries.length / totalEntries) * 100) : 0;
        const sameMonthLinkedRate = totalEntries > 0 ? Math.round((sameMonthLinkedEntries.length / totalEntries) * 100) : 0;
        const avgLinkedHighRiskCount = linkedEntries.length > 0
            ? Number((linkedEntries.reduce((sum, entry) => sum + (entry.linkedRiskAssessmentHighCount || 0), 0) / linkedEntries.length).toFixed(1))
            : 0;
        const actionNoteLinkedEntries = linkedEntries.filter(entry => (entry.linkedRiskAssessmentActionNoteCount || 0) > 0);
        const teamLinkageStats = (Object.values(filteredEntries.reduce((acc, entry) => {
            const teamNames = getEntryTeamNames(entry, teams);
            const labels = teamNames.length > 0 ? teamNames : [getEntryTeamLabel(entry, teams)];
            labels.forEach(teamName => {
                if (!acc[teamName]) {
                    acc[teamName] = {
                        teamName,
                        total: 0,
                        linked: 0,
                        matched: 0,
                    };
                }
                acc[teamName].total += 1;
                if (entry.linkedRiskAssessmentId || entry.linkedRiskAssessmentLabel) {
                    acc[teamName].linked += 1;
                    if (entry.linkedRiskAssessmentMatchedByMonth) {
                        acc[teamName].matched += 1;
                    }
                }
            });
            return acc;
        }, {} as Record<string, { teamName: string; total: number; linked: number; matched: number }>)) as { teamName: string; total: number; linked: number; matched: number }[]).map(item => ({
            ...item,
            linkedRate: item.total > 0 ? Math.round((item.linked / item.total) * 100) : 0,
            matchedRate: item.total > 0 ? Math.round((item.matched / item.total) * 100) : 0,
        })).sort((left, right) => right.linkedRate - left.linkedRate || right.matchedRate - left.matchedRate || right.total - left.total).slice(0, 4);
        const monthlyLinkageTrend = (() => {
            const monthCount = linkageTrendRange === '3M' ? 3 : linkageTrendRange === '12M' ? 12 : 6;
            const buckets = Array.from({ length: monthCount }, (_, index) => {
                const d = new Date();
                d.setMonth(d.getMonth() - ((monthCount - 1) - index));
                const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                return {
                    key,
                    label: `${String(d.getMonth() + 1).padStart(2, '0')}월`,
                    total: 0,
                    linked: 0,
                    matched: 0,
                };
            });
            const bucketMap = buckets.reduce((acc, bucket) => {
                acc[bucket.key] = bucket;
                return acc;
            }, {} as Record<string, { key: string; label: string; total: number; linked: number; matched: number }>);

            filteredEntries.forEach(entry => {
                const key = entry.date?.slice(0, 7);
                if (!key || !bucketMap[key]) return;
                bucketMap[key].total += 1;
                if (entry.linkedRiskAssessmentId || entry.linkedRiskAssessmentLabel) {
                    bucketMap[key].linked += 1;
                    if (entry.linkedRiskAssessmentMatchedByMonth) {
                        bucketMap[key].matched += 1;
                    }
                }
            });

            return buckets.map(bucket => ({
                ...bucket,
                linkedRate: bucket.total > 0 ? Math.round((bucket.linked / bucket.total) * 100) : 0,
                matchedRate: bucket.total > 0 ? Math.round((bucket.matched / bucket.total) * 100) : 0,
            }));
        })();
        
        const validScores = filteredEntries.filter(e => e.videoAnalysis?.score).map(e => e.videoAnalysis!.score);
        const avgScore = validScores.length > 0 ? Math.round(validScores.reduce((a, b) => a + b, 0) / validScores.length) : 0;

        // Trend Data
        const last7Days = Array.from({length: 7}, (_, i) => {
            const d = new Date();
            d.setDate(d.getDate() - (6 - i));
            return d.toISOString().slice(0, 10);
        });
        const trendData = last7Days.map(date => {
            const dayEntries = filteredEntries.filter(e => e.date === date);
            const count = dayEntries.length;
            const scoreSum = dayEntries.reduce((acc, e) => acc + (e.videoAnalysis?.score || 0), 0);
            const avg = count > 0 ? Math.round(scoreSum / count) : 0;
            return { date: date.slice(5), count, avg };
        });

        // [Phase 2] 동적 트렌드 스케일: 최대건수 기준 점유율 계산
        const maxTrendCount = Math.max(...trendData.map(d => d.count), 1);

        return {
            totalEntries,
            totalPeople,
            avgScore,
            trendData,
            maxTrendCount,
            filteredEntries,
            linkedEntriesCount: linkedEntries.length,
            sameMonthLinkedCount: sameMonthLinkedEntries.length,
            linkedUsageRate,
            sameMonthLinkedRate,
            avgLinkedHighRiskCount,
            actionNoteLinkedCount: actionNoteLinkedEntries.length,
            teamLinkageStats,
            monthlyLinkageTrend,
        };
    }, [periodEntries, filter.teamIds, filter.riskLabel, linkageTrendRange]);

    // --- [Smart TBM Command] 지휘브리핑 스켈레톤 데이터 ---
    const commandBriefingDraft = useMemo(() => {
        const teamName = selectedTeamScopeLabel === '전체' ? '전 팀' : selectedTeamScopeLabel;
        const risks = globalAnalysis.riskSpectrum.slice(0, 3);
        return risks.map((risk, idx) => ({
            rank: idx + 1,
            label: risk.label,
            count: risk.count,
            instruction: `${teamName} 대상 ${risk.label} 위험요인 사전 점검 및 즉시 시정조치 실행`,
            kpi: `${risk.label} 관련 지적건수 0건 유지`,
        }));
    }, [globalAnalysis.riskSpectrum, selectedTeamScopeLabel]);

    const visibleCommandTasks = useMemo(() => {
        let target = [...commandTasks];
        if (filter.teamIds.length > 0) {
            target = target.filter(task => {
                if (task.assigneeTeamId && selectedTeamIdSet.has(task.assigneeTeamId)) {
                    return true;
                }

                const taskTeamName = (task.assigneeTeamName || '').trim();
                if (!taskTeamName) {
                    return false;
                }

                const mappedId = primaryTeamIdByName.get(taskTeamName) || `name:${taskTeamName}`;
                return selectedTeamIdSet.has(mappedId) || selectedTeamNameSet.has(taskTeamName);
            });
        }
        return target.sort((prevTask, nextTask) => (nextTask.updatedAt || 0) - (prevTask.updatedAt || 0));
    }, [commandTasks, filter.teamIds, selectedTeamIdSet, primaryTeamIdByName, selectedTeamNameSet]);

    const commandReport = useMemo(() => {
        const totalCommands = visibleCommandTasks.length;
        const completedCommands = visibleCommandTasks.filter(task => task.status === 'DONE').length;
        const delayedCommands = visibleCommandTasks.filter(task => task.status === 'DELAYED').length;
        const completionRate = totalCommands > 0 ? Math.round((completedCommands / totalCommands) * 100) : 0;
        const delayRate = totalCommands > 0 ? Math.round((delayedCommands / totalCommands) * 100) : 0;

        const delayReasonCounts = {
            MATERIAL: 0,
            MANPOWER: 0,
            WEATHER: 0,
            OTHER: 0,
        } as Record<'MATERIAL' | 'MANPOWER' | 'WEATHER' | 'OTHER', number>;

        visibleCommandTasks.forEach(task => {
            if (task.status === 'DELAYED' && task.delayReason) {
                delayReasonCounts[task.delayReason] += 1;
            }
        });

        const topDelayReasons = Object.entries(delayReasonCounts)
            .sort((left, right) => right[1] - left[1])
            .filter(([, count]) => count > 0)
            .map(([reason, count]) => ({ reason, count }));

        const topRisks = globalAnalysis.riskSpectrum.slice(0, 3).map(risk => risk.label);

        const delayedTasks = visibleCommandTasks.filter(task => task.status === 'DELAYED');
        const delayedWithRiskKeyword = delayedTasks.filter(task =>
            topRisks.some(risk => task.title.includes(risk) || task.instruction.includes(risk))
        ).length;
        const recurrenceRiskScore = delayedTasks.length > 0
            ? Math.min(100, Math.round((delayedWithRiskKeyword / delayedTasks.length) * 100))
            : 0;
        const recurrenceRiskLevel = recurrenceRiskScore >= 70 ? 'HIGH' : recurrenceRiskScore >= 40 ? 'MEDIUM' : 'LOW';

        const totalStatusTransitions = visibleCommandTasks.reduce(
            (sum, task) => sum + Math.max((task.statusHistory?.length || 0) - 1, 0),
            0
        );
        const statusHistoryValidationPassed = totalStatusTransitions >= 10;

        return {
            date: new Date().toISOString().slice(0, 10),
            totalCommands,
            completedCommands,
            delayedCommands,
            completionRate,
            delayRate,
            recurrenceRiskScore,
            recurrenceRiskLevel,
            totalStatusTransitions,
            statusHistoryValidationPassed,
            topDelayReasons,
            topRisks,
        };
    }, [visibleCommandTasks, globalAnalysis.riskSpectrum]);

    const commandValidationStatus = useMemo(() => {
        const hasEvidence = visibleCommandTasks.some(task =>
            (task.evidenceImageUrls?.length || 0) > 0 || (task.evidenceComment || '').trim().length > 0
        );
        const hasEvidenceImage = visibleCommandTasks.some(task => (task.evidenceImageUrls?.length || 0) > 0);
        const hasDelayReason = visibleCommandTasks.some(task => !!task.delayReason);
        const hasReportData = commandReport.totalCommands > 0;
        const phase4MetricsReady =
            commandReport.totalCommands >= 0 &&
            commandReport.completedCommands >= 0 &&
            commandReport.delayedCommands >= 0;

        const phase3Ready = commandReport.statusHistoryValidationPassed && hasEvidence && hasDelayReason && hasEvidenceImage;
        const phase4Ready = hasReportData && phase4MetricsReady && commandReportCopiedOnce;
        const evaluatorReady = commandReport.statusHistoryValidationPassed && hasReportData && commandReportCopiedOnce;
        const practitionerReady = hasEvidenceImage && hasDelayReason;
        const isDone = phase3Ready && phase4Ready;

        return {
            hasEvidence,
            hasEvidenceImage,
            hasDelayReason,
            hasReportData,
            phase4MetricsReady,
            phase3Ready,
            phase4Ready,
            evaluatorReady,
            practitionerReady,
            isDone,
        };
    }, [visibleCommandTasks, commandReport, commandReportCopiedOnce]);

    // --- [Phase 4] 비교 지표: 전주 대비 ---
    const compareAnalysis = useMemo(() => {
        const today = new Date();

        const calcRange = (daysAgo: number, span: number) => {
            const end = new Date(today);
            end.setDate(today.getDate() - daysAgo);
            const start = new Date(end);
            start.setDate(end.getDate() - (span - 1));
            const endStr = end.toISOString().slice(0, 10);
            const startStr = start.toISOString().slice(0, 10);
            let subset = entries.filter(e => e.date >= startStr && e.date <= endStr);
            if (filter.teamIds.length > 0) {
                subset = subset.filter(entry => resolveEntryTeamScopeIds(entry).some(teamId => selectedTeamIdSet.has(teamId)));
            }
            if (filter.riskLabel) subset = subset.filter(e => e.riskFactors?.some(r => (r.risk + r.measure).includes(filter.riskLabel!)));
            const count = subset.length;
            const scores = subset.filter(e => e.videoAnalysis?.score).map(e => e.videoAnalysis!.score);
            const score = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
            const people = subset.reduce((acc, e) => acc + (e.attendeesCount || 0), 0);
            return { count, score, people };
        };

        const thisWeek = calcRange(0, 7);
        const prevWeek = calcRange(7, 7);
        const thisMonth = calcRange(0, 30);
        const prevMonth = calcRange(30, 30);

        const diff = (curr: number, prev: number) => {
            if (prev === 0) return null;
            return Math.round(((curr - prev) / prev) * 100);
        };

        return {
            countWeekDiff:  diff(thisWeek.count,  prevWeek.count),
            scoreWeekDiff:  diff(thisWeek.score,  prevWeek.score),
            peopleWeekDiff: diff(thisWeek.people, prevWeek.people),
            countMonthDiff: diff(thisMonth.count, prevMonth.count),
            scoreMonthDiff: diff(thisMonth.score, prevMonth.score),
            thisWeek, prevWeek, thisMonth, prevMonth,
        };
    }, [entries, filter.teamIds, filter.riskLabel]);

    // --- [Phase 3] AI 지시 카드 생성 Logic ---
    const generateDeepInsight = async () => {
        setIsAnalyzing(true);
        setAnalyzeError(false);
        setAiCards(null);
        setAiRawFallback(null);
        try {
            const topRisks = globalAnalysis.riskSpectrum.slice(0, 3).map(r => r.label).join(', ') || '없음';
            const focusParts: string[] = [];
            if (filter.teamIds.length > 0) focusParts.push(`담당팀: ${selectedTeamScopeLabel}`);
            if (filter.riskLabel) focusParts.push(`집중위험: ${filter.riskLabel}`);
            focusParts.push(`분석기간: ${filter.period}`);
            const context = focusParts.join(' | ');

            const prompt = `당신은 고경력 건설안전 데이터 분석관입니다.

[현장 데이터]
- 평균 안전점수: ${filteredAnalysis.avgScore}/100
- 총 활동 건수: ${filteredAnalysis.totalEntries}
- 상위 위험요인(Top3): ${topRisks}
- 단계 컨텍스트: ${context}

[지시]
아래 JSON 배열만 출력하세요. 다른 텍스트 없이 증거 기반의 실행 지시카드 3개를 작성하세요.

[출력 형식 - JSON 배열]
[
  {
    "id": 1,
    "priority": "CRITICAL 또는 HIGH 또는 MEDIUM",
    "team": "담당팀 이름 (전체 지시면 '전 팀')",
    "action": "실행 가능한 지시 내용 (동사 시작, 1문장)",
    "rationale": "이 지시를 내리는 근거 (데이터 기반)",
    "deadline": "즉시 또는 24시간 내 또는 금주 또는 1주일 내",
    "kpi": "성공 시 측정 가능한 지표"
  }
]

[주의] 반드시 JSON만 출력. 마크다운 코드블록 제외.`;

            const raw = await generateGeneralInsight(prompt);
            if (!mountedRef.current) return;

            // JSON 파싱 시도
            const jsonMatch = raw.match(/\[\s*\{[\s\S]*\}\s*\]/);
            if (jsonMatch) {
                try {
                    const parsed: CommandOrder[] = JSON.parse(jsonMatch[0]);
                    if (Array.isArray(parsed) && parsed.length > 0) {
                        setAiCards(parsed);
                        announceStatus(`AI 지시 카드 ${parsed.length}개가 생성되었습니다.`);
                        return;
                    }
                } catch {
                    // 파싱 실패 → fallback
                }
            }
            // Fallback: raw 텍스트 표시
            setAiRawFallback(raw);
            announceStatus('AI 분석 결과가 준비되었습니다.');
        } catch {
            if (mountedRef.current) {
                setAnalyzeError(true);
                announceStatus('AI 분석에 실패했습니다. 잠시 후 다시 시도해주세요.');
            }
        } finally {
            if (mountedRef.current) setIsAnalyzing(false);
        }
    };

    const handleRestoreClick = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            onRestoreData(e.target.files);
            e.target.value = '';
        }
    };

    const handleResetFilter = () => {
        setFilter(prev => ({
            ...prev,
            teamIds: [],
            riskLabel: null,
            period: '30D',
            customStart: '',
            customEnd: ''
        }));
        setAiCards(null);
        setAiRawFallback(null);
        setAnalyzeError(false);
    };

    // --- [Phase 4] 스냅샷 저장 ---
    const handleSaveSnapshot = () => {
        const label = `스냅샷 ${new Date().toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}`;
        const snap: LabSnapshot = {
            id: Date.now().toString(),
            label,
            savedAt: new Date().toISOString(),
            filter: { ...filter },
            avgScore: filteredAnalysis.avgScore,
            totalEntries: filteredAnalysis.totalEntries,
            totalPeople: filteredAnalysis.totalPeople,
            topRisk: globalAnalysis.riskSpectrum[0]?.label || '-',
        };
        const updated = [snap, ...snapshots].slice(0, 10); // 최대 10개 보존
        setSnapshots(updated);
        localStorage.setItem(SNAPSHOT_STORAGE_KEY, JSON.stringify(updated));
        announceStatus('스냅샷이 저장되었습니다.');
    };

    const handleDeleteSnapshot = (id: string) => {
        const updated = snapshots.filter(s => s.id !== id);
        setSnapshots(updated);
        localStorage.setItem(SNAPSHOT_STORAGE_KEY, JSON.stringify(updated));
    };

    // --- [Phase 4] CSV 내보내기 ---
    const handleExportCSV = () => {
        const rows = filteredAnalysis.filteredEntries;
        if (rows.length === 0) { announceStatus('내보낼 데이터가 없습니다.'); return; }
        try {
            const header = '날짜,팀ID,참여인원,안전점수,위험요인수';
            const lines = rows.map(e =>
                `${e.date},${e.teamId || ''},${e.attendeesCount ?? ''},${e.videoAnalysis?.score ?? ''},${e.riskFactors?.length ?? 0}`
            );
            const csv = [header, ...lines].join('\n');
            const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `safety_data_${new Date().toISOString().slice(0, 10)}.csv`;
            a.click();
            setTimeout(() => {
                URL.revokeObjectURL(url);
            }, 10000);
            announceStatus(`CSV ${rows.length}건 내보내기 완료`);
        } catch (error) {
            console.error('[SafetyDataLab] CSV export failed', error);
            announceStatus('CSV 내보내기에 실패했습니다. 브라우저 다운로드 설정을 확인해주세요.');
        }
    };

    // --- [Phase 4] 공유 요약 텍스트 복사 ---
    const handleCopyShareText = () => {
        const topRisk = globalAnalysis.riskSpectrum[0]?.label || '-';
        const teamName = selectedTeamScopeLabel;
        const text = `[휘강건설 안전현황 요약] ${new Date().toLocaleDateString('ko-KR')}
분석기간: ${filter.period} | 대상팀: ${teamName}
평균 안전점수: ${filteredAnalysis.avgScore}/100
총 활동: ${filteredAnalysis.totalEntries}건 / ${filteredAnalysis.totalPeople}명
주요 위험요인: ${topRisk}
전주 대비 건수: ${compareAnalysis.countWeekDiff !== null ? (compareAnalysis.countWeekDiff >= 0 ? '+' : '') + compareAnalysis.countWeekDiff + '%' : 'N/A'}`;
        navigator.clipboard.writeText(text).then(() => {
            setCopyDone(true);
            announceStatus('공유 요약이 클립보드에 복사되었습니다.');
            scheduleEphemeralTimeout(() => setCopyDone(false), 2000);
        }).catch((error) => {
            console.error('[SafetyDataLab] share text copy failed', error);
            announceStatus('공유 요약 복사에 실패했습니다. 브라우저 권한을 확인해주세요.');
        });
    };

    const handleCopyCommandReport = () => {
        const reasonLabelMap: Record<string, string> = {
            MATERIAL: '자재',
            MANPOWER: '인원',
            WEATHER: '기상',
            OTHER: '기타',
        };

        const delayReasonText = commandReport.topDelayReasons.length > 0
            ? commandReport.topDelayReasons.map(item => `${reasonLabelMap[item.reason] || item.reason}:${item.count}`).join(', ')
            : '없음';

        const scopeTeam = selectedTeamScopeLabel;
        const text = `[스마트TBM 지휘 리포트] ${new Date().toLocaleDateString('ko-KR')}
대상팀: ${scopeTeam}
지시 총계: ${commandReport.totalCommands}건
완료: ${commandReport.completedCommands}건 (${commandReport.completionRate}%)
지연: ${commandReport.delayedCommands}건 (${commandReport.delayRate}%)
    재발위험: ${commandReport.recurrenceRiskScore}% (${commandReport.recurrenceRiskLevel})
지연 사유: ${delayReasonText}
주요 위험요인: ${(commandReport.topRisks.length > 0 ? commandReport.topRisks.join(', ') : '없음')}`;

        navigator.clipboard.writeText(text).then(() => {
            setCommandShareDone(true);
            setCommandReportCopiedOnce(true);
            announceStatus('지휘 리포트 요약이 클립보드에 복사되었습니다.');
            scheduleEphemeralTimeout(() => setCommandShareDone(false), 2000);
        }).catch((error) => {
            console.error('[SafetyDataLab] command report copy failed', error);
            announceStatus('지휘 리포트 복사에 실패했습니다. 브라우저 권한을 확인해주세요.');
        });
    };

    const handleCopyValidationLog = () => {
        const todayStr = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\. /g, '-').replace('.', '');
        const line = commandValidationStatus.isDone
            ? `${todayStr} | 스마트TBM지휘 검증 | Phase3/4 통합 검증 완료 | Done | 상태이력 ${commandReport.totalStatusTransitions}건, 증빙/지연사유 반영, 지휘리포트 복사 정상`
            : `${todayStr} | 스마트TBM지휘 검증 | Phase3/4 통합 검증 진행중 | In Progress | 상태이력 ${commandReport.totalStatusTransitions}건, 증빙:${commandValidationStatus.hasEvidence ? 'Y' : 'N'}, 지연사유:${commandValidationStatus.hasDelayReason ? 'Y' : 'N'}`;

        navigator.clipboard.writeText(line).then(() => {
            setValidationLogCopied(true);
            announceStatus('검증 로그 1줄이 클립보드에 복사되었습니다.');
            scheduleEphemeralTimeout(() => setValidationLogCopied(false), 2000);
        }).catch((error) => {
            console.error('[SafetyDataLab] validation log copy failed', error);
            announceStatus('검증 로그 복사에 실패했습니다. 브라우저 권한을 확인해주세요.');
        });
    };

    const handleCopyPhaseClearSummary = () => {
        const todayStr = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\. /g, '-').replace('.', '');
        const line = commandValidationStatus.isDone
            ? `${todayStr} | 스마트TBM지휘 Clear | Command Phase3/4 Clear 후보 | Done | Phase3/4 체크리스트 자동판정 충족`
            : `${todayStr} | 스마트TBM지휘 Clear | Command Phase3/4 Clear 후보 점검 | In Progress | P3:${commandValidationStatus.phase3Ready ? 'Y' : 'N'}, P4:${commandValidationStatus.phase4Ready ? 'Y' : 'N'}`;

        navigator.clipboard.writeText(line).then(() => {
            setPhaseClearLogCopied(true);
            announceStatus('클리어 요약 1줄이 클립보드에 복사되었습니다.');
            scheduleEphemeralTimeout(() => setPhaseClearLogCopied(false), 2000);
        }).catch((error) => {
            console.error('[SafetyDataLab] clear summary copy failed', error);
            announceStatus('클리어 요약 복사에 실패했습니다. 브라우저 권한을 확인해주세요.');
        });
    };

    const persistCommandTasks = (nextTasks: SmartCommandTask[]) => {
        setCommandTasks(nextTasks);
        localStorage.setItem(COMMAND_TASK_STORAGE_KEY, JSON.stringify(nextTasks));
    };

    const createValidationEvidenceImage = (label: string) => {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#0f172a"/><stop offset="100%" stop-color="#1d4ed8"/></linearGradient></defs><rect width="320" height="180" rx="18" fill="url(#g)"/><text x="24" y="78" fill="#e2e8f0" font-size="18" font-family="Arial, sans-serif" font-weight="700">스마트TBM 검증용 증빙</text><text x="24" y="112" fill="#bfdbfe" font-size="14" font-family="Arial, sans-serif">${label}</text><text x="24" y="142" fill="#93c5fd" font-size="12" font-family="Arial, sans-serif">자동 생성 placeholder image</text></svg>`;
        return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
    };

    const isValidationCommandTask = (task: SmartCommandTask) => task.id.startsWith('VALCMD-');

    const handleCreateCommandTask = () => {
        const title = commandForm.title.trim();
        const instruction = commandForm.instruction.trim();
        const rationale = commandForm.rationale.trim();
        if (!title || !instruction || !rationale) {
            announceStatus('지시 제목/내용/근거는 필수입니다.');
            return;
        }

        const now = Date.now();
        const assigneeTeam = teams.find(team => team.id === commandForm.assigneeTeamId);
        const today = new Date().toISOString().slice(0, 10);

        const newTask: SmartCommandTask = {
            id: `CMD-${now}`,
            date: today,
            title,
            instruction,
            assigneeTeamId: commandForm.assigneeTeamId || undefined,
            assigneeTeamName: assigneeTeam?.name,
            dueAt: commandForm.dueAt ? new Date(commandForm.dueAt).toISOString() : undefined,
            priority: commandForm.priority,
            status: 'NOT_STARTED',
            rationale,
            kpi: commandForm.kpi.trim() || undefined,
            sourceEntryIds: filteredAnalysis.filteredEntries.slice(0, 5).map(entry => entry.id),
            statusHistory: [
                { from: 'NOT_STARTED', to: 'NOT_STARTED', changedAt: now, note: '생성' },
            ],
            createdAt: now,
            updatedAt: now,
        };

        persistCommandTasks([newTask, ...commandTasks]);
        setCommandForm({
            title: '',
            instruction: '',
            assigneeTeamId: commandForm.assigneeTeamId,
            priority: commandForm.priority,
            dueAt: '',
            rationale: '',
            kpi: '',
        });
        announceStatus('스마트TBM 지시가 생성되었습니다.');
    };

    const handleCommandStatusChange = (taskId: string, status: SmartCommandStatus) => {
        const updatedTasks = commandTasks.map(task => {
            if (task.id !== taskId) return task;
            if (task.status === status) return task;

            const nextHistory: CommandStatusHistoryItem[] = [
                ...(task.statusHistory || []),
                {
                    from: task.status,
                    to: status,
                    changedAt: Date.now(),
                },
            ].slice(-50);

            return { ...task, status, statusHistory: nextHistory, updatedAt: Date.now() };
        });
        persistCommandTasks(updatedTasks);
    };

    const handleDeleteCommandTask = (taskId: string) => {
        const updatedTasks = commandTasks.filter(task => task.id !== taskId);
        persistCommandTasks(updatedTasks);
        announceStatus('지시 항목이 삭제되었습니다.');
    };

    const updateCommandTask = (taskId: string, updater: (task: SmartCommandTask) => SmartCommandTask) => {
        const updatedTasks = commandTasks.map(task => {
            if (task.id !== taskId) return task;
            const nextTask = updater(task);
            return { ...nextTask, updatedAt: Date.now() };
        });
        persistCommandTasks(updatedTasks);
    };

    const handleCommandEvidenceCommentChange = (taskId: string, value: string) => {
        updateCommandTask(taskId, task => ({ ...task, evidenceComment: value }));
    };

    const handleCommandDelayReasonChange = (taskId: string, value: string) => {
        const delayReason = value ? (value as SmartCommandTask['delayReason']) : undefined;
        updateCommandTask(taskId, task => ({ ...task, delayReason }));
    };

    const handleCommandDelayCommentChange = (taskId: string, value: string) => {
        updateCommandTask(taskId, task => ({ ...task, delayComment: value }));
    };

    const handleCommandEvidenceFileChange = (taskId: string, event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            announceStatus('증빙은 이미지 파일만 첨부할 수 있습니다.');
            event.target.value = '';
            return;
        }
        if (file.size > 3 * 1024 * 1024) {
            announceStatus('증빙 이미지는 3MB 이하만 첨부할 수 있습니다.');
            event.target.value = '';
            return;
        }

        const reader = new FileReader();
        reader.onload = () => {
            const result = reader.result;
            if (typeof result !== 'string') return;
            updateCommandTask(taskId, task => {
                const prevImages = task.evidenceImageUrls || [];
                const nextImages = [result, ...prevImages].slice(0, 3);
                return { ...task, evidenceImageUrls: nextImages };
            });
            announceStatus('증빙 이미지가 첨부되었습니다.');
        };
        reader.readAsDataURL(file);
        event.target.value = '';
    };

    const handleRemoveEvidenceImage = (taskId: string, targetIndex: number) => {
        updateCommandTask(taskId, task => {
            const nextImages = (task.evidenceImageUrls || []).filter((_, index) => index !== targetIndex);
            return { ...task, evidenceImageUrls: nextImages };
        });
        announceStatus('증빙 이미지가 삭제되었습니다.');
    };

    const resolveDueAtFromDeadline = (deadline: string): string | undefined => {
        const keyword = (deadline || '').toLowerCase();
        const now = new Date();
        const dueDate = new Date(now);

        if (keyword.includes('즉시')) {
            dueDate.setHours(now.getHours() + 1);
            return dueDate.toISOString();
        }
        if (keyword.includes('24시간')) {
            dueDate.setHours(now.getHours() + 24);
            return dueDate.toISOString();
        }
        if (keyword.includes('금주')) {
            const day = now.getDay();
            const diffToSunday = 7 - day;
            dueDate.setDate(now.getDate() + diffToSunday);
            dueDate.setHours(18, 0, 0, 0);
            return dueDate.toISOString();
        }
        if (keyword.includes('1주일')) {
            dueDate.setDate(now.getDate() + 7);
            return dueDate.toISOString();
        }
        return undefined;
    };

    const handleImportAiCardsToCommandTasks = () => {
        if (!aiCards || aiCards.length === 0) {
            announceStatus('가져올 AI 지시 카드가 없습니다.');
            return;
        }

        const now = Date.now();
        const today = new Date().toISOString().slice(0, 10);

        const importedTasks: SmartCommandTask[] = aiCards.map((order, index) => {
            const matchedTeam = teams.find(team => team.name.trim() === order.team.trim());
            const dueAt = resolveDueAtFromDeadline(order.deadline);
            return {
                id: `AICMD-${now}-${index + 1}`,
                date: today,
                title: `[AI] ${order.action.slice(0, 30)}`,
                instruction: order.action,
                assigneeTeamId: matchedTeam?.id,
                assigneeTeamName: matchedTeam?.name || order.team,
                dueAt,
                priority: order.priority,
                status: 'NOT_STARTED',
                rationale: order.rationale,
                kpi: order.kpi,
                statusHistory: [
                    { from: 'NOT_STARTED', to: 'NOT_STARTED', changedAt: now + index, note: 'AI 가져오기 생성' },
                ],
                sourceEntryIds: filteredAnalysis.filteredEntries.slice(0, 5).map(entry => entry.id),
                createdAt: now + index,
                updatedAt: now + index,
            };
        });

        const dedupeSet = new Set(commandTasks.map(task => `${task.title}::${task.instruction}`));
        const dedupedImports = importedTasks.filter(task => !dedupeSet.has(`${task.title}::${task.instruction}`));
        if (dedupedImports.length === 0) {
            announceStatus('이미 동일한 지시가 있어 가져오기를 건너뜁니다.');
            return;
        }

        persistCommandTasks([...dedupedImports, ...commandTasks]);
        announceStatus(`AI 지시 ${dedupedImports.length}건을 워크플로우로 가져왔습니다.`);
    };

    const handleGenerateValidationCommands = () => {
        const existingValidationCount = commandTasks.filter(isValidationCommandTask).length;
        if (existingValidationCount > 0) {
            announceStatus(`이미 검증용 데이터 ${existingValidationCount}건이 있습니다. 먼저 정리 후 다시 생성하세요.`);
            return;
        }

        const now = Date.now();
        const today = new Date().toISOString().slice(0, 10);
        const defaultTeam = teams[0];

        const samples: SmartCommandTask[] = Array.from({ length: 5 }, (_, index) => {
            const createdAt = now + index;
            return {
                id: `VALCMD-${createdAt}`,
                date: today,
                title: `[검증용] 지시 ${index + 1}`,
                instruction: `검증용 상태 전이 테스트 지시 ${index + 1}`,
                assigneeTeamId: defaultTeam?.id,
                assigneeTeamName: defaultTeam?.name,
                priority: index % 2 === 0 ? 'HIGH' : 'MEDIUM',
                status: 'NOT_STARTED',
                rationale: '상태 이력 검증 자동 생성',
                kpi: '이력 누적 확인',
                statusHistory: [
                    { from: 'NOT_STARTED', to: 'NOT_STARTED', changedAt: createdAt, note: '검증용 생성' },
                ],
                createdAt,
                updatedAt: createdAt,
            };
        });

        persistCommandTasks([...samples, ...commandTasks]);
        announceStatus('검증용 지시 5건이 생성되었습니다.');
    };

    const handleRunValidationTransitions = () => {
        const validationTasks = commandTasks.filter(isValidationCommandTask);
        if (validationTasks.length === 0) {
            announceStatus('먼저 검증 5건 생성을 실행한 후 상태전이 검증을 진행하세요.');
            return;
        }
        let transitionCount = 0;

        const updatedTasks = commandTasks.map((task, taskIndex) => {
            if (!isValidationCommandTask(task)) {
                return task;
            }

            const nextStatus: SmartCommandStatus = (() => {
                if (task.status === 'NOT_STARTED') {
                    return taskIndex % 2 === 0 ? 'IN_PROGRESS' : 'DELAYED';
                }
                if (task.status === 'IN_PROGRESS') {
                    return 'DONE';
                }
                if (task.status === 'DELAYED') {
                    return 'DONE';
                }
                return taskIndex % 2 === 0 ? 'DELAYED' : 'IN_PROGRESS';
            })();

            if (task.status === nextStatus) return task;

            const changedAt = Date.now() + taskIndex;
            transitionCount += 1;
            const nextHistory: CommandStatusHistoryItem[] = [
                ...(task.statusHistory || []),
                {
                    from: task.status,
                    to: nextStatus,
                    changedAt,
                    note: '검증용 자동 전이',
                },
            ].slice(-50);

            const shouldAttachEvidence = nextStatus === 'DONE';
            const shouldApplyDelay = nextStatus === 'DELAYED';
            const evidenceImageUrls = shouldAttachEvidence
                ? ((task.evidenceImageUrls && task.evidenceImageUrls.length > 0)
                    ? task.evidenceImageUrls
                    : [createValidationEvidenceImage(task.title)])
                : task.evidenceImageUrls;

            const evidenceComment = shouldAttachEvidence
                ? (task.evidenceComment?.trim() || `검증용 완료 증빙 등록 - ${new Date(changedAt).toLocaleTimeString('ko-KR')}`)
                : task.evidenceComment;

            const delayReason = shouldApplyDelay
                ? (task.delayReason || 'MATERIAL')
                : task.delayReason;

            const delayComment = shouldApplyDelay
                ? (task.delayComment?.trim() || '검증용 지연 사유 자동 입력')
                : task.delayComment;

            return {
                ...task,
                status: nextStatus,
                statusHistory: nextHistory,
                evidenceImageUrls,
                evidenceComment,
                delayReason,
                delayComment,
                updatedAt: changedAt,
            };
        });

        persistCommandTasks(updatedTasks);
        announceStatus(`검증용 상태전이 ${transitionCount}건이 반영되었습니다. 다시 실행하면 다음 단계로 이어집니다.`);
    };

    const handleClearValidationCommands = () => {
        const before = commandTasks.length;
        const filtered = commandTasks.filter(task => !isValidationCommandTask(task));
        const removed = before - filtered.length;
        if (removed === 0) {
            announceStatus('정리할 검증용 데이터가 없습니다.');
            return;
        }
        persistCommandTasks(filtered);
        announceStatus(`검증용 데이터 ${removed}건을 정리했습니다.`);
    };

    const commandStatusStyle: Record<SmartCommandStatus, string> = {
        NOT_STARTED: 'bg-slate-700 text-slate-200 border-slate-600',
        IN_PROGRESS: 'bg-blue-600/30 text-blue-300 border-blue-500/50',
        DONE: 'bg-emerald-600/30 text-emerald-300 border-emerald-500/50',
        DELAYED: 'bg-red-600/30 text-red-300 border-red-500/50',
    };

    const commandStatusLabel: Record<SmartCommandStatus, string> = {
        NOT_STARTED: '미착수',
        IN_PROGRESS: '진행중',
        DONE: '완료',
        DELAYED: '지연',
    };

    const commandPriorityLabel: Record<SmartCommandPriority, string> = {
        CRITICAL: '긴급',
        HIGH: '높음',
        MEDIUM: '보통',
        LOW: '낮음',
    };

    const delayReasonLabelMap: Record<string, string> = {
        MATERIAL: '자재',
        MANPOWER: '인원',
        WEATHER: '기상',
        OTHER: '기타',
    };

    const liveStatusMessage = isAnalyzing
        ? 'AI 지시 카드를 생성 중입니다.'
        : analyzeError
            ? 'AI 분석 실패. 재시도하려면 버튼을 다시 눌러주세요.'
            : (announceMessage || '');

    return (
        <div className="bg-[#0F172A] min-h-screen p-4 md:p-8 animate-fade-in pb-24 font-sans text-slate-100 overflow-x-hidden selection:bg-indigo-500 selection:text-white">
            <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{liveStatusMessage}</p>
            
            {/* Header Section */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-6 border-b border-slate-800 pb-6">
                <div>
                    <div className="flex items-center gap-2 text-indigo-400 mb-2 animate-pulse">
                        <Activity size={20} />
                        <span className="text-xs font-black tracking-[0.2em]">안전 통합 관제</span>
                    </div>
                    <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight leading-none mb-2">
                        안전 데이터 <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">심층 연구소</span>
                    </h1>
                    <p className="text-slate-400 text-sm font-medium">
                        현장의 모든 리스크를 데이터로 시각화하여 사고를 선제적으로 예방합니다.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                        {([
                            { key: '7D', label: '최근 7일' },
                            { key: '30D', label: '최근 30일' },
                            { key: 'THIS_MONTH', label: '당월' },
                            { key: 'ALL', label: '전체' },
                            { key: 'CUSTOM', label: '커스텀' }
                        ] as Array<{ key: PeriodFilter; label: string }>).map((option) => {
                            const isActive = filter.period === option.key;
                            return (
                                <button
                                    key={option.key}
                                    onClick={() => setFilter(prev => ({ ...prev, period: option.key }))}
                                    aria-pressed={isActive}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${isActive ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-500'}`}
                                >
                                    {option.label}
                                </button>
                            );
                        })}
                    </div>
                    {filter.period === 'CUSTOM' && (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                            <input
                                type="date"
                                value={filter.customStart}
                                onChange={(e) => setFilter(prev => ({ ...prev, customStart: e.target.value }))}
                                aria-label="커스텀 필터 시작일"
                                className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-200"
                            />
                            <span className="text-slate-500 text-xs">~</span>
                            <input
                                type="date"
                                value={filter.customEnd}
                                onChange={(e) => setFilter(prev => ({ ...prev, customEnd: e.target.value }))}
                                aria-label="커스텀 필터 종료일"
                                className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-200"
                            />
                        </div>
                    )}
                </div>
                <div className="flex w-full md:w-auto flex-col sm:flex-row gap-3 items-stretch sm:items-center">
                    {(filter.teamIds.length > 0 || filter.riskLabel || filter.period !== '30D') && (
                        <div className="flex flex-wrap items-center gap-2 bg-indigo-900/50 border border-indigo-500 text-indigo-200 px-4 py-2 rounded-xl animate-fade-in max-w-full">
                            <Filter size={14} />
                            <span className="text-xs font-bold">필터 적용중</span>
                            {filter.teamIds.length > 0 && <span className="text-[11px] px-2 py-0.5 rounded bg-indigo-950 border border-indigo-700">팀: {selectedTeamScopeLabel}</span>}
                            {filter.riskLabel && <span className="text-[11px] px-2 py-0.5 rounded bg-indigo-950 border border-indigo-700">위험: {filter.riskLabel}</span>}
                            <span className="text-[11px] px-2 py-0.5 rounded bg-indigo-950 border border-indigo-700">기간: {filter.period}</span>
                            <button onClick={handleResetFilter} aria-label="적용된 필터 해제" className="ml-2 hover:text-white transition-colors"><XCircle size={16}/></button>
                        </div>
                    )}
                    <button 
                        onClick={generateDeepInsight}
                        disabled={isAnalyzing}
                        className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-3 rounded-xl font-bold transition-all shadow-[0_0_20px_rgba(79,70,229,0.3)] disabled:opacity-50 border border-indigo-500 min-h-[44px]"
                    >
                        {isAnalyzing ? <div className="animate-spin w-4 h-4 border-2 border-white/30 border-t-white rounded-full"></div> : <BrainCircuit size={18} />}
                        <span>AI 전략 분석</span>
                    </button>
                </div>
            </div>

            {/* Main Dashboard Grid */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                
                {/* 1. Score & KPI Card */}
                <div className="col-span-12 md:col-span-4 bg-slate-800/50 rounded-3xl p-6 border border-slate-700 shadow-xl backdrop-blur-sm flex flex-col justify-between relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-[50px] pointer-events-none group-hover:bg-emerald-500/20 transition-all"></div>
                    
                    <div className="flex justify-between items-start mb-6">
                        <h3 className="text-sm font-bold text-slate-400 tracking-wider flex items-center gap-2">
                            <Target size={16} className="text-emerald-400"/> 현재 현황
                        </h3>
                        <div className="px-2 py-1 bg-emerald-500/20 border border-emerald-500/30 rounded text-[10px] font-bold text-emerald-400 animate-pulse">
                            실시간
                        </div>
                    </div>

                    <div className="flex flex-col items-center justify-center flex-1">
                        <NeonDonutChart score={filteredAnalysis.avgScore} />
                    </div>

                    <div className="grid grid-cols-2 gap-4 mt-6">
                        <div className="bg-slate-900/80 rounded-xl p-3 border border-slate-700/50 transition-colors hover:border-indigo-500/50">
                            <p className="text-[10px] text-slate-500 font-bold mb-1">활동 건수</p>
                            <div className="flex items-baseline gap-1">
                                <span className="text-xl font-black text-white">{filteredAnalysis.totalEntries}</span>
                                <span className="text-xs text-slate-500">건</span>
                            </div>
                        </div>
                        <div className="bg-slate-900/80 rounded-xl p-3 border border-slate-700/50 transition-colors hover:border-indigo-500/50">
                            <p className="text-[10px] text-slate-500 font-bold mb-1">참여 인원</p>
                            <div className="flex items-baseline gap-1">
                                <span className="text-xl font-black text-white">{filteredAnalysis.totalPeople}</span>
                                <span className="text-xs text-slate-500">명</span>
                            </div>
                        </div>
                    </div>

                    <div className="mt-4 rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-4">
                        <div className="flex items-center justify-between gap-2 mb-3">
                            <div className="flex items-center gap-2">
                                <ShieldCheck size={14} className="text-cyan-300" />
                                <p className="text-[10px] text-cyan-300 font-black tracking-[0.2em]">위험성평가 연계 현황</p>
                            </div>
                            <span className="text-[10px] text-slate-400 font-mono">TBM ↔ 위험성평가</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <div className="rounded-xl bg-slate-950/70 border border-slate-700/50 p-3">
                                <p className="text-[10px] text-slate-500 font-bold mb-1">연계 사용률</p>
                                <p className="text-lg font-black text-white">{filteredAnalysis.linkedUsageRate}<span className="text-xs text-slate-500 ml-1">%</span></p>
                                <p className="text-[10px] text-slate-500 mt-1">{filteredAnalysis.linkedEntriesCount} / {filteredAnalysis.totalEntries}건</p>
                            </div>
                            <div className="rounded-xl bg-slate-950/70 border border-slate-700/50 p-3">
                                <p className="text-[10px] text-slate-500 font-bold mb-1">최신 연계율</p>
                                <p className="text-lg font-black text-emerald-300">{filteredAnalysis.sameMonthLinkedRate}<span className="text-xs text-slate-500 ml-1">%</span></p>
                                <p className="text-[10px] text-slate-500 mt-1">{filteredAnalysis.sameMonthLinkedCount}건</p>
                            </div>
                            <div className="rounded-xl bg-slate-950/70 border border-slate-700/50 p-3">
                                <p className="text-[10px] text-slate-500 font-bold mb-1">평균 상위위험</p>
                                <p className="text-lg font-black text-amber-300">{filteredAnalysis.avgLinkedHighRiskCount}<span className="text-xs text-slate-500 ml-1">건</span></p>
                                <p className="text-[10px] text-slate-500 mt-1">메모 반영 {filteredAnalysis.actionNoteLinkedCount}건</p>
                            </div>
                        </div>
                        {filteredAnalysis.teamLinkageStats.length > 0 && (
                            <div className="mt-3 rounded-xl border border-slate-700/50 bg-slate-950/40 p-3">
                                <div className="flex items-center justify-between gap-2 mb-2">
                                    <p className="text-[10px] font-black tracking-[0.2em] text-slate-400">팀 연계 상위</p>
                                    <span className="text-[10px] text-slate-500">상위 {filteredAnalysis.teamLinkageStats.length}팀</span>
                                </div>
                                <div className="space-y-2">
                                    {filteredAnalysis.teamLinkageStats.map(team => (
                                        <div key={team.teamName} className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2">
                                            <div className="min-w-0">
                                                <p className="text-xs font-bold text-white truncate">{team.teamName}</p>
                                                <p className="text-[10px] text-slate-500">연계 {team.linked}/{team.total} · 최신 연계 {team.matched}건</p>
                                            </div>
                                            <div className="text-right shrink-0">
                                                <p className="text-sm font-black text-cyan-300">{team.linkedRate}%</p>
                                                <p className="text-[10px] text-emerald-400">최신 연계 {team.matchedRate}%</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        <div className="mt-3 rounded-xl border border-slate-700/50 bg-slate-950/40 p-3">
                            <div className="flex items-center justify-between gap-2 mb-2">
                                <p className="text-[10px] font-black tracking-[0.2em] text-slate-400">월별 연계 추이</p>
                                <div className="flex flex-col items-end gap-2">
                                    <div className="flex items-center gap-1">
                                        {(['3M', '6M', '12M'] as const).map(range => (
                                            <button
                                                key={range}
                                                onClick={() => setLinkageTrendRange(range)}
                                                className={`px-2 py-1 rounded text-[10px] font-bold border ${linkageTrendRange === range ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40' : 'bg-slate-900 text-slate-500 border-slate-700 hover:text-slate-300'}`}
                                            >
                                                {range}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="flex items-center gap-1">
                                        {[80, 90, 95].map(rate => (
                                            <button
                                                key={rate}
                                                onClick={() => setLinkageTargetRate(rate)}
                                                className={`px-2 py-1 rounded text-[10px] font-bold border ${linkageTargetRate === rate ? 'bg-rose-500/20 text-rose-300 border-rose-500/40' : 'bg-slate-900 text-slate-500 border-slate-700 hover:text-slate-300'}`}
                                            >
                                                {rate}%
                                            </button>
                                        ))}
                                        <input
                                            type="number"
                                            min={0}
                                            max={100}
                                            value={linkageTargetRate}
                                            onChange={(event) => {
                                                const nextValue = Number(event.target.value);
                                                if (Number.isFinite(nextValue)) {
                                                    setLinkageTargetRate(Math.max(0, Math.min(100, nextValue)));
                                                }
                                            }}
                                            className="w-16 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-[10px] font-bold text-slate-200"
                                            aria-label="연계율 목표값"
                                        />
                                    </div>
                                </div>
                            </div>
                            <div className="relative">
                                <div className="absolute left-0 right-0 border-t border-dashed border-rose-400/70 z-10" style={{ bottom: `${linkageTargetRate}%` }}></div>
                                <div className="absolute right-0 -top-2 text-[9px] font-bold text-rose-300">목표 {linkageTargetRate}%</div>
                                <div className="grid gap-2 items-end h-32" style={{ gridTemplateColumns: `repeat(${filteredAnalysis.monthlyLinkageTrend.length}, minmax(0, 1fr))` }}>
                                    {filteredAnalysis.monthlyLinkageTrend.map(month => (
                                        <div key={month.key} className="flex flex-col items-center justify-end gap-2 h-full relative z-20">
                                            <div className="w-full flex items-end justify-center gap-1 h-full">
                                                <div className="w-3 rounded-t bg-cyan-500/80" style={{ height: `${month.linkedRate}%` }} title={`${month.label} 연계율 ${month.linkedRate}%`}></div>
                                                <div className="w-3 rounded-t bg-emerald-400/90" style={{ height: `${month.matchedRate}%` }} title={`${month.label} 최신 연계율 ${month.matchedRate}%`}></div>
                                            </div>
                                            <div className="text-center">
                                                <p className="text-[10px] font-bold text-slate-400">{month.label}</p>
                                                <p className="text-[9px] text-slate-500">{month.total}건</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className="mt-2 flex items-center gap-4 text-[10px] text-slate-500 font-bold">
                                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-cyan-500"></span>연계율</span>
                                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-emerald-400"></span>최신 연계율</span>
                                <span className="flex items-center gap-1"><span className="w-3 h-px border-t border-dashed border-rose-400"></span>목표선</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 2. Risk Spectrum (Bar Chart) - Filter Trigger */}
                <div className="col-span-12 md:col-span-4 bg-slate-800/50 rounded-3xl p-6 border border-slate-700 shadow-xl backdrop-blur-sm">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-sm font-bold text-slate-400 tracking-wider flex items-center gap-2">
                            <AlertTriangle size={16} className="text-amber-400"/> 위험 스펙트럼
                        </h3>
                        <span className="text-[10px] text-slate-500 font-mono">상위 7개 요인</span>
                    </div>
                    <div className="space-y-1">
                        {globalAnalysis.riskSpectrum.map((risk, idx) => (
                            <RiskSpectrumBar 
                                key={risk.label} 
                                label={risk.label} 
                                count={risk.count} 
                                max={globalAnalysis.maxRiskCount}
                                color={idx === 0 ? 'bg-red-500' : idx < 3 ? 'bg-amber-500' : 'bg-blue-500'} 
                                onClick={() => setFilter(prev => ({ ...prev, riskLabel: prev.riskLabel === risk.label ? null : risk.label }))}
                                isActive={filter.riskLabel === risk.label}
                                isDimmed={!!filter.riskLabel && filter.riskLabel !== risk.label}
                            />
                        ))}
                        {globalAnalysis.riskSpectrum.length === 0 && (
                            <div className="h-40 flex items-center justify-center text-slate-600 text-xs">
                                데이터 수집 중...
                            </div>
                        )}
                    </div>
                </div>

                {/* 3. Trend Combo Chart */}
                <div className="col-span-12 md:col-span-4 bg-slate-800/50 rounded-3xl p-6 border border-slate-700 shadow-xl backdrop-blur-sm flex flex-col">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-sm font-bold text-slate-400 tracking-wider flex items-center gap-2">
                            <TrendingUp size={16} className="text-cyan-400"/> 최근 7일 추이
                        </h3>
                        {(filter.teamIds.length > 0 || filter.riskLabel || filter.period !== '30D') && <span className="text-[9px] text-indigo-400 font-bold">필터 적용됨</span>}
                    </div>
                    
                    <div className="flex-1 flex items-end justify-between gap-2 h-full min-h-[200px] relative">
                        {/* Background Grid Lines */}
                        <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-20">
                            <div className="w-full h-px bg-slate-500"></div>
                            <div className="w-full h-px bg-slate-500"></div>
                            <div className="w-full h-px bg-slate-500"></div>
                            <div className="w-full h-px bg-slate-500"></div>
                        </div>

                        {filteredAnalysis.trendData.map((d, i) => (
                            <div key={i} className="flex-1 flex flex-col justify-end items-center gap-2 group relative z-10 h-full">
                                {/* Line Chart Simulation (Dot) */}
                                <div 
                                    className="w-2 h-2 rounded-full bg-cyan-400 absolute transition-all duration-500 shadow-[0_0_10px_#22d3ee]"
                                    style={{ bottom: `${d.avg}%`, marginBottom: '4px' }}
                                ></div>
                                
                                {/* Bar Chart */}
                                <div 
                                    className="w-full bg-slate-700/50 rounded-t-sm transition-all duration-500 group-hover:bg-slate-600 relative"
                                    style={{ height: `${Math.min((d.count / filteredAnalysis.maxTrendCount) * 100, 100)}%` }} // [Phase 2] 동적 스케일
                                >
                                    {d.count > 0 && (
                                        <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[9px] font-bold text-white opacity-0 group-hover:opacity-100 transition-opacity">
                                            {d.count}건
                                        </div>
                                    )}
                                </div>
                                <span className="text-[9px] font-mono text-slate-500">{d.date}</span>
                            </div>
                        ))}
                    </div>
                    <div className="mt-4 flex gap-4 justify-center text-[10px] font-bold">
                        <div className="flex items-center gap-1.5"><div className="w-2 h-2 bg-slate-600 rounded"></div><span>참여 팀 수</span></div>
                        <div className="flex items-center gap-1.5"><div className="w-2 h-2 bg-cyan-400 rounded-full shadow-[0_0_5px_#22d3ee]"></div><span>안전 점수</span></div>
                    </div>
                </div>

                {/* 4. 팀 활동 히트맵 - 필터 트리거 */}
                <div className="col-span-12 bg-slate-800/30 rounded-3xl p-6 border border-slate-700/50 shadow-xl">
                    <div className="flex items-center gap-2 mb-6">
                        <Layers size={18} className="text-violet-400"/>
                        <h3 className="text-sm font-bold text-slate-300 break-words">팀 활동 히트맵 (드릴다운)</h3>
                    </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                        {globalAnalysis.teamStats.map((team) => (
                            <TeamHeatmapCell 
                                key={team.id}
                                name={team.name} 
                                activity={team.count} 
                                score={team.score}
                                maxActivity={globalAnalysis.maxTeamActivity}
                                onClick={() => setFilter(prev => ({
                                    ...prev,
                                    teamIds: prev.teamIds.includes(team.id)
                                        ? prev.teamIds.filter(teamId => teamId !== team.id)
                                        : [...prev.teamIds, team.id],
                                }))}
                                isActive={filter.teamIds.includes(team.id)}
                                isDimmed={filter.teamIds.length > 0 && !filter.teamIds.includes(team.id)}
                            />
                        ))}
                    </div>
                </div>

                <div
                    ref={normalizationSectionRef}
                    className={`col-span-12 bg-slate-800/30 rounded-3xl p-4 md:p-6 border shadow-xl transition-all duration-500 ${normalizationFocusFlash ? 'border-emerald-400/80 ring-2 ring-emerald-400/40' : 'border-amber-500/30'}`}
                >
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
                        <div className="flex items-center gap-2">
                            <Users size={16} className="text-amber-400"/>
                            <h3 className="text-sm font-bold text-slate-300 break-words">미등록 팀 정규화 대기열</h3>
                        </div>
                        <span className="text-[10px] font-bold text-amber-300 bg-amber-500/10 border border-amber-500/30 px-2 py-1 rounded-full">
                            미정규 팀 {unknownTeamQueue.length}건
                        </span>
                    </div>

                    <div className="mb-3 flex flex-wrap gap-2 text-[11px]">
                        <span className="px-2 py-1 rounded border border-cyan-500/40 bg-cyan-600/20 text-cyan-300">평가자: 원인 파악 후 치환 승인</span>
                        <span className="px-2 py-1 rounded border border-indigo-500/40 bg-indigo-600/20 text-indigo-300">실무자: 신규팀 등록 또는 기존팀 치환</span>
                    </div>

                    <div className="mb-4 grid grid-cols-1 md:grid-cols-4 gap-2">
                        <div className="rounded-xl border border-slate-700/60 bg-slate-900/60 px-3 py-2.5">
                            <p className="text-[10px] text-slate-500 font-bold uppercase">대기 요청</p>
                            <p className="text-lg font-black text-white mt-1">{normalizationWorkflowKpi.pendingCount}<span className="text-xs text-slate-500 ml-1">건</span></p>
                        </div>
                        <div className="rounded-xl border border-cyan-500/30 bg-cyan-600/10 px-3 py-2.5">
                            <p className="text-[10px] text-cyan-300 font-bold uppercase">평균 대기</p>
                            <p className="text-lg font-black text-cyan-300 mt-1">{normalizationWorkflowKpi.pendingAvgHours}<span className="text-xs text-cyan-200 ml-1">시간</span></p>
                        </div>
                        <div className="rounded-xl border border-amber-500/30 bg-amber-600/10 px-3 py-2.5">
                            <p className="text-[10px] text-amber-300 font-bold uppercase">최장 대기</p>
                            <p className="text-lg font-black text-amber-300 mt-1">{normalizationWorkflowKpi.pendingMaxHours}<span className="text-xs text-amber-200 ml-1">시간</span></p>
                        </div>
                        <div className="rounded-xl border border-rose-500/30 bg-rose-600/10 px-3 py-2.5">
                            <p className="text-[10px] text-rose-300 font-bold uppercase">24h 초과</p>
                            <p className="text-lg font-black text-rose-300 mt-1">{normalizationWorkflowKpi.pendingOver24h}<span className="text-xs text-rose-200 ml-1">건</span></p>
                        </div>
                    </div>

                    <div className="mb-4 rounded-2xl border border-slate-700/60 bg-slate-900/50 p-3 md:p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <AlertTriangle size={14} className="text-amber-400"/>
                            <p className="text-xs font-bold text-slate-300">운영 경보</p>
                        </div>
                        {normalizationAlertItems.length === 0 ? (
                            <p className="text-[11px] text-emerald-300">현재 임계치 기반 경보가 없습니다.</p>
                        ) : (
                            <div className="flex flex-wrap gap-2">
                                {normalizationAlertItems.map(item => (
                                    <span
                                        key={item.key}
                                        className={`px-2.5 py-1 rounded border text-[11px] font-bold ${item.level === 'critical' ? 'border-rose-500/40 bg-rose-600/20 text-rose-300' : 'border-amber-500/40 bg-amber-600/20 text-amber-300'}`}
                                    >
                                        {item.level === 'critical' ? '긴급' : '주의'} · {item.label}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="mb-4 rounded-2xl border border-slate-700/60 bg-slate-900/50 p-3 md:p-4">
                        <div className="flex items-center justify-between mb-2">
                            <p className="text-xs font-bold text-slate-300">반려 사유 통계 (최근 처리 기준)</p>
                            <span className="text-[10px] text-slate-500">반려 {normalizationWorkflowKpi.rejectedCount}건</span>
                        </div>
                        {normalizationWorkflowKpi.topRejectedReasons.length === 0 ? (
                            <p className="text-[11px] text-slate-500">반려 이력이 없어 사유 통계가 없습니다.</p>
                        ) : (
                            <div className="flex flex-wrap gap-2">
                                {normalizationWorkflowKpi.topRejectedReasons.map(item => (
                                    <span key={item.reason} className="px-2.5 py-1 rounded border border-violet-500/40 bg-violet-600/20 text-[11px] text-violet-300 font-bold">
                                        {reasonCodeLabelMap[item.reason as TeamNormalizationReasonCode] || item.reason} {item.count}건
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>

                    {unknownTeamQueue.length === 0 ? (
                        <div className="rounded-2xl border border-slate-700/60 bg-slate-900/50 p-4 text-xs text-slate-400">
                            미등록/미지정 팀 항목이 없습니다. 현재 팀 데이터가 정규 상태입니다.
                        </div>
                    ) : (
                        <div className="flex flex-col gap-3">
                            {unknownTeamQueue.map(item => {
                                const isWorking = normalizingUnknownLabel === item.sourceLabel;
                                return (
                                    <div key={item.sourceLabel} className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-3 md:p-4">
                                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                                            <div className="min-w-0">
                                                <p className="text-sm font-bold text-white break-words">{item.sourceLabel}</p>
                                                <p className="text-[11px] text-slate-400 mt-1">발생 {item.count}건 · 최근 {item.latestDate}</p>
                                            </div>
                                            <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                                                <select
                                                    value={unknownTeamTargetMap[item.sourceLabel] || ''}
                                                    onChange={(event) => handleUnknownTargetChange(item.sourceLabel, event.target.value)}
                                                    className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2.5 text-xs text-slate-100 min-h-[40px]"
                                                    aria-label={`${item.sourceLabel} 치환 대상 팀 선택`}
                                                    disabled={isWorking}
                                                >
                                                    <option value="">치환 대상 팀 선택</option>
                                                    {teams.map(team => (
                                                        <option key={team.id} value={team.id}>{team.name}</option>
                                                    ))}
                                                </select>
                                                <button
                                                    onClick={() => handleApplyUnknownNormalization(item.sourceLabel)}
                                                    className="px-3 py-2 rounded-lg text-[11px] font-bold border border-emerald-500/40 bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/30 min-h-[40px]"
                                                    disabled={isWorking}
                                                >
                                                    기존팀 치환 요청
                                                </button>
                                                {!item.hasUnassigned && (
                                                    <button
                                                        onClick={() => handlePromoteUnknownTeam(item.sourceLabel)}
                                                        className="px-3 py-2 rounded-lg text-[11px] font-bold border border-indigo-500/40 bg-indigo-600/20 text-indigo-300 hover:bg-indigo-600/30 min-h-[40px]"
                                                        disabled={isWorking}
                                                    >
                                                        신규팀 등록 요청
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    <div ref={pendingRequestSectionRef} className="mt-4 rounded-2xl border border-slate-700/60 bg-slate-900/50 p-3 md:p-4">
                        <div className="flex items-center justify-between mb-2">
                            <p className="text-xs font-bold text-slate-300">정규화 승인 대기 요청</p>
                            <span className="text-[10px] text-slate-500">{pendingNormalizationRequests.length}건</span>
                        </div>
                        {pendingNormalizationRequests.length === 0 ? (
                            <p className="text-[11px] text-slate-500">현재 승인 대기 요청이 없습니다.</p>
                        ) : (
                            <div className="flex flex-col gap-2 max-h-64 overflow-y-auto pr-1">
                                {pendingNormalizationRequests.map(request => {
                                    const isProcessing = processingRequestId === request.id;
                                    const reason = reviewReasonMap[request.id] || 'MISLABEL';
                                    const comment = reviewCommentMap[request.id] || '';
                                    const isFocused = focusedRequestId === request.id;
                                    return (
                                        <div key={request.id} className={`rounded-lg border px-3 py-3 transition-all duration-500 ${isFocused ? 'border-emerald-400/80 bg-emerald-900/20 ring-2 ring-emerald-400/30' : 'border-slate-700/60 bg-slate-950/60'}`}>
                                            <p className="text-[11px] text-slate-200 break-words">
                                                <span className="font-bold text-white">{request.sourceLabel}</span>
                                                {' → '}
                                                <span className="font-bold text-emerald-300">{request.targetTeamName || '신규팀 등록'}</span>
                                            </p>
                                            <p className="text-[10px] text-slate-500 mt-0.5">
                                                요청자 {request.requestedBy} · {new Date(request.requestedAt).toLocaleString('ko-KR')} · {request.action === 'PROMOTE_AND_MAP' ? '신규등록+치환 요청' : '기존팀 치환 요청'}
                                            </p>
                                            <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-2">
                                                <select
                                                    value={reason}
                                                    onChange={(event) => handleRequestReasonChange(request.id, event.target.value as TeamNormalizationReasonCode)}
                                                    className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 text-[11px] text-slate-200 min-h-[38px]"
                                                    disabled={isProcessing}
                                                >
                                                    <option value="MISLABEL">오기입/오분류</option>
                                                    <option value="UNASSIGNED_CLEANUP">미지정 정리</option>
                                                    <option value="DATA_QUALITY">데이터 품질 개선</option>
                                                    <option value="TEAM_REORG">팀 체계 개편</option>
                                                    <option value="EXTERNAL_AUDIT">대외 점검 대응</option>
                                                    <option value="OTHER">기타</option>
                                                </select>
                                                <input
                                                    value={comment}
                                                    onChange={(event) => handleRequestCommentChange(request.id, event.target.value)}
                                                    placeholder="검토 메모(선택)"
                                                    className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 text-[11px] text-slate-200 md:col-span-2"
                                                    disabled={isProcessing}
                                                />
                                            </div>
                                            <div className="mt-2 flex flex-wrap gap-2">
                                                <button
                                                    onClick={() => handleApproveRequest(request.id)}
                                                    className="px-3 py-2 rounded-lg text-[11px] font-bold border border-emerald-500/40 bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/30 min-h-[38px]"
                                                    disabled={isProcessing}
                                                >
                                                    승인
                                                </button>
                                                <button
                                                    onClick={() => handleRejectRequest(request.id)}
                                                    className="px-3 py-2 rounded-lg text-[11px] font-bold border border-rose-500/40 bg-rose-600/20 text-rose-300 hover:bg-rose-600/30 min-h-[38px]"
                                                    disabled={isProcessing}
                                                >
                                                    반려
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    <div className="mt-4 rounded-2xl border border-slate-700/60 bg-slate-900/50 p-3 md:p-4">
                        <div className="flex items-center justify-between mb-2">
                            <p className="text-xs font-bold text-slate-300">요청 처리 이력 (최근)</p>
                            <span className="text-[10px] text-slate-500">{reviewedNormalizationRequests.length}건</span>
                        </div>
                        {reviewedNormalizationRequests.length === 0 ? (
                            <p className="text-[11px] text-slate-500">처리 완료된 요청 이력이 없습니다.</p>
                        ) : (
                            <div className="flex flex-col gap-2 max-h-44 overflow-y-auto pr-1">
                                {reviewedNormalizationRequests.slice(0, 10).map(request => (
                                    <div key={request.id} className="rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 py-2">
                                        <p className="text-[11px] text-slate-200 break-words">
                                            <span className="font-bold text-white">{request.sourceLabel}</span> → <span className="font-bold text-emerald-300">{request.targetTeamName || '신규팀 등록'}</span>
                                        </p>
                                        <p className="text-[10px] text-slate-500 mt-0.5">
                                            {request.status === 'APPROVED' ? '승인' : '반려'} · {request.reviewReasonCode || '기타'} · {request.reviewedBy || '-'} · {request.reviewedAt ? new Date(request.reviewedAt).toLocaleString('ko-KR') : '-'}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="mt-4 rounded-2xl border border-slate-700/60 bg-slate-900/50 p-3 md:p-4">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
                            <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-xs font-bold text-slate-300">정규화 작업 이력 (최근)</p>
                                <span className="text-[10px] text-slate-500">표시 {filteredNormalizationLogs.length}건 / 전체 {normalizationLogs.length}건</span>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                                <button
                                    onClick={() => setNormalizationLogRange('TODAY')}
                                    className={`px-2 py-1 rounded text-[10px] font-bold border ${normalizationLogRange === 'TODAY' ? 'bg-indigo-600/30 text-indigo-200 border-indigo-500/50' : 'bg-slate-900 text-slate-400 border-slate-700 hover:text-slate-200'}`}
                                >
                                    오늘
                                </button>
                                <button
                                    onClick={() => setNormalizationLogRange('7D')}
                                    className={`px-2 py-1 rounded text-[10px] font-bold border ${normalizationLogRange === '7D' ? 'bg-indigo-600/30 text-indigo-200 border-indigo-500/50' : 'bg-slate-900 text-slate-400 border-slate-700 hover:text-slate-200'}`}
                                >
                                    7일
                                </button>
                                <button
                                    onClick={() => setNormalizationLogRange('30D')}
                                    className={`px-2 py-1 rounded text-[10px] font-bold border ${normalizationLogRange === '30D' ? 'bg-indigo-600/30 text-indigo-200 border-indigo-500/50' : 'bg-slate-900 text-slate-400 border-slate-700 hover:text-slate-200'}`}
                                >
                                    30일
                                </button>
                                <button
                                    onClick={handleExportNormalizationLogsCsv}
                                    className="px-2.5 py-1 rounded text-[10px] font-bold border border-emerald-500/40 bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/30"
                                >
                                    CSV 내보내기
                                </button>
                            </div>
                        </div>
                        {filteredNormalizationLogs.length === 0 ? (
                            <p className="text-[11px] text-slate-500">아직 정규화 이력이 없습니다.</p>
                        ) : (
                            <div className="flex flex-col gap-2 max-h-44 overflow-y-auto pr-1">
                                {filteredNormalizationLogs.slice(0, 20).map(log => (
                                    <div key={log.id} className="rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 py-2">
                                        <p className="text-[11px] text-slate-200 break-words">
                                            <span className="font-bold text-white">{log.sourceLabel}</span> → <span className="font-bold text-emerald-300">{log.targetTeamName}</span>
                                        </p>
                                        <p className="text-[10px] text-slate-500 mt-0.5">
                                            {new Date(log.actedAt).toLocaleString('ko-KR')} · {log.actor} · {log.affectedCount}건 · {log.action === 'PROMOTE_AND_MAP' ? '신규등록+치환' : '기존팀 치환'}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* 5. [Phase 3] AI 지시 카드 섹션 */}

                {/* 5-a. 로딩 스켈레톤 */}
                {isAnalyzing && (
                    <div className="col-span-12 rounded-3xl border border-indigo-500/30 bg-indigo-950/30 p-8 flex flex-col gap-4 animate-pulse">
                        <div className="flex items-center gap-3">
                            <div className="animate-spin w-5 h-5 border-2 border-indigo-300/40 border-t-indigo-400 rounded-full"></div>
                            <span className="text-indigo-400 text-sm font-bold">AI 지시 카드 생성 중입니다…</span>
                        </div>
                        {[0,1,2].map(i => (
                            <div key={i} className="h-24 rounded-2xl bg-slate-800/50 border border-slate-700/30"></div>
                        ))}
                    </div>
                )}

                {/* 5-b. 오류 상태 */}
                {analyzeError && !isAnalyzing && (
                    <div className="col-span-12 rounded-3xl border border-red-500/40 bg-red-950/20 p-6 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 text-red-400">
                            <AlertTriangle size={20}/>
                            <span className="text-sm font-bold">AI 분석 요청에 실패했습니다. 네트워크 상태를 확인하거나 잠시 후 다시 시도해 주세요.</span>
                        </div>
                        <button
                            onClick={generateDeepInsight}
                            className="px-4 py-2 bg-red-500/20 hover:bg-red-500/40 text-red-300 border border-red-500/40 rounded-xl text-xs font-bold transition-colors shrink-0"
                        >
                            재시도
                        </button>
                    </div>
                )}

                {/* 5-c. 지시 카드 목록 */}
                {aiCards && aiCards.length > 0 && !isAnalyzing && (
                    <div className="col-span-12">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 bg-indigo-400 rounded-full animate-pulse"></div>
                                <span className="text-xs font-black text-slate-400 tracking-widest">AI 지시 목록</span>
                                <span className="text-[10px] text-indigo-400 font-mono">({aiCards.length}건 발령)</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={handleImportAiCardsToCommandTasks}
                                    className="px-3 py-2 text-[11px] font-bold rounded-lg border border-indigo-500/40 bg-indigo-600/20 text-indigo-300 hover:bg-indigo-600/30 min-h-[40px]"
                                >
                                    지시 워크플로우로 가져오기
                                </button>
                                <button
                                    onClick={() => { setAiCards(null); setAiRawFallback(null); setAnalyzeError(false); }}
                                    aria-label="AI 지시 카드 닫기"
                                    className="text-slate-600 hover:text-slate-400 transition-colors p-2 border border-slate-700 rounded-lg"
                                ><XCircle size={16}/></button>
                            </div>
                        </div>
                        <div className="flex flex-col gap-3">
                            {aiCards.map((order, idx) => <CommandOrderCard key={order.id} order={order} index={idx} />)}
                        </div>
                    </div>
                )}

                {/* 5-d. Raw fallback (JSON 파싱 실패 시) */}
                {aiRawFallback && !isAnalyzing && (
                    <div className="col-span-12 bg-black rounded-3xl p-8 border border-slate-700 shadow-2xl relative overflow-hidden font-mono text-sm leading-relaxed text-slate-300">
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500"></div>
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2 text-green-400">
                                <span className="animate-pulse">●</span>
                                <span className="font-bold">AI 지시 원문</span>
                            </div>
                            <button onClick={() => setAiRawFallback(null)} aria-label="터미널 닫기" className="text-slate-600 hover:text-slate-400"><XCircle size={14}/></button>
                        </div>
                        <div className="whitespace-pre-wrap">{aiRawFallback}</div>
                    </div>
                )}

                {/* 6. [Smart TBM Command] 지휘브리핑 스켈레톤 */}
                <div className="col-span-12 bg-slate-800/40 rounded-3xl p-6 border border-cyan-500/30 shadow-xl">
                    <div className="flex items-center justify-between mb-5">
                        <div className="flex items-center gap-2">
                            <ShieldCheck size={16} className="text-cyan-400"/>
                            <h3 className="text-sm font-bold text-slate-300 break-words">스마트 TBM 지휘 브리핑 (초안)</h3>
                        </div>
                        <span className="text-[10px] font-bold text-cyan-300 bg-cyan-500/10 border border-cyan-500/30 px-2 py-1 rounded-full">지휘 1단계</span>
                    </div>

                    {commandBriefingDraft.length === 0 ? (
                        <div className="rounded-2xl border border-slate-700/60 bg-slate-900/50 p-4 text-xs text-slate-400">
                            브리핑 데이터가 없습니다. 기간/팀 필터를 조정한 뒤 다시 확인하세요.
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            {commandBriefingDraft.map(item => (
                                <div key={item.rank} className="rounded-2xl border border-slate-700/60 bg-slate-900/60 p-4 flex flex-col gap-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] font-black tracking-wider text-cyan-400">상위 {item.rank}</span>
                                        <span className="text-[10px] text-slate-500 font-mono">{item.count}건</span>
                                    </div>
                                    <p className="text-sm font-bold text-white">{item.label}</p>
                                    <p className="text-xs text-slate-300 leading-relaxed">{item.instruction}</p>
                                    <p className="text-[11px] text-emerald-400 font-semibold">핵심지표: {item.kpi}</p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="col-span-12 bg-slate-800/40 rounded-3xl p-4 md:p-6 border border-indigo-500/30 shadow-xl">
                    <div className="flex items-center justify-between mb-4 gap-3">
                        <div className="flex items-center gap-2">
                            <ClipboardList size={16} className="text-indigo-400"/>
                            <h3 className="text-sm font-bold text-slate-300 break-words">스마트 TBM 지휘 워크플로우</h3>
                        </div>
                        <span className="text-[10px] font-bold text-indigo-300 bg-indigo-500/10 border border-indigo-500/30 px-2 py-1 rounded-full">{visibleCommandTasks.length}건</span>
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
                        <div className="xl:col-span-2 bg-slate-900/60 border border-slate-700/50 rounded-2xl p-4 flex flex-col gap-3">
                            <p className="text-xs font-bold text-slate-300">지시 발령</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <button
                                    onClick={handleGenerateValidationCommands}
                                    className="px-3 py-2 text-[11px] font-bold rounded-lg border border-cyan-500/40 bg-cyan-600/20 text-cyan-300 hover:bg-cyan-600/30 min-h-[40px]"
                                >
                                    검증 5건 생성
                                </button>
                                <button
                                    onClick={handleRunValidationTransitions}
                                    className="px-3 py-2 text-[11px] font-bold rounded-lg border border-amber-500/40 bg-amber-600/20 text-amber-300 hover:bg-amber-600/30 min-h-[40px]"
                                >
                                    상태전이 검증
                                </button>
                                <button
                                    onClick={handleClearValidationCommands}
                                    className="px-3 py-2 text-[11px] font-bold rounded-lg border border-rose-500/40 bg-rose-600/20 text-rose-300 hover:bg-rose-600/30 min-h-[40px] sm:col-span-2"
                                >
                                    검증데이터 정리
                                </button>
                            </div>
                            <input
                                value={commandForm.title}
                                onChange={(event) => setCommandForm(prev => ({ ...prev, title: event.target.value }))}
                                placeholder="지시 제목"
                                className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-100 min-h-[42px]"
                            />
                            <textarea
                                value={commandForm.instruction}
                                onChange={(event) => setCommandForm(prev => ({ ...prev, instruction: event.target.value }))}
                                placeholder="실행 지시 내용"
                                rows={3}
                                className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-100"
                            />
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <select
                                    value={commandForm.assigneeTeamId}
                                    onChange={(event) => setCommandForm(prev => ({ ...prev, assigneeTeamId: event.target.value }))}
                                    className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-100 min-h-[42px]"
                                >
                                    <option value="">담당팀(선택)</option>
                                    {teams.map(team => (
                                        <option key={team.id} value={team.id}>{team.name}</option>
                                    ))}
                                </select>
                                <select
                                    value={commandForm.priority}
                                    onChange={(event) => setCommandForm(prev => ({ ...prev, priority: event.target.value as SmartCommandPriority }))}
                                    className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-100 min-h-[42px]"
                                >
                                    <option value="CRITICAL">우선순위: 긴급</option>
                                    <option value="HIGH">우선순위: 높음</option>
                                    <option value="MEDIUM">우선순위: 보통</option>
                                    <option value="LOW">우선순위: 낮음</option>
                                </select>
                            </div>
                            <input
                                type="datetime-local"
                                value={commandForm.dueAt}
                                onChange={(event) => setCommandForm(prev => ({ ...prev, dueAt: event.target.value }))}
                                className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-100 min-h-[42px]"
                            />
                            <input
                                value={commandForm.rationale}
                                onChange={(event) => setCommandForm(prev => ({ ...prev, rationale: event.target.value }))}
                                placeholder="근거 데이터 요약 (필수)"
                                className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-100 min-h-[42px]"
                            />
                            <input
                                value={commandForm.kpi}
                                onChange={(event) => setCommandForm(prev => ({ ...prev, kpi: event.target.value }))}
                                placeholder="핵심지표 (선택)"
                                className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-100 min-h-[42px]"
                            />
                            <button
                                onClick={handleCreateCommandTask}
                                className="mt-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 border border-indigo-500 text-white rounded-lg text-sm font-bold min-h-[44px]"
                            >
                                <Plus size={16}/> 지시 생성
                            </button>
                        </div>

                        <div className="xl:col-span-3 bg-slate-900/40 border border-slate-700/50 rounded-2xl p-4">
                            {visibleCommandTasks.length === 0 ? (
                                <div className="h-full min-h-[220px] flex items-center justify-center text-xs text-slate-500">
                                    생성된 지시가 없습니다. 좌측에서 지시를 발령하세요.
                                </div>
                            ) : (
                                <div className="flex flex-col gap-3 max-h-[560px] overflow-y-auto pr-1">
                                    {visibleCommandTasks.map(task => (
                                        <div key={task.id} className="rounded-xl border border-slate-700/60 bg-slate-900/70 p-3 md:p-4">
                                            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                                                <div className="min-w-0">
                                                    <p className="text-sm font-bold text-white truncate">{task.title}</p>
                                                    <p className="text-xs text-slate-300 mt-1 break-words">{task.instruction}</p>
                                                </div>
                                                <button
                                                    onClick={() => handleDeleteCommandTask(task.id)}
                                                    className="self-start p-2 text-slate-500 hover:text-red-400 border border-slate-700 hover:border-red-500/40 rounded-lg"
                                                    aria-label={`${task.title} 지시 삭제`}
                                                >
                                                    <Trash2 size={14}/>
                                                </button>
                                            </div>
                                            <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
                                                <span className={`px-2 py-1 rounded border ${commandStatusStyle[task.status]}`}>{commandStatusLabel[task.status]}</span>
                                                <span className="px-2 py-1 rounded border border-slate-600 bg-slate-800 text-slate-300">{commandPriorityLabel[task.priority]}</span>
                                                <span className="px-2 py-1 rounded border border-slate-600 bg-slate-800 text-slate-300">{task.assigneeTeamName || '담당팀 미지정'}</span>
                                                {task.dueAt && <span className="px-2 py-1 rounded border border-slate-600 bg-slate-800 text-slate-300">마감: {new Date(task.dueAt).toLocaleString('ko-KR')}</span>}
                                            </div>
                                            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
                                                <button onClick={() => handleCommandStatusChange(task.id, 'NOT_STARTED')} className="px-2 py-2 text-[11px] font-bold rounded-lg border border-slate-600 bg-slate-800 hover:bg-slate-700 min-h-[40px]">미착수</button>
                                                <button onClick={() => handleCommandStatusChange(task.id, 'IN_PROGRESS')} className="px-2 py-2 text-[11px] font-bold rounded-lg border border-blue-500/40 bg-blue-600/20 text-blue-300 hover:bg-blue-600/30 min-h-[40px]">진행중</button>
                                                <button onClick={() => handleCommandStatusChange(task.id, 'DONE')} className="px-2 py-2 text-[11px] font-bold rounded-lg border border-emerald-500/40 bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/30 min-h-[40px]">완료</button>
                                                <button onClick={() => handleCommandStatusChange(task.id, 'DELAYED')} className="px-2 py-2 text-[11px] font-bold rounded-lg border border-red-500/40 bg-red-600/20 text-red-300 hover:bg-red-600/30 min-h-[40px]">지연</button>
                                            </div>

                                            <div className="mt-3 rounded-lg border border-slate-700/60 bg-slate-900/40 p-3">
                                                <div className="flex items-center justify-between mb-2">
                                                    <p className="text-[11px] font-bold text-slate-400">상태 변경 이력</p>
                                                    <span className="text-[10px] text-slate-500">총 {(task.statusHistory || []).length}건</span>
                                                </div>
                                                {(task.statusHistory && task.statusHistory.length > 0) ? (
                                                    <div className="flex flex-col gap-1.5 max-h-24 overflow-y-auto pr-1">
                                                        {task.statusHistory.slice().reverse().map((history, index) => (
                                                            <div key={`${task.id}-history-${history.changedAt}-${index}`} className="text-[10px] text-slate-400 flex items-center gap-2">
                                                                <span className="text-slate-500 font-mono">{new Date(history.changedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                                                                <span>{commandStatusLabel[history.from]} → {commandStatusLabel[history.to]}</span>
                                                                {history.note && <span className="text-slate-500">({history.note})</span>}
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <p className="text-[10px] text-slate-500">아직 상태 변경 이력이 없습니다.</p>
                                                )}
                                            </div>

                                            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                                                <div className="rounded-lg border border-slate-700/60 bg-slate-900/50 p-3">
                                                    <p className="text-[11px] font-bold text-slate-400 mb-2">이행 증빙</p>
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <label className="px-3 py-2 text-[11px] font-bold rounded-lg border border-cyan-500/40 bg-cyan-600/20 text-cyan-300 hover:bg-cyan-600/30 min-h-[40px] cursor-pointer inline-flex items-center">
                                                            사진 첨부
                                                            <input
                                                                type="file"
                                                                accept="image/*"
                                                                className="hidden"
                                                                onChange={(event) => handleCommandEvidenceFileChange(task.id, event)}
                                                            />
                                                        </label>
                                                        <span className="text-[10px] text-slate-500">최대 3장 / 각 3MB</span>
                                                    </div>
                                                    <textarea
                                                        value={task.evidenceComment || ''}
                                                        onChange={(event) => handleCommandEvidenceCommentChange(task.id, event.target.value)}
                                                        placeholder="이행 코멘트(조치 내용/완료 시간 등)"
                                                        rows={2}
                                                        className="mt-2 w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200"
                                                    />
                                                    {(task.evidenceImageUrls && task.evidenceImageUrls.length > 0) && (
                                                        <div className="mt-2 grid grid-cols-3 gap-2">
                                                            {task.evidenceImageUrls.map((imageUrl, index) => (
                                                                <div key={`${task.id}-evidence-${index}`} className="relative rounded-lg overflow-hidden border border-slate-700">
                                                                    <img src={imageUrl} className="w-full h-20 object-cover" />
                                                                    <button
                                                                        onClick={() => handleRemoveEvidenceImage(task.id, index)}
                                                                        className="absolute top-1 right-1 p-1 rounded bg-black/60 text-white"
                                                                        aria-label="증빙 이미지 삭제"
                                                                    >
                                                                        <XCircle size={12}/>
                                                                    </button>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="rounded-lg border border-slate-700/60 bg-slate-900/50 p-3">
                                                    <p className="text-[11px] font-bold text-slate-400 mb-2">지연 사유 코드</p>
                                                    <select
                                                        value={task.delayReason || ''}
                                                        onChange={(event) => handleCommandDelayReasonChange(task.id, event.target.value)}
                                                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 min-h-[40px]"
                                                    >
                                                        <option value="">선택 안함</option>
                                                        <option value="MATERIAL">자재</option>
                                                        <option value="MANPOWER">인원</option>
                                                        <option value="WEATHER">기상</option>
                                                        <option value="OTHER">기타</option>
                                                    </select>
                                                    <textarea
                                                        value={task.delayComment || ''}
                                                        onChange={(event) => handleCommandDelayCommentChange(task.id, event.target.value)}
                                                        placeholder="지연 상세 사유"
                                                        rows={2}
                                                        className="mt-2 w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="col-span-12 bg-slate-800/40 rounded-3xl p-4 md:p-6 border border-violet-500/30 shadow-xl">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                        <div className="flex items-center gap-2">
                            <BarChart2 size={16} className="text-violet-400"/>
                            <h3 className="text-sm font-bold text-slate-300 break-words">스마트 TBM 지휘 일일 리포트</h3>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <button
                                onClick={handleCopyCommandReport}
                                className={`px-3 py-2 rounded-lg text-[11px] font-bold border min-h-[40px] ${commandShareDone ? 'bg-violet-600 text-white border-violet-500' : 'bg-violet-600/20 hover:bg-violet-600/30 text-violet-300 border-violet-500/40'}`}
                            >
                                {commandShareDone ? '복사됨!' : '리포트 복사'}
                            </button>
                            <button
                                onClick={handleCopyValidationLog}
                                className={`px-3 py-2 rounded-lg text-[11px] font-bold border min-h-[40px] ${validationLogCopied ? 'bg-emerald-600 text-white border-emerald-500' : 'bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border-emerald-500/40'}`}
                            >
                                {validationLogCopied ? '복사됨!' : '검증로그 복사'}
                            </button>
                            <button
                                onClick={handleCopyPhaseClearSummary}
                                className={`px-3 py-2 rounded-lg text-[11px] font-bold border min-h-[40px] ${phaseClearLogCopied ? 'bg-cyan-600 text-white border-cyan-500' : 'bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 border-cyan-500/40'}`}
                            >
                                {phaseClearLogCopied ? '복사됨!' : '클리어요약 복사'}
                            </button>
                        </div>
                    </div>

                    <div className="md:hidden mb-3 grid grid-cols-2 gap-2">
                        <button
                            onClick={handleCopyValidationLog}
                            className="px-3 py-3 rounded-xl text-[11px] font-bold border border-emerald-500/40 bg-emerald-600/20 text-emerald-300 min-h-[48px]"
                        >
                            검증 로그 복사
                        </button>
                        <button
                            onClick={handleCopyPhaseClearSummary}
                            className="px-3 py-3 rounded-xl text-[11px] font-bold border border-cyan-500/40 bg-cyan-600/20 text-cyan-300 min-h-[48px]"
                        >
                            클리어 요약 복사
                        </button>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-6 gap-2 md:gap-3">
                        <div className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-3">
                            <p className="text-[10px] text-slate-500 font-bold uppercase">총 지시</p>
                            <p className="text-lg font-black text-white mt-1">{commandReport.totalCommands}<span className="text-xs text-slate-500 ml-1">건</span></p>
                        </div>
                        <div className="rounded-xl border border-emerald-500/30 bg-emerald-600/10 p-3">
                            <p className="text-[10px] text-emerald-300 font-bold uppercase">완료</p>
                            <p className="text-lg font-black text-emerald-300 mt-1">{commandReport.completedCommands}<span className="text-xs text-emerald-200 ml-1">건</span></p>
                        </div>
                        <div className="rounded-xl border border-red-500/30 bg-red-600/10 p-3">
                            <p className="text-[10px] text-red-300 font-bold uppercase">지연</p>
                            <p className="text-lg font-black text-red-300 mt-1">{commandReport.delayedCommands}<span className="text-xs text-red-200 ml-1">건</span></p>
                        </div>
                        <div className="rounded-xl border border-blue-500/30 bg-blue-600/10 p-3">
                            <p className="text-[10px] text-blue-300 font-bold uppercase">완료율</p>
                            <p className="text-lg font-black text-blue-300 mt-1">{commandReport.completionRate}<span className="text-xs text-blue-200 ml-1">%</span></p>
                        </div>
                        <div className="rounded-xl border border-amber-500/30 bg-amber-600/10 p-3">
                            <p className="text-[10px] text-amber-300 font-bold uppercase">지연율</p>
                            <p className="text-lg font-black text-amber-300 mt-1">{commandReport.delayRate}<span className="text-xs text-amber-200 ml-1">%</span></p>
                        </div>
                        <div className="rounded-xl border border-fuchsia-500/30 bg-fuchsia-600/10 p-3">
                            <p className="text-[10px] text-fuchsia-300 font-bold uppercase">재발위험</p>
                            <p className="text-lg font-black text-fuchsia-300 mt-1">{commandReport.recurrenceRiskScore}<span className="text-xs text-fuchsia-200 ml-1">%</span></p>
                        </div>
                    </div>

                    <div className="mt-3 rounded-xl border border-slate-700/60 bg-slate-900/60 p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <div className="text-xs text-slate-300">
                            상태전이 누적: <span className="font-black text-white">{commandReport.totalStatusTransitions}</span>건
                        </div>
                        <span className={`text-[11px] font-bold px-2.5 py-1 rounded border ${commandReport.statusHistoryValidationPassed ? 'border-emerald-500/40 bg-emerald-600/20 text-emerald-300' : 'border-amber-500/40 bg-amber-600/20 text-amber-300'}`}>
                            {commandReport.statusHistoryValidationPassed ? '3단계 이력검증 충족(10+)' : '3단계 이력검증 진행중'}
                        </span>
                    </div>

                    <div className="mt-3 rounded-xl border border-slate-700/60 bg-slate-900/60 p-3">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                            <span className={`text-[11px] font-bold px-2.5 py-1 rounded border ${commandValidationStatus.evaluatorReady ? 'border-cyan-500/40 bg-cyan-600/20 text-cyan-300' : 'border-slate-600 bg-slate-800 text-slate-300'}`}>
                                평가자 관점 {commandValidationStatus.evaluatorReady ? '충족' : '대기'}
                            </span>
                            <span className={`text-[11px] font-bold px-2.5 py-1 rounded border ${commandValidationStatus.practitionerReady ? 'border-indigo-500/40 bg-indigo-600/20 text-indigo-300' : 'border-slate-600 bg-slate-800 text-slate-300'}`}>
                                실무자 관점 {commandValidationStatus.practitionerReady ? '충족' : '대기'}
                            </span>
                            <span className={`text-[11px] font-bold px-2.5 py-1 rounded border ${commandValidationStatus.hasEvidence ? 'border-emerald-500/40 bg-emerald-600/20 text-emerald-300' : 'border-slate-600 bg-slate-800 text-slate-300'}`}>
                                증빙 입력 {commandValidationStatus.hasEvidence ? '완료' : '대기'}
                            </span>
                            <span className={`text-[11px] font-bold px-2.5 py-1 rounded border ${commandValidationStatus.hasEvidenceImage ? 'border-emerald-500/40 bg-emerald-600/20 text-emerald-300' : 'border-slate-600 bg-slate-800 text-slate-300'}`}>
                                증빙 이미지 {commandValidationStatus.hasEvidenceImage ? '완료' : '대기'}
                            </span>
                            <span className={`text-[11px] font-bold px-2.5 py-1 rounded border ${commandValidationStatus.hasDelayReason ? 'border-emerald-500/40 bg-emerald-600/20 text-emerald-300' : 'border-slate-600 bg-slate-800 text-slate-300'}`}>
                                지연사유 입력 {commandValidationStatus.hasDelayReason ? '완료' : '대기'}
                            </span>
                            <span className={`text-[11px] font-bold px-2.5 py-1 rounded border ${commandValidationStatus.hasReportData ? 'border-emerald-500/40 bg-emerald-600/20 text-emerald-300' : 'border-slate-600 bg-slate-800 text-slate-300'}`}>
                                리포트 데이터 {commandValidationStatus.hasReportData ? '확보' : '없음'}
                            </span>
                            <span className={`text-[11px] font-bold px-2.5 py-1 rounded border ${commandReportCopiedOnce ? 'border-emerald-500/40 bg-emerald-600/20 text-emerald-300' : 'border-slate-600 bg-slate-800 text-slate-300'}`}>
                                리포트 복사 {commandReportCopiedOnce ? '완료' : '대기'}
                            </span>
                        </div>
                        <span className={`text-[11px] font-bold px-2.5 py-1 rounded border ${commandValidationStatus.isDone ? 'border-emerald-500/40 bg-emerald-600/20 text-emerald-300' : 'border-amber-500/40 bg-amber-600/20 text-amber-300'}`}>
                            {commandValidationStatus.isDone ? '3/4단계 통합검증 충족' : '3/4단계 통합검증 진행'}
                        </span>
                    </div>

                    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="rounded-xl border border-slate-700/60 bg-slate-900/50 p-3">
                            <p className="text-[11px] font-bold text-slate-400 mb-2">지연 사유 Top</p>
                            {commandReport.topDelayReasons.length > 0 ? (
                                <div className="flex flex-wrap gap-2">
                                    {commandReport.topDelayReasons.map(item => (
                                        <span key={`delay-${item.reason}`} className="px-2 py-1 rounded border border-slate-600 bg-slate-800 text-[11px] text-slate-300">
                                            {delayReasonLabelMap[item.reason] || item.reason} {item.count}건
                                        </span>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-[11px] text-slate-500">지연 사유 데이터가 없습니다.</p>
                            )}
                        </div>
                        <div className="rounded-xl border border-slate-700/60 bg-slate-900/50 p-3">
                            <p className="text-[11px] font-bold text-slate-400 mb-2">주요 위험요인 Top3</p>
                            {commandReport.topRisks.length > 0 ? (
                                <div className="flex flex-wrap gap-2">
                                    {commandReport.topRisks.map((risk, index) => (
                                        <span key={`risk-${risk}-${index}`} className="px-2 py-1 rounded border border-indigo-500/40 bg-indigo-600/20 text-[11px] text-indigo-300">
                                            {risk}
                                        </span>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-[11px] text-slate-500">위험요인 데이터가 없습니다.</p>
                            )}
                        </div>
                    </div>
                </div>

                {/* 7. [Phase 4] 비교 지표 + 스냅샷 + 내보내기 + 공유 */}
                <div className="col-span-12 grid grid-cols-1 md:grid-cols-2 gap-6">

                    {/* 6-a. 비교 지표 카드 */}
                    <div className="bg-slate-800/50 rounded-3xl p-6 border border-slate-700 shadow-xl">
                        <div className="flex items-center gap-2 mb-5">
                            <TrendingUp size={16} className="text-violet-400"/>
                            <h3 className="text-sm font-bold text-slate-400 tracking-wider">기간 비교</h3>
                        </div>
                        <div className="grid grid-cols-1 gap-3">
                            {([
                                { label: '이번 주 활동 건수', curr: compareAnalysis.thisWeek.count,  diff: compareAnalysis.countWeekDiff,  unit: '건' },
                                { label: '이번 주 안전점수',  curr: compareAnalysis.thisWeek.score,  diff: compareAnalysis.scoreWeekDiff,  unit: '점' },
                                { label: '이번 주 참여인원',  curr: compareAnalysis.thisWeek.people, diff: compareAnalysis.peopleWeekDiff, unit: '명' },
                                { label: '이번 달 활동 건수', curr: compareAnalysis.thisMonth.count,  diff: compareAnalysis.countMonthDiff, unit: '건' },
                                { label: '이번 달 안전점수',  curr: compareAnalysis.thisMonth.score,  diff: compareAnalysis.scoreMonthDiff, unit: '점' },
                            ] as Array<{ label: string; curr: number; diff: number | null; unit: string }>).map((item) => {
                                const isPos = item.diff !== null && item.diff > 0;
                                const isNeg = item.diff !== null && item.diff < 0;
                                return (
                                    <div key={item.label} className="flex items-center justify-between bg-slate-900/60 rounded-xl px-4 py-3 border border-slate-700/40">
                                        <span className="text-xs text-slate-400 font-medium">{item.label}</span>
                                        <div className="flex items-center gap-3">
                                            <span className="text-sm font-black text-white">{item.curr}<span className="text-[10px] text-slate-500 ml-0.5">{item.unit}</span></span>
                                            {item.diff !== null ? (
                                                <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${isPos ? 'bg-emerald-500/20 text-emerald-400' : isNeg ? 'bg-red-500/20 text-red-400' : 'bg-slate-700 text-slate-400'}`}>
                                                    {isPos ? '+' : ''}{item.diff}%
                                                </span>
                                            ) : (
                                                <span className="text-[11px] text-slate-600 font-mono">없음</span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* 6-b. 스냅샷 + CSV + 공유 */}
                    <div className="bg-slate-800/50 rounded-3xl p-6 border border-slate-700 shadow-xl flex flex-col gap-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <HardDrive size={16} className="text-cyan-400"/>
                                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Snapshot & Export</h3>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={handleExportCSV}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 border border-emerald-500/30 rounded-lg text-[11px] font-bold transition-colors"
                                >
                                    <FileText size={12}/> CSV
                                </button>
                                <button
                                    onClick={handleCopyShareText}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-[11px] font-bold transition-colors ${copyDone ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-400 border-indigo-500/30'}`}
                                >
                                    <Share2 size={12}/> {copyDone ? '복사됨!' : '공유'}
                                </button>
                                <button
                                    onClick={handleSaveSnapshot}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600/20 hover:bg-violet-600/40 text-violet-400 border border-violet-500/30 rounded-lg text-[11px] font-bold transition-colors"
                                >
                                    <Download size={12}/> 스냅샷
                                </button>
                            </div>
                        </div>

                        {/* 스냅샷 목록 */}
                        <div className="flex flex-col gap-2 flex-1 min-h-[120px] overflow-y-auto max-h-64 pr-1">
                            {snapshots.length === 0 ? (
                                <div className="flex-1 flex items-center justify-center text-slate-600 text-xs">
                                    저장된 스냅샷이 없습니다. 현재 분석 상태를 저장해 두세요.
                                </div>
                            ) : (
                                snapshots.map(snap => (
                                    <div key={snap.id} className="flex items-center justify-between bg-slate-900/60 rounded-xl px-4 py-3 border border-slate-700/40 gap-3">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="text-xs font-bold text-white truncate">{snap.label}</span>
                                                <span className="text-[10px] text-slate-500 font-mono shrink-0">{new Date(snap.savedAt).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                                            </div>
                                            <div className="flex items-center gap-3 mt-1">
                                                <span className="text-[10px] text-slate-400">점수 <strong className="text-white">{snap.avgScore}</strong></span>
                                                <span className="text-[10px] text-slate-400">건수 <strong className="text-white">{snap.totalEntries}</strong></span>
                                                <span className="text-[10px] text-slate-400">주요위험 <strong className="text-amber-400">{snap.topRisk}</strong></span>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => handleDeleteSnapshot(snap.id)}
                                            aria-label={`${snap.label} 스냅샷 삭제`}
                                            className="text-slate-600 hover:text-red-400 transition-colors shrink-0"
                                        ><XCircle size={14}/></button>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>

                {/* 8. Data Management Strip */}
                <div className="col-span-12 flex flex-col md:flex-row gap-4 bg-slate-800/80 p-6 rounded-3xl border border-slate-700 items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-slate-700 rounded-xl text-slate-400">
                            <Database size={24}/>
                        </div>
                        <div>
                            <h4 className="font-bold text-white text-sm">데이터 자산 관리</h4>
                            <p className="text-xs text-slate-400">안전 데이터를 백업하거나 복구하여 자산화합니다.</p>
                        </div>
                    </div>
                    <div className="flex gap-3">
                        <button onClick={() => onBackupData('ALL')} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-2 border border-slate-600">
                            <Download size={14}/> 전체 백업
                        </button>
                        <button onClick={() => restoreInputRef.current?.click()} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-2 shadow-lg shadow-indigo-900/50">
                            <Upload size={14}/> 데이터 복구
                        </button>
                        <input type="file" ref={restoreInputRef} className="hidden" accept=".json" multiple onChange={handleRestoreClick} />
                    </div>
                </div>

            </div>
        </div>
    );
};
