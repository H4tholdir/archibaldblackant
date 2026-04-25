import { computePxPerMm } from '../utils/aruco-compute'

type WorkerInput  = { imageData: ImageData }
type WorkerOutput = { detected: boolean; pxPerMm: number | null }

// js-aruco2 è CJS — require necessario nel contesto worker/Vite
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ARLib = require('js-aruco2') as Record<string, Record<string, new () => {
  detect(imageData: ImageData): Array<{ id: number; corners: Array<{ x: number; y: number }> }>
}>>

type DetectorCtor = new () => { detect(imageData: ImageData): Array<{ id: number; corners: Array<{ x: number; y: number }> }> }

const ARLibAny = ARLib as unknown as Record<string, DetectorCtor>
const ARNamespace = ARLib.AR as unknown as Record<string, DetectorCtor> | undefined

const DetectorClass: DetectorCtor =
  ARNamespace?.Detector ??
  ARNamespace?.AR_Detector ??
  ARLibAny.Detector ??
  ARLibAny.AR_Detector

const detector = new DetectorClass()

self.onmessage = (event: MessageEvent<WorkerInput>) => {
  try {
    const markers = detector.detect(event.data.imageData)
    const marker42 = markers.find(m => m.id === 42)

    if (!marker42 || marker42.corners.length !== 4) {
      self.postMessage({ detected: false, pxPerMm: null } satisfies WorkerOutput)
      return
    }

    const pxPerMm = computePxPerMm(marker42.corners)
    self.postMessage({ detected: true, pxPerMm } satisfies WorkerOutput)
  } catch {
    self.postMessage({ detected: false, pxPerMm: null } satisfies WorkerOutput)
  }
}
