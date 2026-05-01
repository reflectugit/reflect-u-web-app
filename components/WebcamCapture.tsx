"use client";

import { useRef, useState, useCallback, useEffect } from "react";

type Props = {
  onCapture: (blob: Blob) => void;
};

export default function WebcamCapture({ onCapture }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [streaming, setStreaming] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [camError, setCamError] = useState<string | null>(null);

  const stopStream = useCallback(() => {
    const video = videoRef.current;
    if (video?.srcObject) {
      (video.srcObject as MediaStream).getTracks().forEach((t) => t.stop());
      video.srcObject = null;
    }
    setStreaming(false);
  }, []);

  useEffect(() => () => stopStream(), [stopStream]);

  const startCamera = useCallback(async () => {
    setCamError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 } },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setStreaming(true);
      }
    } catch {
      setCamError("Couldn't access webcam. Check it's connected and permissions are allowed.");
    }
  }, []);

  useEffect(() => { startCamera(); }, [startCamera]);

  const capture = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")!.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);

    stopStream();
    setPreview(dataUrl);

    canvas.toBlob((blob) => {
      if (blob) onCapture(blob);
    }, "image/jpeg", 0.92);
  }, [stopStream, onCapture]);

  const retake = useCallback(() => {
    setPreview(null);
    startCamera();
  }, [startCamera]);

  const inputClass =
    "w-full rounded-lg bg-white py-2.5 text-sm font-medium text-black transition hover:bg-zinc-200";
  const outlineClass =
    "w-full rounded-lg border border-zinc-700 py-2.5 text-sm text-zinc-300 transition hover:border-zinc-500 hover:text-white";

  return (
    <div className="space-y-3">
      {/* Both video and canvas stay in the DOM so refs are valid before streaming state updates */}
      <canvas ref={canvasRef} className="hidden" />
      <video
        ref={videoRef}
        className={streaming && !preview ? "w-full rounded-lg" : "hidden"}
        playsInline
        muted
      />

      {!streaming && !preview && (
        <div className="flex h-48 w-full items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 text-sm text-zinc-600">
          Camera off
        </div>
      )}

      {preview && (
        <img src={preview} alt="Captured selfie" className="w-full rounded-lg object-cover" />
      )}

      {camError && <p className="text-sm text-red-400">{camError}</p>}

      {preview ? (
        <button type="button" onClick={retake} className={outlineClass}>
          Retake
        </button>
      ) : streaming ? (
        <button type="button" onClick={capture} className={inputClass}>
          Take photo
        </button>
      ) : camError ? (
        <button type="button" onClick={startCamera} className={outlineClass}>
          Retry
        </button>
      ) : null}
    </div>
  );
}
