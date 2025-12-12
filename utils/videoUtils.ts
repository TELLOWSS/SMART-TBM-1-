
/**
 * 동영상 압축 유틸리티 (Safe Mode - Video Only)
 * 
 * [오류 해결을 위한 조치]
 * 1. Audio Track 제거: 브라우저에서의 오디오/비디오 믹싱 과정에서 발생하는 컨테이너 손상 방지
 * 2. Bitrate: 150kbps (초경량)
 * 3. Resolution: 360p
 * 4. Duration: 10초
 */

export const compressVideo = (file: File): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(file);
    
    video.src = url;
    video.muted = true; // 무음 처리 (오디오 트랙 사용 안함)
    video.playsInline = true;
    video.crossOrigin = "anonymous";
    video.preload = "metadata";

    const cleanup = () => {
      URL.revokeObjectURL(url);
      video.removeAttribute('src');
      video.pause();
      video.load();
      video.remove();
    };

    // 타임아웃 15초
    const timeoutId = setTimeout(() => {
        cleanup();
        reject(new Error("Video timeout"));
    }, 15000);

    video.onloadedmetadata = () => {
      clearTimeout(timeoutId);

      // 1. 해상도 360p 강제 (짝수 맞춤)
      const TARGET_HEIGHT = 360;
      let width = video.videoWidth;
      let height = video.videoHeight;
      
      if (height > TARGET_HEIGHT) {
        width = Math.round(width * (TARGET_HEIGHT / height));
        height = TARGET_HEIGHT;
      }
      if (width % 2 !== 0) width--;
      if (height % 2 !== 0) height--;

      // 2. 캔버스 준비
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { alpha: false });

      if (!ctx) {
        cleanup();
        reject(new Error("Canvas init failed"));
        return;
      }

      // 3. 스트림 생성 (Video Only - 10 FPS)
      const stream = canvas.captureStream(10);

      // 4. Recorder 설정 (150kbps)
      const options: MediaRecorderOptions = {
        videoBitsPerSecond: 150000, 
        mimeType: 'video/webm;codecs=vp8'
      };

      if (!MediaRecorder.isTypeSupported('video/webm;codecs=vp8')) {
           if (MediaRecorder.isTypeSupported('video/webm')) {
               options.mimeType = 'video/webm';
           } else if (MediaRecorder.isTypeSupported('video/mp4')) {
               options.mimeType = 'video/mp4';
           } else {
               options.mimeType = '';
           }
      }

      let mediaRecorder: MediaRecorder;
      try {
        mediaRecorder = new MediaRecorder(stream, options);
      } catch (e) {
        cleanup();
        reject(new Error("MediaRecorder failed"));
        return;
      }

      const chunks: Blob[] = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };

      mediaRecorder.onstop = () => {
        try {
            // 최종 Blob 생성
            const blob = new Blob(chunks, { type: mediaRecorder.mimeType || 'video/webm' });
            console.log(`🎥 Video Processed (Video Only): ${(blob.size / 1024).toFixed(1)} KB`);
            resolve(blob);
        } catch (e) {
            reject(e);
        } finally {
            cleanup();
        }
      };

      // 5. 녹화 루프 (10초)
      const DURATION_MS = 10000;
      let startTime = 0;
      let animationId: number;

      const draw = () => {
        if (video.paused || video.ended) return;
        
        if (Date.now() - startTime > DURATION_MS) {
            if (mediaRecorder.state === 'recording') {
                mediaRecorder.stop();
                video.pause();
            }
            return;
        }

        ctx.drawImage(video, 0, 0, width, height);
        animationId = requestAnimationFrame(draw);
      };

      video.onplay = () => {
        startTime = Date.now();
        mediaRecorder.start(); 
        draw();
      };

      video.onended = () => {
        if (mediaRecorder.state === 'recording') mediaRecorder.stop();
        cancelAnimationFrame(animationId);
      };

      // 6. 재생 (Muted)
      video.muted = true;
      video.currentTime = 0;
      video.play().catch(e => {
          cleanup();
          reject(new Error("Playback failed"));
      });
    };

    video.onerror = () => {
        cleanup();
        reject(new Error("File load error"));
    };
  });
};
