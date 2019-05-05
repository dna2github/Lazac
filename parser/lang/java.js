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

const java_decorate_feature = {
   'package': [decorate_package],
   'import': [decorate_import],
   'class': [decorate_class],
   'interface': [decorate_interface],
   'enum': [decorate_enum],
   'new': [decorate_anonymous_class],
   '@': [decorate_annotation, /* @interface */decorate_annotation_definition],
   // '-': [/* -> */decorate_lambda_function],
   'public': [decorate_modifier],
   'private': [decorate_modifier],
   'protected': [decorate_modifier],
   'abstract': [decorate_modifier],
   'default': [decorate_modifier_default],
   'static': [decorate_modifier],
   'strictfp': [decorate_modifier],
   'final': [decorate_modifier],
   'native': [decorate_modifier],
   'synchorized': [decorate_modifier_synchorized],
   'transient': [decorate_modifier],
   'volatile': [decorate_modifier],
   '(': [decorate_function, clear_modifier_synchorized],
   '{': [decorate_block, clear_all_modifier],
   ':': [clear_modifier_default],
   '=': [decorate_field_with_init, clear_all_modifier],
   ';': [decorate_field, clear_all_modifier],
   ':ast:': null,
};
const java_decorate_executable_feature = {
   '{': [decorate_block],
   ';': [decorate_statement],
   'new': [decorate_anonymous_class, decorate_new],
};

function tokenize(env) {
   env.cursor = 0;
   i_extractor.extract_tokens(env, java_extract_feature);
   return env.tokens;
}

function ast() {
   let ast = java_decorate_feature[':ast:'];
   if (!ast) {
      ast = {};
      java_decorate_feature[':ast:'] = ast;
   }
   return ast;
}

function scan_tokens(env, startIndex, endIndex, tree, features) {
   for (let i = startIndex; i < endIndex; i++) {
      let x = env.tokens[i];
      let feature_fn = features[x.token];
      if (!feature_fn) continue;
      let r = 0;
      for (let j = 0, n = feature_fn.length; j < n; j++) {
         let fn = feature_fn[j];
         r = fn(env, i, tree);
         if (r > 0) break;
      }
      if (r > 0) i += r - 1;
   }
   return env;
}

function parse(env) {
   tokenize(env);
   i_decorator.decorate_bracket(env);
   env.state = {
      container: null,
      modifier: [],
   };
   let tree = ast();
   scan_tokens(env, 0, env.tokens.length, tree, java_decorate_feature);
   tree.tokens = env.tokens.map((x, i) => {x.id = i; return x;});
   return tree;
}

function decorate_package(env, st, tree) {
   // @A() package test.test.test;
   let name_st = i_common.search_next_skip_space(env.tokens, st+1);
   let ed = i_common.search_next(
      env.tokens, name_st, (x) => x.token !== ';' && x.token !== '\n'
   );
   let node = {};
   node.index = [st, ed],
   node.name = [name_st, ed];
   if (env.state.modifier.length) {
      node.modifier = env.state.modifier;
      node.index[0] = node.modifier[0].index[0];
      env.state.modifier = [];
   }
console.log('[package]', env.tokens.slice(node.index[0], node.index[1]).map((x) => x.token).join(''));
   tree.package = node;
   return ed - st + 1;
}

function decorate_import(env, st, tree) {
   let node = {};
   let name_st = i_common.search_next_skip_space(env.tokens, st+1);
   let x = env.tokens[name_st];
   if (x.token === 'static') {
      node.static = true;
      name_st = i_common.search_next_skip_space(env.tokens, name_st+1);
   }
   let ed = i_common.search_next(
      env.tokens, name_st, (x) => x.token !== ';' && x.token !== '\n'
   );
   node.index = [st, ed];
   node.name = [name_st, ed];
console.log('[import]', env.tokens.slice(node.index[0], node.index[1]).map((x) => x.token).join(''));
   if (!tree.import) tree.import = [];
   tree.import.push(node);
   return ed - st + 1;
}

function decorate_class(env, st, tree) {
   let lookback = i_common.search_prev_skip_spacen(env.tokens, st-1);
   let x = env.tokens[lookback];
   if (x && x.token === '.') {
      // skip xx.class
      return 0;
   }
   return decorate_type_definition(env, st, tree, 'class');
}

function decorate_interface(env, st, tree) {
   return decorate_type_definition(env, st, tree, 'interface');
}

function decorate_enum(env, st, tree) {
   return decorate_type_definition(env, st, tree, 'enum');
}

function decorate_annotation_definition(env, st, tree) {
   let x = env.tokens[st + 1];
   if (!x || x.token !== 'interface') {
      return 0;
   }
   return decorate_type_definition(env, st, tree, '@interface');
}

function decorate_type_definition(env, st, tree, type) {
   let node = {};
   let ed = st + 1;
   let header_ed = st;
   let x;
   for (let n = env.tokens.length; ed < n; ed++) {
      x = env.tokens[ed];
      if (x.token === '[' || x.token === '(') {
         ed = x.endIndex; - 1
         continue;
      }
      if (x.token === '{') {
         header_ed = ed;
         ed = x.endIndex;
         break;
      }
      if (x.token === ';') {
         header_ed = ed;
         ed ++;
         break;
      }
   }
   let name_st = i_common.search_next_skip_spacen(env.tokens, st+1);
   node.name = [name_st, name_st+1];
   node.index = [st, ed];
   node.header = [st, header_ed];
console.log(`[${type}]`, env.tokens.slice(node.header[0], node.header[1]).map((x) => x.token).join(''));
   node.body = [header_ed, ed];
   if (env.state.modifier.length) {
      node.modifier = env.state.modifier;
      node.index[0] = node.modifier[0].index[0];
      env.state.modifier = [];
   }
   if (!tree[type]) tree[type] = [];
   tree[type].push(node);
   if (ed - header_ed > 1) {
      scan_tokens(env, header_ed+1, ed, node, java_decorate_feature);
   }
   return ed - st;
}

function decorate_annotation(env, st, tree) {
   let node = {};
   let x = env.tokens[st + 1];
   if (!x || x.token === 'interface') {
      return 0;
   }
   let ed = i_common.search_next_skip_spacen(env.tokens, st+1);
   do {
      ed = i_common.search_next_skip_spacen(env.tokens, ed+1);
      x = env.tokens[ed];
      if (!x) return 0;
      if (x.token === '.') {
         ed = i_common.search_next_skip_spacen(env.tokens, ed+1);
         continue;
      }
      if (x.token === '(') {
         ed = x.endIndex;
         break;
      }
      ed = i_common.search_prev_skip_spacen(env.tokens, ed-1) + 1;
      break;
   } while (true);
   node.index = [st, ed];
   env.state.modifier.push(node);
   return ed - st;
}

function decorate_modifier(env, st, tree) {
   let node = { index: [st, st+1] };
   env.state.modifier.push(node);
   return 1;
}

function decorate_modifier_synchorized(env, st, tree) {
   return decorate_modifier(env, st, tree);
}

function decorate_modifier_default(env, st, tree) {
   return decorate_modifier(env, st, tree);
}

function clear_modifier_synchorized(env, st, tree) {
   return clear_modifier(env, st, tree, 'synchorized');
}

function clear_modifier_default(env, st, tree) {
   return clear_modifier(env, st, tree, 'default');
}

function clear_modifier(env, st, tree, keyword) {
   let m = env.state.modifier[env.state.modifier.length - 1];
   if (!m) return 0;
   let x = env.tokens[m.index[0]];
   if (x.token === keyword) {
      env.state.modifier.pop();
   }
   return 0;
}

function clear_all_modifier(env, st, tree) {
   if (env.state.modifier.length) {
      env.state.modifier = [];
   }
   return 0;
}

function decorate_anonymous_class(env, st, tree) {
   // new <T> @A @B() X.Test<String>() {}
   let node = {};
   let ed = st + 1;
   let header_ed = st;
   let x;
   let is_anonymous_class = false;
   for (let n = env.tokens.length; ed < n; ed++) {
      x = env.tokens[ed];
      if (x.token === '@') {
         ed += decorate_annotation(env, ed, node) - 1;
         continue;
      }
      if (x.token === '[') {
         ed = x.endIndex - 1;
         continue;
      }
      if (x.token === '(') {
         ed = x.endIndex - 1;
         let test = env.tokens[i_common.search_next_skip_spacen(env.tokens, ed+1)];
         if (test && test.token === '{') {
            is_anonymous_class = true;
         }
         continue;
      }
      if (x.token === '{') {
         header_ed = ed;
         ed = x.endIndex;
         break;
      }
      if (x.token === ';') {
         header_ed = ed;
         ed ++;
         break;
      }
   }
   if (!is_anonymous_class) {
      clear_all_modifier(env, st, node);
      return 0;
   }
   node.op_new = true;
   node.index = [st, ed];
   node.header = [st, header_ed];
   node.body = [header_ed, ed];
   if (env.state.modifier.length) {
      node.modifier = env.state.modifier;
      node.index[0] = node.modifier[0].index[0];
      node.header[0] = i_common.search_next_skip_spacen(
         env.tokens,
         node.modifier[node.modifier.length-1].index[1]
      );
      env.state.modifier = [];
   } else {
      node.index[0] = i_common.search_next_skip_spacen(env.tokens, st+1);
      node.header[0] = node.index[0];
   }
console.log('[new]', env.tokens.slice(node.header[0], node.header[1]).map((x) => x.token).join(''));
   let type = 'class';
   if (!tree[type]) tree[type] = [];
   tree[type].push(node);
   if (ed - header_ed > 1) {
      scan_tokens(env, header_ed+1, ed, node, java_decorate_feature);
   }
   return ed - st;
}

function decorate_function(env, st, tree) {
   // should not define a method inside a method
   if (tree.type === i_common.TAG_FUNCTION) {
      return 0;
   }
   // exclude keyword + "(", e.g.:
   // if, for, while, switch, try, catch, synchronized
   let x = env.tokens[st];
   let ed = x.endIndex;
   // function should follow like ( ... ) [throws ...] { ... }
   let body_st = i_common.search_next_skip_spacen(env.tokens, ed);
   let throws_sted = null;
   x = env.tokens[body_st];
   if (!x) return 0;
   if (x.token === 'throws') {
      throws_sted = [body_st, 0];
      body_st = i_common.search_next(
         env.tokens, body_st+1, (x) => x.token !== '{' && x.token !== ';'
      );
      throws_sted[1] = body_st - 1;
      // must be a method definition (in interface or method)
   } else {
      body_st = i_common.search_next(
         env.tokens, body_st, (x) => x.token !== '{' && x.token !== ';'
      );
      // not sure if it is method definition
   }
   x = env.tokens[body_st];
   if (!x) return 0;
   // skip method invokation like a = test();
   // skip method definition in interface like int test() throws Exception;
   let node = {};
   if (x.token === ';') {
      if (has_modifier_native(env)) {
         // keep native definition like public native void helloworld();
         body_st ++;
         ed = body_st + 1;
         node.native = true;
      } else {
         // keep declaration like public abstract int test();
         body_st ++;
         ed = body_st + 1;
         // clear_all_modifier(env, st, tree);
         // return 0;
      }
      node.declaration = true;
   } else {
      ed = x.endIndex;
   }
   let def_st = st;
   let header_st = st;
   if (env.state.modifier.length) {
      def_st = env.state.modifier[0].index[0];
      header_st = i_common.search_next_skip_spacen(
         env.tokens,
         env.state.modifier[env.state.modifier.length-1].index[1]
      );
      node.modifier = env.state.modifier;
      env.state.modifier = [];
   } else {
      // class T { void test() {} }
      // class T { public int a; void test() {} }
      // class T { enum test { A,B,C } void test2() {} }
      def_st = i_common.search_prev(
         env.tokens, st-1, (x) => x.token !== '{' && x.token !== '}' && x.token !== ';'
      );
      def_st = i_common.search_next_skip_spacen(env.tokens, def_st+1);
      header_st = def_st;
   }
   let name_st = i_common.search_prev_skip_spacen(env.tokens, st-1);
   node.type = i_common.TAG_FUNCTION;
   node.name = [name_st, name_st+1];
   node.index = [def_st, ed];
   node.header = [header_st, body_st-1];
console.log('[function]', env.tokens.slice(node.header[0], node.header[1]).map((x) => x.token).join(''));
   if (throws_sted) node.throws = throws_sted;
   node.body = [body_st, ed];
   let type = 'method';
   if (!tree[type]) tree[type] = [];
   tree[type].push(node);
   // remove node.type after parse inside the method
   scan_tokens(env, body_st+1, node.index[1]-1, node, java_decorate_executable_feature);
   delete node.type;
   return ed - st;
}

function decorate_block(env, st, tree) {
   // static { System.load("test.so"); }
   // if (...) { ... }
   // { ... }
   // sychronized { ... }
   let x = env.tokens[st];
   let ed = x.endIndex;
   let block = {};
   block.index = [st, ed];
   block.body = [st, ed];
   let pr = i_common.search_prev_skip_spacen(env.tokens, st-1);
   x = env.tokens[pr];
   if (x) {
      if (x.token === ')') {
         pr = i_common.search_prev(env.tokens, pr-1, (x) => x.endIndex === pr-1);
         x = env.tokens[pr];
         block.condition = [x.startIndex, x.endIndex];
         pr = i_common.search_prev_skip_spacen(env.tokens, pr-1);
         block.type = x.token;
         x = env.tokens[pr];
         if (x.token === 'if') {
            let pr0 = i_common.search_prev_skip_spacen(env.tokens, pr-1);
            x = env.tokens[pr0];
            if (x && x.token === 'else') {
               pr = pr0;
               block.type = 'else if';
            }
         }
      } else if (x.token === 'try') {
         block.type = 'try';
      } else if (x.token === 'catch') {
         block.type = 'catch';
      } else if (x.token === 'finally') {
         block.type = 'finally';
      } else if (x.token === 'sychronized') {
         block.type = 'sychronized';
      } else {
         block.type = 'block';
      }
      block.index[0] = pr;
   } else {
      block.type = 'block';
   }
   if (env.state.modifier.length) {
      block.modifier = env.state.modifier;
      env.state.modifier = [];
   }
   scan_tokens(env, st+1, ed-1, block, java_decorate_executable_feature);
   if (!tree.executable) tree.executable = [];
   tree.executable.push(block);
   return ed - st;
}

function decorate_statement(env, st, tree) {
   let ed = st--;
   for(; st >= 0; st --) {
      let x = env.tokens[st];
      if (x.token === ';' || x.token === '{' || x.token === '}') {
         st = i_common.search_next_skip_spacen(env.tokens, st+1);
         break;
      }
      if (x.token === ')' || x.token === ']') {
         st = i_common.search_prev(env.tokens, st-1, (x) => x.endIndex === st+1);
         continue;
      }
   }
   let node = {};
   node.index = [st, ed+1];
console.log('[statement] ===>', env.tokens.slice(node.index[0], node.index[1]).map((x) => x.token).join(''));
   if (!tree.executable) tree.executable = [];
   tree.executable.push(node);
   return 1;
}

function scan_function_invocation(env, st, ed, tree) {
}

function decorate_new(env, st, tree) {}

function has_modifier_native(env) {
   let has = env.state.modifier.filter((z) => {
      if (z.index[1] - z.index[0] !== 1) return false;
      let x = env.tokens[z.index[0]];
      if (!x) return false;
      if (x.token === 'native') return true;
      return false;
   })[0];
   return !!has;
}

function decorate_field(env, st, tree) {
   // {  }  ;
   let ed = st--;
   for(; st >= 0; st --) {
      let x = env.tokens[st];
      if (x.token === ';' || x.token === '{' || x.token === '}') {
         st = i_common.search_next_skip_spacen(env.tokens, st+1);
         break;
      }
      if (x.token === ')' || x.token === ']') {
         st = i_common.search_prev(env.tokens, st-1, (x) => x.endIndex === st+1);
         continue;
      }
   }
   let node = {};
   node.index = [st, ed+1];
console.log('[field]', env.tokens.slice(node.index[0], node.index[1]).map((x) => x.token).join(''));
   if (env.state.modifier.length) {
      node.modifier = env.state.modifier;
      env.state.modifier = [];
   }
   if (!tree.field) tree.field = [];
   tree.field.push(node);
   return 1;
}

function decorate_field_with_init(env, st, tree) {
   let assign_st = st;
   let ed = st--;
   for(; st >= 0; st --) {
      let x = env.tokens[st];
      if (x.token === ';' || x.token === '{' || x.token === '}') {
         st = i_common.search_next_skip_spacen(env.tokens, st+1);
         break;
      }
      if (x.token === ')' || x.token === ']') {
         st = i_common.search_prev(env.tokens, st-1, (x) => x.endIndex === st+1);
         continue;
      }
   }
   for (let n = env.tokens.length; ed < n; ed ++) {
      let x = env.tokens[ed];
      if (x.token === ';') {
         ed ++;
         break;
      }
      if (x.token === '(' || x.token === '[' || x.token === '{') {
         ed = x.endIndex - 1;
         continue;
      }
   }
   // cover e.g. int a; int a, b; int a = 0, b = 1; int a, b = 1; ...
   let node = {};
   node.index = [st, ed];
console.log('[field]', env.tokens.slice(node.index[0], node.index[1]).map((x) => x.token).join(''));
   if (env.state.modifier.length) {
      node.modifier = env.state.modifier;
      env.state.modifier = [];
   }
   if (!tree.field) tree.field = [];
   tree.field.push(node);
   return ed - assign_st;
}

module.exports = {
   tokenize: (text) => tokenize({ text }),
   parse: (text) => parse({ text }),
};