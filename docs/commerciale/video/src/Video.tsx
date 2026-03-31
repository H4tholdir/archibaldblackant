import { Series } from 'remotion';
import { SCENE_DURATION } from './lib/timing';
import { LogoIntro } from './scenes/LogoIntro';
import { Problem } from './scenes/Problem';
import { Solution } from './scenes/Solution';
import { Orders } from './scenes/Orders';
import { Dashboard } from './scenes/Dashboard';
import { Customers } from './scenes/Customers';
import { Bot } from './scenes/Bot';
import { Notifications } from './scenes/Notifications';
import { Closing } from './scenes/Closing';

export function FormicaneraDemoVideo() {
  return (
    <Series>
      <Series.Sequence durationInFrames={SCENE_DURATION.logoIntro}>
        <LogoIntro />
      </Series.Sequence>
      <Series.Sequence durationInFrames={SCENE_DURATION.problem}>
        <Problem />
      </Series.Sequence>
      <Series.Sequence durationInFrames={SCENE_DURATION.solution}>
        <Solution />
      </Series.Sequence>
      <Series.Sequence durationInFrames={SCENE_DURATION.orders}>
        <Orders />
      </Series.Sequence>
      <Series.Sequence durationInFrames={SCENE_DURATION.dashboard}>
        <Dashboard />
      </Series.Sequence>
      <Series.Sequence durationInFrames={SCENE_DURATION.customers}>
        <Customers />
      </Series.Sequence>
      <Series.Sequence durationInFrames={SCENE_DURATION.bot}>
        <Bot />
      </Series.Sequence>
      <Series.Sequence durationInFrames={SCENE_DURATION.notifications}>
        <Notifications />
      </Series.Sequence>
      <Series.Sequence durationInFrames={SCENE_DURATION.closing}>
        <Closing />
      </Series.Sequence>
    </Series>
  );
}
