import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { useVoiceInput } from "./useVoiceInput";

describe("useVoiceInput", () => {
  // Mock SpeechRecognition API
  let mockRecognition: any;
  let mockRecognitionConstructor: any;

  beforeEach(() => {
    // Create mock recognition instance
    mockRecognition = {
      lang: "",
      continuous: false,
      interimResults: false,
      start: vi.fn(),
      stop: vi.fn(),
      onstart: null as any,
      onresult: null as any,
      onerror: null as any,
      onend: null as any,
    };

    // Mock constructor as a class
    mockRecognitionConstructor = vi.fn(function (this: any) {
      return mockRecognition;
    });

    // Inject into window (which exists in happy-dom environment)
    if (typeof window !== "undefined") {
      (window as any).SpeechRecognition = mockRecognitionConstructor;
      (window as any).webkitSpeechRecognition = mockRecognitionConstructor;
    }
  });

  afterEach(() => {
    vi.clearAllMocks();
    if (typeof window !== "undefined") {
      delete (window as any).SpeechRecognition;
      delete (window as any).webkitSpeechRecognition;
    }
  });

  describe("infinite loop regression tests", () => {
    test("initializes SpeechRecognition once despite callback changes", async () => {
      let onResultCallCount = 0;
      const onResult1 = vi.fn(() => {
        onResultCallCount++;
      });
      const onResult2 = vi.fn(() => {
        onResultCallCount++;
      });

      // Render hook with initial callback
      const { rerender } = renderHook(
        ({ onResult }) => useVoiceInput({ onResult }),
        {
          initialProps: { onResult: onResult1 },
        },
      );

      // Wait for effect to complete
      await waitFor(() => {
        expect(mockRecognitionConstructor).toHaveBeenCalledTimes(1);
      });

      // Re-render with different callback reference (simulating parent re-render)
      rerender({ onResult: onResult2 });

      // Wait a bit to ensure no additional constructor calls
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Assert: SpeechRecognition constructor called only once
      expect(mockRecognitionConstructor).toHaveBeenCalledTimes(1);
    });

    test("callbacks remain functional after parent re-render", async () => {
      const onResult1 = vi.fn();
      const onResult2 = vi.fn();

      // Render hook with initial callback
      const { rerender } = renderHook(
        ({ onResult }) => useVoiceInput({ onResult }),
        {
          initialProps: { onResult: onResult1 },
        },
      );

      await waitFor(() => {
        expect(mockRecognition.onresult).toBeDefined();
      });

      // Re-render with new callback
      rerender({ onResult: onResult2 });

      // Wait for callback ref to update
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Trigger recognition result
      const mockEvent = {
        resultIndex: 0,
        results: [
          {
            0: { transcript: "test transcript" },
            isFinal: true,
          },
        ],
      } as any;

      act(() => {
        mockRecognition.onresult(mockEvent);
      });

      // Assert: New callback is called (not stale closure)
      expect(onResult2).toHaveBeenCalledWith("test transcript");
      expect(onResult1).not.toHaveBeenCalled();
    });

    test("startListening works after multiple parent re-renders", async () => {
      let renderCount = 0;
      const onResult = vi.fn(() => {
        renderCount++;
      });

      const { result, rerender } = renderHook(() =>
        useVoiceInput({ onResult }),
      );

      await waitFor(() => {
        expect(result.current.isSupported).toBe(true);
      });

      // Re-render multiple times (simulating typical React app behavior)
      for (let i = 0; i < 5; i++) {
        rerender();
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      // Assert: No infinite loop, recognition starts successfully
      expect(mockRecognitionConstructor).toHaveBeenCalledTimes(1);

      // Start listening
      act(() => {
        result.current.startListening();
      });

      expect(mockRecognition.start).toHaveBeenCalledTimes(1);
    });

    test("onError callback updates without recreating recognition", async () => {
      const onError1 = vi.fn();
      const onError2 = vi.fn();

      const { rerender } = renderHook(
        ({ onError }) => useVoiceInput({ onError }),
        {
          initialProps: { onError: onError1 },
        },
      );

      await waitFor(() => {
        expect(mockRecognition.onerror).toBeDefined();
      });

      // Re-render with new error callback
      rerender({ onError: onError2 });

      // Wait for callback ref to update
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Trigger error
      const mockErrorEvent = {
        error: "no-speech",
      } as any;

      act(() => {
        mockRecognition.onerror(mockErrorEvent);
      });

      // Assert: New error callback is called
      expect(onError2).toHaveBeenCalled();
      expect(onError1).not.toHaveBeenCalled();

      // Assert: Recognition constructor still called only once
      expect(mockRecognitionConstructor).toHaveBeenCalledTimes(1);
    });
  });

  describe("basic functionality", () => {
    test("initializes with correct default values", () => {
      const { result } = renderHook(() => useVoiceInput());

      expect(result.current.isListening).toBe(false);
      expect(result.current.transcript).toBe("");
      expect(result.current.error).toBe(null);
      expect(result.current.isSupported).toBe(true);
    });

    test("configures recognition with provided options", async () => {
      renderHook(() =>
        useVoiceInput({
          lang: "en-US",
          continuous: false,
          interimResults: false,
        }),
      );

      await waitFor(() => {
        expect(mockRecognition.lang).toBe("en-US");
        expect(mockRecognition.continuous).toBe(false);
        expect(mockRecognition.interimResults).toBe(false);
      });
    });

    test("startListening calls recognition.start()", async () => {
      const { result } = renderHook(() => useVoiceInput());

      await waitFor(() => {
        expect(result.current.isSupported).toBe(true);
      });

      act(() => {
        result.current.startListening();
      });

      expect(mockRecognition.start).toHaveBeenCalledTimes(1);
    });

    test("stopListening calls recognition.stop()", async () => {
      const { result } = renderHook(() => useVoiceInput());

      await waitFor(() => {
        expect(result.current.isSupported).toBe(true);
      });

      act(() => {
        result.current.stopListening();
      });

      expect(mockRecognition.stop).toHaveBeenCalledTimes(1);
    });

    test("updates transcript on recognition result", async () => {
      const { result } = renderHook(() => useVoiceInput());

      await waitFor(() => {
        expect(mockRecognition.onresult).toBeDefined();
      });

      const mockEvent = {
        resultIndex: 0,
        results: [
          {
            0: { transcript: "hello world" },
            isFinal: true,
          },
        ],
      } as any;

      act(() => {
        mockRecognition.onresult(mockEvent);
      });

      expect(result.current.transcript).toBe("hello world");
    });

    test("updates isListening state on recognition start/end", async () => {
      const { result } = renderHook(() => useVoiceInput());

      await waitFor(() => {
        expect(mockRecognition.onstart).toBeDefined();
      });

      // Trigger onstart
      act(() => {
        mockRecognition.onstart();
      });

      expect(result.current.isListening).toBe(true);

      // Trigger onend
      act(() => {
        mockRecognition.onend();
      });

      expect(result.current.isListening).toBe(false);
    });

    test("handles recognition errors correctly", async () => {
      const { result } = renderHook(() => useVoiceInput());

      await waitFor(() => {
        expect(mockRecognition.onerror).toBeDefined();
      });

      const mockErrorEvent = {
        error: "not-allowed",
      } as any;

      act(() => {
        mockRecognition.onerror(mockErrorEvent);
      });

      expect(result.current.error).toContain("Permesso microfono negato");
      expect(result.current.isListening).toBe(false);
    });

    test("resets transcript when resetTranscript is called", async () => {
      const { result } = renderHook(() => useVoiceInput());

      await waitFor(() => {
        expect(mockRecognition.onresult).toBeDefined();
      });

      // Set transcript
      const mockEvent = {
        resultIndex: 0,
        results: [
          {
            0: { transcript: "test" },
            isFinal: true,
          },
        ],
      } as any;

      act(() => {
        mockRecognition.onresult(mockEvent);
      });

      expect(result.current.transcript).toBe("test");

      // Reset
      act(() => {
        result.current.resetTranscript();
      });

      expect(result.current.transcript).toBe("");
      expect(result.current.error).toBe(null);
    });
  });

  describe("cleanup", () => {
    test("stops recognition on unmount", async () => {
      const { unmount } = renderHook(() => useVoiceInput());

      await waitFor(() => {
        expect(mockRecognition.stop).toBeDefined();
      });

      unmount();

      expect(mockRecognition.stop).toHaveBeenCalledTimes(1);
    });
  });
});
