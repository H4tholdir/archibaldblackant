// src/scenes/comparison/KometCustomerComparison.tsx
import { Series, Audio, staticFile, interpolate } from 'remotion';
import { C } from '../../lib/comparison-timing';
import { TwoWorkflows } from './TwoWorkflows';
import { ComparisonIntro } from './ComparisonIntro';
import { ComparisonContext } from './ComparisonContext';
import { CustomerOrderSplitScreen } from './CustomerOrderSplitScreen';
import { ComparisonSummary } from './ComparisonSummary';
import { palette } from '../../lib/palette';

const { V2 } = C;

export function KometCustomerComparison() {
  return (
    <>
      <Audio
        src={staticFile('bgm-tutorial-alt-loop.mp3')}
        volume={(f) => {
          const voiceEnd = 2100; // voiceover ~70s
          const base = 0.18;
          const ducked = 0.09;
          const fadeIn = interpolate(f, [0, 60], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          const fadeOut = interpolate(f, [V2.TOTAL - 120, V2.TOTAL], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          const duck = interpolate(f, [0, 60, voiceEnd - 60, voiceEnd + 90], [ducked, ducked, ducked, base], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          return duck * fadeIn * fadeOut;
        }}
      />

      <Audio
        src={staticFile('komet-comparison/voiceover-2.mp3')}
        volume={(f) =>
          interpolate(f, [0, 15, V2.TOTAL - 30, V2.TOTAL], [0, 1, 1, 0], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          })
        }
      />

      <Series>
        <Series.Sequence durationInFrames={V2.WORKFLOWS_DUR}>
          <TwoWorkflows variant="customer-order" />
        </Series.Sequence>

        <Series.Sequence durationInFrames={V2.INTRO_DUR}>
          <ComparisonIntro
            title="New Customer + Order"
            subtitle="End-to-End Workflow — On-Site, From Any Device"
          />
        </Series.Sequence>

        <Series.Sequence durationInFrames={V2.CONTEXT_DUR}>
          <ComparisonContext
            lines={[
              { text: 'New client.' },
              { text: 'On-site meeting.' },
              { text: 'Create & order — right now.', color: palette.blue },
            ]}
            subtitle="From any device. During the meeting. Without going back to the desk."
          />
        </Series.Sequence>

        <Series.Sequence durationInFrames={V2.SPLIT_DUR}>
          <CustomerOrderSplitScreen />
        </Series.Sequence>

        <Series.Sequence durationInFrames={V2.SUMMARY_DUR}>
          <ComparisonSummary
            rows={[
              { label: 'IVA / VAT Lookup',     erpValue: 'Shows data — manual entry',      pwaValue: '✅ Auto-fills all fields' },
              { label: 'Default Settings',      erpValue: 'Manual cleanup every time',      pwaValue: '✅ Managed automatically' },
              { label: 'Required Fields',       erpValue: 'Inline errors — manual fix',     pwaValue: '✅ Wizard + trained patterns' },
              { label: 'Agent active',          erpValue: '4:09 at desk',                   pwaValue: '✅ 2:03 during meeting' },
              { label: 'Order continuity',      erpValue: 'Full restart — search again',    pwaValue: '✅ One tap from client card' },
              { label: 'Silent bugs',           erpValue: 'Discount didn\'t save — re-fix', pwaValue: '✅ Validated automatically' },
              { label: 'Order on ERP (total)',  erpValue: '4:09 all manual',                pwaValue: '✅ 2:48 incl. background sync' },
            ]}
            erpTime="4:09"
            pwaTime="2:48"
            fasterLabel="Not faster — more reliable."
            closingLine="No re-starts. No re-searches. No surprises. Just a smarter way to work."
          />
        </Series.Sequence>
      </Series>
    </>
  );
}
