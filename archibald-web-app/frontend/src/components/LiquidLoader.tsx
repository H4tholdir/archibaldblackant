import './LiquidLoader.css';

interface LiquidLoaderProps {
  text?: string;
}

export function LiquidLoader({ text = 'Loading' }: LiquidLoaderProps) {
  return (
    <div className="liquid-loader">
      <div className="loading-text">
        {text}
        <span className="dot">.</span>
        <span className="dot">.</span>
        <span className="dot">.</span>
      </div>

      <div className="loader-track">
        <div className="liquid-fill"></div>
      </div>
    </div>
  );
}
