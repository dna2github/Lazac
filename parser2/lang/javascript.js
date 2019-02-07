const i_extractor = require('../extractor');

const es5_extract_feature = {
   '"': [extract_string],
   '\'': [extract_char],
   '/': [extract_line_comment, extract_multiline_comment, extract_regex_generator()]
};

function extract_string(env) {
   return i_extractor.extract_string(env, '"', '"', '\\');
}

function extract_char(env) {
   return i_extractor.extract_string(env, '\'', '\'', '\\');
}

function extract_line_comment(env) {
   return i_extractor.extract_comment(env, '//', '\n');
}

function extract_multiline_comment(env) {
   return i_extractor.extract_comment(env, '/*', '*/');
}

function extract_regex_generator() {
   return i_extractor.extract_tokens_feature_generator(
      // e.g. return /test/.test(string);
      i_extractor.extract_regex, [['return']]
   );
}

function parse(env) {
   env.cursor = 0;
   i_extractor.extract_tokens(env, es5_extract_feature);
   return env.tokens;
}

const i_fs = require('fs');
let filename = process.argv[2];
let text = i_fs.readFileSync(filename).toString();
let tokens = parse({text: text});
console.log(JSON.stringify(tokens, null, 3));
