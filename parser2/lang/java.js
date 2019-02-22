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

const java_keywords = [
   // ref:
   // - https://docs.oracle.com/javase/tutorial/java/nutsandbolts/_keywords.html
   'abstract', 'continue', 'for', 'new', 'switch', 'assert', 'default', 'goto', 'package', 'synchronized',
   'boolean', 'do', 'if', 'private', 'this', 'break', 'double', 'implements', 'protected', 'throw',
   'byte', 'else', 'import', 'public', 'throws', 'case', 'enum', 'instanceof', 'return', 'transient',
   'catch', 'extends', 'int', 'short', 'try', 'char', 'final', 'interface', 'static', 'void',
   'class', 'finally', 'long', 'strictfp', 'volatile', 'const', 'float', 'native', 'super', 'while',
   '@interface',
];

const java_combinations = [
   '!=', '+=', '-=', '~=', '|=', '&=', '^=', '++', '>=',
   '&&', '||', '>>', '<<', '%=', '*=', '/=', '--', '<=',
   '->', '>>>', '%=', '<<=', '>>=', '>>>=', '...',
   ['@', 'interface'],
];

const tags = {
   package: 'package.java',
   import: 'import.java',
   annotation: 'annotation.java',
};

const java_decorate_feature = {
   'package': [decorate_package],
   'import': [decorate_import],
   'class': [decorate_class],
   'interface': [decorate_interface],
   '@interface': [decorate_annotation_definition],
   'new': [decorate_anonymous_class],
   '@': [decorate_annotation],
   '{': [decorate_function, decorate_enum],
   '}': [decorate_container],
   ';': [decorate_function],
   '->': [decorate_lambda_function],
};

function decorate_container(env) {
   if (env.is_in_container) {
      let last = env.is_in_container[env.is_in_container.length-1];
      if (!last) return 1;
      if (env.cursor+1 === last.endIndex) {
         env.is_in_container.pop();
      }
   }
   return 1;
}

function decorate_enum(env) {
   let st = env.cursor, ed = st;
   let token = env.tokens[st];
   let annotation = null;
   if (token.annotation) {
      annotation = token.annotation;
      delete token.annotation;
   }
   st = i_common.search_prev_skip_spacen(env.tokens, st-1);
   if (st < 0) return 0;
   let name = [st, st+1];
   st = i_common.search_prev_skip_spacen(env.tokens, st-1);
   if (st < 0) return 0;
   token = env.tokens[st];
   if (token.token !== 'enum') return 0;
   token.startIndex = st;
   token.endIndex = env.tokens[ed].endIndex;
   token.name = [name, name+1];
   token.tag = i_common.TAG_CLASS;
   if (annotation) token.annotation = annotation;
   return 1;
}

function decorate_anonymous_class(env) {
   // new F<T>() {...}
   let st = env.cursor, ed = st;
   st = i_common.search_next_skip_spacen(env.tokens, st+1)
   let p = java_detect_basic_type(env.tokens, st);
   if (!env.tokens[p.endIndex]) return 0;
   let name = [p.startIndex];
   ed = p.endIndex;
   ed = i_common.search_next_skip_spacen(env.tokens, ed);
   let token = env.tokens[ed];
   if (!token) return 0;
   if (token.token === '<') {
      p = java_detect_type_generic(env.tokens, ed);
   }
   if (!env.tokens[p.endIndex]) return 0;
   ed = p.endIndex;
   name.push(ed);
   ed = i_common.search_next_skip_spacen(env.tokens, ed);
   token = env.tokens[ed];
   if (!token) return 0;
   if (token.token !== '(') return 0;
   let parameter = [token.startIndex, token.endIndex];
   ed = token.endIndex;
   ed = i_common.search_next_skip_spacen(env.tokens, ed);
   token = env.tokens[ed];
   if (!token) return 0;
   if (token.token !== '{') return 0;
   token.anonymous_class_skip = true;
   ed = token.endIndex;
   token = env.tokens[st];
   token.tag = i_common.TAG_CLASS;
   token.type = name;
   token.parameter = parameter;
   token.startIndex = st;
   token.endIndex = ed;
   return 1;
}

function decorate_interface(env) {
   return decorate_xclass(env, 'interface');
}

function decorate_annotation_definition(env) {
   return decorate_xclass(env, '@interface');
}

function decorate_class(env) {
   return decorate_xclass(env, 'class');
}

function decorate_xclass(env, type) {
   // public static class Name<T extends List<String> > extends A implements B1, B2 {}
   // TODO: modifiers, e.g. public, static, final
   let st = env.cursor, ed = st;
   ed = i_common.search_next_skip_spacen(env.tokens, ed+1);
   let name = [ed, ed+1], generic = null, extend = null, impl = null;
   ed = i_common.search_next_skip_spacen(env.tokens, ed+1);
   let token = env.tokens[ed], p;
   if (!token) return 0;
   if (token.token === '<') {
      p = java_detect_type_generic(env.tokens, ed);
      generic = [p.startIndex, p.endIndex];
      ed = i_common.search_next_skip_spacen(env.tokens, p.endIndex);
      token = env.tokens[ed];
      if (!token) return 0;
   }
   if (token.token === 'extends') {
      extend = [];
      do {
         ed = i_common.search_next_skip_spacen(env.tokens, ed+1);
         p = java_detect_basic_type(env.tokens, ed);
         ed = i_common.search_next_skip_spacen(env.tokens, p.endIndex);
         token = env.tokens[ed];
         if (!token) return 0;
         if (token.token === '<') {
            p.generic = java_detect_type_generic(env.tokens, ed);
            ed = i_common.search_next_skip_spacen(env.tokens, p.generic.endIndex);
            token = env.tokens[ed];
            if (!token) return 0;
         }
         extend.push(p);
      } while (token.token === ',');
   }
   if (token.token === 'implements') {
      impl = [];
      do {
         ed = i_common.search_next_skip_spacen(env.tokens, ed+1);
         p = java_detect_basic_type(env.tokens, ed);
         ed = i_common.search_next_skip_spacen(env.tokens, p.endIndex);
         token = env.tokens[ed];
         if (!token) return 0;
         if (token.token === '<') {
            p.generic = java_detect_type_generic(env.tokens, ed);
            ed = i_common.search_next_skip_spacen(env.token, p.generic.endIndex);
            token = env.tokens[ed];
            if (!token) return 0;
         }
         impl.push(p);
      } while (token.token === ',');
   }
   if (token.token !== '{') return 0;
   let annotation = null;
   if (token.annotation) {
      annotation = token.annotation;
      delete token.annotation;
   }
   let skip_n = token.startIndex + 1;
   ed = token.endIndex;
   token = env.tokens[st];
   token.tag = i_common.TAG_CLASS;
   token.type = name;
   token.startIndex = st;
   token.endIndex = ed;
   if (generic) token.generic = generic;
   if (extend) token.extend = extend;
   if (impl) token.implement = impl;
   if (annotation) token.annotation = annotation;
   if (!env.is_in_container) env.is_in_container = [];
   env.is_in_container.push({
      container: true,
      endIndex: ed,
   });
   return skip_n - st;
}

const lambda_express_bracket = ['(', '{', '['];
const lambda_express_end = [',', ')', '}', ']', ';'];
function decorate_lambda_function(env) {
   let st = env.cursor, ed = st;
   let lambda_token = env.tokens[st];
   st = i_common.search_prev_skip_spacen(env.tokens, st-1);
   let parameter = [st+1];
   let token = env.tokens[st];
   if (token.token === ')') {
      st = i_common.search_prev(env.tokens, st-1, (x) => x.endIndex !== st+1);
      if (st < 0) return 0;
   }
   parameter.unshift(st);
   ed = i_common.search_next_skip_spacen(env.tokens, ed+1);
   token = env.tokens[ed];
   let skip_n = ed;
   if (token.token === '{') {
      skip_n = ed + 1;
      ed = token.endIndex;
   } else {
      for (let i = ed+1; i < env.tokens.length; i++) {
         token = env.tokens[i];
         if (lambda_express_bracket.indexOf(token.token) >= 0) {
            i = token.endIndex - 1;
         }
         if (lambda_express_end.indexOf(token.token) >= 0) {
            ed = i;
            break;
         }
      }
      if (ed === skip_n) {
         ed = env.tokens.length;
      }
      skip_n = env.cursor + 1;
   }
   lambda_token.tag = i_common.TAG_STRING;
   lambda_token.startIndex = st;
   lambda_token.endIndex = ed;
   lambda_token.parameter = parameter;
   return skip_n - env.cursor;
}

function decorate_function(env) {
   let st = env.cursor, ed = st;
   let token = env.tokens[st];
   let skip_key = null;
   if (token.anonymous_class_skip) {
      skip_key = 'anonymous_class_skip';
   }
   if (skip_key) {
      delete token[skip_key];
      if (!env.is_in_container) env.is_in_container = [];
      env.is_in_container.push({
         container: true,
         endIndex: token.endIndex,
      });
      return 1;
   }
   if (env.is_in_container) {
      let last = env.is_in_container[env.is_in_container.length-1];
      // TODO: new F() {...} => interface implementation
      if (last && !last.container) return 0;
   }
   // public static <T> ArrayList<T extends List<String> >[][]
   //                   test(ArrayList<? extends String> x) {}
   let annotation = null;
   if (token.annotation) {
      annotation = token.annotation;
      delete token.annotation;
   }
   st = i_common.search_prev_skip_spacen(env.tokens, st-1);
   if (st < 0) return 0;
   token = env.tokens[st];
   if (token.token !== ')') return 0;
   let parameter = [st+1];
   st = i_common.search_prev(env.tokens, st-1, (x) => x.endIndex !== st+1);
   if (st < 0) return 0;
   parameter.unshift(st);
   st = i_common.search_prev_skip_spacen(env.tokens, st-1);
   if (st < 0) return 0;
   let name = [st, st+1];
   // java_detect_type reverse version
   // - array
   st = i_common.search_prev_skip_spacen(env.tokens, st-1);
   if (st < 0) return 0;
   token = env.tokens[st];
   while (token.token === ']') {
      st = i_common.search_prev(env.tokens, st-1, (x) => x.endIndex !== st+1);
      if (st < 0) return 0;
      st = i_common.search_prev_skip_spacen(env.tokens, st-1);
      if (st < 0) return 0;
      token = env.tokens[st];
   }
   // - generic
   if (token.token === '>') {
      let deep = 1;
      while (deep) {
         st = i_common.search_prev(
            env.tokens, st-1, (x) => x.token !== '<' && x.token !== '>'
         );
         if (st < 0) return 0;
         token = env.tokens[st];
         if (token.token === '>') {
            deep ++;
         } else {
            deep --;
         }
      }
      st = i_common.search_prev_skip_spacen(env.tokens, st-1);
      if (st < 0) return 0;
      token = env.tokens[st];
   }
   // - type name
   let p = st;
   while (true) {
      st = i_common.search_prev_skip_space(env.tokens, st-1);
      if (st < 0) break;
      token = env.tokens[st];
      if (token.token !== '.') {
         st = p;
         break;
      }
      st = i_common.search_prev_skip_spacen(env.tokens, st-1);
      if (st < 0) return 0;
   }
   // TODO: modifiers, e.g. public, static, final
   token = env.tokens[name[0]];
   token.tag = i_common.TAG_FUNCTION;
   token.startIndex = st;
   // in interface: int a();
   //                      ^ not {
   token.endIndex = env.tokens[ed].endIndex || ed;
   token.name = name;
   token.parameter = parameter;
   if (annotation) token.annotation = annotation;
   if (!env.is_in_container) {
      env.is_in_container = [];
   }
   if (token.endIndex > ed) {
      env.is_in_container.push({
         container: false,
         endIndex: token.endIndex
      });
   }
   return 1;
}

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
   package_token.tag = tags.package;
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
   import_token.tag = tags.import;
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
   anno_token.tag = tags.annotation;
   if (next_token && next_token.token === '(') {
      anno_token.startIndex = st;
      anno_token.endIndex = next_token.endIndex;
   } else {
      anno_token.startIndex = st;
      anno_token.endIndex = type_position.endIndex;
   }
   ed = anno_token.endIndex;
   // find next { or ; and attach annotation info
   for (let i = ed+1; i < env.tokens.length; i++) {
      let token = env.tokens[i];
      if (token.token === '(') {
         i = token.endIndex - 1;
         continue;
      }
      if (token.token === '{') {
         if (!token.annotation) token.annotation = [];
         token.annotation.push([anno_token.startIndex, anno_token.endIndex]);
         break;
      }
   }
   return ed - st;
}

function parse(env) {
   env.cursor = 0;
   i_extractor.extract_tokens(env, java_extract_feature);
   i_extractor.merge_tokens(env, java_combinations);
   i_decorator.decorate_bracket(env);
   i_decorator.decorate_keywords(env, java_keywords);
   env.cursor = 0;
   i_decorator.decorate_scope(env, java_decorate_feature);
   return env.tokens;
}

const i_fs = require('fs');
let filename = process.argv[2];
let text = i_fs.readFileSync(filename).toString();
let tokens = parse({text: text});
console.log(JSON.stringify(tokens.map((x, i) => { x.id=i; return x; }), null, 3));
