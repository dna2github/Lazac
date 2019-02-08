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

const java_combinations = [
   '!=', '+=', '-=', '~=', '|=', '&=', '^=', '++', '>=',
   '&&', '||', '>>', '<<', '%=', '*=', '/=', '--', '<=',
   '->', '>>>', '%=', '<<=', '>>=', '>>>=', '...',
   ['@', 'interface'],
];

const java_decorate_feature = {
   'package': [decorate_package],
   'import': [decorate_import],
   '@': [decorate_annotation]
};

function java_detect_basic_type(tokens, index) {
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

function java_detect_type_generic(tokens, index) {
   let st = index, ed = st;
   let token;
   token = tokens[index];
   if (token.token !== '<') return null;
   let deep = 1;
   let n = tokens.length;
   for (ed = st+1; ed < n; ed++) {
      token = tokens[ed];
      if (token.token === '>') deep--;
      else if (token.token === '<') deep ++;
      if (!deep) break;
   }
   if (deep) return null;
   return {
      startIndex: st, endIndex: ed+1
   };
}

function java_detect_type_array(tokens, index) {
   let st = index, ed = st;
   let token = tokens[index];
   let dim_position = [st];
   if (token.token !== '[') return null;
   let deep = 1;
   let n = tokens.length;
   for (ed = st+1; ed < n; ed++) {
      token = tokens[ed];
      if (token.token === ']') deep--;
      else if (token.token === '[') deep ++;
      if (!deep) {
         ed = i_common.search_next_skip_spacen(tokens, ed+1);
         if (ed < 0) break;
         token = tokens[ed];
         if (token.token !== '[') break;
         dim_position.push(ed);
         deep ++;
      }
   }
   dim_position.push(ed+1);
   if (deep) return null;
   return {
      startIndex: st, endIndex: ed+1,
      dimension: dim_position
   };
}

function java_detect_type(tokens, index) {
   let start_token = tokens[index];
   let position = java_detect_basic_type(tokens, index);
   let t = position.endIndex;
   t = i_common.search_next_skip_spacen(tokens, t);
   let generic_position = java_detect_type_generic(tokens, t);
   if (generic_position) {
      position.generic = generic_position;
      position.endIndex = generic_position.endIndex;
   }
   t = position.endIndex;
   t = i_common.search_next_skip_spacen(tokens, t);
   let array_position = java_detect_type_array(tokens, t);
   if (array_position) {
      position.array = array_position;
      position.endIndex = array_position.endIndex;
   }
   start_token.startIndex = position.startIndex;
   start_token.endIndex = position.endIndex;
   if (position.generic) start_token.generic = position.generic;
   if (position.array) start_token.array = position.array.dimension;
   return position;
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
   //@depend decorate_bracket
   let st = env.cursor;
   let ed = i_common.search_next_skip_spacen(env.tokens, st+1);
   let anno_token = env.tokens[st];
   let type_position = java_detect_type(env.tokens, ed);
   if (type_position.endIndex - type_position.startIndex === 1) {
      //@depend !merge_tokens
      if (env.tokens[type_position.startIndex].token === 'interface') {
         anno_token.java = '@interface';
         return type_position.endIndex - st;
      }
   }
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
   i_extractor.extract_tokens(env, java_extract_feature);
   i_extractor.merge_tokens(env, java_combinations);
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