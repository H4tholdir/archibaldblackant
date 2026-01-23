import { useState, useEffect } from 'react';
import { productService } from '../../services/products.service';
import type { PackagingResult } from '../../services/products.service';

interface QuantityInputProps {
  productId: string;
  value: number;
  onChange: (quantity: number, isValid: boolean, packaging?: PackagingResult) => void;
  disabled?: boolean;
}

export function QuantityInput({
  productId,
  value,
  onChange,
  disabled = false,
}: QuantityInputProps) {
  const [inputValue, setInputValue] = useState(value.toString());
  const [packaging, setPackaging] = useState<PackagingResult | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);

  useEffect(() => {
    setInputValue(value.toString());
  }, [value]);

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value;
    setInputValue(rawValue);

    const numValue = parseInt(rawValue, 10);

    if (isNaN(numValue) || numValue <= 0) {
      setPackaging({
        success: false,
        error: 'Quantità non valida',
        suggestedQuantity: 1,
      });
      onChange(0, false);
      return;
    }

    // Calculate optimal packaging
    setIsCalculating(true);
    try {
      const result = await productService.calculateOptimalPackaging(
        productId,
        numValue
      );
      setPackaging(result);

      if (!result.success && result.suggestedQuantity) {
        // Auto-set to suggested minimum quantity
        setInputValue(result.suggestedQuantity.toString());
        onChange(result.suggestedQuantity, false, result);
      } else {
        onChange(numValue, result.success, result);
      }
    } catch (error) {
      console.error('[QuantityInput] Packaging calculation failed:', error);
      setPackaging({
        success: false,
        error: 'Errore durante il calcolo del confezionamento',
        suggestedQuantity: numValue,
      });
      onChange(numValue, false);
    } finally {
      setIsCalculating(false);
    }
  };

  const formatPackagingBreakdown = (result: PackagingResult): string => {
    if (!result.success || !result.breakdown) return '';

    const parts = result.breakdown.map((item) => {
      const confText = item.packageCount === 1 ? 'confezione' : 'confezioni';
      const pzText = item.packageSize === 1 ? 'pezzo' : 'pezzi';
      return `${item.packageCount} ${confText} da ${item.packageSize} ${pzText}`;
    });

    return parts.join(' + ');
  };

  return (
    <div style={{ width: '100%' }}>
      <div style={{ marginBottom: '0.5rem' }}>
        <label
          htmlFor={`quantity-${productId}`}
          style={{
            display: 'block',
            marginBottom: '0.25rem',
            fontWeight: '500',
            fontSize: '0.875rem',
          }}
        >
          Quantità
        </label>
        <input
          id={`quantity-${productId}`}
          type="number"
          value={inputValue}
          onChange={handleChange}
          disabled={disabled || isCalculating}
          min={1}
          aria-label="Quantità"
          aria-invalid={packaging?.success === false}
          aria-describedby={
            packaging?.error ? `quantity-error-${productId}` : undefined
          }
          style={{
            width: '100%',
            padding: '0.5rem',
            fontSize: '1rem',
            border: packaging?.success === false ? '1px solid #dc2626' : '1px solid #ccc',
            borderRadius: '4px',
            outline: 'none',
          }}
        />
      </div>

      {/* Calculating Indicator */}
      {isCalculating && (
        <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>
          Calcolo confezionamento...
        </div>
      )}

      {/* Packaging Success - Show Breakdown */}
      {packaging?.success && packaging.breakdown && (
        <div
          style={{
            padding: '0.5rem',
            backgroundColor: '#f0fdf4',
            border: '1px solid #22c55e',
            borderRadius: '4px',
            fontSize: '0.875rem',
            color: '#15803d',
            marginBottom: '0.5rem',
          }}
        >
          <div style={{ fontWeight: '500', marginBottom: '0.25rem' }}>
            ✅ {packaging.quantity} pezzi in {packaging.totalPackages}{' '}
            {packaging.totalPackages === 1 ? 'confezione' : 'confezioni'}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#16a34a' }}>
            {formatPackagingBreakdown(packaging)}
          </div>
        </div>
      )}

      {/* Packaging Error */}
      {packaging?.error && (
        <div
          id={`quantity-error-${productId}`}
          role="alert"
          style={{
            padding: '0.5rem',
            backgroundColor: '#fee2e2',
            border: '1px solid #dc2626',
            borderRadius: '4px',
            fontSize: '0.875rem',
            color: '#991b1b',
          }}
        >
          {packaging.error}
        </div>
      )}
    </div>
  );
}
