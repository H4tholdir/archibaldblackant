// archibald-web-app/frontend/src/pages/ToolRecognitionPage.tsx
import { useState, useEffect, useRef, useCallback, type RefCallback } from 'react'
import type { CSSProperties } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useArucoDetector } from '../hooks/useArucoDetector'
import { useLiveArucoDetector } from '../hooks/useLiveArucoDetector'
import {
  identifyInstrument,
  getRecognitionBudget,
  submitRecognitionFeedback,
} from '../api/recognition'
import type { IdentifyResponse, BudgetState } from '../api/recognition'

type PageState =
  | 'loading'
  | 'permission_denied'
  | 'idle_photo1'
  | 'idle_photo2'
  | 'preview'
  | 'analyzing'
  | 'analyzing2'
  | 'aruco_absent'
  | 'match'
  | 'shortlist_visual'
  | 'not_found'
  | 'budget_exhausted'

function InstrumentGuide() {
  const bracket: CSSProperties = {
    position: 'absolute',
    width: 14,
    height: 14,
    borderColor: '#22c55e',
    borderStyle: 'solid',
    borderWidth: 0,
  }
  // Fresa orizzontale: PUNTA a sinistra, BASE a destra
  // Carta ARUco landscape accanto alla BASE, stesso piano
  const FRESA_W = 190
  const FRESA_H = 46
  const CARD_W  = 78   // aspect ratio 85.6:54 ≈ 1.585
  const CARD_H  = 49
  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      backgroundImage: 'linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)',
      backgroundSize: '33.33% 33.33%',
      pointerEvents: 'none',
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>

        {/* Riga etichette PUNTA / BASE — sopra le estremità della fresa */}
        <div style={{ display: 'flex', width: FRESA_W, justifyContent: 'space-between', paddingLeft: 2, paddingRight: 2 }}>
          <div style={{ color: 'rgba(34,197,94,0.8)', fontSize: 9, fontWeight: 700, letterSpacing: 2 }}>PUNTA</div>
          <div style={{ color: 'rgba(34,197,94,0.8)', fontSize: 9, fontWeight: 700, letterSpacing: 2 }}>BASE</div>
        </div>

        {/* Riga principale: fresa orizzontale + carta ARUco */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>

          {/* Fresa orizzontale */}
          <div style={{ position: 'relative', width: FRESA_W, height: FRESA_H, border: '1px solid rgba(34,197,94,0.35)', borderRadius: 4 }}>
            <div style={{ ...bracket, top: -1, left: -1, borderTopWidth: 2, borderLeftWidth: 2 }} />
            <div style={{ ...bracket, top: -1, right: -1, borderTopWidth: 2, borderRightWidth: 2 }} />
            <div style={{ ...bracket, bottom: -1, left: -1, borderBottomWidth: 2, borderLeftWidth: 2 }} />
            <div style={{ ...bracket, bottom: -1, right: -1, borderBottomWidth: 2, borderRightWidth: 2 }} />
            {/* linea divisoria testa attiva / gambo — circa 45% da sinistra */}
            <div style={{ position: 'absolute', top: '15%', bottom: '15%', left: '45%', width: 1, background: 'rgba(34,197,94,0.3)' }} />
          </div>

          {/* Carta ARUco landscape — accanto alla BASE (destra della fresa) */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <div style={{ color: 'rgba(96,165,250,0.85)', fontSize: 8, fontWeight: 700, letterSpacing: 1, lineHeight: 1.2, textAlign: 'center' }}>
              <div>CARTA</div>
              <div>ARUco</div>
            </div>
            <div style={{
              position: 'relative',
              width: CARD_W, height: CARD_H,
              border: '1.5px solid rgba(96,165,250,0.5)',
              borderRadius: 3,
              background: 'rgba(96,165,250,0.05)',
            }}>
              {/* Marker nella colonna destra (come nella carta reale) */}
              <div style={{
                position: 'absolute',
                top: '50%', left: '62%',
                transform: 'translateY(-50%)',
                width: 20, height: 20,
                border: '1.5px solid rgba(96,165,250,0.65)',
                background: 'rgba(96,165,250,0.1)',
              }}>
                <div style={{ position: 'absolute', top: 2, left: 2, width: 4, height: 4, background: 'rgba(96,165,250,0.6)' }} />
                <div style={{ position: 'absolute', top: 2, right: 2, width: 4, height: 4, background: 'rgba(96,165,250,0.6)' }} />
                <div style={{ position: 'absolute', bottom: 2, left: 2, width: 4, height: 4, background: 'rgba(96,165,250,0.6)' }} />
              </div>
            </div>
            <div style={{ color: 'rgba(96,165,250,0.55)', fontSize: 8, letterSpacing: 0.5 }}>stesso piano</div>
          </div>

        </div>
      </div>
    </div>
  )
}

function ObliqueGuide() {
  const bracket: CSSProperties = {
    position: 'absolute',
    width: 18,
    height: 18,
    borderColor: '#60a5fa',
    borderStyle: 'solid',
    borderWidth: 0,
  }
  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      pointerEvents: 'none',
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{
          color: 'rgba(96,165,250,0.9)', fontSize: 10,
          fontWeight: 700, letterSpacing: 2, marginBottom: 12,
        }}>
          INCLINA 30–45°
        </div>
        {/* Ellisse — suggerisce prospettiva obliqua */}
        <div style={{
          position: 'relative',
          width: '58vw',
          height: '38vw',
          borderRadius: '50%',
          border: '1.5px solid rgba(96,165,250,0.35)',
        }}>
          <div style={{ ...bracket, top: -1, left: -1, borderTopWidth: 2, borderLeftWidth: 2 }} />
          <div style={{ ...bracket, top: -1, right: -1, borderTopWidth: 2, borderRightWidth: 2 }} />
          <div style={{ ...bracket, bottom: -1, left: -1, borderBottomWidth: 2, borderLeftWidth: 2 }} />
          <div style={{ ...bracket, bottom: -1, right: -1, borderBottomWidth: 2, borderRightWidth: 2 }} />
          {/* Centro: dot + asse verticale che suggerisce la punta */}
          <div style={{
            position: 'absolute', top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 8, height: 8, borderRadius: '50%',
            background: 'rgba(96,165,250,0.5)',
          }} />
          <div style={{
            position: 'absolute', top: '10%', bottom: '10%', left: '50%',
            width: 1, background: 'rgba(96,165,250,0.2)',
            transform: 'translateX(-50%)',
          }} />
        </div>
        <div style={{
          color: 'rgba(96,165,250,0.8)', fontSize: 10,
          fontWeight: 700, letterSpacing: 2, marginTop: 12,
        }}>
          5–10 cm dalla punta
        </div>
      </div>

      {/* Indicatore angolo — angolo icona in basso-sinistra */}
      <div style={{
        position: 'absolute', bottom: '14%', left: '8%',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
      }}>
        <div style={{
          width: 36, height: 36, position: 'relative',
          border: '1px solid rgba(96,165,250,0.3)',
          borderRadius: 4,
          display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-start',
          overflow: 'hidden',
        }}>
          {/* Arco angolo */}
          <div style={{
            position: 'absolute', bottom: 4, left: 4,
            width: 20, height: 20,
            border: '1.5px solid rgba(96,165,250,0.6)',
            borderRadius: '50%',
            clipPath: 'polygon(0 100%, 100% 100%, 100% 0)',
          }} />
          {/* Linea verticale */}
          <div style={{ position: 'absolute', bottom: 4, left: 4, width: 1, height: 16, background: 'rgba(96,165,250,0.5)' }} />
          {/* Linea orizzontale */}
          <div style={{ position: 'absolute', bottom: 4, left: 4, width: 16, height: 1, background: 'rgba(96,165,250,0.5)' }} />
        </div>
        <div style={{ color: 'rgba(96,165,250,0.7)', fontSize: 8, fontWeight: 700, letterSpacing: 1 }}>30–45°</div>
      </div>
    </div>
  )
}


export function ToolRecognitionPage() {
  const auth = useAuth()
  const navigate = useNavigate()
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const videoCallbackRef: RefCallback<HTMLVideoElement> = useCallback((node) => {
    videoRef.current = node
    if (node && streamRef.current) {
      node.srcObject = streamRef.current
    }
  }, [])

  const [pageState, setPageState] = useState<PageState>('loading')
  const [budget, setBudget] = useState<BudgetState | null>(null)

  const [capturedImages, setCapturedImages] = useState<string[]>([])
  const [usedPhotoCount, setUsedPhotoCount] = useState(1)
  const [analyzeStep, setAnalyzeStep] = useState(0)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [identifyResult, setIdentifyResult] = useState<IdentifyResponse | null>(null)
  const [arucoCalibrationPxPerMm, setArucoCalibrationPxPerMm] = useState<number | null>(null)

  const detectAruco  = useArucoDetector()
  const liveAruco    = useLiveArucoDetector(videoRef, pageState === 'idle_photo1')
  const bestLivePxPerMm = useRef<number | null>(null)
  const pendingImagesRef = useRef<string[]>([])

  // Haptic feedback helper
  const vibrate = useCallback((pattern: number | number[]) => {
    try { navigator.vibrate(pattern) } catch { /* not supported */ }
  }, [])

  // Short success beep via Web Audio API
  const playSuccessBeep = useCallback(() => {
    try {
      const ctx = new AudioContext()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = 'sine'
      osc.frequency.setValueAtTime(880, ctx.currentTime)
      osc.frequency.exponentialRampToValueAtTime(1100, ctx.currentTime + 0.08)
      gain.gain.setValueAtTime(0.18, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.22)
      osc.onended = () => ctx.close()
    } catch { /* AudioContext not available */ }
  }, [])

  useEffect(() => {
    const token = localStorage.getItem('archibald_jwt')
    if (!token) return
    getRecognitionBudget(token).then(setBudget).catch(console.error)
  }, [auth.token])

  // Aggiorna la calibrazione migliore dalla detection live
  useEffect(() => {
    if (liveAruco.pxPerMm != null) bestLivePxPerMm.current = liveAruco.pxPerMm
  }, [liveAruco.pxPerMm])

  // Resetta la calibrazione live quando l'utente ricomincia dall'inizio
  useEffect(() => {
    if (pageState === 'idle_photo1') bestLivePxPerMm.current = null
  }, [pageState])

  useEffect(() => {
    let cancelled = false
    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
        })
        if (cancelled) {
          stream.getTracks().forEach(t => t.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
        }
        setPageState('idle_photo1')
      } catch (err) {
        setPageState('permission_denied')
      }
    }
    startCamera()
    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
  }, [])


  const captureFrame = useCallback((): string | null => {
    const video = videoRef.current
    if (!video || video.videoWidth === 0) return null
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(video, 0, 0)
    return canvas.toDataURL('image/jpeg', 0.9).replace(/^data:image\/\w+;base64,/, '')
  }, [])

  const callIdentifyApi = useCallback(async (images: string[], arucoPxPerMm?: number) => {
    const token = localStorage.getItem('archibald_jwt')
    if (!token) {
      setPageState('idle_photo1')
      setErrorMessage('Sessione scaduta. Effettua il login.')
      return
    }
    try {
      setAnalyzeStep(1)
      const response = await identifyInstrument(token, images, arucoPxPerMm)
      setAnalyzeStep(2)
      setIdentifyResult(response)
      const { type } = response.result
      if (type === 'budget_exhausted') {
        setPageState('budget_exhausted')
      } else if (type === 'match') {
        setAnalyzeStep(3)
        vibrate([200, 50, 100])
        playSuccessBeep()
        setPageState('match')
      } else if (type === 'shortlist_visual') {
        vibrate([80, 30, 80])
        setPageState('shortlist_visual')
      } else if (type === 'not_found') {
        setPageState('not_found')
      } else {
        setPageState('idle_photo1')
        setErrorMessage('Errore di analisi. Riprova.')
      }
    } catch (err) {
      setPageState('idle_photo1')
      const detail = err instanceof Error && err.message.startsWith('HTTP') ? ` (${err.message})` : ''
      setErrorMessage(`Errore di connessione${detail}. Riprova.`)
    }
  }, [vibrate, playSuccessBeep])

  const runIdentification = useCallback(async (images: string[]) => {
    const token = localStorage.getItem('archibald_jwt')
    if (!token) return
    setPageState(images.length === 2 ? 'analyzing2' : 'analyzing')
    setAnalyzeStep(0)
    setUsedPhotoCount(images.length)
    setArucoCalibrationPxPerMm(null)
    pendingImagesRef.current = images

    // Calibrazione acquisita durante il viewfinder live: usa direttamente
    const liveCalibration = bestLivePxPerMm.current
    if (liveCalibration != null) {
      setArucoCalibrationPxPerMm(liveCalibration)
      await callIdentifyApi(images, liveCalibration)
      return
    }

    // Fallback: prova ARUco su ogni scatto in ordine
    let arucoDetected: { detected: boolean; pxPerMm: number | null } = { detected: false, pxPerMm: null }
    for (let i = 0; i < images.length; i++) {
      const result = await detectAruco(images[i])
      console.debug(`[ARUco] img[${i}] detected=${result.detected}`, result.debug ?? '')
      if (result.detected) { arucoDetected = result; break }
    }

    if (!arucoDetected.detected) {
      setPageState('aruco_absent')
      return
    }
    if (arucoDetected.pxPerMm != null) {
      setArucoCalibrationPxPerMm(arucoDetected.pxPerMm)
      await callIdentifyApi(images, arucoDetected.pxPerMm)
      return
    }
    await callIdentifyApi(images)
  }, [detectAruco, callIdentifyApi])

  const handleProceedWithoutAruco = useCallback(() => {
    const images = pendingImagesRef.current
    setPageState(images.length === 2 ? 'analyzing2' : 'analyzing')
    setAnalyzeStep(0)
    void callIdentifyApi(images)
  }, [callIdentifyApi])

  const handleShutterPhoto1 = useCallback(() => {
    if (pageState !== 'idle_photo1') return
    vibrate(30)
    const base64 = captureFrame()
    if (!base64) return
    setCapturedImages([base64])
    setPageState('idle_photo2')
  }, [captureFrame, pageState, vibrate])

  const handleShutterPhoto2 = useCallback(() => {
    if (pageState !== 'idle_photo2') return
    vibrate(30)
    const base64 = captureFrame()
    if (!base64) return
    setCapturedImages(prev => [prev[0]!, base64])
    setPageState('preview')
  }, [captureFrame, pageState, vibrate])

  const handleIdentifyFromPreview = useCallback(async () => {
    await runIdentification(capturedImages)
  }, [capturedImages, runIdentification])


  if (pageState === 'permission_denied') {
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: '#0f0f0f', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 24, padding: 32,
      }}>
        <div style={{ fontSize: 64 }}>🚫</div>
        <h2 style={{ color: '#fff', textAlign: 'center', margin: 0, fontSize: 20 }}>
          Fotocamera non autorizzata
        </h2>
        <p style={{ color: '#aaa', textAlign: 'center', margin: 0, fontSize: 14, maxWidth: 320 }}>
          Vai in Impostazioni e consenti l'accesso alla fotocamera per Archibald
        </p>
        <Link
          to="/products"
          style={{
            marginTop: 8, color: '#60a5fa', fontSize: 16,
            textDecoration: 'none', borderBottom: '1px solid #60a5fa',
          }}
        >
          🔍 Cerca manualmente
        </Link>
      </div>
    )
  }

  if (pageState === 'analyzing' || pageState === 'analyzing2') {
    const STEP_LABELS = [
      usedPhotoCount > 1 ? `${usedPhotoCount} foto acquisite` : 'Foto acquisita',
      'Analisi con AI  (30–60 s)',
      'Confronto con catalogo',
      'Identificazione',
    ]

    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: '#000' }}>
        {capturedImages[0] && (
          <img
            src={`data:image/jpeg;base64,${capturedImages[0]}`}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.4, position: 'absolute', inset: 0 }}
          />
        )}
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 24, padding: 32,
        }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%',
            border: '4px solid rgba(255,255,255,0.2)',
            borderTopColor: '#22c55e',
            animation: 'spin 0.8s linear infinite',
          }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {STEP_LABELS.map((label, i) => {
              const done   = i < analyzeStep
              const active = i === analyzeStep
              const symbol = done ? '✓' : active ? '→' : '○'
              const color  = done ? '#22c55e' : active ? '#f9a825' : '#374151'
              return (
                <div key={label} style={{
                  color,
                  fontSize: 16, fontWeight: active ? 600 : 400,
                  display: 'flex', alignItems: 'center', gap: 10,
                }}>
                  <span style={{ fontFamily: 'monospace', width: 16 }}>{symbol}</span>
                  <span>{label}</span>
                </div>
              )
            })}
          </div>

          {arucoCalibrationPxPerMm != null && (
            <div style={{
              marginTop: 8, color: '#22c55e', fontSize: 13, fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <span>✓</span>
              <span>ARUco {arucoCalibrationPxPerMm.toFixed(1)} px/mm</span>
            </div>
          )}
        </div>
      </div>
    )
  }

  if (pageState === 'budget_exhausted') {
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 200, background: '#111',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 20, padding: 32,
      }}>
        <div style={{ fontSize: 48 }}>🚫</div>
        <h2 style={{ color: '#fff', textAlign: 'center', margin: 0, fontSize: 20 }}>
          Budget giornaliero esaurito
        </h2>
        <p style={{ color: '#aaa', textAlign: 'center', margin: 0, fontSize: 14 }}>
          Il limite giornaliero di scansioni è stato raggiunto. Riprova domani.
        </p>
        <button
          onClick={() => navigate('/products')}
          style={{
            marginTop: 8, background: '#2563eb', color: '#fff',
            border: 'none', borderRadius: 8, padding: '12px 24px',
            fontSize: 16, cursor: 'pointer',
          }}
        >
          🔍 Cerca manualmente
        </button>
      </div>
    )
  }

  if (pageState === 'match' && identifyResult?.result.type === 'match') {
    const { data: product } = identifyResult.result
    const confidence = product.confidence
    const { imageHash } = identifyResult

    const handleOpenProduct = async () => {
      if (product.discontinued) return
      const token = localStorage.getItem('archibald_jwt')
      if (!token) return
      try {
        await submitRecognitionFeedback(token, { imageHash, productId: product.familyCode, confirmedByUser: true })
      } catch {
      }
      navigate(`/products/${encodeURIComponent(product.familyCode)}`, { state: { fromScanner: true } })
    }

    const confidencePct = Math.round(confidence * 100)
    const confidenceColor = confidence >= 0.9 ? '#22c55e' : confidence >= 0.75 ? '#4ade80' : '#f9a825'

    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: '#0a1f0a',
        display: 'flex', flexDirection: 'column', overflowY: 'auto',
      }}>
        {/* Hero photo */}
        {capturedImages[0] && (
          <div style={{ position: 'relative', height: '42vh', flexShrink: 0 }}>
            <img
              src={`data:image/jpeg;base64,${capturedImages[0]}`}
              alt="Foto scansione"
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
            {/* gradient overlay bottom */}
            <div style={{
              position: 'absolute', bottom: 0, left: 0, right: 0, height: 80,
              background: 'linear-gradient(to bottom, transparent, #0a1f0a)',
            }} />
            {/* confidence badge */}
            <div style={{
              position: 'absolute', top: 52, right: 16,
              background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
              borderRadius: 20, padding: '4px 12px',
              color: confidenceColor, fontSize: 13, fontWeight: 700,
              border: `1px solid ${confidenceColor}40`,
            }}>
              {confidencePct}% conf.
            </div>
            {/* check badge */}
            <div style={{
              position: 'absolute', top: 52, left: 16,
              background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
              borderRadius: 20, padding: '4px 12px',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <div style={{
                width: 18, height: 18, borderRadius: '50%',
                background: '#22c55e', color: '#000',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, fontWeight: 900,
              }}>✓</div>
              <span style={{ color: '#22c55e', fontWeight: 700, fontSize: 13 }}>
                Articolo identificato
              </span>
            </div>
            {/* foto count badge */}
            {usedPhotoCount > 1 && (
              <div style={{
                position: 'absolute', bottom: 24, right: 16,
                color: '#22c55e', fontSize: 11, fontWeight: 600,
                background: 'rgba(0,0,0,0.5)', borderRadius: 6, padding: '3px 8px',
                border: '1px solid rgba(34,197,94,0.3)',
              }}>
                {usedPhotoCount} foto
              </div>
            )}
          </div>
        )}

        <div style={{ padding: '20px', flex: 1 }}>
          {/* Identità prodotto */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ color: '#6b7280', fontSize: 12, marginBottom: 4 }}>
              {[product.familyCode, product.shankType?.toUpperCase()].filter(Boolean).join(' · ')}
            </div>
            <div style={{
              color: '#fff', fontSize: 20, fontWeight: 700,
              lineHeight: 1.3, marginBottom: 6, wordBreak: 'break-word',
            }}>
              {product.productName}
            </div>
            <div style={{
              fontFamily: 'monospace', color: '#9ca3af', fontSize: 14, letterSpacing: 1.5,
            }}>
              {product.familyCode}
            </div>
          </div>

          {/* Info misura */}
          {(product.headDiameterMm != null && product.headDiameterMm > 0) && (
            <div style={{
              display: 'flex', gap: 8, marginBottom: 28,
            }}>
              {product.shankType && (
                <span style={{
                  background: '#1a3a1a', color: '#4ade80',
                  borderRadius: 20, padding: '4px 12px', fontSize: 12, fontWeight: 600,
                  border: '1px solid #2d5a2d',
                }}>
                  {product.shankType.toUpperCase()}
                </span>
              )}
              <span style={{
                background: '#1a2a3a', color: '#60a5fa',
                borderRadius: 20, padding: '4px 12px', fontSize: 12, fontWeight: 600,
                border: '1px solid #1e3a5f',
              }}>
                Ø {product.headDiameterMm} mm
              </span>
            </div>
          )}

          <button
            onClick={() => { void handleOpenProduct() }}
            aria-label="Apri scheda prodotto"
            style={{
              width: '100%', background: '#22c55e', color: '#000',
              border: 'none', borderRadius: 12, padding: '16px 0',
              fontSize: 16, fontWeight: 700, cursor: 'pointer', marginBottom: 8,
            }}
          >
            Apri scheda prodotto →
          </button>

          <div style={{ color: '#4ade80', fontSize: 11, textAlign: 'center', marginBottom: 20, opacity: 0.7 }}>
            Il tap conferma il riconoscimento e salva la foto in gallery
          </div>

          <button
            onClick={() => { setCapturedImages([]); setPageState('idle_photo1') }}
            style={{
              width: '100%', background: 'transparent',
              border: '1px solid #2d4a2d', borderRadius: 12, padding: '12px 0',
              cursor: 'pointer',
            }}
          >
            <div style={{ color: '#9ca3af', fontSize: 15 }}>Non è questo</div>
            <div style={{ color: '#6b7280', fontSize: 12, marginTop: 2 }}>→ rifai la foto</div>
          </button>
        </div>
      </div>
    )
  }

  if (pageState === 'shortlist_visual' && identifyResult?.result.type === 'shortlist_visual') {
    const { candidates } = identifyResult.result.data

    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: '#111', overflowY: 'auto' }}>
        {/* Hero photo */}
        {capturedImages[0] && (
          <div style={{ position: 'relative', height: '38vh', flexShrink: 0 }}>
            <img
              src={`data:image/jpeg;base64,${capturedImages[0]}`}
              alt="Foto scansione"
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
            <div style={{
              position: 'absolute', bottom: 0, left: 0, right: 0, height: 80,
              background: 'linear-gradient(to bottom, transparent, #111)',
            }} />
          </div>
        )}
        {/* Header */}
        <div style={{ padding: '14px 20px 14px', borderBottom: '1px solid #1f1f1f', background: '#141414' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
              <span style={{ color: '#f9a825', fontSize: 16, fontWeight: 700 }}>
                {candidates.length} candidati trovati
              </span>
            </div>
            <div style={{ color: '#6b7280', fontSize: 13 }}>
              Incerto · seleziona il prodotto corretto
            </div>
          </div>
        </div>

        <div style={{ padding: '14px 20px' }}>
          {/* Campionario reference strip — shown if any candidate has a thumbnailUrl */}
          {(() => {
            const stripUrl = candidates.find(c => c.thumbnailUrl)?.thumbnailUrl
            if (!stripUrl) return null
            return (
              <div style={{ marginBottom: 14 }}>
                <div style={{ color: '#6b7280', fontSize: 11, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>
                  Campionario di riferimento
                </div>
                <img
                  src={stripUrl}
                  alt="Strip campionario Komet"
                  style={{
                    width: '100%', height: 90, objectFit: 'cover',
                    borderRadius: 8, display: 'block',
                    border: '1px solid #374151',
                  }}
                />
              </div>
            )
          })()}

          {candidates.map((c, idx) => {
            const isFirst = idx === 0
            const handleSelectCandidate = () => {
              const token = localStorage.getItem('archibald_jwt')
              if (token && identifyResult?.imageHash) {
                submitRecognitionFeedback(token, {
                  imageHash:       identifyResult.imageHash,
                  productId:       c.familyCode,
                  confirmedByUser: true,
                }).catch(console.error)
              }
              navigate(`/products/${encodeURIComponent(c.familyCode)}`, { state: { fromScanner: true } })
            }
            return (
              <button
                key={c.familyCode}
                onClick={handleSelectCandidate}
                style={{
                  width: '100%', display: 'flex', alignItems: 'flex-start', gap: 12,
                  background: isFirst ? '#1f1a00' : '#1a1a1a',
                  border: `1px solid ${isFirst ? '#f9a825' : '#374151'}`,
                  borderRadius: 12,
                  padding: '14px 16px', marginBottom: 10,
                  cursor: 'pointer', textAlign: 'left',
                }}
              >
                {c.thumbnailUrl ? (
                  <img
                    src={c.thumbnailUrl}
                    alt="Strip campionario"
                    style={{
                      width: 88, height: 88, objectFit: 'cover',
                      borderRadius: 8, flexShrink: 0,
                      border: `1px solid ${isFirst ? '#f9a825' : '#374151'}`,
                    }}
                  />
                ) : (
                  <div style={{
                    width: 88, height: 88, borderRadius: 8, flexShrink: 0,
                    background: '#2a2a2a', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: `1px solid ${isFirst ? '#f9a825' : '#374151'}`,
                  }}>
                    <span style={{ color: '#6b7280', fontSize: 26 }}>🔩</span>
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: '#fff', fontWeight: 600, fontSize: 15 }}>{c.familyCode}</div>
                  {c.shapeDescription && (
                    <div style={{ color: '#9ca3af', fontSize: 13, marginTop: 3, lineHeight: 1.3 }}>
                      {c.shapeDescription}
                    </div>
                  )}
                </div>
              </button>
            )
          })}

          <button
            onClick={() => { setCapturedImages([]); setPageState('idle_photo1') }}
            style={{
              width: '100%', background: 'transparent',
              border: '1px solid #374151', borderRadius: 12,
              padding: '12px 0', marginTop: 4,
              cursor: 'pointer', color: '#9ca3af', fontSize: 14,
            }}
          >
            ← Rifai la foto
          </button>
        </div>
      </div>
    )
  }

  if (pageState === 'aruco_absent') {
    const storedImages = pendingImagesRef.current
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 200, background: '#0f0f0f',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 20, padding: 32,
      }}>
        <div style={{ fontSize: 56 }}>📋</div>
        <h2 style={{ color: '#fff', textAlign: 'center', margin: 0, fontSize: 20 }}>
          Carta ARUco non rilevata nella foto
        </h2>
        <p style={{ color: '#9ca3af', textAlign: 'center', fontSize: 14, margin: 0, lineHeight: 1.5 }}>
          Il marker di calibrazione non è stato trovato.<br/>
          Scegli come procedere:
        </p>
        <button
          onClick={() => setPageState(storedImages.length === 2 ? 'idle_photo2' : 'idle_photo1')}
          style={{
            background: 'transparent', color: '#93c5fd',
            border: '1px solid #1e40af', borderRadius: 8, padding: '12px 24px',
            fontSize: 16, cursor: 'pointer', width: '100%', maxWidth: 280,
          }}
        >
          ← Riprova con la carta
        </button>
        <button
          onClick={handleProceedWithoutAruco}
          style={{
            background: '#2563eb', color: '#fff',
            border: 'none', borderRadius: 8, padding: '12px 24px',
            fontSize: 16, cursor: 'pointer', width: '100%', maxWidth: 280,
          }}
        >
          Procedi senza carta →
        </button>
      </div>
    )
  }

  if (pageState === 'not_found' && identifyResult?.result.type === 'not_found') {
    const { measurements } = identifyResult.result.data
    const sourceLabel =
      measurements.measurementSource === 'aruco'     ? 'carta ARUco' :
      measurements.measurementSource === 'shank_iso'  ? 'gambo ISO'   : 'stima'

    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 200, background: '#0f0f0f',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32,
      }}>
        <div style={{ fontSize: 56 }}>🔍</div>
        <h2 style={{ color: '#fff', textAlign: 'center', margin: 0, fontSize: 20 }}>
          Strumento non trovato in catalogo
        </h2>

        {(measurements.headDiameterMm != null || measurements.shapeClass || measurements.shankGroup) && (
          <div style={{
            background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 12,
            padding: '16px 20px', width: '100%', maxWidth: 340,
            display: 'flex', flexDirection: 'column', gap: 8,
          }}>
            {measurements.headDiameterMm != null && (
              <div style={{ color: '#9ca3af', fontSize: 14 }}>
                <span style={{ color: '#6b7280' }}>Ø testa: </span>
                <span style={{ color: '#e5e7eb', fontWeight: 600 }}>
                  {measurements.headDiameterMm.toFixed(1)} mm
                </span>
              </div>
            )}
            {measurements.shapeClass && (
              <div style={{ color: '#9ca3af', fontSize: 14 }}>
                <span style={{ color: '#6b7280' }}>Forma: </span>
                <span style={{ color: '#e5e7eb', fontWeight: 600 }}>{measurements.shapeClass}</span>
              </div>
            )}
            {measurements.shankGroup && (
              <div style={{ color: '#9ca3af', fontSize: 14 }}>
                <span style={{ color: '#6b7280' }}>Gambo: </span>
                <span style={{ color: '#e5e7eb', fontWeight: 600 }}>{measurements.shankGroup}</span>
              </div>
            )}
            <div style={{ color: '#6b7280', fontSize: 12, marginTop: 4 }}>
              Misurazione via: {sourceLabel} · {measurements.sqlFallbackStep} tentativi di ricerca
            </div>
          </div>
        )}

        <button
          onClick={() => { setCapturedImages([]); setPageState('idle_photo1') }}
          style={{
            marginTop: 8, background: '#2563eb', color: '#fff',
            border: 'none', borderRadius: 8, padding: '12px 24px',
            fontSize: 16, cursor: 'pointer',
          }}
        >
          Riprova
        </button>
      </div>
    )
  }

  if (pageState === 'preview') {
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: '#0a0d15',
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid #1e2235' }}>
          <div style={{ color: '#22c55e', fontSize: 11, fontWeight: 700, letterSpacing: 1.5, marginBottom: 6 }}>
            {capturedImages.length === 2 ? '2 FOTO ACQUISITE — ANALISI COMBINATA' : '1 FOTO ACQUISITA'}
          </div>
          <div style={{ color: '#fff', fontSize: 22, fontWeight: 700 }}>
            Pronto per Identificare
          </div>
        </div>

        <div style={{ padding: '20px', display: 'flex', gap: 12 }}>
          {capturedImages.map((img, i) => (
            <div key={i} style={{ flex: 1, position: 'relative' }}>
              <img
                src={`data:image/jpeg;base64,${img}`}
                alt={i === 0 ? 'Vista laterale' : 'Vista alto'}
                style={{
                  width: '100%', height: 160, objectFit: 'cover',
                  borderRadius: 12, border: '2px solid #22c55e', display: 'block',
                }}
              />
              <div style={{
                position: 'absolute', bottom: 8, left: 0, right: 0,
                textAlign: 'center', color: '#22c55e', fontSize: 10,
                fontWeight: 700, textShadow: '0 1px 3px rgba(0,0,0,0.9)',
              }}>
                {i === 0 ? 'LATERALE ✓' : 'ALTO ✓'}
              </div>
            </div>
          ))}
        </div>

        {capturedImages.length === 2 && (
          <div style={{ padding: '0 20px', marginBottom: 16 }}>
            <div style={{
              background: '#1a1d26', borderRadius: 12, padding: 16,
              display: 'flex', flexDirection: 'column', gap: 10,
            }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span style={{ color: '#3b82f6', flexShrink: 0 }}>↔</span>
                <span style={{ color: '#c5c8d5', fontSize: 13 }}>
                  Foto 1 rivela: forma, proporzioni, profilo laterale
                </span>
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span style={{ color: '#3b82f6', flexShrink: 0 }}>⊙</span>
                <span style={{ color: '#c5c8d5', fontSize: 13 }}>
                  Foto 2 rivela: geometria punta, flat vs dome, diametro
                </span>
              </div>
            </div>
          </div>
        )}

        <div style={{ flex: 1 }} />

        <div style={{ padding: '0 20px 48px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <button
            onClick={() => { void handleIdentifyFromPreview() }}
            style={{
              width: '100%', background: '#22c55e', color: '#000',
              border: 'none', borderRadius: 14, padding: '16px 0',
              fontSize: 17, fontWeight: 700, cursor: 'pointer',
            }}
          >
            Identifica →
          </button>
          <button
            onClick={() => { setCapturedImages([]); setPageState('idle_photo1') }}
            style={{
              width: '100%', background: 'transparent', color: '#6b7280',
              border: '1px solid #2e3248', borderRadius: 14, padding: '13px 0',
              fontSize: 14, cursor: 'pointer',
            }}
          >
            ← Riprendi dall'inizio
          </button>
        </div>
      </div>
    )
  }

  if (pageState === 'idle_photo1' || pageState === 'idle_photo2') {
    const isPhoto2 = pageState === 'idle_photo2'

    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: '#0F1117', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ padding: '56px 20px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Step dots */}
          <div style={{
            width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
            background: isPhoto2 ? '#22c55e' : '#3b82f6',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 700, color: '#fff',
          }}>
            {isPhoto2 ? '✓' : '1'}
          </div>
          <div style={{ width: 16, height: 2, background: isPhoto2 ? '#22c55e' : '#3b82f6', borderRadius: 1 }} />
          <div style={{
            width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
            background: isPhoto2 ? '#3b82f6' : '#2e3248',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 700, color: isPhoto2 ? '#fff' : '#6b7280',
          }}>
            2
          </div>
          <span style={{ color: '#6b7280', fontSize: 11, fontWeight: 600, letterSpacing: 1.5, marginLeft: 8 }}>
            STEP {isPhoto2 ? '2' : '1'} DI 2
          </span>

          {/* Photo 1 thumbnail (solo su S2) */}
          {isPhoto2 && capturedImages[0] && (
            <div style={{ position: 'relative', marginLeft: 'auto' }}>
              <img
                src={`data:image/jpeg;base64,${capturedImages[0]}`}
                alt="Foto 1"
                style={{ width: 44, height: 36, borderRadius: 6, objectFit: 'cover', border: '1.5px solid #22c55e', display: 'block' }}
              />
              <div style={{
                position: 'absolute', bottom: -6, right: -6,
                width: 16, height: 16, borderRadius: '50%', background: '#22c55e',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 9, fontWeight: 900, color: '#000',
              }}>✓</div>
            </div>
          )}

          {/* Close button */}
          <button
            onClick={() => navigate(-1)}
            style={{ marginLeft: isPhoto2 ? 8 : 'auto', background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', fontSize: 22, cursor: 'pointer', padding: 4, lineHeight: 1 }}
          >
            ✕
          </button>
        </div>

        {/* Title + subtitle */}
        <div style={{ padding: '14px 20px 0' }}>
          <div style={{ color: '#fff', fontSize: 24, fontWeight: 700, marginBottom: 4 }}>
            {isPhoto2 ? 'Vista Obliqua' : 'Vista Laterale'}
          </div>
          <div style={{ color: '#8B90A0', fontSize: 14 }}>
            {isPhoto2
              ? 'Avvicina la punta e inclina 30–45° dall\'alto per vedere la forma'
              : 'Orienta lo strumento orizzontalmente nel mirino'}
          </div>
        </div>

        {/* Viewfinder */}
        <div style={{ padding: '14px 20px 0' }}>
          <div style={{ position: 'relative', borderRadius: 14, overflow: 'hidden', height: 310, background: '#0A0D15' }}>
            <video
              ref={videoCallbackRef}
              autoPlay playsInline muted
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
            {/* Guide overlay */}
            {isPhoto2 ? <ObliqueGuide /> : <InstrumentGuide />}
            {/* Live ARUco badge — solo in idle_photo1 */}
            {!isPhoto2 && (
              <div style={{
                position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)',
                zIndex: 10, pointerEvents: 'none', whiteSpace: 'nowrap',
                background: liveAruco.detected
                  ? 'rgba(34,197,94,0.92)'
                  : liveAruco.pxPerMm != null
                    ? 'rgba(34,197,94,0.55)'
                    : 'rgba(0,0,0,0.45)',
                backdropFilter: 'blur(6px)',
                borderRadius: 20, padding: '4px 12px',
                fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
                color: liveAruco.detected || liveAruco.pxPerMm != null
                  ? '#fff'
                  : 'rgba(255,255,255,0.55)',
                transition: 'background 0.35s ease',
              }}>
                {liveAruco.detected
                  ? '✓ Carta ARUco rilevata'
                  : liveAruco.pxPerMm != null
                    ? '✓ Calibrazione acquisita'
                    : 'Posiziona la carta ARUco nel mirino'}
              </div>
            )}
            {/* Corner brackets */}
            {[
              { top: 10, left: 10, borderTopWidth: 2, borderLeftWidth: 2 },
              { top: 10, right: 10, borderTopWidth: 2, borderRightWidth: 2 },
              { bottom: 10, left: 10, borderBottomWidth: 2, borderLeftWidth: 2 },
              { bottom: 10, right: 10, borderBottomWidth: 2, borderRightWidth: 2 },
            ].map((pos, i) => (
              <div key={i} style={{
                position: 'absolute', width: 20, height: 20,
                borderColor: isPhoto2 ? '#60a5fa' : '#3b82f6',
                borderStyle: 'solid', borderWidth: 0,
                ...pos,
              }} />
            ))}
          </div>
        </div>

        {/* Tip card (S1) / spazio (S2) */}
        {!isPhoto2 && (
          <div style={{ padding: '12px 20px 0' }}>
            <div style={{
              background: '#1A1D26', borderRadius: 12,
              padding: '12px 14px', display: 'flex', gap: 10, alignItems: 'center',
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8, background: '#22263A', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
              }}>💡</div>
              <div>
                <div style={{ color: '#3b82f6', fontSize: 11, fontWeight: 700, letterSpacing: 1, marginBottom: 2 }}>CONSIGLIO</div>
                <div style={{ color: '#C5C8D5', fontSize: 13 }}>Includi tutta la lunghezza dello strumento</div>
              </div>
            </div>
          </div>
        )}

        {!isPhoto2 && (
          <div style={{ padding: '8px 20px 0' }}>
            <div style={{
              background: 'rgba(10,61,143,0.12)',
              border: '1px solid rgba(10,61,143,0.25)',
              borderRadius: 10,
              padding: '10px 14px',
              display: 'flex', gap: 8, alignItems: 'center',
            }}>
              <span style={{ fontSize: 14, flexShrink: 0 }}>📐</span>
              <div style={{ color: '#93c5fd', fontSize: 12, lineHeight: 1.4 }}>
                Allinea strumento e <strong style={{ fontWeight: 600 }}>carta ARUco</strong> come mostrato nel mirino — sullo stesso piano, carta accanto al gambo
              </div>
            </div>
          </div>
        )}

        {/* Error */}
        {errorMessage && (
          <div onClick={() => setErrorMessage(null)} style={{ padding: '8px 20px 0' }}>
            <div style={{ background: 'rgba(239,68,68,0.12)', borderRadius: 10, padding: '10px 14px', color: '#f87171', fontSize: 13, cursor: 'pointer' }}>
              {errorMessage}
            </div>
          </div>
        )}

        <div style={{ flex: 1 }} />

        {/* Budget warning */}
        {budget?.throttleLevel === 'warning' && (
          <div style={{ padding: '0 20px 8px', color: '#eab308', fontSize: 13, fontWeight: 600, textAlign: 'center' }}>
            ⚠ Budget quasi esaurito
          </div>
        )}

        {/* Actions */}
        <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 40 }}>
          <button
            onClick={isPhoto2 ? handleShutterPhoto2 : handleShutterPhoto1}
            style={{
              width: '100%', background: isPhoto2 ? '#60a5fa' : '#3b82f6', color: '#fff',
              border: 'none', borderRadius: 14, padding: '15px 0',
              fontSize: 16, fontWeight: 700, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            }}
          >
            <span>📷</span>
            <span>{isPhoto2 ? 'SCATTA FOTO 2' : 'SCATTA FOTO 1'}</span>
          </button>

          {isPhoto2 && (
            <button
              onClick={() => setPageState('preview')}
              style={{
                width: '100%', background: 'transparent', color: 'rgba(255,255,255,0.45)',
                border: 'none', cursor: 'pointer', fontSize: 14, padding: '8px 0',
              }}
            >
              Procedi con 1 foto →
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: '#000' }}>
      <video
        ref={videoCallbackRef}
        autoPlay
        playsInline
        muted
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
    </div>
  )
}
