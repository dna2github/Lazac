const i_common = require('../common');
const i_extractor = require('../extractor');
const i_decorator = require('../decorator');

const es5_extract_feature = {
   '"': [extract_string],
   '\'': [extract_char],
   '`': [extract_cmd_string],
   '#': [extract_line_comment],
};

function extract_string(env) {
   return i_extractor.extract_string(env, '"', '"', '\\');
}

function extract_char(env) {
   return i_extractor.extract_string(env, '\'', '\'', '\\');
}

function extract_cmd_string(env) {
   return i_extractor.extract_string(env, '`', '`', '\\');
}

function extract_line_comment(env) {
   return i_extractor.extract_comment(env, '#', '\n');
}

const javascript_combinations = [
   '++', '--', '+=', '-=', '*=', '/=', '%=', '==',
   '!=', '>=', '<=', '<<-', '&&', '||', '<<', '>>',
   '&=', '|=', '^=', '<<=', '>>=',
];

function parse(env) {
   env.cursor = 0;
   i_extractor.extract_tokens(env, es5_extract_feature);
   i_extractor.merge_tokens(env, javascript_combinations);
   i_decorator.decorate_bracket(env);
   return env.tokens;
}

const i_fs = require('fs');
let filename = process.argv[2];
let text = i_fs.readFileSync(filename).toString();
let tokens = parse({text: text});
console.log(JSON.stringify(tokens, null, 3));
