import type { ReactElement } from 'react';

export interface TextInputProps {
  value?: string;
  onChange?: (value: string) => void;
  onSubmit?: (value: string) => void;
  placeholder?: string;
  focus?: boolean;
  mask?: string;
  showCursor?: boolean;
  highlightPastedText?: boolean;
}

declare const TextInput: (props: TextInputProps) => ReactElement;
export default TextInput;
export { TextInput };
