import { useState, useRef, useEffect } from "react";
import { customerService } from "../services/customers.service";
import type { Customer } from "../types/customer";
import { PAYMENT_TERMS } from "../data/payment-terms";
import { CAP_BY_CODE } from "../data/cap-list";
import type { CapEntry } from "../data/cap-list";

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
  email: string;
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
  { key: "paymentTerms", label: "Termini di pagamento", defaultValue: "206", fieldType: "payment-terms" },
  { key: "pec", label: "PEC", defaultValue: "", type: "email" },
  {
    key: "sdi",
    label: "SDI",
    defaultValue: "",
    maxLength: 7,
    transform: (v: string) => v.toUpperCase(),
  },
  { key: "street", label: "Via e civico", defaultValue: "" },
  { key: "postalCode", label: "CAP", defaultValue: "", maxLength: 5, fieldType: "cap" },
  { key: "phone", label: "Telefono", defaultValue: "+39", type: "tel" },
  { key: "email", label: "Email", defaultValue: "", type: "email" },
];

const DELIVERY_ADDRESS_FIELDS: FieldDef[] = [
  { key: "deliveryStreet", label: "Via e civico (consegna)", defaultValue: "" },
  { key: "deliveryPostalCode", label: "CAP (consegna)", defaultValue: "", maxLength: 5, fieldType: "cap" },
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
  email: "",
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
      ? customer.phone.startsWith("+39") ? customer.phone : `+39 ${customer.phone}`
      : "+39",
    email: customer.pec || "",
    deliveryStreet: "",
    deliveryPostalCode: "",
    postalCodeCity: "",
    postalCodeCountry: "",
    deliveryPostalCodeCity: "",
    deliveryPostalCodeCountry: "",
  };
}

type StepType =
  | { kind: "field"; fieldIndex: number }
  | { kind: "address-question" }
  | { kind: "delivery-field"; fieldIndex: number }
  | { kind: "cap-disambiguation"; targetField: "postalCode" | "deliveryPostalCode" }
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
  const [currentStep, setCurrentStep] = useState<StepType>({ kind: "field", fieldIndex: 0 });
  const [formData, setFormData] = useState<CustomerFormData>({ ...INITIAL_FORM });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sameDeliveryAddress, setSameDeliveryAddress] = useState<boolean | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [paymentTermsSearch, setPaymentTermsSearch] = useState("");
  const [paymentTermsHighlight, setPaymentTermsHighlight] = useState(0);

  const [capDisambiguationEntries, setCapDisambiguationEntries] = useState<CapEntry[]>([]);

  const totalFieldsBefore = FIELDS_BEFORE_ADDRESS_QUESTION.length;
  const totalDeliveryFields = DELIVERY_ADDRESS_FIELDS.length;

  const totalSteps = totalFieldsBefore + 1 + (sameDeliveryAddress === false ? totalDeliveryFields : 0) + 1;

  const currentStepNumber = (() => {
    switch (currentStep.kind) {
      case "field": return currentStep.fieldIndex + 1;
      case "address-question": return totalFieldsBefore + 1;
      case "delivery-field": return totalFieldsBefore + 1 + currentStep.fieldIndex + 1;
      case "cap-disambiguation": return currentStep.targetField === "postalCode"
        ? FIELDS_BEFORE_ADDRESS_QUESTION.findIndex((f) => f.key === "postalCode") + 1
        : totalFieldsBefore + 1 + DELIVERY_ADDRESS_FIELDS.findIndex((f) => f.key === "deliveryPostalCode") + 1;
      case "summary": return totalSteps;
    }
  })();

  useEffect(() => {
    if (isOpen && inputRef.current) {
      const input = inputRef.current;
      input.focus();
      if (currentStep.kind === "field") {
        const fieldKey = FIELDS_BEFORE_ADDRESS_QUESTION[currentStep.fieldIndex]?.key;
        if (fieldKey === "phone" && input.value.startsWith("+39")) {
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
      if (editCustomer) {
        setFormData(customerToFormData(editCustomer));
      } else {
        setFormData({ ...INITIAL_FORM });
      }
      setCurrentStep({ kind: "field", fieldIndex: 0 });
    }
  }, [isOpen, editCustomer]);

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
        const cityKey = targetField === "postalCode" ? "postalCodeCity" : "deliveryPostalCodeCity";
        const countryKey = targetField === "postalCode" ? "postalCodeCountry" : "deliveryPostalCodeCountry";
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
        const isCapField = field && "fieldType" in field && field.fieldType === "cap";

        if (currentStep.fieldIndex < totalFieldsBefore - 1) {
          const nextStep = () => setCurrentStep({ kind: "field", fieldIndex: currentStep.fieldIndex + 1 });
          if (isCapField) {
            resolveCapAndAdvance(formData[field.key], field.key as "postalCode", nextStep);
          } else {
            nextStep();
          }
        } else {
          const nextStep = () => setCurrentStep({ kind: "address-question" });
          if (isCapField) {
            resolveCapAndAdvance(formData[field.key], field.key as "postalCode", nextStep);
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
        const isCapField = field && "fieldType" in field && field.fieldType === "cap";

        if (currentStep.fieldIndex < totalDeliveryFields - 1) {
          const nextStep = () => setCurrentStep({ kind: "delivery-field", fieldIndex: currentStep.fieldIndex + 1 });
          if (isCapField) {
            resolveCapAndAdvance(formData[field.key], field.key as "deliveryPostalCode", nextStep);
          } else {
            nextStep();
          }
        } else {
          const nextStep = () => setCurrentStep({ kind: "summary" });
          if (isCapField) {
            resolveCapAndAdvance(formData[field.key], field.key as "deliveryPostalCode", nextStep);
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
          setCurrentStep({ kind: "field", fieldIndex: currentStep.fieldIndex - 1 });
        }
        break;
      }
      case "address-question":
        setCurrentStep({ kind: "field", fieldIndex: totalFieldsBefore - 1 });
        break;
      case "delivery-field": {
        if (currentStep.fieldIndex > 0) {
          setCurrentStep({ kind: "delivery-field", fieldIndex: currentStep.fieldIndex - 1 });
        } else {
          setSameDeliveryAddress(null);
          setCurrentStep({ kind: "address-question" });
        }
        break;
      }
      case "cap-disambiguation": {
        if (currentStep.targetField === "postalCode") {
          const idx = FIELDS_BEFORE_ADDRESS_QUESTION.findIndex((f) => f.key === "postalCode");
          setCurrentStep({ kind: "field", fieldIndex: idx >= 0 ? idx : totalFieldsBefore - 1 });
        } else {
          const idx = DELIVERY_ADDRESS_FIELDS.findIndex((f) => f.key === "deliveryPostalCode");
          setCurrentStep({ kind: "delivery-field", fieldIndex: idx >= 0 ? idx : 0 });
        }
        break;
      }
      case "summary": {
        if (sameDeliveryAddress === false) {
          setCurrentStep({ kind: "delivery-field", fieldIndex: totalDeliveryFields - 1 });
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

  const isPaymentTermsStep = currentField !== null && "fieldType" in currentField && currentField.fieldType === "payment-terms";

  const filteredPaymentTerms = (() => {
    if (!isPaymentTermsStep) return [];
    if (!paymentTermsSearch) return PAYMENT_TERMS;
    const q = paymentTermsSearch.toLowerCase();
    return PAYMENT_TERMS.filter(
      (t) => t.id.toLowerCase().includes(q) || t.descrizione.toLowerCase().includes(q),
    );
  })();

  const handlePaymentTermSelect = (id: string) => {
    setFormData((prev) => ({ ...prev, paymentTerms: id }));
    setPaymentTermsSearch("");
    setPaymentTermsHighlight(0);
    goForward();
  };

  const handleCapDisambiguationSelect = (entry: CapEntry) => {
    const targetField = (currentStep as { kind: "cap-disambiguation"; targetField: "postalCode" | "deliveryPostalCode" }).targetField;
    const cityKey = targetField === "postalCode" ? "postalCodeCity" : "deliveryPostalCodeCity";
    const countryKey = targetField === "postalCode" ? "postalCodeCountry" : "deliveryPostalCodeCountry";
    setFormData((prev) => ({
      ...prev,
      [cityKey]: entry.citta,
      [countryKey]: entry.paese,
    }));

    if (targetField === "postalCode") {
      const capIdx = FIELDS_BEFORE_ADDRESS_QUESTION.findIndex((f) => f.key === "postalCode");
      if (capIdx < totalFieldsBefore - 1) {
        setCurrentStep({ kind: "field", fieldIndex: capIdx + 1 });
      } else {
        setCurrentStep({ kind: "address-question" });
      }
    } else {
      const capIdx = DELIVERY_ADDRESS_FIELDS.findIndex((f) => f.key === "deliveryPostalCode");
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
        setPaymentTermsHighlight((prev) => Math.min(prev + 1, filteredPaymentTerms.length - 1));
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
          handlePaymentTermSelect(filteredPaymentTerms[paymentTermsHighlight].id);
        }
        return;
      }
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      if (currentStep.kind === "field" && currentStep.fieldIndex === 0 && formData.name.trim().length === 0) return;
      goForward();
    }
  };

  const handleFieldChange = (key: keyof CustomerFormData, value: string) => {
    const field = ALL_DISPLAY_FIELDS.find((f) => f.key === key);
    const transformed = field?.transform ? field.transform(value) : value;
    setFormData((prev) => ({ ...prev, [key]: transformed }));
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      if (isEditMode) {
        await customerService.updateCustomer(
          editCustomer!.customerProfile,
          formData,
        );
      } else {
        await customerService.createCustomer(formData);
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Errore durante il salvataggio",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => {
    onClose();
  };

  const handleEditFields = () => {
    setCurrentStep({ kind: "field", fieldIndex: 0 });
  };

  const isFieldStep = currentStep.kind === "field" || currentStep.kind === "delivery-field";
  const isAddressQuestion = currentStep.kind === "address-question";
  const isCapDisambiguation = currentStep.kind === "cap-disambiguation";
  const isSummary = currentStep.kind === "summary";
  const isFirstStep = currentStep.kind === "field" && currentStep.fieldIndex === 0;

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
        }}
      >
        {/* Header */}
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
              Passo {currentStepNumber} di {totalSteps}{!isAddressQuestion ? " — Premi Enter per avanzare" : ""}
            </p>
          )}
          {isEditMode && !isSummary && !isCapDisambiguation && (
            <p style={{ fontSize: "12px", color: "#1976d2", marginTop: "4px" }}>
              {editCustomer!.customerProfile}
            </p>
          )}
        </div>

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
              type={"type" in currentField && currentField.type ? currentField.type : "text"}
              value={formData[currentField.key]}
              onChange={(e) =>
                handleFieldChange(currentField.key, e.target.value)
              }
              onKeyDown={handleKeyDown}
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
                  if (currentStep.kind === "field" && currentStep.fieldIndex === 0 && formData.name.trim().length === 0) return;
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
                    backgroundColor: i === paymentTermsHighlight ? "#e3f2fd" : "#fff",
                    borderBottom: i < filteredPaymentTerms.length - 1 ? "1px solid #f0f0f0" : "none",
                  }}
                >
                  <span style={{ fontWeight: 700, color: "#1976d2" }}>{term.id}</span>
                  <span style={{ color: "#666" }}> — {term.descrizione}</span>
                </div>
              ))}
              {filteredPaymentTerms.length === 0 && (
                <div style={{ padding: "10px 16px", fontSize: "14px", color: "#999" }}>
                  Nessun risultato
                </div>
              )}
            </div>
            {formData.paymentTerms && (
              <div style={{ marginTop: "8px", fontSize: "13px", color: "#4caf50", fontWeight: 600 }}>
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
                {formData[(currentStep as { kind: "cap-disambiguation"; targetField: "postalCode" | "deliveryPostalCode" }).targetField]}
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
                    borderBottom: i < capDisambiguationEntries.length - 1 ? "1px solid #f0f0f0" : "none",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.backgroundColor = "#e3f2fd";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.backgroundColor = "#fff";
                  }}
                >
                  <span style={{ fontWeight: 700, color: "#333" }}>{entry.citta}</span>
                  <span style={{ color: "#666" }}> ({entry.contea})</span>
                  {entry.paese !== "IT" && (
                    <span style={{ color: "#999", marginLeft: "8px", fontSize: "12px" }}>
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
            <div style={{ display: "flex", justifyContent: "flex-start", marginTop: "16px" }}>
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
        {isSummary && (
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
                  displayValue = getCapCityDisplay(value, formData.postalCodeCity);
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
                    <span style={{ color: "#333", maxWidth: "60%", textAlign: "right", wordBreak: "break-word" }}>{displayValue}</span>
                  </div>
                );
              })}
              {sameDeliveryAddress === false && DELIVERY_ADDRESS_FIELDS.map((field) => {
                const value = formData[field.key];
                if (!value) return null;
                let displayValue = value;
                if (field.key === "deliveryPostalCode" && formData.deliveryPostalCodeCity) {
                  displayValue = getCapCityDisplay(value, formData.deliveryPostalCodeCity);
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
                    <span style={{ color: "#333", maxWidth: "60%", textAlign: "right", wordBreak: "break-word" }}>{displayValue}</span>
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
                <span style={{ color: sameDeliveryAddress ? "#4caf50" : "#ff9800", fontWeight: 600 }}>
                  {sameDeliveryAddress ? "Coincide con fatturazione" : "Diverso"}
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
      </div>
    </div>
  );
}
