import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { TBMEntry } from '../types';
import { Printer, X, Download, Loader2, Edit3, Trash2, Activity, Zap, Mic, Users, Shield, Sparkles, UserCheck } from 'lucide-react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

interface ReportViewProps {
  entries: TBMEntry[];
  onClose: () => void;
  signatures: { safety: string | null; site: string | null };
  onUpdateSignature: (role: 'safety' | 'site', dataUrl: string) => void;
  onEdit: (entry: TBMEntry) => void;
  onDelete: (id: string) => void;
}

export const ReportView: React.FC<ReportViewProps> = ({ entries, onClose, signatures, onUpdateSignature, onEdit, onDelete }) => {
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPDF = async () => {
    setIsGeneratingPdf(true);
    try {
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pages = document.querySelectorAll('.report-page');

      for (let i = 0; i < pages.length; i++) {
        const page = pages[i] as HTMLElement;
        
        const canvas = await html2canvas(page, {
          scale: 2,
          useCORS: true,
          logging: false,
          windowWidth: 794,
          onclone: (clonedDoc) => {
            const clonedPages = clonedDoc.querySelectorAll('.report-page');
            clonedPages.forEach((p) => {
              (p as HTMLElement).style.boxShadow = 'none';
              (p as HTMLElement).style.margin = '0';
              const editBtns = (p as HTMLElement).querySelectorAll('.edit-overlay');
              editBtns.forEach((btn) => (btn as HTMLElement).style.display = 'none');
            });
          }
        });

        const imgData = canvas.toDataURL('image/jpeg', 0.95);
        const imgWidth = 210;
        const imgHeight = 297;

        if (i > 0) pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, 0, imgWidth, imgHeight);
      }

      pdf.save(`TBM_일지_${new Date().toISOString().slice(0,10)}.pdf`);
    } catch (error) {
      console.error("PDF generation failed", error);
      alert("PDF 생성 중 오류가 발생했습니다. '인쇄' 버튼을 눌러 'PDF로 저장'을 시도해주세요.");
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleSignatureUpload = (role: 'safety' | 'site') => (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          onUpdateSignature(role, event.target.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Helper to convert analysis enums to percentage for visualization
  const getMetricPercentage = (type: string, value: any): number => {
      if (type === 'participation') {
          if (value === 'GOOD') return 100;
          if (value === 'MODERATE') return 70;
          return 40;
      }
      if (type === 'voice') {
          if (value === 'CLEAR') return 100;
          if (value === 'MUFFLED') return 50;
          return 20;
      }
      if (type === 'ppe') {
          return value === 'GOOD' ? 100 : 30;
      }
      if (type === 'interaction') {
          return value ? 100 : 20;
      }
      return 50;
  };

  return createPortal(
    <div className="fixed inset-0 bg-slate-900/95 z-50 overflow-y-auto flex flex-col items-center report-container-wrapper">
      <style>{`
        @import url("https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css");
        
        .report-page {
          width: 210mm;
          min-height: 297mm;
          background: white;
          margin: 0 auto 40px auto; 
          box-shadow: 0 0 20px rgba(0,0,0,0.5);
          box-sizing: border-box;
          position: relative;
        }

        @media print {
          @page {
            size: A4;
            margin: 0;
          }
          
          body, html {
            margin: 0;
            padding: 0;
            background-color: white;
          }

          #root {
            display: none !important;
          }

          .report-container-wrapper {
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            height: auto !important;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
            overflow: visible !important;
            display: block !important;
            z-index: 9999;
          }

          .report-page {
            margin: 0 !important;
            box-shadow: none !important;
            page-break-after: always;
            border: none !important;
            width: 100% !important;
          }

          .no-print-ui {
            display: none !important;
          }
          
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }

        .border-black { border-color: #000 !important; }
        .text-black { color: #000 !important; }
        .bg-gray-100 { background-color: #f1f5f9 !important; }
        .bg-orange-50 { background-color: #fff7ed !important; }
        .bg-blue-50 { background-color: #eff6ff !important; }
      `}</style>

      <div className="sticky top-0 z-50 w-full bg-slate-800 text-white p-4 shadow-lg flex justify-between items-center max-w-[210mm] rounded-b-xl mb-8 no-print-ui">
        <div>
          <h2 className="font-bold text-lg">🖨️ 보고서 센터</h2>
          <p className="text-xs text-slate-400">
            {entries.length}개의 TBM 일지가 준비되었습니다.
          </p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={handleDownloadPDF}
            disabled={isGeneratingPdf}
            className={`flex items-center gap-2 bg-green-600 hover:bg-green-500 px-4 py-2 rounded font-bold transition-colors ${isGeneratingPdf ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {isGeneratingPdf ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
            {isGeneratingPdf ? 'PDF 생성 중...' : 'PDF 파일로 다운로드'}
          </button>
          <button 
            onClick={handlePrint}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded font-bold transition-colors"
          >
            <Printer size={18} /> 인쇄 (시스템)
          </button>
          <button 
            onClick={onClose}
            className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 px-4 py-2 rounded transition-colors"
          >
            <X size={18} /> 닫기
          </button>
        </div>
      </div>

      <div className="pb-20 print:pb-0">
        {entries.map((entry, index) => (
          <div key={entry.id || index} className="report-page p-[10mm] flex flex-col font-['Pretendard'] group relative">
            
            <div className="flex border-2 border-black border-b-0 h-[35mm]">
              <div className="flex-1 p-4 flex flex-col justify-center border-r border-black">
                <div className="text-[11px] font-bold text-slate-600 mb-1">용인 푸르지오 원클러스터 2,3단지 현장</div>
                <h1 className="text-3xl font-black text-black tracking-tight">일일 TBM 및 위험성평가 점검표</h1>
                <div className="text-[11px] mt-2 font-medium text-slate-700">
                  <span className="font-bold">일자:</span> {entry.date} ({entry.time}) <span className="mx-2 text-slate-300">|</span> <span className="font-bold">작성:</span> {entry.teamName}
                </div>
              </div>

              <div className="w-[60mm] flex">
                <div className="flex-1 flex flex-col border-r border-black">
                  <div className="h-[25px] bg-gray-100 border-b border-black flex items-center justify-center text-[10px] font-extrabold text-black">
                    안전 관리자
                  </div>
                  <div className="flex-1 relative cursor-pointer hover:bg-slate-50 group flex items-center justify-center">
                    {signatures.safety ? (
                      <img src={signatures.safety} alt="서명" className="max-w-[80%] max-h-[60px] object-contain" />
                    ) : (
                      <span className="text-slate-300 text-[9px] group-hover:text-blue-500">(서명)</span>
                    )}
                    <input type="file" className="absolute inset-0 opacity-0 cursor-pointer no-print-ui" onChange={handleSignatureUpload('safety')} />
                  </div>
                </div>
                <div className="flex-1 flex flex-col">
                  <div className="h-[25px] bg-gray-100 border-b border-black flex items-center justify-center text-[10px] font-extrabold text-black">
                    현장 소장
                  </div>
                  <div className="flex-1 relative cursor-pointer hover:bg-slate-50 group flex items-center justify-center">
                    {signatures.site ? (
                      <img src={signatures.site} alt="서명" className="max-w-[80%] max-h-[60px] object-contain" />
                    ) : (
                      <span className="text-slate-300 text-[9px] group-hover:text-blue-500">(서명)</span>
                    )}
                    <input type="file" className="absolute inset-0 opacity-0 cursor-pointer no-print-ui" onChange={handleSignatureUpload('site')} />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex border-2 border-black border-b-0 text-xs">
              <div className="w-[25mm] bg-white border-r border-black flex items-center justify-center font-extrabold h-[10mm]">작업 팀명</div>
              <div className="flex-1 border-r border-black flex items-center justify-center font-bold text-black">{entry.teamName}</div>
              <div className="w-[20mm] bg-white border-r border-black flex items-center justify-center font-extrabold">팀장</div>
              <div className="w-[30mm] border-r border-black flex items-center justify-center font-bold text-black">{entry.leaderName}</div>
              <div className="w-[20mm] bg-white border-r border-black flex items-center justify-center font-extrabold">금일 출력</div>
              <div className="w-[20mm] flex items-center justify-center font-bold text-black">{entry.attendeesCount}명</div>
            </div>

            <div className="flex-1 border-2 border-black flex flex-col">
              
              <div className="flex-1 flex border-b-2 border-black min-h-0">
                <div className="flex-1 border-r border-black flex flex-col">
                  <div className="h-[30px] bg-gray-100 border-b border-black flex items-center justify-center text-[11px] font-extrabold text-black">
                    1. TBM 일지 원본 (스캔)
                  </div>
                  <div className="flex-1 p-2 flex items-center justify-center overflow-hidden">
                    {entry.originalLogImageUrl ? (
                      <img src={entry.originalLogImageUrl} className="w-full h-full object-contain" alt="일지 원본" />
                    ) : (
                      <span className="text-slate-300 text-xs">이미지 없음</span>
                    )}
                  </div>
                </div>
                <div className="flex-1 flex flex-col">
                  <div className="h-[30px] bg-gray-100 border-b border-black flex items-center justify-center text-[11px] font-extrabold text-black">
                    2. TBM 실시 사진 및 동영상
                  </div>
                  <div className="flex-1 p-2 flex items-center justify-center overflow-hidden relative">
                    {entry.tbmPhotoUrl ? (
                       <div className="w-full h-full relative">
                          <img src={entry.tbmPhotoUrl} className="w-full h-full object-contain" alt="TBM 실시" />
                          {entry.tbmVideoUrl && (
                             <div className="absolute bottom-0 left-0 right-0 bg-black/80 text-white flex justify-between items-center px-2 py-1.5 backdrop-blur-sm print:bg-black/70 print:text-white">
                                <div className="flex items-center gap-2">
                                   <span className="text-[10px] font-bold text-red-400 animate-pulse">●</span>
                                   <span className="text-[9px] font-bold">동영상 증빙 서버 저장됨</span>
                                </div>
                                <div className="flex items-center gap-2">
                                   <span className="text-[8px] text-slate-300 max-w-[80px] truncate">{entry.tbmVideoFileName || 'Video_Evidence.mp4'}</span>
                                </div>
                             </div>
                          )}
                       </div>
                    ) : (
                      <span className="text-slate-300 text-xs">이미지 없음</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex-1 flex min-h-0">
                <div className="flex-1 border-r border-black flex flex-col">
                  <div className="h-[30px] bg-gray-100 border-b border-black flex items-center justify-center text-[11px] font-extrabold text-black">
                    3. 금일 작업 내용 및 위험요인
                  </div>
                  <div className="flex-1 p-4 flex flex-col">
                    <div className="mb-4">
                      <div className="text-[11px] font-extrabold text-slate-800 mb-1">[작업 내용]</div>
                      <div className="text-[12px] leading-relaxed font-medium whitespace-pre-wrap text-black">
                        {entry.workDescription || <span className="text-red-400 bg-red-50 px-2 py-0.5 rounded">⚠️ 내용이 비어있습니다.</span>}
                      </div>
                    </div>
                    
                    <div className="mt-auto border-2 border-orange-400 rounded p-0 overflow-hidden">
                       <div className="bg-orange-50 border-b border-orange-300 border-dashed px-2 py-1.5 flex items-center gap-2">
                          <span className="text-[10px] font-extrabold text-orange-700">⚠ 중점 위험 관리 사항</span>
                       </div>
                       <div className="p-2 space-y-2">
                          {(entry.riskFactors || []).length > 0 ? (
                            entry.riskFactors!.slice(0, 4).map((risk, rIdx) => (
                              <div key={rIdx} className="text-[10px]">
                                 <div className="flex items-start gap-1 mb-0.5">
                                    <span className="inline-block bg-red-100 text-red-600 border border-red-200 px-1 rounded-[2px] font-bold min-w-[28px] text-center leading-[1.2]">위험</span>
                                    <span className="text-black leading-[1.2]">{risk.risk}</span>
                                 </div>
                                 <div className="flex items-start gap-1">
                                    <span className="inline-block bg-blue-100 text-blue-600 border border-blue-200 px-1 rounded-[2px] font-bold min-w-[28px] text-center leading-[1.2]">대책</span>
                                    <span className="text-black leading-[1.2]">{risk.measure}</span>
                                 </div>
                              </div>
                            ))
                          ) : (
                             <div className="text-[10px] text-slate-400 text-center py-2">특이사항 없음</div>
                          )}
                       </div>
                    </div>
                  </div>
                </div>

                {/* 4. Split Section: AI Quantitative Audit + Safety Manager Feedback */}
                <div className="flex-1 flex flex-col">
                  <div className="h-[30px] bg-gray-100 border-b border-black flex items-center justify-center text-[11px] font-extrabold text-black">
                    4. AI 정밀 진단 및 관리자 피드백
                  </div>
                  <div className="flex-1 flex flex-col">
                     
                     {/* 4-A: AI Quantitative Analysis */}
                     {entry.videoAnalysis ? (
                       <div className="p-3 border-b border-black bg-slate-50">
                          <div className="flex justify-between items-center mb-2">
                             <div className="flex items-center gap-1.5">
                                <Sparkles size={12} className="text-violet-600"/>
                                <span className="text-[10px] font-black text-slate-800">AI Deep Learning Audit</span>
                             </div>
                             <div className="text-[12px] font-black text-violet-600 border border-violet-200 bg-white px-2 py-0.5 rounded">
                                종합 {entry.videoAnalysis.score}점
                             </div>
                          </div>
                          
                          {/* Quantitative Bars */}
                          <div className="grid grid-cols-2 gap-x-4 gap-y-2 mb-2">
                             <div>
                                <div className="flex justify-between text-[8px] font-bold text-slate-500 mb-0.5">
                                   <span>참여도 (Participation)</span>
                                   <span>{getMetricPercentage('participation', entry.videoAnalysis.details.participation)}%</span>
                                </div>
                                <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                   <div className="h-full bg-blue-500" style={{ width: `${getMetricPercentage('participation', entry.videoAnalysis.details.participation)}%` }}></div>
                                </div>
                             </div>
                             <div>
                                <div className="flex justify-between text-[8px] font-bold text-slate-500 mb-0.5">
                                   <span>음성 명확도 (Voice)</span>
                                   <span>{getMetricPercentage('voice', entry.videoAnalysis.details.voiceClarity)}%</span>
                                </div>
                                <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                   <div className="h-full bg-green-500" style={{ width: `${getMetricPercentage('voice', entry.videoAnalysis.details.voiceClarity)}%` }}></div>
                                </div>
                             </div>
                             <div>
                                <div className="flex justify-between text-[8px] font-bold text-slate-500 mb-0.5">
                                   <span>보호구 착용 (PPE)</span>
                                   <span>{getMetricPercentage('ppe', entry.videoAnalysis.details.ppeStatus)}%</span>
                                </div>
                                <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                   <div className="h-full bg-orange-500" style={{ width: `${getMetricPercentage('ppe', entry.videoAnalysis.details.ppeStatus)}%` }}></div>
                                </div>
                             </div>
                             <div>
                                <div className="flex justify-between text-[8px] font-bold text-slate-500 mb-0.5">
                                   <span>상호작용 (Interaction)</span>
                                   <span>{getMetricPercentage('interaction', entry.videoAnalysis.details.interaction)}%</span>
                                </div>
                                <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                   <div className="h-full bg-violet-500" style={{ width: `${getMetricPercentage('interaction', entry.videoAnalysis.details.interaction)}%` }}></div>
                                </div>
                             </div>
                          </div>
                          <p className="text-[9px] text-slate-600 font-medium leading-tight border-l-2 border-violet-300 pl-2">
                             "{entry.videoAnalysis.evaluation}"
                          </p>
                       </div>
                     ) : (
                       <div className="p-3 border-b border-black bg-slate-50 flex flex-col items-center justify-center text-slate-400 min-h-[80px]">
                          <span className="text-[10px] font-bold">AI 정밀 분석 데이터 없음</span>
                          <span className="text-[9px]">(동영상 미첨부 또는 분석 미실시)</span>
                       </div>
                     )}

                     {/* 4-B: Safety Manager Feedback */}
                     <div className="flex-1 p-3 bg-white">
                        <div className="text-[10px] font-extrabold text-slate-800 mb-2 flex items-center gap-1">
                           <UserCheck size={12}/> 안전관리자 코멘트
                        </div>
                        <div className="flex flex-col gap-1.5">
                           {entry.safetyFeedback && entry.safetyFeedback.length > 0 ? (
                              entry.safetyFeedback.slice(0, 3).map((fb, fIdx) => (
                                 <div key={fIdx} className="flex items-start gap-2 text-[10px]">
                                    <span className="text-blue-600 mt-[1px]">✔</span>
                                    <span className="font-medium text-slate-800 leading-snug">
                                       {(fb || '').replace('[월간중점누락]', '')}
                                    </span>
                                 </div>
                              ))
                           ) : (
                              <span className="text-[10px] text-slate-400">- 별도 지적사항 없음 -</span>
                           )}
                        </div>
                     </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="h-[8mm] mt-[1mm] flex justify-between items-end border-t border-black text-[9px] text-slate-500 font-mono">
               <div>DOC-NO: TBM-{(entry.date || '').replace(/-/g,'')}-{index+1} (REV.0)</div>
               <div className="font-bold text-slate-600">(주)휘강건설 스마트 안전관리 시스템</div>
               <div>Page {index + 1} / {entries.length}</div>
            </div>

            <div className="edit-overlay absolute top-0 right-0 p-4 no-print-ui z-[100] flex gap-2 pointer-events-auto">
                <button 
                  onClick={(e) => {
                     e.preventDefault();
                     e.stopPropagation();
                     onEdit(entry);
                  }}
                  className="bg-white text-blue-600 px-3 py-1.5 rounded-lg font-bold shadow-lg border border-blue-200 flex items-center gap-1 hover:bg-blue-600 hover:text-white transition-colors text-xs cursor-pointer active:scale-95"
                >
                  <Edit3 size={14} className="pointer-events-none" /> 수정
                </button>
                <button 
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onDelete(String(entry.id)); 
                  }}
                  className="bg-white text-red-600 px-3 py-1.5 rounded-lg font-bold shadow-lg border border-red-200 flex items-center gap-1 hover:bg-red-600 hover:text-white transition-colors text-xs cursor-pointer active:scale-95"
                >
                  <Trash2 size={14} className="pointer-events-none" /> 삭제
                </button>
            </div>

          </div>
        ))}
      </div>
    </div>,
    document.body
  );
};