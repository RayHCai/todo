import { useRef, useState } from "react";

/**
 * A text field that replaces a label while editing. Enter or leaving the field saves;
 * Escape cancels.
 */
export function InlineEdit({
  value,
  label,
  maxLength,
  placeholder,
  className,
  onDone,
  onCancel,
}: {
  value: string;
  label: string;
  maxLength: number;
  placeholder?: string;
  className?: string;
  onDone: (text: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(value);
  const cancelled = useRef(false);
  return (
    <input
      className={className}
      value={text}
      maxLength={maxLength}
      placeholder={placeholder}
      aria-label={label}
      autoComplete="off"
      autoFocus
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.nativeEvent.isComposing) {
          e.preventDefault();
          e.currentTarget.blur();
        } else if (e.key === "Escape") {
          e.preventDefault();
          cancelled.current = true;
          onCancel();
        }
      }}
      onBlur={() => {
        if (!cancelled.current) onDone(text);
      }}
    />
  );
}
