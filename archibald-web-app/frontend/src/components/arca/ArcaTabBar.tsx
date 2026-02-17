import { arcaTab, arcaPanel, ARCA_COLORS } from "./arcaStyles";

type ArcaTabBarProps = {
  tabs: string[];
  activeTab: number;
  onTabChange: (index: number) => void;
  children: React.ReactNode;
};

export function ArcaTabBar({
  tabs,
  activeTab,
  onTabChange,
  children,
}: ArcaTabBarProps) {
  return (
    <div>
      <div
        style={{
          display: "flex",
          borderBottom: `1px solid ${ARCA_COLORS.tabBorder}`,
          paddingLeft: "4px",
        }}
      >
        {tabs.map((tab, i) => (
          <button
            key={tab}
            onClick={() => onTabChange(i)}
            style={arcaTab(i === activeTab)}
          >
            {tab}
          </button>
        ))}
      </div>
      <div style={arcaPanel}>{children}</div>
    </div>
  );
}
