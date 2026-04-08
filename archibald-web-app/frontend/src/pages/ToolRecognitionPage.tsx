// archibald-web-app/frontend/src/pages/ToolRecognitionPage.tsx
import { useState, useEffect, useRef, useCallback, type RefCallback } from 'react'
import type { CSSProperties } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import {
  identifyInstrument,
  getRecognitionBudget,
  submitRecognitionFeedback,
  getCatalogPageImage,
} from '../api/recognition'
import type { IdentifyResponse, BudgetState } from '../api/recognition'

type PageState =
  | 'loading'
  | 'permission_denied'
  | 'idle'
  | 'analyzing'
  | 'match'
  | 'shortlist'
  | 'disambiguation_camera'
  | 'disambiguation_analyzing'
  | 'budget_exhausted'

function InstrumentGuide() {
  const bracket: CSSProperties = {
    position: 'absolute',
    width: 18,
    height: 18,
    borderColor: '#22c55e',
    borderStyle: 'solid',
    borderWidth: 0,
  }
  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      backgroundImage: 'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)',
      backgroundSize: '33.33% 33.33%',
      pointerEvents: 'none',
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{
          color: 'rgba(34,197,94,0.8)', fontSize: 10,
          fontWeight: 700, letterSpacing: 2, marginBottom: 8,
        }}>
          PUNTA
        </div>

        <div style={{
          position: 'relative',
          width: '22vw',
          height: '70vh',
          border: '1px solid rgba(34,197,94,0.3)',
          borderRadius: 4,
        }}>
          <div style={{ ...bracket, top: -1, left: -1, borderTopWidth: 2, borderLeftWidth: 2 }} />
          <div style={{ ...bracket, top: -1, right: -1, borderTopWidth: 2, borderRightWidth: 2 }} />
          <div style={{ ...bracket, bottom: -1, left: -1, borderBottomWidth: 2, borderLeftWidth: 2 }} />
          <div style={{ ...bracket, bottom: -1, right: -1, borderBottomWidth: 2, borderRightWidth: 2 }} />
          <div style={{
            position: 'absolute', left: '20%', right: '20%', top: '50%',
            height: 1, background: 'rgba(34,197,94,0.2)',
          }} />
        </div>

        <div style={{
          color: 'rgba(34,197,94,0.8)', fontSize: 10,
          fontWeight: 700, letterSpacing: 2, marginTop: 8,
        }}>
          BASE
        </div>
      </div>
    </div>
  )
}

function DisambiguationGuide() {
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
          fontWeight: 700, letterSpacing: 2, marginBottom: 8,
        }}>
          TESTA
        </div>
        <div style={{
          position: 'relative',
          width: '60vw',
          height: '38vh',
          border: '1px solid rgba(96,165,250,0.35)',
          borderRadius: 4,
        }}>
          <div style={{ ...bracket, top: -1, left: -1, borderTopWidth: 2, borderLeftWidth: 2 }} />
          <div style={{ ...bracket, top: -1, right: -1, borderTopWidth: 2, borderRightWidth: 2 }} />
          <div style={{ ...bracket, bottom: -1, left: -1, borderBottomWidth: 2, borderLeftWidth: 2 }} />
          <div style={{ ...bracket, bottom: -1, right: -1, borderBottomWidth: 2, borderRightWidth: 2 }} />
        </div>
        <div style={{
          color: 'rgba(96,165,250,0.8)', fontSize: 10,
          fontWeight: 700, letterSpacing: 2, marginTop: 8,
        }}>
          5–10 cm di distanza
        </div>
      </div>
    </div>
  )
}

function SizeBar({ sizeMm, maxSizeMm }: { sizeMm: number; maxSizeMm: number }) {
  const minH = 16, maxH = 40
  const h = minH + ((sizeMm / maxSizeMm) * (maxH - minH))
  return (
    <div style={{
      width: 6, height: h,
      background: 'linear-gradient(180deg, #ffd700, #c8a000)',
      borderRadius: 3,
      flexShrink: 0,
    }} />
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
  const [flashOn, setFlashOn] = useState(false)
  const [capturedBase64, setCapturedBase64] = useState<string | null>(null)
  const [analyzeStep, setAnalyzeStep] = useState(0)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [identifyResult, setIdentifyResult] = useState<IdentifyResponse | null>(null)
  // catalogPage images for shortlist candidates: productId → base64
  const [candidateCatalogImages, setCandidateCatalogImages] = useState<Record<string, string>>({})

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

    vibrate(30)  // P4: short haptic on capture
    const base64 = captureFrame() ?? 'mock-frame'
    setCapturedBase64(base64)
    setCandidateCatalogImages({})
    setPageState('analyzing')
    setAnalyzeStep(0)

    try {
      setAnalyzeStep(1)
      const response = await identifyInstrument(token, base64)
      setAnalyzeStep(2)
      setIdentifyResult(response)

      const { state } = response.result
      if (state === 'budget_exhausted') {
        setPageState('budget_exhausted')
      } else if (state === 'match') {
        setAnalyzeStep(3)
        vibrate([200, 50, 100])  // P4: success haptic pattern
        playSuccessBeep()         // P4: audio feedback
        setPageState('match')
      } else if (state === 'shortlist') {
        vibrate([80, 30, 80])    // P4: shorter haptic for shortlist (uncertain)
        setPageState('shortlist')
        // P3: fetch catalog page images for each candidate asynchronously
        const candidates = response.result.candidates
        const images: Record<string, string> = {}
        await Promise.all(
          candidates
            .filter(c => c.catalogPage != null)
            .map(async c => {
              const img = await getCatalogPageImage(token, c.catalogPage!)
              if (img) images[c.productId] = img
            })
        )
        setCandidateCatalogImages(images)
      } else {
        setPageState('idle')
        if (state === 'not_found') {
          setErrorMessage('Strumento non riconosciuto. Centra bene la fresa nella guida e riprova.')
        } else if (state === 'error') {
          setErrorMessage('Errore di analisi. Riprova.')
        }
      }
    } catch {
      setPageState('idle')
      setErrorMessage('Errore di connessione. Riprova.')
    }
  }, [captureFrame, pageState, vibrate, playSuccessBeep])

  const handleDisambiguationShutter = useCallback(async () => {
    if (pageState !== 'disambiguation_camera') return
    const token = localStorage.getItem('archibald_jwt')
    if (!token || identifyResult?.result.state !== 'shortlist') return

    vibrate(30)
    const base64 = captureFrame() ?? 'mock-frame'
    setCapturedBase64(base64)
    setPageState('disambiguation_analyzing')

    const candidateIds = identifyResult.result.candidates.map(c => c.productId)

    try {
      const response = await identifyInstrument(token, base64, candidateIds)
      setIdentifyResult(response)

      const { state } = response.result
      if (state === 'match') {
        vibrate([200, 50, 100])
        playSuccessBeep()
        setPageState('match')
      } else if (state === 'shortlist') {
        vibrate([80, 30, 80])
        setPageState('shortlist')
        const candidates = response.result.candidates
        const images: Record<string, string> = {}
        await Promise.all(
          candidates
            .filter(c => c.catalogPage != null)
            .map(async c => {
              const img = await getCatalogPageImage(token, c.catalogPage!)
              if (img) images[c.productId] = img
            })
        )
        setCandidateCatalogImages(images)
      } else {
        setPageState('shortlist')
        setErrorMessage('Non riesco a distinguere i candidati. Seleziona manualmente.')
      }
    } catch {
      setPageState('shortlist')
      setErrorMessage('Errore di connessione. Riprova.')
    }
  }, [captureFrame, identifyResult, pageState, vibrate, playSuccessBeep])

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
      'Analisi con AI  (30–60 s)',
      'Confronto con catalogo',
      'Identificazione',
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

  if (pageState === 'disambiguation_analyzing') {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: '#000' }}>
        {capturedBase64 && (
          <img
            src={`data:image/jpeg;base64,${capturedBase64}`}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.35, position: 'absolute', inset: 0 }}
          />
        )}
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 20,
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: '50%',
            border: '4px solid rgba(255,255,255,0.15)',
            borderTopColor: '#60a5fa',
            animation: 'spin 0.8s linear infinite',
          }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
          <div style={{ color: '#60a5fa', fontSize: 17, fontWeight: 600 }}>
            Analisi punta in corso...
          </div>
          <div style={{ color: '#6b7280', fontSize: 13 }}>~8 secondi</div>
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

  if (pageState === 'match' && identifyResult?.result.state === 'match') {
    const { product, confidence } = identifyResult.result
    const { imageHash } = identifyResult

    const handleOpenProduct = async () => {
      const token = localStorage.getItem('archibald_jwt')
      if (!token) return
      try {
        await submitRecognitionFeedback(token, { imageHash, productId: product.productId, confirmedByUser: true })
      } catch {
      }
      navigate(`/products/${encodeURIComponent(product.productId)}`, { state: { fromScanner: true } })
    }

    const confidencePct = Math.round(confidence * 100)
    const confidenceColor = confidence >= 0.9 ? '#22c55e' : confidence >= 0.75 ? '#4ade80' : '#f9a825'

    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: '#0a1f0a',
        display: 'flex', flexDirection: 'column', overflowY: 'auto',
      }}>
        {/* Header */}
        <div style={{
          background: '#0d2b0d',
          padding: '14px 20px',
          display: 'flex', alignItems: 'center', gap: 10,
          flexShrink: 0, borderBottom: '1px solid #1a3a1a',
        }}>
          <div style={{
            width: 26, height: 26, borderRadius: '50%',
            background: '#22c55e', color: '#000',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 900, flexShrink: 0,
          }}>✓</div>
          <span style={{ color: '#22c55e', fontWeight: 700, fontSize: 15, flex: 1 }}>
            Articolo identificato
          </span>
          <span style={{
            color: confidenceColor, fontSize: 13, fontWeight: 700,
            background: 'rgba(255,255,255,0.06)', borderRadius: 6, padding: '3px 8px',
          }}>
            {confidencePct}% conf.
          </span>
        </div>

        <div style={{ padding: '20px', flex: 1 }}>
          {/* Foto + identità prodotto */}
          <div style={{
            display: 'flex', gap: 16, alignItems: 'flex-start', marginBottom: 24,
          }}>
            {capturedBase64 && (
              <img
                src={`data:image/jpeg;base64,${capturedBase64}`}
                alt="Foto scansione"
                style={{
                  width: 80, height: 80, borderRadius: 10,
                  objectFit: 'cover', flexShrink: 0,
                  border: '2px solid #22c55e',
                }}
              />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: '#6b7280', fontSize: 12, marginBottom: 4 }}>
                {[product.familyCode, product.shankType?.toUpperCase()].filter(Boolean).join(' · ')}
              </div>
              <div style={{
                color: '#fff', fontSize: 18, fontWeight: 700,
                lineHeight: 1.3, marginBottom: 6, wordBreak: 'break-word',
              }}>
                {product.productName}
              </div>
              <div style={{
                fontFamily: 'monospace', color: '#9ca3af', fontSize: 14, letterSpacing: 1.5,
              }}>
                {product.productId}
              </div>
            </div>
          </div>

          {/* Info misura */}
          {product.headSizeMm > 0 && (
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
                Ø {product.headSizeMm} mm
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
            onClick={() => setPageState('idle')}
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

  if (pageState === 'shortlist' && identifyResult?.result.state === 'shortlist') {
    const { candidates } = identifyResult.result
    const maxSize = Math.max(...candidates.map(c => c.headSizeMm))

    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: '#111', overflowY: 'auto' }}>
        {/* Header */}
        <div style={{ padding: '14px 20px 14px', borderBottom: '1px solid #1f1f1f', background: '#141414' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {capturedBase64 && (
              <img
                src={`data:image/jpeg;base64,${capturedBase64}`}
                alt="Foto scansione"
                style={{
                  width: 52, height: 52, borderRadius: 8,
                  objectFit: 'cover', flexShrink: 0,
                  border: '2px solid #f9a825',
                }}
              />
            )}
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

          {/* Disambiguation CTA */}
          <button
            onClick={() => setPageState('disambiguation_camera')}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              background: 'rgba(37,99,235,0.15)',
              border: '1px solid rgba(96,165,250,0.5)',
              borderRadius: 12, padding: '13px 16px', marginBottom: 16,
              cursor: 'pointer',
            }}
          >
            <span style={{ fontSize: 20 }}>📷</span>
            <div style={{ textAlign: 'left' }}>
              <div style={{ color: '#60a5fa', fontWeight: 700, fontSize: 15 }}>
                Fotografa la punta da vicino
              </div>
              <div style={{ color: '#6b7280', fontSize: 12, marginTop: 2 }}>
                5–10 cm · toglie ogni dubbio
              </div>
            </div>
          </button>

          {candidates.map((c, idx) => {
            const isFirst = idx === 0
            const catalogImg = candidateCatalogImages[c.productId]
            return (
              <button
                key={c.productId}
                onClick={() => navigate(`/products/${encodeURIComponent(c.productId)}`, { state: { fromScanner: true } })}
                style={{
                  width: '100%', display: 'flex', alignItems: 'flex-start', gap: 12,
                  background: isFirst ? '#1f1a00' : '#1a1a1a',
                  border: `1px solid ${isFirst ? '#f9a825' : '#374151'}`,
                  borderRadius: 12,
                  padding: '14px 16px', marginBottom: 10,
                  cursor: 'pointer', textAlign: 'left',
                }}
              >
                {/* P3: catalog page thumbnail */}
                {catalogImg ? (
                  <img
                    src={`data:image/jpeg;base64,${catalogImg}`}
                    alt="Pagina catalogo"
                    style={{
                      width: 64, height: 80, objectFit: 'cover',
                      borderRadius: 6, flexShrink: 0,
                      border: `1px solid ${isFirst ? '#f9a825' : '#374151'}`,
                    }}
                  />
                ) : (
                  <SizeBar sizeMm={c.headSizeMm} maxSizeMm={maxSize} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: '#fff', fontWeight: 600, fontSize: 15 }}>{c.productName}</div>
                  <div style={{ color: '#9ca3af', fontSize: 13, marginTop: 2 }}>
                    <span style={{ fontFamily: 'monospace', letterSpacing: 1 }}>{c.productId}</span>
                    {c.headSizeMm > 0 && <span> · Ø {c.headSizeMm} mm</span>}
                  </div>
                </div>
                <div style={{ color: isFirst ? '#f9a825' : '#6b7280', fontSize: 13, fontWeight: isFirst ? 700 : 400, flexShrink: 0, paddingTop: 2 }}>
                  {Math.round(c.confidence * 100)}%
                </div>
              </button>
            )
          })}

          <button
            onClick={() => setPageState('idle')}
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

  const isDisambiguationCamera = pageState === 'disambiguation_camera'

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: '#000' }}>
      <video
        ref={videoCallbackRef}
        autoPlay
        playsInline
        muted
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />

      <button
        onClick={isDisambiguationCamera ? () => setPageState('shortlist') : () => navigate(-1)}
        style={{
          position: 'absolute', top: 16, left: 16, zIndex: 10,
          background: 'none', border: 'none', color: '#fff',
          fontSize: 28, cursor: 'pointer', padding: 8,
        }}
        aria-label={isDisambiguationCamera ? 'Torna alla lista' : 'Chiudi scanner'}
      >
        ✕
      </button>

      {!isDisambiguationCamera && <InstrumentGuide />}
      {isDisambiguationCamera && <DisambiguationGuide />}

      <div style={{
        position: 'absolute',
        top: '7%',
        left: 0, right: 0,
        textAlign: 'center',
        color: isDisambiguationCamera ? 'rgba(96,165,250,0.9)' : 'rgba(255,255,255,0.9)',
        fontSize: 13,
        textShadow: '0 1px 4px rgba(0,0,0,0.9)',
        pointerEvents: 'none',
      }}>
        {isDisambiguationCamera ? (
          <>Inquadra la testa della fresa ·{' '}
            <span style={{ background: 'rgba(96,165,250,0.25)', borderRadius: 3, padding: '1px 4px' }}>
              5–10 cm di distanza
            </span>
          </>
        ) : (
          <>Centra la fresa nella guida ·{' '}
            <span style={{ background: 'rgba(255,200,0,0.35)', borderRadius: 3, padding: '1px 4px' }}>
              15–20 cm di distanza
            </span>
          </>
        )}
      </div>

      {!isDisambiguationCamera && (
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
        <div
          onClick={() => setErrorMessage(null)}
          style={{
            position: 'absolute',
            bottom: 148,
            left: 16, right: 16,
            background: 'rgba(239, 68, 68, 0.15)',
            borderRadius: 8,
            padding: '10px 16px',
            color: '#f87171',
            fontSize: 13,
            textAlign: 'center',
            cursor: 'pointer',
          }}
        >
          {errorMessage}
          <div style={{ fontSize: 11, marginTop: 4, opacity: 0.7 }}>
            Tocca per chiudere · scatta di nuovo con il pulsante
          </div>
        </div>
      )}

      {!isDisambiguationCamera && budget?.throttleLevel === 'warning' && (
        <div style={{
          position: 'absolute', bottom: 68, left: 16, right: 16,
          background: 'rgba(234, 179, 8, 0.15)', borderRadius: 8,
          padding: '8px 16px', color: '#eab308', fontSize: 13, fontWeight: 600,
          textAlign: 'center',
        }}>
          ⚠ Budget quasi esaurito — usa con parsimonia
        </div>
      )}

      {/* Barra inferiore: idle → flash+shutter+budget | disambiguation_camera → solo shutter */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        height: 80,
        background: 'rgba(0,0,0,0.75)',
        display: 'flex', alignItems: 'center',
        justifyContent: isDisambiguationCamera ? 'center' : 'space-around',
        padding: '0 32px',
        gap: isDisambiguationCamera ? 0 : undefined,
      }}>
        {!isDisambiguationCamera && (
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
        )}

        <button
          onClick={isDisambiguationCamera
            ? () => { void handleDisambiguationShutter() }
            : () => { void handleShutter() }}
          aria-label={isDisambiguationCamera ? 'Scatta seconda foto' : 'Scatta foto'}
          style={{
            width: 64, height: 64, borderRadius: '50%',
            background: isDisambiguationCamera ? '#60a5fa' : '#fff',
            border: `4px solid ${isDisambiguationCamera ? 'rgba(96,165,250,0.5)' : 'rgba(255,255,255,0.5)'}`,
            cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
          }}
        />

        {!isDisambiguationCamera && (
          <div style={{ textAlign: 'center', minWidth: 52 }}>
            {remainingScans !== null ? (
              <div style={{ color: '#22c55e', fontSize: 13, fontWeight: 700, lineHeight: 1.3 }}>
                {remainingScans} scan rimasti
              </div>
            ) : (
              <div style={{ color: '#6b7280', fontSize: 11 }}>—</div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
