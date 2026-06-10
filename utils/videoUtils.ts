
/**
 * 동영상 압축 및 오디오 캡처 유틸리티 (Audio + Video)
 *
 * 파일 크기에 따라 자동으로 압축 프로파일을 선택합니다.
 * - 대용량: 더 높은 배속/낮은 해상도로 빠른 코칭 우선
 * - 중소용량: 품질-속도 균형
 */

export interface VideoCompressionProfile {
  label: 'FAST' | 'BALANCED' | 'ULTRA_FAST';
  playbackRate: number;
  targetHeight: number;
  videoBitsPerSecond: number;
  fps: number;
  maxOutputDurationMs: number;
}

export interface VideoCompressionResult {
  blob: Blob;
  mimeType: string;
  profile: VideoCompressionProfile;
  originalSizeMB: number;
  compressedSizeKB: number;
  sourceDurationSec: number;
  analyzedDurationSec: number;
  audioIncluded: boolean;
}

const MAX_ANALYZABLE_DURATION_SEC = 120;
const MAX_ANALYSIS_PLAYBACK_RATE = 4;

const pickCompressionProfile = (fileSizeMB: number): VideoCompressionProfile => {
  if (fileSizeMB >= 200) {
    return {
      label: 'ULTRA_FAST',
      playbackRate: 3.0,
      targetHeight: 144,
      videoBitsPerSecond: 100000,
      fps: 8,
      maxOutputDurationMs: 30000,
    };
  }

  if (fileSizeMB >= 50) {
    return {
      label: 'FAST',
      playbackRate: 2.5,
      targetHeight: 180,
      videoBitsPerSecond: 140000,
      fps: 10,
      maxOutputDurationMs: 30000,
    };
  }

  return {
    label: 'BALANCED',
    playbackRate: 2.0,
    targetHeight: 240,
    videoBitsPerSecond: 220000,
    fps: 12,
    maxOutputDurationMs: 30000,
  };
};

export const compressVideo = (file: File): Promise<VideoCompressionResult> => {
  return new Promise((resolve, reject) => {
    const originalSizeMB = file.size / 1024 / 1024;
    const profile = pickCompressionProfile(originalSizeMB);

    // [FIX] Use document.createElement('video') instead of new Audio() or similar potentially risky constructors
    const video = document.createElement('video');
    const url = URL.createObjectURL(file);
    
    video.src = url;
    video.crossOrigin = "anonymous";
    video.playsInline = true;
    video.muted = false; // Capture audio
    video.volume = 1.0;
    
    // 파일 크기 기반 배속 적용
    video.defaultPlaybackRate = profile.playbackRate;
    video.playbackRate = profile.playbackRate;
    
    if ('preservesPitch' in video) {
        (video as any).preservesPitch = true;
    }
    
    let stream: MediaStream | null = null;
    let mediaRecorder: MediaRecorder | null = null;
    let audioCtx: AudioContext | null = null;
    let source: MediaElementAudioSourceNode | null = null;
    let dest: MediaStreamAudioDestinationNode | null = null;
    let animationId: number;

    const cleanup = () => {
      if (animationId) cancelAnimationFrame(animationId);
      if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
      if (source) try { source.disconnect(); } catch(e) {}
      if (audioCtx && audioCtx.state !== 'closed') audioCtx.close();
      // [FIX] Stop all media stream tracks to release camera/mic resources
      if (stream) {
          try { stream.getTracks().forEach((t) => t.stop()); } catch(e) {}
          stream = null;
      }
      video.pause();
      video.removeAttribute('src');
      video.remove();
      URL.revokeObjectURL(url);
    };

    // 전체 구간 압축은 최대 약 30초가 걸릴 수 있다.
    const timeoutId = setTimeout(() => {
        cleanup();
        reject(new Error("Video processing timeout."));
    }, 50000);

    video.oncanplay = async () => {
      if (stream) return;

      const sourceDurationSec = Number(video.duration);
      if (!Number.isFinite(sourceDurationSec) || sourceDurationSec <= 0) {
        cleanup();
        reject(new Error("영상 길이를 확인할 수 없습니다."));
        return;
      }
      if (sourceDurationSec > MAX_ANALYZABLE_DURATION_SEC) {
        cleanup();
        reject(new Error(`영상이 너무 깁니다. ${MAX_ANALYZABLE_DURATION_SEC}초 이하로 잘라서 다시 업로드해주세요.`));
        return;
      }

      const targetOutputDurationSec = 30;
      const requiredPlaybackRate = sourceDurationSec / targetOutputDurationSec;
      const actualPlaybackRate = Math.min(
        MAX_ANALYSIS_PLAYBACK_RATE,
        Math.max(profile.playbackRate, requiredPlaybackRate)
      );
      const effectiveProfile: VideoCompressionProfile = {
        ...profile,
        playbackRate: actualPlaybackRate,
        maxOutputDurationMs: Math.ceil((sourceDurationSec / actualPlaybackRate + 1) * 1000),
      };

      // 1. Dynamic Downscaling
      const TARGET_HEIGHT = profile.targetHeight;
      let width = video.videoWidth;
      let height = video.videoHeight;
      
      if (height > TARGET_HEIGHT) {
        width = Math.round(width * (TARGET_HEIGHT / height));
        height = TARGET_HEIGHT;
      }
      // Ensure even dimensions for codecs
      if (width % 2 !== 0) width--;
      if (height % 2 !== 0) height--;

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { alpha: false });

      if (!ctx) {
        cleanup();
        reject(new Error("Canvas init failed"));
        return;
      }

      // 2. Audio Capture
      let audioTracks: MediaStreamTrack[] = [];
      let audioIncluded = false;
      try {
         const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
         if (AudioContextClass) {
             try {
                 // [DEFENSIVE] Illegal Constructor protection for AudioContext
                 audioCtx = new AudioContextClass();
                 source = audioCtx.createMediaElementSource(video);
                 dest = audioCtx.createMediaStreamDestination();
                 source.connect(dest);
                 audioTracks = dest.stream.getAudioTracks();
                 audioIncluded = audioTracks.length > 0;
             } catch (e) {
                 console.warn("AudioContext init failed (Illegal Constructor likely):", e);
                 audioCtx = null;
                 audioTracks = []; // Ensure empty array on failure
             }
         }
      } catch (e) {
         console.warn("Audio capture failed, silent video:", e);
      }

      // 3. Low FPS Stream
      const canvasStream = canvas.captureStream(profile.fps);
      // Default to video-only first to ensure we have something
      stream = canvasStream;

      // Try to mix audio if available
      // [CRITICAL FIX] Avoid `new MediaStream([...])` constructor which throws Illegal Constructor in some envs.
      // Instead, use `addTrack` on the existing valid stream instance.
      if (audioTracks.length > 0) {
          try {
              audioTracks.forEach(track => {
                  stream?.addTrack(track);
              });
          } catch (e) {
              console.warn("Audio mixing failed (addTrack error), proceeding with video only.", e);
          }
      }

      // 4. Recorder
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp8') ? 'video/webm;codecs=vp8' 
                     : MediaRecorder.isTypeSupported('video/webm') ? 'video/webm'
                     : 'video/mp4';

      try {
        if (!stream) throw new Error("Stream is null");
        mediaRecorder = new MediaRecorder(stream, {
          mimeType,
          videoBitsPerSecond: profile.videoBitsPerSecond,
        });
      } catch (e) {
        cleanup();
        console.error("MediaRecorder init failed:", e);
        reject(new Error(`MediaRecorder failed: ${(e as any).message}`));
        return;
      }

      const chunks: Blob[] = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };

      mediaRecorder.onstop = () => {
        clearTimeout(timeoutId);
        try {
            const blob = new Blob(chunks, { type: mimeType });
            const compressedSizeKB = blob.size / 1024;
            console.log(`🚀 Video Compressed [${profile.label}] ${originalSizeMB.toFixed(1)}MB -> ${compressedSizeKB.toFixed(1)}KB`);
            resolve({
              blob,
              mimeType,
              profile: effectiveProfile,
              originalSizeMB,
              compressedSizeKB,
              sourceDurationSec,
              analyzedDurationSec: sourceDurationSec,
              audioIncluded,
            });
        } catch (e) {
            reject(e);
        } finally {
            cleanup();
        }
      };

      // 5. Recording Strategy
      const MAX_OUTPUT_DURATION_MS = effectiveProfile.maxOutputDurationMs;
      let startTime = Date.now();

      const draw = () => {
        if (!mediaRecorder || mediaRecorder.state === 'inactive') return;
        
        if (Date.now() - startTime > MAX_OUTPUT_DURATION_MS || video.ended) {
            if (mediaRecorder.state === 'recording') mediaRecorder.stop();
            return;
        }

        try { ctx.drawImage(video, 0, 0, width, height); } catch (err) {}
        animationId = requestAnimationFrame(draw);
      };

      const startRecording = () => {
          if (mediaRecorder && mediaRecorder.state === 'inactive') {
              mediaRecorder.start();
            video.playbackRate = effectiveProfile.playbackRate;
              startTime = Date.now();
              draw();
          }
      };

      try {
          await video.play();
          startRecording();
      } catch (e) {
          try {
              video.muted = true; 
              await video.play();
              startRecording();
          } catch (err) {
              cleanup();
              reject(new Error("Playback failed."));
          }
      }
    };

    video.onerror = () => {
        cleanup();
        reject(new Error("Video corrupt."));
    };
  });
};
