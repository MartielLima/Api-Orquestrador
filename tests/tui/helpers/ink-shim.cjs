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

function TextInput(props) {
  let text = props && props.value != null ? String(props.value) : (props && props.placeholder) || '';
  if (props && props.mask) {
    text = text.split('').map(() => String(props.mask)).join('');
  }
  return React.createElement('text-stub', null, text);
}

function Gradient(props) {
  return React.createElement('text-stub', null, props && props.children);
}

function Spinner(_props) {
  return React.createElement('text-stub', null, '⠋');
}

function InkTable(props) {
  const data = (props && props.data) || [];
  return React.createElement('text-stub', null, JSON.stringify(data));
}

const render = () => ({
  rerender: () => {},
  unmount: () => {},
  waitUntilExit: () => Promise.resolve(),
  cleanup: () => {},
});

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
  TextInput,
  Gradient,
  Spinner,
  InkTable,
  render,
  default: { Text, Box, Spacer, Newline, Static, Transform, useInput, useApp, render },
};
