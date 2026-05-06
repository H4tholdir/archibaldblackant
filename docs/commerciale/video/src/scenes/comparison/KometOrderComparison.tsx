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
        src={staticFile('background.mp3')}
        volume={(f) =>
          interpolate(f, [0, 30, V1.TOTAL - 90, V1.TOTAL], [0, 0.35, 0.35, 0], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          })
        }
      />

      {/* Voiceover: aggiunto in Task 17 */}

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
              { label: 'Customer Selection', erpValue: '⚠️ Manual', pwaValue: '✅ Auto-filtered' },
              { label: 'Article Search',     erpValue: '⚠️ Inconsistent', pwaValue: '✅ Unified' },
              { label: 'Packaging',          erpValue: '⚠️ Manual calc', pwaValue: '✅ Auto-split' },
              { label: 'Discount & VAT',     erpValue: '⚠️ Pre-calculated', pwaValue: '✅ Real-time' },
            ]}
            erpTime="4:22"
            pwaTime="3:15"
            fasterLabel="67 seconds faster"
            closingLine="Same result. More intelligence. From any device."
          />
        </Series.Sequence>
      </Series>
    </>
  );
}
