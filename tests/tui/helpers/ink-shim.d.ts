import type { ReactElement, ReactNode, ReactNodeArray } from 'react';

export interface TextProps {
  children?: ReactNode;
  color?: string;
  backgroundColor?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  dimColor?: boolean;
  inverse?: boolean;
  wrap?: 'wrap' | 'truncate' | 'truncate-start' | 'truncate-end' | 'truncate-middle';
}
export const Text: (props: TextProps) => ReactElement;

export interface BoxProps {
  children?: ReactNode;
  flexDirection?: 'row' | 'column' | 'row-reverse' | 'column-reverse';
  flexGrow?: number;
  flexShrink?: number;
  flexBasis?: number | string;
  alignItems?: string;
  justifyContent?: string;
  width?: number | string;
  height?: number | string;
  minWidth?: number | string;
  minHeight?: number | string;
  paddingX?: number;
  paddingY?: number;
  paddingLeft?: number;
  paddingRight?: number;
  paddingTop?: number;
  paddingBottom?: number;
  marginX?: number;
  marginY?: number;
  marginLeft?: number;
  marginRight?: number;
  marginTop?: number;
  marginBottom?: number;
  borderStyle?: string;
  borderColor?: string;
}
export const Box: (props: BoxProps) => ReactElement;

export const Spacer: () => ReactElement;
export const Newline: (props: { count?: number }) => ReactElement;
export const Static: (props: { items: ReactNodeArray; children: (item: unknown, index: number) => ReactNode }) => ReactElement;
export const Transform: (props: { transform: (text: string) => string; children?: ReactNode }) => ReactElement;

export const useInput: (handler: (input: string, key: { upArrow: boolean; downArrow: boolean; leftArrow: boolean; rightArrow: boolean; return: boolean; escape: boolean; ctrl: boolean; shift: boolean; tab: boolean; backspace: boolean; delete: boolean; meta: boolean }) => void, options?: { isActive?: boolean }) => void;

export const useApp: () => { exit: (error?: Error) => void };
export const useStdin: () => { isTTY: boolean; write: (data: string) => void; setEncoding: (encoding: string) => void; setRawMode: (mode: boolean) => void };
export const useStdout: () => { write: (data: string) => void };
export const useStderr: () => { write: (data: string) => void };

export const render: (tree: ReactElement, options?: { stdout?: unknown; stderr?: unknown; exitOnCtrlC?: boolean; patchConsole?: boolean; debug?: boolean }) => { rerender: (tree: ReactElement) => void; unmount: () => void; waitUntilExit: () => Promise<void>; cleanup: () => void };
