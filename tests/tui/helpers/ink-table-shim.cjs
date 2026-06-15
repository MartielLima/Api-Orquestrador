'use strict';

const React = require('react');

function InkTable(props) {
  const data = (props && props.data) || [];
  return React.createElement('text-stub', null, JSON.stringify(data));
}

module.exports = InkTable;
module.exports.default = InkTable;
