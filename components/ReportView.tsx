
import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { TBMEntry, TeamOption } from '../types';
import { getEntryTeamLabel } from '../utils/teamUtils';
import { Printer, X, Download, Loader2, Edit3, Trash2, Sparkles, UserCheck, AlertOctagon, Eye, Users, Video, FileVideo, ImageOff, CheckCircle2, XCircle, Image as ImageIcon, Package, FileText, Mic, ShieldCheck, Lock } from 'lucide-react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import JSZip from 'jszip';

interface ReportViewProps {
  entries: TBMEntry[];
  teams: TeamOption[];
  siteName: string; 
  onClose: () => void;
  signatures: { safety: string | null; site: string | null };
  onUpdateSignature: (role: 'safety' | 'site', dataUrl: string) => void;
  onEdit: (entry: TBMEntry) => void;
  onDelete: (id: string) => void;
}

type NoticeTone = 'info' | 'success' | 'error';
type ExportStage = 'preparing' | 'capturing' | 'packaging' | 'downloading';

export const ReportView: React.FC<ReportViewProps> = ({ entries, teams, siteName, onClose, signatures, onUpdateSignature, onEdit, onDelete }) => {
  const [generatingMode, setGeneratingMode] = useState<'PDF' | 'IMAGE' | null>(null);
        const [exportDensity, setExportDensity] = useState<'auto' | 'standard' | 'compact'>('auto');
    const [renderProfile, setRenderProfile] = useState<'TEXT' | 'COMPAT'>('COMPAT');
  const [statusMessage, setStatusMessage] = useState("");
        const [exportProgress, setExportProgress] = useState<number | null>(null);
      const [exportStage, setExportStage] = useState<ExportStage | null>(null);
      const [lastExportFileName, setLastExportFileName] = useState('');
            const [lastExportMode, setLastExportMode] = useState<'PDF' | 'IMAGE' | null>(null);
    const [announceMessage, setAnnounceMessage] = useState('');
    const [announceTone, setAnnounceTone] = useState<NoticeTone>('info');
  const [scale, setScale] = useState(1);
  const reportDialogRef = useRef<HTMLDivElement>(null);
  const reportCloseButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);
  const announceClearTimerRef = useRef<number | null>(null);

  const announceStatus = (message: string, tone: NoticeTone = 'info') => {
      if (announceClearTimerRef.current !== null) {
          window.clearTimeout(announceClearTimerRef.current);
          announceClearTimerRef.current = null;
      }

      setAnnounceTone(tone);
      setAnnounceMessage('');
      requestAnimationFrame(() => {
          setAnnounceMessage(message);
      });

      if (tone !== 'info') {
          announceClearTimerRef.current = window.setTimeout(() => {
              setAnnounceMessage('');
              announceClearTimerRef.current = null;
          }, 5000);
      }
  };

  const formatLocationSummary = (entry: TBMEntry) => {
      return [entry.locationBuildingScope, entry.locationArea, entry.locationDetail]
          .map((value) => value?.trim())
          .filter(Boolean)
          .join(' / ');
  };

  const getExportStageLabel = (mode: 'PDF' | 'IMAGE' | null, stage: ExportStage | null) => {
      if (!mode) return '';

      switch (stage) {
          case 'preparing':
              return mode === 'PDF' ? 'PDF 준비' : 'ZIP 준비';
          case 'capturing':
              return mode === 'PDF' ? '페이지 캡처' : '이미지 변환';
          case 'packaging':
              return mode === 'PDF' ? 'PDF 조합' : 'ZIP 압축';
          case 'downloading':
              return '다운로드 시작';
          default:
              return mode === 'PDF' ? 'PDF 생성 중' : '이미지 내보내기 중';
      }
  };

  const getDownloadLocationHint = () => {
      const userAgent = navigator.userAgent;

      if (/Edg\//.test(userAgent)) {
          return 'Edge는 기본 다운로드 폴더 또는 하단 다운로드 바를 먼저 확인하세요.';
      }

      if (/Chrome\//.test(userAgent) && !/Edg\//.test(userAgent)) {
          return 'Chrome은 화면 하단 다운로드 표시줄 또는 기본 다운로드 폴더를 확인하세요.';
      }

      if (/Firefox\//.test(userAgent)) {
          return 'Firefox는 우측 상단 다운로드 아이콘 또는 기본 다운로드 폴더를 확인하세요.';
      }

      if (/Safari\//.test(userAgent) && !/Chrome\//.test(userAgent)) {
          return 'Safari는 우측 상단 다운로드 목록 또는 설정된 다운로드 폴더를 확인하세요.';
      }

      return '브라우저 다운로드 폴더 또는 저장 위치 선택 창을 확인하세요.';
  };

  const getDownloadBlockedHint = () => {
      const userAgent = navigator.userAgent;

      if (/Firefox\//.test(userAgent)) {
          return '다운로드가 보이지 않으면 주소창 근처 권한 아이콘이나 다운로드 차단 알림을 확인하세요.';
      }

      if (/Safari\//.test(userAgent) && !/Chrome\//.test(userAgent)) {
          return '저장이 보이지 않으면 팝업/다운로드 차단 설정과 Safari 다운로드 환경설정을 확인하세요.';
      }

      return '다운로드가 보이지 않으면 브라우저의 팝업/자동 다운로드 차단 설정을 확인하세요.';
  };

  const handleCloseRequest = () => {
      if (generatingMode !== null) {
          announceStatus('내보내기 진행 중에는 창을 닫을 수 없습니다. 완료 후 다시 시도하세요.', 'info');
          return;
      }

      onClose();
  };

  const handleRetryLastExport = () => {
      if (!lastExportMode || generatingMode !== null) return;
      processPages(lastExportMode);
  };

  React.useEffect(() => {
      previouslyFocusedElementRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';

      const focusTimer = window.setTimeout(() => {
          reportCloseButtonRef.current?.focus();
      }, 0);

      const handleKeyDown = (event: KeyboardEvent) => {
          if (event.key === 'Escape') {
              event.preventDefault();
              handleCloseRequest();
          }
      };

      window.addEventListener('keydown', handleKeyDown);

      return () => {
          if (announceClearTimerRef.current !== null) {
              window.clearTimeout(announceClearTimerRef.current);
          }
          window.clearTimeout(focusTimer);
          window.removeEventListener('keydown', handleKeyDown);
          document.body.style.overflow = originalOverflow;
          previouslyFocusedElementRef.current?.focus();
      };
    }, [generatingMode, onClose]);

  React.useEffect(() => {
      const updateScale = () => {
          const nextScale = window.innerWidth < 860
              ? Math.max(0.62, Number((window.innerWidth / 860).toFixed(2)))
              : 1;
          setScale(nextScale);
      };

      updateScale();
      window.addEventListener('resize', updateScale);
      return () => window.removeEventListener('resize', updateScale);
  }, []);

  const handleReportDialogKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== 'Tab') return;

      const dialogNode = reportDialogRef.current;
      if (!dialogNode) return;

      const focusableElements = dialogNode.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );

      if (focusableElements.length === 0) return;

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement as HTMLElement | null;

      if (event.shiftKey) {
          if (activeElement === firstElement || !dialogNode.contains(activeElement)) {
              event.preventDefault();
              lastElement.focus();
          }
          return;
      }

      if (activeElement === lastElement) {
          event.preventDefault();
          firstElement.focus();
      }
  };

  const fitTextForExport = (element: HTMLElement, density: 'standard' | 'compact') => {
      const regions = Array.from(element.querySelectorAll<HTMLElement>('.body-row-text > .col'));
      if (regions.length === 0) return;

      const textTargets = Array.from(element.querySelectorAll<HTMLElement>(
          '.body-row-text .text-wrap-fix, ' +
          '.body-row-text .text-cell span, ' +
          '.body-row-text .risk-line-text, ' +
          '.body-row-text .feedback-line-text, ' +
          '.body-row-text .ai-eval-text, ' +
          '.body-row-text .overall-opinion-text'
      ));
      if (textTargets.length === 0) return;

      const minFontSizePx = density === 'compact' ? 8.4 : 8.8;
      const maxIterations = density === 'compact' ? 5 : 4;

      for (let iteration = 0; iteration < maxIterations; iteration += 1) {
          const hasOverflow = regions.some((region) => region.scrollHeight > (region.clientHeight + 1));
          if (!hasOverflow) break;

          textTargets.forEach((node) => {
              const computed = window.getComputedStyle(node);
              const currentFontSize = Number.parseFloat(computed.fontSize || '0');
              if (Number.isFinite(currentFontSize) && currentFontSize > minFontSizePx) {
                  const reduction = density === 'compact' ? 0.45 : 0.4;
                  const nextFontSize = Math.max(minFontSizePx, currentFontSize - reduction);
                  node.style.fontSize = `${nextFontSize.toFixed(2)}px`;
              }

              const currentLineHeight = Number.parseFloat(computed.lineHeight || '0');
              if (Number.isFinite(currentLineHeight) && currentLineHeight > 0) {
                  const fallbackFont = Number.parseFloat(node.style.fontSize || computed.fontSize || '10');
                  const minLineHeightFactor = density === 'compact' ? 1.14 : 1.18;
                  const lineReduction = density === 'compact' ? 0.28 : 0.22;
                  const nextLineHeight = Math.max(fallbackFont * minLineHeightFactor, currentLineHeight - lineReduction);
                  node.style.lineHeight = `${nextLineHeight.toFixed(2)}px`;
              }
          });
      }
  };

  const rebalanceBodyForExport = (element: HTMLElement, density: 'standard' | 'compact') => {
      const bodyRowImages = element.querySelector<HTMLElement>('.body-row-images');
      const textCols = Array.from(element.querySelectorAll<HTMLElement>('.body-row-text > .col'));
      if (!bodyRowImages || textCols.length === 0) return;

      element.classList.remove('export-tight', 'export-ultra-tight');

      let imageHeight = density === 'compact' ? 320 : 340;
      const minImageHeight = density === 'compact' ? 260 : 290;
      const step = 10;
      const maxIterations = density === 'compact' ? 8 : 6;

      for (let iteration = 0; iteration < maxIterations; iteration += 1) {
          const hasOverflow = textCols.some((col) => col.scrollHeight > (col.clientHeight + 1));
          if (!hasOverflow) break;

          if (imageHeight > minImageHeight) {
              imageHeight = Math.max(minImageHeight, imageHeight - step);
              const nextHeight = `${imageHeight}px`;
              bodyRowImages.style.height = nextHeight;
              bodyRowImages.style.minHeight = nextHeight;
              bodyRowImages.style.maxHeight = nextHeight;
              continue;
          }

          fitTextForExport(element, density);
          break;
      }

      if (hasBodyOverflow(element)) {
          element.classList.add('export-tight');
          const tightHeight = `${Math.max(250, minImageHeight - 10)}px`;
          bodyRowImages.style.height = tightHeight;
          bodyRowImages.style.minHeight = tightHeight;
          bodyRowImages.style.maxHeight = tightHeight;
          fitTextForExport(element, 'compact');
      }

      if (hasBodyOverflow(element)) {
          element.classList.add('export-ultra-tight');
          const ultraTightHeight = '230px';
          bodyRowImages.style.height = ultraTightHeight;
          bodyRowImages.style.minHeight = ultraTightHeight;
          bodyRowImages.style.maxHeight = ultraTightHeight;
          fitTextForExport(element, 'compact');
      }
  };

  const hasBodyOverflow = (element: HTMLElement) => {
      const textCols = Array.from(element.querySelectorAll<HTMLElement>('.body-row-text > .col'));
      if (textCols.length === 0) return false;
      return textCols.some((col) => col.scrollHeight > (col.clientHeight + 1));
  };

  const canvasToPngBlob = (canvas: HTMLCanvasElement) => new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
          if (blob) {
              resolve(blob);
              return;
          }
          reject(new Error('이미지 Blob 생성 실패'));
      }, 'image/png');
  });

  const isCanvasMostlyDark = (canvas: HTMLCanvasElement) => {
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) return false;

      const width = canvas.width;
      const height = canvas.height;
      if (width === 0 || height === 0) return false;

      const sampleStep = Math.max(10, Math.floor(Math.min(width, height) / 48));
      let sampleCount = 0;
      let darkCount = 0;

      for (let y = 0; y < height; y += sampleStep) {
          for (let x = 0; x < width; x += sampleStep) {
              const pixel = context.getImageData(x, y, 1, 1).data;
              const luminance = (0.2126 * pixel[0]) + (0.7152 * pixel[1]) + (0.0722 * pixel[2]);
              const alpha = pixel[3] / 255;

              sampleCount += 1;
              if (alpha > 0.9 && luminance < 22) {
                  darkCount += 1;
              }
          }
      }

      if (sampleCount === 0) return false;
      return (darkCount / sampleCount) >= 0.9;
  };

  const lockExportLayout = (root: HTMLElement) => {
      const targets = root.querySelectorAll<HTMLElement>(
          '.h-header, .h-info, .h-body, .h-footer'
      );

      targets.forEach((node) => {
          const rect = node.getBoundingClientRect();
          if (rect.height > 0) {
              const heightPx = `${Math.round(rect.height)}px`;
              node.style.height = heightPx;
              node.style.minHeight = heightPx;
              node.style.maxHeight = heightPx;
          }
      });
  };

  const convertSvgToImage = async (root: HTMLElement) => {
      const svgNodes = Array.from(root.querySelectorAll<SVGSVGElement>('svg'));
      if (svgNodes.length === 0) return;

      await Promise.all(svgNodes.map(async (svgNode) => {
          try {
              const rect = svgNode.getBoundingClientRect();
              const width = Math.max(1, Math.round(rect.width || Number(svgNode.getAttribute('width')) || 16));
              const height = Math.max(1, Math.round(rect.height || Number(svgNode.getAttribute('height')) || 16));

              const serialized = new XMLSerializer().serializeToString(svgNode);
              const normalizedSvg = serialized.includes('xmlns=')
                  ? serialized
                  : serialized.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
              const svgBlob = new Blob([normalizedSvg], { type: 'image/svg+xml;charset=utf-8' });
              const blobUrl = URL.createObjectURL(svgBlob);

              await new Promise<void>((resolve, reject) => {
                  const image = new Image();
                  image.decoding = 'sync';
                  image.onload = () => {
                      image.width = width;
                      image.height = height;
                      image.style.width = `${width}px`;
                      image.style.height = `${height}px`;
                      image.className = svgNode.getAttribute('class') || '';
                      const inlineStyle = svgNode.getAttribute('style');
                      if (inlineStyle) {
                          image.setAttribute('style', inlineStyle);
                      }
                      svgNode.replaceWith(image);
                      URL.revokeObjectURL(blobUrl);
                      resolve();
                  };
                  image.onerror = () => {
                      URL.revokeObjectURL(blobUrl);
                      reject(new Error('SVG 이미지 변환 실패'));
                  };
                  image.src = blobUrl;
              });
          } catch {
              // 개별 SVG 변환 실패는 무시하고 전체 내보내기 계속
          }
      }));
  };

  const getCaptureScaleForExport = (mode: 'PDF' | 'IMAGE', pageCount: number) => {
      const dpr = window.devicePixelRatio || 1;
      const baseScale = mode === 'PDF' ? 2.4 : 2.6;
      return Math.min(3, Math.max(baseScale, dpr));
  };

  const processPages = async (mode: 'PDF' | 'IMAGE') => {
    if (generatingMode) return;
        const exportStartedAt = Date.now();
    setGeneratingMode(mode);
        setLastExportMode(mode);
    setStatusMessage(mode === 'PDF' ? "PDF 생성 중..." : "이미지 변환 중...");
        setExportProgress(0);
        setExportStage('preparing');
                setLastExportFileName('');
    
    // Allow UI update
    await new Promise(resolve => setTimeout(resolve, 100));

    const originalScrollPos = window.scrollY;
    window.scrollTo(0, 0);

    const ghostContainer = document.createElement('div');
    ghostContainer.id = 'pdf-ghost-container';
    
    // Position off-screen but keep layout flow
    Object.assign(ghostContainer.style, {
        position: 'fixed',
        top: '0',
        left: '0',
        width: '794px',   // A4 Width
        opacity: '0',
        pointerEvents: 'none',
        zIndex: '2147483647',
        background: '#ffffff',
    });
    document.body.appendChild(ghostContainer);

    try {
            const originalPages = reportDialogRef.current?.querySelectorAll('.report-page') || [];
            if (originalPages.length === 0) {
                        announceStatus('내보낼 보고서 페이지가 없습니다.', 'error');
                    return;
            }
      await document.fonts.ready;

      const captureScale = getCaptureScaleForExport(mode, originalPages.length);
      setStatusMessage(`화면 품질 유지 모드로 준비 중... (총 ${originalPages.length}페이지)`);

      let zip: any = null;
      if (mode === 'IMAGE' && originalPages.length > 1) {
          try {
              zip = new JSZip();
          } catch (e) {
              throw new Error("ZIP 초기화 실패");
          }
      }
      let pdf: jsPDF | null = mode === 'PDF'
          ? new jsPDF({
              orientation: 'portrait',
              unit: 'px',
              format: [794, 1123],
              compress: false,
              hotfixes: ['px_scaling'],
          })
          : null;
      
    let singleImageBlob: Blob | null = null;
      const pageDensityLog: Array<'standard' | 'compact'> = [];
      const captureProgressWeight = mode === 'IMAGE' && originalPages.length > 1 ? 75 : 90;

      for (let i = 0; i < originalPages.length; i++) {
          setExportStage('capturing');
          setStatusMessage(`${mode === 'PDF' ? 'PDF 생성 중...' : '이미지 변환 중...'} (${i + 1}/${originalPages.length})`);
          const originalPage = originalPages[i] as HTMLElement;

          // Deep clone
          const clone = originalPage.cloneNode(true) as HTMLElement;

          // Reset styles that might interfere with A4 layout
          clone.style.margin = '0';
          clone.style.padding = '0';
          clone.style.boxShadow = 'none';
          clone.style.transform = 'none'; // Remove scaling
          clone.style.width = '794px';
          clone.style.height = '1123px';
          clone.style.position = 'relative';
          clone.style.backgroundColor = '#ffffff';
          clone.style.border = '2px solid black'; // Preserve outer border
          clone.classList.add('export-mode');
          
          // Remove UI controls
          clone.querySelectorAll('.edit-overlay, .no-print-ui').forEach(el => el.remove());
          
          // Freeze animations
          clone.querySelectorAll('*').forEach((el) => {
             const htmlEl = el as HTMLElement;
             htmlEl.style.animation = 'none';
             htmlEl.style.transition = 'none';
          });

          ghostContainer.appendChild(clone);

          // 1. Convert SVGs to PNGs (Critical for icon alignment)
          await convertSvgToImage(clone);

          // 2. Preload all images
          const images = Array.from(clone.querySelectorAll('img'));
          await Promise.all(images.map(async (img) => {
              if (!img.complete) {
                  await new Promise((resolve) => {
                      img.onload = resolve;
                      img.onerror = resolve;
                  });
              }
              try {
                  await img.decode();
              } catch {
                  // ignore decode failure and continue export
              }
          }));

          // 3. Freeze final layout after SVG/image metrics are fully settled
          lockExportLayout(clone);

          // 4. Shrink text and rebalance image/text area only when overflow is detected
          let activeDensity: 'standard' | 'compact' = exportDensity === 'compact' ? 'compact' : 'standard';
          clone.classList.remove('export-standard', 'export-compact');
          clone.classList.add(activeDensity === 'compact' ? 'export-compact' : 'export-standard');
          rebalanceBodyForExport(clone, activeDensity);

          if (exportDensity === 'auto' && hasBodyOverflow(clone)) {
              activeDensity = 'compact';
              clone.classList.remove('export-standard', 'export-compact');
              clone.classList.add('export-compact');
              rebalanceBodyForExport(clone, activeDensity);
          }

          lockExportLayout(clone);

          const useTextProfile = renderProfile === 'TEXT';

          pageDensityLog.push(activeDensity);
          
          // Brief pause for rendering stabilization
          await new Promise(resolve => setTimeout(resolve, 220));

                    // 5. Capture with html2canvas
                    const applyCloneOverrides = true;
                    const capturePage = (foreignObjectRendering: boolean) => html2canvas(clone, {
                        scale: captureScale,
                        useCORS: true,
                        foreignObjectRendering,
                        logging: false,
                        width: 794,
                        height: 1123,
                        x: 0,
                        y: 0,
                        scrollX: 0,
                        scrollY: 0,
                        windowWidth: 794,
                        windowHeight: 1123,
                        backgroundColor: '#ffffff',
                            onclone: applyCloneOverrides ? ((doc) => {
                             // 1. Copy all style sheets (including dynamic Tailwind CDN rules)
                             try {
                                 Array.from(document.styleSheets).forEach((sheet) => {
                                     try {
                                         if (sheet.cssRules) {
                                             const newStyle = doc.createElement('style');
                                             let cssText = '';
                                             Array.from(sheet.cssRules).forEach((rule) => {
                                                 cssText += rule.cssText + '\n';
                                             });
                                             newStyle.textContent = cssText;
                                             doc.head.appendChild(newStyle);
                                         }
                                     } catch (e) {
                                         // Ignore cross-origin stylesheets (like external fonts)
                                     }
                                 });
                             } catch (err) {
                                 console.warn("Failed to copy stylesheets:", err);
                             }

                             // 2. Append PDF-specific overrides
                             const style = doc.createElement('style');
                             style.innerHTML = `
                  .report-page, .report-page * {
                      box-sizing: border-box !important;
                      -webkit-font-smoothing: antialiased !important;
                  }
                  .report-page {
                      width: 794px !important;
                      height: 1123px !important;
                      transform: none !important;
                      margin: 0 !important;
                      border: 2px solid black !important;
                  }
                  .row { display: flex !important; width: 100% !important; border-bottom: 1px solid black !important; flex-shrink: 0 !important; }
                  .row.last { border-bottom: none !important; }
                  .col { border-right: 1px solid black !important; height: 100% !important; position: relative !important; overflow: hidden !important; flex-shrink: 0 !important; }
                  .col.last { border-right: none !important; }
                  .h-header { height: 130px !important; }
                  .h-info { height: 78px !important; }
                  .h-body { height: 875px !important; display: flex !important; flex-direction: column !important; }
                  .h-footer { height: 36px !important; border-top: 1px solid black !important; display: flex !important; align-items: center !important; }
                  .section-header {
                      height: 30px !important;
                      background-color: #f3f4f6 !important;
                      border-bottom: 1px solid black !important;
                      display: flex !important;
                      align-items: center !important;
                      justify-content: center !important;
                      font-size: 11px !important;
                      font-weight: 800 !important;
                      color: black !important;
                      -webkit-print-color-adjust: exact !important;
                      print-color-adjust: exact !important;
                  }
                  .body-row-images { height: 340px !important; border-bottom: 1px solid black !important; display: flex !important; width: 100% !important; flex-shrink: 0 !important; }
                  .report-page.export-compact .body-row-images { height: 320px !important; }
                  .report-page.export-tight .body-row-images { height: 250px !important; }
                  .report-page.export-ultra-tight .body-row-images { height: 230px !important; }
                  .body-row-text { flex: 1 !important; display: flex !important; width: 100% !important; min-height: 0 !important; }
                  .body-row-text,
                  .body-row-text * {
                      color: #111827 !important;
                      letter-spacing: -0.01em !important;
                  }
                  .report-pane-block { padding: 10px !important; }
                  .report-pane-title {
                      font-size: 11px !important;
                      font-weight: 800 !important;
                      letter-spacing: -0.01em !important;
                      line-height: 1.25 !important;
                  }
                  .report-pane-subtitle {
                      font-size: 10px !important;
                      font-weight: 800 !important;
                      letter-spacing: -0.01em !important;
                      line-height: 1.25 !important;
                  }
                  .body-pane-header {
                      height: 30px !important;
                      min-height: 30px !important;
                      max-height: 30px !important;
                      padding: 0 8px !important;
                      line-height: 1 !important;
                      align-items: center !important;
                      justify-content: center !important;
                  }
                  .report-pane-card {
                      border-width: 1px !important;
                      border-radius: 6px !important;
                  }
                  .report-pane-inner-pad {
                      padding: 8px !important;
                  }
                  .body-row-text .section-header {
                      color: #111827 !important;
                      letter-spacing: 0 !important;
                  }
                  .ai-score-header {
                      display: flex !important;
                      justify-content: space-between !important;
                      align-items: center !important;
                      min-height: 24px !important;
                      gap: 8px !important;
                  }
                  .ai-score-title-wrap {
                      display: inline-flex !important;
                      align-items: center !important;
                      gap: 6px !important;
                      min-width: 0 !important;
                  }
                  .ai-score-icon {
                      width: 14px !important;
                      height: 14px !important;
                      display: block !important;
                      flex-shrink: 0 !important;
                  }
                  .ai-score-title {
                      display: block !important;
                      font-size: 11px !important;
                      line-height: 1.2 !important;
                      white-space: nowrap !important;
                  }
                  .ai-score-title-wrap svg,
                  .ai-score-title-wrap img {
                      width: 14px !important;
                      height: 14px !important;
                      display: block !important;
                      flex-shrink: 0 !important;
                  }
                  .ai-score-badge {
                      display: inline-flex !important;
                      align-items: center !important;
                      justify-content: center !important;
                      min-height: 20px !important;
                      line-height: 1 !important;
                      padding-top: 0 !important;
                      padding-bottom: 0 !important;
                      flex-shrink: 0 !important;
                  }
                  .ai-metric-grid {
                      display: flex !important;
                      flex-wrap: wrap !important;
                      justify-content: space-between !important;
                      row-gap: 6px !important;
                      column-gap: 12px !important;
                  }
                  .ai-metric-row {
                      display: flex !important;
                      flex-direction: row !important;
                      align-items: center !important;
                      width: calc(50% - 6px) !important;
                      gap: 6px !important;
                      min-height: 14px !important;
                      line-height: 1.28 !important;
                  }
                  .ai-metric-label {
                      width: 66px !important;
                      flex-shrink: 0 !important;
                      display: block !important;
                      line-height: 1.28 !important;
                      white-space: nowrap !important;
                      overflow: hidden !important;
                  }
                  .ai-metric-bar {
                      flex: 1 !important;
                      height: 6px !important;
                      margin-left: 0 !important;
                      margin-right: 0 !important;
                  }
                  .ai-metric-score {
                      width: 24px !important;
                      flex-shrink: 0 !important;
                      text-align: right !important;
                      display: block !important;
                      line-height: 1.28 !important;
                      white-space: nowrap !important;
                      overflow: hidden !important;
                  }
                  .ai-eval-grid {
                      display: flex !important;
                      flex-wrap: wrap !important;
                      gap: 4px !important;
                  }
                  .ai-summary-block {
                      flex-shrink: 0 !important;
                  }
                  .ai-eval-card {
                      width: calc(50% - 2px) !important;
                      min-height: 38px !important;
                  }
                  .ai-eval-text {
                      display: block !important;
                      line-height: 1.3 !important;
                      word-break: keep-all !important;
                      overflow-wrap: anywhere !important;
                      -webkit-line-clamp: unset !important;
                      -webkit-box-orient: initial !important;
                      overflow: hidden !important;
                  }
                  .text-wrap-fix { white-space: pre-wrap !important; word-break: break-word !important; overflow-wrap: anywhere !important; line-height: 1.35 !important; }
                  .break-keep { word-break: keep-all !important; overflow-wrap: anywhere !important; }
                  .dense-export-text { font-size: 9.4px !important; line-height: 1.25 !important; }
                  .report-page.export-compact .left-text-col .dense-export-text { font-size: 9px !important; line-height: 1.2 !important; }
                  .report-page.export-tight .left-text-col .dense-export-text { font-size: 8.8px !important; line-height: 1.18 !important; }
                  .report-page.export-ultra-tight .left-text-col .dense-export-text { font-size: 8.6px !important; line-height: 1.16 !important; }
                  .left-text-col .risk-focus-block { min-height: 136px !important; }
                  .report-page.export-compact .left-text-col .risk-focus-block { min-height: 120px !important; }
                  .risk-line-text {
                      display: block !important;
                      -webkit-line-clamp: unset !important;
                      -webkit-box-orient: initial !important;
                      overflow: hidden !important;
                      line-height: 1.35 !important;
                      max-height: 54px !important;
                  }
                  .feedback-line-text {
                      display: block !important;
                      -webkit-line-clamp: unset !important;
                      -webkit-box-orient: initial !important;
                      overflow: hidden !important;
                      line-height: 1.35 !important;
                      max-height: 68px !important;
                  }
                  .overall-opinion-text {
                      display: block !important;
                      -webkit-line-clamp: unset !important;
                      -webkit-box-orient: initial !important;
                      overflow: hidden !important;
                      line-height: 1.35 !important;
                      max-height: 140px !important;
                  }
                  .report-page.export-compact .overall-opinion-text { -webkit-line-clamp: 10 !important; }
                  .report-page.export-tight .overall-opinion-text { -webkit-line-clamp: 8 !important; }
                  .report-page.export-ultra-tight .overall-opinion-text { -webkit-line-clamp: 6 !important; }
                  .report-page.export-tight .left-text-col .left-content-stack,
                  .report-page.export-tight .right-ai-col .right-pane-stack {
                      padding: 8px !important;
                  }
                  .report-page.export-ultra-tight .left-text-col .left-content-stack,
                  .report-page.export-ultra-tight .right-ai-col .right-pane-stack {
                      padding: 6px !important;
                  }
                  .report-page.export-tight .left-text-col .left-content-stack,
                  .report-page.export-tight .right-ai-col .right-pane-stack,
                  .report-page.export-ultra-tight .left-text-col .left-content-stack,
                  .report-page.export-ultra-tight .right-ai-col .right-pane-stack {
                      gap: 6px !important;
                  }
                  .report-page.export-tight .left-text-col .body-pane-header,
                  .report-page.export-tight .right-ai-col .body-pane-header { height: 28px !important; min-height: 28px !important; max-height: 28px !important; font-size: 10px !important; }
                  .report-page.export-ultra-tight .left-text-col .body-pane-header,
                  .report-page.export-ultra-tight .right-ai-col .body-pane-header { height: 27px !important; min-height: 27px !important; max-height: 27px !important; font-size: 10px !important; }
                  .report-page.export-tight .integrity-seal,
                  .report-page.export-ultra-tight .integrity-seal {
                      display: none !important;
                  }
                  .report-page.export-mode .integrity-seal {
                      top: 6px !important;
                      right: 6px !important;
                      opacity: 0.42 !important;
                      transform: none !important;
                  }
                  .report-page.export-mode .integrity-seal .seal-ring {
                      width: 56px !important;
                      height: 56px !important;
                      border-width: 2px !important;
                  }
                  .report-page.export-mode .integrity-seal .seal-inner {
                      font-size: 6px !important;
                  }
                  table { border-collapse: collapse !important; width: 100% !important; table-layout: fixed !important; }
                  td { vertical-align: top !important; padding: 2px !important; line-height: 1.3 !important; }
                  .badge-cell { vertical-align: top !important; text-align: center !important; padding: 2px !important; }
                  .text-cell { vertical-align: top !important; padding-left: 4px !important; line-height: 1.3 !important; }
                  .text-cell span { word-break: break-word !important; overflow-wrap: anywhere !important; }
                  img {
                      max-width: 100% !important;
                      object-fit: contain !important;
                      image-rendering: -webkit-optimize-contrast !important;
                  }
               `;
                                doc.head.appendChild(style);
                            }) : undefined
                    });

                        let canvas = await capturePage(useTextProfile);
                        if (isCanvasMostlyDark(canvas)) {
                            canvas.width = 1;
                            canvas.height = 1;
                            setStatusMessage('캡처 호환 모드로 재시도 중...');
                            canvas = await capturePage(false);
                        }
          if (pdf) {
              const imgData = canvas.toDataURL('image/png');
              if (i > 0) {
                  pdf.addPage([794, 1123], 'portrait');
              }
              pdf.addImage(imgData, 'PNG', 0, 0, 794, 1123, undefined, 'NONE');
          } else if (zip) {
              const imageBlob = await canvasToPngBlob(canvas);
              const safeTeamName = getEntryTeamLabel(entries[i], teams).replace(/[\/\\?%*:|"<>]/g, '_');
              const fileName = `TBM_Report_${entries[i].date}_${safeTeamName}.png`;
              zip.file(fileName, imageBlob);
          } else {
              singleImageBlob = await canvasToPngBlob(canvas);
          }

          setExportProgress(Math.max(1, Math.round(((i + 1) / originalPages.length) * captureProgressWeight)));

          canvas.width = 1;
          canvas.height = 1;
          await new Promise(resolve => setTimeout(resolve, 0));
          
          ghostContainer.removeChild(clone);
      }

      const dateStr = new Date().toISOString().slice(0,10);
      let exportedFileName = '';

      if (pdf) {
          exportedFileName = `TBM_일지_통합본_${dateStr}.pdf`;
          setExportStage('packaging');
          setStatusMessage('PDF 저장 파일을 준비 중...');
          setExportProgress(96);
          setExportStage('downloading');
          setLastExportFileName(exportedFileName);
          pdf.save(exportedFileName);
      } else if (zip) {
          exportedFileName = `TBM_일지_이미지모음_${dateStr}.zip`;
          setExportStage('packaging');
          setStatusMessage('ZIP 압축 준비 중...');
          setExportProgress(Math.max(captureProgressWeight, 76));
          const content = await zip.generateAsync(
              { type: "blob" },
              (metadata) => {
                  const zipPercent = Math.round(metadata.percent);
                  setStatusMessage(`ZIP 압축 중... ${zipPercent}%`);
                  setExportProgress(Math.min(99, 75 + Math.round(zipPercent * 0.24)));
              }
          );
          const url = URL.createObjectURL(content);
          const link = document.createElement('a');
          link.href = url;
          link.setAttribute('download', exportedFileName);
          setStatusMessage('ZIP 다운로드 시작 중...');
          setExportProgress(99);
          setExportStage('downloading');
          setLastExportFileName(exportedFileName);
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          setTimeout(() => {
              URL.revokeObjectURL(url);
          }, 10000);
      } else if (singleImageBlob) {
          const safeTeamName = getEntryTeamLabel(entries[0], teams).replace(/[\/\\?%*:|"<>]/g, '_');
          exportedFileName = `TBM_일지_${entries[0].date}_${safeTeamName}.png`;
          const link = document.createElement('a');
          const url = URL.createObjectURL(singleImageBlob);
          link.href = url;
          link.setAttribute('download', exportedFileName);
                    setStatusMessage('이미지 다운로드 시작 중...');
                    setExportProgress(99);
          setExportStage('downloading');
          setLastExportFileName(exportedFileName);
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          setTimeout(() => {
              URL.revokeObjectURL(url);
          }, 10000);
      }

                        setExportProgress(100);
                        setStatusMessage('내보내기 완료');
                        await new Promise(resolve => setTimeout(resolve, 900));

            const compactCount = pageDensityLog.filter((density) => density === 'compact').length;
            const standardCount = pageDensityLog.length - compactCount;
            const elapsedSec = Math.max(1, Math.round((Date.now() - exportStartedAt) / 1000));
            announceStatus(`${mode === 'PDF' ? 'PDF' : '이미지'} 내보내기 완료 · 파일명: ${exportedFileName || '생성 완료'} · 표준 ${standardCount}페이지, 압축 ${compactCount}페이지 · 소요 ${elapsedSec}초`, 'success');

    } catch (error) {
        console.error("Generation failed", error);
            const elapsedSec = Math.max(1, Math.round((Date.now() - exportStartedAt) / 1000));
            announceStatus(`${mode === 'PDF' ? 'PDF 생성' : '이미지 변환'} 중 오류가 발생했습니다. 메모리 부족 또는 이미지 처리 실패일 수 있습니다. ${mode === 'PDF' ? '다건이면 이미지 ZIP으로 먼저 저장한 뒤 PDF 재시도를 권장합니다. ' : '다건이면 선택 건수를 줄여 다시 시도해 보세요. '}브라우저 다운로드 차단 여부도 함께 확인하세요. (소요 ${elapsedSec}초)`, 'error');
    } finally {
      if (document.body.contains(ghostContainer)) {
          document.body.removeChild(ghostContainer);
      }
      window.scrollTo(0, originalScrollPos);
      setGeneratingMode(null);
      setStatusMessage("");
            setExportProgress(null);
            setExportStage(null);
    }
  };

  const handleSignatureUpload = (role: 'safety' | 'site') => (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      // [FIX] 파일 타입 및 크기 검증 — 서명 이미지에만 허용
      if (!file.type.startsWith('image/')) {
          announceStatus('이미지 파일만 업로드 가능합니다.', 'error');
          e.target.value = '';
          return;
      }
      if (file.size > 2 * 1024 * 1024) {
          announceStatus('서명 이미지는 최대 2MB까지 가능합니다.', 'error');
          e.target.value = '';
          return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          onUpdateSignature(role, event.target.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const SafeImage = ({ src, className }: { src: string, className: string }) => {
      const [error, setError] = useState(false);
      if (error || !src) {
          return (
              <div className={`flex flex-col items-center justify-center bg-slate-50 text-slate-400 ${className}`}>
                  <ImageOff size={24} />
                  <span className="text-[10px] mt-1 font-medium">이미지 없음</span>
              </div>
          );
      }
      return <img src={src} className={className} onError={() => setError(true)} />;
  };

  return createPortal(
        <div ref={reportDialogRef} role="dialog" aria-modal="true" aria-labelledby="report-view-title" aria-describedby="report-view-description" onKeyDown={handleReportDialogKeyDown} className="fixed inset-0 bg-slate-900/95 z-50 overflow-y-auto flex flex-col items-center report-container-wrapper">
            <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
                {generatingMode
                    ? (statusMessage || (generatingMode === 'PDF' ? 'PDF를 생성 중입니다.' : '이미지를 생성 중입니다.'))
                    : (announceMessage || '')}
            </p>
            {announceMessage && generatingMode === null && (
                <div className="sticky top-2 z-[60] w-full max-w-[794px] px-4 no-print-ui">
                    <div
                        className={`rounded-xl border px-4 py-3 shadow-lg backdrop-blur-sm ${announceTone === 'success' ? 'border-emerald-400/60 bg-emerald-500/15 text-emerald-50' : announceTone === 'error' ? 'border-rose-400/60 bg-rose-500/15 text-rose-50' : 'border-sky-400/60 bg-sky-500/15 text-sky-50'}`}
                        role="status"
                        aria-live="polite"
                    >
                        <div className="flex items-start gap-2">
                            <span className="mt-0.5 text-sm">{announceTone === 'success' ? '✅' : announceTone === 'error' ? '⚠️' : 'ℹ️'}</span>
                            <div className="min-w-0">
                                <p className="text-xs md:text-sm font-bold">
                                    {announceTone === 'success' ? '내보내기 완료' : announceTone === 'error' ? '작업 확인 필요' : '안내'}
                                </p>
                                <p className="text-[11px] md:text-xs opacity-95 break-keep">{announceMessage}</p>
                                {announceTone === 'success' && lastExportFileName && (
                                    <>
                                        <p className="mt-1 text-[10px] md:text-[11px] font-mono text-emerald-100/90 break-all">
                                            파일: {lastExportFileName}
                                        </p>
                                        <p className="mt-1 text-[10px] md:text-[11px] text-emerald-100/80 break-keep">
                                            이 안내는 잠시 후 자동으로 사라집니다.
                                        </p>
                                        <p className="mt-1 text-[10px] md:text-[11px] text-emerald-100/80 break-keep">
                                            {getDownloadLocationHint()}
                                        </p>
                                        <p className="mt-1 text-[10px] md:text-[11px] text-emerald-100/75 break-keep">
                                            {getDownloadBlockedHint()}
                                        </p>
                                        {lastExportMode && (
                                            <button
                                                type="button"
                                                onClick={handleRetryLastExport}
                                                className="mt-2 inline-flex items-center rounded-lg border border-emerald-300/40 bg-emerald-400/10 px-2.5 py-1.5 text-[10px] md:text-[11px] font-bold text-emerald-50 hover:bg-emerald-400/20 transition-colors"
                                            >
                                                {lastExportMode === 'PDF' ? 'PDF 다시 다운로드' : '이미지 다시 다운로드'}
                                            </button>
                                        )}
                                    </>
                                )}
                                {announceTone === 'error' && lastExportMode && (
                                    <p className="mt-1 text-[10px] md:text-[11px] text-rose-100/80 break-keep">
                                        문제가 계속되면 {lastExportMode === 'PDF' ? 'PDF' : '이미지 ZIP'} 내보내기를 다시 시도하거나 브라우저 다운로드 차단 설정을 확인하세요.
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
      <style>{`
        .report-page {
            width: 794px;
            height: 1123px;
            background: white;
            margin: 0 auto 40px auto;
            position: relative;
                        font-family: -apple-system, BlinkMacSystemFont, system-ui, Roboto, "Helvetica Neue", "Segoe UI", "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", sans-serif;
            color: black;
            box-sizing: border-box;
            border: 2px solid black; 
            display: block;
            transform-origin: top center; 
            overflow: hidden;
            font-smooth: always;
        }
        
        /* Rigid Layout Grid */
        .row { display: flex; width: 100%; border-bottom: 1px solid black; box-sizing: border-box; flex-shrink: 0; }
        .row.last { border-bottom: none; }
        .col { border-right: 1px solid black; height: 100%; box-sizing: border-box; position: relative; flex-shrink: 0; overflow: hidden; }
        .col.last { border-right: none; }
        
        /* Fixed Heights */
        .h-header { height: 130px; }
        .h-info { height: 78px; }
        .h-body { height: 875px; display: flex; flex-direction: column; } 
        .h-footer { height: 36px; border-top: 1px solid black; display: flex; align-items: center; }
        
        /* Section Headers */
        .section-header {
            background-color: #f3f4f6; 
            border-bottom: 1px solid black;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 11px;
            font-weight: 800;
            height: 30px;
            color: black;
            flex-shrink: 0;
        }
        
        .body-row-images { height: 340px; border-bottom: 1px solid black; display: flex; width: 100%; flex-shrink: 0; }
        .body-row-text { flex: 1; display: flex; width: 100%; min-height: 0; }
        .body-row-text,
        .body-row-text * {
            color: #111827;
            letter-spacing: -0.01em;
        }
        .report-pane-block { padding: 10px; }
        .report-pane-title {
            font-size: 11px;
            font-weight: 800;
            letter-spacing: -0.01em;
            line-height: 1.25;
        }
        .report-pane-subtitle {
            font-size: 10px;
            font-weight: 800;
            letter-spacing: -0.01em;
            line-height: 1.25;
        }
        .body-pane-header {
            height: 30px;
            min-height: 30px;
            max-height: 30px;
            padding: 0 8px;
            line-height: 1;
            align-items: center;
            justify-content: center;
        }
        .report-pane-card {
            border-width: 1px;
            border-radius: 6px;
        }
        .report-pane-inner-pad {
            padding: 8px;
        }
        .body-row-text .section-header {
            color: #111827;
            letter-spacing: 0;
        }
        .ai-score-header {
            display: grid;
            grid-template-columns: minmax(0, 1fr) auto;
            align-items: center;
            min-height: 24px;
            column-gap: 8px;
        }
        .ai-score-title-wrap {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            min-width: 0;
        }
        .ai-score-icon {
            width: 14px;
            height: 14px;
            display: block;
            flex-shrink: 0;
        }
        .ai-score-title {
            display: block;
            font-size: 11px;
            line-height: 1.2;
            white-space: nowrap;
        }
        .ai-score-title-wrap svg,
        .ai-score-title-wrap img {
            width: 14px;
            height: 14px;
            display: block;
            flex-shrink: 0;
        }
        .ai-score-badge {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-height: 20px;
            line-height: 1;
            padding-top: 0;
            padding-bottom: 0;
            flex-shrink: 0;
        }
        .ai-metric-grid {
            display: flex;
            flex-wrap: wrap;
            justify-content: space-between;
            row-gap: 6px;
            column-gap: 12px;
        }
        .ai-metric-row {
            display: flex;
            flex-direction: row;
            align-items: center;
            width: calc(50% - 6px);
            gap: 6px;
            min-height: 14px;
            line-height: 1.28;
        }
        .ai-metric-label {
            width: 66px;
            flex-shrink: 0;
            display: block;
            line-height: 1.28;
            white-space: nowrap;
            overflow: hidden;
        }
        .ai-metric-bar {
            flex: 1;
            height: 6px;
            margin-left: 0;
            margin-right: 0;
        }
        .ai-metric-score {
            width: 24px;
            flex-shrink: 0;
            text-align: right;
            display: block;
            line-height: 1.28;
            white-space: nowrap;
            overflow: hidden;
        }
        .ai-eval-grid {
            display: flex;
            flex-wrap: wrap;
            gap: 4px;
        }
        .ai-summary-block {
            flex-shrink: 0;
        }
        .ai-eval-card {
            width: calc(50% - 2px);
            min-height: 38px;
        }
        .ai-eval-text {
            display: block;
            line-height: 1.25;
            word-break: keep-all;
            overflow-wrap: anywhere;
            overflow: hidden;
        }
        
        /* Text Handling */
          .text-wrap-fix {
              white-space: pre-wrap;
              word-break: break-word;
              overflow-wrap: anywhere;
              line-height: 1.35;
          }
        
        /* Helpers */
        .flex-center { display: flex; align-items: center; justify-content: center; text-align: center; }
        
        /* Table Reset for Internal Grids (Risk/Feedback) */
        table { border-collapse: collapse; width: 100%; table-layout: fixed; }
        td { vertical-align: top; padding: 2px; border-color: #cbd5e1; line-height: 1.3; }
        .dense-export-text { font-size: 9.4px; line-height: 1.25; }
        
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
            transform: none !important;
            border: 2px solid black !important;
          }
          .no-print-ui { display: none !important; }
        }
      `}</style>
      
      {/* Toolbar */}
      <div className="sticky top-0 z-50 w-full bg-slate-800 text-white p-4 shadow-lg flex justify-between items-center max-w-[794px] rounded-b-xl mb-4 md:mb-8 no-print-ui">
        <div>
                    <h2 id="report-view-title" className="font-bold text-base md:text-lg">🖨️ 보고서 센터 (인쇄 모드)</h2>
                    <p id="report-view-description" className="text-[10px] md:text-xs text-slate-400">
            {entries.length}개의 TBM 일지가 준비되었습니다.
          </p>
                    {generatingMode !== null && exportProgress !== null && (
                        <div className="mt-3 w-full max-w-[320px]">
                            <div className="flex items-center justify-between text-[10px] text-slate-200 font-semibold mb-1">
                                <span>{statusMessage || (generatingMode === 'PDF' ? 'PDF 생성 준비 중...' : '이미지 내보내기 준비 중...')}</span>
                                <span>{exportProgress}%</span>
                            </div>
                            <div
                                className="h-2 w-full overflow-hidden rounded-full bg-slate-600/80"
                                role="progressbar"
                                aria-valuemin={0}
                                aria-valuemax={100}
                                aria-valuenow={exportProgress}
                                aria-label={generatingMode === 'PDF' ? 'PDF 생성 진행률' : '이미지 ZIP 생성 진행률'}
                            >
                                <div
                                    className={`h-full rounded-full transition-all duration-300 ${generatingMode === 'PDF' ? 'bg-green-400' : 'bg-indigo-400'}`}
                                    style={{ width: `${exportProgress}%` }}
                                />
                            </div>
                        </div>
                    )}
                    <div className="mt-2 flex items-center gap-2">
                        <span className="text-[10px] text-slate-300 font-semibold">내보내기 밀도</span>
                        <div className="inline-flex rounded border border-slate-500 overflow-hidden">
                            <button
                                type="button"
                                onClick={() => setExportDensity('auto')}
                                disabled={generatingMode !== null}
                                className={`px-2.5 py-1 text-[10px] font-bold transition-colors ${exportDensity === 'auto' ? 'bg-emerald-200 text-emerald-900' : 'bg-slate-700 text-slate-200'} ${generatingMode !== null ? 'opacity-60 cursor-not-allowed' : ''}`}
                            >
                                자동
                            </button>
                            <button
                                type="button"
                                onClick={() => setExportDensity('standard')}
                                disabled={generatingMode !== null}
                                className={`px-2.5 py-1 text-[10px] font-bold transition-colors border-l border-slate-500 ${exportDensity === 'standard' ? 'bg-slate-100 text-slate-900' : 'bg-slate-700 text-slate-200'} ${generatingMode !== null ? 'opacity-60 cursor-not-allowed' : ''}`}
                            >
                                표준
                            </button>
                            <button
                                type="button"
                                onClick={() => setExportDensity('compact')}
                                disabled={generatingMode !== null}
                                className={`px-2.5 py-1 text-[10px] font-bold transition-colors border-l border-slate-500 ${exportDensity === 'compact' ? 'bg-indigo-200 text-indigo-900' : 'bg-slate-700 text-slate-200'} ${generatingMode !== null ? 'opacity-60 cursor-not-allowed' : ''}`}
                            >
                                압축
                            </button>
                        </div>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                        <span className="text-[10px] text-slate-300 font-semibold">렌더 프로필</span>
                        <div className="inline-flex rounded border border-slate-500 overflow-hidden">
                            <button
                                type="button"
                                onClick={() => setRenderProfile('TEXT')}
                                disabled={generatingMode !== null}
                                className={`px-2.5 py-1 text-[10px] font-bold transition-colors ${renderProfile === 'TEXT' ? 'bg-indigo-200 text-indigo-900' : 'bg-slate-700 text-slate-200'} ${generatingMode !== null ? 'opacity-60 cursor-not-allowed' : ''}`}
                            >
                                A(텍스트)
                            </button>
                            <button
                                type="button"
                                onClick={() => setRenderProfile('COMPAT')}
                                disabled={generatingMode !== null}
                                className={`px-2.5 py-1 text-[10px] font-bold transition-colors border-l border-slate-500 ${renderProfile === 'COMPAT' ? 'bg-emerald-200 text-emerald-900' : 'bg-slate-700 text-slate-200'} ${generatingMode !== null ? 'opacity-60 cursor-not-allowed' : ''}`}
                            >
                                B(호환)
                            </button>
                        </div>
                    </div>
        </div>
        <div className="flex gap-2">
          {/* Image Download Button */}
          <button 
            onClick={() => processPages('IMAGE')}
            disabled={generatingMode !== null}
            className={`flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 px-3 md:px-4 py-2 rounded font-bold transition-colors text-xs md:text-sm ${generatingMode !== null ? 'opacity-50 cursor-not-allowed' : ''}`}
                        title={lastExportFileName && lastExportFileName.endsWith('.zip')
                                ? `고화질 이미지로 저장 (JPG) · 최근 파일: ${lastExportFileName}`
                                : '고화질 이미지로 저장 (JPG)'}
          >
            {generatingMode === 'IMAGE' ? <Loader2 size={16} className="animate-spin" /> : <ImageIcon size={16} />}
                        <span className="hidden md:inline">{generatingMode === 'IMAGE' ? getExportStageLabel('IMAGE', exportStage) : (entries.length > 1 ? '이미지 ZIP' : '이미지 저장')}</span>
          </button>

          {/* PDF Download Button */}
          <button 
            onClick={() => processPages('PDF')}
            disabled={generatingMode !== null}
            className={`flex items-center gap-2 bg-green-600 hover:bg-green-500 px-3 md:px-4 py-2 rounded font-bold transition-colors text-xs md:text-sm ${generatingMode !== null ? 'opacity-50 cursor-not-allowed' : ''}`}
                        title={lastExportFileName && lastExportFileName.endsWith('.pdf')
                                ? `PDF 다운로드 · 최근 파일: ${lastExportFileName}`
                                : 'PDF 다운로드'}
          >
            {generatingMode === 'PDF' ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                        <span className="hidden md:inline">{generatingMode === 'PDF' ? getExportStageLabel('PDF', exportStage) : 'PDF 다운로드'}</span>
          </button>

          <button 
                        ref={reportCloseButtonRef}
                        onClick={handleCloseRequest}
                                                disabled={generatingMode !== null}
                        aria-label="보고서 센터 닫기"
                        className={`flex items-center gap-2 bg-slate-700 px-3 md:px-4 py-2 rounded transition-colors text-xs md:text-sm ${generatingMode !== null ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-600'}`}
          >
            <X size={16} /> 닫기
          </button>
        </div>
      </div>

                        {generatingMode !== null && (
                                <div className="fixed inset-0 z-[55] bg-slate-950/20 pointer-events-none no-print-ui" aria-hidden="true">
                                        <div className="absolute inset-x-0 top-24 mx-auto hidden md:flex w-full max-w-[794px] justify-center px-4">
                                                <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-slate-900/85 px-4 py-2 text-xs font-bold text-white shadow-xl backdrop-blur">
                                                        <Loader2 size={14} className="animate-spin" />
                                                        <span>{generatingMode === 'PDF' ? 'PDF 내보내기 작업 중입니다. 창을 닫지 마세요.' : '이미지 ZIP 내보내기 작업 중입니다. 창을 닫지 마세요.'}</span>
                                                </div>
                                        </div>
                                </div>
                        )}

            {generatingMode !== null && exportProgress !== null && (
                <div className="fixed bottom-3 left-3 right-3 z-[70] md:hidden no-print-ui">
                    <div className="rounded-2xl border border-slate-600 bg-slate-900/95 text-white shadow-2xl backdrop-blur px-4 py-3">
                        <div className="flex items-start justify-between gap-3 mb-2">
                            <div className="min-w-0">
                                <p className="text-[11px] font-black tracking-wide text-slate-200">
                                    {generatingMode === 'PDF' ? 'PDF 내보내기 진행 중' : '이미지 ZIP 내보내기 진행 중'}
                                </p>
                                <p className="text-[12px] font-semibold text-white break-keep">
                                    {getExportStageLabel(generatingMode, exportStage)}
                                </p>
                                <p className="text-[10px] text-slate-300 mt-0.5 break-keep">
                                    {statusMessage || (generatingMode === 'PDF' ? 'PDF 파일을 준비하고 있습니다.' : '이미지와 ZIP 파일을 준비하고 있습니다.')}
                                </p>
                            </div>
                            <div className="shrink-0 text-right">
                                <div className="text-lg font-black leading-none">{exportProgress}%</div>
                                <div className="text-[10px] text-slate-400 mt-1">완료율</div>
                            </div>
                        </div>
                        <div
                            className="h-2.5 w-full overflow-hidden rounded-full bg-slate-700"
                            role="progressbar"
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={exportProgress}
                            aria-label={generatingMode === 'PDF' ? 'PDF 생성 진행률' : '이미지 ZIP 생성 진행률'}
                        >
                            <div
                                className={`h-full rounded-full transition-all duration-300 ${generatingMode === 'PDF' ? 'bg-green-400' : 'bg-indigo-400'}`}
                                style={{ width: `${exportProgress}%` }}
                            />
                        </div>
                    </div>
                </div>
            )}

      <div className="pb-20 print:pb-0 w-full flex flex-col items-center">
        {entries.map((entry, index) => {
            const safeDate = entry.date ? entry.date.replace(/-/g,'') : '00000000';
            const safeTime = entry.time || '00:00';
            const safeTeamName = getEntryTeamLabel(entry, teams);
            
            const safeLeader = entry.leaderName || '미지정';
            const safeCount = entry.attendeesCount || 0;

            const rubric = entry.videoAnalysis?.rubric || {
                logQuality: 0, focus: 0, voice: 0, ppe: 0, deductions: []
            };
            const hasAutoEvaluationWarning = (rubric.deductions || []).some((item) => {
                const text = String(item || '');
                return text.includes('종합 평가문안 자동검사 경고') || text.includes('나열형 평가문안 자동 보정');
            });

            const isVerifiedVideoAnalysis = entry.videoAnalysis?.analysisSource === 'VIDEO'
                && entry.videoAnalysis.verificationStatus === 'VERIFIED';
            const isManualEvaluation = entry.videoAnalysis?.analysisSource === 'MANUAL';
            const hasVideoEvidence = !!(entry.tbmVideoUrl || entry.tbmVideoFileName || isVerifiedVideoAnalysis);
            const displayFileName = entry.tbmVideoFileName || (isVerifiedVideoAnalysis ? '분석된 동영상 데이터.mp4' : '파일명 없음');
            const safeLocation = formatLocationSummary(entry);

            return (
              <div 
                key={entry.id || index} 
                className="report-page group"
                style={{ transform: `scale(${scale})`, marginBottom: `${40 * scale}px` }} 
              >
                {/* [NEW] Digital Integrity Seal (Legal Defense) */}
                <div className="integrity-seal absolute top-2 right-2 z-20 pointer-events-none opacity-50 rotate-0 mix-blend-multiply">
                    <div className="seal-ring border-2 border-red-600 rounded-full w-14 h-14 flex items-center justify-center p-0.5">
                        <div className="seal-inner border border-red-600 rounded-full w-full h-full flex flex-col items-center justify-center text-red-600 text-center leading-none">
                            <ShieldCheck size={12} strokeWidth={2.5}/>
                            <span className="text-[6px] font-black uppercase mt-0.5">전자<br/>무결성</span>
                            <span className="text-[7px] font-black mt-0.5">검증 완료</span>
                            <span className="text-[4px] mt-0.5 font-mono tracking-tight">PSI HRI</span>
                        </div>
                    </div>
                </div>

                {/* 1. Header Row */}
                <div className="row h-header">
                    <div className="col" style={{width: '65%'}}>
                        <div className="p-4 flex flex-col justify-center h-full">
                            <div className="text-[10px] font-bold text-slate-500 mb-1">{siteName} 현장</div>
                            <h1 className="text-3xl font-black tracking-tighter mb-2 text-black leading-none">일일 TBM 및<br/>위험성평가 점검표</h1>
                             <div className="flex items-center text-[10px] font-bold gap-3 text-slate-700 mt-1">
                                 <span>일자: {entry.date} ({safeTime})</span>
                                 <span className="w-px h-3 bg-slate-300"></span>
                                 <span>작성: {safeTeamName}</span>
                             </div>
                        </div>
                    </div>
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
                    <div className="w-full h-full flex flex-col">
                        <div className="row" style={{ height: '39px' }}>
                            <div className="col bg-slate-50 flex-center font-extrabold text-black" style={{width: '12%'}}>작업 팀명</div>
                            <div className="col flex-center font-bold text-black" style={{width: '23%'}}>{safeTeamName}</div>
                            <div className="col bg-slate-50 flex-center font-extrabold text-black" style={{width: '10%'}}>팀장</div>
                            <div className="col flex-center font-bold text-black" style={{width: '20%'}}>{safeLeader}</div>
                            <div className="col bg-slate-50 flex-center font-extrabold text-black" style={{width: '15%'}}>금일 출력</div>
                            <div className="col last flex-center font-bold text-black" style={{width: '20%'}}>{safeCount}명</div>
                        </div>
                        <div className="row last" style={{ height: '39px' }}>
                            <div className="col bg-slate-50 flex-center font-extrabold text-black" style={{width: '12%'}}>작업 위치</div>
                            <div className="col px-3 flex items-center font-bold text-black" style={{width: '88%'}}>
                                 <span className="text-[11px] leading-snug break-keep">{safeLocation || '현장 작업 구역'}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 3. Main Body */}
                <div className="h-body">
                    {/* 3-A. Images Row */}
                    <div className="body-row-images">
                        <div className="col" style={{width: '50%'}}>
                            <div className="section-header">1. TBM 일지 원본 (종합본)</div>
                            <div className="h-[calc(100%-30px)] p-2 flex items-center justify-center">
                                <SafeImage src={entry.originalLogImageUrl || ''} className="max-w-full max-h-full object-contain" />
                            </div>
                        </div>
                        <div className="col last" style={{width: '50%'}}>
                            <div className="section-header">
                                2. {hasVideoEvidence ? 'TBM 실시 사진 및 동영상' : 'TBM 실시 사진 및 현장 점검 기록'}
                            </div>
                            <div className="h-[calc(100%-30px)] p-2 flex flex-col bg-white">
                                 <div className="flex-1 w-full flex items-center justify-center overflow-hidden border border-slate-200 bg-slate-50 relative rounded-sm mb-1">
                                     {entry.tbmPhotoUrl ? (
                                        <SafeImage src={entry.tbmPhotoUrl} className="max-w-full max-h-full object-contain" />
                                     ) : (
                                        <span className="text-xs text-slate-300">이미지 없음</span>
                                     )}
                                 </div>

                                 {hasVideoEvidence ? (
                                     <div className="w-full bg-white border border-red-500 rounded p-1.5 flex items-center justify-between shrink-0 h-8 shadow-[0_0_0_1px_rgba(239,68,68,0.2)]">
                                         <div className="flex items-center gap-1.5">
                                             <div className="relative flex h-3 w-3 shrink-0 items-center justify-center">
                                               <span className="absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75 animate-ping no-print"></span>
                                               <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-600"></span>
                                             </div>
                                             <span className="text-[10px] font-black text-red-600 tracking-tight">동영상 기록물 첨부됨</span>
                                         </div>
                                         <div className="flex items-center gap-1 max-w-[60%]">
                                            <span className="text-[9px] font-bold text-slate-400">파일명:</span>
                                            <span className="text-[9px] font-mono text-slate-700 truncate font-bold">
                                                {displayFileName}
                                            </span>
                                         </div>
                                     </div>
                                 ) : (
                                     <div className="w-full bg-emerald-50/90 border border-emerald-300 rounded px-2 py-1 flex items-center justify-between shrink-0 h-8">
                                         <div className="flex items-center gap-1.5">
                                             <CheckCircle2 size={13} className="text-emerald-600 shrink-0"/>
                                             <span className="text-[10px] font-extrabold text-emerald-900 tracking-tight">
                                                 {entry.sessionType === 'AFTERNOON' || (entry.time && Number(entry.time.split(':')[0]) >= 12)
                                                     ? '오후 TBM 현장 사진 및 서면 점검 완료'
                                                     : '현장 사진 및 서면 점검 기록 완료'}
                                             </span>
                                         </div>
                                         <span className="text-[9px] font-bold text-emerald-700 bg-emerald-100/90 border border-emerald-200 px-1.5 py-0.5 rounded">
                                             점검 완료
                                         </span>
                                     </div>
                                 )}
                            </div>
                        </div>
                    </div>
                    
                    {/* 3-B. Text Content Row */}
                    <div className="body-row-text">
                        <div className="col left-text-col flex flex-col" style={{width: '50%'}}>
                            <div className="section-header body-pane-header">3. 금일 작업·설치 내용 및 위험요인</div>
                            <div className="left-content-stack report-pane-block flex-1 p-3 flex flex-col gap-3 overflow-hidden">
                                <div>
                                    <div className="report-pane-title text-[11px] font-extrabold text-slate-800 mb-1 border-b border-slate-200 inline-block pb-0.5">[작업 내용]</div>
                                    <div className="text-[11px] leading-relaxed text-wrap-fix text-black min-h-[50px]">
                                        {entry.workDescription || "내용 없음"}
                                    </div>
                                    
                                     {safeLocation ? (
                                         <div className="report-pane-card mt-2 rounded border border-sky-200 bg-sky-50 px-2 py-1.5 min-h-0">
                                             <div className="report-pane-subtitle text-[10px] font-extrabold text-sky-700 mb-0.5">[작업 위치]</div>
                                             <div className="text-[10px] leading-snug text-black break-keep">
                                                 {safeLocation}
                                             </div>
                                         </div>
                                     ) : null}

                                     {(entry.todayInstalledItems?.trim() || entry.managerRequiredInstallItems?.trim()) ? (
                                         <div className="mt-2 space-y-2">
                                             {entry.todayInstalledItems?.trim() ? (
                                                 <div className="report-pane-card rounded border border-amber-200 bg-amber-50 px-2 py-1.5 min-h-0">
                                                     <div className="report-pane-subtitle text-[10px] font-extrabold text-amber-700 mb-0.5">[금일 설치한 사항]</div>
                                                     <div className="text-[10px] leading-snug text-black break-keep">
                                                         {entry.todayInstalledItems}
                                                     </div>
                                                 </div>
                                             ) : null}
                                             {entry.managerRequiredInstallItems?.trim() ? (
                                                 <div className="report-pane-card rounded border border-violet-200 bg-violet-50 px-2 py-1.5 min-h-0">
                                                     <div className="report-pane-subtitle text-[10px] font-extrabold text-violet-700 mb-0.5">[관리자 추가 설치 필요 항목]</div>
                                                     <div className="text-[10px] leading-snug text-black break-keep">
                                                         {entry.managerRequiredInstallItems}
                                                     </div>
                                                 </div>
                                             ) : null}
                                         </div>
                                     ) : null}

                                     {entry.linkedRiskAssessmentLabel && (
                                         <div className="report-pane-card mt-2 rounded border border-indigo-200 bg-indigo-50 px-2 py-1.5">
                                             <div className="flex items-center gap-1 flex-wrap">
                                                 <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${entry.linkedRiskAssessmentMatchedByMonth ? 'bg-emerald-600 text-white' : 'bg-indigo-600 text-white'}`}>
                                                     {entry.linkedRiskAssessmentMatchedByMonth ? '동일월 위험성평가 연계' : '위험성평가 연계'}
                                                 </span>
                                                 <span className="text-[10px] font-bold text-slate-700">{entry.linkedRiskAssessmentLabel}</span>
                                             </div>
                                             <div className="mt-1 text-[9px] text-slate-600 flex items-center gap-2 flex-wrap">
                                                 <span>상위험 {entry.linkedRiskAssessmentHighCount ?? 0}건</span>
                                                 <span>조치메모 {entry.linkedRiskAssessmentActionNoteCount ?? 0}건</span>
                                             </div>
                                         </div>
                                     )}
                                 </div>
                                 <div className="report-pane-card risk-focus-block flex-1 border border-orange-300 rounded flex flex-col min-h-0 bg-white">
                                     <div className="bg-orange-50 p-1.5 text-center text-[10px] font-bold text-orange-700 border-b border-orange-200 shrink-0">⚠ 중점 위험 관리 사항</div>
                                     <div className="report-pane-inner-pad p-2 overflow-hidden flex flex-col">
                                         {(() => {
                                             const displayRiskFactors = (entry.riskFactors && entry.riskFactors.length > 0)
                                                 ? entry.riskFactors.slice(0, 5)
                                                 : [
                                                     { risk: '작업 전 개인 보호구(안전모·안전화) 착용 상태 상호 점검', measure: '작업 구역 내 개인 보호구 100% 착용 및 단속 실시' },
                                                     { risk: '작업 구역 내 정리정돈 및 안전 통로 확보', measure: '전도 및 낙하 위험물 사전 제거 및 동선 유도' }
                                                   ];
                                             return (
                                                 <table className="w-full border-collapse">
                                                     <tbody>
                                                         {displayRiskFactors.map((risk, i) => (
                                                             <React.Fragment key={i}>
                                                                 <tr className="border-b border-dashed border-slate-200 last:border-0">
                                                                     <td className="w-9 align-middle badge-cell">
                                                                         <span className="inline-block w-8 text-center bg-red-100 text-red-600 border border-red-200 rounded text-[9px] font-bold py-0.5">위험</span>
                                                                     </td>
                                                                     <td className="align-middle pl-1 text-cell">
                                                                         <span className="risk-line-text text-[10px] text-black leading-snug break-keep block dense-export-text">{risk.risk}</span>
                                                                     </td>
                                                                 </tr>
                                                                 <tr className="border-b border-dashed border-slate-200 last:border-0 mb-1">
                                                                     <td className="w-9 align-middle pb-2 badge-cell">
                                                                         <span className="inline-block w-8 text-center bg-blue-100 text-blue-600 border border-blue-200 rounded text-[9px] font-bold py-0.5">대책</span>
                                                                     </td>
                                                                     <td className="align-middle pl-1 pb-2 text-cell">
                                                                         <span className="risk-line-text text-[10px] text-black leading-snug break-keep block dense-export-text">{risk.measure}</span>
                                                                     </td>
                                                                 </tr>
                                                             </React.Fragment>
                                                         ))}
                                                     </tbody>
                                                 </table>
                                             );
                                         })()}
                                     </div>
                                 </div>
                             </div>
                         </div>
                        
                        <div className="col last right-ai-col flex flex-col" style={{width: '50%'}}>
                                <div className="section-header body-pane-header">
                                    4. {isVerifiedVideoAnalysis ? 'AI 영상 정밀 진단' : isManualEvaluation ? '수기 평가 및 보완' : 'TBM 평가'}
                                </div>
                             <div className="right-pane-stack flex-1 flex flex-col overflow-hidden">
                                <div className="ai-summary-block report-pane-block p-3 border-b border-black bg-slate-50/50">
                                    {entry.videoAnalysis ? (
                                        <div className="flex flex-col gap-2">
                                            {/* Top Score */}
                                            <div className="ai-score-header flex justify-between items-center mb-1">
                                                <div className="ai-score-title-wrap flex items-center gap-1.5">
                                                    <Sparkles size={14} className="ai-score-icon text-violet-600 shrink-0"/>
                                                    <span className="ai-score-title report-pane-title text-[11px] font-black text-black">
                                                        {isVerifiedVideoAnalysis ? 'AI 영상 검증 점수' : isManualEvaluation ? '수기 평가 점수' : '종합 평가 점수'}
                                                    </span>
                                                    {hasAutoEvaluationWarning && (
                                                        <span className="text-[9px] font-black px-1.5 py-0.5 rounded border border-amber-200 bg-amber-50 text-amber-700">
                                                            문안 보정 적용
                                                        </span>
                                                    )}
                                                </div>
                                                <span className={`ai-score-badge text-sm font-black border px-2 py-0.5 rounded shadow-sm ${entry.videoAnalysis.score >= 80 ? 'bg-violet-50 text-violet-700 border-violet-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                                                    {entry.videoAnalysis.score}점
                                                </span>
                                            </div>

                                            {/* Detailed Evaluation Bars (Gauges) */}
                                            <div className="ai-metric-grid flex flex-wrap justify-between gap-y-1 mb-1">
                                                {[
                                                    { label: '일지 충실도', score: rubric.logQuality || 0, max: 30, color: 'bg-indigo-500', bg: 'bg-indigo-50' },
                                                    { label: '작업자 집중도', score: rubric.focus || 0, max: 30, color: 'bg-emerald-500', bg: 'bg-emerald-50' },
                                                    { label: '전파 명확성', score: rubric.voice || 0, max: 20, color: 'bg-amber-500', bg: 'bg-amber-50' },
                                                    { label: '보호구 상태', score: rubric.ppe || 0, max: 20, color: 'bg-rose-500', bg: 'bg-rose-50' },
                                                ].map((metric, midx) => (
                                                    <div key={midx} className="ai-metric-row flex items-center text-[10px] gap-1.5 w-[calc(50%-6px)]">
                                                        <span className="ai-metric-label font-bold text-slate-500 w-[66px] shrink-0 whitespace-nowrap">{metric.label}</span>
                                                        <div className={`ai-metric-bar flex-1 h-[6px] rounded-full overflow-hidden ${metric.bg}`}>
                                                            <div 
                                                                className={`h-full rounded-full ${metric.color}`} 
                                                                style={{ width: `${(metric.score / metric.max) * 100}%` }}
                                                            ></div>
                                                        </div>
                                                        <span className="ai-metric-score w-[24px] text-right font-mono font-bold text-black shrink-0 whitespace-nowrap">{metric.score}</span>
                                                    </div>
                                                ))}
                                            </div>

                                            {/* [NEW] 4-Point Text Evaluations */}
                                            {(entry.videoAnalysis.evalLog || entry.videoAnalysis.evalAttendance || entry.videoAnalysis.evalFocus || entry.videoAnalysis.evalLeader) && (
                                                <div className="ai-eval-grid grid grid-cols-2 gap-1 mb-1 text-[9px]">
                                                    {[
                                                        { label: '일지 작성', value: entry.videoAnalysis.evalLog },
                                                        { label: '참석/참여도', value: entry.videoAnalysis.evalAttendance },
                                                        { label: '작업자 집중', value: entry.videoAnalysis.evalFocus },
                                                        { label: '팀장 리딩', value: entry.videoAnalysis.evalLeader },
                                                    ].filter(f => !!f.value).map((f, i) => (
                                                        <div key={i} className="ai-eval-card report-pane-card bg-white border border-slate-100 rounded px-1.5 py-1 overflow-hidden">
                                                            <span className="font-black text-indigo-700 block mb-0.5">{f.label}</span>
                                                            <span className="text-slate-700 leading-tight line-clamp-2 break-keep ai-eval-text dense-export-text">{f.value}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            {/* [NEW] Leader Coaching (Reading to Leading) */}
                                            {entry.videoAnalysis.leaderCoaching && (
                                                <div className="report-pane-card bg-indigo-50 border border-indigo-200 rounded p-2 mb-1">
                                                    <div className="flex items-center gap-1 mb-0.5">
                                                        <span className="report-pane-subtitle text-[9px] font-black text-indigo-700 uppercase">현장 리더 실천 항목</span>
                                                    </div>
                                                    <p className="text-[10px] font-bold text-slate-800 leading-snug">
                                                        "{entry.videoAnalysis.leaderCoaching.actionItem}"
                                                    </p>
                                                </div>
                                            )}

                                            <div className="report-pane-card overall-opinion-text text-[10px] text-slate-700 font-medium leading-relaxed bg-white p-2 rounded border border-slate-200 text-wrap-fix italic border-l-2 border-l-violet-400 mt-1">
                                                <span className="report-pane-subtitle block text-[9px] font-bold text-violet-600 mb-0.5">종합 의견</span>
                                                "{entry.videoAnalysis.evaluation}"
                                            </div>
                                            {(() => {
                                                const autoEvalWarnings = (rubric.deductions || []).filter((item) => {
                                                    const text = String(item || '');
                                                    return text.includes('종합 평가문안 자동검사 경고') || text.includes('나열형 평가문안 자동 보정');
                                                });
                                                if (autoEvalWarnings.length === 0) return null;
                                                const warningSummary = Array.from(new Set(autoEvalWarnings.map((item) => {
                                                    const raw = String(item || '');
                                                    const cleaned = raw.replace(/^종합 평가문안 자동검사 경고:\s*/, '').trim();
                                                    if (raw.includes('나열형 평가문안 자동 보정') || cleaned.includes('나열형 패턴 포함')) {
                                                        return '항목 나열형 문장 패턴 보정 적용';
                                                    }
                                                    if (cleaned.includes('분량 부족')) {
                                                        return '종합 의견 길이 보완 필요';
                                                    }
                                                    if (cleaned.includes('종합판정: 누락')) {
                                                        return '종합판정 문구 보완 필요';
                                                    }
                                                    if (cleaned.includes('확인검증: 누락')) {
                                                        return '확인검증 문구 보완 필요';
                                                    }
                                                    if (cleaned.includes('다음 계획: 누락')) {
                                                        return '다음 계획 문구 보완 필요';
                                                    }
                                                    return cleaned;
                                                }))).join(' / ');
                                                return (
                                                    <div className="report-pane-card text-[9px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                                                        보정 사유: {warningSummary}
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    ) : (
                                        <div className="text-center py-6 text-[10px] text-slate-400">AI 분석 데이터 없음</div>
                                    )}
                                </div>
                                <div className="manager-feedback-block report-pane-block flex-1 p-3 bg-white">
                                    <div className="report-pane-title text-[11px] font-extrabold text-black mb-2 border-b border-slate-200 pb-1 flex items-center gap-1">
                                        <UserCheck size={12}/> 안전관리자 코멘트
                                    </div>
                                    <div className="space-y-1">
                                        <table className="w-full border-collapse">
                                            <tbody>
                                            {(entry.safetyFeedback || []).slice(0,3).map((fb, i) => (
                                                <tr key={i}>
                                                    <td className="w-5 align-middle badge-cell">
                                                        <span className="text-blue-600 text-[10px] font-bold">✔</span>
                                                    </td>
                                                    <td className="align-middle text-cell">
                                                        <span className="feedback-line-text text-[10px] text-black leading-snug break-keep block dense-export-text">{fb}</span>
                                                    </td>
                                                </tr>
                                            ))}
                                            </tbody>
                                        </table>
                                        {(!entry.safetyFeedback || entry.safetyFeedback.length === 0) && <div className="text-center text-[10px] text-slate-300 py-4">코멘트 없음</div>}
                                    </div>
                                </div>
                             </div>
                        </div>
                    </div>
                </div>

                {/* 4. Footer Row */}
                <div className="h-footer flex justify-between items-center px-4 text-[9px] text-slate-500 font-mono">
                     <div>DOC-NO: TBM-{safeDate}-{index+1} (REV.0)</div>
                     <div className="font-bold text-slate-700">(주)휘강건설 스마트 안전관리 시스템</div>
                     <div>{index + 1} / {entries.length} 페이지</div>
                </div>
                
                {/* Edit Controls */}
                <div className="edit-overlay absolute top-0 right-0 p-4 no-print-ui z-[1000] flex gap-2">
                    <button disabled={generatingMode !== null} onClick={() => onEdit(entry)} aria-label={`${safeTeamName} ${entry.date} 기록 수정`} className={`bg-white text-blue-600 p-2 rounded shadow border transition-colors ${generatingMode !== null ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-50 hover:border-blue-300'}`}><Edit3 size={16}/></button>
                    <button disabled={generatingMode !== null} onClick={() => onDelete(String(entry.id))} aria-label={`${safeTeamName} ${entry.date} 기록 삭제`} className={`bg-white text-red-600 p-2 rounded shadow border transition-colors ${generatingMode !== null ? 'opacity-50 cursor-not-allowed' : 'hover:bg-red-50 hover:border-red-300'}`}><Trash2 size={16}/></button>
                </div>
              </div>
            );
        })}
      </div>
    </div>,
    document.body
  );
};
