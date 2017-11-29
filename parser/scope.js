const utils = require('../utils');
const fsm = require('./fsm');

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
                  }
                  env.block_stack.push(x);
                  x.indentSize = env.indent_size;
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

class CPrecompileScope extends fsm.Feature {
   constructor() {
      // after SymbolTokenizer
      super();
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
         }, (x, env) => {
            return utils.contains(env.starter, x.token);
         }, origin_state
      ));
      origin_state.register_condition(new fsm.Condition(
         5, (output, x, env) => {
            utils.act_push_origin(output, x);
            let block = env.block_stack.pop();
            block.endIndex = env.input_i;
         }, (x, env) => {
            return utils.contains(env.ender, x.token)
         }, origin_state
      ));
      this.register_state('origin', origin_state);
      this.set_entry('origin');
   }
}

class JavaScriptScope extends fsm.Feature {
   constructor() {
      // after BracketScope
      super();
      this.env.block_stack = [];
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
            if (p >= 0 && env.input[p].token === '{') {
               x.endIndex = env.input[p].endIndex;
               clear_attr(env.input[p]);
            } else {
               q = detect_end_of_statement(env.input, p, env);
               x.endIndex = q;
            }
            q = utils.search_next(env.input, x.endIndex+1, utils.SEARCH_SKIPSPACEN);
            if (q >= 0 && utils.contains(['else', 'finally'], env.input[q].token)) {
               env.input[q].parent = x.parent || x;
            }
            if (x.parent) {
               x.parent.endIndex = x.endIndex;
               delete x.parent;
               clear_attr(x);
            }
         }, (x, env) => utils.contains(['if', 'switch', 'while', 'for', 'catch'], x.token), origin_state
      ));
      origin_state.register_condition(new fsm.Condition(
         5, (output, x, env) => {
            utils.act_push_origin(output, x);
            let p = env.input_i+1, q;
            p = utils.search_next(env.input, p, utils.SEARCH_SKIPSPACEN);
            if (p >= 0 && env.input[p].token === '{') {
               x.endIndex = env.input[p].endIndex;
               clear_attr(env.input[p]);
            } else {
               q = detect_end_of_statement(env.input, p, env);
               x.endIndex = q;
            }
            q = utils.search_next(env.input, x.endIndex+1, utils.SEARCH_SKIPSPACEN);
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
            if (p >= 0 && env.input[p].token === '{') {
               x.parent.endIndex = env.input[p].endIndex;
               clear_attr(env.input[p]);
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

      origin_state.register_condition(new fsm.Condition(
         5, (output, x, env) => {
            utils.act_push_origin(output, x);
            x.startIndex = env.input_i;
            let p = env.input_i+1, q;
            p = utils.search_next(env.input, p, utils.SEARCH_SKIPSPACEN);
            x.name = env.input[p].token;
            p = utils.search_next(env.input, p+1, { key: 'token', stop: ['{'] });
            x.endIndex = env.input[p].endIndex;
            clear_attr(env.input[p]);
         }, (x, env) => x.token === 'class', origin_state
      ));
      origin_state.register_condition(new fsm.Condition(
         5, (output, x, env) => {
            utils.act_push_origin(output, x);
            x.startIndex = env.input_i;
            let p = env.input_i+1, q;
            p = utils.search_next(env.input, p, utils.SEARCH_SKIPSPACEN);
            if (env.input[p].token !== '(') {
               x.name = env.input[p].token;
               p = utils.search_next(env.input, p+1, utils.SEARCH_SKIPSPACEN);
            }
            // now env.input[p] should be '('
            q = env.input[p].endIndex;
            clear_attr(env.input[p]);
            p = utils.search_next(env.input, q+1, { key: 'token', stop: '{' });
            x.endIndex = env.input[p].endIndex;
            clear_attr(env.input[p]);
         }, (x, env) => x.token === 'function', origin_state
      ));
      // lambda, class function
      origin_state.register_condition(new fsm.Condition(
         5, (output, x, env) => {
            utils.act_push_origin(output, x);
            let p = x.endIndex+1, q;
            p = utils.search_next(env.input, p, utils.SEARCH_SKIPSPACEN);
            // standalone bracket or function call
            if (p < 0) {
               clear_attr(x);
               return;
            }
            if (p < env.input.length-1 && env.input[p].token === '=' && env.input[p+1].token === '>') {
               // lambda
               p = utils.search_next(env.input, p+2, utils.SEARCH_SKIPSPACEN);
               if (p >= 0 && env.input[p].token === '{') {
                  x.endIndex = env.input[p].endIndex;
                  clear_attr(env.input[p]);
               } else {
                  q = detect_end_of_statement(env.input, p, env, (input, index, last, ch, env) => {
                     return ch.token === ',';
                  });
                  x.endIndex = q;
               }
               x.name = '-';
            } else if (env.input[p].token === '{') {
               // class function
               q = utils.search_prev(env.input, x.startIndex-1, utils.SEARCH_SKIPSPACEN);
               if (q >= 0 && !utils.contains(utils.common_stops, env.input[q].token && !env.input[q].tag)) {
                  env.input[q].startIndex = q;
                  env.input[q].endIndex = env.input[p].endIndex;
                  clear_attr(env.input[p]);
               }
               clear_attr(x);
            } else {
               clear_attr(x);
            }
         }, (x, env) => x.token === '(' && x.startIndex, origin_state
      ));
      // standalone block
      origin_state.register_condition(new fsm.Condition(
         5, (output, x, env) => {
            utils.act_push_origin(output, x);
            clear_attr(x);
         }, (x, env) => x.token === '{' && x.startIndex, origin_state
      ));
      this.register_state('origin', origin_state);
      this.set_entry('origin');

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
                  return i-1;
               } else if (last.tag || !utils.contains(utils.common_stops, last.token)) {
                  if (last.token !== 'return') {
                     if (last.tag !== utils.TAG_STRING && ch.tag === utils.TAG_STRING) return i-1;
                     if (!utils.contains(utils.common_stops, ch.token)) return i-1;
                     if (ch.tag === utils.TAG_REGEX) return i-1;
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

      function clear_attr(x) {
         delete x.startIndex;
         delete x.endIndex;
         delete x.bracketDeepth;
      }
   }
}

module.exports = {
   RubyScope,
   PythonLambdaScope,
   PythonScope,
   BracketScope,
   JavaScriptScope
};