const fs = require('fs');
const fsm = require('./parser/fsm');
const tokenizer = require('./parser/tokenizer');

let filename = process.argv[2] || 'test.js';
let text = fs.readFileSync(filename).toString();
let tokens = new tokenizer.WordTokenizer().process(text);
tokens = new fsm.FeatureCStyleString().merge_feature_to(new fsm.FeatureRoot()).process(tokens);
console.log(JSON.stringify(tokens, null, 3));