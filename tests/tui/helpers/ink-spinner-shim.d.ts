import type { ReactElement } from 'react';

export type SpinnerType =
  | 'dots'
  | 'dots2'
  | 'dots3'
  | 'dots4'
  | 'dots5'
  | 'dots6'
  | 'dots7'
  | 'dots8'
  | 'dots9'
  | 'dots10'
  | 'dots11'
  | 'dots12'
  | 'dots13'
  | 'dots14'
  | 'line'
  | 'arc'
  | 'circle'
  | 'square'
  | 'arrow'
  | 'triangle'
  | 'dots_bouncing'
  | 'bouncingBar'
  | 'bouncingBall';

export interface SpinnerProps {
  type?: SpinnerType;
}

declare const Spinner: (props?: SpinnerProps) => ReactElement;
export default Spinner;
export { Spinner };
