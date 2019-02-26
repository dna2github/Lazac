const i_common = require('../common');
const i_extractor = require('../extractor');
const i_decorator = require('../decorator');

const go_feature = {
   '"': [extract_string],
   '\'': [extract_char],
   '`': [extract_raw_string],
   '/': [extract_line_comment, extract_multiline_comment]
};

function extract_string(env) {
   return i_extractor.extract_string(env, '"', '"', '\\');
}

function extract_char(env) {
   return i_extractor.extract_string(env, '\'', '\'', '\\');
}

function extract_raw_string(env) {
   return i_extractor.extract_string(env, '`', '`', '\\');
}

function extract_line_comment(env) {
   return i_extractor.extract_comment(env, '//', '\n');
}

function extract_multiline_comment(env) {
   return i_extractor.extract_comment(env, '/*', '*/');
}

const go_keywords = [
   // ref:
   // - https://golang.org/ref/spec#Keywords
   'break', 'default', 'func', 'interface', 'select', 'var',
   'case', 'defer', 'go', 'map', 'struct', 'chan', 'else',
   'goto', 'package', 'switch', 'const', 'fallthrough', 'if',
   'range', 'type', 'continue', 'for', 'import', 'return'
];

const go_combinations = [
   '++', '--', '+=', '-=', '*=', '/=', '%=', '==',
   '!=', '>=', '<=', '&&', '||', '<<', '>>', '&=',
   '|=', '^=', '<<=', '>>=', '&^', '&^=', '<-', '...'
];

const go_decorate_feature = {
   'import': [decoraete_import],
   'type': [decorate_type],
   'struct': [decorate_struct],
   'func': [decorate_function],
};

function decoraete_import(env) {}

function decorate_type(env) {}

function decorate_struct(env) {}

function decorate_function(env) {}

function parse(env) {
   env.cursor = 0;
   i_extractor.extract_tokens(env, go_feature);
   i_extractor.merge_tokens(env, go_combinations);
   i_decorator.decorate_bracket(env);
   i_decorator.decorate_keywords(env, go_keywords);
   env.cursor = 0;
   i_decorator.decorate_scope(env, go_decorate_feature);
   return env.tokens;
}

const i_fs = require('fs');
let filename = process.argv[2];
let text = i_fs.readFileSync(filename).toString();
let tokens = parse({text: text});
console.log(JSON.stringify(tokens.map((x, i) => { x.id=i; return x; }), null, 3));
