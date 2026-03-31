import { loadFont } from '@remotion/google-fonts/Inter';

export const { fontFamily, waitUntilDone } = loadFont('normal', {
  weights: ['300', '400', '500', '600', '700', '800', '900'],
  subsets: ['latin'],
});
