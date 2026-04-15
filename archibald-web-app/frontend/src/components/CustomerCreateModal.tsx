import { useState, useRef, useEffect } from "react";
import { useKeyboardScroll } from "../hooks/useKeyboardScroll";
import { customerService } from "../services/customers.service";
import { PAYMENT_TERMS, DEFAULT_PAYMENT_TERM_ID } from "../data/payment-terms";
import { DELIVERY_MODES, DEFAULT_DELIVERY_MODE } from "../data/delivery-modes";
import { CAP_BY_CODE } from "../data/cap-list";
import type { CapEntry } from "../data/cap-list";
import { useWebSocketContext } from "../contexts/WebSocketContext";
import { useOperationTracking } from "../contexts/OperationTrackingContext";

import type { CustomerFormData, AddressEntry } from "../types/customer-form-data";
import type { VatLookupResult } from "../types/vat-lookup-result";

type WizardStep =
  | { kind: "vat" }
  | { kind: "anagrafica" }
  | { kind: "indirizzo" }
  | { kind: "contatti" }
  | { kind: "commerciale" }
  | { kind: "indirizzi-alt" }
  | { kind: "riepilogo" };

const STEP_ORDER: WizardStep["kind"][] = [
  "vat",
  "anagrafica",
  "indirizzo",
  "contatti",
  "commerciale",
  "indirizzi-alt",
  "riepilogo",
];

const STEP_LABELS: Record<WizardStep["kind"], string> = {
  vat: "Partita IVA",
  anagrafica: "Anagrafica",
  indirizzo: "Indirizzo",
  contatti: "Contatti",
  commerciale: "Dati commerciali",
  "indirizzi-alt": "Indirizzi alternativi",
  riepilogo: "Riepilogo",
};

interface CustomerCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  onJobDispatched?: (taskId: string) => void;
  prefillName?: string;
}

const INITIAL_FORM: CustomerFormData = {
  name: "",
  deliveryMode: DEFAULT_DELIVERY_MODE,
  vatNumber: "",
  paymentTerms: DEFAULT_PAYMENT_TERM_ID,
  pec: "",
  sdi: "",
  street: "",
  postalCode: "",
  phone: "+39",
  mobile: "+39",
  email: "",
  url: "",
  postalCodeCity: "",
  postalCodeCountry: "",
  fiscalCode: "",
  sector: "",
  attentionTo: "",
  notes: "",
  county: "",
  state: "",
  country: "",
  addresses: [],
};

function getPaymentTermDisplay(id: string): string {
  const term = PAYMENT_TERMS.find((t) => t.id === id);
  return term ? `${term.id} - ${term.descrizione}` : id;
}

function getCapCityDisplay(cap: string, city: string): string {
  if (!city) return cap;
  return `${cap} - ${city}`;
}

export function CustomerCreateModal({
  isOpen,
  onClose,
  onSaved,
  onJobDispatched,
  prefillName,
}: CustomerCreateModalProps) {
  const [currentStep, setCurrentStep] = useState<WizardStep>({ kind: "vat" });
  const [formData, setFormData] = useState<CustomerFormData>({ ...INITIAL_FORM });
  const formDataRef = useRef<CustomerFormData>({ ...INITIAL_FORM });

  const [interactiveSessionId, setInteractiveSessionId] = useState<string | null>(null);
  const interactiveSessionIdRef = useRef<string | null>(null);
  const vatErpTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Prevents late-arriving WS events from acting after ERP check is already resolved.
  const erpCheckResolvedRef = useRef(false);
  const [erpValidated, setErpValidated] = useState(false);

  const [vatChecking, setVatChecking] = useState(false);
  const [vatError, setVatError] = useState<string | null>(null);

  const [capDisambigEntries, setCapDisambigEntries] = useState<CapEntry[]>([]);
  const [altAddressCapDisambig, setAltAddressCapDisambig] = useState<CapEntry[] | null>(null);

  const [localAddresses, setLocalAddresses] = useState<AddressEntry[]>([]);
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [addressForm, setAddressForm] = useState<AddressEntry>({
    tipo: "Consegna",
    via: "",
    cap: "",
    citta: "",
    nome: "",
  });

  const [paymentTermsSearch, setPaymentTermsSearch] = useState("");
  const [paymentTermsHighlight, setPaymentTermsHighlight] = useState(0);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { subscribe } = useWebSocketContext();
  const { trackOperation } = useOperationTracking();
  const {
    scrollFieldIntoView,
    modalOverlayKeyboardStyle,
    keyboardPaddingStyle,
  } = useKeyboardScroll();

  const isMobile = window.innerWidth < 640;
  const isDesktop = window.innerWidth >= 1024;

  // --- Ref syncs ---
  useEffect(() => {
    formDataRef.current = formData;
  }, [formData]);
  useEffect(() => {
    interactiveSessionIdRef.current = interactiveSessionId;
  }, [interactiveSessionId]);

  // --- Reset on open / cleanup on close ---
  useEffect(() => {
    if (isOpen) {
      if (vatErpTimeoutRef.current) {
        clearTimeout(vatErpTimeoutRef.current);
        vatErpTimeoutRef.current = null;
      }
      erpCheckResolvedRef.current = false;
      const initial = { ...INITIAL_FORM };
      if (prefillName) initial.name = prefillName;
      setFormData(initial);
      setCurrentStep({ kind: "vat" });
      setInteractiveSessionId(null);
      setErpValidated(false);
      setVatChecking(false);
      setVatError(null);
      setCapDisambigEntries([]);
      setAltAddressCapDisambig(null);
      setLocalAddresses([]);
      setShowAddressForm(false);
      setAddressForm({ tipo: "Consegna", via: "", cap: "", citta: "", nome: "" });
      setPaymentTermsSearch("");
      setPaymentTermsHighlight(0);
      setSaving(false);
      setError(null);
    } else {
      if (vatErpTimeoutRef.current) {
        clearTimeout(vatErpTimeoutRef.current);
        vatErpTimeoutRef.current = null;
      }
      if (interactiveSessionIdRef.current) {
        customerService
          .cancelInteractiveSession(interactiveSessionIdRef.current)
          .catch(() => {});
      }
    }
  }, [isOpen, prefillName]);

  // --- Heartbeat (45s) ---
  useEffect(() => {
    if (!interactiveSessionId) return;
    const timer = setInterval(() => {
      customerService.heartbeat(interactiveSessionId);
    }, 45_000);
    return () => clearInterval(timer);
  }, [interactiveSessionId]);

  // --- WebSocket: CUSTOMER_VAT_RESULT + CUSTOMER_INTERACTIVE_FAILED ---
  useEffect(() => {
    if (!interactiveSessionId) return;
    const unsubs: Array<() => void> = [];

    const resolveErpCheck = () => {
      if (vatErpTimeoutRef.current) {
        clearTimeout(vatErpTimeoutRef.current);
        vatErpTimeoutRef.current = null;
      }
      erpCheckResolvedRef.current = true;
      setVatChecking(false);
    };

    unsubs.push(
      subscribe("CUSTOMER_VAT_RESULT", (payload: unknown) => {
        const p = payload as { sessionId: string; vatResult: VatLookupResult };
        if (p.sessionId !== interactiveSessionIdRef.current) return;
        if (erpCheckResolvedRef.current) return;
        const r = p.vatResult;
        setErpValidated(true);
        setFormData((prev) => ({
          ...prev,
          name: prev.name || r.parsed?.companyName || "",
          fiscalCode: prev.fiscalCode,
          pec: prev.pec || r.pec || "",
          sdi: prev.sdi || r.sdi || "",
          street: prev.street || r.parsed?.street || "",
          postalCode: prev.postalCode || r.parsed?.postalCode || "",
          postalCodeCity: prev.postalCodeCity || r.parsed?.city || "",
        }));
        resolveErpCheck();
        setCurrentStep({ kind: "anagrafica" });
      }),
    );

    unsubs.push(
      subscribe("CUSTOMER_INTERACTIVE_FAILED", (payload: unknown) => {
        const p = payload as { sessionId: string; error?: string };
        if (p.sessionId !== interactiveSessionIdRef.current) return;
        if (erpCheckResolvedRef.current) return;
        resolveErpCheck();
        setInteractiveSessionId(null);
        setVatError(
          p.error ?? "Verifica ERP non riuscita. Controlla la P.IVA e riprova.",
        );
      }),
    );

    unsubs.push(
      subscribe("CUSTOMER_VAT_DUPLICATE", (payload: unknown) => {
        const p = payload as { sessionId: string; erpCustomerId: string };
        if (p.sessionId !== interactiveSessionIdRef.current) return;
        if (erpCheckResolvedRef.current) return;
        // Session was already destroyed on backend — clear it on frontend too.
        resolveErpCheck();
        setInteractiveSessionId(null);
        setCurrentStep({ kind: "vat" });
        setVatError(
          `Questo cliente esiste già nell'ERP (ID: ${p.erpCustomerId}). Contatta il Servizio Clienti.`,
        );
      }),
    );

    return () => unsubs.forEach((u) => u());
  }, [interactiveSessionId, subscribe]);

  // ESC handler
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // --- Navigation ---
  const currentStepIndex = STEP_ORDER.indexOf(currentStep.kind);

  const goForward = () => {
    if (currentStepIndex < STEP_ORDER.length - 1) {
      setCurrentStep({ kind: STEP_ORDER[currentStepIndex + 1] });
    }
  };

  const goBack = () => {
    if (currentStepIndex > 0) {
      setCurrentStep({ kind: STEP_ORDER[currentStepIndex - 1] });
    }
  };

  // --- CAP resolution helpers ---
  const resolveCapAndAdvance = (capValue: string, nextStepFn: () => void) => {
    if (!capValue || capValue.length < 5) {
      nextStepFn();
      return;
    }
    const entries = CAP_BY_CODE.get(capValue);
    if (!entries || entries.length <= 1) {
      if (entries && entries.length === 1) {
        setFormData((prev) => ({
          ...prev,
          postalCodeCity: entries[0].citta,
          postalCodeCountry: entries[0].paese,
          county: entries[0].contea,
          state: entries[0].stato,
          country: entries[0].paese,
        }));
      }
      nextStepFn();
      return;
    }
    // If the user already picked a city from the disambiguation list, skip it
    const alreadySelected = formData.postalCodeCity &&
      entries.some((e) => e.citta === formData.postalCodeCity);
    if (alreadySelected) {
      nextStepFn();
      return;
    }
    setCapDisambigEntries(entries);
  };

  const handleCapDisambiguationSelect = (entry: CapEntry) => {
    setFormData((prev) => ({
      ...prev,
      postalCodeCity: entry.citta,
      postalCodeCountry: entry.paese,
      county: entry.contea,
      state: entry.stato,
      country: entry.paese,
    }));
    setCapDisambigEntries([]);
  };

  const resolveAddressCap = (capValue: string) => {
    if (!capValue || capValue.length < 5) return;
    const entries = CAP_BY_CODE.get(capValue);
    if (!entries || entries.length === 0) return;
    if (entries.length === 1) {
      setAddressForm((f) => ({
        ...f,
        citta: entries[0].citta,
        contea: entries[0].contea,
        stato: entries[0].stato,
      }));
      setAltAddressCapDisambig(null);
    } else {
      setAltAddressCapDisambig(entries);
    }
  };

  // --- VAT verification ---
  const handleVerifyVat = async () => {
    const vat = formData.vatNumber.trim();
    if (!vat) return;

    setVatChecking(true);
    setVatError(null);
    erpCheckResolvedRef.current = false;

    // True only when the ERP check is running and WS handler will clear vatChecking.
    let erpCheckWaiting = false;

    try {
      const result = await customerService.checkVat(vat);

      if (!result.valid) {
        setVatError("P.IVA non valida — verifica il numero inserito");
        return;
      }

      if (result.alreadyExists) {
        const label = result.existingName
          ? `${result.existingName}${result.existingCode ? ` (cod. ${result.existingCode})` : ""}`
          : result.existingCode ?? "";
        setVatError(
          `Questo cliente esiste già nel sistema${label ? `: ${label}` : ""}`,
        );
        return;
      }

      if (result.name) {
        setFormData((f) => ({ ...f, name: f.name || result.name! }));
      }

      // ERP check phase: remain on step 1 with spinner while bot validates.
      // vatChecking stays true; derived spinner label uses interactiveSessionId.
      // WS handlers (VAT_RESULT / INTERACTIVE_FAILED / VAT_DUPLICATE) clear it and advance.
      const safetyTimer = setTimeout(() => {
        vatErpTimeoutRef.current = null;
        if (erpCheckResolvedRef.current) return;
        erpCheckResolvedRef.current = true;
        setVatChecking(false);
        setCurrentStep({ kind: "anagrafica" });
      }, 30_000);
      vatErpTimeoutRef.current = safetyTimer;

      try {
        const { sessionId } = await customerService.beginInteractiveSession(vat);
        setInteractiveSessionId(sessionId);
        erpCheckWaiting = true; // WS handler takes over from here
      } catch {
        clearTimeout(safetyTimer);
        vatErpTimeoutRef.current = null;
        setCurrentStep({ kind: "anagrafica" });
      }
    } catch {
      setVatError("Errore durante la verifica. Riprova.");
    } finally {
      if (!erpCheckWaiting) {
        setVatChecking(false);
      }
    }
  };

  // --- Save logic ---
  const performSave = async () => {
    setSaving(true);
    setError(null);

    try {
      const dataToSend: CustomerFormData = {
        ...formData,
        addresses: localAddresses,
        phone: formData.phone !== "+39" ? formData.phone : "",
        mobile: formData.mobile !== "+39" ? formData.mobile : "",
      };

      if (!interactiveSessionId) {
        setError("Sessione ERP non disponibile. Torna al primo passo e verifica la P.IVA.");
        return;
      }

      const { taskId: resultTaskId } = await customerService.saveInteractiveCustomer(
        interactiveSessionId,
        dataToSend,
      );

      if (resultTaskId) {
        const displayName = formData.name || "Nuovo cliente";
        trackOperation(resultTaskId, resultTaskId, displayName, "Creazione in corso...", "Cliente creato", "/customers");
        onJobDispatched?.(resultTaskId);
        onClose();
      } else {
        onSaved();
        onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore durante il salvataggio");
    } finally {
      setSaving(false);
    }
  };

  const handleSave = () => {
    void performSave();
  };

  // --- Payment terms search ---
  const filteredPaymentTerms = (() => {
    if (!paymentTermsSearch) return PAYMENT_TERMS;
    const q = paymentTermsSearch.toLowerCase();
    return PAYMENT_TERMS.filter(
      (t) =>
        t.id.toLowerCase().includes(q) ||
        t.descrizione.toLowerCase().includes(q),
    );
  })();

  const handlePaymentTermsKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setPaymentTermsHighlight((prev) =>
        Math.min(prev + 1, filteredPaymentTerms.length - 1),
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setPaymentTermsHighlight((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filteredPaymentTerms.length > 0) {
        setFormData((f) => ({
          ...f,
          paymentTerms: filteredPaymentTerms[paymentTermsHighlight].id,
        }));
        setPaymentTermsSearch("");
        setPaymentTermsHighlight(0);
      }
    }
  };

  // --- Step advance for indirizzo (with CAP resolution) ---
  const handleIndirizzoForward = () => {
    if (formData.postalCode && formData.postalCode.length === 5) {
      resolveCapAndAdvance(formData.postalCode, goForward);
    } else {
      goForward();
    }
  };

  // --- Summary data rows ---
  const summaryFields: Array<{ label: string; value: string }> = [
    { label: "P.IVA", value: formData.vatNumber },
    { label: "Nome", value: formData.name },
    { label: "Codice Fiscale", value: formData.fiscalCode || "" },
    { label: "Settore", value: formData.sector || "" },
    { label: "Via", value: formData.street },
    {
      label: "CAP / Citta",
      value: formData.postalCode
        ? getCapCityDisplay(formData.postalCode, formData.postalCodeCity)
        : "",
    },
    { label: "Telefono", value: formData.phone !== "+39" ? formData.phone : "" },
    { label: "Cellulare", value: formData.mobile !== "+39" ? formData.mobile : "" },
    { label: "Email", value: formData.email },
    { label: "Sito web", value: formData.url },
    { label: "PEC", value: formData.pec },
    { label: "SDI", value: formData.sdi },
    { label: "All'attenzione di", value: formData.attentionTo || "" },
    { label: "Consegna", value: formData.deliveryMode },
    {
      label: "Pagamento",
      value: getPaymentTermDisplay(formData.paymentTerms),
    },
    { label: "Note", value: formData.notes || "" },
  ].filter((row) => row.value.trim().length > 0);

  const handleBackdropClick = () => {
    // click fuori non chiude mai la modale — solo ESC o la X
  };

  // --- Render ---
  return (
    <div
      onClick={handleBackdropClick}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: isMobile ? "white" : "rgba(0, 0, 0, 0.5)",
        display: "flex",
        alignItems: isMobile ? "flex-start" : "center",
        justifyContent: "center",
        zIndex: 10000,
        backdropFilter: isMobile ? "none" : "blur(4px)",
        overflowY: isMobile ? "auto" : "visible",
        ...(!isMobile ? modalOverlayKeyboardStyle : {}),
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: "#fff",
          borderRadius: isMobile ? "0" : "16px",
          padding: isMobile ? "12px 16px" : "32px",
          maxWidth: isMobile ? "100%" : isDesktop ? "580px" : "500px",
          width: isMobile ? "100%" : "90%",
          minHeight: isMobile ? "100dvh" : "auto",
          maxHeight: isMobile ? "none" : "90vh",
          overflowY: isMobile ? "visible" : "auto",
          boxShadow: isMobile ? "none" : "0 20px 60px rgba(0,0,0,0.3)",
          ...(!isMobile ? keyboardPaddingStyle : {}),
        }}
      >
        {isMobile && (
          <div
            style={{
              width: "36px",
              height: "3px",
              background: "#d1d5db",
              borderRadius: "2px",
              margin: "0 auto 12px",
            }}
          />
        )}

        {/* Close button */}
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              onClick={onClose}
              aria-label="Chiudi"
              style={{
                width: "44px",
                height: "44px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "none",
                border: "none",
                cursor: "pointer",
                fontSize: "24px",
                color: "#999",
                borderRadius: "50%",
                marginTop: "-16px",
                marginRight: "-16px",
              }}
            >
              &#x2715;
            </button>
          </div>

        {/* Header with progress bar */}
        <div style={{ marginBottom: "24px", textAlign: "center" }}>
            <h2
              style={{
                fontSize: "24px",
                fontWeight: 700,
                color: "#333",
                marginBottom: "8px",
              }}
            >
              Nuovo Cliente
            </h2>
            <p style={{ fontSize: "14px", color: "#999" }}>
              Passo {currentStepIndex + 1} di {STEP_ORDER.length}
              {isDesktop && (
                <span
                  style={{
                    fontSize: "11px",
                    color: "#64748b",
                    marginLeft: "8px",
                  }}
                >
                  {" -- "}{STEP_LABELS[currentStep.kind]}
                </span>
              )}
            </p>
            {/* Progress bar */}
            <div
              style={{
                marginTop: "12px",
                height: "4px",
                backgroundColor: "#e0e0e0",
                borderRadius: "2px",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${((currentStepIndex + 1) / STEP_ORDER.length) * 100}%`,
                  height: "100%",
                  backgroundColor: "#1976d2",
                  transition: "width 0.3s ease",
                }}
              />
            </div>
          </div>

        {/* Spinner keyframes */}
        {vatChecking && (
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        )}

        {/* ── STEP VAT ────────────────────────────────────────────────── */}
        {currentStep.kind === "vat" && (
          <div>
            <p
              style={{
                fontSize: "14px",
                color: "#999",
                textAlign: "center",
                marginBottom: "20px",
              }}
            >
              Inserisci la Partita IVA per verificare i dati
            </p>

            <label
              style={{
                display: "block",
                fontSize: "14px",
                fontWeight: 600,
                color: "#555",
                marginBottom: "6px",
              }}
            >
              Partita IVA
            </label>
            <input
              autoComplete="off"
              type="text"
              value={formData.vatNumber}
              onChange={(e) =>
                setFormData((f) => ({ ...f, vatNumber: e.target.value }))
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (formData.vatNumber.trim().length > 0) {
                    void handleVerifyVat();
                  }
                }
              }}
              onFocus={(e) => scrollFieldIntoView(e.target as HTMLElement)}
              maxLength={11}
              placeholder="es. 06104510653"
              style={{
                width: "100%",
                padding: "14px 16px",
                fontSize: "18px",
                border: "2px solid #1976d2",
                borderRadius: "12px",
                outline: "none",
                boxSizing: "border-box",
              }}
            />

            {vatChecking && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  marginTop: "12px",
                  fontSize: "14px",
                  color: "#666",
                }}
              >
                <div
                  style={{
                    width: "20px",
                    height: "20px",
                    border: "3px solid #e0e0e0",
                    borderTop: "3px solid #1976d2",
                    borderRadius: "50%",
                    animation: "spin 1s linear infinite",
                  }}
                />
                {interactiveSessionId
                  ? "Verifica nell'ERP in corso..."
                  : "Verifica in corso..."}
              </div>
            )}

            {vatError && (
              <div
                style={{
                  marginTop: "12px",
                  padding: "12px",
                  backgroundColor: "#ffebee",
                  border: "1px solid #f44336",
                  borderRadius: "8px",
                  color: "#f44336",
                  fontSize: "14px",
                }}
              >
                {vatError}
              </div>
            )}


            <div
              style={{
                display: "flex",
                gap: "12px",
                marginTop: "20px",
              }}
            >
              <button
                onClick={() => setCurrentStep({ kind: "anagrafica" })}
                disabled={vatChecking}
                style={{
                  flex: 1,
                  padding: "14px",
                  fontSize: "16px",
                  fontWeight: 700,
                  backgroundColor: "#fff",
                  color: vatChecking ? "#bbb" : "#666",
                  border: `1px solid ${vatChecking ? "#eee" : "#ddd"}`,
                  borderRadius: "8px",
                  cursor: vatChecking ? "not-allowed" : "pointer",
                }}
              >
                Salta
              </button>
              <button
                onClick={() => void handleVerifyVat()}
                disabled={
                  formData.vatNumber.trim().length === 0 || vatChecking
                }
                style={{
                  flex: 1,
                  padding: "14px",
                  fontSize: "16px",
                  fontWeight: 700,
                  backgroundColor:
                    formData.vatNumber.trim().length === 0 || vatChecking
                      ? "#ccc"
                      : "#1976d2",
                  color: "#fff",
                  border: "none",
                  borderRadius: "8px",
                  cursor:
                    formData.vatNumber.trim().length === 0 || vatChecking
                      ? "not-allowed"
                      : "pointer",
                }}
              >
                Verifica
              </button>
            </div>
          </div>
        )}

        {/* ── STEP ANAGRAFICA ────────────────────────────────────────── */}
        {currentStep.kind === "anagrafica" && (
          <div style={{ marginBottom: "24px" }}>
            <div
              style={{
                fontSize: "18px",
                fontWeight: 700,
                color: "#333",
                marginBottom: "20px",
              }}
            >
              Anagrafica cliente
            </div>
            <div style={{ marginBottom: "16px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "#555",
                  marginBottom: "6px",
                }}
              >
                Nome / Ragione sociale *
              </label>
              <input
                autoComplete="off"
                type="text"
                value={formData.name}
                onChange={(e) =>
                  setFormData((f) => ({ ...f, name: e.target.value }))
                }
                onFocus={(e) => scrollFieldIntoView(e.target as HTMLElement)}
                placeholder="Es. Rossi Dr. Mario"
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  fontSize: "16px",
                  border: "2px solid #1976d2",
                  borderRadius: "10px",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>
            <div style={{ marginBottom: "16px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "#555",
                  marginBottom: "6px",
                }}
              >
                Codice Fiscale
              </label>
              <input
                autoComplete="off"
                type="text"
                value={formData.fiscalCode || ""}
                onChange={(e) =>
                  setFormData((f) => ({
                    ...f,
                    fiscalCode: e.target.value.toUpperCase(),
                  }))
                }
                onFocus={(e) => scrollFieldIntoView(e.target as HTMLElement)}
                maxLength={16}
                placeholder="Auto-compilato dalla P.IVA (opzionale)"
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  fontSize: "16px",
                  border: "1.5px solid #ddd",
                  borderRadius: "10px",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>
            <div style={{ marginBottom: "16px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "#555",
                  marginBottom: "6px",
                }}
              >
                Settore
              </label>
              <select
                value={formData.sector || ""}
                onChange={(e) =>
                  setFormData((f) => ({ ...f, sector: e.target.value }))
                }
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  fontSize: "16px",
                  border: "1.5px solid #ddd",
                  borderRadius: "10px",
                  outline: "none",
                  boxSizing: "border-box",
                  backgroundColor: "#fff",
                }}
              >
                <option value="">-- nessuno --</option>
                <option value="concessionari">Concessionari</option>
                <option value="Spett. Laboratorio Odontotecnico">
                  Lab. Odontotecnico
                </option>
                <option value="Spett. Studio Dentistico">
                  Studio Dentistico
                </option>
              </select>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginTop: "24px",
              }}
            >
              <button
                onClick={goBack}
                style={{
                  padding: "10px 20px",
                  fontSize: "14px",
                  fontWeight: 600,
                  backgroundColor: "#fff",
                  color: "#666",
                  border: "1px solid #ddd",
                  borderRadius: "8px",
                  cursor: "pointer",
                }}
              >
                Indietro
              </button>
              <button
                onClick={() => {
                  if (!formData.name.trim()) return;
                  goForward();
                }}
                disabled={!formData.name.trim()}
                style={{
                  padding: "10px 24px",
                  fontSize: "14px",
                  fontWeight: 600,
                  backgroundColor: formData.name.trim() ? "#1976d2" : "#ccc",
                  color: "#fff",
                  border: "none",
                  borderRadius: "8px",
                  cursor: formData.name.trim() ? "pointer" : "not-allowed",
                }}
              >
                Avanti
              </button>
            </div>
          </div>
        )}

        {/* ── STEP INDIRIZZO ─────────────────────────────────────────── */}
        {currentStep.kind === "indirizzo" && (
          <div style={{ marginBottom: "24px" }}>
            <div
              style={{
                fontSize: "18px",
                fontWeight: 700,
                color: "#333",
                marginBottom: "20px",
              }}
            >
              Indirizzo principale
            </div>
            <div style={{ marginBottom: "16px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "#555",
                  marginBottom: "6px",
                }}
              >
                Via e civico
              </label>
              <input
                autoComplete="off"
                type="text"
                value={formData.street}
                onChange={(e) =>
                  setFormData((f) => ({ ...f, street: e.target.value }))
                }
                onFocus={(e) => scrollFieldIntoView(e.target as HTMLElement)}
                placeholder="Es. Via Roma 1"
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  fontSize: "16px",
                  border: "1.5px solid #ddd",
                  borderRadius: "10px",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>
            <div
              style={{
                display: "flex",
                gap: "12px",
                marginBottom: "16px",
              }}
            >
              <div style={{ flex: 1 }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "14px",
                    fontWeight: 600,
                    color: "#555",
                    marginBottom: "6px",
                  }}
                >
                  CAP
                </label>
                <input
                  autoComplete="off"
                  type="text"
                  value={formData.postalCode}
                  onChange={(e) => {
                    const cap = e.target.value;
                    setFormData((f) => ({
                      ...f,
                      postalCode: cap,
                      postalCodeCity: "",
                      county: "",
                      state: "",
                      country: "",
                    }));
                    setCapDisambigEntries([]);
                    if (cap.length === 5) {
                      const entries = CAP_BY_CODE.get(cap);
                      if (entries && entries.length === 1) {
                        setFormData((f) => ({
                          ...f,
                          postalCode: cap,
                          postalCodeCity: entries[0].citta,
                          postalCodeCountry: entries[0].paese,
                          county: entries[0].contea,
                          state: entries[0].stato,
                          country: entries[0].paese,
                        }));
                      } else if (entries && entries.length > 1) {
                        setCapDisambigEntries(entries);
                      }
                    }
                  }}
                  onFocus={(e) => scrollFieldIntoView(e.target as HTMLElement)}
                  maxLength={5}
                  placeholder="Es. 80100"
                  style={{
                    width: "100%",
                    padding: "12px 14px",
                    fontSize: "16px",
                    border: "1.5px solid #ddd",
                    borderRadius: "10px",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>
              <div style={{ flex: 2 }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "14px",
                    fontWeight: 600,
                    color: "#555",
                    marginBottom: "6px",
                  }}
                >
                  Citta
                </label>
                <input
                  autoComplete="off"
                  type="text"
                  value={formData.postalCodeCity}
                  readOnly
                  placeholder="Auto-compilata dal CAP"
                  style={{
                    width: "100%",
                    padding: "12px 14px",
                    fontSize: "16px",
                    border: "1.5px solid #ddd",
                    borderRadius: "10px",
                    outline: "none",
                    boxSizing: "border-box",
                    backgroundColor: formData.postalCodeCity ? "#f8fafc" : "#fafafa",
                    color: formData.postalCodeCity ? "#333" : "#aaa",
                    cursor: "default",
                  }}
                />
              </div>
            </div>

            {/* CAP disambiguation inline */}
            {capDisambigEntries.length > 0 && (
              <div style={{ marginBottom: "16px" }}>
                <p
                  style={{
                    fontSize: "14px",
                    fontWeight: 600,
                    color: "#333",
                    marginBottom: "8px",
                  }}
                >
                  Il CAP{" "}
                  <span style={{ color: "#1976d2" }}>
                    {formData.postalCode}
                  </span>{" "}
                  corrisponde a piu localita:
                </p>
                <div
                  style={{
                    maxHeight: "200px",
                    overflowY: "auto",
                    border: "2px solid #1976d2",
                    borderRadius: "10px",
                  }}
                >
                  {capDisambigEntries.map((entry, i) => (
                    <div
                      key={`${entry.citta}-${entry.contea}-${i}`}
                      onClick={() => handleCapDisambiguationSelect(entry)}
                      style={{
                        padding: "10px 14px",
                        fontSize: "14px",
                        cursor: "pointer",
                        backgroundColor: "#fff",
                        borderBottom:
                          i < capDisambigEntries.length - 1
                            ? "1px solid #f0f0f0"
                            : "none",
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.backgroundColor =
                          "#e3f2fd";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.backgroundColor =
                          "#fff";
                      }}
                    >
                      <span style={{ fontWeight: 700, color: "#333" }}>
                        {entry.citta}
                      </span>
                      <span style={{ color: "#666" }}> ({entry.contea})</span>
                      {entry.paese !== "IT" && (
                        <span
                          style={{
                            color: "#999",
                            marginLeft: "8px",
                            fontSize: "12px",
                          }}
                        >
                          [{entry.paese}]
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Badge with selected city/county */}
            {formData.county && (
              <div
                style={{
                  padding: "10px 14px",
                  background: "#f0f7ff",
                  borderRadius: "8px",
                  fontSize: "13px",
                  color: "#1976d2",
                  marginBottom: "8px",
                }}
              >
                {[formData.postalCodeCity, formData.county, formData.state]
                  .filter(Boolean)
                  .join(" -- ")}
              </div>
            )}

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginTop: "24px",
              }}
            >
              <button
                onClick={goBack}
                style={{
                  padding: "10px 20px",
                  fontSize: "14px",
                  fontWeight: 600,
                  backgroundColor: "#fff",
                  color: "#666",
                  border: "1px solid #ddd",
                  borderRadius: "8px",
                  cursor: "pointer",
                }}
              >
                Indietro
              </button>
              <button
                onClick={handleIndirizzoForward}
                style={{
                  padding: "10px 24px",
                  fontSize: "14px",
                  fontWeight: 600,
                  backgroundColor: "#1976d2",
                  color: "#fff",
                  border: "none",
                  borderRadius: "8px",
                  cursor: "pointer",
                }}
              >
                Avanti
              </button>
            </div>
          </div>
        )}

        {/* ── STEP CONTATTI ──────────────────────────────────────────── */}
        {currentStep.kind === "contatti" && (
          <div style={{ marginBottom: "24px" }}>
            <div
              style={{
                fontSize: "18px",
                fontWeight: 700,
                color: "#333",
                marginBottom: "20px",
              }}
            >
              Informazioni di contatto
            </div>
            {(
              [
                {
                  key: "phone" as const,
                  label: "Telefono",
                  type: "tel",
                  placeholder: "+39 0...",
                },
                {
                  key: "mobile" as const,
                  label: "Cellulare",
                  type: "tel",
                  placeholder: "+39 3...",
                },
                {
                  key: "email" as const,
                  label: "E-mail",
                  type: "email",
                  placeholder: "email@dominio.it",
                },
                {
                  key: "url" as const,
                  label: "Sito web",
                  type: "url",
                  placeholder: "https://...",
                },
                {
                  key: "pec" as const,
                  label: "PEC",
                  type: "email",
                  placeholder: "pec@pec.it",
                },
                {
                  key: "sdi" as const,
                  label: "SDI",
                  type: "text",
                  placeholder: "0000000",
                  maxLength: 7,
                },
              ] as const
            ).map((field) => (
              <div key={field.key} style={{ marginBottom: "12px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "13px",
                    fontWeight: 600,
                    color: "#555",
                    marginBottom: "4px",
                  }}
                >
                  {field.label}
                </label>
                <input
                  autoComplete="off"
                  type={field.type}
                  value={formData[field.key] || ""}
                  onChange={(e) => {
                    const v =
                      field.key === "sdi"
                        ? e.target.value.toUpperCase()
                        : e.target.value;
                    setFormData((f) => {
                      const next = { ...f, [field.key]: v };
                      if (
                        field.key === "pec" &&
                        v.trim().length > 0 &&
                        !f.sdi
                      ) {
                        next.sdi = "0000000";
                      }
                      return next;
                    });
                  }}
                  onFocus={(e) =>
                    scrollFieldIntoView(e.target as HTMLElement)
                  }
                  placeholder={field.placeholder}
                  maxLength={"maxLength" in field ? field.maxLength : undefined}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    fontSize: "15px",
                    border: "1.5px solid #ddd",
                    borderRadius: "8px",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>
            ))}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginTop: "24px",
              }}
            >
              <button
                onClick={goBack}
                style={{
                  padding: "10px 20px",
                  fontSize: "14px",
                  fontWeight: 600,
                  backgroundColor: "#fff",
                  color: "#666",
                  border: "1px solid #ddd",
                  borderRadius: "8px",
                  cursor: "pointer",
                }}
              >
                Indietro
              </button>
              <button
                onClick={goForward}
                style={{
                  padding: "10px 24px",
                  fontSize: "14px",
                  fontWeight: 600,
                  backgroundColor: "#1976d2",
                  color: "#fff",
                  border: "none",
                  borderRadius: "8px",
                  cursor: "pointer",
                }}
              >
                Avanti
              </button>
            </div>
          </div>
        )}

        {/* ── STEP COMMERCIALE ───────────────────────────────────────── */}
        {currentStep.kind === "commerciale" && (
          <div style={{ marginBottom: "24px" }}>
            <div
              style={{
                fontSize: "18px",
                fontWeight: 700,
                color: "#333",
                marginBottom: "20px",
              }}
            >
              Dati commerciali
            </div>
            <div style={{ marginBottom: "14px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "#555",
                  marginBottom: "6px",
                }}
              >
                All'attenzione di
              </label>
              <input
                autoComplete="off"
                type="text"
                value={formData.attentionTo || ""}
                onChange={(e) =>
                  setFormData((f) => ({ ...f, attentionTo: e.target.value }))
                }
                onFocus={(e) => scrollFieldIntoView(e.target as HTMLElement)}
                placeholder="Nome referente (opzionale)"
                maxLength={50}
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  fontSize: "15px",
                  border: "1.5px solid #ddd",
                  borderRadius: "10px",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>
            <div style={{ marginBottom: "14px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "#555",
                  marginBottom: "6px",
                }}
              >
                Modalita di consegna
              </label>
              <select
                value={formData.deliveryMode}
                onChange={(e) =>
                  setFormData((f) => ({
                    ...f,
                    deliveryMode: e.target.value,
                  }))
                }
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  fontSize: "15px",
                  border: "1.5px solid #ddd",
                  borderRadius: "10px",
                  outline: "none",
                  boxSizing: "border-box",
                  backgroundColor: "#fff",
                }}
              >
                {DELIVERY_MODES.map((dm) => (
                  <option key={dm.value} value={dm.value}>
                    {dm.label}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ marginBottom: "14px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "#555",
                  marginBottom: "6px",
                }}
              >
                Termini di pagamento
              </label>
              <input
                autoComplete="off"
                type="search"
                value={paymentTermsSearch}
                onChange={(e) => {
                  setPaymentTermsSearch(e.target.value);
                  setPaymentTermsHighlight(0);
                }}
                onKeyDown={handlePaymentTermsKeyDown}
                onFocus={(e) => scrollFieldIntoView(e.target as HTMLElement)}
                placeholder="Cerca per codice o descrizione..."
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  fontSize: "15px",
                  border: "1.5px solid #ddd",
                  borderRadius: paymentTermsSearch
                    ? "10px 10px 0 0"
                    : "10px",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
              {paymentTermsSearch && (
                <div
                  style={{
                    maxHeight: "180px",
                    overflowY: "auto",
                    border: "1.5px solid #ddd",
                    borderTop: "none",
                    borderRadius: "0 0 10px 10px",
                  }}
                >
                  {filteredPaymentTerms.map((term, i) => (
                    <div
                      key={`${term.id}-${i}`}
                      onClick={() => {
                        setFormData((f) => ({
                          ...f,
                          paymentTerms: term.id,
                        }));
                        setPaymentTermsSearch("");
                        setPaymentTermsHighlight(0);
                      }}
                      style={{
                        padding: "8px 14px",
                        fontSize: "14px",
                        cursor: "pointer",
                        backgroundColor:
                          i === paymentTermsHighlight ? "#e3f2fd" : "#fff",
                        borderBottom:
                          i < filteredPaymentTerms.length - 1
                            ? "1px solid #f0f0f0"
                            : "none",
                      }}
                    >
                      <span style={{ fontWeight: 700, color: "#1976d2" }}>
                        {term.id}
                      </span>
                      <span style={{ color: "#666" }}>
                        {" "}
                        -- {term.descrizione}
                      </span>
                    </div>
                  ))}
                  {filteredPaymentTerms.length === 0 && (
                    <div
                      style={{
                        padding: "8px 14px",
                        fontSize: "14px",
                        color: "#999",
                      }}
                    >
                      Nessun risultato
                    </div>
                  )}
                </div>
              )}
              {formData.paymentTerms && (
                <div
                  style={{
                    marginTop: "6px",
                    fontSize: "13px",
                    color: "#4caf50",
                    fontWeight: 600,
                  }}
                >
                  Selezionato:{" "}
                  {getPaymentTermDisplay(formData.paymentTerms)}
                </div>
              )}
            </div>
            <div style={{ marginBottom: "14px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "#555",
                  marginBottom: "6px",
                }}
              >
                Note / Memo
              </label>
              <textarea
                value={formData.notes || ""}
                onChange={(e) =>
                  setFormData((f) => ({ ...f, notes: e.target.value }))
                }
                onFocus={(e) => scrollFieldIntoView(e.target as HTMLElement)}
                placeholder="Note interne (opzionale)"
                rows={3}
                maxLength={4000}
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  fontSize: "15px",
                  border: "1.5px solid #ddd",
                  borderRadius: "10px",
                  outline: "none",
                  boxSizing: "border-box",
                  resize: "vertical",
                }}
              />
              <small style={{ color: "#888", fontSize: 11, display: "block", marginTop: 4 }}>
                Non inserire dati sanitari, referenze mediche o informazioni personali di terzi.
              </small>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginTop: "24px",
              }}
            >
              <button
                onClick={goBack}
                style={{
                  padding: "10px 20px",
                  fontSize: "14px",
                  fontWeight: 600,
                  backgroundColor: "#fff",
                  color: "#666",
                  border: "1px solid #ddd",
                  borderRadius: "8px",
                  cursor: "pointer",
                }}
              >
                Indietro
              </button>
              <button
                onClick={goForward}
                style={{
                  padding: "10px 24px",
                  fontSize: "14px",
                  fontWeight: 600,
                  backgroundColor: "#1976d2",
                  color: "#fff",
                  border: "none",
                  borderRadius: "8px",
                  cursor: "pointer",
                }}
              >
                Avanti
              </button>
            </div>
          </div>
        )}

        {/* ── STEP INDIRIZZI-ALT ─────────────────────────────────────── */}
        {currentStep.kind === "indirizzi-alt" && (
          <div>
            <div
              style={{
                fontSize: "18px",
                fontWeight: 700,
                marginBottom: "16px",
              }}
            >
              Indirizzi alternativi
            </div>

            {localAddresses.length === 0 && !showAddressForm && (
              <div
                style={{
                  color: "#9e9e9e",
                  marginBottom: "12px",
                  fontSize: "14px",
                }}
              >
                Nessun indirizzo alternativo aggiunto
              </div>
            )}

            {localAddresses.map((addr, idx) => (
              <div
                key={idx}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "10px 12px",
                  marginBottom: "8px",
                  backgroundColor: "#f5f5f5",
                  borderRadius: "8px",
                  fontSize: "14px",
                }}
              >
                <span>
                  <strong>{addr.tipo}</strong>
                  {addr.via ? ` -- ${addr.via}` : ""}
                  {addr.cap ? `, ${addr.cap}` : ""}
                  {addr.citta ? ` ${addr.citta}` : ""}
                </span>
                <button
                  onClick={() => {
                    setLocalAddresses((prev) =>
                      prev.filter((_, i) => i !== idx),
                    );
                  }}
                  style={{
                    padding: "4px 10px",
                    fontSize: "13px",
                    fontWeight: 600,
                    backgroundColor: "#fff",
                    color: "#f44336",
                    border: "1px solid #f44336",
                    borderRadius: "6px",
                    cursor: "pointer",
                  }}
                >
                  Elimina
                </button>
              </div>
            ))}

            {showAddressForm && (
              <div
                style={{
                  padding: "12px",
                  backgroundColor: "#fff",
                  border: "1px solid #e0e0e0",
                  borderRadius: "8px",
                  marginBottom: "12px",
                }}
              >
                <div style={{ marginBottom: "8px" }}>
                  <label
                    style={{
                      fontSize: "13px",
                      fontWeight: 600,
                      display: "block",
                      marginBottom: "4px",
                    }}
                  >
                    Tipo *
                  </label>
                  <select
                    value={addressForm.tipo}
                    onChange={(e) =>
                      setAddressForm((f) => ({
                        ...f,
                        tipo: e.target.value,
                      }))
                    }
                    style={{
                      width: "100%",
                      padding: "8px",
                      fontSize: "14px",
                      borderRadius: "6px",
                      border: "1px solid #ccc",
                    }}
                  >
                    <option value="Consegna">Consegna</option>
                    <option value="Ufficio">Ufficio</option>
                    <option value="Fattura">Fattura</option>
                    <option value="Indir. cons. alt.">
                      Indir. cons. alt.
                    </option>
                  </select>
                </div>
                <div style={{ marginBottom: "8px" }}>
                  <label
                    style={{
                      fontSize: "13px",
                      fontWeight: 600,
                      display: "block",
                      marginBottom: "4px",
                    }}
                  >
                    Via e civico
                  </label>
                  <input
                    autoComplete="off"
                    type="text"
                    value={addressForm.via ?? ""}
                    onChange={(e) =>
                      setAddressForm((f) => ({
                        ...f,
                        via: e.target.value,
                      }))
                    }
                    style={{
                      width: "100%",
                      padding: "8px",
                      fontSize: "14px",
                      borderRadius: "6px",
                      border: "1px solid #ccc",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
                <div style={{ marginBottom: "8px" }}>
                  <label
                    style={{
                      fontSize: "13px",
                      fontWeight: 600,
                      display: "block",
                      marginBottom: "4px",
                    }}
                  >
                    CAP
                  </label>
                  <input
                    autoComplete="off"
                    type="text"
                    value={addressForm.cap ?? ""}
                    onChange={(e) => {
                      setAddressForm((f) => ({
                        ...f,
                        cap: e.target.value,
                        citta: "",
                        contea: "",
                        stato: "",
                      }));
                      setAltAddressCapDisambig(null);
                    }}
                    onBlur={(e) => resolveAddressCap(e.target.value)}
                    maxLength={5}
                    style={{
                      width: "100%",
                      padding: "8px",
                      fontSize: "14px",
                      borderRadius: "6px",
                      border: "1px solid #ccc",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
                {altAddressCapDisambig && (
                  <div style={{ marginBottom: "8px" }}>
                    <label
                      style={{
                        fontSize: "13px",
                        fontWeight: 600,
                        display: "block",
                        marginBottom: "4px",
                      }}
                    >
                      Citta *
                    </label>
                    <div
                      style={{
                        border: "1px solid #ccc",
                        borderRadius: "6px",
                        overflow: "hidden",
                      }}
                    >
                      {altAddressCapDisambig.map((entry, i) => (
                        <div
                          key={i}
                          onClick={() => {
                            setAddressForm((f) => ({
                              ...f,
                              citta: entry.citta,
                              contea: entry.contea,
                              stato: entry.stato,
                            }));
                            setAltAddressCapDisambig(null);
                          }}
                          style={{
                            padding: "8px 12px",
                            fontSize: "14px",
                            cursor: "pointer",
                            borderBottom:
                              i < altAddressCapDisambig.length - 1
                                ? "1px solid #eee"
                                : "none",
                            backgroundColor: "#fff",
                          }}
                          onMouseEnter={(e) =>
                            ((
                              e.currentTarget as HTMLElement
                            ).style.backgroundColor = "#f5f5f5")
                          }
                          onMouseLeave={(e) =>
                            ((
                              e.currentTarget as HTMLElement
                            ).style.backgroundColor = "#fff")
                          }
                        >
                          {entry.citta} ({entry.contea})
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {!altAddressCapDisambig && (
                  <div style={{ marginBottom: "8px" }}>
                    <label
                      style={{
                        fontSize: "13px",
                        fontWeight: 600,
                        display: "block",
                        marginBottom: "4px",
                      }}
                    >
                      Citta
                    </label>
                    <input
                      autoComplete="off"
                      type="text"
                      value={addressForm.citta ?? ""}
                      onChange={(e) =>
                        setAddressForm((f) => ({
                          ...f,
                          citta: e.target.value,
                        }))
                      }
                      style={{
                        width: "100%",
                        padding: "8px",
                        fontSize: "14px",
                        borderRadius: "6px",
                        border: "1px solid #ccc",
                        boxSizing: "border-box",
                      }}
                    />
                  </div>
                )}
                <div style={{ marginBottom: "8px" }}>
                  <label
                    style={{
                      fontSize: "13px",
                      fontWeight: 600,
                      display: "block",
                      marginBottom: "4px",
                    }}
                  >
                    Nome (opzionale)
                  </label>
                  <input
                    autoComplete="off"
                    type="text"
                    value={addressForm.nome ?? ""}
                    onChange={(e) =>
                      setAddressForm((f) => ({
                        ...f,
                        nome: e.target.value,
                      }))
                    }
                    style={{
                      width: "100%",
                      padding: "8px",
                      fontSize: "14px",
                      borderRadius: "6px",
                      border: "1px solid #ccc",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    onClick={() => {
                      if (!addressForm.tipo) return;
                      setLocalAddresses((prev) => [
                        ...prev,
                        { ...addressForm },
                      ]);
                      setShowAddressForm(false);
                      setAddressForm({
                        tipo: "Consegna",
                        via: "",
                        cap: "",
                        citta: "",
                        nome: "",
                      });
                      setAltAddressCapDisambig(null);
                    }}
                    style={{
                      padding: "8px 16px",
                      fontSize: "14px",
                      fontWeight: 600,
                      backgroundColor: "#1976d2",
                      color: "#fff",
                      border: "none",
                      borderRadius: "6px",
                      cursor: "pointer",
                    }}
                  >
                    Conferma
                  </button>
                  <button
                    onClick={() => {
                      setShowAddressForm(false);
                      setAddressForm({
                        tipo: "Consegna",
                        via: "",
                        cap: "",
                        citta: "",
                        nome: "",
                      });
                      setAltAddressCapDisambig(null);
                    }}
                    style={{
                      padding: "8px 16px",
                      fontSize: "14px",
                      fontWeight: 600,
                      backgroundColor: "#fff",
                      color: "#757575",
                      border: "1px solid #ccc",
                      borderRadius: "6px",
                      cursor: "pointer",
                    }}
                  >
                    Annulla
                  </button>
                </div>
              </div>
            )}

            {!showAddressForm && (
              <button
                onClick={() => setShowAddressForm(true)}
                style={{
                  width: "100%",
                  padding: "10px",
                  fontSize: "14px",
                  fontWeight: 600,
                  backgroundColor: "#fff",
                  color: "#1976d2",
                  border: "2px dashed #1976d2",
                  borderRadius: "8px",
                  cursor: "pointer",
                  marginBottom: "16px",
                }}
              >
                + Aggiungi indirizzo
              </button>
            )}

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginTop: "16px",
              }}
            >
              <button
                onClick={goBack}
                style={{
                  padding: "10px 20px",
                  fontSize: "14px",
                  fontWeight: 600,
                  backgroundColor: "#fff",
                  color: "#666",
                  border: "1px solid #ddd",
                  borderRadius: "8px",
                  cursor: "pointer",
                }}
              >
                Indietro
              </button>
              <button
                onClick={() => {
                  setFormData((f) => ({
                    ...f,
                    addresses: localAddresses,
                  }));
                  setCurrentStep({ kind: "riepilogo" });
                }}
                style={{
                  padding: "10px 24px",
                  fontSize: "14px",
                  fontWeight: 600,
                  backgroundColor: "#1976d2",
                  color: "#fff",
                  border: "none",
                  borderRadius: "8px",
                  cursor: "pointer",
                }}
              >
                Avanti
              </button>
            </div>
          </div>
        )}

        {/* ── STEP RIEPILOGO ─────────────────────────────────────────── */}
        {currentStep.kind === "riepilogo" && (
          <div>
            {/* ERP validation banner */}
            {!erpValidated && interactiveSessionId && (
              <div
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: "10px 14px",
                  backgroundColor: "#fff8e1",
                  border: "1px solid #ffc107",
                  borderRadius: "8px",
                  marginBottom: "16px",
                  fontSize: "13px",
                  color: "#f57f17",
                }}
              >
                <div style={{ width: '14px', height: '14px', flexShrink: 0, border: '2px solid rgba(245,127,23,0.3)', borderTop: '2px solid #f57f17', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                Connessione al gestionale in corso...
              </div>
            )}

            <div
              style={{
                backgroundColor: "#f5f5f5",
                borderRadius: "12px",
                padding: "20px",
                marginBottom: "20px",
              }}
            >
              {summaryFields.map((row, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "8px 0",
                    borderBottom:
                      i < summaryFields.length - 1
                        ? "1px solid #e0e0e0"
                        : "none",
                    fontSize: "14px",
                  }}
                >
                  <span style={{ color: "#666", fontWeight: 600 }}>
                    {row.label}
                  </span>
                  <span
                    style={{
                      color: "#333",
                      maxWidth: "60%",
                      textAlign: "right",
                      wordBreak: "break-word",
                    }}
                  >
                    {row.value}
                  </span>
                </div>
              ))}

              {localAddresses.length > 0 && (
                <div style={{ marginTop: "8px" }}>
                  <div
                    style={{
                      fontSize: "13px",
                      fontWeight: 700,
                      color: "#616161",
                    }}
                  >
                    Indirizzi alternativi
                  </div>
                  {localAddresses.map((addr, i) => (
                    <div
                      key={i}
                      style={{ fontSize: "13px", color: "#424242" }}
                    >
                      {addr.tipo}
                      {addr.via ? ` -- ${addr.via}` : ""}
                      {addr.cap ? `, ${addr.cap}` : ""}
                      {addr.citta ? ` ${addr.citta}` : ""}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {error && (
              <div
                style={{
                  padding: "12px",
                  backgroundColor: "#ffebee",
                  border: "1px solid #f44336",
                  borderRadius: "8px",
                  color: "#f44336",
                  marginBottom: "16px",
                  fontSize: "14px",
                }}
              >
                {error}
              </div>
            )}

            <div
              style={{
                display: "flex",
                gap: "12px",
                flexDirection: "column",
              }}
            >
              <button
                onClick={handleSave}
                disabled={saving}
                style={{
                  width: "100%",
                  padding: "14px",
                  fontSize: "16px",
                  fontWeight: 700,
                  backgroundColor: saving ? "#ccc" : "#4caf50",
                  color: "#fff",
                  border: "none",
                  borderRadius: "8px",
                  cursor: saving ? "not-allowed" : "pointer",
                }}
              >
                {saving ? "Salvataggio..." : "Crea Cliente"}
              </button>
              <div style={{ display: "flex", gap: "12px" }}>
                <button
                  onClick={goBack}
                  disabled={saving}
                  style={{
                    flex: 1,
                    padding: "14px",
                    fontSize: "16px",
                    fontWeight: 700,
                    backgroundColor: "#fff",
                    color: "#666",
                    border: "1px solid #ddd",
                    borderRadius: "8px",
                    cursor: saving ? "not-allowed" : "pointer",
                  }}
                >
                  Indietro
                </button>
                <button
                  onClick={onClose}
                  disabled={saving}
                  style={{
                    flex: 1,
                    padding: "14px",
                    fontSize: "16px",
                    fontWeight: 700,
                    backgroundColor: "#fff",
                    color: "#f44336",
                    border: "1px solid #f44336",
                    borderRadius: "8px",
                    cursor: saving ? "not-allowed" : "pointer",
                  }}
                >
                  Annulla
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
