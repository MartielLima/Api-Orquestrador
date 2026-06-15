'use strict';

const React = require('react');

function passthrough(props) {
  return React.createElement('text-stub', null, props && props.children);
}

const Text = passthrough;
const Box = passthrough;
const Spacer = passthrough;
const Newline = passthrough;
const Static = passthrough;
const Transform = passthrough;
const useInput = () => {};
const useApp = () => ({ exit: () => {} });
const useStdin = () => ({ isTTY: false, write: () => {}, setEncoding: () => {}, setRawMode: () => {} });
const useStdout = () => ({ write: () => {} });
const useStderr = () => ({ write: () => {} });

module.exports = {
  Text,
  Box,
  Spacer,
  Newline,
  Static,
  Transform,
  useInput,
  useApp,
  useStdin,
  useStdout,
  useStderr,
  render: () => ({ rerender: () => {}, unmount: () => {}, waitUntilExit: () => Promise.resolve() }),
};
