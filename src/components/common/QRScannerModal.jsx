import { useEffect, useRef, useState } from 'react';

export default function QRScannerModal({ onResult, onClose }) {
  const videoRef = useRef(null);
  const [status, setStatus] = useState('starting'); // starting | scanning | error | unsupported
  const [errorMsg, setErrorMsg] = useState('');
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const detectorRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    function stop() {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    }

    async function start() {
      if (!('BarcodeDetector' in window)) {
        setStatus('unsupported');
        return;
      }

      try {
        detectorRef.current = new window.BarcodeDetector({ formats: ['qr_code'] });
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
        });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setStatus('scanning');

        function tick() {
          if (cancelled || !videoRef.current) return;
          if (videoRef.current.readyState < 2) { rafRef.current = requestAnimationFrame(tick); return; }
          detectorRef.current.detect(videoRef.current)
            .then(codes => {
              if (cancelled) return;
              if (codes.length > 0) {
                stop();
                onResult(codes[0].rawValue);
              } else {
                rafRef.current = requestAnimationFrame(tick);
              }
            })
            .catch(() => { if (!cancelled) rafRef.current = requestAnimationFrame(tick); });
        }
        rafRef.current = requestAnimationFrame(tick);
      } catch (e) {
        if (!cancelled) {
          setStatus('error');
          setErrorMsg(e.name === 'NotAllowedError'
            ? 'Permiso de cámara denegado. Autoriza el acceso en ajustes.'
            : 'No se pudo iniciar la cámara: ' + e.message);
        }
      }
    }

    start();
    return () => { cancelled = true; stop(); };
  }, [onResult]);

  return (
    <div className="fixed inset-0 bg-black z-[9999] flex flex-col">
      {/* Header */}
      <div className="flex justify-between items-center px-4 py-3 bg-black/80">
        <h2 className="text-white font-bold text-base">Escanear QR del ticket</h2>
        <button onClick={onClose} className="text-white text-3xl font-bold leading-none px-1">×</button>
      </div>

      {/* Body */}
      <div className="flex-1 relative flex items-center justify-center bg-black">
        {(status === 'starting' || status === 'scanning') && (
          <>
            <video
              ref={videoRef}
              className="absolute inset-0 w-full h-full object-cover"
              muted
              playsInline
            />
            {/* Scan overlay */}
            <div className="relative z-10 w-64 h-64">
              <div className="absolute inset-0 rounded-xl shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]" />
              {/* Corners */}
              <span className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-green-400 rounded-tl-lg" />
              <span className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-green-400 rounded-tr-lg" />
              <span className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-green-400 rounded-bl-lg" />
              <span className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-green-400 rounded-br-lg" />
              {/* Scan line animation */}
              <div className="absolute left-0 right-0 h-0.5 bg-green-400 opacity-80 animate-[scan_2s_linear_infinite]" />
            </div>
            <p className="absolute bottom-10 left-0 right-0 text-center text-white/70 text-sm">
              {status === 'starting' ? 'Iniciando cámara...' : 'Apunta al código QR del ticket'}
            </p>
          </>
        )}

        {status === 'error' && (
          <div className="p-6 text-center space-y-4">
            <p className="text-4xl">📷</p>
            <p className="text-yellow-400 text-sm">{errorMsg}</p>
            <button
              onClick={onClose}
              className="px-8 py-3 bg-white text-black rounded-xl font-bold"
            >Cerrar</button>
          </div>
        )}

        {status === 'unsupported' && (
          <div className="p-6 text-center space-y-4">
            <p className="text-4xl">⚠️</p>
            <p className="text-yellow-400 text-sm">
              El escáner QR no está disponible en este dispositivo.
              Ingresa el ID del ticket manualmente.
            </p>
            <button
              onClick={onClose}
              className="px-8 py-3 bg-white text-black rounded-xl font-bold"
            >Cerrar</button>
          </div>
        )}
      </div>

      <style>{`
        @keyframes scan {
          0%   { top: 4px; }
          50%  { top: calc(100% - 4px); }
          100% { top: 4px; }
        }
      `}</style>
    </div>
  );
}
