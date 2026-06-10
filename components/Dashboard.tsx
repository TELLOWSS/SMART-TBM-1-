
import React, { useMemo, useState, useRef } from 'react';
import { TBMEntry } from '../types';
import { entryHasTeamName, getEntryTeamLabel, getEntryTeamNames } from '../utils/teamUtils';
import { Users, FileText, BarChart2, ShieldAlert, Trash2, Radio, CloudRain, Sun, CloudSnow, MapPin, ArrowRight, ShieldCheck, Activity, Microscope, Clock, Siren, CheckCircle2, AlertTriangle, Wind, Droplets, RefreshCw, CloudLightning, Cloud, Eye, Mic, Shield, ChevronDown, ClipboardCheck } from 'lucide-react';

interface DashboardProps {
  entries: TBMEntry[];
  siteName: string; // [NEW] Dynamic Site Name
    normalizationAlertSummary?: {
        criticalCount: number;
        warningCount: number;
        pendingCount: number;
        pendingOver24h: number;
        topAlertLabel?: string | null;
    };
  onViewReport: () => void;
    onNavigateToReports: (options?: { teamName?: string | null; linkStatus?: 'all' | 'unlinked' | 'mismatched' }) => void;
    onNavigateToDataLab: (options?: { focusTarget?: 'NORMALIZATION_WORKFLOW' | null }) => void; 
  onNewEntry: () => void; 
  onEdit: (entry: TBMEntry) => void;
  onOpenSettings: () => void;
  onDelete: (id: string) => void; 
  onPrintSingle: (entry: TBMEntry) => void; 
}

// --- [Component 0] Detailed Daily Bar Chart (Replacement for Sparkline) ---
const DailyBarChart = ({ 
    data, 
    color = "#6366f1", 
    height = 50, 
    labels = [] 
}: { 
    data: number[], 
    color?: string, 
    height?: number,
    labels?: string[]
}) => {
    // Fill empty data if needed to ensure 7 days
    const chartData = data.length < 7 ? [...Array(7 - data.length).fill(0), ...data] : data.slice(-7);
    const maxVal = 100; // Fixed scale for safety scores

    return (
        <div className="flex flex-col w-full">
            <div className="flex items-end justify-between gap-1" style={{ height }}>
                {chartData.map((val, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center group relative">
                        {/* Tooltip */}
                        <div className="absolute -top-8 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 bg-slate-800 text-white text-[10px] px-2 py-1 rounded transition-opacity whitespace-nowrap z-20 font-bold shadow-lg pointer-events-none transform -translate-y-1">
                            {val > 0 ? `${Math.round(val)}점` : '미실시'}
                            <div className="absolute bottom-[-4px] left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-800 rotate-45"></div>
                        </div>

                        {/* Bar */}
                        <div
                            role="img"
                            aria-label={`${labels[i] || `${i + 1}일`} 점수 ${val > 0 ? `${Math.round(val)}점` : '미실시'}`}
                            className="w-full rounded-t-md transition-all duration-700 ease-out"
                            style={{ 
                                height: val > 0 ? `${(val / maxVal) * 100}%` : '4px',
                                backgroundColor: val > 0 ? color : undefined
                            }}
                        />
                    </div>
                ))}
            </div>
            {/* X-Axis Labels */}
            <div className="flex justify-between mt-1 border-t border-slate-200 pt-1">
                {chartData.map((_, i) => {
                    const lbl = labels[i] || `${i + 1}`;
                    return <span key={i} className="text-[8px] text-slate-400 font-bold text-center flex-1">{lbl}</span>;
                })}
            </div>
        </div>
    );
};

const LiveClock = () => {
    const [time, setTime] = useState<Date>(new Date());

    React.useEffect(() => {
        const updateClock = () => {
            setTime(new Date());
        };

        const timer = setInterval(updateClock, 1000);
        return () => clearInterval(timer);
    }, []);

    const dateStr = time.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' });
    const timeStr = time.toLocaleTimeString('ko-KR', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

    return (
        <div className="flex flex-col items-start md:items-end" role="timer" aria-live="off" aria-label="현재 한국 표준시 시계">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span> KST (한국 표준시)
            </div>
            <div className="flex items-baseline gap-2 text-slate-700">
                <span className="text-sm font-bold">{dateStr}</span>
                <span className="text-xl font-black font-mono tracking-tight">{timeStr}</span>
            </div>
        </div>
    );
};

const DEFAULT_SITE_COORDS = { latitude: 37.241, longitude: 127.178 };

const resolveSiteCoordinates = async (siteName: string, signal: AbortSignal) => {
    const query = encodeURIComponent(siteName.trim());
    if (!query) return DEFAULT_SITE_COORDS;

    try {
        const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${query}&count=1&language=ko&format=json`, { signal });
        if (!response.ok) throw new Error('Geocoding API Error');

        const data = await response.json();
        const firstResult = data?.results?.[0];
        if (!firstResult) return DEFAULT_SITE_COORDS;

        return {
            latitude: firstResult.latitude,
            longitude: firstResult.longitude,
        };
    } catch (error: any) {
        if (error.name === 'AbortError') throw error;
        console.warn('Failed to resolve site coordinates:', error);
        return DEFAULT_SITE_COORDS;
    }
};

// --- [Component 2] Site Weather Station ---
const WeatherStation = ({ siteName }: { siteName: string }) => {
    const [weather, setWeather] = useState({ temp: 0, condition: 'Sun', wind: 0, humidity: 0 });
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isLoaded, setIsLoaded] = useState(false);
    // [FIX] AbortController ref to cancel in-flight requests on unmount or new request
    const abortControllerRef = useRef<AbortController | null>(null);
    const requestSeqRef = useRef(0);

    const fetchRealWeather = async () => {
        const requestId = ++requestSeqRef.current;
        // Cancel any previous in-flight request
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        const controller = new AbortController();
        abortControllerRef.current = controller;

        setIsRefreshing(true);
        try {
            const coords = await resolveSiteCoordinates(siteName, controller.signal);
            const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${coords.latitude}&longitude=${coords.longitude}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&timezone=Asia%2FSeoul`, { signal: controller.signal });
            if (!response.ok) throw new Error("Weather API Error");
            
            const data = await response.json();
            const current = data.current;
            
            let condition = 'Sun';
            const code = current.weather_code;
            
            if (code === 0 || code === 1) condition = 'Sun';
            else if (code === 2 || code === 3 || code === 45 || code === 48) condition = 'Cloud';
            else if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || (code >= 95 && code <= 99)) condition = 'Rain';
            else if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) condition = 'Snow';

            if (requestId !== requestSeqRef.current) return;
            setWeather({
                temp: Math.round(current.temperature_2m),
                humidity: current.relative_humidity_2m,
                wind: current.wind_speed_10m,
                condition: condition
            });
            setIsLoaded(true);
        } catch (error: any) {
            // [FIX] Ignore AbortError — it's intentional cancellation, not a real error
            if (error.name === 'AbortError') return;
            console.error("Failed to fetch weather:", error);
            if (requestId !== requestSeqRef.current) return;
            setWeather(prev => ({ ...prev, temp: 20, condition: 'Sun' }));
            setIsLoaded(true);
        } finally {
            if (requestId !== requestSeqRef.current) return;
            setIsRefreshing(false);
        }
    };

    React.useEffect(() => {
        fetchRealWeather();
        const interval = setInterval(fetchRealWeather, 15 * 60 * 1000);
        return () => {
            clearInterval(interval);
            // [FIX] Abort any pending fetch on unmount
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
        };
    }, [siteName]);
    
    const riskLevel = useMemo(() => {
        if (weather.temp <= -10) return { level: 'CRITICAL', msg: '작업 중지 검토 (한파)' };
        if (weather.temp >= 33) return { level: 'WARNING', msg: '온열 질환 주의 (휴식)' };
        if (weather.condition === 'Rain') return { level: 'WARNING', msg: '미끄럼/감전 주의' };
        if (weather.condition === 'Snow') return { level: 'WARNING', msg: '결빙/미끄럼 주의' };
        if (weather.wind >= 15) return { level: 'CRITICAL', msg: '타워크레인 작업 중지' };
        return { level: 'NORMAL', msg: '통상 작업 가능' };
    }, [weather]);

    const handleRefresh = () => {
        if(isRefreshing) return;
        fetchRealWeather();
    };

    return (
        <div className="bg-white rounded-[24px] p-5 border border-slate-200 shadow-sm h-full flex flex-col justify-between relative overflow-hidden group" aria-label={`${siteName} 실시간 기상 정보`}>
            <div className={`absolute top-0 left-0 right-0 h-1.5 ${riskLevel.level === 'CRITICAL' ? 'bg-red-500' : riskLevel.level === 'WARNING' ? 'bg-amber-500' : 'bg-emerald-500'}`}></div>

            <div className="flex justify-between items-start z-10">
                <div>
                    <div className="flex items-center gap-1.5 text-slate-500 mb-1">
                        <MapPin size={12} />
                        <span className="text-xs font-bold truncate max-w-[120px]">{siteName}</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="text-4xl font-black text-slate-800 tracking-tighter">
                            {isLoaded ? `${weather.temp}°` : '--'}
                        </span>
                        <div className="flex flex-col">
                            <span className="text-xs font-bold text-slate-600">
                                {!isLoaded ? '로딩중...' : 
                                weather.condition === 'Snow' ? '눈 (강설)' : 
                                weather.condition === 'Rain' ? '비 (우천)' : 
                                weather.condition === 'Cloud' ? '구름많음' : '맑음'}
                            </span>
                            {isLoaded && <span className="text-[10px] text-slate-400">체감온도 {(weather.temp - (weather.wind * 0.7)).toFixed(1)}°</span>}
                        </div>
                    </div>
                </div>
                <div className="flex flex-col gap-2 items-end">
                    <button 
                        onClick={handleRefresh}
                        disabled={isRefreshing}
                        aria-label="현장 기상 정보 새로고침"
                        className={`p-2 rounded-full transition-all text-slate-400 hover:text-indigo-600 disabled:opacity-50 flex items-center gap-1 bg-slate-50 hover:bg-slate-100 ${isRefreshing ? 'ring-2 ring-indigo-100' : ''}`}
                        title="현장 기상 실시간 갱신"
                    >
                        <RefreshCw size={14} className={isRefreshing ? 'animate-spin text-indigo-500' : ''} />
                        <span className="text-[9px] font-bold text-slate-500">실시간</span>
                    </button>
                    <div className="p-3 bg-slate-50 rounded-2xl">
                        {weather.condition === 'Snow' ? <CloudSnow size={28} className="text-sky-400"/> : 
                        weather.condition === 'Rain' ? <CloudRain size={28} className="text-blue-400"/> : 
                        weather.condition === 'Cloud' ? <Cloud size={28} className="text-slate-400"/> :
                        <Sun size={28} className="text-amber-500"/>}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-2 mt-4 z-10">
                <div className="bg-slate-50 rounded-xl p-2 flex items-center gap-2">
                    <Wind size={14} className="text-slate-400"/>
                    <div>
                        <p className="text-[9px] text-slate-400 font-bold">풍속</p>
                        <p className="text-xs font-black text-slate-700">{isLoaded ? `${weather.wind} m/s` : '-'}</p>
                    </div>
                </div>
                <div className="bg-slate-50 rounded-xl p-2 flex items-center gap-2">
                    <Droplets size={14} className="text-slate-400"/>
                    <div>
                        <p className="text-[9px] text-slate-400 font-bold">습도</p>
                        <p className="text-xs font-black text-slate-700">{isLoaded ? `${weather.humidity}%` : '-'}</p>
                    </div>
                </div>
            </div>

            <div className={`mt-3 p-3 rounded-xl flex items-start gap-2 ${riskLevel.level === 'NORMAL' ? 'bg-emerald-50 text-emerald-700' : riskLevel.level === 'WARNING' ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'}`}>
                {riskLevel.level === 'NORMAL' ? <CheckCircle2 size={16} className="mt-0.5 shrink-0"/> : <AlertTriangle size={16} className="mt-0.5 shrink-0 animate-pulse"/>}
                <div className="flex-1">
                    <p className="text-[10px] font-black mb-0.5">현장 경보 단계: {riskLevel.level === 'NORMAL' ? '정상' : riskLevel.level === 'WARNING' ? '주의' : '긴급'}</p>
                    <p className="text-xs font-bold leading-tight">{riskLevel.msg}</p>
                </div>
            </div>
        </div>
    );
};

const CommandActionCard = ({ onClick }: { onClick: () => void }) => (
    <button 
        onClick={onClick}
        aria-label="새 TBM 일지 등록"
        className="w-full h-full bg-slate-900 rounded-3xl p-5 text-left relative overflow-hidden group hover:bg-slate-800 transition-colors shadow-lg shadow-slate-200 flex flex-col justify-between border border-slate-800"
    >
        <div className="relative z-10 flex justify-between items-start">
            <div className="bg-indigo-600 p-3 rounded-2xl text-white shadow-lg shadow-indigo-900/50 group-hover:bg-indigo-500 transition-colors">
                <ClipboardCheck size={26}/>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 border border-white/10">
                <span className="text-[10px] font-bold text-slate-200">일지·사진·영상 등록</span>
            </div>
        </div>

        <div className="relative z-10 mt-4">
            <h2 className="text-2xl font-black text-white leading-tight tracking-tight mb-2">
                새 TBM 일지 등록
            </h2>
            <p className="text-sm text-slate-400 font-medium">
                팀을 선택하고 작업 내용과 증빙 자료를<br/>
                한 번에 등록합니다.
            </p>
        </div>

        <div className="relative z-10 mt-5 flex items-center gap-3">
            <div className="h-10 px-5 bg-white text-slate-900 rounded-xl flex items-center gap-2 font-black text-sm group-hover:bg-indigo-50 transition-colors">
                등록 시작 <ArrowRight size={16} />
            </div>
        </div>
    </button>
);

interface KpiCardProps {
    icon: React.ReactNode;
    label: string;
    value: number | string;
    unit: string;
    colorClass: string;
}

const KpiCard = ({ icon, label, value, unit, colorClass }: KpiCardProps) => (
    <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
        <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-0.5">{label}</p>
            <div className="flex items-baseline gap-1">
                <span className="text-2xl font-black text-slate-800">{value}</span>
                <span className="text-xs font-bold text-slate-500">{unit}</span>
            </div>
        </div>
        <div className={`p-3 rounded-xl ${colorClass}`}>
            {icon}
        </div>
    </div>
);

export const Dashboard: React.FC<DashboardProps> = ({ entries, siteName, normalizationAlertSummary, onViewReport, onNavigateToReports, onNavigateToDataLab, onNewEntry, onEdit, onDelete }) => {
    const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null);
    const [selectedIssueTeam, setSelectedIssueTeam] = useState<string | null>(null);
    const [selectedLocation, setSelectedLocation] = useState<string | null>(null);

    const formatLocationSummary = (entry: TBMEntry) => {
        return [entry.locationBuildingScope, entry.locationArea, entry.locationDetail]
            .map(value => value?.trim())
            .filter(Boolean)
            .join(' / ');
    };

    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    const dailySummary = useMemo(() => {
        const todaysEntries = entries.filter(entry => entry.date === today);
        const riskCount = todaysEntries.reduce((acc, curr) => acc + (curr.riskFactors?.length || 0), 0);
        const workerCount = todaysEntries.reduce((acc, curr) => acc + (curr.attendeesCount || 0), 0);
        const verifiedVideoCount = todaysEntries.filter(entry =>
            entry.videoAnalysis?.analysisSource === 'VIDEO'
            && entry.videoAnalysis.verificationStatus === 'VERIFIED'
        ).length;
        const manualEvaluationCount = todaysEntries.filter(entry =>
            entry.videoAnalysis?.analysisSource === 'MANUAL'
        ).length;
        const recentEntries = todaysEntries.slice(0, 10);
        const linkedEntries = todaysEntries.filter(entry => !!entry.linkedRiskAssessmentId || !!entry.linkedRiskAssessmentLabel);
        const matchedEntries = linkedEntries.filter(entry => entry.linkedRiskAssessmentMatchedByMonth);
        const mismatchedEntries = linkedEntries.filter(entry => !entry.linkedRiskAssessmentMatchedByMonth);
        const missingLinkedEntries = todaysEntries.filter(entry => !entry.linkedRiskAssessmentId && !entry.linkedRiskAssessmentLabel);
        const primaryLinkageIssueEntry = missingLinkedEntries[0] || mismatchedEntries[0] || null;
        const issueTeamSummary = (Object.values(todaysEntries.reduce((acc, entry) => {
            const teamNames = getEntryTeamNames(entry);
            const labels = teamNames.length > 0 ? teamNames : [getEntryTeamLabel(entry)];
            labels.forEach(teamName => {
                if (!acc[teamName]) {
                    acc[teamName] = { teamName, missing: 0, mismatched: 0, matched: 0, total: 0 };
                }
                acc[teamName].total += 1;
                if (!entry.linkedRiskAssessmentId && !entry.linkedRiskAssessmentLabel) {
                    acc[teamName].missing += 1;
                } else if (!entry.linkedRiskAssessmentMatchedByMonth) {
                    acc[teamName].mismatched += 1;
                } else {
                    acc[teamName].matched += 1;
                }
            });
            return acc;
        }, {} as Record<string, { teamName: string; missing: number; mismatched: number; matched: number; total: number }>)) as Array<{
            teamName: string;
            missing: number;
            mismatched: number;
            matched: number;
            total: number;
        }>)
            .filter(team => team.missing > 0 || team.mismatched > 0)
            .sort((left, right) => (right.missing + right.mismatched) - (left.missing + left.mismatched) || right.total - left.total)
            .slice(0, 4);

        const locationSummary = (Object.values(todaysEntries.reduce((acc, entry) => {
            const locationLabel = formatLocationSummary(entry);
            if (!locationLabel) return acc;
            if (!acc[locationLabel]) {
                acc[locationLabel] = { label: locationLabel, total: 0, riskCount: 0, peopleCount: 0 };
            }
            acc[locationLabel].total += 1;
            acc[locationLabel].riskCount += entry.riskFactors?.length || 0;
            acc[locationLabel].peopleCount += entry.attendeesCount || 0;
            return acc;
        }, {} as Record<string, { label: string; total: number; riskCount: number; peopleCount: number }>)) as Array<{
            label: string;
            total: number;
            riskCount: number;
            peopleCount: number;
        }>)
            .sort((left, right) => right.total - left.total || right.riskCount - left.riskCount)
            .slice(0, 6);

        return {
            todaysEntries,
            riskCount,
            workerCount,
            verifiedVideoCount,
            manualEvaluationCount,
            recentEntries,
            linkedEntries,
            matchedEntries,
            mismatchedEntries,
            missingLinkedEntries,
            primaryLinkageIssueEntry,
            issueTeamSummary,
            locationSummary,
        };
    }, [entries, today]);
    
    const teamActivityData = useMemo(() => {
        // Generate last 7 days keys (D-6 to D-Day)
        const last7Days = Array.from({length: 7}, (_, i) => {
            const d = new Date();
            d.setDate(d.getDate() - (6 - i));
            return d.toISOString().slice(0, 10);
        });
        
        // Short labels for graph (e.g. "Mon", "Tue" or "10/01")
        const dateLabels = last7Days.map(dateStr => {
            const d = new Date(dateStr);
            return `${d.getMonth()+1}/${d.getDate()}`;
        });

        const teamMap: Record<string, { 
            totalActivity: number, 
            scoreSum: number,
            scoreCount: number,
            dailyScores: number[], // Use overall score for summary sparkline
            
            // Detailed Metrics (Max score per day to show best effort)
            detailed: {
                log: number[],
                focus: number[],
                voice: number[],
                ppe: number[]
            }
        }> = {};

        entries.forEach(e => {
            if (last7Days.includes(e.date)) {
                const teamName = e.teamName || '미지정';
                if (!teamMap[teamName]) {
                    teamMap[teamName] = { 
                        totalActivity: 0, scoreSum: 0, scoreCount: 0,
                        dailyScores: Array(7).fill(0),
                        detailed: {
                            log: Array(7).fill(0),
                            focus: Array(7).fill(0),
                            voice: Array(7).fill(0),
                            ppe: Array(7).fill(0)
                        }
                    };
                }
                
                const dateIndex = last7Days.indexOf(e.date);
                if (dateIndex !== -1) {
                    const data = teamMap[teamName];
                    data.totalActivity += 1;
                    
                    const score = e.videoAnalysis?.score || 0;
                    if (score > 0) {
                        data.scoreSum += score;
                        data.scoreCount += 1;
                        // For display, prioritize the highest score if multiple entries exist per day
                        data.dailyScores[dateIndex] = Math.max(data.dailyScores[dateIndex], score);
                    }

                    const r = e.videoAnalysis?.rubric;
                    if (r) {
                        // Normalize to 100 scale for consistency and store rounded values
                        data.detailed.log[dateIndex] = Math.max(data.detailed.log[dateIndex], Math.round((r.logQuality || 0) / 30 * 100));
                        data.detailed.focus[dateIndex] = Math.max(data.detailed.focus[dateIndex], Math.round((r.focus || 0) / 30 * 100));
                        data.detailed.voice[dateIndex] = Math.max(data.detailed.voice[dateIndex], Math.round((r.voice || 0) / 20 * 100));
                        data.detailed.ppe[dateIndex] = Math.max(data.detailed.ppe[dateIndex], Math.round((r.ppe || 0) / 20 * 100));
                    }
                }
            }
        });

        const sortedTeams = Object.entries(teamMap)
            .map(([name, data]) => {
                const avgScore = data.scoreCount > 0 ? Math.round(data.scoreSum / data.scoreCount) : 0;
                
                // Helper to get average of non-zero entries for detailed metrics
                const getAvg = (arr: number[]) => {
                    const nonZero = arr.filter(n => n > 0);
                    return nonZero.length > 0 ? Math.round(nonZero.reduce((a, b) => a + b, 0) / nonZero.length) : 0;
                };

                const detailAvgs = {
                    log: getAvg(data.detailed.log),
                    focus: getAvg(data.detailed.focus),
                    voice: getAvg(data.detailed.voice),
                    ppe: getAvg(data.detailed.ppe)
                };

                let grade = '-';
                if (avgScore >= 90) grade = 'S';
                else if (avgScore >= 80) grade = 'A';
                else if (avgScore >= 70) grade = 'B';
                else if (avgScore > 0) grade = 'C';

                return { name, ...data, avgScore, grade, detailAvgs };
            })
            .sort((a, b) => b.totalActivity - a.totalActivity);

        return { teams: sortedTeams, labels: dateLabels };
    }, [entries]);

    const visibleRealtimeEntries = useMemo(() => {
        const teamFiltered = selectedIssueTeam
            ? dailySummary.todaysEntries.filter(entry => entryHasTeamName(entry, selectedIssueTeam))
            : dailySummary.todaysEntries;

        const locationFiltered = selectedLocation
            ? teamFiltered.filter(entry => formatLocationSummary(entry) === selectedLocation)
            : teamFiltered;

        const targetEntries = selectedIssueTeam || selectedLocation
            ? locationFiltered
            : dailySummary.recentEntries;

        return targetEntries.slice(0, 10);
    }, [dailySummary.todaysEntries, dailySummary.recentEntries, selectedIssueTeam, selectedLocation]);

    const selectedIssueTeamPrimaryEntry = useMemo(() => {
        if (!selectedIssueTeam) return dailySummary.primaryLinkageIssueEntry;

        return dailySummary.todaysEntries.find(entry => {
            const hasIssue = !entry.linkedRiskAssessmentId || !entry.linkedRiskAssessmentMatchedByMonth;
            return entryHasTeamName(entry, selectedIssueTeam) && hasIssue;
        }) || dailySummary.primaryLinkageIssueEntry;
    }, [dailySummary.primaryLinkageIssueEntry, dailySummary.todaysEntries, selectedIssueTeam]);

    const hasNormalizationAlert = (normalizationAlertSummary?.criticalCount || 0) > 0 || (normalizationAlertSummary?.warningCount || 0) > 0;
    const hasCriticalNormalizationAlert = (normalizationAlertSummary?.criticalCount || 0) > 0;
    const linkageActionCount = dailySummary.missingLinkedEntries.length + dailySummary.mismatchedEntries.length;
    const todayActionCount = linkageActionCount + (normalizationAlertSummary?.pendingCount || 0);
    const priorityReportFilter = dailySummary.missingLinkedEntries.length > 0
        ? 'unlinked'
        : dailySummary.mismatchedEntries.length > 0
            ? 'mismatched'
            : 'all';
    
    return (
        <div className="space-y-4 md:space-y-6 pb-20 pt-0.5 md:pt-0 animate-fade-in font-sans text-slate-800">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end border-b border-slate-200 pb-3 md:pb-4 gap-2 md:gap-4">
                <div className="min-w-0 w-full sm:w-auto">
                    <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                        <ShieldCheck className="text-emerald-600 flex-shrink-0" size={22}/>
                        <span className="truncate">현장 안전 운영 현황</span>
                    </h1>
                    <p className="text-xs font-bold text-slate-500 mt-1 text-left break-words leading-relaxed line-clamp-2">
                        {siteName || '현장'} · 오늘 등록, 위험요인, 보완 대상을 한 화면에서 확인합니다.
                    </p>
                    {hasNormalizationAlert && (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                            <span className={`inline-flex items-center gap-1 px-2 md:px-2.5 py-0.5 md:py-1 rounded-full text-[9px] md:text-[10px] font-black border ${hasCriticalNormalizationAlert ? 'bg-red-100 text-red-700 border-red-200' : 'bg-amber-100 text-amber-700 border-amber-200'} whitespace-nowrap`}>
                                <Siren size={11} />
                                {hasCriticalNormalizationAlert ? '긴급' : '주의'}
                            </span>
                            <button
                                onClick={() => onNavigateToDataLab({ focusTarget: 'NORMALIZATION_WORKFLOW' })}
                                className="text-[10px] md:text-[11px] font-bold text-slate-700 underline underline-offset-2 hover:text-emerald-600"
                            >
                                {normalizationAlertSummary?.topAlertLabel || '팀 정규화 워크플로우 점검 필요'}
                            </button>
                        </div>
                    )}
                </div>
                <div className="flex-shrink-0">
                    <LiveClock />
                </div>
            </div>

            <section className={`rounded-3xl border p-4 md:p-5 shadow-sm ${todayActionCount > 0 ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}>
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                    <div className="flex items-start gap-3 min-w-0">
                        <div className={`p-2.5 rounded-2xl shrink-0 ${todayActionCount > 0 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                            {todayActionCount > 0 ? <AlertTriangle size={22}/> : <CheckCircle2 size={22}/>}
                        </div>
                        <div className="min-w-0">
                            <p className={`text-xs font-black uppercase tracking-wider ${todayActionCount > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>오늘의 업무 요약</p>
                            <h2 className="mt-1 text-lg font-black text-slate-900">
                                {todayActionCount > 0 ? `확인 또는 보완이 필요한 항목이 ${todayActionCount}건 있습니다.` : '현재 우선 조치가 필요한 항목이 없습니다.'}
                            </h2>
                            <p className="mt-1 text-xs font-medium text-slate-600">
                                TBM {dailySummary.todaysEntries.length}건 · 출력 {dailySummary.workerCount}명 · 위험요인 {dailySummary.riskCount}건 · 영상검증 {dailySummary.verifiedVideoCount}건 · 수기평가 {dailySummary.manualEvaluationCount}건
                            </p>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 lg:min-w-[430px]">
                        <button onClick={onNewEntry} className="min-h-[48px] rounded-2xl bg-slate-900 px-4 py-3 text-xs font-black text-white hover:bg-slate-800 flex items-center justify-center gap-2">
                            <ClipboardCheck size={16}/> TBM 등록
                        </button>
                        <button onClick={() => onNavigateToReports({ linkStatus: priorityReportFilter })} className="min-h-[48px] rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-black text-slate-700 hover:border-indigo-300 flex items-center justify-center gap-2">
                            <FileText size={16}/> 문서 확인
                        </button>
                        <button onClick={onNavigateToDataLab} className="min-h-[48px] rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-black text-slate-700 hover:border-emerald-300 flex items-center justify-center gap-2">
                            <BarChart2 size={16}/> 데이터 분석
                        </button>
                    </div>
                </div>
            </section>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 md:gap-5 h-auto">
                <div className="lg:col-span-4 h-[320px] lg:h-auto">
                    <WeatherStation siteName={siteName} />
                </div>
                <div className="lg:col-span-4 h-[320px] lg:h-auto">
                    <CommandActionCard onClick={onNewEntry} />
                </div>
                <div className="lg:col-span-4 flex flex-col gap-4 h-full">
                    <div className="grid grid-cols-2 gap-3">
                        <KpiCard 
                            icon={<Users size={18} className="text-blue-600"/>}
                            label="금일 출력"
                            value={dailySummary.workerCount}
                            unit="명"
                            colorClass="bg-blue-50"
                        />
                        <KpiCard 
                            icon={<ShieldAlert size={18} className="text-red-600"/>}
                            label="위험 요인"
                            value={dailySummary.riskCount}
                            unit="건"
                            colorClass="bg-red-50"
                        />
                    </div>
                    
                    <div className="flex-1 grid grid-cols-1 gap-3">
                        <button onClick={() => onNavigateToReports({ teamName: selectedIssueTeam, linkStatus: 'all' })} aria-label="문서 보관소로 이동" className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm hover:border-indigo-300 hover:shadow-md transition-all flex items-center justify-between group">
                            <div className="flex items-center gap-3">
                                <div className="bg-indigo-50 p-2.5 rounded-xl text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                                    <FileText size={20}/>
                                </div>
                                <div className="text-left">
                                    <h4 className="font-bold text-sm text-slate-800">문서 보관소</h4>
                                    <p className="text-[10px] text-slate-500">법적 증빙 자료 관리</p>
                                </div>
                            </div>
                            <ArrowRight size={16} className="text-slate-300 group-hover:text-indigo-500"/>
                        </button>
                        
                        <button onClick={onNavigateToDataLab} aria-label="데이터 연구소로 이동" className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm hover:border-emerald-300 hover:shadow-md transition-all flex items-center justify-between group">
                            <div className="flex items-center gap-3">
                                <div className="bg-emerald-50 p-2.5 rounded-xl text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                                    <Microscope size={20}/>
                                </div>
                                <div className="text-left">
                                    <h4 className="font-bold text-sm text-slate-800">데이터 연구소</h4>
                                    <p className="text-[10px] text-slate-500">안전 트렌드 분석</p>
                                    {hasNormalizationAlert && (
                                        <p className={`text-[10px] font-black mt-0.5 ${hasCriticalNormalizationAlert ? 'text-red-600' : 'text-amber-600'}`}>
                                            {hasCriticalNormalizationAlert ? '긴급' : '주의'} · 정규화 경보 {normalizationAlertSummary!.criticalCount + normalizationAlertSummary!.warningCount}건
                                        </p>
                                    )}
                                </div>
                            </div>
                            <ArrowRight size={16} className="text-slate-300 group-hover:text-emerald-500"/>
                        </button>
                    </div>
                </div>
            </div>

            {dailySummary.todaysEntries.length > 0 && (
                <div className={`rounded-3xl border p-4 md:p-5 shadow-sm ${dailySummary.missingLinkedEntries.length > 0 || dailySummary.mismatchedEntries.length > 0 ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'}`}>
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                        <div className="flex items-start gap-3">
                            <div className={`p-2 rounded-xl ${dailySummary.missingLinkedEntries.length > 0 || dailySummary.mismatchedEntries.length > 0 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                {dailySummary.missingLinkedEntries.length > 0 || dailySummary.mismatchedEntries.length > 0 ? <AlertTriangle size={18} /> : <ShieldCheck size={18} />}
                            </div>
                            <div>
                                <p className={`text-xs font-black uppercase tracking-wider ${dailySummary.missingLinkedEntries.length > 0 || dailySummary.mismatchedEntries.length > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                                    연계 점검
                                </p>
                                <p className="text-sm font-bold text-slate-800 mt-1">
                                    {dailySummary.missingLinkedEntries.length > 0 || dailySummary.mismatchedEntries.length > 0
                                        ? '금일 TBM 일부가 동일월 평가와 미정합 상태입니다.'
                                        : '금일 TBM이 동일월 평가와 정상 연계되었습니다.'}
                                </p>
                                <p className="text-xs text-slate-600 mt-1">
                                    미연계 {dailySummary.missingLinkedEntries.length}건 · 미일치 {dailySummary.mismatchedEntries.length}건 · 연계 {dailySummary.matchedEntries.length}건
                                </p>
                            </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2 md:min-w-[300px]">
                            <div className="rounded-2xl bg-white/80 border border-white px-3 py-2">
                                <p className="text-[10px] font-bold text-slate-400">연계 문서</p>
                                <p className="text-lg font-black text-slate-800">{dailySummary.linkedEntries.length}</p>
                            </div>
                            <div className="rounded-2xl bg-white/80 border border-white px-3 py-2">
                                <p className="text-[10px] font-bold text-slate-400">동일월 연계</p>
                                <p className="text-lg font-black text-emerald-600">{dailySummary.matchedEntries.length}</p>
                            </div>
                            <div className="rounded-2xl bg-white/80 border border-white px-3 py-2">
                                <p className="text-[10px] font-bold text-slate-400">조치 필요</p>
                                <p className={`text-lg font-black ${dailySummary.missingLinkedEntries.length > 0 || dailySummary.mismatchedEntries.length > 0 ? 'text-amber-600' : 'text-slate-400'}`}>{dailySummary.missingLinkedEntries.length + dailySummary.mismatchedEntries.length}</p>
                            </div>
                        </div>
                    </div>
                    {dailySummary.primaryLinkageIssueEntry && (
                        <div className="mt-4 flex flex-col sm:flex-row gap-2">
                            <button
                                onClick={() => selectedIssueTeamPrimaryEntry && onEdit(selectedIssueTeamPrimaryEntry)}
                                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition-colors"
                            >
                                <FileText size={14} />
                                <span className="truncate max-w-[180px]">{selectedIssueTeam ? `${selectedIssueTeam} 보정 이동` : '연계 보정 이동'}</span>
                            </button>
                            <button
                                onClick={() => onNavigateToReports({ teamName: selectedIssueTeam, linkStatus: 'all' })}
                                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl bg-white text-slate-700 border border-slate-200 text-xs font-bold hover:border-amber-300 hover:bg-amber-50 transition-colors"
                            >
                                <ArrowRight size={14} /> 보관소 전체 확인
                            </button>
                            {dailySummary.missingLinkedEntries.length > 0 && (
                                <button
                                    onClick={() => onNavigateToReports({ teamName: selectedIssueTeam, linkStatus: 'unlinked' })}
                                    className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl bg-amber-100 text-amber-700 border border-amber-200 text-xs font-bold hover:bg-amber-200 transition-colors"
                                >
                                    미연계만
                                </button>
                            )}
                            {dailySummary.mismatchedEntries.length > 0 && (
                                <button
                                    onClick={() => onNavigateToReports({ teamName: selectedIssueTeam, linkStatus: 'mismatched' })}
                                    className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl bg-violet-100 text-violet-700 border border-violet-200 text-xs font-bold hover:bg-violet-200 transition-colors"
                                >
                                    미일치만
                                </button>
                            )}
                        </div>
                    )}
                    {dailySummary.issueTeamSummary.length > 0 && (
                        <div className="mt-4 rounded-2xl border border-white/70 bg-white/70 p-3">
                            <div className="flex items-center justify-between gap-2 mb-2">
                                <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">팀별 보정 우선순위</p>
                                <div className="flex items-center gap-2">
                                    {selectedIssueTeam && (
                                        <button
                                            onClick={() => setSelectedIssueTeam(null)}
                                            className="text-[10px] font-bold text-slate-500 px-3 py-2 min-h-[44px] rounded border border-slate-200 bg-white hover:border-slate-300"
                                        >
                                            전체 보기
                                        </button>
                                    )}
                                    <span className="text-[10px] text-slate-400">상위 {dailySummary.issueTeamSummary.length}</span>
                                </div>
                            </div>
                            <div className="space-y-2">
                                {dailySummary.issueTeamSummary.map(team => (
                                    <button
                                        key={team.teamName}
                                        onClick={() => setSelectedIssueTeam(prev => prev === team.teamName ? null : team.teamName)}
                                        className={`w-full flex items-start justify-between gap-3 rounded-xl border px-3 py-2.5 min-h-[44px] text-left ${selectedIssueTeam === team.teamName ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                                    >
                                        <div className="min-w-0">
                                            <p className="text-xs font-bold text-slate-800 leading-snug break-words">{team.teamName}</p>
                                            <p className="text-[10px] text-slate-500">총 {team.total}건 · 동일월 연계 {team.matched}건</p>
                                        </div>
                                        <div className="text-right shrink-0">
                                            <p className="text-[11px] font-black text-amber-600">미연계 {team.missing}건</p>
                                            <p className="text-[11px] font-black text-violet-600">미일치 {team.mismatched}건</p>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {dailySummary.locationSummary.length > 0 && (
                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-4 md:p-5">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                        <div>
                            <p className="text-xs font-black uppercase tracking-wider text-sky-700">위치별 활동 핫스팟</p>
                            <p className="text-sm font-bold text-slate-800 mt-1">금일 활동이 집중된 위치를 빠르게 확인하고 필터링합니다.</p>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                            {selectedLocation && (
                                <button
                                    onClick={() => setSelectedLocation(null)}
                                    className="px-3 py-2 min-h-[44px] rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:border-slate-300"
                                >
                                    위치 필터 해제
                                </button>
                            )}
                            <span className="text-[10px] font-bold text-slate-400">상위 {dailySummary.locationSummary.length}개</span>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                        {dailySummary.locationSummary.map((location, index) => (
                            <button
                                key={location.label}
                                onClick={() => setSelectedLocation(prev => prev === location.label ? null : location.label)}
                                className={`rounded-2xl border px-4 py-3 text-left transition-all ${selectedLocation === location.label ? 'border-sky-300 bg-sky-50 shadow-sm' : 'border-slate-200 bg-white hover:border-sky-200 hover:bg-sky-50/50'}`}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="text-[10px] font-black text-sky-600 mb-1">위치 #{index + 1}</p>
                                        <p className="text-sm font-bold text-slate-800 leading-snug break-words">{location.label}</p>
                                    </div>
                                    <MapPin size={16} className={`shrink-0 ${selectedLocation === location.label ? 'text-sky-600' : 'text-slate-300'}`} />
                                </div>
                                <div className="mt-3 flex items-center gap-2 flex-wrap text-[10px] font-bold">
                                    <span className="px-2 py-1 rounded-full bg-slate-100 text-slate-700">활동 {location.total}건</span>
                                    <span className="px-2 py-1 rounded-full bg-red-50 text-red-600">위험 {location.riskCount}건</span>
                                    <span className="px-2 py-1 rounded-full bg-blue-50 text-blue-600">출력 {location.peopleCount}명</span>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* REFACTORED CHART SECTION */}
                <div className="lg:col-span-2 bg-white rounded-3xl p-6 border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                    <div className="flex justify-between items-center mb-6 shrink-0">
                        <h3 className="font-bold text-slate-800 flex items-center gap-2">
                            <BarChart2 size={18} className="text-indigo-500"/>
                            주간 팀별 세부 평가 추이
                        </h3>
                        <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded">최근 7일</span>
                    </div>
                    
                    <div className="flex-1 overflow-x-auto custom-scrollbar pb-2">
                        {/* Improved Table Layout with Sticky Column */}
                        <div className="min-w-[500px]">
                            <div className="flex flex-col gap-2">
                                {teamActivityData.teams.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center h-40 text-slate-400">
                                        <Activity size={24} className="mb-2 opacity-20"/>
                                        <span className="text-xs">최근 7일간 데이터가 없습니다.</span>
                                    </div>
                                ) : (
                                    teamActivityData.teams.map((team, idx) => {
                                        const isExpanded = expandedTeamId === team.name;
                                        return (
                                            <div key={team.name} className={`rounded-xl border transition-all duration-300 ${isExpanded ? 'bg-indigo-50/30 border-indigo-200 shadow-md' : 'bg-white border-transparent hover:border-slate-200 hover:bg-slate-50'}`}>
                                                {/* Main Row (Summary) */}
                                                <div 
                                                    className="flex items-center p-3 cursor-pointer gap-4"
                                                    role="button"
                                                    tabIndex={0}
                                                    aria-expanded={isExpanded}
                                                    aria-label={`${team.name} 팀 주간 평가 상세 ${isExpanded ? '접기' : '펼치기'}`}
                                                    onClick={() => setExpandedTeamId(isExpanded ? null : team.name)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter' || e.key === ' ') {
                                                            e.preventDefault();
                                                            setExpandedTeamId(isExpanded ? null : team.name);
                                                        }
                                                    }}
                                                >
                                                    {/* Sticky Identifier */}
                                                    <div className="flex items-center gap-3 min-w-[140px]">
                                                        <div className={`w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-black shrink-0 ${idx < 3 ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'}`}>
                                                            {idx + 1}
                                                        </div>
                                                        <div className="flex flex-col min-w-0">
                                                            <span className="text-sm font-bold text-slate-700 truncate">{team.name}</span>
                                                            <span className="text-[10px] text-slate-400">활동 {team.totalActivity}건</span>
                                                        </div>
                                                    </div>

                                                    {/* Trend Line (Summary) */}
                                                    <div className="flex-1 h-8 px-2 hidden sm:block">
                                                        <DailyBarChart data={team.dailyScores} color={team.avgScore >= 80 ? '#10b981' : '#6366f1'} height={32} />
                                                    </div>

                                                    {/* Score & Toggle */}
                                                    <div className="flex items-center gap-3 ml-auto">
                                                        <div className={`flex flex-col items-center justify-center w-12 h-10 rounded-lg ${
                                                            team.grade === 'S' ? 'bg-violet-100 text-violet-700' :
                                                            team.grade === 'A' ? 'bg-indigo-100 text-indigo-700' :
                                                            team.grade === 'B' ? 'bg-emerald-100 text-emerald-700' :
                                                            'bg-slate-100 text-slate-600'
                                                        }`}>
                                                            <span className="text-sm font-black">{team.grade}</span>
                                                            <span className="text-[8px] font-bold opacity-70">{team.avgScore}</span>
                                                        </div>
                                                        <div className={`p-1 rounded-full transition-transform ${isExpanded ? 'rotate-180 bg-slate-200' : 'text-slate-400'}`}>
                                                            <ChevronDown size={16}/>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Expanded Detail View */}
                                                {isExpanded && (
                                                    <div className="p-4 pt-0 border-t border-indigo-100/50 mt-2 grid grid-cols-2 md:grid-cols-4 gap-4 animate-fade-in">
                                                        <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm flex flex-col">
                                                            <div className="flex justify-between items-end mb-2">
                                                                <p className="text-[10px] font-bold text-indigo-500 flex items-center gap-1"><FileText size={10}/> 일지 품질</p>
                                                                <span className="text-xl font-black text-indigo-600 leading-none">{team.detailAvgs.log}</span>
                                                            </div>
                                                            <DailyBarChart data={team.detailed.log} labels={teamActivityData.labels} color="#6366f1" height={40}/>
                                                        </div>
                                                        <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm flex flex-col">
                                                            <div className="flex justify-between items-end mb-2">
                                                                <p className="text-[10px] font-bold text-emerald-600 flex items-center gap-1"><Eye size={10}/> 작업 집중도</p>
                                                                <span className="text-xl font-black text-emerald-600 leading-none">{team.detailAvgs.focus}</span>
                                                            </div>
                                                            <DailyBarChart data={team.detailed.focus} labels={teamActivityData.labels} color="#10b981" height={40}/>
                                                        </div>
                                                        <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm flex flex-col">
                                                            <div className="flex justify-between items-end mb-2">
                                                                <p className="text-[10px] font-bold text-amber-500 flex items-center gap-1"><Mic size={10}/> 전파 명확성</p>
                                                                <span className="text-xl font-black text-amber-500 leading-none">{team.detailAvgs.voice}</span>
                                                            </div>
                                                            <DailyBarChart data={team.detailed.voice} labels={teamActivityData.labels} color="#f59e0b" height={40}/>
                                                        </div>
                                                        <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm flex flex-col">
                                                            <div className="flex justify-between items-end mb-2">
                                                                <p className="text-[10px] font-bold text-rose-500 flex items-center gap-1"><Shield size={10}/> 보호구 상태</p>
                                                                <span className="text-xl font-black text-rose-500 leading-none">{team.detailAvgs.ppe}</span>
                                                            </div>
                                                            <DailyBarChart data={team.detailed.ppe} labels={teamActivityData.labels} color="#f43f5e" height={40}/>
                                                        </div>
                                                        <div className="col-span-full text-center">
                                                            <p className="text-[10px] text-slate-400">※ 각 항목 점수는 검증된 영상 분석 또는 수기 평가 결과의 주간 평균입니다.</p>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm flex flex-col h-[300px] lg:h-auto overflow-hidden">
                    <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-start gap-2 sm:items-center">
                        <div className="min-w-0">
                            <h3 className="font-bold text-slate-800 flex items-center gap-2 text-sm">
                                <Radio size={16} className="text-red-500 animate-pulse"/> 실시간 활동 (금일)
                            </h3>
                            {(selectedIssueTeam || selectedLocation) && (
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                    {selectedIssueTeam && <span className="px-2 py-1 rounded-full bg-indigo-50 text-indigo-700 text-[10px] font-black border border-indigo-100">팀 {selectedIssueTeam}</span>}
                                    {selectedLocation && <span className="px-2 py-1 rounded-full bg-sky-50 text-sky-700 text-[10px] font-black border border-sky-100 max-w-[220px] truncate">위치 {selectedLocation}</span>}
                                </div>
                            )}
                        </div>
                        <span className="bg-white border border-slate-200 text-slate-500 px-2 py-0.5 rounded text-[10px] font-bold max-w-[55vw] sm:max-w-none truncate">{(selectedIssueTeam || selectedLocation) ? `${visibleRealtimeEntries.length}건` : `${dailySummary.todaysEntries.length}건`}</span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar" role="status" aria-live="polite" aria-label="금일 실시간 활동 목록">
                        {visibleRealtimeEntries.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-2 p-4 text-center">
                                <Clock size={24} className="opacity-20"/>
                                <span className="text-xs font-bold">조건에 맞는 금일 기록이 없습니다.</span>
                                <span className="text-[10px] opacity-70">팀/위치 필터를 해제하거나 다른 조건을 선택하세요.</span>
                            </div>
                        ) : (
                            visibleRealtimeEntries.map((entry) => (
                                <div key={entry.id} className="p-3 bg-white border border-slate-100 rounded-xl hover:border-indigo-200 hover:bg-indigo-50/30 transition-all flex items-center gap-3 group relative">
                                    <div className="w-10 h-10 rounded-lg bg-slate-100 border border-slate-200 overflow-hidden shrink-0">
                                        {entry.tbmPhotoUrl ? (
                                            <img src={entry.tbmPhotoUrl} className="w-full h-full object-cover" alt={`${entry.teamName || '미지정 팀'} TBM 활동 사진`}/>
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-slate-300"><FileText size={16}/></div>
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex justify-between gap-2">
                                            <span className="text-xs font-bold text-slate-700 truncate max-w-[58%]">{entry.teamName}</span>
                                            <span className="text-[10px] text-slate-400 font-mono">{entry.time}</span>
                                        </div>
                                        <p className="text-[10px] text-slate-500 truncate">{entry.workDescription || '내용 없음'}</p>
                                        {formatLocationSummary(entry) && (
                                            <div className="mt-1 flex items-center gap-1 text-[9px] text-sky-700 bg-sky-50 border border-sky-100 rounded px-1.5 py-1 max-w-full">
                                                <MapPin size={10} className="shrink-0"/>
                                                <span className="truncate">{formatLocationSummary(entry)}</span>
                                            </div>
                                        )}
                                        {entry.linkedRiskAssessmentLabel && (
                                            <div className="mt-1 flex items-center gap-1 flex-wrap">
                                                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${entry.linkedRiskAssessmentMatchedByMonth ? 'bg-emerald-100 text-emerald-700' : 'bg-indigo-100 text-indigo-700'}`}>
                                                    {entry.linkedRiskAssessmentMatchedByMonth ? '동일월 연계' : '위험성평가 연계'}
                                                </span>
                                                <span className="text-[9px] text-slate-500 truncate max-w-[160px]">{entry.linkedRiskAssessmentLabel}</span>
                                            </div>
                                        )}
                                    </div>
                                    <button 
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onDelete(entry.id);
                                        }}
                                        aria-label={`${entry.teamName} 기록 삭제`}
                                        className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                        title="기록 삭제"
                                    >
                                        <Trash2 size={16}/>
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>

        </div>
    );
};
