import { useState, useCallback } from "react";
import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";

interface PhotoCropModalProps {
  imageSrc: string;
  onConfirm: (blob: Blob) => void;
  onCancel: () => void;
}

function getCroppedImg(
  imageSrc: string,
  pixelCrop: Area,
  rotation: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const rotationRad = (rotation * Math.PI) / 180;
      const sin = Math.abs(Math.sin(rotationRad));
      const cos = Math.abs(Math.cos(rotationRad));
      const rotatedWidth = Math.round(image.width * cos + image.height * sin);
      const rotatedHeight = Math.round(image.width * sin + image.height * cos);

      const rotationCanvas = document.createElement("canvas");
      rotationCanvas.width = rotatedWidth;
      rotationCanvas.height = rotatedHeight;
      const rotCtx = rotationCanvas.getContext("2d");
      if (!rotCtx) {
        reject(new Error("Canvas context non disponibile"));
        return;
      }
      rotCtx.translate(rotatedWidth / 2, rotatedHeight / 2);
      rotCtx.rotate(rotationRad);
      rotCtx.drawImage(image, -image.width / 2, -image.height / 2);

      const cropCanvas = document.createElement("canvas");
      cropCanvas.width = pixelCrop.width;
      cropCanvas.height = pixelCrop.height;
      const cropCtx = cropCanvas.getContext("2d");
      if (!cropCtx) {
        reject(new Error("Canvas context non disponibile"));
        return;
      }
      cropCtx.drawImage(
        rotationCanvas,
        pixelCrop.x,
        pixelCrop.y,
        pixelCrop.width,
        pixelCrop.height,
        0,
        0,
        pixelCrop.width,
        pixelCrop.height,
      );
      cropCanvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error("Crop immagine fallito"));
        },
        "image/jpeg",
        0.9,
      );
    };
    image.onerror = () => reject(new Error("Impossibile caricare l'immagine"));
    image.src = imageSrc;
  });
}

export function PhotoCropModal({
  imageSrc,
  onConfirm,
  onCancel,
}: PhotoCropModalProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const onCropComplete = useCallback(
    (_croppedArea: Area, croppedPixels: Area) => {
      setCroppedAreaPixels(croppedPixels);
    },
    [],
  );

  const handleConfirm = async () => {
    if (!croppedAreaPixels) return;
    setIsProcessing(true);
    try {
      const blob = await getCroppedImg(imageSrc, croppedAreaPixels, rotation);
      onConfirm(blob);
    } catch (error) {
      console.error("[PhotoCropModal] Crop failed:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.85)",
        zIndex: 10000,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          position: "relative",
          flex: 1,
          minHeight: 0,
        }}
      >
        <Cropper
          image={imageSrc}
          crop={crop}
          zoom={zoom}
          rotation={rotation}
          aspect={1}
          cropShape="round"
          showGrid={false}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onRotationChange={setRotation}
          onCropComplete={onCropComplete}
        />
      </div>

      <div
        style={{
          padding: "16px 24px",
          backgroundColor: "rgba(0, 0, 0, 0.9)",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
          alignItems: "center",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            width: "100%",
            maxWidth: "300px",
          }}
        >
          <span style={{ color: "#fff", fontSize: "13px" }}>-</span>
          <input autoComplete="off"
            type="range"
            min={1}
            max={3}
            step={0.1}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            style={{
              flex: 1,
              accentColor: "#1976d2",
            }}
          />
          <span style={{ color: "#fff", fontSize: "13px" }}>+</span>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            width: "100%",
            maxWidth: "300px",
          }}
        >
          <span style={{ color: "#fff", fontSize: "13px" }}>↺</span>
          <input autoComplete="off"
            type="range"
            min={-45}
            max={45}
            step={1}
            value={rotation}
            onChange={(e) => setRotation(Number(e.target.value))}
            style={{
              flex: 1,
              accentColor: "#1976d2",
            }}
          />
          <span style={{ color: "#fff", fontSize: "13px" }}>↻</span>
          <span style={{ color: "#aaa", fontSize: "12px", minWidth: "30px", textAlign: "right" }}>
            {rotation}°
          </span>
        </div>

        <div style={{ display: "flex", gap: "12px" }}>
          <button
            onClick={onCancel}
            disabled={isProcessing}
            style={{
              padding: "10px 24px",
              fontSize: "14px",
              fontWeight: 600,
              backgroundColor: "transparent",
              color: "#fff",
              border: "1px solid #fff",
              borderRadius: "8px",
              cursor: isProcessing ? "not-allowed" : "pointer",
              opacity: isProcessing ? 0.5 : 1,
            }}
          >
            Annulla
          </button>
          <button
            onClick={handleConfirm}
            disabled={isProcessing}
            style={{
              padding: "10px 24px",
              fontSize: "14px",
              fontWeight: 600,
              backgroundColor: "#4caf50",
              color: "#fff",
              border: "none",
              borderRadius: "8px",
              cursor: isProcessing ? "not-allowed" : "pointer",
              opacity: isProcessing ? 0.7 : 1,
            }}
          >
            {isProcessing ? "Elaborazione..." : "Conferma"}
          </button>
        </div>
      </div>
    </div>
  );
}
