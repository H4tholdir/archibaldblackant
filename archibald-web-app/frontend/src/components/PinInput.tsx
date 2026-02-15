import { useRef, KeyboardEvent } from "react";
import { useKeyboardScroll } from "../hooks/useKeyboardScroll";

interface PinInputProps {
  length?: number;
  value: string;
  onChange: (pin: string) => void;
  autoFocus?: boolean;
}

export function PinInput({
  length = 6,
  value,
  onChange,
  autoFocus = false,
}: PinInputProps) {
  const { scrollFieldIntoView } = useKeyboardScroll();
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const handleChange = (index: number, digit: string) => {
    // Only allow digits
    if (!/^\d*$/.test(digit)) return;

    // Update value at index
    const newValue = value.split("");
    newValue[index] = digit;
    const newPin = newValue.join("");

    onChange(newPin.slice(0, length));

    // Auto-focus next input
    if (digit && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !value[index] && index > 0) {
      // Focus previous input on backspace if current is empty
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData("text").replace(/\D/g, "");
    onChange(pastedText.slice(0, length));
  };

  return (
    <div className="pin-input" onPaste={handlePaste}>
      {Array.from({ length }).map((_, index) => (
        <input
          key={index}
          ref={(el) => {
            inputRefs.current[index] = el;
          }}
          type="tel"
          inputMode="numeric"
          pattern="\d"
          maxLength={1}
          value={value[index] || ""}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onFocus={(e) => scrollFieldIntoView(e.target as HTMLElement)}
          autoFocus={autoFocus && index === 0}
          className="pin-digit"
        />
      ))}
    </div>
  );
}
