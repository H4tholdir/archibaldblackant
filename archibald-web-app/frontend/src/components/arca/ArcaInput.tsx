import type { CSSProperties } from "react";
import {
  arcaSunkenInput,
  arcaReadOnlyInput,
  arcaHighlightInput,
  arcaLabel,
} from "./arcaStyles";

type ArcaInputProps = {
  label?: string;
  value: string | number;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  highlight?: boolean;
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
  width = "100%",
  labelWidth,
  style,
  type = "text",
  align = "left",
}: ArcaInputProps) {
  const inputStyle: CSSProperties = {
    ...(highlight
      ? arcaHighlightInput
      : readOnly
        ? arcaReadOnlyInput
        : arcaSunkenInput),
    width,
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

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "4px",
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
