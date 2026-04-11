// archibald-web-app/frontend/src/pages/ToolRecognitionPage.tsx
import { useState, useEffect, useRef, useCallback, type RefCallback } from 'react'
import type { CSSProperties } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import {
  identifyInstrument,
  getRecognitionBudget,
  submitRecognitionFeedback,
} from '../api/recognition'
import { getProductVariants } from '../api/products'
import type { IdentifyResponse, BudgetState } from '../api/recognition'

type PageState =
  | 'loading'
  | 'permission_denied'
  | 'idle_photo1'
  | 'idle_photo2'
  | 'preview'
  | 'analyzing'
  | 'analyzing2'
  | 'match'
  | 'shortlist_visual'
  | 'photo2_request'
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

function TopDownGuide() {
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
          PUNTA — DALL'ALTO
        </div>
        <div style={{
          position: 'relative',
          width: '60vw',
          height: '60vw',
          borderRadius: '50%',
          border: '1.5px solid rgba(96,165,250,0.35)',
        }}>
          <div style={{ ...bracket, top: -1, left: -1, borderTopWidth: 2, borderLeftWidth: 2 }} />
          <div style={{ ...bracket, top: -1, right: -1, borderTopWidth: 2, borderRightWidth: 2 }} />
          <div style={{ ...bracket, bottom: -1, left: -1, borderBottomWidth: 2, borderLeftWidth: 2 }} />
          <div style={{ ...bracket, bottom: -1, right: -1, borderBottomWidth: 2, borderRightWidth: 2 }} />
          <div style={{
            position: 'absolute', top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 8, height: 8, borderRadius: '50%',
            background: 'rgba(96,165,250,0.5)',
          }} />
        </div>
        <div style={{
          color: 'rgba(96,165,250,0.8)', fontSize: 10,
          fontWeight: 700, letterSpacing: 2, marginTop: 12,
        }}>
          10–15 cm di distanza
        </div>
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

  const runIdentification = useCallback(async (images: string[]) => {
    const token = localStorage.getItem('archibald_jwt')
    if (!token) return
    setPageState(images.length === 2 ? 'analyzing2' : 'analyzing')
    setAnalyzeStep(0)
    setUsedPhotoCount(images.length)

    try {
      setAnalyzeStep(1)
      const response = await identifyInstrument(token, images)
      setAnalyzeStep(2)
      setIdentifyResult(response)

      const { state } = response.result
      if (state === 'budget_exhausted') {
        setPageState('budget_exhausted')
      } else if (state === 'match') {
        setAnalyzeStep(3)
        vibrate([200, 50, 100])
        playSuccessBeep()
        setPageState('match')
      } else if (state === 'photo2_request') {
        vibrate([80, 30, 80])
        setPageState('photo2_request')
      } else if (state === 'shortlist_visual') {
        vibrate([80, 30, 80])
        setPageState('shortlist_visual')
      } else {
        setPageState('idle_photo1')
        if (state === 'not_found') {
          setErrorMessage('Strumento non riconosciuto. Centra bene la fresa nella guida e riprova.')
        } else if (state === 'error') {
          setErrorMessage('Errore di analisi. Riprova.')
        }
      }
    } catch {
      setPageState('idle_photo1')
      setErrorMessage('Errore di connessione. Riprova.')
    }
  }, [vibrate, playSuccessBeep])

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

  const handlePhoto2Shutter = useCallback(async () => {
    if (pageState !== 'photo2_request') return
    vibrate(30)
    const base64 = captureFrame()
    if (!base64) return
    const allImages = [capturedImages[0] ?? base64, base64]
    setCapturedImages(allImages)
    await runIdentification(allImages)
  }, [captureFrame, capturedImages, pageState, runIdentification, vibrate])

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
    const isDiscontinued = product.discontinued === true

    const handleOpenProduct = async () => {
      if (isDiscontinued) return
      const token = localStorage.getItem('archibald_jwt')
      if (!token) return
      try {
        await submitRecognitionFeedback(token, { imageHash, productId: product.productId, confirmedByUser: true })
      } catch {
      }
      navigate(`/products/${encodeURIComponent(product.productId)}`, { state: { fromScanner: true } })
    }

    const confidencePct    = Math.round(confidence * 100)
    const confidenceColor  = confidence >= 0.9 ? '#22c55e' : confidence >= 0.75 ? '#4ade80' : '#f9a825'
    const accentColor      = isDiscontinued ? '#f97316' : '#22c55e'
    const accentDim        = isDiscontinued ? '#7c3c14' : '#1a3a1a'
    const headerBg         = isDiscontinued ? '#1a0e05' : '#0d2b0d'
    const pageBg           = isDiscontinued ? '#110a04' : '#0a1f0a'
    const borderColor      = isDiscontinued ? '#3a1f0a' : '#1a3a1a'

    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: pageBg,
        display: 'flex', flexDirection: 'column', overflowY: 'auto',
      }}>
        {/* Header */}
        <div style={{
          background: headerBg,
          padding: '14px 20px',
          display: 'flex', alignItems: 'center', gap: 10,
          flexShrink: 0, borderBottom: `1px solid ${borderColor}`,
        }}>
          <div style={{
            width: 26, height: 26, borderRadius: '50%',
            background: accentColor, color: '#000',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 900, flexShrink: 0,
          }}>{isDiscontinued ? '!' : '✓'}</div>
          <span style={{ color: accentColor, fontWeight: 700, fontSize: 15, flex: 1 }}>
            {isDiscontinued ? 'Articolo fuori produzione' : 'Articolo identificato'}
          </span>
          {usedPhotoCount > 1 && (
            <span style={{
              color: accentColor, fontSize: 11, fontWeight: 600,
              background: `rgba(255,255,255,0.06)`, borderRadius: 6, padding: '3px 8px',
              border: `1px solid ${accentDim}`, marginRight: 4,
            }}>
              {usedPhotoCount} foto
            </span>
          )}
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
            {capturedImages[0] && (
              <img
                src={`data:image/jpeg;base64,${capturedImages[0]}`}
                alt="Foto scansione"
                style={{
                  width: 80, height: 80, borderRadius: 10,
                  objectFit: 'cover', flexShrink: 0,
                  border: `2px solid ${accentColor}`,
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <div style={{
                  fontFamily: 'monospace', color: '#9ca3af', fontSize: 14, letterSpacing: 1.5,
                }}>
                  {product.productId}
                </div>
                {isDiscontinued && (
                  <span style={{
                    background: '#3a1205', color: '#f97316',
                    borderRadius: 6, padding: '2px 8px',
                    fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
                    border: '1px solid #7c3c14',
                  }}>
                    Non più in produzione
                  </span>
                )}
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
                  background: accentDim, color: accentColor,
                  borderRadius: 20, padding: '4px 12px', fontSize: 12, fontWeight: 600,
                  border: `1px solid ${accentDim}`,
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

          {isDiscontinued ? (
            <div style={{
              background: '#1a0e05', border: '1px solid #3a1f0a',
              borderRadius: 12, padding: '16px 20px', marginBottom: 20,
              color: '#d97706', fontSize: 14, lineHeight: 1.5,
            }}>
              Questo articolo è stato identificato nel catalogo Komet ma non è più disponibile per l&apos;acquisto.
            </div>
          ) : (
            <>
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
            </>
          )}

          <button
            onClick={() => { setCapturedImages([]); setPageState('idle_photo1') }}
            style={{
              width: '100%', background: 'transparent',
              border: `1px solid ${borderColor}`, borderRadius: 12, padding: '12px 0',
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

  if (pageState === 'shortlist_visual' && identifyResult?.result.state === 'shortlist_visual') {
    const { candidates } = identifyResult.result
    const { imageHash } = identifyResult

    const handleOpenCandidate = async (familyCode: string) => {
      const token = localStorage.getItem('archibald_jwt')
      if (token) {
        try {
          await submitRecognitionFeedback(token, { imageHash, productId: familyCode, confirmedByUser: true })
        } catch {
        }
        try {
          const variantsData = await getProductVariants(token, familyCode)
          const variants = variantsData.data?.variants ?? []
          const firstVariantId = variants[0]?.productId
          if (firstVariantId) {
            navigate(`/products/${encodeURIComponent(firstVariantId)}`, { state: { fromScanner: true } })
            return
          }
        } catch {
        }
      }
      navigate(`/products/${encodeURIComponent(familyCode)}`, { state: { fromScanner: true } })
    }

    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: '#111', overflowY: 'auto' }}>
        {/* Header */}
        <div style={{ padding: '14px 20px 14px', borderBottom: '1px solid #1f1f1f', background: '#141414' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {capturedImages[0] && (
              <img
                src={`data:image/jpeg;base64,${capturedImages[0]}`}
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
                  src={`data:image/jpeg;base64,${stripUrl}`}
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
            return (
              <button
                key={c.familyCode}
                onClick={() => { void handleOpenCandidate(c.familyCode) }}
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
                    src={`data:image/jpeg;base64,${c.thumbnailUrl}`}
                    alt="Strip campionario"
                    style={{
                      width: 64, height: 64, objectFit: 'cover',
                      borderRadius: 6, flexShrink: 0,
                      border: `1px solid ${isFirst ? '#f9a825' : '#374151'}`,
                    }}
                  />
                ) : (
                  <div style={{
                    width: 64, height: 64, borderRadius: 6, flexShrink: 0,
                    background: '#2a2a2a', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: `1px solid ${isFirst ? '#f9a825' : '#374151'}`,
                  }}>
                    <span style={{ color: '#6b7280', fontSize: 22 }}>🔩</span>
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: '#fff', fontWeight: 600, fontSize: 15 }}>{c.familyCode}</div>
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

  if (pageState === 'photo2_request') {
    const instruction = identifyResult?.result.state === 'photo2_request'
      ? identifyResult.result.instruction
      : null

    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: '#0f0f0f', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 20, padding: 32,
      }}>
        <div style={{ fontSize: 52 }}>📷</div>
        <div style={{ color: '#fbbf24', fontWeight: 700, fontSize: 18 }}>
          Ho bisogno di un&apos;altra foto
        </div>
        {instruction && (
          <div style={{
            color: '#e5e7eb', fontSize: 15, textAlign: 'center',
            maxWidth: 320, lineHeight: 1.6, fontStyle: 'italic',
          }}>
            «{instruction}»
          </div>
        )}
        <button
          onClick={() => { void handlePhoto2Shutter() }}
          style={{
            marginTop: 8, background: 'rgba(245,158,11,0.25)',
            border: '1px solid rgba(245,158,11,0.5)', color: '#fbbf24',
            borderRadius: 10, padding: '14px 32px', fontSize: 16,
            fontWeight: 700, cursor: 'pointer',
          }}
        >
          Scatta ora
        </button>
        <button
          onClick={() => setPageState('idle_photo1')}
          style={{ color: '#6b7280', background: 'none', border: 'none', fontSize: 14, cursor: 'pointer', marginTop: 4 }}
        >
          Annulla
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
            {isPhoto2 ? 'Vista dall\'Alto' : 'Vista Laterale'}
          </div>
          <div style={{ color: '#8B90A0', fontSize: 14 }}>
            {isPhoto2
              ? 'Fotografa la punta dello strumento dall\'alto verso il basso'
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
            {isPhoto2 ? <TopDownGuide /> : <InstrumentGuide />}
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
