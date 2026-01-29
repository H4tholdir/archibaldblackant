import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";

/**
 * Privacy Context for masking sensitive data in dashboard widgets
 * Persists privacy mode state between sessions using API
 */

type MaskType = "money" | "percent" | "number";

interface PrivacyContextType {
  privacyEnabled: boolean;
  togglePrivacy: () => Promise<void>;
  maskValue: (value: string | number, type: MaskType) => string;
  isLoading: boolean;
}

const PrivacyContext = createContext<PrivacyContextType | undefined>(undefined);

interface PrivacyProviderProps {
  children: ReactNode;
}

export function PrivacyProvider({ children }: PrivacyProviderProps) {
  const [privacyEnabled, setPrivacyEnabled] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Load privacy settings on mount
  useEffect(() => {
    const loadPrivacySettings = async () => {
      try {
        const token = localStorage.getItem("archibald_jwt");
        if (!token) {
          setIsLoading(false);
          return;
        }

        const response = await fetch("/api/users/me/privacy", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          setPrivacyEnabled(data.enabled || false);
        }
      } catch (error) {
        console.error("Error loading privacy settings:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadPrivacySettings();
  }, []);

  // Toggle privacy and persist to backend
  const togglePrivacy = async () => {
    const newValue = !privacyEnabled;

    // Optimistic update
    setPrivacyEnabled(newValue);

    try {
      const token = localStorage.getItem("archibald_jwt");
      if (!token) {
        console.error("No JWT token found");
        // Revert on error
        setPrivacyEnabled(!newValue);
        return;
      }

      const response = await fetch("/api/users/me/privacy", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ enabled: newValue }),
      });

      if (!response.ok) {
        throw new Error("Failed to update privacy settings");
      }

      const data = await response.json();
      // Ensure state matches server response
      setPrivacyEnabled(data.enabled);
    } catch (error) {
      console.error("Error updating privacy settings:", error);
      // Revert on error
      setPrivacyEnabled(!newValue);
    }
  };

  // Mask value based on type
  const maskValue = (value: string | number, type: MaskType): string => {
    if (!privacyEnabled) {
      // Return original value as string
      if (typeof value === "number") {
        if (type === "money") {
          return new Intl.NumberFormat("it-IT", {
            style: "currency",
            currency: "EUR",
          }).format(value);
        } else if (type === "percent") {
          return `${value}%`;
        }
        return value.toString();
      }
      return value;
    }

    // Return masked value
    switch (type) {
      case "money":
        return "€ ****";
      case "percent":
        return "**%";
      case "number":
        return "***";
      default:
        return "***";
    }
  };

  const contextValue: PrivacyContextType = {
    privacyEnabled,
    togglePrivacy,
    maskValue,
    isLoading,
  };

  return (
    <PrivacyContext.Provider value={contextValue}>
      {children}
    </PrivacyContext.Provider>
  );
}

// Custom hook to use privacy context
export function usePrivacy(): PrivacyContextType {
  const context = useContext(PrivacyContext);
  if (context === undefined) {
    throw new Error("usePrivacy must be used within a PrivacyProvider");
  }
  return context;
}
