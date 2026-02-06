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
}

interface CustomerCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  editCustomer?: Customer | null;
}

const FIELDS: Array<{
  key: keyof CustomerFormData;
  label: string;
  defaultValue: string;
  type?: string;
  maxLength?: number;
  transform?: (v: string) => string;
}> = [
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
  };
}

export function CustomerCreateModal({
  isOpen,
  onClose,
  onSaved,
  editCustomer,
}: CustomerCreateModalProps) {
  const isEditMode = !!editCustomer;
  const [step, setStep] = useState(0);
  const [formData, setFormData] = useState<CustomerFormData>({ ...INITIAL_FORM });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const totalFields = FIELDS.length;
  const isSummary = step === totalFields;

  useEffect(() => {
    if (isOpen && !isSummary && inputRef.current) {
      const input = inputRef.current;
      input.focus();
      const fieldKey = FIELDS[step]?.key;
      if (fieldKey === "phone" && input.value.startsWith("+39")) {
        const pos = input.value.length;
        requestAnimationFrame(() => input.setSelectionRange(pos, pos));
      }
    }
  }, [isOpen, step, isSummary]);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setSaving(false);
      if (editCustomer) {
        setFormData(customerToFormData(editCustomer));
        setStep(0);
      } else {
        setFormData({ ...INITIAL_FORM });
        setStep(0);
      }
    }
  }, [isOpen, editCustomer]);

  if (!isOpen) return null;

  const currentField = !isSummary ? FIELDS[step] : null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (step === 0 && formData.name.trim().length === 0) return;
      setStep((s) => Math.min(s + 1, totalFields));
    }
  };

  const handleFieldChange = (key: keyof CustomerFormData, value: string) => {
    const field = FIELDS.find((f) => f.key === key);
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
    setStep(0);
  };

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
              Campo {step + 1} di {totalFields} — Premi Enter per avanzare
            </p>
          )}
          {isEditMode && !isSummary && (
            <p style={{ fontSize: "12px", color: "#1976d2", marginTop: "4px" }}>
              {editCustomer!.customerProfile}
            </p>
          )}
        </div>

        {/* Field input step */}
        {!isSummary && currentField && (
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
                  width: `${((step + 1) / totalFields) * 100}%`,
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
                onClick={() => setStep((s) => Math.max(0, s - 1))}
                disabled={step === 0}
                style={{
                  padding: "10px 20px",
                  fontSize: "14px",
                  fontWeight: 600,
                  backgroundColor: step === 0 ? "#eee" : "#fff",
                  color: step === 0 ? "#999" : "#666",
                  border: "1px solid #ddd",
                  borderRadius: "8px",
                  cursor: step === 0 ? "not-allowed" : "pointer",
                }}
              >
                Indietro
              </button>
              <button
                onClick={() => {
                  if (step === 0 && formData.name.trim().length === 0) return;
                  setStep((s) => Math.min(s + 1, totalFields));
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
                {step === totalFields - 1 ? "Riepilogo" : "Avanti"}
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
              {FIELDS.map((field) => {
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
