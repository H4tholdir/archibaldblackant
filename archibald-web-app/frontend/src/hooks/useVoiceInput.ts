import { useState, useEffect, useCallback } from 'react';

interface VoiceInputOptions {
  lang?: string;
  continuous?: boolean;
  interimResults?: boolean;
  onResult?: (transcript: string) => void;
  onError?: (error: string) => void;
}

interface VoiceInputReturn {
  isListening: boolean;
  transcript: string;
  isSupported: boolean;
  startListening: () => void;
  stopListening: () => void;
  resetTranscript: () => void;
  error: string | null;
}

export function useVoiceInput(options: VoiceInputOptions = {}): VoiceInputReturn {
  const {
    lang = 'it-IT',
    continuous = true,
    interimResults = true,
    onResult,
    onError,
  } = options;

  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [recognition, setRecognition] = useState<SpeechRecognition | null>(null);

  // Check browser support
  const isSupported = typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  useEffect(() => {
    if (!isSupported) {
      setError('Il tuo browser non supporta il riconoscimento vocale. Usa Chrome, Safari iOS 14.5+ o Edge.');
      return;
    }

    // @ts-ignore - webkit prefix
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognitionInstance = new SpeechRecognition();

    recognitionInstance.lang = lang;
    recognitionInstance.continuous = continuous;
    recognitionInstance.interimResults = interimResults;

    recognitionInstance.onstart = () => {
      setIsListening(true);
      setError(null);
    };

    recognitionInstance.onresult = (event: SpeechRecognitionEvent) => {
      let finalTranscript = '';
      let interimTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcriptPart = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcriptPart + ' ';
        } else {
          interimTranscript += transcriptPart;
        }
      }

      const currentTranscript = (finalTranscript || interimTranscript).trim();
      setTranscript(currentTranscript);

      if (finalTranscript && onResult) {
        onResult(finalTranscript.trim());
      }
    };

    recognitionInstance.onerror = (event: SpeechRecognitionErrorEvent) => {
      let errorMessage = 'Errore nel riconoscimento vocale';

      switch (event.error) {
        case 'no-speech':
          errorMessage = 'Nessun audio rilevato. Riprova parlando più chiaramente.';
          break;
        case 'audio-capture':
          errorMessage = 'Microfono non disponibile. Controlla i permessi.';
          break;
        case 'not-allowed':
          errorMessage = 'Permesso microfono negato. Abilita nelle impostazioni del browser.';
          break;
        case 'network':
          errorMessage = 'Errore di rete. Controlla la connessione internet.';
          break;
        case 'aborted':
          errorMessage = 'Riconoscimento vocale interrotto.';
          break;
      }

      setError(errorMessage);
      setIsListening(false);

      if (onError) {
        onError(errorMessage);
      }
    };

    recognitionInstance.onend = () => {
      setIsListening(false);
    };

    setRecognition(recognitionInstance);

    return () => {
      if (recognitionInstance) {
        recognitionInstance.stop();
      }
    };
  }, [lang, continuous, interimResults, isSupported, onResult, onError]);

  const startListening = useCallback(() => {
    if (!recognition) {
      setError('Riconoscimento vocale non disponibile');
      return;
    }

    try {
      setError(null);
      setTranscript('');
      recognition.start();
    } catch (err) {
      if (err instanceof Error && err.message.includes('already started')) {
        recognition.stop();
        setTimeout(() => recognition.start(), 100);
      } else {
        setError('Impossibile avviare il riconoscimento vocale');
      }
    }
  }, [recognition]);

  const stopListening = useCallback(() => {
    if (recognition) {
      recognition.stop();
    }
  }, [recognition]);

  const resetTranscript = useCallback(() => {
    setTranscript('');
    setError(null);
  }, []);

  return {
    isListening,
    transcript,
    isSupported,
    startListening,
    stopListening,
    resetTranscript,
    error,
  };
}
