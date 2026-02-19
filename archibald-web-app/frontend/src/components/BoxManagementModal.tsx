import { useState, useEffect } from "react";
import { useKeyboardScroll } from "../hooks/useKeyboardScroll";
import type { BoxWithStats } from "../types/warehouse";
import {
  getWarehouseBoxes,
  createBox,
  renameBox,
  deleteBox,
} from "../api/warehouse";
import { toastService } from "../services/toast.service";

export interface BoxManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Tab = "list" | "create";

export function BoxManagementModal({
  isOpen,
  onClose,
}: BoxManagementModalProps) {
  const [activeTab, setActiveTab] = useState<Tab>("list");
  const [boxes, setBoxes] = useState<BoxWithStats[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingBox, setEditingBox] = useState<string | null>(null);
  const [newBoxName, setNewBoxName] = useState("");
  const [editName, setEditName] = useState("");
  const {
    scrollFieldIntoView,
    modalOverlayKeyboardStyle,
    keyboardPaddingStyle,
  } = useKeyboardScroll();

  useEffect(() => {
    if (isOpen && activeTab === "list") {
      loadBoxes();
    }
  }, [isOpen, activeTab]);

  const loadBoxes = async () => {
    setLoading(true);
    try {
      const result = await getWarehouseBoxes();
      setBoxes(result);
    } catch (error) {
      console.error("Load boxes error:", error);
      toastService.error("Errore caricamento scatoli");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateBox = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBoxName.trim()) {
      toastService.error("Nome scatolo obbligatorio");
      return;
    }

    // Check duplicates client-side
    if (boxes.some((b) => b.name === newBoxName.trim())) {
      toastService.error("Uno scatolo con questo nome esiste già");
      return;
    }

    setLoading(true);
    try {
      await createBox(newBoxName.trim());
      toastService.success("✅ Scatolo creato");
      setNewBoxName("");
      setActiveTab("list");
      await loadBoxes();
    } catch (error) {
      console.error("Create box error:", error);
      toastService.error(
        error instanceof Error ? error.message : "Errore creazione scatolo",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleStartRename = (boxName: string) => {
    setEditingBox(boxName);
    setEditName(boxName);
  };

  const handleRename = async (oldName: string) => {
    if (!editName.trim() || editName.trim() === oldName) {
      setEditingBox(null);
      return;
    }

    // Check duplicates
    if (boxes.some((b) => b.name === editName.trim())) {
      toastService.error("Uno scatolo con questo nome esiste già");
      return;
    }

    setLoading(true);
    try {
      await renameBox(oldName, editName.trim());
      toastService.success("✅ Scatolo rinominato");
      setEditingBox(null);
      await loadBoxes();
    } catch (error) {
      console.error("Rename box error:", error);
      toastService.error(
        error instanceof Error ? error.message : "Errore rinomina scatolo",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (boxName: string) => {
    if (
      !window.confirm(`Sei sicuro di voler cancellare lo scatolo "${boxName}"?`)
    ) {
      return;
    }

    setLoading(true);
    try {
      await deleteBox(boxName);
      toastService.success("✅ Scatolo cancellato");
      await loadBoxes();
    } catch (error) {
      console.error("Delete box error:", error);
      toastService.error(
        error instanceof Error ? error.message : "Errore cancellazione scatolo",
      );
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (box: BoxWithStats) => {
    if (box.itemsCount === 0) {
      return { text: "🟢 Vuoto", color: "#d4edda" };
    } else if (box.soldItems > 0) {
      return { text: "🔴 Con Venduti", color: "#f8d7da" };
    } else if (box.reservedItems > 0) {
      return { text: "🟡 Con Riservazioni", color: "#fff3cd" };
    } else {
      return { text: "🔵 Disponibile", color: "#d1ecf1" };
    }
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && !loading) {
      onClose();
    }
  };

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
        zIndex: 1000,
        padding: "16px",
        ...modalOverlayKeyboardStyle,
      }}
      onClick={handleBackdropClick}
    >
      <div
        style={{
          backgroundColor: "#fff",
          borderRadius: "12px",
          maxWidth: "800px",
          width: "100%",
          maxHeight: "80vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.2)",
          animation: "modalSlideIn 0.3s ease-out",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: "24px 24px 16px 24px",
            borderBottom: "1px solid #e0e0e0",
          }}
        >
          <h2
            style={{
              fontSize: "24px",
              fontWeight: 700,
              color: "#333",
              margin: 0,
            }}
          >
            📦 Gestione Scatoli
          </h2>
        </div>

        {/* Tabs */}
        <div
          style={{
            display: "flex",
            gap: "8px",
            padding: "16px 24px 0 24px",
            borderBottom: "1px solid #e0e0e0",
          }}
        >
          <button
            onClick={() => setActiveTab("list")}
            style={{
              padding: "10px 16px",
              fontSize: "14px",
              fontWeight: 600,
              border: "none",
              borderBottom:
                activeTab === "list"
                  ? "3px solid #4caf50"
                  : "3px solid transparent",
              backgroundColor: "transparent",
              cursor: "pointer",
              color: activeTab === "list" ? "#4caf50" : "#666",
            }}
          >
            Lista Scatoli
          </button>
          <button
            onClick={() => setActiveTab("create")}
            style={{
              padding: "10px 16px",
              fontSize: "14px",
              fontWeight: 600,
              border: "none",
              borderBottom:
                activeTab === "create"
                  ? "3px solid #4caf50"
                  : "3px solid transparent",
              backgroundColor: "transparent",
              cursor: "pointer",
              color: activeTab === "create" ? "#4caf50" : "#666",
            }}
          >
            Crea Nuovo
          </button>
        </div>

        {/* Body */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "24px",
            ...keyboardPaddingStyle,
          }}
        >
          {activeTab === "list" && (
            <div>
              {loading && boxes.length === 0 ? (
                <div style={{ textAlign: "center", color: "#666" }}>
                  Caricamento...
                </div>
              ) : boxes.length === 0 ? (
                <div style={{ textAlign: "center", color: "#666" }}>
                  Nessuno scatolo trovato
                </div>
              ) : (
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: "14px",
                  }}
                >
                  <thead>
                    <tr style={{ borderBottom: "2px solid #e0e0e0" }}>
                      <th
                        style={{
                          textAlign: "left",
                          padding: "12px 8px",
                          fontWeight: 600,
                        }}
                      >
                        Nome
                      </th>
                      <th
                        style={{
                          textAlign: "center",
                          padding: "12px 8px",
                          fontWeight: 600,
                        }}
                      >
                        Articoli
                      </th>
                      <th
                        style={{
                          textAlign: "center",
                          padding: "12px 8px",
                          fontWeight: 600,
                        }}
                      >
                        Quantità
                      </th>
                      <th
                        style={{
                          textAlign: "center",
                          padding: "12px 8px",
                          fontWeight: 600,
                        }}
                      >
                        Stato
                      </th>
                      <th
                        style={{
                          textAlign: "center",
                          padding: "12px 8px",
                          fontWeight: 600,
                        }}
                      >
                        Azioni
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {boxes.map((box) => {
                      const status = getStatusBadge(box);
                      return (
                        <tr
                          key={box.name}
                          style={{ borderBottom: "1px solid #e0e0e0" }}
                        >
                          <td style={{ padding: "12px 8px" }}>
                            {editingBox === box.name ? (
                              <input
                                type="text"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                onBlur={() => handleRename(box.name)}
                                onFocus={(e) =>
                                  scrollFieldIntoView(
                                    e.target as HTMLElement,
                                  )
                                }
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") handleRename(box.name);
                                  if (e.key === "Escape") setEditingBox(null);
                                }}
                                autoFocus
                                style={{
                                  width: "100%",
                                  padding: "6px 8px",
                                  fontSize: "14px",
                                  border: "1px solid #4caf50",
                                  borderRadius: "4px",
                                }}
                              />
                            ) : (
                              <strong>{box.name}</strong>
                            )}
                          </td>
                          <td
                            style={{ padding: "12px 8px", textAlign: "center" }}
                          >
                            {box.itemsCount}
                          </td>
                          <td
                            style={{ padding: "12px 8px", textAlign: "center" }}
                          >
                            {box.totalQuantity}
                          </td>
                          <td
                            style={{ padding: "12px 8px", textAlign: "center" }}
                          >
                            <span
                              style={{
                                padding: "4px 8px",
                                borderRadius: "4px",
                                fontSize: "12px",
                                backgroundColor: status.color,
                              }}
                            >
                              {status.text}
                            </span>
                          </td>
                          <td
                            style={{ padding: "12px 8px", textAlign: "center" }}
                          >
                            <button
                              onClick={() => handleStartRename(box.name)}
                              disabled={loading || editingBox !== null}
                              style={{
                                padding: "6px 12px",
                                fontSize: "13px",
                                border: "1px solid #ccc",
                                borderRadius: "4px",
                                backgroundColor: "#fff",
                                cursor:
                                  loading || editingBox !== null
                                    ? "not-allowed"
                                    : "pointer",
                                marginRight: "8px",
                              }}
                              title="Rinomina"
                            >
                              ✏️
                            </button>
                            <button
                              onClick={() => handleDelete(box.name)}
                              disabled={loading || !box.canDelete}
                              style={{
                                padding: "6px 12px",
                                fontSize: "13px",
                                border: "1px solid #ccc",
                                borderRadius: "4px",
                                backgroundColor: box.canDelete
                                  ? "#fff"
                                  : "#f5f5f5",
                                cursor:
                                  loading || !box.canDelete
                                    ? "not-allowed"
                                    : "pointer",
                                opacity: box.canDelete ? 1 : 0.5,
                              }}
                              title={
                                box.canDelete
                                  ? "Cancella"
                                  : "Impossibile cancellare: scatolo non vuoto o referenziato"
                              }
                            >
                              🗑️
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {activeTab === "create" && (
            <form onSubmit={handleCreateBox}>
              <div style={{ marginBottom: "20px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "14px",
                    fontWeight: 600,
                    color: "#333",
                    marginBottom: "8px",
                  }}
                >
                  Nome Scatolo *
                </label>
                <input
                  type="text"
                  value={newBoxName}
                  onChange={(e) => setNewBoxName(e.target.value)}
                  onFocus={(e) => scrollFieldIntoView(e.target as HTMLElement)}
                  placeholder="es: SCATOLO 1"
                  disabled={loading}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    fontSize: "14px",
                    border: "1px solid #ccc",
                    borderRadius: "6px",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                style={{
                  padding: "10px 20px",
                  fontSize: "14px",
                  fontWeight: 600,
                  border: "none",
                  borderRadius: "6px",
                  backgroundColor: "#4caf50",
                  color: "#fff",
                  cursor: loading ? "not-allowed" : "pointer",
                  opacity: loading ? 0.6 : 1,
                }}
              >
                {loading ? "Creazione..." : "Crea Scatolo"}
              </button>
            </form>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "16px 24px",
            borderTop: "1px solid #e0e0e0",
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <button
            onClick={onClose}
            disabled={loading}
            style={{
              padding: "10px 20px",
              fontSize: "14px",
              fontWeight: 600,
              border: "1px solid #ccc",
              borderRadius: "6px",
              backgroundColor: "#fff",
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.6 : 1,
            }}
          >
            Chiudi
          </button>
        </div>
      </div>
    </div>
  );
}
