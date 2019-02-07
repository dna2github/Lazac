const i_common = require('../common');
const i_extractor = require('../extractor');
const i_decorator = require('../decorator');

const java_extract_feature = {
   '"': [extract_string],
   '\'': [extract_char],
   '/': [extract_line_comment, extract_multiline_comment]
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

const java_decorate_feature = {
   'package': [decorate_package],
   'import': [decorate_import],
   '@': [decorate_annotation]
};

function java_detect_name(tokens, index) {
   let st, ed, t, token;
   let n = tokens.length;
   st = index;
   t = i_common.search_prev_skip_spacen(tokens, st-1);
   while (st >= 0) {
      token = tokens[t];
      if (token.token !== '.') {
         break;
      }
      t = i_common.search_prev_skip_spacen(tokens, t-1);
      st = t;
      t = i_common.search_prev_skip_spacen(tokens, t-1);
   }
   if (st < 0) st = 0;
   ed = index;
   t = i_common.search_next_skip_spacen(tokens, ed+1);
   while (ed < n) {
      token = tokens[t];
      if (token.token !== '.') {
         break;
      }
      t = i_common.search_prev_skip_spacen(tokens, t-1);
      st = t;
      t = i_common.search_prev_skip_spacen(tokens, t-1);
   }
}

function decorate_package(env) {
   let st = env.cursor;
   let ed = i_common.search_next_stop(env.tokens, st, [';']);
   let package_name = i_common.subtokens(env.tokens, st+1, ed, i_common.is_not_space);
   let package_token = env.tokens[st];
   package_token.startIndex = st;
   package_token.endIndex = ed;
   package_token.package = package_name;
   return ed - st;
}

function decorate_import(env) {
   let st = env.cursor;
   let ed = i_common.search_next_stop(env.tokens, st+1, [';']);
   let package_name = i_common.subtokens(env.tokens, st+1, ed, i_common.is_not_space);
   let import_token = env.tokens[st];
   import_token.startIndex = st;
   import_token.endIndex = ed;
   package_name = package_name.split('.');
   let import_class = package_name.pop();
   let import_package = package_name.join('.');
   import_token.name = import_class;
   import_token.package = import_package;
   return ed - st;
}

function decorate_annotation(env) {
   return 0;
}

function parse(env) {
   env.cursor = 0;
   i_extractor.extract_tokens(env, java_extract_feature);
   i_decorator.decorate_bracket(env);
   env.cursor = 0;
   i_decorator.decorate_scope(env, java_decorate_feature);
   return env.tokens;
}

const i_fs = require('fs');
let filename = process.argv[2];
let text = i_fs.readFileSync(filename).toString();
let tokens = parse({text: text});
console.log(JSON.stringify(tokens, null, 3));