const fs = require('fs');
const fsm = require('./parser/fsm');
const tokenizer = require('./parser/tokenizer');

let filename = process.argv[2] || 'test.js';
let text = fs.readFileSync(filename).toString();
let tokens = new tokenizer.WordTokenizer().process(text);

// test for common comment and string tokenizer
/* define c style (multiple)' line comment */
let parser = new fsm.FeatureRoot();
let feature;
feature = new fsm.FeatureCommonString(['\'', '"', '`']);
//feature.merge_feature_as_python_doc_to(parser);
feature.merge_feature_to(parser);
feature = new fsm.FeatureCommonComment('c_style_line_comment', '//'.split(''), '\n', false);
feature.merge_feature_to(parser);
feature = new fsm.FeatureCommonComment('c_style_multiline_comment', '/*'.split(''), '*/'.split(''), true);
feature.merge_feature_to(parser);
//feature = new fsm.FeatureRubyHereDocString();
//feature.merge_feature_to(parser);
//feature = new fsm.FeatureRubyPercentString();
//feature.merge_feature_to(parser);
//feature = new fsm.FeatureCommonComment('ruby_style_line_comment', '#', '\n', false);
//feature.merge_feature_to(parser);
//feature = new fsm.FeatureCommonComment('ruby_multiline_comment', ['=', 'begin'], ['\n', '=', 'end'], true);
//feature.merge_feature_to(parser);
tokens = parser.process(tokens);
console.log(JSON.stringify(tokens, null, 3));