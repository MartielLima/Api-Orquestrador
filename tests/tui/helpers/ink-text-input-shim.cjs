'use strict';

const React = require('react');

function TextInput(props) {
  let text = props && props.value != null ? String(props.value) : (props && props.placeholder) || '';
  if (props && props.mask) {
    text = text.split('').map(() => String(props.mask)).join('');
  }
  return React.createElement('text-stub', null, text);
}

module.exports = TextInput;
module.exports.default = TextInput;
