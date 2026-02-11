import { describe, expect, test } from "vitest";
import { render } from "@testing-library/react";
import { HighlightText } from "./HighlightText";

describe("HighlightText", () => {
  test("returns text unchanged when query is empty", () => {
    const { container } = render(<HighlightText text="hello world" query="" />);
    expect(container.textContent).toBe("hello world");
    expect(container.querySelectorAll("mark")).toHaveLength(0);
  });

  test("returns text unchanged when text is empty", () => {
    const { container } = render(<HighlightText text="" query="hello" />);
    expect(container.textContent).toBe("");
    expect(container.querySelectorAll("mark")).toHaveLength(0);
  });

  test("wraps matching substring in mark element", () => {
    const { container } = render(
      <HighlightText text="hello world" query="world" />,
    );
    const marks = container.querySelectorAll("mark");
    expect(marks).toHaveLength(1);
    expect(marks[0].textContent).toBe("world");
    expect(marks[0].hasAttribute("data-search-match")).toBe(true);
  });

  test("highlights case-insensitively", () => {
    const { container } = render(
      <HighlightText text="Hello World" query="hello" />,
    );
    const marks = container.querySelectorAll("mark");
    expect(marks).toHaveLength(1);
    expect(marks[0].textContent).toBe("Hello");
  });

  test("highlights multiple occurrences", () => {
    const { container } = render(
      <HighlightText text="foo bar foo baz foo" query="foo" />,
    );
    const marks = container.querySelectorAll("mark");
    expect(marks).toHaveLength(3);
    marks.forEach((mark) => expect(mark.textContent).toBe("foo"));
  });

  test("escapes regex special characters in query", () => {
    const { container } = render(
      <HighlightText text="price is 1.204,50" query="1.204" />,
    );
    const marks = container.querySelectorAll("mark");
    expect(marks).toHaveLength(1);
    expect(marks[0].textContent).toBe("1.204");
  });

  test("preserves surrounding text", () => {
    const { container } = render(
      <HighlightText text="abc def ghi" query="def" />,
    );
    expect(container.textContent).toBe("abc def ghi");
  });

  test("handles query not found in text", () => {
    const { container } = render(
      <HighlightText text="hello world" query="xyz" />,
    );
    expect(container.textContent).toBe("hello world");
    expect(container.querySelectorAll("mark")).toHaveLength(0);
  });
});
