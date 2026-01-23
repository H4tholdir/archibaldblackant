import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { Customer } from "../types/customer";
import {
  validatePartitaIVA,
  validateSDI,
  validatePEC,
  validateCAP,
} from "../utils/italianFiscalValidators";
import { toastService } from "../services/toast.service";

interface CustomerEditFormData {
  name: string;
  vatNumber: string;
  pec: string;
  sdi: string;
  street: string;
  postalCode: string;
  phone: string;
  email: string;
  deliveryMode: string;
  paymentTerms: string;
  lineDiscount: string;
}

export function CustomerEdit() {
  const navigate = useNavigate();
  const { customerProfile } = useParams<{ customerProfile: string }>();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState<CustomerEditFormData>({
    name: "",
    vatNumber: "",
    pec: "",
    sdi: "",
    street: "",
    postalCode: "",
    phone: "",
    email: "",
    deliveryMode: "FedEx",
    paymentTerms: "206",
    lineDiscount: "N/A",
  });
  const [originalFormData, setOriginalFormData] =
    useState<CustomerEditFormData | null>(null);

  // Fetch customer data
  useEffect(() => {
    const fetchCustomer = async () => {
      if (!customerProfile) {
        setError("ID cliente mancante");
        setLoading(false);
        return;
      }

      try {
        const token = localStorage.getItem("archibald_jwt");
        if (!token) {
          setError("Non autenticato. Effettua il login.");
          setLoading(false);
          return;
        }

        const response = await fetch(
          `/api/customers?search=${customerProfile}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        );

        if (!response.ok) {
          throw new Error(`Errore ${response.status}`);
        }

        const data = await response.json();
        if (
          !data.success ||
          !data.data.customers ||
          data.data.customers.length === 0
        ) {
          throw new Error("Cliente non trovato");
        }

        const customerData = data.data.customers[0] as Customer;
        setCustomer(customerData);

        // Pre-fill form with customer data
        const initialFormData = {
          name: customerData.name || "",
          vatNumber: customerData.vatNumber || "",
          pec: customerData.pec || "",
          sdi: customerData.sdi || "",
          street: customerData.street || "",
          postalCode: customerData.postalCode || "",
          phone: customerData.phone || "",
          email: customerData.pec || "", // Use PEC as email
          deliveryMode: customerData.deliveryTerms || "FedEx",
          paymentTerms: "206", // Default value, would need to fetch from customer
          lineDiscount: "N/A",
        };
        setFormData(initialFormData);
        setOriginalFormData(initialFormData); // Save original values for comparison
      } catch (err) {
        console.error("Error fetching customer:", err);
        setError(err instanceof Error ? err.message : "Errore di caricamento");
      } finally {
        setLoading(false);
      }
    };

    fetchCustomer();
  }, [customerProfile]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    // Validate fiscal data
    if (formData.vatNumber) {
      const pivaValidation = validatePartitaIVA(formData.vatNumber);
      if (!pivaValidation.valid) {
        setError(pivaValidation.error || "Partita IVA non valida");
        setSaving(false);
        return;
      }
    }

    if (formData.sdi) {
      const sdiValidation = validateSDI(formData.sdi);
      if (!sdiValidation.valid) {
        setError(sdiValidation.error || "Codice SDI non valido");
        setSaving(false);
        return;
      }
    }

    if (formData.pec) {
      const pecValidation = validatePEC(formData.pec);
      if (!pecValidation.valid) {
        setError(pecValidation.error || "PEC non valida");
        setSaving(false);
        return;
      }
    }

    if (formData.postalCode) {
      const capValidation = validateCAP(formData.postalCode);
      if (!capValidation.valid) {
        setError(capValidation.error || "CAP non valido");
        setSaving(false);
        return;
      }
    }

    try {
      const token = localStorage.getItem("archibald_jwt");
      if (!token) {
        throw new Error("Non autenticato");
      }

      // Build object with only changed fields
      const changedFields: Partial<CustomerEditFormData> = {
        name: formData.name,
      }; // name is always required

      if (originalFormData) {
        // Compare each field and include only if changed
        if (formData.vatNumber !== originalFormData.vatNumber) {
          changedFields.vatNumber = formData.vatNumber;
        }
        if (formData.pec !== originalFormData.pec) {
          changedFields.pec = formData.pec;
        }
        if (formData.sdi !== originalFormData.sdi) {
          changedFields.sdi = formData.sdi;
        }
        if (formData.street !== originalFormData.street) {
          changedFields.street = formData.street;
        }
        if (formData.postalCode !== originalFormData.postalCode) {
          changedFields.postalCode = formData.postalCode;
        }
        if (formData.phone !== originalFormData.phone) {
          changedFields.phone = formData.phone;
        }
        if (formData.email !== originalFormData.email) {
          changedFields.email = formData.email;
        }
        if (formData.deliveryMode !== originalFormData.deliveryMode) {
          changedFields.deliveryMode = formData.deliveryMode;
        }
        if (formData.paymentTerms !== originalFormData.paymentTerms) {
          changedFields.paymentTerms = formData.paymentTerms;
        }
        if (formData.lineDiscount !== originalFormData.lineDiscount) {
          changedFields.lineDiscount = formData.lineDiscount;
        }
      } else {
        // If no original data, send all fields (fallback)
        Object.assign(changedFields, formData);
      }

      console.log("Sending only changed fields:", changedFields);

      const response = await fetch(`/api/customers/${customerProfile}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(changedFields),
      });

      if (!response.ok) {
        throw new Error(`Errore ${response.status}`);
      }

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || "Errore durante l'aggiornamento");
      }

      toastService.success("Cliente aggiornato con successo!");
      navigate("/customers");
    } catch (err) {
      console.error("Error updating customer:", err);
      setError(
        err instanceof Error ? err.message : "Errore durante l'aggiornamento",
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: "40px", textAlign: "center" }}>
        <div style={{ fontSize: "48px", marginBottom: "16px" }}>⏳</div>
        <p>Caricamento cliente...</p>
      </div>
    );
  }

  if (error && !customer) {
    return (
      <div style={{ padding: "40px", textAlign: "center" }}>
        <div style={{ fontSize: "48px", marginBottom: "16px" }}>⚠️</div>
        <p style={{ color: "#f44336", marginBottom: "16px" }}>{error}</p>
        <button
          onClick={() => navigate("/customers")}
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
          Torna alla lista
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        maxWidth: "800px",
        margin: "0 auto",
        padding: "24px",
        backgroundColor: "#f5f5f5",
        minHeight: "100vh",
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: "24px" }}>
        <button
          onClick={() => navigate("/customers")}
          style={{
            padding: "8px 16px",
            fontSize: "14px",
            fontWeight: 600,
            backgroundColor: "#fff",
            color: "#666",
            border: "1px solid #ddd",
            borderRadius: "8px",
            cursor: "pointer",
            marginBottom: "16px",
          }}
        >
          ← Torna alla lista
        </button>
        <h1
          style={{
            fontSize: "28px",
            fontWeight: 700,
            color: "#333",
            marginBottom: "8px",
          }}
        >
          ✏️ Modifica Cliente
        </h1>
        <p style={{ fontSize: "16px", color: "#666" }}>
          {customer?.name} - {customerProfile}
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit}>
        <div
          style={{
            backgroundColor: "#fff",
            borderRadius: "12px",
            padding: "24px",
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
          }}
        >
          {/* Basic Info Section */}
          <div style={{ marginBottom: "24px" }}>
            <h3
              style={{
                fontSize: "18px",
                fontWeight: 700,
                color: "#333",
                marginBottom: "16px",
              }}
            >
              📋 Informazioni Base
            </h3>
            <div style={{ display: "grid", gap: "16px" }}>
              <div>
                <label
                  htmlFor="name"
                  style={{
                    display: "block",
                    fontSize: "14px",
                    fontWeight: 600,
                    color: "#333",
                    marginBottom: "8px",
                  }}
                >
                  Nome / Ragione Sociale *
                </label>
                <input
                  id="name"
                  type="text"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  required
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    fontSize: "14px",
                    border: "1px solid #ddd",
                    borderRadius: "8px",
                    outline: "none",
                  }}
                />
              </div>
            </div>
          </div>

          {/* Fiscal Data Section */}
          <div style={{ marginBottom: "24px" }}>
            <h3
              style={{
                fontSize: "18px",
                fontWeight: 700,
                color: "#333",
                marginBottom: "16px",
              }}
            >
              📄 Dati Fiscali
            </h3>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "16px",
              }}
            >
              <div>
                <label
                  htmlFor="vatNumber"
                  style={{
                    display: "block",
                    fontSize: "14px",
                    fontWeight: 600,
                    color: "#333",
                    marginBottom: "8px",
                  }}
                >
                  Partita IVA
                </label>
                <input
                  id="vatNumber"
                  type="text"
                  value={formData.vatNumber}
                  onChange={(e) =>
                    setFormData({ ...formData, vatNumber: e.target.value })
                  }
                  maxLength={11}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    fontSize: "14px",
                    border: "1px solid #ddd",
                    borderRadius: "8px",
                    outline: "none",
                  }}
                />
              </div>
              <div>
                <label
                  htmlFor="sdi"
                  style={{
                    display: "block",
                    fontSize: "14px",
                    fontWeight: 600,
                    color: "#333",
                    marginBottom: "8px",
                  }}
                >
                  Codice SDI
                </label>
                <input
                  id="sdi"
                  type="text"
                  value={formData.sdi}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      sdi: e.target.value.toUpperCase(),
                    })
                  }
                  maxLength={7}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    fontSize: "14px",
                    border: "1px solid #ddd",
                    borderRadius: "8px",
                    outline: "none",
                  }}
                />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label
                  htmlFor="pec"
                  style={{
                    display: "block",
                    fontSize: "14px",
                    fontWeight: 600,
                    color: "#333",
                    marginBottom: "8px",
                  }}
                >
                  PEC (Email Certificata)
                </label>
                <input
                  id="pec"
                  type="email"
                  value={formData.pec}
                  onChange={(e) =>
                    setFormData({ ...formData, pec: e.target.value })
                  }
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    fontSize: "14px",
                    border: "1px solid #ddd",
                    borderRadius: "8px",
                    outline: "none",
                  }}
                />
              </div>
            </div>
          </div>

          {/* Contact Info Section */}
          <div style={{ marginBottom: "24px" }}>
            <h3
              style={{
                fontSize: "18px",
                fontWeight: 700,
                color: "#333",
                marginBottom: "16px",
              }}
            >
              📞 Contatti
            </h3>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "16px",
              }}
            >
              <div>
                <label
                  htmlFor="phone"
                  style={{
                    display: "block",
                    fontSize: "14px",
                    fontWeight: 600,
                    color: "#333",
                    marginBottom: "8px",
                  }}
                >
                  Telefono
                </label>
                <input
                  id="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) =>
                    setFormData({ ...formData, phone: e.target.value })
                  }
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    fontSize: "14px",
                    border: "1px solid #ddd",
                    borderRadius: "8px",
                    outline: "none",
                  }}
                />
              </div>
              <div>
                <label
                  htmlFor="email"
                  style={{
                    display: "block",
                    fontSize: "14px",
                    fontWeight: 600,
                    color: "#333",
                    marginBottom: "8px",
                  }}
                >
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    fontSize: "14px",
                    border: "1px solid #ddd",
                    borderRadius: "8px",
                    outline: "none",
                  }}
                />
              </div>
            </div>
          </div>

          {/* Address Section */}
          <div style={{ marginBottom: "24px" }}>
            <h3
              style={{
                fontSize: "18px",
                fontWeight: 700,
                color: "#333",
                marginBottom: "16px",
              }}
            >
              📍 Indirizzo
            </h3>
            <div style={{ display: "grid", gap: "16px" }}>
              <div>
                <label
                  htmlFor="street"
                  style={{
                    display: "block",
                    fontSize: "14px",
                    fontWeight: 600,
                    color: "#333",
                    marginBottom: "8px",
                  }}
                >
                  Via
                </label>
                <input
                  id="street"
                  type="text"
                  value={formData.street}
                  onChange={(e) =>
                    setFormData({ ...formData, street: e.target.value })
                  }
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    fontSize: "14px",
                    border: "1px solid #ddd",
                    borderRadius: "8px",
                    outline: "none",
                  }}
                />
              </div>
              <div>
                <label
                  htmlFor="postalCode"
                  style={{
                    display: "block",
                    fontSize: "14px",
                    fontWeight: 600,
                    color: "#333",
                    marginBottom: "8px",
                  }}
                >
                  CAP
                </label>
                <input
                  id="postalCode"
                  type="text"
                  value={formData.postalCode}
                  onChange={(e) =>
                    setFormData({ ...formData, postalCode: e.target.value })
                  }
                  maxLength={5}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    fontSize: "14px",
                    border: "1px solid #ddd",
                    borderRadius: "8px",
                    outline: "none",
                  }}
                />
              </div>
            </div>
          </div>

          {/* Commercial Info Section */}
          <div style={{ marginBottom: "24px" }}>
            <h3
              style={{
                fontSize: "18px",
                fontWeight: 700,
                color: "#333",
                marginBottom: "16px",
              }}
            >
              💼 Informazioni Commerciali
            </h3>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: "16px",
              }}
            >
              <div>
                <label
                  htmlFor="deliveryMode"
                  style={{
                    display: "block",
                    fontSize: "14px",
                    fontWeight: 600,
                    color: "#333",
                    marginBottom: "8px",
                  }}
                >
                  Modalità di consegna
                </label>
                <select
                  id="deliveryMode"
                  value={formData.deliveryMode}
                  onChange={(e) =>
                    setFormData({ ...formData, deliveryMode: e.target.value })
                  }
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    fontSize: "14px",
                    border: "1px solid #ddd",
                    borderRadius: "8px",
                    outline: "none",
                  }}
                >
                  <option value="FedEx">FedEx</option>
                  <option value="Corriere">Corriere</option>
                  <option value="Ritiro">Ritiro</option>
                </select>
              </div>
              <div>
                <label
                  htmlFor="paymentTerms"
                  style={{
                    display: "block",
                    fontSize: "14px",
                    fontWeight: 600,
                    color: "#333",
                    marginBottom: "8px",
                  }}
                >
                  Termini di pagamento
                </label>
                <input
                  id="paymentTerms"
                  type="text"
                  value={formData.paymentTerms}
                  onChange={(e) =>
                    setFormData({ ...formData, paymentTerms: e.target.value })
                  }
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    fontSize: "14px",
                    border: "1px solid #ddd",
                    borderRadius: "8px",
                    outline: "none",
                  }}
                />
              </div>
              <div>
                <label
                  htmlFor="lineDiscount"
                  style={{
                    display: "block",
                    fontSize: "14px",
                    fontWeight: 600,
                    color: "#333",
                    marginBottom: "8px",
                  }}
                >
                  Sconto linea
                </label>
                <select
                  id="lineDiscount"
                  value={formData.lineDiscount}
                  onChange={(e) =>
                    setFormData({ ...formData, lineDiscount: e.target.value })
                  }
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    fontSize: "14px",
                    border: "1px solid #ddd",
                    borderRadius: "8px",
                    outline: "none",
                  }}
                >
                  <option value="N/A">N/A</option>
                  <option value="5%">5%</option>
                  <option value="10%">10%</option>
                  <option value="15%">15%</option>
                </select>
              </div>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div
              style={{
                padding: "12px",
                backgroundColor: "#ffebee",
                border: "1px solid #f44336",
                borderRadius: "8px",
                color: "#f44336",
                marginBottom: "16px",
              }}
            >
              {error}
            </div>
          )}

          {/* Action Buttons */}
          <div
            style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}
          >
            <button
              type="button"
              onClick={() => navigate("/customers")}
              disabled={saving}
              style={{
                padding: "12px 24px",
                fontSize: "14px",
                fontWeight: 600,
                backgroundColor: "#fff",
                color: "#666",
                border: "1px solid #ddd",
                borderRadius: "8px",
                cursor: saving ? "not-allowed" : "pointer",
                opacity: saving ? 0.6 : 1,
              }}
            >
              Annulla
            </button>
            <button
              type="submit"
              disabled={saving}
              style={{
                padding: "12px 24px",
                fontSize: "14px",
                fontWeight: 600,
                backgroundColor: saving ? "#ccc" : "#1976d2",
                color: "#fff",
                border: "none",
                borderRadius: "8px",
                cursor: saving ? "not-allowed" : "pointer",
                opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? "⏳ Salvataggio..." : "💾 Salva modifiche"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
