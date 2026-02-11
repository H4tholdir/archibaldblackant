function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const highlightStyle: React.CSSProperties = {
  backgroundColor: "#fef08a",
  borderRadius: "2px",
  padding: "0 1px",
};

export function HighlightText({
  text,
  query,
}: {
  text: string;
  query: string;
}) {
  if (!query || !text) return <>{text}</>;

  const regex = new RegExp(`(${escapeRegex(query)})`, "gi");
  const parts = text.split(regex);

  return (
    <>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark key={i} data-search-match style={highlightStyle}>
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  );
}
