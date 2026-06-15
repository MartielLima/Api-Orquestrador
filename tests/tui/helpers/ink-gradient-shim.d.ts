import type { ReactElement, ReactNode } from 'react';

export type GradientName =
  | 'cristal'
  | 'teen'
  | 'mind'
  | 'morning'
  | 'vice'
  | 'passion'
  | 'fruit'
  | 'instagram'
  | 'atlas'
  | 'retro'
  | 'summer'
  | 'pastel'
  | 'rainbow';

export interface GradientProps {
  name?: GradientName;
  colors?: string[];
  children?: ReactNode;
}

declare const Gradient: (props: GradientProps) => ReactElement;
export default Gradient;
export { Gradient };
