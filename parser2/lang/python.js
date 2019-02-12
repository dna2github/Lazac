const i_common = require('../common');
const i_extractor = require('../extractor');
const i_decorator = require('../decorator');

const python_extract_feature = {
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

const python_keywords = [
   // ref:
   // - https://github.com/python/cpython/blob/2.7/Lib/keyword.py
   // - https://github.com/python/cpython/blob/3.7/Lib/keyword.py
   'and', 'as', 'assert', 'break', 'class', 'continue', 'def',
   'del', 'elif', 'else', 'except', 'finally', 'while', 'with',
   'for', 'from', 'global', 'if', 'import', 'in', 'is', 'lambda',
   'not', 'or', 'pass', 'raise', 'return', 'try', 'yield',
   /* 2 */ 'print', 'exec',
   /* 3 */ 'False', 'None', 'True', 'async', 'await', 'nonlocal',
];

const python_combinations = [
   '**', '++', '--', '+=', '-=', '*=', '/=', '%=', '==', '!=', '<>',
   '>=', '<=', '<<', '>>', '&=', '|=', '^=', '<<=', '>>=', '//',
   '//=', '**='
];

const tags = {
   indent: 'indent.python',
   annotation: 'annotation.python',
};

const python_decorate_indent_feature = {
   ' ': [decorate_indent],
   '\t': [decorate_indent],
   '(': [decorate_skip],
   '[': [decorate_skip],
   '{': [decorate_skip],
};

const python_decorate_feature = {
   '@': [decorate_annotation],
   'from': [decorate_import],
   'import': [decorate_import],
   'class': [decorate_class],
   'def': [decorate_function],
   'lambda': [decorate_lambda_function],
};

const debug = {
   group_text: (env, x) => {
      if (!x) return '';
      return env.tokens.slice(
         x.startIndex, x.endIndex
      ).map(
         (x) => x.token
      ).join('');
   },
   import_text: (env, token) => {
      token.debug = {
         base: debug.group_text(env, token.base),
         import: token.import.map((x) => debug.group_text(env, x)),
      };
   },
   class_text: (env, token) => {
      token.debug = {
         name: env.tokens[token.name].token,
         inherit: token.inherit.map((x) => debug.group_text(env, x)),
         annotation: token.annotation?token.annotation.map(
            (x) => debug.group_text(env, env.tokens[x].name)
         ):[],
      }
   },
   function_text: (env, token) => {
      token.debug = {
         name: env.tokens[token.name].token,
         annotation: token.annotation?token.annotation.map(
            (x) => debug.group_text(env, env.tokens[x].name)
         ):[],
      }
   }
};

function decorate_import(env) {
   // import os
   // from os import getenv
   // from math import abs, sin, cos
   // from subprocess import ( PIPE, Popen, MAXFD )
   let st = env.cursor, ed = i_common.search_next_skip_space(env.tokens, st+1);
   let start_token = env.tokens[st], cursor = start_token;
   let base_position;
   start_token.startIndex = st;
   if (cursor.token === 'from') {
      base_position = python_detect_full_name(env.tokens, ed);
      start_token.base = base_position;
      ed = i_common.search_next_skip_space(env.tokens, base_position.endIndex);
      cursor = env.tokens[ed];
      ed = i_common.search_next_skip_space(env.tokens, ed+1);
   }
   if (cursor.token === 'import') {
      let i = i_common.search_next_skip_space(env.tokens, ed);
      let import_positions = [];
      let token = env.tokens[i];
      let position;
      if (token.token === '(') {
         // ... import ( ... )
         //@depend decorate_bracket
         ed = token.endIndex;
         i = i_common.search_next_skip_spacen(env.tokens, i+1);
         token = env.tokens[i];
         while (i < ed && token) {
            // deal with ... import ( ..., tail, )
            if (token.token === ')') break;
            position = python_detect_full_name(env.tokens, i);
            import_positions.push(position);
            i = i_common.search_next_skip_spacen(env.tokens, position.endIndex);
            // env.tokens[i].token should be ','
            i = i_common.search_next_skip_spacen(env.tokens, i+1);
            token = env.tokens[i];
         }
      } else {
         // ... import ...
         position = python_detect_full_name(env.tokens, i);
         import_positions.push(position);
         ed = position.endIndex;
      }
      start_token.endIndex = ed;
      start_token.import = import_positions;

      // debug:
      debug.import_text(env, start_token);

      return ed - st;
   }
}

function decorate_class(env) {
   // class A
   // class A()
   // class A(object)
   // class A(B, C)
   let st = env.cursor, ed = i_common.search_next_skip_space(env.tokens, st+1);
   let start_token = env.tokens[st];
   // name_token = env.tokens[ed];
   start_token.name = ed;
   ed = i_common.search_next_skip_space(env.tokens, ed+1);
   let token = env.tokens[ed];
   let inherit_positions = [];
   let i = ed, position;
   if (token.token === '(') {
      // inherit
      ed = token.endIndex;
      i = i_common.search_next_skip_spacen(env.tokens, i+1);
      token = env.tokens[i];
      // XXX: think about inner class
      //      - class A(factory['test])
      // TODO: extract inherit list
   }
   ed = i_common.search_next_skip_space(env.tokens, ed);
   // env.tokens[ed].token should be ':'
   ed ++
   start_token.tag = i_common.TAG_CLASS;
   start_token.startIndex = st;
   start_token.endIndex = ed;
   start_token.inherit = inherit_positions;

   python_get_scope_indent(env.tokens, start_token, st)
   // python_connect_annotation is processed in annotation part
   python_connect_scope(env.tokens, start_token, ed);

   debug.class_text(env, start_token);

   return ed - st;
}

function decorate_function(env) {
   // def a()
   // def a(t1, *args, **kwargs)
   let st = env.cursor, ed = i_common.search_next_skip_space(env.tokens, st+1);
   let start_token = env.tokens[st];
   // name_token = env.tokens[ed];
   start_token.name = ed;
   ed = i_common.search_next_skip_space(env.tokens, ed+1);
   let token = env.tokens[ed];
   // token should be '('
   // TODO: extract parameter list
   ed = token.endIndex;
   ed = i_common.search_next_skip_space(env.tokens, ed);
   // env.tokens[ed].token should be ':'
   ed ++
   start_token.tag = i_common.TAG_FUNCTION;
   start_token.startIndex = st;
   start_token.endIndex = ed;

   python_get_scope_indent(env.tokens, start_token, st)
   // python_connect_annotation is processed in annotation part
   python_connect_scope(env.tokens, start_token, ed);

   debug.function_text(env, start_token);

   return ed - st;
}

const lambda_end = [',', ';', '\n', ')', '}', ']'];
function decorate_lambda_function(env) {
   // lambda x, y: expression
   let st = env.cursor, ed = i_common.search_next(
      env.tokens, st+1, (x) => x.token !== ':'
   );
   if (ed < 0) return 1;
   ed ++;
   let lambda_token = env.tokens[st];
   let scope_position = {
      startIndex: ed,
      endIndex: ed
   }
   // st - ed: lambda <parameters>
   // TODO: extract parameters
   let i = ed, n = env.tokens.length;
   for (; i < n; i++) {
      let token = env.tokens[i];
      if (i_common.bracket.left.indexOf(token.token) >= 0 && token.endIndex) {
         i = token.endIndex - 1;
         continue;
      }
      if (lambda_end.indexOf(token.token) >= 0) break;
   }
   scope_position.endIndex = i;
   lambda_token.scope = scope_position;
   lambda_token.tag = i_common.TAG_FUNCTION;
   lambda_token.startIndex = st;
   lambda_token.endIndex = ed;
}

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

function decorate_skip (env) {
   let token = env.tokens[env.cursor];
   if (!token || !token.endIndex) return 1;
   return token.endIndex - token.startIndex;
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

function count_indent_length(tokens, start_token) {
   return tokens.slice(
      start_token.startIndex,
      start_token.endIndex
   ).map((x) => {
      if (x.token === '\t') return 8;
      return 1;
   }).reduce((x, y) => x+y);
}

function python_get_scope_indent(tokens, start_token, index) {
   if (!index) return index;
   // not use search_prev_skip_space since:
   // \n ---> prev_br, +1 ===> # test
   // # test\n
   // def a(): pass
   let prev_br = i_common.search_prev(
      tokens, index-1, (x) => x.token === ' ' || x.token === '\t'
   );
   if (prev_br < 0) return index;
   // @annotation class A(): pass ===> syntax error
   //
   // @annotation
   // class A(): pass
   let token = tokens[prev_br + 1]; // \n<indent>class/def
   if (token.tag === tags.indent) {
      start_token.indent = count_indent_length(tokens, token);
      return prev_br + 1;
   } else {
      start_token.indent = 0;
   }
   return index;
}

function python_connect_annotation(tokens, start_token, index) {
   let i = start_token.endIndex, n = tokens.length;
   let bind_token, token;
   for (; i < n; i++) {
      token = tokens[i];
      if (i_common.bracket.left.indexOf(token.token) >= 0 && token.endIndex) {
         i = token.endIndex - 1;
         continue;
      }
      if (token.token === 'def' || token.token === 'class') {
         bind_token = token;
         break;
      }
   }
   if (!bind_token) return; // fail to bind to class/def
   if (!bind_token.annotation) {
      bind_token.annotation = [];
   }
   bind_token.annotation.push(index);
}

function python_connect_scope(tokens, start_token, index) {
   //@depend python_get_scope_indent
   let i = index, n = tokens.length, token, line_indent = -1;
   let st = index, ed = st + 1;
   for(; i < n ; i ++) {
      token = tokens[i];
      if (!token) break;
      if (line_indent < 0) {
         if (token.tag === tags.indent) {
            line_indent = count_indent_length(tokens, token);
            i = token.endIndex;
            token = tokens[i];
            if (!token) break;
         } else {
            line_indent = 0;
         }
         if (token.token === '\n') {
            line_indent = -1;
            continue;
         }
         if (token.tag === i_common.TAG_COMMENT) {
            line_indent = -1;
            continue;
         }
         if (line_indent > start_token.indent) continue;
         i = i_common.search_prev_skip_spacen(tokens, i-1);
         i = i_common.search_next(tokens, i, (x) => x.token !== '\n');
         ed = i;
         break;
      }
      if (i_common.bracket.left.indexOf(token.token) >= 0 && token.endIndex) {
         i = token.endIndex - 1;
         continue;
      }
      if (token.token === '\n') {
         line_indent = -1;
         continue;
      }
   }
   if (i === n) ed = n;
   start_token.scope = {
      startIndex: st,
      endIndex: ed
   };
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
   anno_token.name = type_position;
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
   python_connect_annotation(env.tokens, anno_token, st);
   return ed - st;
}

function parse(env) {
   env.cursor = 0;
   i_extractor.extract_tokens(env, python_extract_feature);
   i_extractor.merge_tokens(env, python_combinations);
   i_decorator.decorate_bracket(env);
   i_decorator.decorate_keywords(env, python_keywords);
   env.cursor = 0;
   i_decorator.decorate_scope(env, python_decorate_indent_feature);
   env.cursor = 0;
   i_decorator.decorate_scope(env, python_decorate_feature);
   return env.tokens;
}

const i_fs = require('fs');
let filename = process.argv[2];
let text = i_fs.readFileSync(filename).toString();
let tokens = parse({text: text});
console.log(JSON.stringify(tokens.map((x, i) => { x.id=i; return x; }), null, 3));
