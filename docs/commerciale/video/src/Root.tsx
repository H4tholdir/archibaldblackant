// src/Root.tsx
import './font';
import type { FC } from 'react';
import { Composition, registerRoot } from 'remotion';
import { FormicaneraDemoVideo } from './Video';
import { TOTAL_FRAMES, FPS, WIDTH, HEIGHT } from './lib/timing';
import { KometOrderComparison } from './scenes/comparison/KometOrderComparison';
import { KometCustomerComparison } from './scenes/comparison/KometCustomerComparison';
import { C } from './lib/comparison-timing';

export const RemotionRoot: FC = () => {
  return (
    <>
      <Composition
        id="FormicaneraDemoVideo"
        component={FormicaneraDemoVideo}
        durationInFrames={TOTAL_FRAMES}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />
      <Composition
        id="KometOrderComparison"
        component={KometOrderComparison}
        durationInFrames={C.V1.TOTAL}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="KometCustomerComparison"
        component={KometCustomerComparison}
        durationInFrames={C.V2.TOTAL}
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};

registerRoot(RemotionRoot);
