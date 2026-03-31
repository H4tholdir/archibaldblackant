import './font';
import type { FC } from 'react';
import { Composition, registerRoot } from 'remotion';
import { FormicaneraDemoVideo } from './Video';
import { TOTAL_FRAMES, FPS, WIDTH, HEIGHT } from './lib/timing';

export const RemotionRoot: FC = () => {
  return (
    <Composition
      id="FormicaneraDemoVideo"
      component={FormicaneraDemoVideo}
      durationInFrames={TOTAL_FRAMES}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
    />
  );
};

registerRoot(RemotionRoot);
