// archibald-web-app/frontend/src/pages/ToolRecognitionPage.tsx
import { useState, useEffect, useRef, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import {
  identifyInstrument,
  getRecognitionBudget,
} from '../api/recognition'
import type { BudgetState } from '../api/recognition'

type PageState =
  | 'loading'
  | 'permission_denied'
  | 'idle'
  | 'analyzing'
  | 'match'
  | 'shortlist'
  | 'filter_needed'
  | 'budget_exhausted'

function Viewfinder() {
  const cornerBase: React.CSSProperties = {
    position: 'absolute',
    width: 20,
    height: 20,
    borderColor: '#22c55e',
    borderStyle: 'solid',
    borderWidth: 0,
  }
  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      backgroundImage: 'linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)',
      backgroundSize: '33.33% 33.33%',
    }}>
      <div style={{
        position: 'relative',
        width: '60%',
        aspectRatio: '1',
        border: '2px solid rgba(255,255,255,0.3)',
        borderRadius: 8,
      }}>
        <div style={{ ...cornerBase, top: -1, left: -1, borderTopWidth: 3, borderLeftWidth: 3 }} />
        <div style={{ ...cornerBase, top: -1, right: -1, borderTopWidth: 3, borderRightWidth: 3 }} />
        <div style={{ ...cornerBase, bottom: -1, left: -1, borderBottomWidth: 3, borderLeftWidth: 3 }} />
        <div style={{ ...cornerBase, bottom: -1, right: -1, borderBottomWidth: 3, borderRightWidth: 3 }} />
      </div>
    </div>
  )
}

export function ToolRecognitionPage() {
  const auth = useAuth()
  const navigate = useNavigate()
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const [pageState, setPageState] = useState<PageState>('loading')
  const [budget, setBudget] = useState<BudgetState | null>(null)
  const [flashOn, setFlashOn] = useState(false)
  const [capturedBase64, setCapturedBase64] = useState<string | null>(null)
  const [analyzeStep, setAnalyzeStep] = useState(0)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    const token = localStorage.getItem('archibald_jwt')
    if (!token) return
    getRecognitionBudget(token).then(setBudget).catch(console.error)
  }, [auth.token])

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
        setPageState('idle')
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

  const toggleFlash = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0]
    if (!track) return
    const next = !flashOn
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] })
      setFlashOn(next)
    } catch {
    }
  }, [flashOn])

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

  const handleShutter = useCallback(async () => {
    const token = localStorage.getItem('archibald_jwt')
    if (!token || pageState !== 'idle') return

    const base64 = captureFrame() ?? 'mock-frame'
    setCapturedBase64(base64)
    setPageState('analyzing')
    setAnalyzeStep(0)

    try {
      setAnalyzeStep(1)
      const response = await identifyInstrument(token, base64)
      setAnalyzeStep(2)

      const { state } = response.result
      if (state === 'budget_exhausted') {
        setPageState('budget_exhausted')
      } else if (state === 'match') {
        setAnalyzeStep(3)
        setPageState('match')
      } else if (state === 'shortlist') {
        setPageState('shortlist')
      } else if (state === 'filter_needed') {
        setPageState('filter_needed')
      } else {
        setPageState('idle')
        if (state === 'error') setErrorMessage(response.result.message)
      }
    } catch {
      setPageState('idle')
      setErrorMessage('Errore di connessione. Riprova.')
    }
  }, [captureFrame, pageState])

  const remainingScans = budget ? budget.dailyLimit - budget.usedToday : null

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

  if (pageState === 'analyzing') {
    const STEP_LABELS = [
      'Foto acquisita',
      'Estrazione features AI',
      'Ricerca catalogo',
      'Calcolo misura gambo',
    ]

    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: '#000' }}>
        {capturedBase64 && (
          <img
            src={`data:image/jpeg;base64,${capturedBase64}`}
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

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: '#000' }}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />

      <button
        onClick={() => navigate(-1)}
        style={{
          position: 'absolute', top: 16, left: 16, zIndex: 10,
          background: 'none', border: 'none', color: '#fff',
          fontSize: 28, cursor: 'pointer', padding: 8,
        }}
        aria-label="Chiudi scanner"
      >
        ✕
      </button>

      {pageState === 'idle' && <Viewfinder />}

      {pageState === 'idle' && (
        <div style={{
          position: 'absolute',
          top: '18%',
          left: 0, right: 0,
          textAlign: 'center',
          color: 'rgba(255,255,255,0.9)',
          fontSize: 14,
          textShadow: '0 1px 4px rgba(0,0,0,0.9)',
          pointerEvents: 'none',
        }}>
          Inquadra la fresa intera{' '}
          <span style={{ background: 'rgba(255,200,0,0.35)', borderRadius: 3, padding: '1px 4px' }}>
            incluso il gambo
          </span>
        </div>
      )}

      {pageState === 'idle' && (
        <div style={{
          position: 'absolute',
          bottom: 96,
          left: 0, right: 0,
          textAlign: 'center',
          color: 'rgba(255,255,255,0.7)',
          fontSize: 13,
          pointerEvents: 'none',
        }}>
          Tieni fermo e scatta
        </div>
      )}

      {errorMessage && (
        <div style={{
          position: 'absolute',
          bottom: 148,
          left: 16, right: 16,
          background: 'rgba(239, 68, 68, 0.15)',
          borderRadius: 8,
          padding: '8px 16px',
          color: '#f87171',
          fontSize: 13,
          textAlign: 'center',
        }}>
          {errorMessage}
        </div>
      )}

      {budget?.throttleLevel === 'warning' && (
        <div style={{
          position: 'absolute', bottom: 68, left: 16, right: 16,
          background: 'rgba(234, 179, 8, 0.15)', borderRadius: 8,
          padding: '8px 16px', color: '#eab308', fontSize: 13, fontWeight: 600,
          textAlign: 'center',
        }}>
          ⚠ Budget quasi esaurito — usa con parsimonia
        </div>
      )}

      {pageState === 'idle' && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          height: 80,
          background: 'rgba(0,0,0,0.75)',
          display: 'flex', alignItems: 'center',
          justifyContent: 'space-around',
          padding: '0 32px',
        }}>
          <button
            onClick={toggleFlash}
            style={{
              background: 'none', border: 'none',
              color: flashOn ? '#fbbf24' : '#fff',
              fontSize: 26, cursor: 'pointer', padding: 8,
            }}
            aria-label={flashOn ? 'Disattiva flash' : 'Attiva flash'}
          >
            ⚡
          </button>

          <button
            onClick={() => { void handleShutter() }}
            aria-label="Scatta foto"
            style={{
              width: 64, height: 64, borderRadius: '50%',
              background: '#fff', border: '4px solid rgba(255,255,255,0.5)',
              cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
            }}
          />

          <div style={{ textAlign: 'center', minWidth: 52 }}>
            {remainingScans !== null ? (
              <div style={{ color: '#22c55e', fontSize: 13, fontWeight: 700, lineHeight: 1.3 }}>
                {remainingScans} scan rimasti
              </div>
            ) : (
              <div style={{ color: '#6b7280', fontSize: 11 }}>—</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
