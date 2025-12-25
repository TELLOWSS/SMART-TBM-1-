
/**
 * 동영상 압축 및 오디오 캡처 유틸리티 (Audio + Video)
 * 
 * [v2.6.5 개선사항 - Audio Fix]
 * 1. 기존 'muted=true' 방식은 오디오 데이터까지 0으로 만들어 AI가 음성을 인식하지 못함.
 * 2. 해결책: 'muted=false'로 설정하되, Web Audio API를 사용해 스피커(Destination) 연결을 끊고
 *    MediaRecorder(StreamDestination)로만 오디오를 라우팅함.
 *    => 사용자: 조용함 (Silent), 녹음기: 소리 들림 (Active Audio).
 */

export const compressVideo = (file: File): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(file);
    
    // 1. 기본 설정
    video.src = url;
    video.crossOrigin = "anonymous";
    video.playsInline = true;
    video.setAttribute('webkit-playsinline', 'true');
    video.preload = "auto";
    
    // [CRITICAL CHANGE]
    // AI 음성 인식을 위해 muted는 절대 false여야 함.
    // 대신 소리가 밖으로 새나가지 않게 AudioContext로 라우팅을 제어함.
    video.muted = false; 
    video.volume = 1.0; 
    
    let stream: MediaStream | null = null;
    let mediaRecorder: MediaRecorder | null = null;
    let animationId: number;
    let audioCtx: AudioContext | null = null;
    let source: MediaElementAudioSourceNode | null = null;
    let dest: MediaStreamAudioDestinationNode | null = null;

    const cleanup = () => {
      if (animationId) cancelAnimationFrame(animationId);
      if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
      
      // Clean up Audio Context
      if (source) try { source.disconnect(); } catch(e) {}
      if (audioCtx && audioCtx.state !== 'closed') audioCtx.close();
      
      video.pause();
      video.removeAttribute('src');
      video.remove();
      URL.revokeObjectURL(url);
    };

    const timeoutId = setTimeout(() => {
        cleanup();
        reject(new Error("Video processing timeout (30s limit)"));
    }, 30000);

    video.oncanplay = () => {
      if (stream) return;

      // 1. Resolution Resize (360p)
      const TARGET_HEIGHT = 360;
      let width = video.videoWidth;
      let height = video.videoHeight;
      
      if (width === 0 || height === 0) { width = 640; height = 360; }
      
      if (height > TARGET_HEIGHT) {
        width = Math.round(width * (TARGET_HEIGHT / height));
        height = TARGET_HEIGHT;
      }
      if (width % 2 !== 0) width--;
      if (height % 2 !== 0) height--;

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { alpha: false });

      if (!ctx) {
        cleanup();
        reject(new Error("Canvas context initialization failed"));
        return;
      }

      // 2. [Advanced Audio Routing] - The "Silent Recording" Trick
      let audioTracks: MediaStreamTrack[] = [];
      try {
         // Create Audio Context
         const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
         audioCtx = new AudioContextClass();
         
         // Create Source from Video Element
         source = audioCtx.createMediaElementSource(video);
         
         // Create Destination (Stream) - This effectively captures the audio
         dest = audioCtx.createMediaStreamDestination();
         
         // Connect Source -> Stream Destination
         source.connect(dest);
         
         // IMPORTANT: We do NOT connect 'source' to 'audioCtx.destination' (Speakers).
         // This isolates the audio path to the recorder only. No sound will come out of speakers.
         
         audioTracks = dest.stream.getAudioTracks();
      } catch (e) {
         console.warn("Web Audio API setup failed, falling back to silent video:", e);
      }

      // 3. Combine Streams
      const canvasStream = canvas.captureStream(30); 
      const tracks = [...canvasStream.getVideoTracks(), ...audioTracks];
      stream = new MediaStream(tracks);

      // 4. Recorder Setup
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp8') ? 'video/webm;codecs=vp8' 
                     : MediaRecorder.isTypeSupported('video/webm') ? 'video/webm'
                     : 'video/mp4';

      try {
        mediaRecorder = new MediaRecorder(stream, {
          mimeType,
          videoBitsPerSecond: 600000, // 600kbps for better audio/video balance
        });
      } catch (e) {
        cleanup();
        reject(new Error(`MediaRecorder init failed`));
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
            console.log(`✅ Video Processed: ${(blob.size / 1024).toFixed(1)} KB`);
            resolve(blob);
        } catch (e) {
            reject(e);
        } finally {
            cleanup();
        }
      };

      // 5. Start Recording Loop
      const DURATION_MS = 10000;
      let startTime = Date.now();

      const draw = () => {
        if (!mediaRecorder || mediaRecorder.state === 'inactive') return;
        
        if (Date.now() - startTime > DURATION_MS) {
            if (mediaRecorder.state === 'recording') mediaRecorder.stop();
            return;
        }

        try { ctx.drawImage(video, 0, 0, width, height); } catch (err) {}
        animationId = requestAnimationFrame(draw);
      };

      // 6. Play & Record
      // We must catch play() errors because unmuted autoplay is often blocked by browsers
      // if there was no user interaction. However, in this app, compressVideo() is triggered by
      // a file input change (user interaction), so it usually works.
      video.play().then(() => {
          if (mediaRecorder && mediaRecorder.state === 'inactive') {
              mediaRecorder.start();
              startTime = Date.now();
              draw();
          }
      }).catch(e => {
          console.error("Playback failed (Autoplay Policy?):", e);
          cleanup();
          reject(new Error("Browser blocked video playback. Please try again."));
      });
    };

    video.onerror = () => {
        cleanup();
        reject(new Error("Video format error."));
    };
  });
};
