'use strict';

const React = require('react');

const fakeDispatcher = {
  useState(initial) {
    return [typeof initial === 'function' ? initial() : initial, () => {}];
  },
  useReducer(reducer, initial) {
    return [typeof initial === 'function' ? initial() : initial, () => {}];
  },
  useEffect() {},
  useLayoutEffect() {},
  useMemo(factory) {
    return typeof factory === 'function' ? factory() : undefined;
  },
  useCallback(fn) {
    return fn;
  },
  useRef(initial) {
    return { current: initial };
  },
  useContext(ctx) {
    return ctx && ctx._currentValue;
  },
  useImperativeHandle() {},
  useDebugValue() {},
  useId() {
    return 'id-stub';
  },
  useTransition() {
    return [false, (cb) => { if (typeof cb === 'function') cb(); }];
  },
  useDeferredValue(value) {
    return value;
  },
  useSyncExternalStore() {
    return null;
  },
  useInsertionEffect() {},
};

function withFakeDispatcher(fn) {
  const internals = React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;
  if (!internals || !internals.ReactCurrentDispatcher) {
    return fn();
  }
  const prev = internals.ReactCurrentDispatcher.current;
  internals.ReactCurrentDispatcher.current = fakeDispatcher;
  try {
    return fn();
  } finally {
    internals.ReactCurrentDispatcher.current = prev;
  }
}

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
        rendered = withFakeDispatcher(() => type(props));
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
  const text = withFakeDispatcher(() => extractText(element));
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
