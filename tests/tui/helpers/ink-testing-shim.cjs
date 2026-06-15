'use strict';

const React = require('react');

function extractText(node) {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (React.isValidElement(node)) {
    const type = node.type;
    const props = node.props || {};
    if (typeof type === 'function') {
      let rendered;
      try {
        rendered = type(props);
      } catch (e) {
        rendered = null;
      }
      return extractText(rendered);
    }
    return extractText(props.children);
  }
  return '';
}

function render(element) {
  const text = extractText(element);
  const stdout = {
    frames: [text],
    lastFrame: () => text,
    write: () => {},
  };
  const stderr = {
    frames: [],
    lastFrame: () => '',
    write: () => {},
  };
  return {
    rerender: () => {},
    unmount: () => {},
    cleanup: () => {},
    debug: () => {},
    stdin: { write: () => {} },
    stdout,
    stderr,
    lastFrame: () => text,
  };
}

module.exports = { render };
