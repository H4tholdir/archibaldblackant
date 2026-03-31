// src/Video.tsx
import { Series, Audio, interpolate } from 'remotion';
import { staticFile } from 'remotion';
import { SCENE_FRAMES, TOTAL_FRAMES } from './lib/timing';

import { LogoIntro }      from './scenes/LogoIntro';
import { Problem }        from './scenes/Problem';
import { Solution }       from './scenes/Solution';
import { Orders }         from './scenes/Orders';
import { IvaAndTotals }   from './scenes/IvaAndTotals';
import { PendingOrders }  from './scenes/PendingOrders';
import { Storico }        from './scenes/Storico';
import { Clients }        from './scenes/Clients';
import { Warehouse }      from './scenes/Warehouse';
import { Quotes }         from './scenes/Quotes';
import { Dashboard }      from './scenes/Dashboard';
import { Documents }      from './scenes/Documents';
import { Integrations }   from './scenes/Integrations';
import { Notifications }  from './scenes/Notifications';
import { Closing }        from './scenes/Closing';

export function FormicaneraDemoVideo() {
  return (
    <>
      <Audio
        src={staticFile('background.mp3')}
        volume={(f) =>
          interpolate(
            f,
            [0, 30, TOTAL_FRAMES - 150, TOTAL_FRAMES],
            [0, 0.60, 0.60, 0],
            { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
          )
        }
        loop
      />
      <Series>
        <Series.Sequence durationInFrames={SCENE_FRAMES.logo}>          <LogoIntro />     </Series.Sequence>
        <Series.Sequence durationInFrames={SCENE_FRAMES.problem}>       <Problem />       </Series.Sequence>
        <Series.Sequence durationInFrames={SCENE_FRAMES.solution}>      <Solution />      </Series.Sequence>
        <Series.Sequence durationInFrames={SCENE_FRAMES.orders}>        <Orders />        </Series.Sequence>
        <Series.Sequence durationInFrames={SCENE_FRAMES.iva}>           <IvaAndTotals />  </Series.Sequence>
        <Series.Sequence durationInFrames={SCENE_FRAMES.pending}>       <PendingOrders /> </Series.Sequence>
        <Series.Sequence durationInFrames={SCENE_FRAMES.storico}>       <Storico />       </Series.Sequence>
        <Series.Sequence durationInFrames={SCENE_FRAMES.clients}>       <Clients />       </Series.Sequence>
        <Series.Sequence durationInFrames={SCENE_FRAMES.warehouse}>     <Warehouse />     </Series.Sequence>
        <Series.Sequence durationInFrames={SCENE_FRAMES.quotes}>        <Quotes />        </Series.Sequence>
        <Series.Sequence durationInFrames={SCENE_FRAMES.dashboard}>     <Dashboard />     </Series.Sequence>
        <Series.Sequence durationInFrames={SCENE_FRAMES.documents}>     <Documents />     </Series.Sequence>
        <Series.Sequence durationInFrames={SCENE_FRAMES.integrations}>  <Integrations />  </Series.Sequence>
        <Series.Sequence durationInFrames={SCENE_FRAMES.notifications}> <Notifications /> </Series.Sequence>
        <Series.Sequence durationInFrames={SCENE_FRAMES.closing}>       <Closing />       </Series.Sequence>
      </Series>
    </>
  );
}
