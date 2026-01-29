import { useState, useEffect } from "react";

interface HamburgerMenuProps {
  isOpen: boolean;
  onToggle: () => void;
}

export function HamburgerMenu({ isOpen, onToggle }: HamburgerMenuProps) {
  // Close menu when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (
        !target.closest(".hamburger-menu") &&
        !target.closest(".hamburger-button")
      ) {
        onToggle();
      }
    };

    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [isOpen, onToggle]);

  return (
    <button
      className="hamburger-button"
      onClick={onToggle}
      aria-label="Menu"
      style={{
        background: "transparent",
        border: "none",
        cursor: "pointer",
        padding: "8px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        zIndex: 1001,
      }}
    >
      {/* Icona formica nera SVG */}
      <svg
        width="32"
        height="32"
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{
          transition: "transform 0.3s ease",
          transform: isOpen ? "rotate(90deg)" : "rotate(0deg)",
        }}
      >
        {/* Corpo formica stilizzata */}
        <circle cx="16" cy="10" r="3" fill="#1a1a1a" />
        <ellipse cx="16" cy="16" rx="4" ry="5" fill="#1a1a1a" />
        <ellipse cx="16" cy="24" rx="3.5" ry="4" fill="#1a1a1a" />
        {/* Zampe */}
        <line
          x1="12"
          y1="16"
          x2="8"
          y2="14"
          stroke="#1a1a1a"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <line
          x1="20"
          y1="16"
          x2="24"
          y2="14"
          stroke="#1a1a1a"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <line
          x1="12"
          y1="18"
          x2="8"
          y2="20"
          stroke="#1a1a1a"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <line
          x1="20"
          y1="18"
          x2="24"
          y2="20"
          stroke="#1a1a1a"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        {/* Antenne */}
        <line
          x1="14"
          y1="8"
          x2="12"
          y2="5"
          stroke="#1a1a1a"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <line
          x1="18"
          y1="8"
          x2="20"
          y2="5"
          stroke="#1a1a1a"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}
