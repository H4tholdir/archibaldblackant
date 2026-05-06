// src/scenes/comparison/KometOrderComparison.tsx
import { Series, Audio, staticFile, interpolate } from 'remotion';
import { C } from '../../lib/comparison-timing';
import { TwoWorkflows } from './TwoWorkflows';
import { ComparisonIntro } from './ComparisonIntro';
import { ComparisonContext } from './ComparisonContext';
import { OrderSplitScreen } from './OrderSplitScreen';
import { ComparisonSummary } from './ComparisonSummary';
import { palette } from '../../lib/palette';

const { V1 } = C;

export function KometOrderComparison() {
  return (
    <>
      <Audio
        src={staticFile('bgm-tutorial-alt-loop.mp3')}
        volume={(f) => {
          const voiceEnd = 3450;
          const base = 0.18;      // udibile ma non invadente
          const ducked = 0.09;    // sotto la voce ma presente
          const fadeIn = interpolate(f, [0, 60], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          const fadeOut = interpolate(f, [C.V1.TOTAL - 120, C.V1.TOTAL], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          const duck = interpolate(f, [0, 60, voiceEnd - 60, voiceEnd + 90], [ducked, ducked, ducked, base], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          return duck * fadeIn * fadeOut;
        }}
      />

      <Audio
        src={staticFile('komet-comparison/voiceover-1.mp3')}
        volume={(f) =>
          interpolate(f, [0, 15, V1.TOTAL - 30, V1.TOTAL], [0, 1, 1, 0], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          })
        }
      />

      <Series>
        <Series.Sequence durationInFrames={V1.WORKFLOWS_DUR}>
          <TwoWorkflows variant="order" />
        </Series.Sequence>

        <Series.Sequence durationInFrames={V1.INTRO_DUR}>
          <ComparisonIntro
            title="Order Creation"
            subtitle="Archibald ERP  ·  Formicanera  ·  Speed & Intelligence"
          />
        </Series.Sequence>

        <Series.Sequence durationInFrames={V1.CONTEXT_DUR}>
          <ComparisonContext
            lines={[
              { text: 'Same order.' },
              { text: 'Same customer.' },
              { text: 'Two systems.', color: palette.blue },
            ]}
            subtitle="Let's measure the difference."
          />
        </Series.Sequence>

        <Series.Sequence durationInFrames={V1.SPLIT_DUR}>
          <OrderSplitScreen />
        </Series.Sequence>

        <Series.Sequence durationInFrames={V1.SUMMARY_DUR}>
          <ComparisonSummary
            rows={[
              { label: 'Customer Selection',   erpValue: '36 seconds',     pwaValue: '✅ 4 seconds (9× faster)' },
              { label: 'Article Search',       erpValue: '68 seconds',     pwaValue: '✅ 10 seconds (7× faster)' },
              { label: 'Packaging & Qty',      erpValue: 'Manual split',   pwaValue: '✅ Automatic' },
              { label: 'Discount & VAT',       erpValue: 'Pre-calculated', pwaValue: '✅ Real-time' },
              { label: 'Agent active time',    erpValue: '4:03',           pwaValue: '✅ 1:30 (2× faster)' },
              { label: 'Order on ERP (total)', erpValue: '4:03',           pwaValue: '✅ 3:06 (incl. background sync)' },
            ]}
            erpTime="4:03"
            pwaTime="3:06"
            fasterLabel="57 sec total · 2:33 agent saved"
            closingLine="The deal closed during the meeting. The rest happened automatically."
          />
        </Series.Sequence>
      </Series>
    </>
  );
}
