import { useState, useRef, useEffect } from "react";
import { useKeyboardScroll } from "../hooks/useKeyboardScroll";
import { customerService } from "../services/customers.service";
import { PAYMENT_TERMS, DEFAULT_PAYMENT_TERM_ID } from "../data/payment-terms";
import { DELIVERY_MODES, DEFAULT_DELIVERY_MODE } from "../data/delivery-modes";
import { CAP_BY_CODE } from "../data/cap-list";
import type { CapEntry } from "../data/cap-list";
import { useWebSocketContext } from "../contexts/WebSocketContext";
import { waitForJobViaWebSocket } from "../api/operations";

import type { CustomerFormData, AddressEntry } from "../types/customer-form-data";
import type { VatLookupResult } from "../types/vat-lookup-result";
import { vatCompanyName } from "../utils/vat-diff";

type ProcessingState = "idle" | "processing" | "completed" | "failed";

interface CustomerCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  contextMode?: "standalone" | "order";
  prefillName?: string;
}

type FieldDef = {
  key: keyof CustomerFormData;
  label: string;
  defaultValue: string;
  maxLength?: number;
  transform?: (v: string) => string;
} & (
  | { fieldType?: "text"; type?: string }
  | { fieldType: "payment-terms" }
  | { fieldType: "cap" }
);

const FIELDS_BEFORE_ADDRESS_QUESTION: FieldDef[] = [
  { key: "name", label: "Nome *", defaultValue: "" },
  { key: "deliveryMode", label: "Modalità di consegna", defaultValue: "FedEx" },
  { key: "vatNumber", label: "Partita IVA", defaultValue: "", maxLength: 11 },
  {
    key: "paymentTerms",
    label: "Termini di pagamento",
    defaultValue: "206",
    fieldType: "payment-terms",
  },
  { key: "pec", label: "PEC", defaultValue: "", type: "email" },
  {
    key: "sdi",
    label: "SDI",
    defaultValue: "",
    maxLength: 7,
    transform: (v: string) => v.toUpperCase(),
  },
  { key: "street", label: "Via e civico", defaultValue: "" },
  {
    key: "postalCode",
    label: "CAP",
    defaultValue: "",
    maxLength: 5,
    fieldType: "cap",
  },
  { key: "phone", label: "Telefono", defaultValue: "+39", type: "tel" },
  { key: "mobile", label: "Cellulare", defaultValue: "+39", type: "tel" },
  { key: "email", label: "Email", defaultValue: "", type: "email" },
  { key: "url", label: "Sito web / URL", defaultValue: "", type: "url" },
];


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


type StepType =
  | { kind: "vat-input" }
  | { kind: "vat-processing" }
  | { kind: "vat-review" }
  | { kind: "field"; fieldIndex: number }
  | { kind: "step-anagrafica" }
  | { kind: "step-indirizzo" }
  | { kind: "step-contatti" }
  | { kind: "step-commerciale" }
  | { kind: "addresses" }
  | { kind: "cap-disambiguation"; targetField: "postalCode" }
  | { kind: "summary" };

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
  contextMode = "standalone",
  prefillName,
}: CustomerCreateModalProps) {
  const [currentStep, setCurrentStep] = useState<StepType>({
    kind: "field",
    fieldIndex: 0,
  });
  const [formData, setFormData] = useState<CustomerFormData>({
    ...INITIAL_FORM,
  });
  const formDataRef = useRef<CustomerFormData>({ ...INITIAL_FORM });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localAddresses, setLocalAddresses] = useState<AddressEntry[]>([]);
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [addressForm, setAddressForm] = useState<AddressEntry>({
    tipo: 'Consegna',
    via: '',
    cap: '',
    citta: '',
    nome: '',
  });
  const [addressCapDisambig, setAddressCapDisambig] = useState<CapEntry[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [paymentTermsSearch, setPaymentTermsSearch] = useState("");
  const [paymentTermsHighlight, setPaymentTermsHighlight] = useState(0);

  const [capDisambiguationEntries, setCapDisambiguationEntries] = useState<
    CapEntry[]
  >([]);

  const [processingState, setProcessingState] =
    useState<ProcessingState>("idle");
  const [taskId, setTaskId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [botError, setBotError] = useState<string | null>(null);

  const [interactiveSessionId, setInteractiveSessionId] = useState<
    string | null
  >(null);
  const interactiveSessionIdRef = useRef<string | null>(null);
  const [vatResult, setVatResult] = useState<VatLookupResult | null>(null);
  const [earlyVatInput, setEarlyVatInput] = useState("");
  const earlyVatInputRef = useRef("");
  const [vatError, setVatError] = useState<string | null>(null);
  const pollingProfileRef = useRef<string | null>(null);

  const { subscribe } = useWebSocketContext();
  const {
    scrollFieldIntoView,
    modalOverlayKeyboardStyle,
    keyboardPaddingStyle,
  } = useKeyboardScroll();

  const totalFieldsBefore = FIELDS_BEFORE_ADDRESS_QUESTION.length;

  const totalSteps = totalFieldsBefore + 1 + 1;

  useEffect(() => {
    interactiveSessionIdRef.current = interactiveSessionId;
  }, [interactiveSessionId]);

  useEffect(() => {
    earlyVatInputRef.current = earlyVatInput;
  }, [earlyVatInput]);

  useEffect(() => {
    formDataRef.current = formData;
  }, [formData]);

  const currentStepNumber = (() => {
    switch (currentStep.kind) {
      case "vat-input":
      case "vat-processing":
      case "vat-review":
        return 0;
      // New wizard group steps
      case "step-anagrafica": return 1;
      case "step-indirizzo":  return 2;
      case "step-contatti":   return 3;
      case "step-commerciale": return 4;
      case "addresses":       return 5;
      // Legacy field step
      case "field":
        return currentStep.fieldIndex + 1;
      case "cap-disambiguation":
        return FIELDS_BEFORE_ADDRESS_QUESTION.findIndex(
          (f) => f.key === "postalCode",
        ) + 1;
      case "summary":
        return totalSteps;
    }
  })();

  useEffect(() => {
    if (isOpen && inputRef.current) {
      const input = inputRef.current;
      input.focus();
      if (currentStep.kind === "field") {
        const fieldKey =
          FIELDS_BEFORE_ADDRESS_QUESTION[currentStep.fieldIndex]?.key;
        if (
          (fieldKey === "phone" || fieldKey === "mobile") &&
          input.value.startsWith("+39")
        ) {
          const pos = input.value.length;
          requestAnimationFrame(() => input.setSelectionRange(pos, pos));
        }
      }
    }
  }, [isOpen, currentStep]);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setSaving(false);
      setLocalAddresses([]);
      setShowAddressForm(false);
      setAddressForm({ tipo: 'Consegna', via: '', cap: '', citta: '', nome: '' });
      setAddressCapDisambig(null);
      setPaymentTermsSearch("");
      setPaymentTermsHighlight(0);
      setCapDisambiguationEntries([]);
      setProcessingState("idle");
      setTaskId(null);
      setProgress(0);
      setProgressLabel("");
      setBotError(null);
      setInteractiveSessionId(null);
      setVatResult(null);
      setEarlyVatInput("");
      setVatError(null);
      pollingProfileRef.current = null;

      const initial = { ...INITIAL_FORM };
      if (prefillName) initial.name = prefillName;
      setFormData(initial);
      setCurrentStep({ kind: "vat-input" });

    } else {
      if (interactiveSessionIdRef.current) {
        customerService
          .cancelInteractiveSession(interactiveSessionIdRef.current)
          .catch(() => {});
      }
    }
  }, [isOpen]);

  useEffect(() => {
    if (!taskId) return;

    let resolved = false;
    const unsubs: Array<() => void> = [];

    const markCompleted = () => {
      if (resolved) return;
      resolved = true;
      setProcessingState("completed");
      setProgress(100);
      setProgressLabel("Completato");
      setTimeout(() => {
        onSaved();
        onClose();
      }, 2000);
    };

    const markFailed = (errorMsg: string) => {
      if (resolved) return;
      resolved = true;
      setProcessingState("failed");
      setBotError(errorMsg);
    };

    let cancelled = false;
    waitForJobViaWebSocket(taskId, {
      subscribe,
      maxWaitMs: 180_000,
      skipSafetyPoll: true,
      onProgress: (progress, label) => {
        if (!resolved && !cancelled) {
          setProgress(progress);
          setProgressLabel(label ?? "Elaborazione...");
        }
      },
    }).then(() => {
      if (!cancelled) markCompleted();
    }).catch((err) => {
      if (!cancelled) markFailed(err instanceof Error ? err.message : "Operazione fallita");
    });

    // Secondary fallback: poll botStatus for updates
    const customerProfile = pollingProfileRef.current;
    let pollInterval: ReturnType<typeof setInterval> | null = null;

    if (customerProfile) {
      const pollTimeout = setTimeout(() => {
        if (resolved) return;
        pollInterval = setInterval(async () => {
          if (resolved) {
            if (pollInterval) clearInterval(pollInterval);
            return;
          }
          try {
            const status =
              await customerService.getCustomerBotStatus(customerProfile);
            if (status === "placed") markCompleted();
            else if (status === "failed")
              markFailed("Operazione fallita su Archibald");
          } catch {
            // ignore polling errors
          }
        }, 5000);
      }, 10000);

      return () => {
        cancelled = true;
        unsubs.forEach((u) => u());
        clearTimeout(pollTimeout);
        if (pollInterval) clearInterval(pollInterval);
      };
    }

    return () => {
      cancelled = true;
      unsubs.forEach((u) => u());
    };
  }, [taskId, subscribe, onSaved, onClose]);

  useEffect(() => {
    if (!interactiveSessionId) return;

    const timer = setInterval(() => {
      customerService.heartbeat(interactiveSessionId);
    }, 120_000);

    return () => clearInterval(timer);
  }, [interactiveSessionId]);

  useEffect(() => {
    if (!interactiveSessionId) return;

    const unsubs: Array<() => void> = [];

    unsubs.push(
      subscribe("CUSTOMER_VAT_RESULT", (payload: any) => {
        if (payload.sessionId !== interactiveSessionIdRef.current) return;
        const result = payload.vatResult as VatLookupResult;
        setVatResult(result);

        setCurrentStep((prev) => {
          if (prev.kind !== 'vat-input' && prev.kind !== 'vat-processing') return prev;
          return { kind: 'vat-review' };
        });
        setFormData((prev) => ({
          ...prev,
          vatNumber: earlyVatInputRef.current.trim() || prev.vatNumber,
          name: vatCompanyName(result) || prev.name,
          street: result.parsed?.street || prev.street,
          postalCode: result.parsed?.postalCode || prev.postalCode,
          postalCodeCity: result.parsed?.city || prev.postalCodeCity,
          pec: result.pec || prev.pec,
          sdi: result.sdi || prev.sdi,
        }));
      }),
    );

    unsubs.push(
      subscribe("CUSTOMER_INTERACTIVE_FAILED", (payload: any) => {
        if (payload.sessionId !== interactiveSessionIdRef.current) return;
        setVatError(payload.error || "Errore sessione interattiva");
        setCurrentStep((prev) =>
          prev.kind === "vat-processing" ? { kind: "vat-input" } : prev,
        );
      }),
    );

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [interactiveSessionId, subscribe]);

  if (!isOpen) return null;

  const resolveCapAndAdvance = (
    capValue: string,
    targetField: "postalCode",
    nextStepFn: () => void,
  ) => {
    if (!capValue) {
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
        }));
      }
      nextStepFn();
      return;
    }
    setCapDisambiguationEntries(entries);
    setCurrentStep({ kind: "cap-disambiguation", targetField });
  };

  const resolveAddressCap = (capValue: string) => {
    if (!capValue) return;
    const entries = CAP_BY_CODE.get(capValue);
    if (!entries || entries.length === 0) return;
    if (entries.length === 1) {
      setAddressForm((f) => ({ ...f, citta: entries[0].citta, contea: entries[0].contea, stato: entries[0].stato }));
      setAddressCapDisambig(null);
    } else {
      setAddressCapDisambig(entries);
    }
  };

  const goForward = () => {
    switch (currentStep.kind) {
      // New wizard group steps
      case "step-anagrafica":
        setCurrentStep({ kind: "step-indirizzo" });
        break;
      case "step-indirizzo": {
        // Resolve CAP then advance
        if (formData.postalCode) {
          resolveCapAndAdvance(formData.postalCode, "postalCode", () =>
            setCurrentStep({ kind: "step-contatti" }),
          );
        } else {
          setCurrentStep({ kind: "step-contatti" });
        }
        break;
      }
      case "step-contatti":
        setCurrentStep({ kind: "step-commerciale" });
        break;
      case "step-commerciale":
        setCurrentStep({ kind: "addresses" });
        break;
      // Legacy field step (used in edit mode)
      case "field": {
        const field = FIELDS_BEFORE_ADDRESS_QUESTION[currentStep.fieldIndex];
        const isCapField =
          field && "fieldType" in field && field.fieldType === "cap";

        if (currentStep.fieldIndex < totalFieldsBefore - 1) {
          const nextStep = () =>
            setCurrentStep({
              kind: "field",
              fieldIndex: currentStep.fieldIndex + 1,
            });
          if (isCapField) {
            resolveCapAndAdvance(
              formData[field.key] as string,
              field.key as "postalCode",
              nextStep,
            );
          } else {
            nextStep();
          }
        } else {
          const nextStep = () => setCurrentStep({ kind: "addresses" });
          if (isCapField) {
            resolveCapAndAdvance(
              formData[field.key] as string,
              field.key as "postalCode",
              nextStep,
            );
          } else {
            nextStep();
          }
        }
        break;
      }
      case "addresses":
      case "cap-disambiguation":
      case "summary":
        break;
    }
  };

  const goBack = () => {
    switch (currentStep.kind) {
      // New wizard group steps
      case "step-anagrafica":
        // If VAT was reviewed, go back to review; if skipped, go back to input
        setCurrentStep(vatResult ? { kind: "vat-review" } : { kind: "vat-input" });
        break;
      case "step-indirizzo":
        setCurrentStep({ kind: "step-anagrafica" });
        break;
      case "step-contatti":
        setCurrentStep({ kind: "step-indirizzo" });
        break;
      case "step-commerciale":
        setCurrentStep({ kind: "step-contatti" });
        break;
      case "addresses":
        setCurrentStep({ kind: "step-commerciale" });
        break;
      // Legacy field step
      case "field": {
        if (currentStep.fieldIndex > 0) {
          setCurrentStep({
            kind: "field",
            fieldIndex: currentStep.fieldIndex - 1,
          });
        }
        break;
      }
      case "cap-disambiguation": {
        const idx = FIELDS_BEFORE_ADDRESS_QUESTION.findIndex(
          (f) => f.key === "postalCode",
        );
        setCurrentStep({
          kind: "field",
          fieldIndex: idx >= 0 ? idx : totalFieldsBefore - 1,
        });
        break;
      }
      case "summary": {
        setCurrentStep({ kind: "addresses" });
        break;
      }
    }
  };

  const getCurrentField = (): FieldDef | null => {
    if (currentStep.kind === "field") {
      return FIELDS_BEFORE_ADDRESS_QUESTION[currentStep.fieldIndex] ?? null;
    }
    return null;
  };

  const currentField = getCurrentField();

  const isPaymentTermsStep =
    currentField !== null &&
    "fieldType" in currentField &&
    currentField.fieldType === "payment-terms";

  const filteredPaymentTerms = (() => {
    if (!isPaymentTermsStep) return [];
    if (!paymentTermsSearch) return PAYMENT_TERMS;
    const q = paymentTermsSearch.toLowerCase();
    return PAYMENT_TERMS.filter(
      (t) =>
        t.id.toLowerCase().includes(q) ||
        t.descrizione.toLowerCase().includes(q),
    );
  })();

  const handlePaymentTermSelect = (id: string) => {
    setFormData((prev) => ({ ...prev, paymentTerms: id }));
    setPaymentTermsSearch("");
    setPaymentTermsHighlight(0);
    goForward();
  };

  const handleCapDisambiguationSelect = (entry: CapEntry) => {
    setFormData((prev) => ({
      ...prev,
      postalCodeCity: entry.citta,
      postalCodeCountry: entry.paese,
    }));

    const capIdx = FIELDS_BEFORE_ADDRESS_QUESTION.findIndex(
      (f) => f.key === "postalCode",
    );
    if (capIdx < totalFieldsBefore - 1) {
      setCurrentStep({ kind: "field", fieldIndex: capIdx + 1 });
    } else {
      setCurrentStep({ kind: "addresses" });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (isPaymentTermsStep) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setPaymentTermsHighlight((prev) =>
          Math.min(prev + 1, filteredPaymentTerms.length - 1),
        );
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setPaymentTermsHighlight((prev) => Math.max(prev - 1, 0));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        if (filteredPaymentTerms.length > 0) {
          handlePaymentTermSelect(
            filteredPaymentTerms[paymentTermsHighlight].id,
          );
        }
        return;
      }
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      if (
        currentStep.kind === "field" &&
        currentStep.fieldIndex === 0 &&
        formData.name.trim().length === 0
      )
        return;
      goForward();
    }
  };

  const handleFieldChange = (key: keyof CustomerFormData, value: string) => {
    const field = FIELDS_BEFORE_ADDRESS_QUESTION.find((f) => f.key === key);
    const transformed = field?.transform ? field.transform(value) : value;
    setFormData((prev) => {
      const next = { ...prev, [key]: transformed };
      if (key === "pec" && transformed.trim().length > 0 && !prev.sdi) {
        next.sdi = "0000000";
      }
      return next;
    });
  };

  const handleSubmitVat = async () => {
    const vat = earlyVatInput.trim();
    if (!vat) return;

    setVatError(null);
    setCurrentStep({ kind: "vat-processing" });

    try {
      let sessionId = interactiveSessionId;

      if (!sessionId && contextMode !== "order") {
        const { sessionId: newId } = await customerService.startInteractiveSession();
        setInteractiveSessionId(newId);
        sessionId = newId;
      }

      if (sessionId) {
        await customerService.submitVatNumber(sessionId, vat);
      } else {
        // contextMode === "order": nessuna sessione bot, vai direttamente all'anagrafica
        setCurrentStep({ kind: "step-anagrafica" });
      }
    } catch (err) {
      setVatError(
        err instanceof Error ? err.message : "Errore avvio verifica P.IVA. Riprova.",
      );
      setCurrentStep({ kind: "vat-input" });
    }
  };

  const handleSkipVat = () => {
    setCurrentStep({ kind: "step-anagrafica" });
  };

  const handleVatReviewContinue = () => {
    setCurrentStep({ kind: "step-anagrafica" });
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setBotError(null);
    try {
      const dataToSend: CustomerFormData = { ...formData };

      let resultTaskId: string | null = null;

      if (interactiveSessionId) {
        // Interactive session active: use this path so addresses are handled.
        const result = await customerService.saveInteractiveCustomer(
          interactiveSessionId,
          dataToSend,
        );
        resultTaskId = result.taskId;
        if (result.customer?.id) {
          pollingProfileRef.current = result.customer.id;
        }
      } else {
        const result = await customerService.createCustomer(dataToSend);
        resultTaskId = result.taskId;
      }

      if (resultTaskId) {
        setTaskId(resultTaskId);
        setProcessingState("processing");
        setProgress(5);
        setProgressLabel("Avvio operazione...");
      } else {
        onSaved();
        onClose();
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Errore durante il salvataggio",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleRetry = async () => {
    if (!taskId) return;
    setProcessingState("idle");
    setBotError(null);
    setProgress(0);
    setProgressLabel("");
    setTaskId(null);
    await handleSave();
  };

  const handleDiscard = () => {
    onClose();
  };

  const handleEditFields = () => {
    setCurrentStep({ kind: "field", fieldIndex: 0 });
  };

  const isVatInput = currentStep.kind === "vat-input";
  const isVatProcessing = currentStep.kind === "vat-processing";
  const isVatReview = currentStep.kind === "vat-review";
  const isFieldStep = currentStep.kind === "field";
  const isAddressesStep = currentStep.kind === "addresses";
  const isCapDisambiguation = currentStep.kind === "cap-disambiguation";
  const isSummary = currentStep.kind === "summary";
  const isStepAnagrafica = currentStep.kind === "step-anagrafica";
  const isStepIndirizzo = currentStep.kind === "step-indirizzo";
  const isStepContatti = currentStep.kind === "step-contatti";
  const isStepCommerciale = currentStep.kind === "step-commerciale";
  const isFirstStep =
    currentStep.kind === "field" && currentStep.fieldIndex === 0;
  const isProcessing = processingState !== "idle";
  const isInteractiveStep = isVatInput || isVatProcessing || isVatReview;

  const isMobile = window.innerWidth < 640;
  const isDesktop = window.innerWidth >= 1024;

  return (
    <div
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
        style={{
          backgroundColor: "#fff",
          borderRadius: isMobile ? "0" : "16px",
          padding: isMobile ? "12px 16px" : "32px",
          maxWidth: isMobile ? "100%" : (isDesktop ? "580px" : "500px"),
          width: isMobile ? "100%" : "90%",
          minHeight: isMobile ? "100dvh" : "auto",
          maxHeight: isMobile ? "none" : "90vh",
          overflowY: isMobile ? "visible" : "auto",
          boxShadow: isMobile ? "none" : "0 20px 60px rgba(0,0,0,0.3)",
          ...(!isMobile ? keyboardPaddingStyle : {}),
        }}
      >
        {isMobile && (
          <div style={{ width: "36px", height: "3px", background: "#d1d5db", borderRadius: "2px", margin: "0 auto 12px" }} />
        )}

        {/* Close button */}
        {!isProcessing && (
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
        )}

        {/* Header */}
        {!isProcessing && !isInteractiveStep && (
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
            {!isSummary && !isCapDisambiguation && (
              <p style={{ fontSize: "14px", color: "#999" }}>
                Passo {currentStepNumber} di {totalSteps}
                {isDesktop && (
                  <span style={{ fontSize: "11px", color: "#64748b", marginLeft: "8px" }}>
                    — {(() => {
                      const stepLabelMap: Record<string, string> = {
                        "vat-input":          "Verifica P.IVA",
                        "vat-processing":     "Verifica P.IVA",
                        "vat-review":         "Dati Fiscali",
                        "step-anagrafica":    "Anagrafica",
                        "step-indirizzo":     "Indirizzo",
                        "step-contatti":      "Contatti",
                        "step-commerciale":   "Commerciale",
                        "addresses":          "Indirizzi alt.",
                        "summary":            "Riepilogo",
                        "cap-disambiguation": "Selezione CAP",
                      };
                      return stepLabelMap[currentStep.kind] ?? "";
                    })()}
                  </span>
                )}
                {!isAddressesStep ? " — Premi Enter per avanzare" : ""}
              </p>
            )}
          </div>
        )}

        {/* Spinner keyframes for interactive steps */}
        {(isVatInput || isVatProcessing || isProcessing) && (
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        )}

        {/* VAT Input step (interactive create) */}
        {isVatInput && (
          <div>
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
                Inserisci la Partita IVA per verificare i dati
              </p>
            </div>


            <label
              style={{
                display: "block",
                fontSize: "16px",
                fontWeight: 600,
                color: "#333",
                marginBottom: "12px",
              }}
            >
              Partita IVA
            </label>
            <input autoComplete="off"
              ref={inputRef}
              type="text"
              value={earlyVatInput}
              onChange={(e) => setEarlyVatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (earlyVatInput.trim().length > 0) {
                    void handleSubmitVat();
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
                onClick={handleSkipVat}
                style={{
                  flex: 1,
                  padding: "14px",
                  fontSize: "16px",
                  fontWeight: 700,
                  backgroundColor: "#fff",
                  color: "#666",
                  border: "1px solid #ddd",
                  borderRadius: "8px",
                  cursor: "pointer",
                }}
              >
                Salta
              </button>
              <button
                onClick={() => void handleSubmitVat()}
                disabled={earlyVatInput.trim().length === 0}
                style={{
                  flex: 1,
                  padding: "14px",
                  fontSize: "16px",
                  fontWeight: 700,
                  backgroundColor:
                    earlyVatInput.trim().length === 0
                      ? "#ccc"
                      : "#1976d2",
                  color: "#fff",
                  border: "none",
                  borderRadius: "8px",
                  cursor:
                    earlyVatInput.trim().length === 0
                      ? "not-allowed"
                      : "pointer",
                }}
              >
                Verifica
              </button>
            </div>
          </div>
        )}

        {/* VAT Processing step */}
        {isVatProcessing && (
          <div style={{ textAlign: "center" }}>
            <div style={{ marginBottom: "24px" }}>
              <h2
                style={{
                  fontSize: "24px",
                  fontWeight: 700,
                  color: "#333",
                  marginBottom: "8px",
                }}
              >
                Verifica P.IVA
              </h2>
              <p style={{ fontSize: "14px", color: "#999" }}>
                Controllo in corso per {earlyVatInput}...
              </p>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                marginBottom: "24px",
              }}
            >
              <div
                style={{
                  width: "48px",
                  height: "48px",
                  border: "4px solid #e0e0e0",
                  borderTop: "4px solid #1976d2",
                  borderRadius: "50%",
                  animation: "spin 1s linear infinite",
                }}
              />
            </div>
            <p style={{ fontSize: "14px", color: "#666" }}>
              Il bot sta verificando la P.IVA su Archibald...
            </p>
          </div>
        )}

        {/* VAT Review step */}
        {isVatReview && vatResult && (
          <div>
            <div style={{ marginBottom: "24px", textAlign: "center" }}>
              <h2
                style={{
                  fontSize: "24px",
                  fontWeight: 700,
                  color: "#333",
                  marginBottom: "8px",
                }}
              >
                Risultato Verifica P.IVA
              </h2>
            </div>

            {vatResult.vatValidated &&
              !vatResult.vatValidated.toUpperCase().includes("YES") &&
              !vatResult.vatValidated.toUpperCase().includes("SI") && (
                <div
                  style={{
                    padding: "12px 16px",
                    backgroundColor: "#fff3e0",
                    border: "1px solid #ff9800",
                    borderRadius: "8px",
                    marginBottom: "16px",
                    fontSize: "14px",
                    color: "#e65100",
                    fontWeight: 600,
                    textAlign: "center",
                  }}
                >
                  P.IVA non valida — verifica di aver inserito il numero
                  corretto
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
              {vatResult.vatValidated && (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "8px 0",
                    borderBottom: "1px solid #e0e0e0",
                    fontSize: "14px",
                  }}
                >
                  <span style={{ color: "#666", fontWeight: 600 }}>
                    IVA Validata
                  </span>
                  <span
                    style={{
                      color: vatResult.vatValidated.toUpperCase().includes("SI")
                        ? "#4caf50"
                        : "#f44336",
                      fontWeight: 700,
                    }}
                  >
                    {vatResult.vatValidated}
                  </span>
                </div>
              )}

              {vatResult.lastVatCheck && (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "8px 0",
                    borderBottom: "1px solid #e0e0e0",
                    fontSize: "14px",
                  }}
                >
                  <span style={{ color: "#666", fontWeight: 600 }}>
                    Ultimo Controllo
                  </span>
                  <span style={{ color: "#333" }}>
                    {vatResult.lastVatCheck}
                  </span>
                </div>
              )}

              {vatCompanyName(vatResult) && (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "8px 0",
                    borderBottom: "1px solid #e0e0e0",
                    fontSize: "14px",
                  }}
                >
                  <span style={{ color: "#666", fontWeight: 600 }}>
                    Ragione Sociale
                  </span>
                  <span
                    style={{
                      color: "#333",
                      maxWidth: "60%",
                      textAlign: "right",
                      wordBreak: "break-word",
                    }}
                  >
                    {vatResult.parsed.companyName}
                  </span>
                </div>
              )}

              {vatResult.parsed.street && (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "8px 0",
                    borderBottom: "1px solid #e0e0e0",
                    fontSize: "14px",
                  }}
                >
                  <span style={{ color: "#666", fontWeight: 600 }}>Via</span>
                  <span
                    style={{
                      color: "#333",
                      maxWidth: "60%",
                      textAlign: "right",
                      wordBreak: "break-word",
                    }}
                  >
                    {vatResult.parsed.street}
                  </span>
                </div>
              )}

              {(vatResult.parsed.postalCode || vatResult.parsed.city) && (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "8px 0",
                    borderBottom: "1px solid #e0e0e0",
                    fontSize: "14px",
                  }}
                >
                  <span style={{ color: "#666", fontWeight: 600 }}>
                    CAP / Citta
                  </span>
                  <span style={{ color: "#333" }}>
                    {[vatResult.parsed.postalCode, vatResult.parsed.city]
                      .filter(Boolean)
                      .join(" ")}
                  </span>
                </div>
              )}

              {vatResult.pec && (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "8px 0",
                    borderBottom: "1px solid #e0e0e0",
                    fontSize: "14px",
                  }}
                >
                  <span style={{ color: "#666", fontWeight: 600 }}>PEC</span>
                  <span style={{ color: "#333" }}>{vatResult.pec}</span>
                </div>
              )}

              {vatResult.sdi && (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "8px 0",
                    borderBottom: "1px solid #e0e0e0",
                    fontSize: "14px",
                  }}
                >
                  <span style={{ color: "#666", fontWeight: 600 }}>SDI</span>
                  <span style={{ color: "#333" }}>{vatResult.sdi}</span>
                </div>
              )}

              {vatResult.parsed.vatStatus && (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "8px 0",
                    fontSize: "14px",
                  }}
                >
                  <span style={{ color: "#666", fontWeight: 600 }}>Stato</span>
                  <span
                    style={{
                      color: vatResult.parsed.vatStatus
                        .toUpperCase()
                        .includes("ATTIVA")
                        ? "#4caf50"
                        : "#ff9800",
                      fontWeight: 700,
                    }}
                  >
                    {vatResult.parsed.vatStatus}
                  </span>
                </div>
              )}
            </div>

            <p
              style={{
                fontSize: "13px",
                color: "#999",
                textAlign: "center",
                marginBottom: "16px",
              }}
            >
              I dati trovati saranno usati per precompilare il form
            </p>

            <button
              onClick={handleVatReviewContinue}
              style={{
                width: "100%",
                padding: "14px",
                fontSize: "16px",
                fontWeight: 700,
                backgroundColor: "#4caf50",
                color: "#fff",
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
              }}
            >
              Continua
            </button>
          </div>
        )}

        {/* Field input step */}
        {isFieldStep && currentField && !isPaymentTermsStep && (
          <div style={{ marginBottom: "24px" }}>
            <label
              style={{
                display: "block",
                fontSize: "16px",
                fontWeight: 600,
                color: "#333",
                marginBottom: "12px",
              }}
            >
              {currentField.label}
            </label>
            <input autoComplete="off"
              ref={inputRef}
              type={
                "type" in currentField && currentField.type
                  ? currentField.type
                  : "text"
              }
              value={formData[currentField.key] as string}
              onChange={(e) =>
                handleFieldChange(currentField.key, e.target.value)
              }
              onKeyDown={handleKeyDown}
              onFocus={(e) => scrollFieldIntoView(e.target as HTMLElement)}
              maxLength={currentField.maxLength}
              placeholder={
                currentField.defaultValue
                  ? `Default: ${currentField.defaultValue}`
                  : "Premi Enter per saltare"
              }
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
            {/* Progress bar */}
            <div
              style={{
                marginTop: "16px",
                height: "4px",
                backgroundColor: "#e0e0e0",
                borderRadius: "2px",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${(currentStepNumber / totalSteps) * 100}%`,
                  height: "100%",
                  backgroundColor: "#1976d2",
                  transition: "width 0.3s ease",
                }}
              />
            </div>
            {/* Nav buttons */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginTop: "16px",
              }}
            >
              <button
                onClick={goBack}
                disabled={isFirstStep}
                style={{
                  padding: "10px 20px",
                  fontSize: "14px",
                  fontWeight: 600,
                  backgroundColor: isFirstStep ? "#eee" : "#fff",
                  color: isFirstStep ? "#999" : "#666",
                  border: "1px solid #ddd",
                  borderRadius: "8px",
                  cursor: isFirstStep ? "not-allowed" : "pointer",
                }}
              >
                Indietro
              </button>
              <button
                onClick={() => {
                  if (
                    currentStep.kind === "field" &&
                    currentStep.fieldIndex === 0 &&
                    formData.name.trim().length === 0
                  )
                    return;
                  goForward();
                }}
                style={{
                  padding: "10px 20px",
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

        {/* Payment terms step */}
        {isFieldStep && currentField && isPaymentTermsStep && (
          <div style={{ marginBottom: "24px" }}>
            <label
              style={{
                display: "block",
                fontSize: "16px",
                fontWeight: 600,
                color: "#333",
                marginBottom: "12px",
              }}
            >
              {currentField.label}
            </label>
            <input autoComplete="off"
              ref={inputRef}
              type="search"
              value={paymentTermsSearch}
              onChange={(e) => {
                setPaymentTermsSearch(e.target.value);
                setPaymentTermsHighlight(0);
              }}
              onKeyDown={handleKeyDown}
              onFocus={(e) => scrollFieldIntoView(e.target as HTMLElement)}
              placeholder="Cerca per codice o descrizione..."
              style={{
                width: "100%",
                padding: "14px 16px",
                fontSize: "18px",
                border: "2px solid #1976d2",
                borderRadius: "12px 12px 0 0",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
            <div
              style={{
                maxHeight: "240px",
                overflowY: "auto",
                border: "2px solid #1976d2",
                borderTop: "none",
                borderRadius: "0 0 12px 12px",
              }}
            >
              {filteredPaymentTerms.map((term, i) => (
                <div
                  key={`${term.id}-${i}`}
                  onClick={() => handlePaymentTermSelect(term.id)}
                  style={{
                    padding: "10px 16px",
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
                  <span style={{ color: "#666" }}> — {term.descrizione}</span>
                </div>
              ))}
              {filteredPaymentTerms.length === 0 && (
                <div
                  style={{
                    padding: "10px 16px",
                    fontSize: "14px",
                    color: "#999",
                  }}
                >
                  Nessun risultato
                </div>
              )}
            </div>
            {formData.paymentTerms && (
              <div
                style={{
                  marginTop: "8px",
                  fontSize: "13px",
                  color: "#4caf50",
                  fontWeight: 600,
                }}
              >
                Selezionato: {getPaymentTermDisplay(formData.paymentTerms)}
              </div>
            )}
            {/* Progress bar */}
            <div
              style={{
                marginTop: "16px",
                height: "4px",
                backgroundColor: "#e0e0e0",
                borderRadius: "2px",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${(currentStepNumber / totalSteps) * 100}%`,
                  height: "100%",
                  backgroundColor: "#1976d2",
                  transition: "width 0.3s ease",
                }}
              />
            </div>
            {/* Nav buttons */}
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
                onClick={goForward}
                style={{
                  padding: "10px 20px",
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

        {/* CAP disambiguation step */}
        {isCapDisambiguation && (
          <div style={{ marginBottom: "24px" }}>
            <p
              style={{
                fontSize: "16px",
                fontWeight: 600,
                color: "#333",
                marginBottom: "16px",
                textAlign: "center",
              }}
            >
              Il CAP{" "}
              <span style={{ color: "#1976d2" }}>
                {formData.postalCode}
              </span>{" "}
              corrisponde a più località. Seleziona:
            </p>
            <div
              style={{
                maxHeight: "300px",
                overflowY: "auto",
                border: "2px solid #1976d2",
                borderRadius: "12px",
              }}
            >
              {capDisambiguationEntries.map((entry, i) => (
                <div
                  key={`${entry.citta}-${entry.contea}-${i}`}
                  onClick={() => handleCapDisambiguationSelect(entry)}
                  style={{
                    padding: "12px 16px",
                    fontSize: "15px",
                    cursor: "pointer",
                    backgroundColor: "#fff",
                    borderBottom:
                      i < capDisambiguationEntries.length - 1
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
            {/* Nav buttons */}
            <div
              style={{
                display: "flex",
                justifyContent: "flex-start",
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
            </div>
          </div>
        )}

        {/* ── STEP ANAGRAFICA ────────────────────────────────────────────── */}
        {isStepAnagrafica && (
          <div style={{ marginBottom: "24px" }}>
            <div style={{ fontSize: "18px", fontWeight: 700, color: "#333", marginBottom: "20px" }}>
              Anagrafica cliente
            </div>
            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", fontSize: "14px", fontWeight: 600, color: "#555", marginBottom: "6px" }}>
                Nome / Ragione sociale *
              </label>
              <input autoComplete="off"
                type="text"
                value={formData.name}
                onChange={(e) => setFormData(f => ({ ...f, name: e.target.value }))}
                placeholder="Es. Rossi Dr. Mario"
                style={{ width: "100%", padding: "12px 14px", fontSize: "16px", border: "2px solid #1976d2", borderRadius: "10px", outline: "none", boxSizing: "border-box" }}
              />
            </div>
            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", fontSize: "14px", fontWeight: 600, color: "#555", marginBottom: "6px" }}>
                Codice Fiscale
              </label>
              <input autoComplete="off"
                type="text"
                value={formData.fiscalCode || ""}
                onChange={(e) => setFormData(f => ({ ...f, fiscalCode: e.target.value.toUpperCase() }))}
                maxLength={16}
                placeholder="Auto-compilato dalla P.IVA (opzionale)"
                style={{ width: "100%", padding: "12px 14px", fontSize: "16px", border: "1.5px solid #ddd", borderRadius: "10px", outline: "none", boxSizing: "border-box" }}
              />
            </div>
            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", fontSize: "14px", fontWeight: 600, color: "#555", marginBottom: "6px" }}>
                Settore
              </label>
              <select
                value={formData.sector || ""}
                onChange={(e) => setFormData(f => ({ ...f, sector: e.target.value }))}
                style={{ width: "100%", padding: "12px 14px", fontSize: "16px", border: "1.5px solid #ddd", borderRadius: "10px", outline: "none", boxSizing: "border-box", backgroundColor: "#fff" }}
              >
                <option value="">— nessuno —</option>
                <option value="concessionari">Concessionari</option>
                <option value="Spett. Laboratorio Odontotecnico">Lab. Odontotecnico</option>
                <option value="Spett. Studio Dentistico">Studio Dentistico</option>
              </select>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "24px" }}>
              <button onClick={goBack}
                style={{ padding: "10px 20px", fontSize: "14px", fontWeight: 600, backgroundColor: "#fff", color: "#666", border: "1px solid #ddd", borderRadius: "8px", cursor: "pointer" }}>
                Indietro
              </button>
              <button onClick={() => { if (!formData.name.trim()) return; goForward(); }}
                disabled={!formData.name.trim()}
                style={{ padding: "10px 24px", fontSize: "14px", fontWeight: 600, backgroundColor: formData.name.trim() ? "#1976d2" : "#ccc", color: "#fff", border: "none", borderRadius: "8px", cursor: formData.name.trim() ? "pointer" : "not-allowed" }}>
                Avanti →
              </button>
            </div>
          </div>
        )}

        {/* ── STEP INDIRIZZO ─────────────────────────────────────────────── */}
        {isStepIndirizzo && (
          <div style={{ marginBottom: "24px" }}>
            <div style={{ fontSize: "18px", fontWeight: 700, color: "#333", marginBottom: "20px" }}>
              Indirizzo principale
            </div>
            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", fontSize: "14px", fontWeight: 600, color: "#555", marginBottom: "6px" }}>
                Via e civico
              </label>
              <input autoComplete="off"
                type="text"
                value={formData.street}
                onChange={(e) => setFormData(f => ({ ...f, street: e.target.value }))}
                placeholder="Es. Via Roma 1"
                style={{ width: "100%", padding: "12px 14px", fontSize: "16px", border: "1.5px solid #ddd", borderRadius: "10px", outline: "none", boxSizing: "border-box" }}
              />
            </div>
            <div style={{ display: "flex", gap: "12px", marginBottom: "16px" }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: "block", fontSize: "14px", fontWeight: 600, color: "#555", marginBottom: "6px" }}>
                  CAP
                </label>
                <input autoComplete="off"
                  type="text"
                  value={formData.postalCode}
                  onChange={(e) => setFormData(f => ({ ...f, postalCode: e.target.value, postalCodeCity: "" }))}
                  maxLength={5}
                  placeholder="Es. 80100"
                  style={{ width: "100%", padding: "12px 14px", fontSize: "16px", border: "1.5px solid #ddd", borderRadius: "10px", outline: "none", boxSizing: "border-box" }}
                />
              </div>
              <div style={{ flex: 2 }}>
                <label style={{ display: "block", fontSize: "14px", fontWeight: 600, color: "#555", marginBottom: "6px" }}>
                  Città (se CAP ambiguo)
                </label>
                <input autoComplete="off"
                  type="text"
                  value={formData.postalCodeCity}
                  onChange={(e) => setFormData(f => ({ ...f, postalCodeCity: e.target.value }))}
                  placeholder="Es. Napoli"
                  style={{ width: "100%", padding: "12px 14px", fontSize: "16px", border: "1.5px solid #ddd", borderRadius: "10px", outline: "none", boxSizing: "border-box" }}
                />
              </div>
            </div>
            {formData.county && (
              <div style={{ padding: "10px 14px", background: "#f0f7ff", borderRadius: "8px", fontSize: "13px", color: "#1976d2", marginBottom: "8px" }}>
                📍 {[formData.county, formData.state].filter(Boolean).join(" · ")} · {formData.country}
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "24px" }}>
              <button onClick={goBack}
                style={{ padding: "10px 20px", fontSize: "14px", fontWeight: 600, backgroundColor: "#fff", color: "#666", border: "1px solid #ddd", borderRadius: "8px", cursor: "pointer" }}>
                Indietro
              </button>
              <button onClick={goForward}
                style={{ padding: "10px 24px", fontSize: "14px", fontWeight: 600, backgroundColor: "#1976d2", color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer" }}>
                Avanti →
              </button>
            </div>
          </div>
        )}

        {/* ── STEP CONTATTI ──────────────────────────────────────────────── */}
        {isStepContatti && (
          <div style={{ marginBottom: "24px" }}>
            <div style={{ fontSize: "18px", fontWeight: 700, color: "#333", marginBottom: "20px" }}>
              Informazioni di contatto
            </div>
            {[
              { key: "phone", label: "Telefono", type: "tel", placeholder: "+39 0..." },
              { key: "mobile", label: "Cellulare", type: "tel", placeholder: "+39 3..." },
              { key: "email", label: "E-mail", type: "email", placeholder: "email@dominio.it" },
              { key: "url", label: "Sito web", type: "url", placeholder: "https://..." },
              { key: "pec", label: "PEC", type: "email", placeholder: "pec@pec.it" },
              { key: "sdi", label: "SDI", type: "text", placeholder: "0000000", maxLength: 7 },
            ].map(({ key, label, type, placeholder, maxLength }) => (
              <div key={key} style={{ marginBottom: "12px" }}>
                <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#555", marginBottom: "4px" }}>{label}</label>
                <input autoComplete="off"
                  type={type}
                  value={(formData as any)[key] || ""}
                  onChange={(e) => {
                    const v = key === "sdi" ? e.target.value.toUpperCase() : e.target.value;
                    setFormData(f => ({ ...f, [key]: v }));
                  }}
                  placeholder={placeholder}
                  maxLength={maxLength}
                  style={{ width: "100%", padding: "10px 12px", fontSize: "15px", border: "1.5px solid #ddd", borderRadius: "8px", outline: "none", boxSizing: "border-box" }}
                />
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "24px" }}>
              <button onClick={goBack}
                style={{ padding: "10px 20px", fontSize: "14px", fontWeight: 600, backgroundColor: "#fff", color: "#666", border: "1px solid #ddd", borderRadius: "8px", cursor: "pointer" }}>
                Indietro
              </button>
              <button onClick={goForward}
                style={{ padding: "10px 24px", fontSize: "14px", fontWeight: 600, backgroundColor: "#1976d2", color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer" }}>
                Avanti →
              </button>
            </div>
          </div>
        )}

        {/* ── STEP COMMERCIALE ───────────────────────────────────────────── */}
        {isStepCommerciale && (
          <div style={{ marginBottom: "24px" }}>
            <div style={{ fontSize: "18px", fontWeight: 700, color: "#333", marginBottom: "20px" }}>
              Dati commerciali
            </div>
            <div style={{ marginBottom: "14px" }}>
              <label style={{ display: "block", fontSize: "14px", fontWeight: 600, color: "#555", marginBottom: "6px" }}>
                All'attenzione di
              </label>
              <input autoComplete="off"
                type="text"
                value={formData.attentionTo || ""}
                onChange={(e) => setFormData(f => ({ ...f, attentionTo: e.target.value }))}
                placeholder="Nome referente (opzionale)"
                maxLength={50}
                style={{ width: "100%", padding: "12px 14px", fontSize: "15px", border: "1.5px solid #ddd", borderRadius: "10px", outline: "none", boxSizing: "border-box" }}
              />
            </div>
            <div style={{ marginBottom: "14px" }}>
              <label style={{ display: "block", fontSize: "14px", fontWeight: 600, color: "#555", marginBottom: "6px" }}>
                Modalità di consegna
              </label>
              <select
                value={formData.deliveryMode}
                onChange={(e) => setFormData(f => ({ ...f, deliveryMode: e.target.value }))}
                style={{ width: "100%", padding: "12px 14px", fontSize: "15px", border: "1.5px solid #ddd", borderRadius: "10px", outline: "none", boxSizing: "border-box", backgroundColor: "#fff" }}
              >
                {DELIVERY_MODES.map(dm => (
                  <option key={dm.value} value={dm.value}>{dm.label}</option>
                ))}
              </select>
            </div>
            <div style={{ marginBottom: "14px" }}>
              <label style={{ display: "block", fontSize: "14px", fontWeight: 600, color: "#555", marginBottom: "6px" }}>
                Termini di pagamento
              </label>
              <select
                value={formData.paymentTerms}
                onChange={(e) => setFormData(f => ({ ...f, paymentTerms: e.target.value }))}
                style={{ width: "100%", padding: "12px 14px", fontSize: "15px", border: "1.5px solid #ddd", borderRadius: "10px", outline: "none", boxSizing: "border-box", backgroundColor: "#fff" }}
              >
                {PAYMENT_TERMS.map(pt => (
                  <option key={pt.id} value={pt.id}>{pt.id} — {pt.descrizione}</option>
                ))}
              </select>
            </div>
            <div style={{ marginBottom: "14px" }}>
              <label style={{ display: "block", fontSize: "14px", fontWeight: 600, color: "#555", marginBottom: "6px" }}>
                Note / Memo
              </label>
              <textarea
                value={formData.notes || ""}
                onChange={(e) => setFormData(f => ({ ...f, notes: e.target.value }))}
                placeholder="Note interne (opzionale)"
                rows={3}
                maxLength={4000}
                style={{ width: "100%", padding: "12px 14px", fontSize: "15px", border: "1.5px solid #ddd", borderRadius: "10px", outline: "none", boxSizing: "border-box", resize: "vertical" }}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "24px" }}>
              <button onClick={goBack}
                style={{ padding: "10px 20px", fontSize: "14px", fontWeight: 600, backgroundColor: "#fff", color: "#666", border: "1px solid #ddd", borderRadius: "8px", cursor: "pointer" }}>
                Indietro
              </button>
              <button onClick={goForward}
                style={{ padding: "10px 24px", fontSize: "14px", fontWeight: 600, backgroundColor: "#1976d2", color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer" }}>
                Avanti →
              </button>
            </div>
          </div>
        )}

        {/* Addresses step */}
        {isAddressesStep && (
          <div>
            <div style={{ fontSize: "18px", fontWeight: 700, marginBottom: "16px" }}>
              Indirizzi alternativi
            </div>

            {localAddresses.length === 0 && !showAddressForm && (
              <div style={{ color: "#9e9e9e", marginBottom: "12px", fontSize: "14px" }}>
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
                  {addr.via ? ` — ${addr.via}` : ""}
                  {addr.cap ? `, ${addr.cap}` : ""}
                  {addr.citta ? ` ${addr.citta}` : ""}
                </span>
                <button
                  onClick={() => {
                    setLocalAddresses((prev) => prev.filter((_, i) => i !== idx));
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
                  <label style={{ fontSize: "13px", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                    Tipo *
                  </label>
                  <select
                    value={addressForm.tipo}
                    onChange={(e) => setAddressForm((f) => ({ ...f, tipo: e.target.value }))}
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
                    <option value="Indir. cons. alt.">Indir. cons. alt.</option>
                  </select>
                </div>
                <div style={{ marginBottom: "8px" }}>
                  <label style={{ fontSize: "13px", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                    Via e civico
                  </label>
                  <input autoComplete="off"
                    type="text"
                    value={addressForm.via ?? ""}
                    onChange={(e) => setAddressForm((f) => ({ ...f, via: e.target.value }))}
                    style={{ width: "100%", padding: "8px", fontSize: "14px", borderRadius: "6px", border: "1px solid #ccc", boxSizing: "border-box" }}
                  />
                </div>
                <div style={{ marginBottom: "8px" }}>
                  <label style={{ fontSize: "13px", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                    CAP
                  </label>
                  <input autoComplete="off"
                    type="text"
                    value={addressForm.cap ?? ""}
                    onChange={(e) => {
                      setAddressForm((f) => ({ ...f, cap: e.target.value, citta: "", contea: "", stato: "" }));
                      setAddressCapDisambig(null);
                    }}
                    onBlur={(e) => resolveAddressCap(e.target.value)}
                    style={{ width: "100%", padding: "8px", fontSize: "14px", borderRadius: "6px", border: "1px solid #ccc", boxSizing: "border-box" }}
                  />
                </div>
                {addressCapDisambig && (
                  <div style={{ marginBottom: "8px" }}>
                    <label style={{ fontSize: "13px", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                      Città *
                    </label>
                    <div style={{ border: "1px solid #ccc", borderRadius: "6px", overflow: "hidden" }}>
                      {addressCapDisambig.map((entry, i) => (
                        <div
                          key={i}
                          onClick={() => {
                            setAddressForm((f) => ({ ...f, citta: entry.citta, contea: entry.contea, stato: entry.stato }));
                            setAddressCapDisambig(null);
                          }}
                          style={{
                            padding: "8px 12px",
                            fontSize: "14px",
                            cursor: "pointer",
                            borderBottom: i < addressCapDisambig.length - 1 ? "1px solid #eee" : "none",
                            backgroundColor: "#fff",
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#f5f5f5")}
                          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#fff")}
                        >
                          {entry.citta} ({entry.contea})
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {!addressCapDisambig && (
                  <div style={{ marginBottom: "8px" }}>
                    <label style={{ fontSize: "13px", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                      Città
                    </label>
                    <input autoComplete="off"
                      type="text"
                      value={addressForm.citta ?? ""}
                      onChange={(e) => setAddressForm((f) => ({ ...f, citta: e.target.value }))}
                      style={{ width: "100%", padding: "8px", fontSize: "14px", borderRadius: "6px", border: "1px solid #ccc", boxSizing: "border-box" }}
                    />
                  </div>
                )}
                <div style={{ marginBottom: "8px" }}>
                  <label style={{ fontSize: "13px", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                    Nome (opzionale)
                  </label>
                  <input autoComplete="off"
                    type="text"
                    value={addressForm.nome ?? ""}
                    onChange={(e) => setAddressForm((f) => ({ ...f, nome: e.target.value }))}
                    style={{ width: "100%", padding: "8px", fontSize: "14px", borderRadius: "6px", border: "1px solid #ccc", boxSizing: "border-box" }}
                  />
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    onClick={() => {
                      if (!addressForm.tipo) return;
                      setLocalAddresses((prev) => [...prev, { ...addressForm }]);
                      setShowAddressForm(false);
                      setAddressForm({ tipo: 'Consegna', via: '', cap: '', citta: '', nome: '' });
                      setAddressCapDisambig(null);
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
                      setAddressForm({ tipo: 'Consegna', via: '', cap: '', citta: '', nome: '' });
                      setAddressCapDisambig(null);
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

            <button
              onClick={() => {
                setFormData((f) => ({ ...f, addresses: localAddresses }));
                setCurrentStep({ kind: "summary" });
              }}
              style={{
                width: "100%",
                padding: "14px",
                fontSize: "16px",
                fontWeight: 700,
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
        )}

        {/* Summary step */}
        {isSummary && !isProcessing && (
          <div>
            <div
              style={{
                backgroundColor: "#f5f5f5",
                borderRadius: "12px",
                padding: "20px",
                marginBottom: "20px",
              }}
            >
              {FIELDS_BEFORE_ADDRESS_QUESTION.map((field) => {
                const value = formData[field.key] as string | undefined;
                if (!value) return null;
                let displayValue = value;
                if (field.key === "paymentTerms") {
                  displayValue = getPaymentTermDisplay(value);
                }
                if (field.key === "postalCode" && formData.postalCodeCity) {
                  displayValue = getCapCityDisplay(
                    value,
                    formData.postalCodeCity,
                  );
                }
                return (
                  <div
                    key={field.key}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "8px 0",
                      borderBottom: "1px solid #e0e0e0",
                      fontSize: "14px",
                    }}
                  >
                    <span style={{ color: "#666", fontWeight: 600 }}>
                      {field.label.replace(" *", "")}
                    </span>
                    <span
                      style={{
                        color: "#333",
                        maxWidth: "60%",
                        textAlign: "right",
                        wordBreak: "break-word",
                      }}
                    >
                      {displayValue}
                    </span>
                  </div>
                );
              })}
              {formData.addresses && formData.addresses.length > 0 && (
                <div style={{ marginTop: "8px" }}>
                  <div style={{ fontSize: "13px", fontWeight: 700, color: "#616161" }}>Indirizzi alternativi</div>
                  {formData.addresses.map((addr, i) => (
                    <div key={i} style={{ fontSize: "13px", color: "#424242" }}>
                      {addr.tipo}{addr.via ? ` — ${addr.via}` : ""}{addr.cap ? `, ${addr.cap}` : ""}{addr.citta ? ` ${addr.citta}` : ""}
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

            {/* Action buttons */}
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
                {saving ? "Salvataggio..." : "Salva Cliente"}
              </button>
              <button
                onClick={handleEditFields}
                disabled={saving}
                style={{
                  width: "100%",
                  padding: "14px",
                  fontSize: "16px",
                  fontWeight: 700,
                  backgroundColor: "#1976d2",
                  color: "#fff",
                  border: "none",
                  borderRadius: "8px",
                  cursor: saving ? "not-allowed" : "pointer",
                }}
              >
                Modifica
              </button>
              <button
                onClick={handleDiscard}
                disabled={saving}
                style={{
                  width: "100%",
                  padding: "14px",
                  fontSize: "16px",
                  fontWeight: 700,
                  backgroundColor: "#f44336",
                  color: "#fff",
                  border: "none",
                  borderRadius: "8px",
                  cursor: saving ? "not-allowed" : "pointer",
                }}
              >
                Elimina
              </button>
            </div>
          </div>
        )}

        {/* Processing state overlay */}
        {isProcessing && (
          <div>
            <div style={{ textAlign: "center", marginBottom: "24px" }}>
              <h2
                style={{
                  fontSize: "24px",
                  fontWeight: 700,
                  color: "#333",
                  marginBottom: "8px",
                }}
              >
                {processingState === "completed"
                  ? "Operazione completata"
                  : processingState === "failed"
                    ? "Errore"
                    : "Creazione in corso..."}
              </h2>
            </div>

            {processingState === "processing" && (
              <div style={{ marginBottom: "24px" }}>
                <div
                  style={{
                    height: "8px",
                    backgroundColor: "#e0e0e0",
                    borderRadius: "4px",
                    overflow: "hidden",
                    marginBottom: "12px",
                  }}
                >
                  <div
                    style={{
                      width: `${progress}%`,
                      height: "100%",
                      backgroundColor: "#1976d2",
                      borderRadius: "4px",
                      transition: "width 0.5s ease",
                    }}
                  />
                </div>
                <p
                  style={{
                    fontSize: "14px",
                    color: "#666",
                    textAlign: "center",
                  }}
                >
                  {progressLabel || "Elaborazione..."}
                </p>
                <p
                  style={{
                    fontSize: "12px",
                    color: "#999",
                    textAlign: "center",
                    marginTop: "4px",
                  }}
                >
                  {progress}%
                </p>
              </div>
            )}

            {processingState === "completed" && (
              <div
                style={{
                  padding: "16px",
                  backgroundColor: "#e8f5e9",
                  border: "1px solid #4caf50",
                  borderRadius: "8px",
                  textAlign: "center",
                  marginBottom: "16px",
                }}
              >
                <p
                  style={{
                    color: "#2e7d32",
                    fontSize: "16px",
                    fontWeight: 600,
                  }}
                >
                  Cliente creato con successo!
                </p>
                <p
                  style={{ color: "#666", fontSize: "13px", marginTop: "4px" }}
                >
                  Chiusura automatica...
                </p>
              </div>
            )}

            {processingState === "failed" && (
              <div>
                <div
                  style={{
                    padding: "16px",
                    backgroundColor: "#ffebee",
                    border: "1px solid #f44336",
                    borderRadius: "8px",
                    marginBottom: "16px",
                  }}
                >
                  <p style={{ color: "#c62828", fontSize: "14px" }}>
                    {botError ||
                      "Si è verificato un errore durante l'operazione."}
                  </p>
                </div>
                <div style={{ display: "flex", gap: "12px" }}>
                  <button
                    onClick={handleRetry}
                    style={{
                      flex: 1,
                      padding: "14px",
                      fontSize: "16px",
                      fontWeight: 700,
                      backgroundColor: "#ff9800",
                      color: "#fff",
                      border: "none",
                      borderRadius: "8px",
                      cursor: "pointer",
                    }}
                  >
                    Riprova
                  </button>
                  <button
                    onClick={onClose}
                    style={{
                      flex: 1,
                      padding: "14px",
                      fontSize: "16px",
                      fontWeight: 700,
                      backgroundColor: "#f44336",
                      color: "#fff",
                      border: "none",
                      borderRadius: "8px",
                      cursor: "pointer",
                    }}
                  >
                    Chiudi
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
