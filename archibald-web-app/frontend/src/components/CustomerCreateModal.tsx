import { useState, useRef, useEffect } from "react";
import { useKeyboardScroll } from "../hooks/useKeyboardScroll";
import { customerService } from "../services/customers.service";
import type { Customer } from "../types/customer";
import { PAYMENT_TERMS } from "../data/payment-terms";
import { CAP_BY_CODE } from "../data/cap-list";
import type { CapEntry } from "../data/cap-list";
import { useWebSocketContext } from "../contexts/WebSocketContext";

type ProcessingState = "idle" | "processing" | "completed" | "failed";

type VatAddressInfo = {
  companyName: string;
  street: string;
  postalCode: string;
  city: string;
  vatStatus: string;
  internalId: string;
};

type VatLookupResult = {
  lastVatCheck: string;
  vatValidated: string;
  vatAddress: string;
  parsed: VatAddressInfo;
  pec: string;
  sdi: string;
};

interface CustomerFormData {
  name: string;
  deliveryMode: string;
  vatNumber: string;
  paymentTerms: string;
  pec: string;
  sdi: string;
  street: string;
  postalCode: string;
  phone: string;
  mobile: string;
  email: string;
  url: string;
  deliveryStreet: string;
  deliveryPostalCode: string;
  postalCodeCity: string;
  postalCodeCountry: string;
  deliveryPostalCodeCity: string;
  deliveryPostalCodeCountry: string;
}

interface CustomerCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  editCustomer?: Customer | null;
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
  { key: "mobile", label: "Cellulare *", defaultValue: "+39", type: "tel" },
  { key: "email", label: "Email", defaultValue: "", type: "email" },
  { key: "url", label: "Sito web *", defaultValue: "" },
];

const DELIVERY_ADDRESS_FIELDS: FieldDef[] = [
  { key: "deliveryStreet", label: "Via e civico (consegna)", defaultValue: "" },
  {
    key: "deliveryPostalCode",
    label: "CAP (consegna)",
    defaultValue: "",
    maxLength: 5,
    fieldType: "cap",
  },
];

const ALL_DISPLAY_FIELDS: FieldDef[] = [
  ...FIELDS_BEFORE_ADDRESS_QUESTION,
  ...DELIVERY_ADDRESS_FIELDS,
];

const INITIAL_FORM: CustomerFormData = {
  name: "",
  deliveryMode: "FedEx",
  vatNumber: "",
  paymentTerms: "206",
  pec: "",
  sdi: "",
  street: "",
  postalCode: "",
  phone: "+39",
  mobile: "+39",
  email: "",
  url: "",
  deliveryStreet: "",
  deliveryPostalCode: "",
  postalCodeCity: "",
  postalCodeCountry: "",
  deliveryPostalCodeCity: "",
  deliveryPostalCodeCountry: "",
};

function customerToFormData(customer: Customer): CustomerFormData {
  return {
    name: customer.name || "",
    deliveryMode: customer.deliveryTerms || "FedEx",
    vatNumber: customer.vatNumber || "",
    paymentTerms: "206",
    pec: customer.pec || "",
    sdi: customer.sdi || "",
    street: customer.street || "",
    postalCode: customer.postalCode || "",
    phone: customer.phone
      ? customer.phone.startsWith("+39")
        ? customer.phone
        : `+39 ${customer.phone}`
      : "+39",
    mobile: customer.mobile
      ? customer.mobile.startsWith("+39")
        ? customer.mobile
        : `+39 ${customer.mobile}`
      : "+39",
    email: customer.pec || "",
    url: customer.url || "",
    deliveryStreet: "",
    deliveryPostalCode: "",
    postalCodeCity: "",
    postalCodeCountry: "",
    deliveryPostalCodeCity: "",
    deliveryPostalCodeCountry: "",
  };
}

type StepType =
  | { kind: "vat-input" }
  | { kind: "vat-processing" }
  | { kind: "vat-review" }
  | { kind: "field"; fieldIndex: number }
  | { kind: "address-question" }
  | { kind: "delivery-field"; fieldIndex: number }
  | {
      kind: "cap-disambiguation";
      targetField: "postalCode" | "deliveryPostalCode";
    }
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
  editCustomer,
}: CustomerCreateModalProps) {
  const isEditMode = !!editCustomer;
  const [currentStep, setCurrentStep] = useState<StepType>({
    kind: "field",
    fieldIndex: 0,
  });
  const [formData, setFormData] = useState<CustomerFormData>({
    ...INITIAL_FORM,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sameDeliveryAddress, setSameDeliveryAddress] = useState<
    boolean | null
  >(null);
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
  const [botReady, setBotReady] = useState(false);
  const [vatResult, setVatResult] = useState<VatLookupResult | null>(null);
  const [earlyVatInput, setEarlyVatInput] = useState("");
  const earlyVatInputRef = useRef("");
  const [vatError, setVatError] = useState<string | null>(null);
  const [changedFields, setChangedFields] = useState<Set<string>>(new Set());

  const { subscribe } = useWebSocketContext();
  const {
    scrollFieldIntoView,
    modalOverlayKeyboardStyle,
    keyboardPaddingStyle,
  } = useKeyboardScroll();

  const totalFieldsBefore = FIELDS_BEFORE_ADDRESS_QUESTION.length;
  const totalDeliveryFields = DELIVERY_ADDRESS_FIELDS.length;

  const totalSteps =
    totalFieldsBefore +
    1 +
    (sameDeliveryAddress === false ? totalDeliveryFields : 0) +
    1;

  useEffect(() => {
    interactiveSessionIdRef.current = interactiveSessionId;
  }, [interactiveSessionId]);

  useEffect(() => {
    earlyVatInputRef.current = earlyVatInput;
  }, [earlyVatInput]);

  const currentStepNumber = (() => {
    switch (currentStep.kind) {
      case "vat-input":
      case "vat-processing":
      case "vat-review":
        return 0;
      case "field":
        return currentStep.fieldIndex + 1;
      case "address-question":
        return totalFieldsBefore + 1;
      case "delivery-field":
        return totalFieldsBefore + 1 + currentStep.fieldIndex + 1;
      case "cap-disambiguation":
        return currentStep.targetField === "postalCode"
          ? FIELDS_BEFORE_ADDRESS_QUESTION.findIndex(
              (f) => f.key === "postalCode",
            ) + 1
          : totalFieldsBefore +
              1 +
              DELIVERY_ADDRESS_FIELDS.findIndex(
                (f) => f.key === "deliveryPostalCode",
              ) +
              1;
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
      setSameDeliveryAddress(null);
      setPaymentTermsSearch("");
      setPaymentTermsHighlight(0);
      setCapDisambiguationEntries([]);
      setProcessingState("idle");
      setTaskId(null);
      setProgress(0);
      setProgressLabel("");
      setBotError(null);
      setInteractiveSessionId(null);
      setBotReady(false);
      setVatResult(null);
      setEarlyVatInput("");
      setVatError(null);
      setChangedFields(new Set());

      if (editCustomer) {
        setFormData(customerToFormData(editCustomer));
        setCurrentStep({ kind: "field", fieldIndex: 0 });
      } else {
        setFormData({ ...INITIAL_FORM });
        setCurrentStep({ kind: "vat-input" });

        customerService
          .startInteractiveSession()
          .then(({ sessionId }) => {
            setInteractiveSessionId(sessionId);
          })
          .catch((err) => {
            console.error(
              "[CustomerCreateModal] Failed to start interactive session:",
              err,
            );
            setCurrentStep({ kind: "field", fieldIndex: 0 });
          });
      }
    } else {
      if (interactiveSessionIdRef.current) {
        customerService
          .cancelInteractiveSession(interactiveSessionIdRef.current)
          .catch(() => {});
      }
    }
  }, [isOpen, editCustomer]);

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

    unsubs.push(
      subscribe("CUSTOMER_UPDATE_PROGRESS", (payload: any) => {
        if (payload.taskId !== taskId) return;
        setProgress(payload.progress);
        setProgressLabel(payload.label || "");
      }),
    );

    unsubs.push(
      subscribe("CUSTOMER_UPDATE_COMPLETED", (payload: any) => {
        if (payload.taskId !== taskId) return;
        markCompleted();
      }),
    );

    unsubs.push(
      subscribe("CUSTOMER_UPDATE_FAILED", (payload: any) => {
        if (payload.taskId !== taskId) return;
        markFailed(payload.error || "Errore sconosciuto");
      }),
    );

    // Polling fallback: if WebSocket events don't arrive, poll botStatus
    const customerProfile = editCustomer?.customerProfile;
    let pollInterval: ReturnType<typeof setInterval> | null = null;

    const pollTimeout = setTimeout(() => {
      if (resolved || !customerProfile) return;
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
      unsubs.forEach((u) => u());
      clearTimeout(pollTimeout);
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [taskId, subscribe, onSaved, onClose, editCustomer]);

  useEffect(() => {
    if (!interactiveSessionId) return;

    const unsubs: Array<() => void> = [];

    unsubs.push(
      subscribe("CUSTOMER_INTERACTIVE_READY", (payload: any) => {
        if (payload.sessionId !== interactiveSessionIdRef.current) return;
        setBotReady(true);
      }),
    );

    unsubs.push(
      subscribe("CUSTOMER_VAT_RESULT", (payload: any) => {
        if (payload.sessionId !== interactiveSessionIdRef.current) return;
        const result = payload.vatResult as VatLookupResult;
        setVatResult(result);
        setCurrentStep({ kind: "vat-review" });

        setFormData((prev) => ({
          ...prev,
          vatNumber: earlyVatInputRef.current.trim() || prev.vatNumber,
          name: result.parsed?.companyName || prev.name,
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
    targetField: "postalCode" | "deliveryPostalCode",
    nextStepFn: () => void,
  ) => {
    if (!capValue) {
      nextStepFn();
      return;
    }
    const entries = CAP_BY_CODE.get(capValue);
    if (!entries || entries.length <= 1) {
      if (entries && entries.length === 1) {
        const cityKey =
          targetField === "postalCode"
            ? "postalCodeCity"
            : "deliveryPostalCodeCity";
        const countryKey =
          targetField === "postalCode"
            ? "postalCodeCountry"
            : "deliveryPostalCodeCountry";
        setFormData((prev) => ({
          ...prev,
          [cityKey]: entries[0].citta,
          [countryKey]: entries[0].paese,
        }));
      }
      nextStepFn();
      return;
    }
    setCapDisambiguationEntries(entries);
    setCurrentStep({ kind: "cap-disambiguation", targetField });
  };

  const goForward = () => {
    switch (currentStep.kind) {
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
              formData[field.key],
              field.key as "postalCode",
              nextStep,
            );
          } else {
            nextStep();
          }
        } else {
          const nextStep = () => setCurrentStep({ kind: "address-question" });
          if (isCapField) {
            resolveCapAndAdvance(
              formData[field.key],
              field.key as "postalCode",
              nextStep,
            );
          } else {
            nextStep();
          }
        }
        break;
      }
      case "address-question":
        break;
      case "delivery-field": {
        const field = DELIVERY_ADDRESS_FIELDS[currentStep.fieldIndex];
        const isCapField =
          field && "fieldType" in field && field.fieldType === "cap";

        if (currentStep.fieldIndex < totalDeliveryFields - 1) {
          const nextStep = () =>
            setCurrentStep({
              kind: "delivery-field",
              fieldIndex: currentStep.fieldIndex + 1,
            });
          if (isCapField) {
            resolveCapAndAdvance(
              formData[field.key],
              field.key as "deliveryPostalCode",
              nextStep,
            );
          } else {
            nextStep();
          }
        } else {
          const nextStep = () => setCurrentStep({ kind: "summary" });
          if (isCapField) {
            resolveCapAndAdvance(
              formData[field.key],
              field.key as "deliveryPostalCode",
              nextStep,
            );
          } else {
            nextStep();
          }
        }
        break;
      }
      case "cap-disambiguation":
      case "summary":
        break;
    }
  };

  const goBack = () => {
    switch (currentStep.kind) {
      case "field": {
        if (currentStep.fieldIndex > 0) {
          setCurrentStep({
            kind: "field",
            fieldIndex: currentStep.fieldIndex - 1,
          });
        }
        break;
      }
      case "address-question":
        setCurrentStep({ kind: "field", fieldIndex: totalFieldsBefore - 1 });
        break;
      case "delivery-field": {
        if (currentStep.fieldIndex > 0) {
          setCurrentStep({
            kind: "delivery-field",
            fieldIndex: currentStep.fieldIndex - 1,
          });
        } else {
          setSameDeliveryAddress(null);
          setCurrentStep({ kind: "address-question" });
        }
        break;
      }
      case "cap-disambiguation": {
        if (currentStep.targetField === "postalCode") {
          const idx = FIELDS_BEFORE_ADDRESS_QUESTION.findIndex(
            (f) => f.key === "postalCode",
          );
          setCurrentStep({
            kind: "field",
            fieldIndex: idx >= 0 ? idx : totalFieldsBefore - 1,
          });
        } else {
          const idx = DELIVERY_ADDRESS_FIELDS.findIndex(
            (f) => f.key === "deliveryPostalCode",
          );
          setCurrentStep({
            kind: "delivery-field",
            fieldIndex: idx >= 0 ? idx : 0,
          });
        }
        break;
      }
      case "summary": {
        if (sameDeliveryAddress === false) {
          setCurrentStep({
            kind: "delivery-field",
            fieldIndex: totalDeliveryFields - 1,
          });
        } else {
          setCurrentStep({ kind: "address-question" });
        }
        break;
      }
    }
  };

  const handleAddressAnswer = (same: boolean) => {
    setSameDeliveryAddress(same);
    if (same) {
      setFormData((prev) => ({
        ...prev,
        deliveryStreet: "",
        deliveryPostalCode: "",
        deliveryPostalCodeCity: "",
        deliveryPostalCodeCountry: "",
      }));
      setCurrentStep({ kind: "summary" });
    } else {
      setCurrentStep({ kind: "delivery-field", fieldIndex: 0 });
    }
  };

  const getCurrentField = (): FieldDef | null => {
    if (currentStep.kind === "field") {
      return FIELDS_BEFORE_ADDRESS_QUESTION[currentStep.fieldIndex] ?? null;
    }
    if (currentStep.kind === "delivery-field") {
      return DELIVERY_ADDRESS_FIELDS[currentStep.fieldIndex] ?? null;
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
    const targetField = (
      currentStep as {
        kind: "cap-disambiguation";
        targetField: "postalCode" | "deliveryPostalCode";
      }
    ).targetField;
    const cityKey =
      targetField === "postalCode"
        ? "postalCodeCity"
        : "deliveryPostalCodeCity";
    const countryKey =
      targetField === "postalCode"
        ? "postalCodeCountry"
        : "deliveryPostalCodeCountry";
    setFormData((prev) => ({
      ...prev,
      [cityKey]: entry.citta,
      [countryKey]: entry.paese,
    }));

    if (targetField === "postalCode") {
      const capIdx = FIELDS_BEFORE_ADDRESS_QUESTION.findIndex(
        (f) => f.key === "postalCode",
      );
      if (capIdx < totalFieldsBefore - 1) {
        setCurrentStep({ kind: "field", fieldIndex: capIdx + 1 });
      } else {
        setCurrentStep({ kind: "address-question" });
      }
    } else {
      const capIdx = DELIVERY_ADDRESS_FIELDS.findIndex(
        (f) => f.key === "deliveryPostalCode",
      );
      if (capIdx < totalDeliveryFields - 1) {
        setCurrentStep({ kind: "delivery-field", fieldIndex: capIdx + 1 });
      } else {
        setCurrentStep({ kind: "summary" });
      }
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
    const field = ALL_DISPLAY_FIELDS.find((f) => f.key === key);
    const transformed = field?.transform ? field.transform(value) : value;
    setFormData((prev) => {
      const next = { ...prev, [key]: transformed };
      if (key === "pec" && transformed.trim().length > 0 && !prev.sdi) {
        next.sdi = "0000000";
      }
      return next;
    });
    if (isEditMode) {
      setChangedFields((prev) => new Set(prev).add(key));
    }
  };

  const handleSubmitVat = () => {
    const vat = earlyVatInput.trim();
    if (!vat || !interactiveSessionId) return;

    setVatError(null);

    if (botReady) {
      setCurrentStep({ kind: "vat-processing" });
      customerService
        .submitVatNumber(interactiveSessionId, vat)
        .catch((err) => {
          setVatError(
            err instanceof Error ? err.message : "Errore verifica P.IVA",
          );
          setCurrentStep({ kind: "vat-input" });
        });
    }
  };

  const handleSkipVat = () => {
    setCurrentStep({ kind: "field", fieldIndex: 0 });
  };

  const handleVatReviewContinue = () => {
    setCurrentStep({ kind: "field", fieldIndex: 0 });
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setBotError(null);
    try {
      const isEmptyPhone = !formData.phone || formData.phone.trim() === "+39";
      const isEmptyMobile =
        !formData.mobile || formData.mobile.trim() === "+39";

      const dataToSend: CustomerFormData = {
        ...formData,
        phone: isEmptyPhone && !isEmptyMobile ? formData.mobile : formData.phone,
        mobile: isEmptyMobile && !isEmptyPhone ? formData.phone : formData.mobile,
        url: formData.url.trim() || "https://www.example.com/",
      };

      let resultTaskId: string | null = null;

      if (isEditMode) {
        const payload =
          changedFields.size > 0
            ? { ...dataToSend, changedFields: Array.from(changedFields) }
            : dataToSend;
        const result = await customerService.updateCustomer(
          editCustomer!.customerProfile,
          payload,
        );
        resultTaskId = result.taskId;
      } else if (interactiveSessionId) {
        const result = await customerService.saveInteractiveCustomer(
          interactiveSessionId,
          dataToSend,
        );
        resultTaskId = result.taskId;
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
    if (!editCustomer && !taskId) return;
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
  const isFieldStep =
    currentStep.kind === "field" || currentStep.kind === "delivery-field";
  const isAddressQuestion = currentStep.kind === "address-question";
  const isCapDisambiguation = currentStep.kind === "cap-disambiguation";
  const isSummary = currentStep.kind === "summary";
  const isFirstStep =
    currentStep.kind === "field" && currentStep.fieldIndex === 0;
  const isProcessing = processingState !== "idle";
  const isInteractiveStep = isVatInput || isVatProcessing || isVatReview;

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
        zIndex: 10000,
        backdropFilter: "blur(4px)",
        ...modalOverlayKeyboardStyle,
      }}
    >
      <div
        style={{
          backgroundColor: "#fff",
          borderRadius: "16px",
          padding: "32px",
          maxWidth: "500px",
          width: "90%",
          maxHeight: "90vh",
          overflowY: "auto",
          boxShadow: "0 20px 60px rgba(0, 0, 0, 0.3)",
          ...keyboardPaddingStyle,
        }}
      >
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
              {isEditMode ? "Modifica Cliente" : "Nuovo Cliente"}
            </h2>
            {!isSummary && !isCapDisambiguation && (
              <p style={{ fontSize: "14px", color: "#999" }}>
                Passo {currentStepNumber} di {totalSteps}
                {!isAddressQuestion ? " — Premi Enter per avanzare" : ""}
              </p>
            )}
            {isEditMode && !isSummary && !isCapDisambiguation && (
              <p
                style={{ fontSize: "12px", color: "#1976d2", marginTop: "4px" }}
              >
                {editCustomer!.customerProfile}
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

            {!botReady && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "12px",
                  backgroundColor: "#e3f2fd",
                  borderRadius: "8px",
                  marginBottom: "16px",
                  fontSize: "14px",
                  color: "#1976d2",
                }}
              >
                <span
                  style={{
                    display: "inline-block",
                    width: "16px",
                    height: "16px",
                    border: "2px solid #1976d2",
                    borderTop: "2px solid transparent",
                    borderRadius: "50%",
                    animation: "spin 1s linear infinite",
                  }}
                />
                Bot in avvio...
              </div>
            )}

            {botReady && (
              <div
                style={{
                  padding: "12px",
                  backgroundColor: "#e8f5e9",
                  borderRadius: "8px",
                  marginBottom: "16px",
                  fontSize: "14px",
                  color: "#2e7d32",
                }}
              >
                Bot pronto
              </div>
            )}

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
            <input
              ref={inputRef}
              type="text"
              value={earlyVatInput}
              onChange={(e) => setEarlyVatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (earlyVatInput.trim().length > 0 && botReady) {
                    handleSubmitVat();
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
                onClick={handleSubmitVat}
                disabled={earlyVatInput.trim().length === 0 || !botReady}
                style={{
                  flex: 1,
                  padding: "14px",
                  fontSize: "16px",
                  fontWeight: 700,
                  backgroundColor:
                    earlyVatInput.trim().length === 0 || !botReady
                      ? "#ccc"
                      : "#1976d2",
                  color: "#fff",
                  border: "none",
                  borderRadius: "8px",
                  cursor:
                    earlyVatInput.trim().length === 0 || !botReady
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

              {vatResult.parsed.companyName && (
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
            <input
              ref={inputRef}
              type={
                "type" in currentField && currentField.type
                  ? currentField.type
                  : "text"
              }
              value={formData[currentField.key]}
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
            <input
              ref={inputRef}
              type="text"
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
                {
                  formData[
                    (
                      currentStep as {
                        kind: "cap-disambiguation";
                        targetField: "postalCode" | "deliveryPostalCode";
                      }
                    ).targetField
                  ]
                }
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

        {/* Address question step */}
        {isAddressQuestion && (
          <div style={{ marginBottom: "24px" }}>
            <p
              style={{
                fontSize: "16px",
                fontWeight: 600,
                color: "#333",
                marginBottom: "20px",
                textAlign: "center",
              }}
            >
              L'indirizzo di consegna coincide con quello di fatturazione?
            </p>
            <div style={{ display: "flex", gap: "12px" }}>
              <button
                onClick={() => handleAddressAnswer(true)}
                style={{
                  flex: 1,
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
                Si
              </button>
              <button
                onClick={() => handleAddressAnswer(false)}
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
                No
              </button>
            </div>
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
                const value = formData[field.key];
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
              {sameDeliveryAddress === false &&
                DELIVERY_ADDRESS_FIELDS.map((field) => {
                  const value = formData[field.key];
                  if (!value) return null;
                  let displayValue = value;
                  if (
                    field.key === "deliveryPostalCode" &&
                    formData.deliveryPostalCodeCity
                  ) {
                    displayValue = getCapCityDisplay(
                      value,
                      formData.deliveryPostalCodeCity,
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
                        {field.label}
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
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "8px 0",
                  fontSize: "14px",
                }}
              >
                <span style={{ color: "#666", fontWeight: 600 }}>
                  Indirizzo consegna
                </span>
                <span
                  style={{
                    color: sameDeliveryAddress ? "#4caf50" : "#ff9800",
                    fontWeight: 600,
                  }}
                >
                  {sameDeliveryAddress
                    ? "Coincide con fatturazione"
                    : "Diverso"}
                </span>
              </div>
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
                {saving
                  ? "Salvataggio..."
                  : isEditMode
                    ? "Salva Modifiche"
                    : "Salva Cliente"}
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
                {isEditMode ? "Annulla" : "Elimina"}
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
                    : isEditMode
                      ? "Aggiornamento in corso..."
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
                  {isEditMode
                    ? "Cliente aggiornato con successo!"
                    : "Cliente creato con successo!"}
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
