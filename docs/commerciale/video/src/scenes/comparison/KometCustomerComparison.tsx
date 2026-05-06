// src/scenes/comparison/KometCustomerComparison.tsx
import { Series, Audio, staticFile, interpolate } from 'remotion';
import { C } from '../../lib/comparison-timing';
import { TwoWorkflows } from './TwoWorkflows';
import { ComparisonIntro } from './ComparisonIntro';
import { ComparisonContext } from './ComparisonContext';
import { CustomerSplitScreen } from './CustomerSplitScreen';
import { OrderContinuationSplitScreen } from './OrderContinuationSplitScreen';
import { ComparisonSummary } from './ComparisonSummary';
import { palette } from '../../lib/palette';

const { V2 } = C;

export function KometCustomerComparison() {
  return (
    <>
      <Audio
        src={staticFile('background.mp3')}
        volume={(f) =>
          interpolate(f, [0, 30, V2.TOTAL - 90, V2.TOTAL], [0, 0.35, 0.35, 0], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          })
        }
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
              { text: 'New client. On-site meeting.' },
              { text: 'Create the customer.' },
              { text: 'Place the order. Right now.', color: palette.blue },
            ]}
            subtitle="From any device. During the meeting."
          />
        </Series.Sequence>

        <Series.Sequence durationInFrames={V2.CUST_SPLIT_DUR}>
          <CustomerSplitScreen />
        </Series.Sequence>

        <Series.Sequence durationInFrames={V2.ORD_SPLIT_DUR}>
          <OrderContinuationSplitScreen />
        </Series.Sequence>

        <Series.Sequence durationInFrames={V2.SUMMARY_DUR}>
          <ComparisonSummary
            rows={[
              { label: 'Customer Creation', erpValue: '2:58', pwaValue: '✅ 2:02' },
              { label: 'Order Placement',   erpValue: '1:32', pwaValue: '✅ 1:05' },
              { label: 'Total',             erpValue: '4:30', pwaValue: '✅ 3:07' },
            ]}
            erpTime="4:30"
            pwaTime="3:07"
            fasterLabel="83 seconds faster"
            closingLine="From any device. During the meeting."
          />
        </Series.Sequence>
      </Series>
    </>
  );
}
