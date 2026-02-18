import type { CSSProperties, Ref, KeyboardEvent } from "react";
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
  labelStyle?: CSSProperties;
  type?: "text" | "number";
  align?: "left" | "right" | "center";
  inputRef?: Ref<HTMLInputElement>;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
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
  labelStyle: labelStyleOverride,
  type = "text",
  align = "left",
  inputRef,
  onKeyDown,
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
    height: "16px",
    lineHeight: "14px",
    textAlign: align,
    ...style,
  };

  if (!label) {
    return (
      <input
        ref={inputRef}
        type={type}
        value={value}
        readOnly={readOnly}
        onChange={readOnly ? undefined : (e) => onChange?.(e.target.value)}
        onKeyDown={onKeyDown}
        style={inputStyle}
      />
    );
  }

  if (labelAbove) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
        <span style={{ ...arcaLabel, fontSize: "10px", padding: "0 1px", ...labelStyleOverride }}>
          {label}
        </span>
        <input
          ref={inputRef}
          type={type}
          value={value}
          readOnly={readOnly}
          onChange={readOnly ? undefined : (e) => onChange?.(e.target.value)}
          onKeyDown={onKeyDown}
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
        gap: "1px",
      }}
    >
      <span
        style={{
          ...arcaLabel,
          width: labelWidth,
          flexShrink: 0,
          ...labelStyleOverride,
        }}
      >
        {label}
      </span>
      <input
        ref={inputRef}
        type={type}
        value={value}
        readOnly={readOnly}
        onChange={readOnly ? undefined : (e) => onChange?.(e.target.value)}
        onKeyDown={onKeyDown}
        style={inputStyle}
      />
    </div>
  );
}
