
import React, { useEffect, useMemo, useState } from 'react';
import { TBMEntry, TeamOption } from '../types';
import { entryHasTeamName, getEntryTeamLabel, getEntryTeamNames } from '../utils/teamUtils';
import { FileText, Printer, Search, Filter, Calendar, CheckCircle2, AlertCircle, Download, MoreHorizontal, UserCheck, Shield, Loader2, Package, Sparkles, GraduationCap, FileSpreadsheet, BarChart2, PieChart, Activity, Database, BrainCircuit, Microscope, Trash2, CheckSquare, Square, XCircle, MapPin } from 'lucide-react';
import JSZip from 'jszip';
import { ConfirmDialog } from './common/ConfirmDialog';
import { useConfirmDialog } from '../hooks/useConfirmDialog';

const sanitizeFileName = (value: string) => value.replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_');

const dataUrlToUint8Array = async (dataUrl: string) => {
    const response = await fetch(dataUrl);
    const buffer = await response.arrayBuffer();
    return new Uint8Array(buffer);
};

const getVideoExtension = (entry: TBMEntry) => {
    const fromFileName = entry.tbmVideoFileName?.split('.').pop()?.toLowerCase();
    if (fromFileName && ['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(fromFileName)) return fromFileName;

    const mime = entry.tbmVideoUrl?.match(/^data:video\/([a-zA-Z0-9.+-]+);/)?.[1]?.toLowerCase();
    if (!mime) return 'webm';
    if (mime.includes('mp4')) return 'mp4';
    if (mime.includes('quicktime')) return 'mov';
    if (mime.includes('x-matroska')) return 'mkv';
    return mime.replace(/[^a-z0-9]/g, '') || 'webm';
};

interface ReportCenterProps {
  entries: TBMEntry[];
  onOpenPrintModal: (targetEntries: TBMEntry[]) => void;
  signatures: { safety: string | null; site: string | null };
  teams: TeamOption[];
    initialTeamName?: string | null;
    initialLinkStatus?: 'all' | 'unlinked' | 'mismatched';
  onDelete: (id: string) => void;
  onBulkDelete: (ids: string[]) => void;
}

const SimpleLoadingOverlay = ({ text }: { text: string }) => (
    <div className="fixed inset-0 z-[999999] bg-slate-900/90 backdrop-blur-sm flex flex-col items-center justify-center animate-fade-in text-white">
        <Loader2 size={48} className="text-emerald-400 animate-spin mb-4" />
        <p className="text-slate-300 font-bold animate-pulse">{text}</p>
    </div>
);

export const ReportCenter: React.FC<ReportCenterProps> = ({ entries, onOpenPrintModal, signatures, teams, initialTeamName, initialLinkStatus = 'all', onDelete, onBulkDelete }) => {
  const [selectedTeam, setSelectedTeam] = useState('all');
  const [selectedDate, setSelectedDate] = useState(''); // Date Filter
    const [locationQuery, setLocationQuery] = useState('');
    const [selectedLinkStatus, setSelectedLinkStatus] = useState<'all' | 'linked' | 'matched' | 'mismatched' | 'unlinked'>('all');
    const [showRemediationOnly, setShowRemediationOnly] = useState(false);
    const [showInitialFilterBadge, setShowInitialFilterBadge] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set()); // Multi-select
    const [statusMessage, setStatusMessage] = useState('');
  
  const [isZipping, setIsZipping] = useState(false);
  const { confirmDialogState, requestConfirm, closeConfirmDialog } = useConfirmDialog();

    const formatLocationSummary = (entry: TBMEntry) => {
            return [entry.locationBuildingScope, entry.locationArea, entry.locationDetail]
                    .map(value => value?.trim())
                    .filter(Boolean)
                    .join(' / ');
    };

  const announceStatus = (message: string) => {
      setStatusMessage('');
      requestAnimationFrame(() => {
          setStatusMessage(message);
      });
  };

  
  const stats = useMemo(() => {
    return {
      total: entries.length,
      signed: (signatures.safety && signatures.site) ? entries.length : 0, 
      hasRisk: entries.filter(e => e.riskFactors && e.riskFactors.length > 0).length,
      photos: entries.filter(e => e.tbmPhotoUrl).length
    };
  }, [entries, signatures]);

  const initialFilterBadgeLabels = useMemo(() => {
      const labels: string[] = [];
      if (initialTeamName) {
          labels.push(`대시보드 전달: 팀 ${initialTeamName}`);
      }
      if (initialLinkStatus === 'unlinked') {
          labels.push('대시보드 전달: 미연계');
      } else if (initialLinkStatus === 'mismatched') {
          labels.push('대시보드 전달: 미일치');
      }
      return labels;
  }, [initialTeamName, initialLinkStatus]);

  const uniqueTeams = useMemo(() => {
      const uniqueNames = new Set<string>();
      const result: { id: string; name: string }[] = [];
      teams.forEach(t => {
          const name = t.name.trim();
          if (!uniqueNames.has(name)) {
              uniqueNames.add(name);
              result.push({ id: t.id, name: name });
          }
      });
      entries.forEach(e => {
          const names = getEntryTeamNames(e);
          if (names.length === 0) {
              const fallbackName = getEntryTeamLabel(e);
              if (!uniqueNames.has(fallbackName)) {
                  uniqueNames.add(fallbackName);
                  result.push({ id: e.teamId || `name:${fallbackName}`, name: fallbackName });
              }
              return;
          }
          names.forEach((name, index) => {
              if (name && !uniqueNames.has(name)) {
                  uniqueNames.add(name);
                  result.push({ id: e.teamIds?.[index] || e.teamId || `name:${name}`, name });
              }
          });
      });
      return result.sort((a, b) => a.name.localeCompare(b.name));
  }, [teams, entries]);

  const uniqueLocations = useMemo(() => {
      return Array.from(new Set<string>(entries
          .map(entry => formatLocationSummary(entry))
          .filter((value): value is string => !!value)
      )).sort((a, b) => a.localeCompare(b));
  }, [entries]);

  useEffect(() => {
      if (!initialTeamName) return;
      const matchedTeam = uniqueTeams.find(team => team.name === initialTeamName);
      if (matchedTeam) {
          setSelectedTeam(matchedTeam.id);
      }
  }, [initialTeamName, uniqueTeams]);

  useEffect(() => {
      setSelectedLinkStatus(initialLinkStatus === 'all' ? 'all' : initialLinkStatus);
      setShowRemediationOnly(initialLinkStatus === 'unlinked' || initialLinkStatus === 'mismatched');
  }, [initialLinkStatus]);

  useEffect(() => {
      setShowInitialFilterBadge(true);
  }, [initialTeamName, initialLinkStatus]);

  const filteredEntries = useMemo(() => {
      let result = entries;

      // 1. Team Filter
      if (selectedTeam !== 'all') {
          const targetTeam = uniqueTeams.find(t => t.id === selectedTeam);
          if (targetTeam) {
              result = result.filter(e => entryHasTeamName(e, targetTeam.name));
          }
      }

      // 2. Date Filter
      if (selectedDate) {
          result = result.filter(e => e.date === selectedDate);
      }

      // 3. Location Search Filter
      if (locationQuery.trim()) {
          const normalizedQuery = locationQuery.trim().toLowerCase();
          result = result.filter(e => formatLocationSummary(e).toLowerCase().includes(normalizedQuery));
      }

      // 4. Linked Risk Assessment Filter
      if (selectedLinkStatus === 'linked') {
          result = result.filter(e => !!e.linkedRiskAssessmentId || !!e.linkedRiskAssessmentLabel);
      } else if (selectedLinkStatus === 'matched') {
          result = result.filter(e => (!!e.linkedRiskAssessmentId || !!e.linkedRiskAssessmentLabel) && !!e.linkedRiskAssessmentMatchedByMonth);
      } else if (selectedLinkStatus === 'mismatched') {
          result = result.filter(e => (!!e.linkedRiskAssessmentId || !!e.linkedRiskAssessmentLabel) && !e.linkedRiskAssessmentMatchedByMonth);
      } else if (selectedLinkStatus === 'unlinked') {
          result = result.filter(e => !e.linkedRiskAssessmentId && !e.linkedRiskAssessmentLabel);
      }

      if (showRemediationOnly) {
          result = result.filter(e => !e.linkedRiskAssessmentId || !e.linkedRiskAssessmentMatchedByMonth);
      }

      return result;
    }, [selectedTeam, selectedDate, locationQuery, selectedLinkStatus, showRemediationOnly, entries, uniqueTeams]);

  const remediationSummary = useMemo(() => {
      const missing = filteredEntries.filter(e => !e.linkedRiskAssessmentId && !e.linkedRiskAssessmentLabel).length;
      const mismatched = filteredEntries.filter(e => (e.linkedRiskAssessmentId || e.linkedRiskAssessmentLabel) && !e.linkedRiskAssessmentMatchedByMonth).length;
      const matched = filteredEntries.filter(e => (e.linkedRiskAssessmentId || e.linkedRiskAssessmentLabel) && e.linkedRiskAssessmentMatchedByMonth).length;

      return {
          missing,
          mismatched,
          matched,
          remediation: missing + mismatched,
      };
  }, [filteredEntries]);

  const handleToggleRemediationOnly = () => {
      setShowRemediationOnly(prev => !prev);
  };

  const handleFilterMissingOnly = () => {
      setSelectedLinkStatus('unlinked');
      setShowRemediationOnly(true);
  };

  const handleFilterMismatchedOnly = () => {
      setSelectedLinkStatus('mismatched');
      setShowRemediationOnly(true);
  };

  const handleClearInitialPrefill = () => {
      setSelectedTeam('all');
      setLocationQuery('');
      setSelectedLinkStatus('all');
      setShowRemediationOnly(false);
      setShowInitialFilterBadge(false);
      announceStatus('대시보드 전달 초기 필터를 해제했습니다.');
  };

  // --- Handlers ---

    const handlePrintClick = async () => {
      if (selectedIds.size > 0) {
          // Print Selected
          const targets = entries.filter(e => selectedIds.has(e.id));
          onOpenPrintModal(targets);
      } else {
          // Print Filtered View
          if (filteredEntries.length === 0) {
              announceStatus('출력할 문서가 없습니다.');
              return;
          }
          if (filteredEntries.length > 50) {
              const isConfirmed = await requestConfirm(`${filteredEntries.length}건의 문서를 한 번에 처리하시겠습니까? (시간이 소요될 수 있습니다)`, {
                  title: '대량 문서 출력',
                  confirmLabel: '진행',
                  variant: 'warning'
              });
              if (!isConfirmed) return;
          }
          onOpenPrintModal(filteredEntries);
      }
  };

  const handleBulkDeleteClick = () => {
      if (selectedIds.size === 0) return;
      onBulkDelete(Array.from(selectedIds));
      setSelectedIds(new Set());
  };

  const toggleSelection = (id: string) => {
      const newSet = new Set(selectedIds);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      setSelectedIds(newSet);
  };

  const toggleSelectAll = () => {
      if (selectedIds.size === filteredEntries.length && filteredEntries.length > 0) {
          setSelectedIds(new Set());
      } else {
          const newSet = new Set<string>();
          filteredEntries.forEach(e => newSet.add(e.id));
          setSelectedIds(newSet);
      }
  };

  const handleExportDataPackage = async () => {
      const targetEntries = selectedIds.size > 0
          ? entries.filter(entry => selectedIds.has(entry.id))
          : filteredEntries;

      if (targetEntries.length === 0) {
          announceStatus('내보낼 데이터가 없습니다.');
          return;
      }

      setIsZipping(true);
      try {
          const zip = new JSZip();
          const exportedAt = new Date().toISOString();
          const packageEntries = targetEntries.map(({ tbmPhotoUrl, originalLogImageUrl, tbmVideoUrl, ...entry }) => ({
              ...entry,
              tbmPhotoUrl: tbmPhotoUrl ? '[PACKAGED_SEPARATELY]' : null,
              originalLogImageUrl: originalLogImageUrl ? '[PACKAGED_SEPARATELY]' : null,
              tbmVideoUrl: tbmVideoUrl ? '[PACKAGED_SEPARATELY]' : null,
          }));

          zip.file('manifest.json', JSON.stringify({
              exportedAt,
              count: targetEntries.length,
              selectedCount: selectedIds.size,
              filters: {
                  team: selectedTeam,
                  date: selectedDate || null,
                  linkedRiskAssessment: selectedLinkStatus,
                  remediationOnly: showRemediationOnly,
              },
          }, null, 2));

          zip.file('entries.json', JSON.stringify(packageEntries, null, 2));
          zip.file('signatures.json', JSON.stringify(signatures, null, 2));

          const evidenceFolder = zip.folder('evidence');
          for (const entry of targetEntries) {
              const baseName = sanitizeFileName(`${entry.date}_${getEntryTeamLabel(entry)}_${entry.id}`);

              if (entry.tbmPhotoUrl?.startsWith('data:')) {
                  evidenceFolder?.file(`${baseName}_photo.png`, await dataUrlToUint8Array(entry.tbmPhotoUrl));
              }
              if (entry.originalLogImageUrl?.startsWith('data:')) {
                  const ext = entry.originalLogMimeType?.includes('pdf') ? 'pdf' : 'png';
                  evidenceFolder?.file(`${baseName}_log.${ext}`, await dataUrlToUint8Array(entry.originalLogImageUrl));
              }
              if (entry.tbmVideoUrl?.startsWith('data:')) {
                  const ext = getVideoExtension(entry);
                  evidenceFolder?.file(`${baseName}_video.${ext}`, await dataUrlToUint8Array(entry.tbmVideoUrl));
              }
          }

          if (signatures.safety?.startsWith('data:')) {
              zip.file('signatures/safety-signature.png', await dataUrlToUint8Array(signatures.safety));
          }
          if (signatures.site?.startsWith('data:')) {
              zip.file('signatures/site-signature.png', await dataUrlToUint8Array(signatures.site));
          }

          const blob = await zip.generateAsync({ type: 'blob' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          const timestamp = exportedAt.replace(/[-:TZ.]/g, '').slice(0, 14);
          a.href = url;
          a.download = `TBM_데이터패키지_${timestamp}.zip`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
      } catch (error) {
          console.error('Data package export failed:', error);
          announceStatus('데이터 패키지 생성 중 오류가 발생했습니다.');
      } finally {
          setIsZipping(false);
      }
  };

  return (
    <div className="space-y-6 animate-fade-in pb-24 relative">
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{statusMessage}</p>
      {isZipping && <SimpleLoadingOverlay text="데이터 처리 중..." />}
      
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-end gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div>
           <div className="flex items-center gap-2 mb-2">
              <div className="bg-blue-100 p-2 rounded-lg text-blue-600"><FileText size={24} /></div>
                  <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-full tracking-wider">문서 보관소</span>
           </div>
           <h2 className="text-2xl font-black text-slate-800 tracking-tight">안전 문서 통합 관리소</h2>
           <p className="text-slate-500 text-sm font-medium mt-1">
               {selectedIds.size > 0 
                ? <span className="text-indigo-600 font-bold">{selectedIds.size}개 항목이 선택되었습니다.</span> 
                : "법적 보존 연한에 맞춰 TBM 일지를 안전하게 보관하고 관리합니다."}
           </p>
        </div>
        <div className="flex flex-col md:flex-row gap-2 items-stretch md:items-center">
              <button onClick={handleExportDataPackage} aria-label={selectedIds.size > 0 ? `선택된 ${selectedIds.size}개 항목 데이터 패키지 내보내기` : '현재 목록 데이터 패키지 내보내기'} className="flex items-center justify-center gap-2 px-6 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-500 transition-colors shadow-lg shadow-emerald-600/20">
                  <Download size={18} />
                  {selectedIds.size > 0 ? `선택 항목 (${selectedIds.size}) 패키지` : '현재 목록 데이터 패키지'}
              </button>
              <button onClick={handlePrintClick} aria-label={selectedIds.size > 0 ? `선택된 ${selectedIds.size}개 항목 인쇄 또는 PDF 생성` : '현재 목록 인쇄 또는 PDF 생성'} className="flex items-center justify-center gap-2 px-6 py-3 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-700 transition-colors shadow-lg shadow-slate-900/20">
              <Printer size={18} /> 
              {selectedIds.size > 0 ? `선택 항목 (${selectedIds.size}) 출력/PDF` : '현재 목록 출력/PDF'}
           </button>
        </div>
      </div>

      {showInitialFilterBadge && initialFilterBadgeLabels.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
              {initialFilterBadgeLabels.map(label => (
                  <span key={label} className="text-[10px] font-black px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                      {label}
                  </span>
              ))}
              <button
                  onClick={handleClearInitialPrefill}
                  className="text-[10px] font-black px-2.5 py-1 rounded-full bg-white text-slate-600 border border-slate-300 hover:border-indigo-300 hover:text-indigo-600"
                  aria-label="대시보드 전달 초기 필터 즉시 해제"
              >
                  초기필터 해제
              </button>
          </div>
      )}

      <div className={`rounded-2xl border p-4 shadow-sm ${remediationSummary.remediation > 0 ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'}`}>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                  <p className={`text-xs font-black uppercase tracking-wider ${remediationSummary.remediation > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>보정 대상 요약</p>
                  <p className="text-sm font-bold text-slate-800 mt-1">
                      {remediationSummary.remediation > 0 ? '현재 목록에 위험성평가 연계 보정이 필요한 문서가 있습니다.' : '현재 목록은 모두 동일월 연계 상태입니다.'}
                  </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
                  <div className="grid grid-cols-3 gap-2 md:min-w-[320px]">
                      <div className="rounded-xl bg-white/80 border border-white px-3 py-2">
                          <p className="text-[10px] font-bold text-slate-400">미연계</p>
                          <p className="text-lg font-black text-amber-600">{remediationSummary.missing}</p>
                      </div>
                      <div className="rounded-xl bg-white/80 border border-white px-3 py-2">
                          <p className="text-[10px] font-bold text-slate-400">미일치</p>
                          <p className="text-lg font-black text-violet-600">{remediationSummary.mismatched}</p>
                      </div>
                      <div className="rounded-xl bg-white/80 border border-white px-3 py-2">
                          <p className="text-[10px] font-bold text-slate-400">동일월 연계</p>
                          <p className="text-lg font-black text-emerald-600">{remediationSummary.matched}</p>
                      </div>
                  </div>
                  <button
                      onClick={handleToggleRemediationOnly}
                      className={`px-4 py-2.5 rounded-xl text-xs font-bold border whitespace-nowrap ${showRemediationOnly ? 'bg-rose-600 text-white border-rose-600' : 'bg-white text-slate-700 border-slate-200 hover:border-rose-300 hover:bg-rose-50'}`}
                  >
                      {showRemediationOnly ? '보정 필요만 해제' : '보정 필요만 켜기'}
                  </button>
                  <button
                      onClick={handleFilterMissingOnly}
                      className="px-4 py-2.5 rounded-xl text-xs font-bold border whitespace-nowrap bg-white text-amber-700 border-amber-200 hover:bg-amber-50"
                  >
                      미연계만
                  </button>
                  <button
                      onClick={handleFilterMismatchedOnly}
                      className="px-4 py-2.5 rounded-xl text-xs font-bold border whitespace-nowrap bg-white text-violet-700 border-violet-200 hover:bg-violet-50"
                  >
                      미일치만
                  </button>
              </div>
          </div>
      </div>

      {/* Filter & Toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between sticky top-0 z-20">
         <div className="flex items-center gap-3 w-full md:w-auto overflow-x-auto pb-2 md:pb-0 no-scrollbar">
             {/* Date Filter */}
             <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200">
                 <Calendar size={16} className="text-slate-500"/>
                 <input 
                    type="date" 
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="bg-transparent text-sm font-bold text-slate-700 outline-none w-32"
                 />
                 {selectedDate && <button onClick={() => setSelectedDate('')} aria-label="날짜 필터 초기화" className="text-slate-400 hover:text-red-500"><XCircle size={14}/></button>}
             </div>

             <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200 min-w-[220px]">
                 <Search size={16} className="text-slate-500"/>
                 <input
                    list="report-center-location-suggestions"
                    type="text"
                    value={locationQuery}
                    onChange={(e) => setLocationQuery(e.target.value)}
                    placeholder="위치 검색"
                    className="bg-transparent text-sm font-bold text-slate-700 outline-none w-full"
                 />
                 <datalist id="report-center-location-suggestions">
                    {uniqueLocations.map(location => <option key={location} value={location} />)}
                 </datalist>
                 {locationQuery && <button onClick={() => setLocationQuery('')} aria-label="위치 필터 초기화" className="text-slate-400 hover:text-red-500"><XCircle size={14}/></button>}
             </div>

             <div className="h-6 w-px bg-slate-200 mx-2"></div>

             {/* Team Filter Buttons */}
             <div className="flex gap-2">
                      <button onClick={() => setSelectedTeam('all')} aria-pressed={selectedTeam === 'all'} aria-label="전체 팀 필터" className={`px-3 py-2 rounded-xl text-xs font-bold transition-colors border ${selectedTeam === 'all' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}>전체</button>
                 {uniqueTeams.map(team => (
                          <button key={team.id} onClick={() => setSelectedTeam(team.id)} aria-pressed={selectedTeam === team.id} aria-label={`${team.name} 팀 필터`} className={`px-3 py-2 rounded-xl text-xs font-bold transition-colors border whitespace-nowrap ${selectedTeam === team.id ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}>{team.name}</button>
                 ))}
             </div>

             <div className="h-6 w-px bg-slate-200 mx-2"></div>

             <div className="flex gap-2">
                 <button onClick={() => setSelectedLinkStatus('all')} aria-pressed={selectedLinkStatus === 'all'} aria-label="연계 여부 전체 필터" className={`px-3 py-2 rounded-xl text-xs font-bold transition-colors border whitespace-nowrap ${selectedLinkStatus === 'all' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}>연계 전체</button>
                 <button onClick={() => setSelectedLinkStatus('linked')} aria-pressed={selectedLinkStatus === 'linked'} aria-label="연계된 문서만 보기" className={`px-3 py-2 rounded-xl text-xs font-bold transition-colors border whitespace-nowrap ${selectedLinkStatus === 'linked' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}>연계 있음</button>
                 <button onClick={() => setSelectedLinkStatus('matched')} aria-pressed={selectedLinkStatus === 'matched'} aria-label="동일월 연계 문서만 보기" className={`px-3 py-2 rounded-xl text-xs font-bold transition-colors border whitespace-nowrap ${selectedLinkStatus === 'matched' ? 'bg-cyan-600 text-white border-cyan-600' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}>동일월 연계</button>
                 <button onClick={() => setSelectedLinkStatus('mismatched')} aria-pressed={selectedLinkStatus === 'mismatched'} aria-label="동일월 미일치 문서만 보기" className={`px-3 py-2 rounded-xl text-xs font-bold transition-colors border whitespace-nowrap ${selectedLinkStatus === 'mismatched' ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}>동일월 미일치</button>
                 <button onClick={() => setSelectedLinkStatus('unlinked')} aria-pressed={selectedLinkStatus === 'unlinked'} aria-label="미연계 문서만 보기" className={`px-3 py-2 rounded-xl text-xs font-bold transition-colors border whitespace-nowrap ${selectedLinkStatus === 'unlinked' ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}>미연계</button>
             </div>

             <button
                 onClick={handleToggleRemediationOnly}
                 aria-pressed={showRemediationOnly}
                 aria-label="보정 필요 문서만 보기"
                 className={`px-3 py-2 rounded-xl text-xs font-bold transition-colors border whitespace-nowrap ${showRemediationOnly ? 'bg-rose-600 text-white border-rose-600' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}
             >
                 보정 필요만
             </button>
         </div>

         {/* Selection Actions */}
         <div className="flex items-center gap-3 w-full md:w-auto justify-end">
             <button 
                onClick={toggleSelectAll} 
                     aria-pressed={selectedIds.size > 0 && selectedIds.size === filteredEntries.length}
                     aria-label={selectedIds.size > 0 && selectedIds.size === filteredEntries.length ? '전체 선택 해제' : '현재 목록 전체 선택'}
                className="flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-slate-800 px-3 py-2 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors"
             >
                {selectedIds.size > 0 && selectedIds.size === filteredEntries.length ? <CheckSquare size={16} className="text-indigo-600"/> : <Square size={16}/>}
                전체 선택 ({filteredEntries.length})
             </button>
         </div>
      </div>

      {/* Grid */}
      {filteredEntries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
              <Search size={48} className="mb-4 opacity-20"/>
              <p className="font-bold">조건에 맞는 문서가 없습니다.</p>
              <button onClick={() => { setSelectedDate(''); setSelectedTeam('all'); setLocationQuery(''); setSelectedLinkStatus('all'); setShowRemediationOnly(false); }} aria-label="날짜 및 팀 필터 초기화" className="mt-4 text-sm text-blue-500 underline">필터 초기화</button>
          </div>
      ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
             {filteredEntries.map((entry, idx) => {
                const isSelected = selectedIds.has(entry.id);
                     const needsLinkageRemediation = !entry.linkedRiskAssessmentId && !entry.linkedRiskAssessmentLabel;
                     const hasSameMonthMismatch = !needsLinkageRemediation && !entry.linkedRiskAssessmentMatchedByMonth;
                return (
                <div 
                    key={entry.id} 
                    onClick={() => toggleSelection(entry.id)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            toggleSelection(entry.id);
                        }
                    }}
                    role="button"
                    tabIndex={0}
                    aria-pressed={isSelected}
                    aria-label={`${entry.teamName} ${entry.date} ${entry.time} 기록 ${isSelected ? '선택됨' : '선택 안됨'}`}
                    className={`bg-white rounded-2xl border p-0 overflow-hidden transition-all duration-300 group cursor-pointer relative ${isSelected ? 'ring-2 ring-indigo-500 border-indigo-500 shadow-md transform scale-[1.01]' : 'border-slate-200 hover:shadow-lg hover:-translate-y-1'}`} 
                    style={{ animation: `slideUpFade 0.5s ease-out forwards ${idx * 0.05}s`, opacity: 0 }}
                >
                   {/* Selection Overlay Checkbox */}
                   <div className={`absolute top-3 left-3 z-10 w-6 h-6 rounded-md border-2 flex items-center justify-center transition-colors ${isSelected ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-slate-300 group-hover:border-indigo-400'}`}>
                       {isSelected && <CheckSquare size={14} className="text-white"/>}
                   </div>

                   <div className="p-4 border-b border-slate-100 flex justify-between items-start bg-slate-50/50 pl-12">
                      <div>
                         <h4 className={`font-bold text-sm ${isSelected ? 'text-indigo-700' : 'text-slate-800'}`}>{entry.teamName}</h4>
                         <div className="flex items-center gap-2 text-[11px] text-slate-500 font-medium"><Calendar size={10} /> {entry.date} {entry.time}</div>
                         {formatLocationSummary(entry) && (
                             <div className="mt-1 inline-flex max-w-full items-center gap-1 rounded-full border border-sky-100 bg-sky-50 px-2 py-1 text-[10px] font-bold text-sky-700">
                                 <MapPin size={10} className="shrink-0" />
                                 <span className="truncate max-w-[220px]">{formatLocationSummary(entry)}</span>
                             </div>
                         )}
                         {(needsLinkageRemediation || hasSameMonthMismatch) && (
                             <div className="mt-1 flex items-center gap-1 flex-wrap">
                                 <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${needsLinkageRemediation ? 'bg-amber-100 text-amber-700' : 'bg-violet-100 text-violet-700'}`}>
                                     {needsLinkageRemediation ? '연계 보정 필요' : '동일월 확인 필요'}
                                 </span>
                             </div>
                         )}
                         {entry.linkedRiskAssessmentLabel && (
                             <div className="mt-1 flex items-center gap-1 flex-wrap">
                                 <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${entry.linkedRiskAssessmentMatchedByMonth ? 'bg-emerald-100 text-emerald-700' : 'bg-indigo-100 text-indigo-700'}`}>
                                     {entry.linkedRiskAssessmentMatchedByMonth ? '동일월 연계' : '위험성평가 연계'}
                                 </span>
                                 <span className="text-[10px] text-slate-500 truncate max-w-[180px]">{entry.linkedRiskAssessmentLabel}</span>
                             </div>
                         )}
                      </div>
                      <div className={`px-2 py-1 rounded text-[10px] font-bold border ${entry.riskFactors && entry.riskFactors.length > 0 ? 'bg-orange-50 text-orange-600 border-orange-100' : 'bg-green-50 text-green-600 border-green-100'}`}>{entry.riskFactors && entry.riskFactors.length > 0 ? '위험 발견' : '양호'}</div>
                   </div>
                   
                   <div className="h-32 bg-slate-100 relative overflow-hidden">
                      {entry.tbmPhotoUrl ? <img src={entry.tbmPhotoUrl} alt="증빙 사진" className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-all" /> : <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs bg-slate-50"><AlertCircle size={20} className="mb-1"/><span>사진 없음</span></div>}
                      {entry.videoAnalysis && (
                          <div className="absolute top-2 right-2 flex gap-1">
                              <span className={`text-[10px] font-black px-2 py-1 rounded-full shadow-md flex items-center gap-1 backdrop-blur-md ${entry.videoAnalysis.score >= 80 ? 'bg-violet-500/90 text-white' : 'bg-orange-500/90 text-white'}`}>
                                  <Sparkles size={10} className="text-yellow-300" />
                                  {entry.videoAnalysis.analysisSource === 'VIDEO' && entry.videoAnalysis.verificationStatus === 'VERIFIED' ? 'AI' : '수기'} {entry.videoAnalysis.score}
                              </span>
                          </div>
                      )}
                   </div>
                   
                   <div className="p-3 flex justify-between items-center bg-white text-xs">
                      <div className="flex gap-2 text-slate-500 font-bold">
                         <span className="flex items-center gap-1"><UserCheck size={12}/> {entry.attendeesCount}명</span>
                         <span className="flex items-center gap-1"><AlertCircle size={12}/> {entry.riskFactors?.length || 0}건</span>
                      </div>
                      <div className="flex items-center gap-1">
                          <button onClick={(e) => { e.stopPropagation(); onOpenPrintModal([entry]); }} aria-label={`${entry.teamName} ${entry.date} 상세 보고서 열기`} className="text-blue-600 hover:bg-blue-50 px-2 py-1 rounded font-bold transition-colors">상세</button>
                      </div>
                   </div>
                </div>
             )})}
          </div>
      )}

      {/* Floating Bulk Action Bar */}
      {selectedIds.size > 0 && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-6 z-50 animate-slide-up" role="region" aria-label="선택 항목 빠른 작업">
              <span className="font-bold text-sm flex items-center gap-2">
                  <CheckCircle2 size={18} className="text-emerald-400"/>
                  {selectedIds.size}개 선택됨
              </span>
              <div className="h-4 w-px bg-slate-700"></div>
              <div className="flex items-center gap-2">
                  <button onClick={handlePrintClick} aria-label={`선택된 ${selectedIds.size}개 항목 인쇄`} className="flex items-center gap-1.5 hover:text-emerald-400 transition-colors text-xs font-bold">
                      <Printer size={16}/> 선택 인쇄
                  </button>
                  <button onClick={handleBulkDeleteClick} aria-label={`선택된 ${selectedIds.size}개 항목 일괄 삭제`} className="flex items-center gap-1.5 hover:text-red-400 transition-colors text-xs font-bold ml-4">
                      <Trash2 size={16}/> 일괄 삭제
                  </button>
              </div>
              <button onClick={() => setSelectedIds(new Set())} aria-label="선택 항목 해제" className="ml-2 bg-slate-800 rounded-full p-1 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors">
                  <XCircle size={16}/>
              </button>
          </div>
      )}

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
