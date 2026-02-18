import type { CSSProperties } from "react";
import {
  arcaSunkenInput,
  arcaReadOnlyInput,
  arcaHighlightInput,
  arcaReadOnlySpecialInput,
  arcaLabel,
} from "./arcaStyles";

type ArcaInputProps = {
  label?: string;
  value: string | number;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  highlight?: boolean;
  specialReadOnly?: boolean;
  labelAbove?: boolean;
  width?: string | number;
  labelWidth?: string | number;
  style?: CSSProperties;
  type?: "text" | "number";
  align?: "left" | "right" | "center";
};

export function ArcaInput({
  label,
  value,
  onChange,
  readOnly = true,
  highlight = false,
  specialReadOnly = false,
  labelAbove = false,
  width = "100%",
  labelWidth,
  style,
  type = "text",
  align = "left",
}: ArcaInputProps) {
  const baseStyle = specialReadOnly
    ? arcaReadOnlySpecialInput
    : highlight
      ? arcaHighlightInput
      : readOnly
        ? arcaReadOnlyInput
        : arcaSunkenInput;

  const inputStyle: CSSProperties = {
    ...baseStyle,
    width,
    height: "21px",
    textAlign: align,
    ...style,
  };

  if (!label) {
    return (
      <input
        type={type}
        value={value}
        readOnly={readOnly}
        onChange={readOnly ? undefined : (e) => onChange?.(e.target.value)}
        style={inputStyle}
      />
    );
  }

  if (labelAbove) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
        <span style={{ ...arcaLabel, fontSize: "10px", padding: "0 1px" }}>
          {label}
        </span>
        <input
          type={type}
          value={value}
          readOnly={readOnly}
          onChange={readOnly ? undefined : (e) => onChange?.(e.target.value)}
          style={inputStyle}
        />
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "2px",
      }}
    >
      <span
        style={{
          ...arcaLabel,
          width: labelWidth,
          flexShrink: 0,
        }}
      >
        {label}
      </span>
      <input
        type={type}
        value={value}
        readOnly={readOnly}
        onChange={readOnly ? undefined : (e) => onChange?.(e.target.value)}
        style={inputStyle}
      />
    </div>
  );
}
