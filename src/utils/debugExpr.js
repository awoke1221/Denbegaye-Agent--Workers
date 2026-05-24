const { Parser } = require('expr-eval');
const obj = { variables: { nodeA: { transformed: 'hello' } } };
console.log(Parser.parse('variables.nodeA.transformed + " world"').evaluate(obj));
