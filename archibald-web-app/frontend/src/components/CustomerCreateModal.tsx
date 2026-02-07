import { useState, useRef, useEffect } from "react";
import { customerService } from "../services/customers.service";
import type { Customer } from "../types/customer";

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
  type?: string;
  maxLength?: number;
  transform?: (v: string) => string;
};

const FIELDS_BEFORE_ADDRESS_QUESTION: FieldDef[] = [
  { key: "name", label: "Nome *", defaultValue: "" },
  { key: "deliveryMode", label: "Modalità di consegna", defaultValue: "FedEx" },
  { key: "vatNumber", label: "Partita IVA", defaultValue: "", maxLength: 11 },
  { key: "paymentTerms", label: "Termini di pagamento", defaultValue: "206" },
  { key: "pec", label: "PEC", defaultValue: "", type: "email" },
  {
    key: "sdi",
    label: "SDI",
    defaultValue: "",
    maxLength: 7,
    transform: (v: string) => v.toUpperCase(),
  },
  { key: "street", label: "Via e civico", defaultValue: "" },
  { key: "postalCode", label: "CAP", defaultValue: "", maxLength: 5 },
  { key: "phone", label: "Telefono", defaultValue: "+39", type: "tel" },
  { key: "email", label: "Email", defaultValue: "", type: "email" },
];

const DELIVERY_ADDRESS_FIELDS: FieldDef[] = [
  { key: "deliveryStreet", label: "Via e civico (consegna)", defaultValue: "" },
  { key: "deliveryPostalCode", label: "CAP (consegna)", defaultValue: "", maxLength: 5 },
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
  };
}

type StepType =
  | { kind: "field"; fieldIndex: number }
  | { kind: "address-question" }
  | { kind: "delivery-field"; fieldIndex: number }
  | { kind: "summary" };

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

  const totalFieldsBefore = FIELDS_BEFORE_ADDRESS_QUESTION.length;
  const totalDeliveryFields = DELIVERY_ADDRESS_FIELDS.length;

  const totalSteps = totalFieldsBefore + 1 + (sameDeliveryAddress === false ? totalDeliveryFields : 0) + 1;

  const currentStepNumber = (() => {
    switch (currentStep.kind) {
      case "field": return currentStep.fieldIndex + 1;
      case "address-question": return totalFieldsBefore + 1;
      case "delivery-field": return totalFieldsBefore + 1 + currentStep.fieldIndex + 1;
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
      if (editCustomer) {
        setFormData(customerToFormData(editCustomer));
      } else {
        setFormData({ ...INITIAL_FORM });
      }
      setCurrentStep({ kind: "field", fieldIndex: 0 });
    }
  }, [isOpen, editCustomer]);

  if (!isOpen) return null;

  const goForward = () => {
    switch (currentStep.kind) {
      case "field": {
        if (currentStep.fieldIndex < totalFieldsBefore - 1) {
          setCurrentStep({ kind: "field", fieldIndex: currentStep.fieldIndex + 1 });
        } else {
          setCurrentStep({ kind: "address-question" });
        }
        break;
      }
      case "address-question":
        break;
      case "delivery-field": {
        if (currentStep.fieldIndex < totalDeliveryFields - 1) {
          setCurrentStep({ kind: "delivery-field", fieldIndex: currentStep.fieldIndex + 1 });
        } else {
          setCurrentStep({ kind: "summary" });
        }
        break;
      }
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
      setFormData((prev) => ({ ...prev, deliveryStreet: "", deliveryPostalCode: "" }));
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
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
          {!isSummary && (
            <p style={{ fontSize: "14px", color: "#999" }}>
              Passo {currentStepNumber} di {totalSteps}{!isAddressQuestion ? " — Premi Enter per avanzare" : ""}
            </p>
          )}
          {isEditMode && !isSummary && (
            <p style={{ fontSize: "12px", color: "#1976d2", marginTop: "4px" }}>
              {editCustomer!.customerProfile}
            </p>
          )}
        </div>

        {/* Field input step */}
        {isFieldStep && currentField && (
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
              type={currentField.type ?? "text"}
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
                    <span style={{ color: "#333" }}>{value}</span>
                  </div>
                );
              })}
              {sameDeliveryAddress === false && DELIVERY_ADDRESS_FIELDS.map((field) => {
                const value = formData[field.key];
                if (!value) return null;
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
                    <span style={{ color: "#333" }}>{value}</span>
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
