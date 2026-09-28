'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import {
  Bold,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  RemoveFormatting,
  Underline,
} from 'lucide-react';

const TOOLS = [
  { command: 'bold', label: 'Bold (Ctrl+B)', Icon: Bold },
  { command: 'italic', label: 'Italic (Ctrl+I)', Icon: Italic },
  { command: 'underline', label: 'Underline (Ctrl+U)', Icon: Underline },
  { command: 'insertUnorderedList', label: 'Bulleted list', Icon: List },
  { command: 'insertOrderedList', label: 'Numbered list', Icon: ListOrdered },
  { command: 'createLink', label: 'Insert link', Icon: LinkIcon },
  {
    command: 'removeFormat',
    label: 'Clear formatting',
    Icon: RemoveFormatting,
  },
];

/**
 * Lightweight rich-text editor (contentEditable). Output is HTML that the
 * API sanitizes again before sending, so nothing here is trusted.
 */
const RichTextEditor = forwardRef(function RichTextEditor(
  { initialHtml = '', onChange, label = 'Message' },
  ref,
) {
  const editorRef = useRef(null);

  useEffect(() => {
    if (editorRef.current) editorRef.current.innerHTML = initialHtml;
    // Only on mount: the editor owns its content afterwards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useImperativeHandle(ref, () => ({
    getHtml: () => editorRef.current?.innerHTML ?? '',
    getText: () => editorRef.current?.innerText ?? '',
    focus: () => editorRef.current?.focus(),
  }));

  const run = (command) => {
    editorRef.current?.focus();
    if (command === 'createLink') {
      const url = window.prompt(
        'Link address (https:// or mailto:)',
        'https://',
      );
      if (!url || !/^(https?:\/\/|mailto:)/i.test(url.trim())) return;
      document.execCommand('createLink', false, url.trim());
    } else {
      document.execCommand(command, false);
    }
    onChange?.();
  };

  return (
    <div className="editor">
      <div className="editor__toolbar" role="toolbar" aria-label="Formatting">
        {TOOLS.map(({ command, label: toolLabel, Icon }) => (
          <button
            key={command}
            type="button"
            className="icon-button icon-button--sm"
            title={toolLabel}
            aria-label={toolLabel}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => run(command)}
          >
            <Icon size={15} aria-hidden="true" />
          </button>
        ))}
      </div>
      <div
        ref={editorRef}
        className="editor__content"
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={label}
        onInput={() => onChange?.()}
      />
    </div>
  );
});

export default RichTextEditor;
