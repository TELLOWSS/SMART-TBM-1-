
import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { TBMEntry } from '../types';
import { Printer, X, Download, Loader2, Edit3, Trash2, Sparkles, UserCheck, AlertOctagon, Eye, Users } from 'lucide-react';
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
    
    // 1. Create a "Ghost" container with EXACT A4 dimensions
    const ghostContainer = document.createElement('div');
    ghostContainer.id = 'pdf-ghost-container';
    Object.assign(ghostContainer.style, {
        position: 'fixed',
        top: '0',
        left: '0',
        width: '794px', // A4 Width at 96 DPI
        height: '1123px', // A4 Height at 96 DPI
        zIndex: '-100',
        background: '#ffffff',
        visibility: 'visible',
        overflow: 'hidden'
    });
    document.body.appendChild(ghostContainer);

    try {
      const pdf = new jsPDF('p', 'mm', 'a4');
      const originalPages = document.querySelectorAll('.report-page');

      // Wait for fonts
      await document.fonts.ready;

      for (let i = 0; i < originalPages.length; i++) {
          const originalPage = originalPages[i] as HTMLElement;
          const clone = originalPage.cloneNode(true) as HTMLElement;

          // Reset styles for capture
          clone.style.margin = '0';
          clone.style.boxShadow = 'none';
          clone.style.transform = 'none';
          clone.style.width = '794px';
          clone.style.height = '1123px';
          clone.style.position = 'relative';
          
          // Remove animations & interactive elements
          const allElements = clone.querySelectorAll('*');
          allElements.forEach((el) => {
             const htmlEl = el as HTMLElement;
             htmlEl.style.animation = 'none';
             htmlEl.style.transition = 'none';
          });

          const uiElements = clone.querySelectorAll('.edit-overlay, .no-print-ui');
          uiElements.forEach(el => el.remove());

          // Fix SVG sizes
          const clonedSvgs = clone.querySelectorAll('svg');
          clonedSvgs.forEach((cSvg) => {
             cSvg.style.display = 'inline-block';
             cSvg.style.verticalAlign = 'middle';
             if (!cSvg.getAttribute('width')) cSvg.setAttribute('width', '12px');
             if (!cSvg.getAttribute('height')) cSvg.setAttribute('height', '12px');
          });

          ghostContainer.appendChild(clone);

          // Wait for images to load
          const images = Array.from(clone.querySelectorAll('img'));
          await Promise.all(images.map(img => {
              if (img.complete) return Promise.resolve();
              return new Promise((resolve) => {
                  img.onload = resolve;
                  img.onerror = resolve;
                  // Force resolve after timeout
                  setTimeout(resolve, 1500);
              });
          }));
          
          // Small delay for layout stabilization
          await new Promise(resolve => setTimeout(resolve, 300));

          const canvas = await html2canvas(clone, {
            scale: 2, 
            useCORS: true,
            logging: false,
            width: 794,
            height: 1123,
            windowWidth: 794,
            windowHeight: 1123,
            scrollY: 0, 
            scrollX: 0,
            backgroundColor: '#ffffff',
            onclone: (doc) => {
               const style = doc.createElement('style');
               style.innerHTML = `
                  * { 
                     -webkit-font-smoothing: antialiased !important; 
                     text-rendering: optimizeLegibility !important;
                     letter-spacing: 0px !important; 
                     font-variant-ligatures: none !important;
                  }
               `;
               doc.head.appendChild(style);
            }
          });

          const imgData = canvas.toDataURL('image/jpeg', 0.95);
          const imgWidth = 210; // A4 width mm
          const imgHeight = 297; // A4 height mm

          if (i > 0) pdf.addPage();
          pdf.addImage(imgData, 'JPEG', 0, 0, imgWidth, imgHeight);
          
          ghostContainer.removeChild(clone);
      }

      pdf.save(`TBM_일지_${new Date().toISOString().slice(0,10)}.pdf`);

    } catch (error) {
      console.error("PDF generation failed", error);
      alert("PDF 생성 중 오류가 발생했습니다.");
    } finally {
      if (document.body.contains(ghostContainer)) {
          document.body.removeChild(ghostContainer);
      }
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

  return createPortal(
    <div className="fixed inset-0 bg-slate-900/95 z-50 overflow-y-auto flex flex-col items-center report-container-wrapper">
      <style>{`
        @import url("https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css");
        
        /* Main Page Container - Strict Box Model */
        .report-page {
            width: 794px;
            height: 1123px;
            background: white;
            margin: 0 auto 40px auto;
            position: relative;
            font-family: "Pretendard", "Malgun Gothic", sans-serif;
            color: black;
            box-sizing: border-box;
            border: 2px solid black; /* Outer Border */
            display: block;
        }

        /* Grid System for PDF Stability */
        .row { display: flex; width: 100%; border-bottom: 1px solid black; box-sizing: border-box; }
        .row.last { border-bottom: none; }
        .col { border-right: 1px solid black; height: 100%; box-sizing: border-box; position: relative; }
        .col.last { border-right: none; }
        
        /* Explicit Heights Strategy (Total 1119px inside border) */
        .h-header { height: 130px; }
        .h-info { height: 45px; }
        .h-body { height: 908px; display: flex; flex-direction: column; } 
        .h-footer { height: 36px; border-top: 1px solid black; display: flex; align-items: center; }
        
        /* Section Headers */
        .section-header {
            background-color: #f3f4f6; /* gray-100 */
            border-bottom: 1px solid black;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 11px;
            font-weight: 800;
            height: 30px;
            color: black;
        }

        /* Body Internal Layout */
        .body-row-images { height: 400px; border-bottom: 1px solid black; display: flex; width: 100%; }
        .body-row-text { flex: 1; display: flex; width: 100%; } /* Fill remaining height */

        /* Utilities */
        .text-wrap-fix {
           white-space: pre-wrap;
           word-break: keep-all; /* Prevent word split */
           line-height: 1.35;
        }
        
        .report-page svg { display: inline-block; vertical-align: middle; }

        @media print {
          @page { size: A4; margin: 0; }
          body, html { margin: 0; padding: 0; background: white; }
          #root { display: none !important; }
          .report-container-wrapper {
            position: absolute !important; top: 0 !important; left: 0 !important;
            width: 100% !important; height: auto !important;
            margin: 0 !important; padding: 0 !important;
            background: white !important; display: block !important;
          }
          .report-page {
            margin: 0 !important; box-shadow: none !important;
            page-break-after: always;
          }
          .no-print-ui { display: none !important; }
        }
      `}</style>
      
      {/* Toolbar */}
      <div className="sticky top-0 z-50 w-full bg-slate-800 text-white p-4 shadow-lg flex justify-between items-center max-w-[794px] rounded-b-xl mb-8 no-print-ui">
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
          <div key={entry.id || index} className="report-page group">
            
            {/* 1. Header Row */}
            <div className="row h-header">
                {/* Title Section */}
                <div className="col" style={{width: '65%'}}>
                    <div className="p-4 flex flex-col justify-center h-full">
                        <div className="text-[10px] font-bold text-slate-500 mb-1">용인 푸르지오 원클러스터 2,3단지 현장</div>
                        <h1 className="text-3xl font-black tracking-tighter mb-2 text-black">일일 TBM 및 위험성평가 점검표</h1>
                         <div className="flex items-center text-[10px] font-bold gap-3 text-slate-700">
                             <span>일자: {entry.date} ({entry.time})</span>
                             <span className="w-px h-3 bg-slate-300"></span>
                             <span>작성: {entry.teamName}</span>
                         </div>
                    </div>
                </div>
                {/* Signatures Section */}
                <div className="col last flex" style={{width: '35%'}}>
                    <div className="col" style={{width: '50%'}}>
                        <div className="section-header">안전 관리자</div>
                        <div className="relative h-[calc(100%-30px)] flex items-center justify-center group cursor-pointer hover:bg-slate-50">
                             {signatures.safety ? <img src={signatures.safety} className="max-w-[80%] max-h-[70px] object-contain"/> : <span className="text-slate-300 text-xs">(서명)</span>}
                             <input type="file" className="absolute inset-0 opacity-0 cursor-pointer no-print-ui" onChange={handleSignatureUpload('safety')} />
                        </div>
                    </div>
                    <div className="col last" style={{width: '50%'}}>
                        <div className="section-header">현장 소장</div>
                         <div className="relative h-[calc(100%-30px)] flex items-center justify-center group cursor-pointer hover:bg-slate-50">
                             {signatures.site ? <img src={signatures.site} className="max-w-[80%] max-h-[70px] object-contain"/> : <span className="text-slate-300 text-xs">(서명)</span>}
                             <input type="file" className="absolute inset-0 opacity-0 cursor-pointer no-print-ui" onChange={handleSignatureUpload('site')} />
                        </div>
                    </div>
                </div>
            </div>

            {/* 2. Info Row */}
            <div className="row h-info text-xs">
                <div className="col bg-slate-50 flex items-center justify-center font-extrabold text-black" style={{width: '12%'}}>작업 팀명</div>
                <div className="col flex items-center justify-center font-bold text-black" style={{width: '23%'}}>{entry.teamName}</div>
                <div className="col bg-slate-50 flex items-center justify-center font-extrabold text-black" style={{width: '10%'}}>팀장</div>
                <div className="col flex items-center justify-center font-bold text-black" style={{width: '20%'}}>{entry.leaderName}</div>
                <div className="col bg-slate-50 flex items-center justify-center font-extrabold text-black" style={{width: '15%'}}>금일 출력</div>
                <div className="col last flex items-center justify-center font-bold text-black" style={{width: '20%'}}>{entry.attendeesCount}명</div>
            </div>

            {/* 3. Main Body */}
            <div className="h-body">
                {/* 3-A. Images Row (Height reduced to 400px to save space for text) */}
                <div className="body-row-images">
                    <div className="col" style={{width: '50%'}}>
                        <div className="section-header">1. TBM 일지 원본 (스캔)</div>
                        <div className="h-[calc(100%-30px)] p-2 flex items-center justify-center">
                            {entry.originalLogImageUrl ? <img src={entry.originalLogImageUrl} className="max-w-full max-h-full object-contain"/> : <span className="text-xs text-slate-300">이미지 없음</span>}
                        </div>
                    </div>
                    <div className="col last" style={{width: '50%'}}>
                        <div className="section-header">2. TBM 실시 사진 및 동영상</div>
                        <div className="h-[calc(100%-30px)] p-2 flex items-center justify-center relative">
                             {entry.tbmPhotoUrl ? (
                                <div className="w-full h-full flex items-center justify-center relative">
                                    <img src={entry.tbmPhotoUrl} className="max-w-full max-h-full object-contain"/>
                                    {entry.tbmVideoUrl && (
                                        <div className="absolute bottom-2 right-2 bg-black/70 text-white px-2 py-1 text-[8px] rounded flex items-center gap-1">
                                            <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse"></span> 동영상
                                        </div>
                                    )}
                                </div>
                             ) : <span className="text-xs text-slate-300">이미지 없음</span>}
                        </div>
                    </div>
                </div>
                
                {/* 3-B. Text Content Row (Expanded) */}
                <div className="body-row-text">
                    {/* Left: Work & Risk */}
                    <div className="col flex flex-col" style={{width: '50%'}}>
                        <div className="section-header">3. 금일 작업 내용 및 위험요인</div>
                        <div className="flex-1 p-4 flex flex-col gap-4 overflow-hidden">
                            {/* Work Desc */}
                            <div>
                                <div className="text-[11px] font-extrabold text-slate-800 mb-1 border-b border-slate-200 inline-block pb-0.5">[작업 내용]</div>
                                <div className="text-[11px] leading-relaxed text-wrap-fix text-black min-h-[50px]">
                                    {entry.workDescription || "내용 없음"}
                                </div>
                            </div>
                            
                            {/* Risks */}
                            <div className="flex-1 border border-orange-300 rounded flex flex-col min-h-0">
                                <div className="bg-orange-50 p-1.5 text-center text-[10px] font-bold text-orange-700 border-b border-orange-200">⚠ 중점 위험 관리 사항</div>
                                <div className="p-2 space-y-3 overflow-hidden">
                                    {(entry.riskFactors || []).slice(0,5).map((risk, i) => (
                                        <div key={i} className="text-[10px]">
                                            <div className="flex gap-1.5 mb-0.5 items-start">
                                                <span className="bg-red-100 text-red-600 border border-red-200 px-1.5 rounded text-[9px] font-bold shrink-0 mt-0.5">위험</span>
                                                <span className="text-wrap-fix leading-tight text-black">{risk.risk}</span>
                                            </div>
                                            <div className="flex gap-1.5 items-start">
                                                <span className="bg-blue-100 text-blue-600 border border-blue-200 px-1.5 rounded text-[9px] font-bold shrink-0 mt-0.5">대책</span>
                                                <span className="text-wrap-fix leading-tight text-black">{risk.measure}</span>
                                            </div>
                                        </div>
                                    ))}
                                    {(!entry.riskFactors || entry.riskFactors.length === 0) && <div className="text-center text-[10px] text-slate-300 py-4">항목 없음</div>}
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    {/* Right: AI Insight */}
                    <div className="col last flex flex-col" style={{width: '50%'}}>
                         <div className="section-header">4. AI Deep Insight (심층 정밀 진단)</div>
                         <div className="flex-1 flex flex-col overflow-hidden">
                            {/* AI Score Box */}
                            <div className="p-4 border-b border-black bg-slate-50/50">
                                {entry.videoAnalysis ? (
                                    <>
                                    <div className="flex justify-between items-center mb-3">
                                        <div className="flex items-center gap-1.5">
                                            <Sparkles size={14} className="text-violet-600"/>
                                            <span className="text-[11px] font-bold text-black">AI TBM Quality Score</span>
                                        </div>
                                        <span className="text-sm font-black text-violet-600 border border-violet-200 bg-white px-2 py-0.5 rounded shadow-sm">{entry.videoAnalysis.score}점</span>
                                    </div>
                                    
                                    {/* Stats Grid */}
                                    <div className="flex gap-2 mb-3">
                                        <div className="flex-1 bg-white border border-slate-200 rounded p-1.5 flex items-center gap-1.5">
                                            <Eye size={12} className="text-slate-400"/>
                                            <span className="text-[10px] font-bold text-slate-600">집중도: {entry.videoAnalysis.focusAnalysis?.overall || 0}%</span>
                                        </div>
                                        <div className="flex-1 bg-white border border-slate-200 rounded p-1.5 flex items-center gap-1.5">
                                            <Users size={12} className="text-slate-400"/>
                                            <span className="text-[10px] font-bold text-slate-600">산만: {entry.videoAnalysis.focusAnalysis?.distractedCount || 0}명</span>
                                        </div>
                                    </div>

                                    {/* Blind Spot Alert */}
                                    {entry.videoAnalysis.insight?.missingTopics?.length > 0 && (
                                        <div className="bg-orange-50 border border-orange-200 rounded p-2 mb-3">
                                            <div className="flex items-center gap-1.5 mb-1">
                                                <AlertOctagon size={12} className="text-orange-600"/>
                                                <span className="text-[10px] font-bold text-orange-700">Blind Spot (누락 위험)</span>
                                            </div>
                                            <p className="text-[10px] text-orange-900 leading-tight text-wrap-fix">
                                                {entry.videoAnalysis.insight.missingTopics.join(', ')}
                                            </p>
                                        </div>
                                    )}
                                    
                                    <div className="text-[10px] text-slate-700 font-medium leading-relaxed bg-white p-2.5 rounded border border-slate-200 text-wrap-fix italic border-l-4 border-l-violet-400">
                                        "{entry.videoAnalysis.evaluation}"
                                    </div>
                                    </>
                                ) : (
                                    <div className="text-center py-6 text-[10px] text-slate-400">AI 분석 데이터 없음</div>
                                )}
                            </div>
                            
                            {/* Safety Manager Feedback */}
                            <div className="flex-1 p-4 bg-white">
                                <div className="text-[11px] font-extrabold text-black mb-2 border-b border-slate-200 pb-1 flex items-center gap-1">
                                    <UserCheck size={12}/> 안전관리자 코멘트
                                </div>
                                <div className="space-y-2">
                                    {(entry.safetyFeedback || []).slice(0,5).map((fb, i) => (
                                        <div key={i} className="flex gap-2 items-start">
                                            <span className="text-blue-600 text-[10px] mt-0.5 font-bold">✔</span>
                                            <span className="text-[10px] text-black leading-snug text-wrap-fix">{fb}</span>
                                        </div>
                                    ))}
                                    {(!entry.safetyFeedback || entry.safetyFeedback.length === 0) && <div className="text-center text-[10px] text-slate-300 py-4">코멘트 없음</div>}
                                </div>
                            </div>
                         </div>
                    </div>
                </div>
            </div>

            {/* 4. Footer Row */}
            <div className="h-footer flex justify-between items-center px-4 text-[9px] text-slate-500 font-mono">
                 <div>DOC-NO: TBM-{entry.date.replace(/-/g,'')}-{index+1} (REV.0)</div>
                 <div className="font-bold text-slate-700">(주)휘강건설 스마트 안전관리 시스템</div>
                 <div>Page {index + 1} / {entries.length}</div>
            </div>
            
            {/* Edit Controls */}
            <div className="edit-overlay absolute top-0 right-0 p-4 no-print-ui z-[100] flex gap-2">
                <button onClick={() => onEdit(entry)} className="bg-white text-blue-600 p-2 rounded shadow border hover:bg-blue-50 hover:border-blue-300 transition-colors"><Edit3 size={16}/></button>
                <button onClick={() => onDelete(String(entry.id))} className="bg-white text-red-600 p-2 rounded shadow border hover:bg-red-50 hover:border-red-300 transition-colors"><Trash2 size={16}/></button>
            </div>

          </div>
        ))}
      </div>
    </div>,
    document.body
  );
};
