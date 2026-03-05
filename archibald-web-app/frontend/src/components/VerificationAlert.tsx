import type { CSSProperties } from "react";
import type { VerificationNotification } from "../types/pending-order";

type VerificationAlertProps = {
  notification: VerificationNotification;
};

const SEVERITY_STYLES: Record<
  "warning" | "error",
  { bg: string; border: string; headerColor: string; icon: string }
> = {
  error: {
    bg: "#FEE2E2",
    border: "#EF4444",
    headerColor: "#991B1B",
    icon: "\u26A0",
  },
  warning: {
    bg: "#FEF3C7",
    border: "#F59E0B",
    headerColor: "#92400E",
    icon: "\u26A0",
  },
};

export function VerificationAlert({ notification }: VerificationAlertProps) {
  const style = SEVERITY_STYLES[notification.severity];

  const containerStyle: CSSProperties = {
    marginTop: "0.5rem",
    padding: "0.625rem 0.75rem",
    backgroundColor: style.bg,
    border: `1px solid ${style.border}`,
    borderRadius: "6px",
    fontSize: "0.85rem",
    lineHeight: "1.4",
  };

  const headerStyle: CSSProperties = {
    fontWeight: 600,
    color: style.headerColor,
    marginBottom: notification.items.length > 0 ? "0.375rem" : 0,
  };

  const listStyle: CSSProperties = {
    margin: 0,
    padding: "0 0 0 1rem",
    listStyleType: "disc",
  };

  const articleCodeStyle: CSSProperties = {
    fontWeight: 600,
    fontFamily: "monospace",
    fontSize: "0.8rem",
  };

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        {style.icon} {notification.summary}
      </div>
      {notification.items.length > 0 && (
        <ul style={listStyle}>
          {notification.items.map((item, index) => (
            <li key={index} style={{ marginBottom: "0.125rem" }}>
              <span style={articleCodeStyle}>{item.articleCode}</span>{" "}
              {item.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
