const i_common = require('../common');
const i_extractor = require('../extractor');
const i_decorator = require('../decorator');

const es5_extract_feature = {
   '"': [extract_doc_string_d, extract_string_d],
   '\'': [extract_doc_string_s, extract_string_s],
   '#': [extract_line_comment],
};

function extract_doc_string_d(env) {
   return i_extractor.extract_string(env, '"""', '"""', '\\');
}

function extract_doc_string_s(env) {
   return i_extractor.extract_string(env, '\'\'\'', '\'\'\'', '\\');
}

function extract_string_d(env) {
   return i_extractor.extract_string(env, '"', '"', '\\');
}

function extract_string_s(env) {
   return i_extractor.extract_string(env, '\'', '\'', '\\');
}

function extract_line_comment(env) {
   return i_extractor.extract_comment(env, '#', '\n');
}

const javascript_combinations = [
   '**', '++', '--', '+=', '-=', '*=', '/=', '%=', '==', '!=', '<>',
   '>=', '<=', '<<', '>>', '&=', '|=', '^=', '<<=', '>>=', '//',
   '//=', '**='
];

const tags = {
   indent: 'indent.python',
   annotation: 'annotation.python',
};

const python_decorate_feature = {
   ' ': [decorate_indent],
   '\t': [decorate_indent],
   '@': [decorate_annotation],
};

function decorate_indent(env) {
   let st = env.cursor;
   if (st > 0) {
      let prev_token = env.tokens[st-1];
      if (prev_token.token !== '\n') {
         if (
            prev_token.tag !== i_common.TAG_COMMENT ||
            prev_token.comment.charAt(prev_token.comment.length-1) !== '\n'
         ) return 1;
      }
   }
   let ed = i_common.search_next(
      env.tokens, st, (x) => x.token === ' ' || x.token === '\t'
   );
   if (ed < 0) ed = env.tokens.length;
   if (st >= ed) return 1;
   let indent_token = env.tokens[st];
   indent_token.startIndex = st;
   indent_token.endIndex = ed;
   indent_token.tag = tags.indent;
   return ed - st;
}

function python_detect_full_name(tokens, index) {
   let st = index, ed = st, t = ed, n = tokens.length;
   let token;
   while (t < n && t > 0) {
      t = i_common.search_next_skip_spacen(tokens, ed+1);
      token = tokens[t];
      if (!token) break;
      if (token.token !== '.') break;
      t = i_common.search_next_skip_spacen(tokens, t+1);
      ed = t;
   }
   return {
      startIndex: st, endIndex: ed+1
   }
}

function decorate_annotation(env) {
   //@depend decorate_bracket
   // will cause syntax error:
   // - @wrap_factory_create()(...)
   // - @wrap_dict[...](...)
   // thus @symbol(...)
   let st = env.cursor;
   let ed = i_common.search_next_skip_spacen(env.tokens, st+1);
   let anno_token = env.tokens[st];
   let type_position = python_detect_full_name(env.tokens, ed);
   if (!type_position) return 1;
   anno_token.tag = tags.annotation;
   let name_token = env.tokens[type_position.startIndex];
   name_token.startIndex = type_position.startIndex;
   name_token.endIndex = type_position.endIndex;
   ed = type_position.endIndex;
   ed = i_common.search_next_skip_spacen(env.tokens, ed);
   let next_token = env.tokens[ed];
   if (next_token && next_token.token === '(') {
      anno_token.startIndex = st;
      anno_token.endIndex = next_token.endIndex;
   } else {
      anno_token.startIndex = st;
      anno_token.endIndex = type_position.endIndex;
   }
   ed = anno_token.endIndex;
   return ed - st;
}

function parse(env) {
   env.cursor = 0;
   i_extractor.extract_tokens(env, es5_extract_feature);
   i_extractor.merge_tokens(env, javascript_combinations);
   i_decorator.decorate_bracket(env);
   env.cursor = 0;
   i_decorator.decorate_scope(env, python_decorate_feature);
   return env.tokens;
}

const i_fs = require('fs');
let filename = process.argv[2];
let text = i_fs.readFileSync(filename).toString();
let tokens = parse({text: text});
console.log(JSON.stringify(tokens, null, 3));
