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
   '|=', '^=', '<<=', '>>=', '&^', '&^=', '<-', '...',
];

const go_decorate_feature = {
   'import': [decoraete_import],
   'interface': [decorate_interface],
   'type': [decorate_type],
   'struct': [decorate_struct],
   'func': [decorate_function],
};

function detect_line_import(tokens, index) {
   // import . "fmt"
   // import _ "fmt"
   // import xxx "fmt"
   // import "fmt"
   let position = {
      startIndex: index,
      endIndex: index+1
   };
   let token = tokens[index];
   let alias = null;
   if (token.tag !== i_common.TAG_STRING) {
      alias = [index, index+1];
      index = i_common.search_next_skip_spacen(tokens, index+1);
      token = tokens[index];
      if (!token) return null;
   }
   if (token.tag !== i_common.TAG_STRING) return null;
   let name = [index];
   position.alias = alias;
   position.name = name;
   position.endIndex = index + 1;
   position.skipIndex = index;
   position.skipIndex = i_common.search_next_skip_spacen(
      tokens, position.skipIndex+1
   );
   token = tokens[position.skipIndex];
   // import ("fmt"; . "fmt")
   if (token && token.token === ';') {
      position.skipIndex = i_common.search_next_skip_spacen(
         tokens, position.skipIndex+1
      );
   }
   return position;
}

function decoraete_import(env) {
   // import fmt "fmt"
   // import (
   //    _ "xxx/sql"
   // )
   let st = env.cursor, ed = st;
   let import_token = env.tokens[st];
   ed = i_common.search_next_skip_spacen(env.tokens, ed+1);
   let token = env.tokens[ed];
   let import_list = [];
   let position;
   if (!token) return 0;
   if (token.token === '(') {
      ed = i_common.search_next_skip_spacen(env.tokens, ed+1);
      do {
         position = detect_line_import(env.tokens, ed);
         import_list.push([
            position.startIndex,
            position.endIndex,
            {
               name: position.name,
               alias: position.alias
            }
         ]);
         ed = position.skipIndex;
         token = env.tokens[position.skipIndex];
      } while (token && token.token !== ')');
      ed = position.endIndex;
   } else {
      position = detect_line_import(env.tokens, ed);
      import_list.push([
         position.startIndex,
         position.endIndex,
         {
            name: position.name,
            alias: position.alias
         }
      ]);
      ed = position.endIndex;
   }
   import_token.startIndex = st;
   import_token.endIndex = ed;
   import_token.import_list = import_list;
   return ed - st;
}

function decorate_type(env) {
   // type A struct {}
   // type (
   //    A struct {}
   // )
   // type (F []int; G [][][]* interface{})
}

function decorate_interface(env) {}

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

module.exports = {
   parse: (text) => parse({ text })
};