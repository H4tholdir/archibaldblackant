import { useState, useEffect } from "react";
import { useKeyboardScroll } from "../hooks/useKeyboardScroll";

type EmailShareDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  onSend: (to: string, subject: string, body: string) => void;
  defaultEmail: string;
  customerName: string;
  isLoading: boolean;
};

export function EmailShareDialog({
  isOpen,
  onClose,
  onSend,
  defaultEmail,
  customerName,
  isLoading,
}: EmailShareDialogProps) {
  const {
    scrollFieldIntoView,
    modalOverlayKeyboardStyle,
    keyboardPaddingStyle,
  } = useKeyboardScroll();
  const [to, setTo] = useState(defaultEmail);
  const [subject, setSubject] = useState(`Preventivo - ${customerName}`);
  const [body, setBody] = useState(
    `Gentile ${customerName},\n\nin allegato il preventivo richiesto.\n\nCordiali saluti`,
  );

  useEffect(() => {
    if (isOpen) {
      setTo(defaultEmail);
      setSubject(`Preventivo - ${customerName}`);
      setBody(
        `Gentile ${customerName},\n\nin allegato il preventivo richiesto.\n\nCordiali saluti`,
      );
    }
  }, [isOpen, defaultEmail, customerName]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        ...modalOverlayKeyboardStyle,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: "white",
          borderRadius: "8px",
          padding: "24px",
          width: "90vw",
          maxWidth: "500px",
          boxShadow: "0 4px 20px rgba(0, 0, 0, 0.15)",
          ...keyboardPaddingStyle,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          style={{
            margin: "0 0 20px 0",
            fontSize: "20px",
            fontWeight: 600,
            color: "#333",
          }}
        >
          Invia preventivo via Email
        </h2>

        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div>
            <label
              style={{
                display: "block",
                marginBottom: "4px",
                fontSize: "14px",
                fontWeight: 500,
                color: "#555",
              }}
            >
              Destinatario
            </label>
            <input
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              onFocus={(e) => scrollFieldIntoView(e.target as HTMLElement)}
              placeholder="email@esempio.com"
              style={{
                width: "100%",
                padding: "10px 12px",
                border: "1px solid #ddd",
                borderRadius: "6px",
                fontSize: "14px",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div>
            <label
              style={{
                display: "block",
                marginBottom: "4px",
                fontSize: "14px",
                fontWeight: 500,
                color: "#555",
              }}
            >
              Oggetto
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              onFocus={(e) => scrollFieldIntoView(e.target as HTMLElement)}
              style={{
                width: "100%",
                padding: "10px 12px",
                border: "1px solid #ddd",
                borderRadius: "6px",
                fontSize: "14px",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div>
            <label
              style={{
                display: "block",
                marginBottom: "4px",
                fontSize: "14px",
                fontWeight: 500,
                color: "#555",
              }}
            >
              Messaggio
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onFocus={(e) => scrollFieldIntoView(e.target as HTMLElement)}
              rows={5}
              style={{
                width: "100%",
                padding: "10px 12px",
                border: "1px solid #ddd",
                borderRadius: "6px",
                fontSize: "14px",
                resize: "vertical",
                boxSizing: "border-box",
                fontFamily: "inherit",
              }}
            />
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: "12px",
            marginTop: "24px",
          }}
        >
          <button
            onClick={onClose}
            disabled={isLoading}
            style={{
              padding: "10px 24px",
              backgroundColor: "#f3f4f6",
              color: "#374151",
              border: "1px solid #d1d5db",
              borderRadius: "6px",
              cursor: isLoading ? "not-allowed" : "pointer",
              fontWeight: 500,
              fontSize: "14px",
            }}
          >
            Annulla
          </button>
          <button
            onClick={() => onSend(to, subject, body)}
            disabled={isLoading || !to}
            style={{
              padding: "10px 24px",
              backgroundColor: isLoading || !to ? "#9ca3af" : "#ea580c",
              color: "white",
              border: "none",
              borderRadius: "6px",
              cursor: isLoading || !to ? "not-allowed" : "pointer",
              fontWeight: 600,
              fontSize: "14px",
            }}
          >
            {isLoading ? "Invio in corso..." : "Invia"}
          </button>
        </div>
      </div>
    </div>
  );
}
