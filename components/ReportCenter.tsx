
import React, { useMemo, useState } from 'react';
import { TBMEntry, TeamOption } from '../types';
import { FileText, Printer, Search, Filter, Calendar, CheckCircle2, AlertCircle, Download, MoreHorizontal, UserCheck, Shield, Loader2, Package, Sparkles } from 'lucide-react';
import JSZip from 'jszip';

interface ReportCenterProps {
  entries: TBMEntry[];
  onOpenPrintModal: () => void;
  signatures: { safety: string | null; site: string | null };
  teams: TeamOption[];
}

export const ReportCenter: React.FC<ReportCenterProps> = ({ entries, onOpenPrintModal, signatures, teams }) => {
  const [selectedTeam, setSelectedTeam] = useState('all');
  const [isZipping, setIsZipping] = useState(false);

  // Stats Calculation
  const stats = useMemo(() => {
    return {
      total: entries.length,
      signed: (signatures.safety && signatures.site) ? entries.length : 0, // Simplified logic: if signatures exist globally
      hasRisk: entries.filter(e => e.riskFactors && e.riskFactors.length > 0).length,
      photos: entries.filter(e => e.tbmPhotoUrl).length
    };
  }, [entries, signatures]);

  const filteredEntries = selectedTeam === 'all' 
    ? entries 
    : entries.filter(e => e.teamId === selectedTeam);

  // --- ZIP Export Function ---
  const handleExportDataPackage = async () => {
    if (filteredEntries.length === 0) {
      alert("내보낼 데이터가 없습니다.");
      return;
    }

    if (!confirm(`총 ${filteredEntries.length}건의 데이터와 사진을 포함한\n압축 파일(ZIP)을 생성하시겠습니까?\n(동영상은 용량 문제로 제외됩니다)`)) {
       return;
    }

    setIsZipping(true);
    try {
      const zip = new JSZip();
      const folderName = `TBM_일지_${new Date().toISOString().slice(0,10)}`;
      const photoFolder = zip.folder(`${folderName}/현장사진`);

      // 1. Define Headers
      const headers = [
         '일자', 
         '시간', 
         '팀명', 
         '팀장', 
         '참석인원', 
         '작업내용', 
         '중점 위험요인 및 대책', 
         '안전 관리자 피드백',
         'AI TBM 점수',
         'AI 평가 내용',
         '사진 파일명' 
      ];

      // 2. Map Data to Rows & Add Photos
      const rows = filteredEntries.map((entry, idx) => {
         // Handle Photo adding to ZIP
         let photoFileName = '';
         // Safeguard teamName
         const safeTeamName = (entry.teamName || 'unknown').replace(/[\/\\?%*:|"<>]/g, '_');

         if (entry.tbmPhotoUrl && photoFolder) {
             const base64Data = entry.tbmPhotoUrl.split(',')[1];
             const ext = entry.tbmPhotoUrl.includes('image/png') ? 'png' : 'jpg';
             // Clean filename
             const fileName = `${entry.date}_${safeTeamName}_${idx + 1}.${ext}`;
             
             photoFolder.file(fileName, base64Data, { base64: true });
             photoFileName = fileName;
         }

         // Format Risk Factors
         const risks = (entry.riskFactors || [])
            .map(r => `[위험] ${r.risk}\n   └ [대책] ${r.measure}`)
            .join('\n\n');

         // Format Feedback
         const feedback = (entry.safetyFeedback || []).join('\n');

         // CSV Row Data
         return [
            entry.date,
            entry.time,
            entry.teamName,
            entry.leaderName,
            entry.attendeesCount,
            entry.workDescription,
            risks,
            feedback,
            entry.videoAnalysis ? `${entry.videoAnalysis.score}점` : '미실시',
            entry.videoAnalysis ? entry.videoAnalysis.evaluation : '',
            photoFileName 
         ].map(field => {
            const stringField = String(field || '');
            return `"${stringField.replace(/"/g, '""')}"`;
         }).join(',');
      });

      // 3. Create CSV Content
      const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
      zip.file(`${folderName}/TBM_일지_내역서.csv`, csvContent);

      // 4. Generate ZIP
      const content = await zip.generateAsync({ type: "blob" });
      
      // 5. Trigger Download
      const url = URL.createObjectURL(content);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${folderName}.zip`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

    } catch (error) {
      console.error("ZIP Generation Error", error);
      alert("압축 파일 생성 중 오류가 발생했습니다.");
    } finally {
      setIsZipping(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      
      {/* Header Section */}
      <div className="flex flex-col md:flex-row justify-between items-end gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div>
           <div className="flex items-center gap-2 mb-2">
              <div className="bg-blue-100 p-2 rounded-lg text-blue-600">
                 <FileText size={24} />
              </div>
              <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-full uppercase tracking-wider">Document Archive</span>
           </div>
           <h2 className="text-2xl font-black text-slate-800 tracking-tight">안전 문서 통합 관리소</h2>
           <p className="text-slate-500 text-sm font-medium mt-1">
              법적 보존 연한에 맞춰 TBM 일지를 안전하게 보관하고 관리합니다.
           </p>
        </div>
        
        <div className="flex gap-2">
           <button 
              onClick={handleExportDataPackage}
              disabled={isZipping}
              className="flex items-center gap-2 px-4 py-3 bg-white border border-slate-300 text-slate-600 font-bold rounded-xl hover:bg-green-50 hover:text-green-700 hover:border-green-200 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
           >
              {isZipping ? <Loader2 size={18} className="animate-spin"/> : <Package size={18} />}
              <span className="hidden md:inline">{isZipping ? '압축 중...' : '데이터 패키지(ZIP) 다운로드'}</span>
           </button>
           <button 
              onClick={onOpenPrintModal}
              className="flex items-center gap-2 px-6 py-3 bg-slate-900 text-white font-bold rounded-xl hover:bg-blue-600 transition-colors shadow-lg shadow-slate-900/20"
           >
              <Printer size={18} /> 전체 일지 출력 / PDF
           </button>
        </div>
      </div>

      {/* Signature Status & Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
         <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between group hover:border-blue-300 transition-colors">
            <div className="flex justify-between items-start">
               <span className="text-slate-400 text-xs font-bold uppercase">Total Documents</span>
               <FileText className="text-slate-300 group-hover:text-blue-500 transition-colors" size={20}/>
            </div>
            <div className="mt-2">
               <span className="text-3xl font-black text-slate-800">{stats.total}</span>
               <span className="text-sm text-slate-400 font-medium ml-1">건</span>
            </div>
         </div>

         <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between group hover:border-emerald-300 transition-colors">
            <div className="flex justify-between items-start">
               <span className="text-slate-400 text-xs font-bold uppercase">Evidence Photos</span>
               <div className="bg-emerald-100 p-1 rounded text-emerald-600">
                  <CheckCircle2 size={16}/>
               </div>
            </div>
            <div className="mt-2">
               <span className="text-3xl font-black text-emerald-600">{stats.photos}</span>
               <span className="text-sm text-slate-400 font-medium ml-1">장 보존 중</span>
            </div>
         </div>

         {/* Approval Status Card */}
         <div className="md:col-span-2 bg-gradient-to-r from-slate-800 to-slate-900 p-5 rounded-2xl border border-slate-700 shadow-lg text-white flex items-center justify-between relative overflow-hidden">
            <div className="absolute right-0 top-0 h-full w-32 bg-white/5 skew-x-12 -mr-8"></div>
            
            <div className="relative z-10">
               <h3 className="font-bold text-sm text-slate-300 mb-1 flex items-center gap-2">
                  <Shield size={14}/> 결재 승인 현황
               </h3>
               <div className="flex gap-6 mt-3">
                  <div className="flex items-center gap-3">
                     <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${signatures.safety ? 'border-emerald-500 bg-emerald-500/20 text-emerald-400' : 'border-slate-600 bg-slate-700 text-slate-500'}`}>
                        <UserCheck size={16} />
                     </div>
                     <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase">Safety Manager</p>
                        <p className={`text-xs font-bold ${signatures.safety ? 'text-emerald-400' : 'text-slate-500'}`}>
                           {signatures.safety ? '서명 완료' : '미승인'}
                        </p>
                     </div>
                  </div>
                  <div className="w-px h-8 bg-slate-700"></div>
                  <div className="flex items-center gap-3">
                     <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${signatures.site ? 'border-blue-500 bg-blue-500/20 text-blue-400' : 'border-slate-600 bg-slate-700 text-slate-500'}`}>
                        <UserCheck size={16} />
                     </div>
                     <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase">Site Manager</p>
                        <p className={`text-xs font-bold ${signatures.site ? 'text-blue-400' : 'text-slate-500'}`}>
                           {signatures.site ? '서명 완료' : '미승인'}
                        </p>
                     </div>
                  </div>
               </div>
            </div>
            
            <button 
               onClick={onOpenPrintModal}
               className="relative z-10 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-bold border border-white/20 backdrop-blur-sm transition-colors"
            >
               서명 관리 &gt;
            </button>
         </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap gap-3 items-center py-2 overflow-x-auto">
         <div className="bg-white px-3 py-2 rounded-lg border border-slate-200 shadow-sm flex items-center gap-2 text-slate-500">
            <Filter size={14} />
            <span className="text-xs font-bold">필터:</span>
         </div>
         <button 
            onClick={() => setSelectedTeam('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors border ${selectedTeam === 'all' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}
         >
            전체 보기
         </button>
         {teams.map(team => (
            <button 
               key={team.id}
               onClick={() => setSelectedTeam(team.id)}
               className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors border ${selectedTeam === team.id ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}
            >
               {team.name}
            </button>
         ))}
      </div>

      {/* Document Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
         {filteredEntries.map((entry, idx) => (
            <div 
               key={entry.id} 
               className="bg-white rounded-2xl border border-slate-200 p-0 overflow-hidden hover:shadow-lg hover:-translate-y-1 transition-all duration-300 group cursor-default"
               style={{ animation: `slideUp 0.5s ease-out forwards ${idx * 0.05}s`, opacity: 0 }}
            >
               {/* Card Header */}
               <div className="p-4 border-b border-slate-100 flex justify-between items-start bg-slate-50/50">
                  <div className="flex items-center gap-3">
                     <div className="w-10 h-10 rounded-lg bg-white border border-slate-200 flex items-center justify-center shadow-sm text-slate-400 font-bold text-xs">
                        {new Date(entry.date).getDate()}
                     </div>
                     <div>
                        <h4 className="font-bold text-slate-800 text-sm">{entry.teamName}</h4>
                        <div className="flex items-center gap-2 text-[11px] text-slate-500 font-medium">
                           <Calendar size={10} /> {entry.date} {entry.time}
                        </div>
                     </div>
                  </div>
                  {/* Status Badge */}
                  <div className={`px-2 py-1 rounded text-[10px] font-bold border ${entry.riskFactors && entry.riskFactors.length > 0 ? 'bg-orange-50 text-orange-600 border-orange-100' : 'bg-green-50 text-green-600 border-green-100'}`}>
                     {entry.riskFactors && entry.riskFactors.length > 0 ? '위험요인 발견' : '특이사항 없음'}
                  </div>
               </div>

               {/* Card Body - Thumbnail Preview */}
               <div className="h-32 bg-slate-100 relative overflow-hidden group">
                  {entry.tbmPhotoUrl ? (
                     <img src={entry.tbmPhotoUrl} alt="TBM Proof" className="w-full h-full object-cover opacity-90 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500" />
                  ) : (
                     <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs bg-slate-50 pattern-grid-lg">
                        <AlertCircle size={20} className="mb-1" />
                        <span>사진 없음</span>
                     </div>
                  )}
                  {/* Overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4">
                     <p className="text-white text-xs font-bold line-clamp-1">{entry.workDescription || '작업 내용 없음'}</p>
                  </div>
                  
                  {/* AI Score Badge on Card */}
                  {entry.videoAnalysis && (
                      <div className="absolute top-2 right-2 flex gap-1">
                          <span className={`text-[10px] font-black px-2 py-1 rounded-full shadow-md flex items-center gap-1 backdrop-blur-md ${
                              entry.videoAnalysis.score >= 80 ? 'bg-violet-500/90 text-white' : 
                              entry.videoAnalysis.score >= 50 ? 'bg-orange-500/90 text-white' : 'bg-red-500/90 text-white'
                          }`}>
                              <Sparkles size={10} className="text-yellow-300" /> AI {entry.videoAnalysis.score}
                          </span>
                      </div>
                  )}
               </div>

               {/* Card Footer */}
               <div className="p-3 flex justify-between items-center bg-white text-xs">
                  <div className="flex gap-2 text-slate-500 font-bold">
                     <span className="flex items-center gap-1"><UserCheck size={12}/> {entry.attendeesCount}명</span>
                     <span className="flex items-center gap-1"><AlertCircle size={12}/> {entry.riskFactors?.length || 0}건</span>
                  </div>
                  <button 
                     onClick={onOpenPrintModal}
                     className="text-blue-600 hover:bg-blue-50 px-2 py-1 rounded font-bold transition-colors"
                  >
                     상세 보기
                  </button>
               </div>
            </div>
         ))}
         
         {filteredEntries.length === 0 && (
            <div className="col-span-full py-20 text-center text-slate-400">
               <Search size={48} className="mx-auto mb-4 opacity-20" />
               <p className="font-bold">조건에 맞는 문서가 없습니다.</p>
            </div>
         )}
      </div>
    </div>
  );
};
