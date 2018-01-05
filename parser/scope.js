const utils = require('../utils');
const fsm = require('./fsm');

const SEARCH_GENERICS = { key: 'token', left: '<', right: '>' };
const SEARCH_ATTRIBUTE = { key: 'token', left: '[', right: ']' };
const SEARCH_BLOCK = { key: 'token', left: '{', right: '}' };
const SEARCH_PARAM = { key: 'token', left: '(', right: ')' };

const TYPE_RUBY = { module: 'namespace', class: 'class', def: 'function' };
const TYPE_PYTHON = { class: 'class', def: 'function' };
const TYPE_GO = { struct: 'class', interface: 'class', func: 'function' };
const TYPE_JAVASCRIPT = { class: 'class', function: 'function' };
const TYPE_JAVA = { class: 'class', interface: 'class', function: 'function' };
const TYPE_CSHARP = { namespace: 'namespace', class: 'class', function: 'function' };
const TYPE_C = { namespace: 'namespace', class: 'class', struct: 'class', function: 'function' };

function clear_bracket_attr(x) {
   delete x.startIndex;
   delete x.endIndex;
   delete x.bracketDeepth;
}

function skip_next_comment(input, index, search_options) {
   while (input[index] && input[index].tag === utils.TAG_COMMENT) {
      index = utils.search_next(input, index+1, search_options);
   }
   return index;
}

function skip_prev_comment(input, index, search_options) {
   while (input[index] && input[index].tag === utils.TAG_COMMENT) {
      index = utils.search_prev(input, index-1, search_options);
   }
   return index;
}

function match_modifier_prev(array, index, modifiers) {
   let p = index, q = index;
   let once = [];
   p = utils.search_prev(array, p-1, utils.SEARCH_SKIPSPACEN);
   p = skip_prev_comment(array, p, utils.SEARCH_SKIPSPACEN);
   while (p >= 0 && utils.contains(modifiers, array[p].token)) {
      if (once.indexOf(array[p].token) >= 0) break;
      once.push(array[p].token);
      q = p;
      p = utils.search_prev(array, p-1, utils.SEARCH_SKIPSPACEN);
      p = skip_prev_comment(array, p, utils.SEARCH_SKIPSPACEN);
   }
   return q;
}

class RubyScope extends fsm.Feature {
   constructor () {
      // after SymbolTokenizer
      super();
      this.env.block_stack = [];
      this.env.last_non_space = null;

      let origin_state = new fsm.State(new fsm.Condition(
         0, (output, x, env) => {
            utils.act_push_origin(output, x);
            switch (x.token) {
            case 'if':
            case 'until':
            case 'unless':
               if (!utils.contains([
                  null, '\n', '(', '{', '<', '>', '+', '-', '!', '&', '|', '^', '='
               ], env.last_non_space)) {
                  break;
               }
            case 'while':
            case 'for':
            case 'case':
            case 'begin':
            case 'do':
               x.startIndex = env.input_i;
               env.block_stack.push(x);
               break;
            case 'end':
               if (!utils.contains([' ', '\n', '\t', ';'], utils.prev(env.input, env.input_i, 'token'))) {
                  break;
               }
               let block = env.block_stack.pop();
               block.endIndex = env.input_i;
               break;
            }
            if (x.token === '\n') {
               if (utils.prev(env.input, env.input_i, 'token') !== '\\') {
                  env.last_non_space = x.token;
               }
            } else if (!utils.contains([' ', '\t'], x.token)) {
               env.last_non_space = x.token;
            }
            return true;
         }, utils.always
      ));
      let function_scope_state = new fsm.State(
         new fsm.Condition(0, utils.act_push_origin, utils.always)
      );
      origin_state.register_condition(new fsm.Condition(
         5, utils.act_push_origin, (x, env) => {
            if (utils.contains(['module', 'class', 'def'], x.token)) {
               if (env.last_non_space === '.') {
                  env.last_non_space = x.token;
                  return false;
               }
               env.block_stack.push(x);
               x.startIndex = env.input_i;
               x.type = TYPE_RUBY[x.token];
               return true;
            }
            return false;
         }, function_scope_state
      ));
      function_scope_state.register_condition(new fsm.Condition(
         5, utils.act_push_origin, (x, env) => {
            let last = utils.last(env.block_stack);
            if (!last.name && utils.contains([' ', '\t', '\n', '('], x.token)) return false;
            if (utils.contains([' ', '\t', '\n', '(', ';'], x.token)) {
               return true;
            }
            last.name = (last.name || '') + x.token;
            if (last.name == '<<') last.name = ''; // e.g. class << self
            return false;
         }, origin_state
      ));
      this.register_state('origin', origin_state);
      this.register_state('function_scope', function_scope_state);
      this.set_entry('origin');
   }
}

class PythonLambdaScope extends fsm.Feature {
   constructor() {
      // after SymbolTokenizer
      super();
      this.env.lambda_stack = [];
      this.env.bracket_stack = [];
      let origin_state = new fsm.State(new fsm.Condition(
         0, utils.act_push_origin, utils.always
      ));
      origin_state.register_condition(new fsm.Condition(
         5, (output, x, env) => {
            utils.act_push_origin(output, x);
            env.lambda_stack.push(x);
            x.name = '-';
            x.type = TYPE_PYTHON.def;
            x.startIndex = output.length-1;
            x.bracketDeepth = env.bracket_stack.length;
         }, (x, env) => x.token === 'lambda', origin_state
      ));
      origin_state.register_condition(new fsm.Condition(
         5, utils.act_push_origin, (x, env) => {
            if (!utils.contains(['(', '{', '['], x.token)) return false;
            switch(x.token) {
            case '(': env.bracket_stack.push(')'); break;
            case '{': env.bracket_stack.push('}'); break;
            case '[': env.bracket_stack.push(']'); break;
            }
            return true;
         }, origin_state
      ));
      origin_state.register_condition(new fsm.Condition(
         5, (output, x, env) => {
            utils.act_push_origin(output, x);
            env.bracket_stack.pop();
            let lambda = utils.last(env.lambda_stack);
            while (lambda && lambda.bracketDeepth > env.bracket_stack.length) {
               lambda = env.lambda_stack.pop();
               delete lambda.bracketDeepth;
               delete lambda.colon;
               lambda.endIndex = output.length-2;
               lambda = utils.last(env.lambda_stack);
            }
         }, (x, env) => {
            return x.token === utils.last(env.bracket_stack);
         }, origin_state
      ));
      origin_state.register_condition(new fsm.Condition(
         5, utils.act_push_origin, (x, env) => {
            if (!env.lambda_stack.length) return false;
            if (x.token !== ':') return false;
            utils.last(env.lambda_stack).colon = true;
            return true;
         }, origin_state
      ));
      origin_state.register_condition(new fsm.Condition(
         5, (output, x, env) => {
            utils.act_push_origin(output, x);
            let lambda = env.lambda_stack.pop();
            delete lambda.bracketDeepth;
            delete lambda.colon;
            lambda.endIndex = output.length-2;
         }, (x, env) => {
            if (!utils.last(env.lambda_stack, 'colon')) return false;
            if (env.bracket_stack.length > utils.last(env.lambda_stack, 'bracketDeepth')) return false;
            if (!utils.contains([',', '\n', ';'], x.token)) return false;
            return true;
         }, origin_state
      ));
      this.register_state('origin', origin_state);
      this.set_entry('origin');
   }
}

class PythonScope extends fsm.Feature {
   constructor () {
      // after PythonLambdaScope
      super();
      this.env.block_stack = [];
      this.env.bracket_stack = [];
      this.env.line_start = true;
      this.env.indent_size = 0;
      this.env.annotation_start = null;
      this.env.named_block = null;
      let origin_state = new fsm.State(new fsm.Condition(
         0, (output, x, env) => {
            utils.act_push_origin(output, x);
            if (env.line_start) {
               env.line_start = false;
               if (x.tag === utils.TAG_STRING && utils.next(env.input, env.input_i, 'token') === '\n') {
                  x.tag = utils.TAG_COMMENT;
               }
               if (x.tag === utils.TAG_COMMENT || x.token === '\n') {
               } else if (env.indent_size <= utils.last(env.block_stack, 'indentSize')) {
                  let indent_size = utils.last(env.block_stack, 'indentSize') || 0;
                  while (env.indent_size < indent_size) {
                     let block = env.block_stack.pop();
                     block.endIndex = output.length-2;
                     indent_size = utils.last(env.block_stack, 'indentSize');
                  }
                  if (
                     env.indent_size === indent_size &&
                     env.block_stack.length > 0 &&
                     !utils.contains(['elif', 'else', 'except', 'finally'], x.token)
                  ) {
                     let block = env.block_stack.pop();
                     block.endIndex = output.length-2;
                  }
               }
               if (utils.contains([
                  'class', 'def', 'while', 'with', 'for', 'try', 'if'
               ], x.token)) {
                  if (utils.contains(['class', 'def'], x.token)) {
                     env.named_block = x;
                     x.name = '';
                     x.type = TYPE_PYTHON[x.token]
                  }
                  env.block_stack.push(x);
                  x.indentSize = env.indent_size;
                  // startIndex is in token `def` always
                  if (env.annotation_start !== null) {
                     x.startIndex = env.annotation_start;
                     env.annotation_start = null;
                  } else {
                     x.startIndex = output.length-1;
                  }
                  if (utils.prev(output, x.startIndex, 'tag') === utils.TAG_INDENT) {
                     x.startIndex --;
                  }
               }
               env.indent_size = 0;
            } else if (env.named_block) {
               if (utils.contains([' ', '\t'], x.token)) {
               } else {
                  env.named_block.name += x.token;
                  if (utils.contains(
                     [' ', '\t', '(', ':'], utils.next(env.input, env.input_i, 'token'))
                  ) {
                     env.named_block = null;
                  }
               }
            }
            if (x.token === '\n') {
               env.line_start = true;
            }
            if (env.input_i >= env.input.length-1) {
               while(env.block_stack.length) {
                  let block = env.block_stack.pop();
                  block.endIndex = output.length-1;
               }
            }
         }, utils.always
      ));
      let indent_state = new fsm.State(new fsm.Condition(
         0, (output, x, env) => {
            utils.act_concat(output, x);
            env.indent_size += x.token==='\t'?8:1;
         }, utils.always
      ));
      origin_state.register_condition(new fsm.Condition(
         5, (output, x, env) => {
            env.indent_size = x.token==='\t'?8:1;
            output.push({
               token: x.token,
               tag: utils.TAG_INDENT
            });
         }, (x, env) => {
            return (env.line_start && utils.contains([' ', '\t'], x.token));
         }, indent_state
      ));
      indent_state.register_condition(new fsm.Condition(
         5, (output, x, env) => {
            utils.act_concat(output, x);
            env.indent_size += x.token==='\t'?8:1;
            if (env.input_i >= env.input.length-1) {
               while(env.block_stack.length) {
                  let block = env.block_stack.pop();
                  block.endIndex = output.length-1;
               }
            }
         }, (x, env) => {
            return !utils.contains([' ', '\t'], utils.next(env.input, env.input_i, 'token'));
         }, origin_state
      ));

      let annotation_state = new fsm.State(new fsm.Condition(
         0, utils.act_push_origin, utils.always
      ));
      origin_state.register_condition(new fsm.Condition(
         5, (output, x, env) => {
            utils.act_push_origin(output, x);
            if (env.annotation_start === null) {
               env.annotation_start = output.length-1;
            }
         }, (x, env) => x.token === '@', annotation_state
      ));
      annotation_state.register_condition(new fsm.Condition(
         5, utils.act_push_origin, (x, env) => x.token === '\n', origin_state
      ));

      let bracket_state = new fsm.State(new fsm.Condition(
         0, utils.act_push_origin, utils.always
      ));
      origin_state.register_condition(new fsm.Condition(
         5, (output, x, env) => {
            utils.act_push_origin(output, x);
            switch (x.token) {
            case '(': env.bracket_stack.push(')'); break;
            case '[': env.bracket_stack.push(']'); break;
            case '{': env.bracket_stack.push('}'); break;
            }
         }, (x, env) => utils.contains(['(', '[', '{'], x.token), bracket_state
      ));
      bracket_state.register_condition(new fsm.Condition(
         5, utils.act_push_origin, (x, env) => {
            if (utils.contains(['(', '[', '{'], x.token)) {
               switch (x.token) {
               case '(': env.bracket_stack.push(')'); break;
               case '[': env.bracket_stack.push(']'); break;
               case '{': env.bracket_stack.push('}'); break;
               }
               return true;
            }
            return false;
         }, bracket_state
      ));
      bracket_state.register_condition(new fsm.Condition(
         5, utils.act_push_origin, (x, env) => {
            if (utils.last(env.bracket_stack) === x.token) {
               env.bracket_stack.pop();
            }
            return env.bracket_stack.length === 0;
         }, origin_state
      ));

      let annotation_bracket_state = new fsm.State(new fsm.Condition(
         0, utils.act_push_origin, utils.always
      ));
      // deal with         @annotation(
      // multiple line         "hello", "world")
      annotation_state.register_condition(new fsm.Condition(
         5, (output, x, env) => {
            utils.act_push_origin(output, x);
            env.bracket_stack.push(')');
         }, (x, env) => x.token === '(', annotation_bracket_state
      ));
      annotation_bracket_state.register_condition(new fsm.Condition(
         5, utils.act_push_origin, (x, env) => {
            if (x.token === '(') {
               env.bracket_stack.push(')');
               return true;
            }
            return false;
         }, annotation_bracket_state
      ));
      annotation_bracket_state.register_condition(new fsm.Condition(
         5, utils.act_push_origin, (x, env) => {
            if (utils.last(env.bracket_stack) === x.token) {
               env.bracket_stack.pop();
            }
            return env.bracket_stack.length === 0;
         }, annotation_state
      ));

      this.register_state('origin', origin_state);
      this.register_state('indent', indent_state);
      this.register_state('annotation', annotation_state);
      this.register_state('annotation_bracket', annotation_bracket_state);
      this.register_state('bracket', bracket_state);
      this.set_entry('origin');
   }
}


class GoScope extends fsm.Feature {
   constructor() {
      // after BracketScope
      super();
      let origin_state = new fsm.State(new fsm.Condition(
         0, utils.act_push_origin, utils.always
      ));
      // if ... else if ... else ..., for, switch, select
      origin_state.register_condition(new fsm.Condition(
         5, (output, x, env) => {
            utils.act_push_origin(output, x);
            let p, q;
            p = utils.search_next(env.input, env.input_i, utils.SEARCH_SKIPSPACEN);
            if (p >= 0 && env.input[p].token === 'if') {
               // else if
               env.input[p].parent = x.parent;
               delete x.parent;
            }
            p = utils.search_next(env.input, env.input_i, { key:'token', stop:['{'] });
            q = env.input[p];
            p = q.endIndex;
            clear_bracket_attr(q);
            q = utils.search_next(env.input, p, utils.SEARCH_SKIPSPACEN);
            if (x.parent) {
               x.parent.endIndex = p;
               delete x.parent;
            } else {
               x.startIndex = env.input_i;
               x.endIndex = p;
console.log(x.token, '-->', env.input_i, JSON.stringify(env.input.slice(x.startIndex, x.endIndex+1).map((z) => z.token).join('')));
            }
         }, (x, env) => utils.contains([
            'if', 'else', 'for', 'switch', 'select'
         ], x.token), origin_state
      ));

      // interface, struct
      origin_state.register_condition(new fsm.Condition(
         5, (output, x ,env) => {
            utils.act_push_origin(output, x);
            let p, q, st, ed, name;
            p = detect_type_arr_n_ptr_prev(env.input, env.input_i);
            q = env.input[p];
            if (q && q.token === '(') {
               st = p+1;
               name = '-';
            } else {
               q = p;
               p = utils.search_prev(env.input, p-1, utils.SEARCH_SKIPSPACE);
               p = skip_prev_comment(env.input, p, utils.SEARCH_SKIPSPACE);
               // type A interface {}
               // type (\n A interface{}; B interface{} )\n
               if (p >= 0 && utils.contains(['type', '\n', '\r', ';'], env.input[p].token)) {
                  name = env.input[q].token;
                  st = p;
               } else {
                  name = '-';
                  st = env.input_i;
               }
            }
            p = utils.search_next(env.input, env.input_i+1, utils.SEARCH_SKIPSPACE);
            p = skip_next_comment(env.input, p, utils.SEARCH_SKIPSPACE);
            // env.input[p] should be '{'
            ed = utils.search_pair_next(env.input, p, SEARCH_BLOCK);
            q = env.input[st];
            q.startIndex = st;
            q.endIndex = ed;
            q.name = name;
            q.type = TYPE_GO[x.token];
console.log(x.token, q.name, '-->', JSON.stringify(env.input.slice(q.startIndex, q.endIndex+1).map((z) => z.token).join('')));
         }, (x, env) => utils.contains(['struct', 'interface'], x.token), origin_state
      ));

      // func
      origin_state.register_condition(new fsm.Condition(
         5, (output, x, env) => {
            utils.act_push_origin(output, x);
            let p, q, st, ed, name;
            p = utils.search_prev(env.input, env.input_i-1, utils.SEARCH_SKIPSPACE);
            p = skip_prev_comment(env.input, p, utils.SEARCH_SKIPSPACE);
            q = env.input[p];
            if (!q || utils.contains(['\n', '\r', ';', '[', ':', ','], q.token)) {
               // { test: func main() {...} }
               // [ func main() {...}, func main2() {...} ]
               // func main() { ... }
               st = env.input_i;
               p = utils.search_next(env.input, st+1, utils.SEARCH_SKIPSPACE);
               p = skip_next_comment(env.input, p, utils.SEARCH_SKIPSPACE);
               if (p >= 0 && env.input[p].token === '(') {
                  p = utils.search_pair_next(env.input, p, SEARCH_PARAM);
                  p = utils.search_next(env.input, p+1, utils.SEARCH_SKIPSPACE);
                  p = skip_next_comment(env.input, p, utils.SEARCH_SKIPSPACE);
               }
               name = env.input[p].token;
               q = p;
               p = utils.search_next(env.input, p+1, { key:'token', stop:['{'] });
               if (p < 0) {
                  ed = q;
               } else {
                  ed = utils.search_pair_next(env.input, p, SEARCH_BLOCK);
               }
            } else if (q.token === ')') {
               //             v
               // func test() func () { ... }
               return;
            } else if (utils.contains(['return'], q.token)) {
               st = env.input_i;
               name = '-';
               p = utils.search_next(env.input, p+1, { key:'token', stop:['{'] });
               ed = utils.search_pair_next(env.input, p, SEARCH_BLOCK);
            } else {
               // func test(x,y func() int) func(func() int) int { return func(x func() int) int { return 0; } }
               // (func (x int) {})(0)
               // func test() (func () int, int) { ... }
               p = utils.search_prev(env.input, env.input_i-1, utils.SEARCH_SKIPSPACE);
               p = skip_prev_comment(env.input, p, utils.SEARCH_SKIPSPACE);
               q = utils.search_prev(env.input, p-1, utils.SEARCH_SKIPSPACE);
               q = skip_prev_comment(env.input, q, utils.SEARCH_SKIPSPACE);
               if (env.input[q].token === 'type') {
                  //   v
                  // type A func () int;
                  return;
               } else if (env.input[p].token === '(' && utils.contains(['func', ')'], env.input[q].token)) {
                  //                               v
                  // func test(x,y func() int) func(func() int) int { return func(x func() int) int { return 0; } }
                  // v
                  // (func (x int) {})(0)
                  return;
               } else if (utils.contains(['(', ','], env.input[q].token)) {
                  //            v                                                v
                  // func test(x,y func() int) func(func() int) int { return func(x func() int) int { return 0; } }
                  return;
               } else {
                  st = env.input_i;
                  name = '-';
                  p = utils.search_next(env.input, p+1, { key:'token', stop:['{'] });
                  //                                        v func does not have { ... }
                  // type Test struct { process func() error }
                  if (p < 0) return;
                  ed = utils.search_pair_next(env.input, p, SEARCH_BLOCK);
               }
            }
            q = env.input[st];
            q.startIndex = st;
            q.endIndex = ed;
            q.name = name;
            q.type = TYPE_GO.func;
console.log('**', x.token, q.name, '-->', JSON.stringify(env.input.slice(q.startIndex, q.endIndex+1).map((z) => z.token).join('')));
         }, (x, env) => x.token === 'func', origin_state
      ));
      // interface function declare
      origin_state.register_condition(new fsm.Condition(
         5, (output, x, env) => {
            utils.act_push_origin(output, x);
            let p, q, name, st, ed;
            q = utils.search_prev(env.input, env.input_i-1, utils.SEARCH_SKIPSPACE);
            q = skip_prev_comment(env.input, q, utils.SEARCH_SKIPSPACE);
            if (p < 0) return;
            p = utils.search_prev(env.input, q-1, utils.SEARCH_SKIPSPACE);
            p = skip_prev_comment(env.input, p, utils.SEARCH_SKIPSPACE);
            if (!utils.contains(['\n', ';', '\r'], env.input[p])) return;
            name = env.input[q].token;
            st = p;
            p = utils.search_next(env.input, env.input_i+1, { key:'token', stop:[';', '\n', '\r'] });
            if (p < 0) return;
            if (env.input[p].token === ';') {
               ed = p;
            } else {
               ed = p - 1;
            }
            q = env.input[st];
            q.startIndex = st;
            q.endIndex = ed;
            q.name = name;
console.log('|>', x.token, q.name, '-->', JSON.stringify(env.input.slice(q.startIndex, q.endIndex+1).map((z) => z.token).join('')));
         }, (x, env) => x.token === '(', origin_state
      ));

      this.register_state('origin', origin_state);
      this.set_entry('origin');

      function detect_end_of_statement(input, index, env) {
         // block should use { ... }
         return index-1;
      }

      function detect_type_arr_n_ptr_prev(input, index) {
         index--;
         while (index > 0) {
            if (input[index].tag === utils.TAG_COMMENT) {
               index--;
               continue;
            }
            if (utils.contains([' ', '\t', '\r', '\n', '[', ']', '*'], input[index].token)) {
               index--;
               continue;
            }
            return index;
         }
         return index;
      }
   }
}

class BracketScope extends fsm.Feature {
   constructor(pairs) {
      // after SymbolTokenizer
      super();
      pairs = pairs || {'(': ')', '{': '}'};
      this.env.starter = Object.keys(pairs);
      this.env.ender = Object.keys(pairs).map((x) => pairs[x]);
      this.env.block_stack = [];
      let origin_state = new fsm.State(new fsm.Condition(
         0, utils.act_push_origin, utils.always
      ));
      origin_state.register_condition(new fsm.Condition(
         5, (output, x, env) => {
            utils.act_push_origin(output, x);
            env.block_stack.push(x);
            x.startIndex = env.input_i;
            x.bracketDeepth = env.block_stack.length;
//console.log(x.token, x.bracketDeepth, env.input_i, JSON.stringify(env.input.slice(env.input_i-10, env.input_i).map(z => z.token)));
         }, (x, env) => {
            return utils.contains(env.starter, x.token);
         }, origin_state
      ));
      origin_state.register_condition(new fsm.Condition(
         5, (output, x, env) => {
            utils.act_push_origin(output, x);
            let block = env.block_stack.pop();
            block.endIndex = env.input_i;
//console.log(x.token, x.bracketDeepth, env.input_i, JSON.stringify(env.input.slice(env.input_i-10, env.input_i).map(z => z.token)));
         }, (x, env) => {
            return utils.contains(env.ender, x.token)
         }, origin_state
      ));
      this.register_state('origin', origin_state);
      this.set_entry('origin');
   }
}

class CLikeScope extends fsm.Feature {
   constructor(detect_end_of_statement) {
      super();
      let origin_state = new fsm.State(new fsm.Condition(
         0, utils.act_push_origin, utils.always
      ));
      origin_state.register_condition(new fsm.Condition(
         5, (output, x, env) => {
            utils.act_push_origin(output, x);
            let p = env.input_i+1, q;
            x.startIndex = env.input_i;
            p = utils.search_next(env.input, p, { key: 'token', stop: ['('] });
            q = env.input[p].endIndex;
            p = q+1;
            p = utils.search_next(env.input, p, utils.SEARCH_SKIPSPACEN);
            p = skip_next_comment(env.input, p, utils.SEARCH_SKIPSPACEN);
            if (p >= 0 && env.input[p].token === '{') {
               x.endIndex = env.input[p].endIndex;
               clear_bracket_attr(env.input[p]);
            } else {
               q = detect_end_of_statement(env.input, p, env);
               x.endIndex = q;
            }
            q = utils.search_next(env.input, x.endIndex+1, utils.SEARCH_SKIPSPACEN);
            q = skip_next_comment(env.input, q, utils.SEARCH_SKIPSPACEN);
            if (q >= 0 && utils.contains(['else', 'finally'], env.input[q].token)) {
               env.input[q].parent = x.parent || x;
            }
            if (x.parent) {
               x.parent.endIndex = x.endIndex;
               delete x.parent;
               clear_bracket_attr(x);
            }
         }, (x, env) => utils.contains(['if', 'switch', 'while', 'for', 'catch'], x.token), origin_state
      ));
      origin_state.register_condition(new fsm.Condition(
         5, (output, x, env) => {
            utils.act_push_origin(output, x);
            let p = env.input_i+1, q;
            p = utils.search_next(env.input, p, utils.SEARCH_SKIPSPACEN);
            p = skip_next_comment(env.input, p, utils.SEARCH_SKIPSPACEN);
            if (p >= 0 && env.input[p].token === '{') {
               x.endIndex = env.input[p].endIndex;
               clear_bracket_attr(env.input[p]);
            } else {
               q = detect_end_of_statement(env.input, p, env);
               x.endIndex = q;
            }
            q = utils.search_next(env.input, x.endIndex+1, utils.SEARCH_SKIPSPACEN);
            q = skip_next_comment(env.input, q, utils.SEARCH_SKIPSPACEN);
            if (q >= 0 && utils.contains(['while', 'catch'], env.input[q].token)) {
               env.input[q].parent = x;
            }
         }, (x, env) => utils.contains(['do', 'try'], x.token), origin_state
      ));
      origin_state.register_condition(new fsm.Condition(
         5, (output, x, env) => {
            utils.act_push_origin(output, x);
            let p = env.input_i+1, q;
            p = utils.search_next(env.input, p, utils.SEARCH_SKIPSPACEN);
            p = skip_next_comment(env.input, p, utils.SEARCH_SKIPSPACEN);
            if (p >= 0 && env.input[p].token === '{') {
               x.parent.endIndex = env.input[p].endIndex;
               clear_bracket_attr(env.input[p]);
            } else if (p >= 0 && env.input[p].token === 'if') {
               // else if
               env.input[p].parent = x.parent;
            } else {
               q = detect_end_of_statement(env.input, p, env);
               x.parent.endIndex = q;
            }
            delete x.parent;
         }, (x, env) => !!x.parent, origin_state
      ));
      this.register_state('origin', origin_state);
      this.set_entry('origin');
   }
}

class JavaScriptScope extends CLikeScope {
   constructor() {
      // after BracketScope
      super(detect_end_of_statement);
      let origin_state = this.state.origin;

      // class
      origin_state.register_condition(new fsm.Condition(
         5, (output, x, env) => {
            utils.act_push_origin(output, x);
            let p, q;
            p = env.input_i-1;
            p = utils.search_prev(env.input, p, utils.SEARCH_SKIPSPACEN);
            p = skip_prev_comment(env.input, p, utils.SEARCH_SKIPSPACEN);
            // a.class = 1;
            if (p < env.input.length && env.input[p].token === '.') {
               return;
            }
            p = env.input_i+1;
            p = utils.search_next(env.input, p, utils.SEARCH_SKIPSPACEN);
            p = skip_next_comment(env.input, p, utils.SEARCH_SKIPSPACEN);
            // a = {class: 'type'}
            if (p < env.input.length && env.input[p].token === ':') {
               return;
            }
            x.name = env.input[p].token;
            p = utils.search_next(env.input, p+1, { key: 'token', stop: ['{'] });
            x.startIndex = env.input_i;
            x.endIndex = env.input[p].endIndex;
            x.type = TYPE_JAVASCRIPT.class;
            clear_bracket_attr(env.input[p]);
         }, (x, env) => x.token === 'class', origin_state
      ));
      // function
      origin_state.register_condition(new fsm.Condition(
         5, (output, x, env) => {
            utils.act_push_origin(output, x);
            let p, q;
            // a.function = 1;
            if (p < env.input.length && env.input[p].token === '.') {
               return;
            }
            p = env.input_i+1;
            p = utils.search_next(env.input, p, utils.SEARCH_SKIPSPACEN);
            p = skip_next_comment(env.input, p, utils.SEARCH_SKIPSPACEN);
            // a = {function:'type'};
            if (p < env.input.length && env.input[p].token === ':') {
               return;
            }
            if (env.input[p].token === '*') {
               // generator, e.g. function* iter() { yeild 1; }
               p = utils.search_next(env.input, p, utils.SEARCH_SKIPSPACEN);
               p = skip_next_comment(env.input, p, utils.SEARCH_SKIPSPACEN);
            }
            if (env.input[p].token !== '(') {
               // e.g. function hello, function $query
               q = utils.search_next(env.input, p+1, { key: 'token', stop: ['('] });
               x.name = env.input.slice(p+1, q).map((x) => x.token).join('').trim() || '-';
               p = q;
            }
            // now env.input[p] should be '('
            q = env.input[p].endIndex;
            clear_bracket_attr(env.input[p]);
            p = utils.search_next(env.input, q+1, { key: 'token', stop: ['{'] });
            x.startIndex = env.input_i;
            x.endIndex = env.input[p].endIndex;
            x.type = TYPE_JAVASCRIPT.function;
            clear_bracket_attr(env.input[p]);
         }, (x, env) => x.token === 'function', origin_state
      ));
      // lambda, class function
      origin_state.register_condition(new fsm.Condition(
         5, (output, x, env) => {
            utils.act_push_origin(output, x);
            let p = x.endIndex+1, q;
            p = utils.search_next(env.input, p, utils.SEARCH_SKIPSPACEN);
            p = skip_next_comment(env.input, p, utils.SEARCH_SKIPSPACEN);
            // standalone bracket or function call
            if (p < 0) {
               clear_bracket_attr(x);
               return;
            }
            if (p < env.input.length-1 && env.input[p].token === '=' && env.input[p+1].token === '>') {
               // lambda
               p = utils.search_next(env.input, p+2, utils.SEARCH_SKIPSPACEN);
               p = skip_next_comment(env.input, p, utils.SEARCH_SKIPSPACEN);
               if (p >= 0 && env.input[p].token === '{') {
                  x.endIndex = env.input[p].endIndex;
                  clear_bracket_attr(env.input[p]);
               } else {
                  q = detect_end_of_statement(env.input, p, env, (input, index, last, ch, env) => {
                     // e.g. ()=>1,2  ((x,y)=>x+y)
                     return utils.contains([',', ')', '}', ']'], ch.token);
                  });
                  x.endIndex = q;
               }
               x.name = '-';
               x.type = TYPE_JAVASCRIPT.function;
            } else if (env.input[p].token === '{') {
               // class function
               q = utils.search_prev(env.input, x.startIndex-1, utils.SEARCH_SKIPSPACEN);
               q = skip_prev_comment(env.input, q, utils.SEARCH_SKIPSPACEN);
               if (q >= 0 && !utils.contains(utils.common_stops, env.input[q].token && !env.input[q].tag)) {
                  env.input[q].startIndex = q;
                  env.input[q].endIndex = env.input[p].endIndex;
                  env.input[q].type = TYPE_JAVASCRIPT.function;
                  clear_bracket_attr(env.input[p]);
               }
               clear_bracket_attr(x);
            } else {
               clear_bracket_attr(x);
            }
         }, (x, env) => x.token === '(' && x.startIndex, origin_state
      ));
      // standalone block
      origin_state.register_condition(new fsm.Condition(
         5, (output, x, env) => {
            utils.act_push_origin(output, x);
            clear_bracket_attr(x);
         }, (x, env) => x.token === '{' && x.startIndex, origin_state
      ));

      function detect_end_of_statement(input, index, env, extra_check_fn) {
         if (index < 0) return input.length-1;
         let ch, last, i, n;
         for (i = index, n = input.length; i < n; i++) {
            ch = input[i];
            if (ch.token === ';') return i;
            if (ch.startIndex >= 0) {
               // skip ( ... ), { ... }, [ ... ]
               i = ch.endIndex;
               last = env.input[ch.endIndex];
               continue;
            } else if (last) {
               if (utils.contains([')', '}', ']'], last.token)) {
                  if (ch.tag !== utils.TAG_COMMENT) return i-1;
                  if (!utils.contains(utils.common_stops, ch.token)) return i-1;
               } else if (utils.contains([
                  'if', 'else', 'switch', 'case', 'default', 'for', 'while', 'do', 'return',
                  'const', 'let', 'var', 'break', 'continue', 'export', 'import',
                  'try', 'catch', 'finally', 'class', 'extends', 'throw', 'function'
               ], ch.token)) {
                  // statement breaked by keywords, e.g. var a = 1\nvar b = 2
                  return i-1;
               } else if (last.tag || !utils.contains(utils.common_stops, last.token)) {
                  if (last.token !== 'return') {
                     // "a" "b" => "ab"
                     if (last.tag !== utils.TAG_STRING && ch.tag === utils.TAG_STRING) return i-1;
                     if (!utils.contains(utils.common_stops, ch.token)) return i-1;
                     if (ch.tag === utils.TAG_REGEX) return i-1;
                     // sym1\nsym2, "sym1"\nsym2, //sym1\nsym2
                  }
                  // TODO: corner case: test\n{
               } else if (extra_check_fn && extra_check_fn(input, i, last, ch, env)) {
                  return i-1;
               }
            }
            if (ch.tag !== utils.TAG_COMMENT && !utils.contains([' ', '\t', '\n'], ch.token)) {
               last = ch;
            }
         }
         return i-1;
      }
   }
}

class JavaScope extends CLikeScope {
   constructor() {
      // after BracketScope
      super(detect_end_of_statement);
      let origin_state = this.state.origin;

      // lambda
      origin_state.register_condition(new fsm.Condition(
         5, (output, x, env) => {
            utils.act_push_origin(output, x);
            let p, q;
            p = utils.search_next(env.input, env.input_i+1, utils.SEARCH_SKIPSPACEN);
            p = skip_next_comment(env.input, p, utils.SEARCH_SKIPSPACEN);
            x.startIndex = env.input_i;
            if (env.input[p].token === '{') {
               x.endIndex = env.input[p].endIndex;
               clear_bracket_attr(env.input[p]);
            } else {
               p = detect_end_of_statement(env.input, p, env, (input, index, ch, env) => {
                  return utils.contains([',', ')', '}', ']'], ch.token);
               });
               x.endIndex = p;
            }
            if (x.java_parent) {
               // (event) -> event.trigger()
               x.java_parent.endIndex = x.endIndex;
               x.java_parent.name = '-';
               x.java_parent.type = TYPE_JAVA.function;
               delete x.java_parent;
            } else {
               // event -> event.trigger()
               p = utils.search_prev(env.input, env.input_i-1, utils.SEARCH_SKIPSPACEN);
               p = skip_prev_comment(env.input, p, utils.SEARCH_SKIPSPACEN);
               env.input[p].startIndex = p;
               env.input[p].endIndex = x.endIndex;
               env.input[p].name = '-';
               env.input[p].type = TYPE_JAVA.function;
            }
            clear_bracket_attr(x);
         }, (x, env) => {
            if (x.token !== '-') return false;
            if (utils.next(env.input, env.input_i, 'token') !== '>') return false;
            return true;
         }, origin_state
      ));
      // annotation
      origin_state.register_condition(new fsm.Condition(
         5, (output, x, env) => {
            utils.act_push_origin(output, x);
            let p, q;
            if (utils.next(env.input, env.input_i, 'token') === 'interface') {
               // @interface, to define annotation
               p = env.input_i+1;
               q = p;
            } else {
               // @CustomizedAnnotation
               // env.input_i+1 is annotation name
               p = utils.search_next(env.input, env.input_i+2, utils.SEARCH_SKIPSPACEN);
               p = skip_next_comment(env.input, p, utils.SEARCH_SKIPSPACEN);
               q = p - 1;
               while (env.input[p].token === '.') {
                  p = utils.search_next(env.input, p+1, utils.SEARCH_SKIPSPACEN);
                  p = utils.search_next(env.input, p+1, utils.SEARCH_SKIPSPACEN);
               }
               p = skip_next_comment(env.input, p, utils.SEARCH_SKIPSPACEN);
               if (env.input[p].token === '(') {
                  q = env.input[p].endIndex;
                  clear_bracket_attr(env.input[p]);
                  p = utils.search_next(env.input, q+1, utils.SEARCH_SKIPSPACEN);
                  p = skip_next_comment(env.input, p, utils.SEARCH_SKIPSPACEN);
               }
            }
            env.input[p].java_parent = x.java_parent || x;
            env.input[p].java_parent.startIndex = env.input[p].java_parent.startIndex || env.input_i;
            env.input[p].java_parent.endIndex = q;
            delete x.java_parent;
         }, (x, env) => x.token === '@', origin_state
      ));

      // ( for standalone, function definition
      origin_state.register_condition(new fsm.Condition(
         5, (output, x, env) => {
            utils.act_push_origin(output, x);
            let p, q, name;
            p = utils.search_next(env.input, x.endIndex+1, utils.SEARCH_SKIPSPACEN);
            p = skip_next_comment(env.input, p, utils.SEARCH_SKIPSPACEN);
            if (env.input[p].token === '-' && utils.next(env.input, p, 'token') === '>') {
               // (...) -> ...
               env.input[p].java_parent = x;
               return;
            }
            if (p >= 0 && env.input[p].token === ';') {
               // e.g. interface X { int a(); },
               // however function call +a.test(1,2); match, process later
               x.endIndex = p;
            } else if (env.input[p].token !== '{') {
               // standalone or function call
               clear_bracket_attr(x);
               return;
            } else {
               x.endIndex = env.input[p].endIndex;
            }
            //                                                                        <- search back
            // [public/private/protected] [static] [<generic>] return_type(array?) function_name (...) {...}
            // function name
            p = utils.search_prev(env.input, x.startIndex-1, utils.SEARCH_SKIPSPACEN);
            p = skip_prev_comment(env.input, p, utils.SEARCH_SKIPSPACEN);
            name = env.input[p].token;
            if (utils.contains(['if', 'switch', 'catch', 'while', 'for', 'return'], name)) {
               clear_bracket_attr(x);
               return;
            }
            // return type
            p = utils.search_prev(env.input, p-1, utils.SEARCH_SKIPSPACEN);
            p = skip_prev_comment(env.input, p, utils.SEARCH_SKIPSPACEN);
            // e.g. int[][][]
            if (p >= 0 && env.input[p].token === ']') {
               while (p >= 0 && env.input[p].token === ']') {
                  p = utils.search_prev(env.input, p-1, { key: 'token', stop:['['] });
                  p = utils.search_prev(env.input, p-1, utils.SEARCH_SKIPSPACEN);
                  p = skip_prev_comment(env.input, p, utils.SEARCH_SKIPSPACEN);
               }
            // function call +test(1,2); a[0].test(1,2); ...
            } else if (p >= 0 && utils.contains(utils.common_stops, env.input[p].token)) {
               clear_bracket_attr(x);
               return;
            } else if (p >= 0 && utils.contains(['return', 'new'], env.input[p].token)) {
               clear_bracket_attr(x);
               return;
            }
            //                /-- q
            //               v  v-- p
            // e.g. java.lang.String
            q = utils.search_prev(env.input, p-1, utils.SEARCH_SKIPSPACEN);
            while (q >= 0 && (env.input[q].token === '.')) {
               p = utils.search_prev(env.input, q-1, utils.SEARCH_SKIPSPACEN);
               q = utils.search_prev(env.input, p-1, utils.SEARCH_SKIPSPACEN);
            }
            q = skip_next_comment(env.input, q, utils.SEARCH_SKIPSPACEN);
            // generic
            // <T>, <T<X>> ...
            if (q >= 0 && env.input[q].token === '>') {
               p = utils.search_pair_prev(env.input, q, SEARCH_GENERICS);
            }
            p = match_modifier_prev(env.input, q, [
               'public', 'private', 'protected', 'static', 'native', 'synchronous', 'transient'
            ]);
            if (env.input[p].java_parent) {
               q = env.input[p].java_parent;
               delete env.input[p].java_parent;
            } else {
               q = env.input[p];
               q.startIndex = p;
            }
            q.endIndex = x.endIndex;
            q.name = name;
            q.type = TYPE_JAVA.function;
            clear_bracket_attr(x);
         }, (x, env) => x.token === '(' && x.startIndex >= 0, origin_state)
      );

      // { for class and [@]interface
      origin_state.register_condition(new fsm.Condition(
         5, (output, x, env) => {
            utils.act_push_origin(output, x, env);
            let p, q, name, st, ed;
            st = env.input_i;
            ed = env.input_i+1;
            if (utils.prev(env.input, st, 'token') === '.') {
               // skip like X.class
               return;
            }
            p = utils.search_next(env.input, ed, utils.SEARCH_SKIPSPACEN);
            p = skip_next_comment(env.input, p, utils.SEARCH_SKIPSPACEN);
            name = env.input[p].token;
            p = utils.search_next(env.input, p+1, utils.SEARCH_SKIPSPACEN);
            p = skip_next_comment(env.input, p, utils.SEARCH_SKIPSPACEN);
            // generic
            if (env.input[p].token === '<') {
               p = utils.search_pair_next(env.input, p, SEARCH_GENERICS);
               p = utils.search_next(env.input, p+1, utils.SEARCH_SKIPSPACEN);
               p = skip_next_comment(env.input, p, utils.SEARCH_SKIPSPACEN);
            }
            // should have { ... } for body
            p = utils.search_next(env.input, p, { key: 'token', stop: ['{'] });
            ed = env.input[p].endIndex;
            clear_bracket_attr(env.input[p]);
            //                                               <-- search back
            // [public/private/protected] [static] [abstract] [@]X ...
            if (utils.prev(env.input, st, 'token') === '@') {
               // no @class, thus only @interface
               p = st - 1;
            } else {
               p = st;
            }
            st = match_modifier_prev(env.input, p, [
               'public', 'private', 'protected', 'static', 'abstract'
            ]);
            if (env.input[st].java_parent) {
               env.input[st].java_parent.name = name;
               env.input[st].java_parent.endIndex = ed;
               if (TYPE_JAVA[x.token]) env.input[st].java_parent.type = TYPE_JAVA[x.token];
               delete env.input[st].java_parent;
            } else {
               env.input[st].startIndex = st;
               env.input[st].endIndex = ed;
               env.input[st].name = name;
            }
         }, (x, env) => utils.contains(['class', 'interface', 'enum'], x.token), origin_state
      ));
      // standalone block
      origin_state.register_condition(new fsm.Condition(
         5, (output, x, env) => {
            utils.act_push_origin(output, x);
            clear_bracket_attr(x);
         }, (x, env) => x.token === '{' && x.startIndex >= 0, origin_state
      ));

      function detect_end_of_statement(input, index, env, extra_check_fn) {
         let i, n, ch;
         for (i = index, n = input.length; i < n; i++) {
            ch = input[i];
            if (ch.token === ';') return i;
            if (ch.startIndex >= 0) {
               // skip ( ... ), { ... }
               i = ch.endIndex;
               continue;
            } else if (extra_check_fn && extra_check_fn(input, i, ch, env)) {
               return i-1;
            }
         }
         // should not be here
         return i-1;
      }
   }
}

class CsharpScope extends CLikeScope {
   constructor() {
      // after BracketScope
      super(detect_end_of_statement);
      let origin_state = this.state.origin;
      // add foreach
      origin_state.register_condition(new fsm.Condition(
         5, (output, x, env) => {
            utils.act_push_origin(output, x);
            let p = env.input_i+1, q;
            x.startIndex = env.input_i;
            p = utils.search_next(env.input, p, { key: 'token', stop: ['('] });
            q = env.input[p].endIndex;
            p = utils.search_next(env.input, q+1, utils.SEARCH_SKIPSPACEN);
            p = skip_next_comment(env.input, p, utils.SEARCH_SKIPSPACEN);
            if (p >= 0 && env.input[p].token === '{') {
               x.endIndex = env.input[p].endIndex;
               clear_bracket_attr(env.input[p]);
            } else {
               x.endIndex = detect_end_of_statement(env.input, p, env);
            }
         }, (x, env) => x.token === 'foreach', origin_state
      ));
      // override catch
      origin_state.register_condition(new fsm.Condition(
         4, (output, x, env) => {
            utils.act_push_origin(output, x);
            let p = env.input_i+1, q;
            x.startIndex = env.input_i;
            q = x.startIndex;
            p = utils.search_next(env.input, q+1, utils.SEARCH_SKIPSPACEN);
            p = skip_next_comment(env.input, p, utils.SEARCH_SKIPSPACEN);
            if (p >= 0 && env.input[p].token === '(') {
               q = env.input[p].endIndex;
               p = utils.search_next(env.input, q+1, utils.SEARCH_SKIPSPACEN);
               p = skip_next_comment(env.input, p, utils.SEARCH_SKIPSPACEN);
               if (p >= 0 && env.input[p].token === 'when') {
                  // catch (HttpRequestException e) when (e.Message.Contains("301")) { ... }
                  p = utils.search_next(env.input, q+1, { key: 'token', stop: ['{'] });
               }
            } // else: catch { ... }
            if (p >= 0 && env.input[p].token === '{') {
               x.endIndex = env.input[p].endIndex;
               clear_bracket_attr(env.input[p]);
            } else {
               x.endIndex = detect_end_of_statement(env.input, p, env);
            }
            q = utils.search_next(env.input, x.endIndex+1, utils.SEARCH_SKIPSPACEN);
            q = skip_next_comment(env.input, q, utils.SEARCH_SKIPSPACEN);
            if (q >= 0 && utils.contains(['else', 'finally'], env.input[q].token)) {
               env.input[q].parent = x.parent || x;
            }
            if (x.parent) {
               x.parent.endIndex = x.endIndex;
               delete x.parent;
               clear_bracket_attr(x);
            }
         }, (x, env) => x.token === 'catch', origin_state
      ));
      // lambda =>
      origin_state.register_condition(new fsm.Condition(
         5, (output, x, env) => {
            let p, q, st, ed;
            st = env.input_i-1;
            ed = env.input_i+1;
            p = utils.search_next(env.input, ed, utils.SEARCH_SKIPSPACEN);
            p = skip_next_comment(env.input, p, utils.SEARCH_SKIPSPACEN);
            if (env.input[p].token === '{') {
               ed = env.input[p].endIndex;
               clear_bracket_attr(env.input[p]);
            } else {
               ed = detect_end_of_statement(env.input, p, env, (input, index, ch, env) => {
                  return utils.contains([',', ')', '}', ']'], ch.token);
               });
            }
            if (env.input[st].csharp_parent) {
               p = env.input[st].csharp_parent;
            } else {
               q = utils.search_prev(env.input, st-1, utils.SEARCH_SKIPSPACEN);
               q = skip_prev_comment(env.input, q, utils.SEARCH_SKIPSPACEN);
               p = env.input[q];
               p.startIndex = q;
            }
            p.name = '-';
            p.type = TYPE_CSHARP.function;
            p.endIndex = ed;
console.log(env.input.slice(p.startIndex, p.endIndex+1).map((x) => x.token).join(''));
         }, (x, env) => {
            if (x.token !== '>') return false;
            if (utils.prev(env.input, env.input_i, 'token') !== '=') return false;
            return true;
         }, origin_state
      ));
      // function
      origin_state.register_condition(new fsm.Condition(
         5, (output, x, env) => {
            utils.act_push_origin(output, x);
            let p, q, name, st, ed;
            p = utils.search_next(env.input, x.endIndex+1, utils.SEARCH_SKIPSPACEN);
            p = skip_next_comment(env.input, p, utils.SEARCH_SKIPSPACEN);
            if (env.input[p].token === '=' && utils.next(env.input, p, 'token') === '>') {
               // (...) => ...
               env.input[p].csharp_parent = x;
               return;
            }
            if (p >= 0 && env.input[p].token === ';') {
               // e.g. delegate int func(int x);
               // however function call +a.test(1,2); match, process later
               ed = p;
            } else if (env.input[p].token === '{') {
               ed = env.input[p].endIndex;
               clear_bracket_attr(env.input[p]);
            } else if (p >= 0 && env.input[p].token === 'where') {
               // void SwapIfGreater<T>(ref T lhs, ref T rhs) where T : System.IComparable<T> { ... }
               p = utils.search_next(env.input, p+1, { key:'token', stop:[';', '{'] });
               if (p >= 0) {
                  if (env.input[p].token === ';') {
                     ed = p;
                  } else if (env.input[p].token === '{') {
                     ed = env.input[p].endIndex;
                     clear_bracket_attr(env.input[p]);
                  }
               } else {
                  return;
               }
            } else {
               // standalone or function call
               return;
            }
            //                                                                   <- search back
            // [attribute] [modifier] return_type(array?) function_name [<generic>] (...) {...}
            p = utils.search_prev(env.input, x.startIndex-1, utils.SEARCH_SKIPSPACEN);
            p = skip_prev_comment(env.input, p, utils.SEARCH_SKIPSPACEN);
            clear_bracket_attr(x);
            // generic
            // <T>, <T<X>> ...
            if (p >= 0 && env.input[p].token === '>') {
               p = utils.search_pair_prev(env.input, p, SEARCH_GENERICS);
               p = utils.search_prev(env.input, p-1, utils.SEARCH_SKIPSPACEN);
               p = skip_prev_comment(env.input, p, utils.SEARCH_SKIPSPACEN);
            }
            // function name
            name = env.input[p].token;
            if (utils.contains(['if', 'switch', 'catch', 'while', 'for', 'return'], name)) return;
            if (utils.contains(utils.common_stops, name)) {
               // e.g. public override bool operator== (Test x) { ... }
               q = p;
               p = utils.search_prev(env.input, p-1, { key:'token', skip:utils.common_stops });
               if (p < 0 || env.input[p].token !== 'operator') {
                  // e.g. this.test = (1 + 1)/2
                  return;
               }
               name = env.input.slice(p+1, q+1).map((x) => x.token).join('').trim();
               p = q;
            }
            p = match_function_type_prev(env.input, p);
            if (p < 0) return;
            p = match_modifier_prev(env.input, p, [
               'delegate', 'abstract', 'async', 'extern', 'static', 'public', 'private', 'protected',
               'sealed', 'virtual', 'override', 'unsafe', 'volatile', 'partial'
            ]);
            p = match_attribute(env.input, p);
            q = env.input[p];
            q.startIndex = p;
            q.endIndex = ed;
            q.name = name;
            q.type = TYPE_CSHARP.function;
console.log('+', q.name, env.input.slice(q.startIndex, q.endIndex+1).map((x) => x.token).join(''));
         }, (x, env) => x.token === '(' && x.startIndex >= 0, origin_state
      ));

      // { for class, struct, interface, enum, namespace
      origin_state.register_condition(new fsm.Condition(
         5, (output, x, env) => {
            utils.act_push_origin(output, x, env);
            let p, q, name, st, ed;
            st = env.input_i;
            ed = env.input_i+1;
            p = utils.search_next(env.input, ed, utils.SEARCH_SKIPSPACEN);
            p = skip_next_comment(env.input, p, utils.SEARCH_SKIPSPACEN);
            name = env.input[p].token;
            if (name === '{') {
               // handle with e.g. public static void Test<T>(object x) where T : class { ... }
               x.name = '-';
               x.startIndex = st;
               x.endIndex = env.input[p].endIndex;
console.log(env.input.slice(x.startIndex, x.endIndex+1).map((z) => z.token).join(''));
               clear_bracket_attr(env.input[p]);
               return;
            } else if (name === ';') {
               // e.g. void Test<T>(object x) where T : class;
               return;
            }
            p = utils.search_next(env.input, p+1, utils.SEARCH_SKIPSPACEN);
            p = skip_next_comment(env.input, p, utils.SEARCH_SKIPSPACEN);
            while (env.input[p].token === '.') {
               // e.g. namespace Test.Test1
               p = utils.search_next(env.input, p+1, utils.SEARCH_SKIPSPACEN);
               name += '.' + env.input[p].token;
               p = utils.search_next(env.input, p+1, utils.SEARCH_SKIPSPACEN);
            }
            p = skip_next_comment(env.input, p, utils.SEARCH_SKIPSPACEN);
            // generic
            if (env.input[p].token === '<') {
               p = utils.search_pair_next(env.input, p, SEARCH_GENERICS);
               p = utils.search_next(env.input, p+1, utils.SEARCH_SKIPSPACEN);
               p = skip_next_comment(env.input, p, utils.SEARCH_SKIPSPACEN);
            }
            // skip inheritance
            // should have { ... } for body
            p = utils.search_next(env.input, p, { key: 'token', stop: ['{'] });
            ed = env.input[p].endIndex;
            clear_bracket_attr(env.input[p]);
            p = match_modifier_prev(env.input, p, [
               'public', 'private', 'protected', 'static', 'abstract', 'partial'
            ]);
            p = match_attribute(env.input, p);
            q = env.input[p];
            q.startIndex = st;
            q.endIndex = ed;
            q.name = name;
            if (TYPE_CSHARP[x.token]) q.type = TYPE_CSHARP[x.token];
console.log('* ', q.name, env.input.slice(q.startIndex, q.endIndex+1).map((x) => x.token).join(''));
         }, (x, env) => utils.contains(['class', 'struct', 'interface', 'namespace', 'enum'], x.token), origin_state
      ));
      // delegate { ... }
      origin_state.register_condition(new fsm.Condition(
         5, (output, x, env) => {
            utils.act_push_origin(output, x);
            let p, q;
            p = utils.search_next(env.input, env.input_i+1, utils.SEARCH_SKIPSPACEN);
            p = skip_next_comment(env.input, p, utils.SEARCH_SKIPSPACEN);
            if (p >= 0 && env.input[p].token === '(') {
               q = env.input[p].endIndex;
               clear_bracket_attr(env.input[p]);
               p = utils.search_next(env.input, q+1, utils.SEARCH_SKIPSPACEN);
               p = skip_next_comment(env.input, p, utils.SEARCH_SKIPSPACEN);
            }
            if (p < 0 || env.input[p].token !== '{') return;
            x.startIndex = env.input_i;
            x.endIndex = env.input[p].endIndex;
            x.name = '-';
console.log(env.input.slice(x.startIndex, x.endIndex+1).map((x) => x.token).join(''));
            clear_bracket_attr(env.input[p]);
         }, (x, env) => x.token === 'delegate', origin_state
      ));
      // indexer function
      origin_state.register_condition(new fsm.Condition(
         5, (output, x, env) => {
            utils.act_push_origin(output, x);
            let p, q;
            p = utils.search_pair_next(env.input, env.input_i, SEARCH_ATTRIBUTE);
            p = utils.search_next(env.input, p+1, utils.SEARCH_SKIPSPACEN);
            p = skip_next_comment(env.input, p, utils.SEARCH_SKIPSPACEN);
            q = env.input[p];
            if (q && q.token === '{') {
               // e.g. public string[][] this[string key] {...}
               let st, ed;
               ed = q.endIndex;
               p = utils.search_prev(env.input, env.input_i-1, utils.SEARCH_SKIPSPACEN);
               p = skip_prev_comment(env.input, p, utils.SEARCH_SKIPSPACEN);
               // env.input[p] should be `this`
               if (env.input[p].token !== 'this') return;
               p = match_function_type_prev(env.input, p);
               if (p < 0) return;
               p = match_modifier_prev(env.input, p, [
                  'delegate', 'abstract', 'async', 'extern', 'static', 'public', 'private', 'protected',
                  'sealed', 'virtual', 'override', 'unsafe', 'volatile', 'partial'
               ]);
               p = match_attribute(env.input, p);
               q = env.input[p];
               q.startIndex = p;
               q.endIndex = ed;
               q.name = '[]';
               q.type = TYPE_CSHARP.function;
console.log('++', q.name, env.input.slice(q.startIndex, q.endIndex+1).map((x) => x.token).join(''));
               return;
            }
         }, (x, env) => x.token === '[', origin_state
      ));
      // standalone block
      origin_state.register_condition(new fsm.Condition(
         5, (output, x, env) => {
            utils.act_push_origin(output, x);
            clear_bracket_attr(x);
         }, (x, env) => x.token === '{' && x.startIndex >= 0, origin_state
      ));
      origin_state.register_condition(new fsm.Condition(
         5, (output, x, env) => {}, (x, env) => false, origin_state
      ));

      // skip preprocessor
      // e.g. #region this is for you; `for` may confuse parser
      let preprocessor_state = new fsm.State(new fsm.Condition(
         0, utils.act_push_origin, utils.always
      ));
      preprocessor_state.register_condition(new fsm.Condition(
         5, utils.act_push_origin, (x, env) => utils.contains(['\n', '\r'], x.token), origin_state
      ));
      origin_state.register_condition(new fsm.Condition(
         4, utils.act_push_origin, (x, env) => {
            return utils.contains([
            '#region', '#endregion', '#if', '#else', '#elif', '#endif',
            '#error', '#warning', '#line', '#define', '#undef'
         ], x.token)}, preprocessor_state
      ));
      this.register_state('preprocessor', preprocessor_state);

      function detect_end_of_statement(input, index, env, extra_check_fn) {
         let i, n, ch;
         for (i = index, n = input.length; i < n; i++) {
            ch = input[i];
            if (ch.token === ';') return i;
            if (ch.startIndex >= 0) {
               // skip ( ... ), { ... }, [ ... ]
               i = ch.endIndex;
               continue;
            } else if (extra_check_fn && extra_check_fn(input, i, ch, env)) {
               return i-1;
            }
         }
         // should not be here
         return i-1;
      }
      function match_function_type_prev(array, index) {
         let p = index, q;
         p = utils.search_prev(array, p-1, utils.SEARCH_SKIPSPACEN);
         p = skip_prev_comment(array, p, utils.SEARCH_SKIPSPACEN);
         // e.g. int[][][]
         if (p >= 0 && array[p].token === ']') {
            while (p >= 0 && array[p].token === ']') {
               p = utils.search_prev(array, p-1, { key: 'token', stop:['['] });
               p = utils.search_prev(array, p-1, utils.SEARCH_SKIPSPACEN);
               p = skip_prev_comment(array, p, utils.SEARCH_SKIPSPACEN);
            }
         // function call +test(1,2); a[0].test(1,2); new A(); ...
         } else if (p >= 0 && utils.contains(utils.common_stops, array[p].token)) {
            return -1;
         } else if (p >= 0 && utils.contains(['return', 'new', 'await'], array[p].token)) {
            return -1;
         }
         //             /-- q
         //            v  v-- p
         // e.g. System.Data
         p = utils.search_prev(array, p-1, utils.SEARCH_SKIPSPACEN);
         q = p;
         while (p >= 0 && (array[p].token === '.')) {
            p = utils.search_prev(array, p-1, utils.SEARCH_SKIPSPACEN);
            q = p;
            p = utils.search_prev(array, p-1, utils.SEARCH_SKIPSPACEN);
         }
         return q;
      }
      function match_attribute(array, index) {
         let p = index, q = index;
         p = utils.search_prev(array, p-1, utils.SEARCH_SKIPSPACEN);
         p = skip_prev_comment(array, p, utils.SEARCH_SKIPSPACEN);
         if (p >= 0 && array[p].token === ']') {
            while (p >= 0 && array[p].token === ']') {
               p = utils.search_pair_prev(array, p, SEARCH_ATTRIBUTE);
               q = p;
               p = utils.search_prev(array, p-1, utils.SEARCH_SKIPSPACEN);
               p = skip_prev_comment(array, p, utils.SEARCH_SKIPSPACEN);
            }
         }
         return q;
      }
   }
}

class CScope extends fsm.Feature {
   constructor() {
      // after CPrecompileScope
      super();
      /* FIXME: not support:
         #define A {
         #define B }
         int hello() A B
         --------------
         int hello() {
         #ifdef A
            return 0;
         }
         #else
            return -1;
         }
         --------------
         #define FNAME(x) fn_##x
         void FNAME(test) {}
         --------------
         class std::Test {};
         --------------
         - nested function pointer
      */
      // currently only support class, function
      let origin_state = new fsm.State(new fsm.Condition(
         0, utils.act_push_origin, utils.always
      ));
      let preprocessor_state = new fsm.State(new fsm.Condition(
         0, utils.act_push_origin, utils.always
      ));
      this.register_state('origin', origin_state);
      this.register_state('preprocess', preprocessor_state);
      this.set_entry('origin');
      origin_state.register_condition(new fsm.Condition(
         5, (output, x, env) => {
            utils.act_push_origin(output, x);
            env.elem = x;
         }, (x, env) => x.preprocess, preprocessor_state
      ));
      preprocessor_state.register_condition(new fsm.Condition(
         5, utils.act_push_origin, (x, env) => {
            if (env.elem.preprocess.jumpIndex-1 > env.input_i) return false;
            delete env.elem;
            return true;
         }, origin_state
      ));
      origin_state.register_condition(new fsm.Condition(
         5, (output, x, env) => {
            let p, q, name, fnptr, type;
            type = null;
            p = utils.search_prev(env.input, env.input_i-1, utils.SEARCH_SKIPSPACEN);
            p = skip_prev_comment(env.input, p, utils.SEARCH_SKIPSPACEN);
            if (p < 0) {
               return;
            }
            if (env.input[p].token === ')') {
               fnptr = false;
               p = detect_init_n_extends(env.input, p);
               p = utils.search_pair_prev(env.input, p, SEARCH_PARAM);
               p = utils.search_prev(env.input, p-1, utils.SEARCH_SKIPSPACEN);
               p = skip_prev_comment(env.input, p, utils.SEARCH_SKIPSPACEN);
               if (p < 0 || utils.contains(['if', 'for', 'while', 'catch', 'switch'], env.input[p].token)) {
                  return;
               }
               if (env.input[p].token === ')') {
                  // return function ptr, e.g.
                  // int (*f(int x))(int, float) {}
                  //               ^
                  // A* A::operator()(A* x) {}
                  //                ^
                  q = utils.search_prev(env.input, p-1, utils.SEARCH_SKIPSPACEN);
                  q = skip_prev_comment(env.input, q, utils.SEARCH_SKIPSPACEN);
                  if (!env.input[q]) {
                     return;
                  } else if (env.input[q].token === ')') {
                     //              v
                     // int (*f(int x))(int, float) {}
                     fnptr = true;
                     p = utils.search_pair_prev(env.input, q, SEARCH_PARAM);
                     p = utils.search_prev(env.input, p-1, utils.SEARCH_SKIPSPACEN);
                     p = skip_prev_comment(env.input, p, utils.SEARCH_SKIPSPACEN);
                  } else if (env.input[q].token === '(') {
                     //               v
                     // A* A::operator()(A* x) {}
                  } else {
                     return;
                  }
               }
               // parse function name
               q = detect_function_name(env.input, p);
               name = q.name;
               p = q.index;
               if (fnptr) {
                  //     v|
                  // int (*f(int x))(int, float) {}
                  p = utils.search_prev(env.input, p-1, { key:'token', stop:'(' });
                  p--;
               }
               // parse type
               p = detect_type_name_prev(env.input, p);
               type = TYPE_C.function;
            } else if (utils.contains(['do', 'try', 'catch', 'finally', 'else', '__asm'], env.input[p].token)) {
               return;
            } else {
               // e.g. class A {};
               q = detect_class_name(env.input, p);
               name = q.name;
               p = q.index;
               if (env.input[p].token !== 'class') return;
               type = TYPE_C.class;
            }
            // template
            p = detect_template_prev(env.input, p);
            q = env.input[p];
            q.startIndex = p;
            p = utils.search_pair_next(env.input, env.input_i, SEARCH_BLOCK);
            q.endIndex = p;
            q.name = name;
            if (type) q.type = type;
console.log('* ', q.name, env.input.slice(q.startIndex, q.endIndex+1).map((x) => x.token).join(''));
         }, (x, env) => x.token === '{', origin_state
      ));

      function detect_init_n_extends(input, index) {
         //                           v--- index
         // A::A() : x(const::XX), y(1) {}
         // A::A() : ns::Base::t(const::XX) {}
         // exclude A::test() {}
         let p = index;
         while(index >= 0 && input[index].token === ')') {
            index = utils.search_pair_prev(input, index, SEARCH_PARAM);
            index = utils.search_prev(input, index-1, utils.SEARCH_SKIPSPACEN);
            index = skip_prev_comment(input, index, utils.SEARCH_SKIPSPACEN);
            // name
            index = utils.search_prev(input, index-1, utils.SEARCH_SKIPSPACEN);
            index = skip_prev_comment(input, index, utils.SEARCH_SKIPSPACEN);
            if (index < 0) break;
            if (input[index].token === ',') {
               index = utils.search_prev(input, index-1, utils.SEARCH_SKIPSPACEN);
               index = skip_prev_comment(input, index, utils.SEARCH_SKIPSPACEN);
               continue;
            }
            if (input[index].token === ':') {
               while (index-1 >= 0 && input[index-1].token === ':') {
                  index = utils.search_prev(input, index-2, utils.SEARCH_SKIPSPACEN);
                  index = skip_prev_comment(input, index, utils.SEARCH_SKIPSPACEN);
                  // class name
                  index = utils.search_prev(input, index-2, utils.SEARCH_SKIPSPACEN);
                  index = skip_prev_comment(input, index, utils.SEARCH_SKIPSPACEN);
               }
               if (index >= 0 && input[index].token === ':') {
                  index = utils.search_prev(input, index-1, utils.SEARCH_SKIPSPACEN);
                  index = skip_prev_comment(input, index, utils.SEARCH_SKIPSPACEN);
                  // should be ')', maybe 'public', 'private', ...
                  break;
               } else {
                  index = utils.search_prev(input, index-1, utils.SEARCH_SKIPSPACEN);
                  index = skip_prev_comment(input, index, utils.SEARCH_SKIPSPACEN);
               }
            }
         }
         if (index >= 0 && input[index].token === ')') {
            return index;
         } else {
            return p;
         }
      }

      function detect_template_prev(input, index) {
         let p = index;
         p = utils.search_prev(input, p-1, utils.SEARCH_SKIPSPACEN);
         p = skip_prev_comment(input, p, utils.SEARCH_SKIPSPACEN);
         if (p >= 0 && input[p].token === '>') {
            p = utils.search_pair_prev(input, p, SEARCH_GENERICS);
            p = utils.search_prev(input, p-1, utils.SEARCH_SKIPSPACEN);
            p = skip_prev_comment(input, p, utils.SEARCH_SKIPSPACEN);
            // should be 'template'
            index = p;
         }
         return index;
      }

      function detect_type_name_prev(input, index) {
         let p = index;
         index = utils.search_prev(input, index-1, utils.SEARCH_SKIPSPACEN);
         index = skip_prev_comment(input, index, utils.SEARCH_SKIPSPACEN);
         while (true) {
            if (index < 0 || utils.contains([';', '{', '}'], input[index].token)) {
               // e.g. ~A() {}
               return p;
            }
            if (input[index].token === ':') {
               // e.g. public: A() {}
               // e.g. ns::B A() {}
               if (index > 0 && input[index-1].token === ':') {
                  index --;
               } else {
                  return p;
               }
            }
            if (index >= 0 && input[index].tag !== utils.TAG_COMMENT) {
               if (!utils.contains([' ', '\t', '\r', '\n'], input[index].token)) {
                  p = index;
               }
            }
            index --;
         }
      }

      function detect_class_name(input, index) {
         let p = index;
         let name = input[index].token;
         if (name === '>') {
            index = utils.search_pair_prev(input, index, SEARCH_GENERICS);
            index = utils.search_prev(input, index-1, utils.SEARCH_SKIPSPACEN);
            index = skip_prev_comment(input, index, utils.SEARCH_SKIPSPACEN);
         }
         index = utils.search_prev(input, index-1, utils.SEARCH_SKIPSPACEN);
         index = skip_prev_comment(input, index, utils.SEARCH_SKIPSPACEN);
         //         v--- search for
         // class A : public ns::B::C, ns::D, protected E {...}
         // public:class A {...}
         if (index >= 0 && utils.contains(['public', 'protected', 'private', 'virtual'], input[index].token)) {
            index = utils.search_prev(input, index-1, { key:'token', stop:[':'] });
         }
         while (index > 0 && input[index-1].token === ':') {
            if (input[index].token === 'class') {
               p = index;
               break;
            }
            index = utils.search_prev(input, index-2, { key:'token', stop:[':'] });
         }
         if (input[index].token !== 'class') {
            index = utils.search_prev(input, index-1, utils.SEARCH_SKIPSPACEN);
            index = skip_prev_comment(input, index, utils.SEARCH_SKIPSPACEN);
            name = input[index].token;
            index = utils.search_prev(input, index-1, utils.SEARCH_SKIPSPACEN);
            index = skip_prev_comment(input, index, utils.SEARCH_SKIPSPACEN);
            while (index >= 0 && input[index].token === ':') {
               // class ns::A {}
               index = utils.search_prev(input, index-2, utils.SEARCH_SKIPSPACEN);
               index = skip_prev_comment(input, index, utils.SEARCH_SKIPSPACEN);
            }
         }
         // should be class now
         return { name, index };
      }

      function detect_function_name(input, index) {
         let p;
         let name = '';
         if (utils.contains(utils.common_stops, input[index].token)) {
            // e.g. A* operator delete[] (A** x) {}
            while (input[index].token !== 'operator') {
               name += input[index].token;
               index = utils.search_prev(input, index-1, utils.SEARCH_SKIPSPACEN);
               index = skip_prev_comment(input, index, utils.SEARCH_SKIPSPACEN);
            }
            name = name.trim();
            p = index;
            index = utils.search_prev(input, index-1, utils.SEARCH_SKIPSPACEN);
            index = skip_prev_comment(input, index, utils.SEARCH_SKIPSPACEN);
         } else {
            name = input[index].token;
            p = index;
            index = utils.search_prev(input, index-1, utils.SEARCH_SKIPSPACEN);
            index = skip_prev_comment(input, index, utils.SEARCH_SKIPSPACEN);
            if (index >= 0 && input[index].token === 'operator') {
               // e.g. A* A::operator new(A* x) {}
               p = index;
               index = utils.search_prev(input, index-1, utils.SEARCH_SKIPSPACEN);
               index = skip_prev_comment(input, index, utils.SEARCH_SKIPSPACEN);
            }
            if (index >= 0 && input[index].token === '~') {
               // e.g. A::~A() {}
               name = '~' + name;
               p = index;
               index = utils.search_prev(input, index-1, utils.SEARCH_SKIPSPACEN);
               index = skip_prev_comment(input, index, utils.SEARCH_SKIPSPACEN);
            }
         }
         if (index >= 0 && input[index].token === ':') {
            // e.g. void ns::A::test() {}
            // exclude the case: public: A() {}
            while (input[index-1].token === ':') {
               // index-1 should be ':' as well
               index = utils.search_prev(input, index-2, utils.SEARCH_SKIPSPACEN);
               index = skip_prev_comment(input, index, utils.SEARCH_SKIPSPACEN);
               // index is class name
               p = index;
               index = utils.search_prev(input, index-1, utils.SEARCH_SKIPSPACEN);
               index = skip_prev_comment(input, index, utils.SEARCH_SKIPSPACEN);
            }
         }
         index = p;
         return { name, index };
      }

      function detect_end_of_statement(input, index, env) {
         let i, n, ch;
         for (i = index, n = input.length; i < n; i++) {
            ch = input[i];
            if (ch.token === ';') return i;
            if (ch.startIndex >= 0) {
               // skip ( ... ), { ... }
               i = ch.endIndex;
               continue;
            }
         }
         // should not be here
         return i-1;
      }
   }
}

class ObjectiveCScope extends CLikeScope {
   constructor() {
      // after BracketScope
      super(detect_end_of_statement);
      let origin_state = this.state.origin;

      function detect_end_of_statement(input, index, env) {
         let i, n, ch;
         for (i = index, n = input.length; i < n; i++) {
            ch = input[i];
            if (ch.token === ';') return i;
            if (ch.startIndex >= 0) {
               // skip ( ... ), { ... }, [ ... ]
               i = ch.endIndex;
               continue;
            }
         }
         // should not be here
         return i-1;
      }
   }
}

class CPrecompileScope extends fsm.Feature {
   constructor() {
      // after SymbolTokenizer
      super();
      this.env.symbols = {
         /* key = [#define]name
            value = x.preprocess */
      };
      this.env.block_stack = [];
      let origin_state = new fsm.State(new fsm.Condition(
         0, utils.act_push_origin, utils.always
      ));
      let preprocessor_state = new fsm.State(new fsm.Condition(
         0, utils.act_push_origin, utils.always
      ));
      origin_state.register_condition(new fsm.Condition(
         5, (output, x, env) => {
            utils.act_push_origin(output, x);
            env.block_stack.push(x);
            let p = utils.search_next(env.input, env.input_i+1, utils.SEARCH_SKIPSPACE);
            x.preprocess = {
               type: env.input[p].token
            }

            switch (x.preprocess.type) {
            case 'include':
               x.preprocess.filename = detect_include_file_name(env.input, p+1);
               break;
            case 'define':
               Object.assign(x.preprocess, detect_define_structure(env.input, p+1, env));
               register_symbol(env.symbols, x.preprocess.name, x.preprocess);
               break;
            case 'undef':
               Object.assign(x.preprocess, detect_undef_symbol(env.input, p+1, env));
               break;
            case 'if':
            case 'ifdef':
            case 'ifndef':
            case 'elif':
            case 'else':
               x.preprocess.startIndex = env.input_i;
               break;
            }
         }, (x, env) => x.token === '#', preprocessor_state
      ));
      preprocessor_state.register_condition(new fsm.Condition(
         5, (output, x, env) => {
            utils.act_push_origin(output, x);
            let $x = utils.last(env.block_stack), $y;
            if (utils.contains(['if', 'ifdef', 'ifndef'], $x.preprocess.type)) {
               $x.preprocess.startIndex = env.input_i+1;
            } else if (utils.contains(['elif', 'else'], $x.preprocess.type)) {
               env.block_stack.pop();      // pop self
               $y = env.block_stack.pop(); // pop if/ifdef/ifndef
               env.block_stack.push($x);   // push self
               $y.preprocess.endIndex = $x.preprocess.startIndex-1;
               $y.preprocess.chainIndex = env.input_i;
               $x.preprocess.startIndex = env.input_i+1;
            } else if ($x.preprocess.type === 'endif') {
               env.block_stack.pop();      // pop self
               $y = env.block_stack.pop(); // pop if/ifdef/ifndef
               $y.preprocess.endIndex = env.input_i-1;
            } else {
               env.block_stack.pop();
            }
            $x.preprocess.jumpIndex = env.input_i+1;
         }, (x, env) => {
            // #define A ( \ \n )
            if (x.token === '\r') {
               if (env.input[env.input_i-1].token === '\\') return false;
               return true;
            } else if (x.token === '\n') {
               if (env.input[env.input_i-1].token === '\\') return false;
               if (env.input[env.input_i-1].token === '\r' && env.input[env.input_i-2].token === '\\') return false;
               return true;
            }
            return false;
         }, origin_state
      ));
      this.register_state('origin', origin_state);
      this.register_state('preprocess', preprocessor_state);
      this.set_entry('origin');

      function detect_include_file_name(input, index, env) {
         let n = input.length;
         while (index < n) {
            if (input[index].token === '<') {
               n = utils.search_next(input, index+1, { key:'token', stop:['>'] });
               return input.slice(index+1, n).map((x) => x.token).join('').trim();
            } else if (input[index].tag === utils.TAG_STRING) {
               n = input[index].token;
               return n.substring(1, n.length-1);
            }
            index++;
         }
         // should not be here
         return '(error)';
      }

      function detect_define_structure(input, index, env) {
         let p, q;
         let n = input.length;
         let $define = {
            name: null,
            contentIndex: index,
            jumpIndex: index
         };
         index = utils.search_next(input, index, utils.SEARCH_SKIPSPACE);
         $define.name = input[index].token;
         // #define A EOF
         if (index+1 >= n) {
            $define.startIndex = index;
            $define.endIndex = n - 1;
            $define.jumpIndex = index;
            return $define;
         }
         index ++;
         if (input[index].token === '(') {
            p = index+1;
            q = [];
            while(true) {
               index = utils.search_next(input, index+1, { key:'token', stop:[',', ')'] });
               if (input[index].token === ',') {
                  q.push(input.slice(p, index).map((x) => x.token).join('').trim());
                  p = index+1;
                  continue;
               } else {
                  p = input.slice(p, index).map((x) => x.token).join('').trim();
                  // #define A() => #define A
                  if (p) q.push(p);
                  break;
               }
               // should not be here
            }
            $define.params = q;
            index ++;
            index = utils.search_next(input, index+1, utils.SEARCH_SKIPSPACE);
         }
         $define.contentIndex = index;

         let pair = { '()': 0, '{}': 0 };
         while(index < n) {
            p = input[index];
            q = input[index-1];
            if (p.token === '\n') {
               if (q.token === '\\') {
                  index ++;
                  continue;
               }
               break;
            } else if (p.token === '\r') {
               if (q.token !== '\\') {
                  break;
               }
               p = input[index+1];
               if (p && p.token === '\n') {
                  index += 2;
               } else {
                  index ++;
               }
               continue;
            }
            switch(p.token) {
            case '{': pair['{}']++; break;
            case '(': pair['()']++; break;
            case '}': pair['{}']--; break;
            case ')': pair['()']--; break;
            }
            index++;
         }
         if (pair['()']) $define['()'] = pair['()'];
         if (pair['{}']) $define['{}'] = pair['{}'];
         $define.startIndex = index;
         $define.endIndex = n-1;
         $define.jumpIndex = index;
         return $define;
      }

      function register_symbol(symbols, name, one) {
         if (symbols[name]) {
            symbols[name].endIndex = one.startIndex-1;
         }
         symbols[name] = one;
      }

      function detect_undef_symbol(input, index, env) {
         index = utils.search_next(input, index, utils.SEARCH_SKIPSPACE);
         let $undef = {};
         $undef.name = input[index].token;
         if (!env.symbols[$undef.name]) return $undef;
         env.symbols[$undef.name].endIndex = env.input_i-1;
         return $undef;
      }
   } // CPrecompileScope.constructor
}

module.exports = {
   RubyScope,
   PythonLambdaScope,
   PythonScope,
   GoScope,
   BracketScope,
   CLikeScope,
   JavaScriptScope,
   JavaScope,
   CsharpScope,
   CPrecompileScope,
   CScope,
   ObjectiveCScope
};