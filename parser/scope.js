const utils = require('../utils');
const fsm = require('./fsm');

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
            x.startIndex = env.input_i;
            let p = env.input_i+1, q;
            p = utils.search_next(env.input, p, utils.SEARCH_SKIPSPACEN);
            p = skip_next_comment(env.input, p, utils.SEARCH_SKIPSPACEN);
            x.name = env.input[p].token;
            p = utils.search_next(env.input, p+1, { key: 'token', stop: ['{'] });
            x.endIndex = env.input[p].endIndex;
            clear_bracket_attr(env.input[p]);
         }, (x, env) => x.token === 'class', origin_state
      ));
      // function
      origin_state.register_condition(new fsm.Condition(
         5, (output, x, env) => {
            utils.act_push_origin(output, x);
            x.startIndex = env.input_i;
            let p = env.input_i+1, q;
            p = utils.search_next(env.input, p, utils.SEARCH_SKIPSPACEN);
            p = skip_next_comment(env.input, p, utils.SEARCH_SKIPSPACEN);
            if (env.input[p].token !== '(') {
               // e.g. function hello, function $query
               q = utils.search_next(env.input, p+1, { key: 'token', stop: ['('] });
               x.name = env.input.slice(p+1, q).map((x) => x.token).join('').trim();
               p = q;
            }
            // now env.input[p] should be '('
            q = env.input[p].endIndex;
            clear_bracket_attr(env.input[p]);
            p = utils.search_next(env.input, q+1, { key: 'token', stop: ['{'] });
            x.endIndex = env.input[p].endIndex;
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
            } else if (env.input[p].token === '{') {
               // class function
               q = utils.search_prev(env.input, x.startIndex-1, utils.SEARCH_SKIPSPACEN);
               q = skip_prev_comment(env.input, q, utils.SEARCH_SKIPSPACEN);
               if (q >= 0 && !utils.contains(utils.common_stops, env.input[q].token && !env.input[q].tag)) {
                  env.input[q].startIndex = q;
                  env.input[q].endIndex = env.input[p].endIndex;
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
               delete x.java_parent;
            } else {
               // event -> event.trigger()
               p = utils.search_prev(env.input, env.input_i-1, utils.SEARCH_SKIPSPACEN);
               p = skip_prev_comment(env.input, p, utils.SEARCH_SKIPSPACEN);
               env.input[p].startIndex = p;
               env.input[p].endIndex = x.endIndex;
               env.input[p].name = '-';
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
               let deep = 1;
               while (q > 0 && deep > 0) {
                  q --;
                  if (env.input[q].token === '>') {
                     deep ++;
                  } else if (env.input[q].token === '<') {
                     deep --;
                  }
               }
               p = q;
               q = utils.search_prev(env.input, p-1, utils.SEARCH_SKIPSPACEN);
               q = skip_prev_comment(env.input, q, utils.SEARCH_SKIPSPACEN);
            }
            if (q >= 0 && env.input[q].token === 'static') {
               p = q;
               q = utils.search_prev(env.input, p-1, utils.SEARCH_SKIPSPACEN);
               q = skip_prev_comment(env.input, q, utils.SEARCH_SKIPSPACEN);
            }
            if (q >= 0 && utils.contains(['public', 'private', 'protected'], env.input[q].token)) {
               p = q;
            }
            if (env.input[p].java_parent) {
               q = env.input[p].java_parent;
               delete env.input[p].java_parent;
            } else {
               q = env.input[p];
               q.startIndex = p;
            }
            q.endIndex = x.endIndex;
            q.name = name;
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
               let deep = 1;
               while (deep > 0) {
                  p = utils.search_next(env.input, p+1, utils.SEARCH_SKIPSPACEN);
                  if (env.input[p].token === '<') {
                     deep ++;
                  } else if (env.input[p].token === '>') {
                     deep --;
                  }
               }
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
               p = utils.search_prev(env.input, st-2, utils.SEARCH_SKIPSPACEN);
            } else {
               p = utils.search_prev(env.input, st-1, utils.SEARCH_SKIPSPACEN);
            }
            p = skip_prev_comment(env.input, p, utils.SEARCH_SKIPSPACEN);
            if (p >= 0 && env.input[p].token === 'abstract') {
               st = p;
               p = utils.search_prev(env.input, st-1, utils.SEARCH_SKIPSPACEN);
               p = skip_prev_comment(env.input, p, utils.SEARCH_SKIPSPACEN);
            }
            if (p >= 0 && env.input[p].token === 'static') {
               st = p;
               p = utils.search_prev(env.input, st-1, utils.SEARCH_SKIPSPACEN);
               p = skip_prev_comment(env.input, p, utils.SEARCH_SKIPSPACEN);
            }
            if (p >= 0 && utils.contains(['public', 'private', 'protected'], env.input[p].token)) {
               st = p;
            }
            if (env.input[st].java_parent) {
               env.input[st].java_parent.name = name;
               env.input[st].java_parent.endIndex = ed;
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
            p.endIndex = ed;
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
            q = utils.search_prev(env.input, x.startIndex-1, utils.SEARCH_SKIPSPACEN);
            q = skip_prev_comment(env.input, q, utils.SEARCH_SKIPSPACEN);
            // generic
            // <T>, <T<X>> ...
            if (q >= 0 && env.input[q].token === '>') {
               let deep = 1;
               while (q > 0 && deep > 0) {
                  q --;
                  if (env.input[q].token === '>') {
                     deep ++;
                  } else if (env.input[q].token === '<') {
                     deep --;
                  }
               }
               q = utils.search_prev(env.input, q-1, utils.SEARCH_SKIPSPACEN);
               q = skip_prev_comment(env.input, q, utils.SEARCH_SKIPSPACEN);
            }
            // function name
            name = env.input[q].token;
            if (utils.contains(['if', 'switch', 'catch', 'while', 'for', 'return'], name)) {
               return;
            }
            if (utils.contains(utils.common_stops, name)) {
               // e.g. public override bool operator== (Test x) { ... }
               p = q;
               q = utils.search_prev(env.input, q-1, { key:'token', stop:['operator'] });
               name = env.input.slice(q+1, p+1).map((x) => x.token).join('').trim();
            }
            p = q;
            // return type
            p = utils.search_prev(env.input, p-1, utils.SEARCH_SKIPSPACEN);
            p = skip_prev_comment(env.input, p, utils.SEARCH_SKIPSPACEN);
            // e.g. int[][][]
            if (p >= 0 && env.input[p].token === ']') {
               while (p >= 0 && env.input[p].token === ']') {
                  p = utils.search_prev(env.input, p-1, { key: 'token', stop:['['] });
                  clear_bracket_attr(env.input[p]);
                  p = utils.search_prev(env.input, p-1, utils.SEARCH_SKIPSPACEN);
                  p = skip_prev_comment(env.input, p, utils.SEARCH_SKIPSPACEN);
               }
            // function call +test(1,2); a[0].test(1,2); new A(); ...
            } else if (p >= 0 && utils.contains(utils.common_stops, env.input[p].token)) {
               return;
            } else if (p >= 0 && utils.contains(['return', 'new', 'await'], env.input[p].token)) {
               return;
            }
            //             /-- q
            //            v  v-- p
            // e.g. System.Data
            q = utils.search_prev(env.input, p-1, utils.SEARCH_SKIPSPACEN);
            while (q >= 0 && (env.input[q].token === '.')) {
               p = utils.search_prev(env.input, q-1, utils.SEARCH_SKIPSPACEN);
               q = utils.search_prev(env.input, p-1, utils.SEARCH_SKIPSPACEN);
            }
            q = skip_prev_comment(env.input, q, utils.SEARCH_SKIPSPACEN);
            while (q >= 0 && utils.contains([
               'delegate', 'abstract', 'async', 'extern', 'static', 'public', 'private', 'protected',
               'sealed', 'virtual', 'override', 'unsafe', 'volatile', 'partial'
            ], env.input[q].token)) {
               p = q;
               q = utils.search_prev(env.input, p-1, utils.SEARCH_SKIPSPACEN);
               q = skip_prev_comment(env.input, q, utils.SEARCH_SKIPSPACEN);
            }
            // attribute (annotation)
            if (q >= 0 && env.input[q].token === ']') {
               p = q;
               while (p >= 0 && env.input[p].token === ']') {
                  do {
                     q = utils.search_prev(env.input, q-1, { key: 'token', stop:['['] });
                  } while (env.input[q].endIndex !== p);
                  clear_bracket_attr(env.input[q]);
                  p = q;
                  p = utils.search_prev(env.input, p-1, utils.SEARCH_SKIPSPACEN);
                  p = skip_prev_comment(env.input, p, utils.SEARCH_SKIPSPACEN);
               }
               p = q;
            }
            q = env.input[p];
            q.startIndex = p;
            q.endIndex = ed;
            q.name = name;
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
               let deep = 1;
               while (deep > 0) {
                  p = utils.search_next(env.input, p+1, utils.SEARCH_SKIPSPACEN);
                  if (env.input[p].token === '<') {
                     deep ++;
                  } else if (env.input[p].token === '>') {
                     deep --;
                  }
               }
               p = utils.search_next(env.input, p+1, utils.SEARCH_SKIPSPACEN);
               p = skip_next_comment(env.input, p, utils.SEARCH_SKIPSPACEN);
            }
            // skip inheritance
            // should have { ... } for body
            p = utils.search_next(env.input, p, { key: 'token', stop: ['{'] });
            ed = env.input[p].endIndex;
            clear_bracket_attr(env.input[p]);
            //                                               <-- search back
            // [public/private/protected] [static] [abstract] X ...
            p = utils.search_prev(env.input, st-1, utils.SEARCH_SKIPSPACEN);
            p = skip_prev_comment(env.input, p, utils.SEARCH_SKIPSPACEN);
            while (p >= 0 && utils.contains([
               'partial', 'abstract', 'static', 'public', 'private', 'protected'
            ], env.input[p].token)) {
               st = p;
               p = utils.search_prev(env.input, st-1, utils.SEARCH_SKIPSPACEN);
               p = skip_prev_comment(env.input, p, utils.SEARCH_SKIPSPACEN);
            }
            // attribute (annotation)
            q = p;
            if (q >= 0 && env.input[q].token === ']') {
               p = q;
               while (p >= 0 && env.input[p].token === ']') {
                  do {
                     q = utils.search_prev(env.input, q-1, { key: 'token', stop:['['] });
                  } while (env.input[q].endIndex !== p);
                  clear_bracket_attr(env.input[q]);
                  p = q;
                  p = utils.search_prev(env.input, p-1, utils.SEARCH_SKIPSPACEN);
                  p = skip_prev_comment(env.input, p, utils.SEARCH_SKIPSPACEN);
               }
               st = q;
            }
            q = env.input[st];
            q.startIndex = st;
            q.endIndex = ed;
            q.name = name;
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
            clear_bracket_attr(env.input[p]);
         }, (x, env) => x.token === 'delegate', origin_state
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
            if (Array.isArray(x.token)) {
            }
            if (x.token.charAt(0) === '#') {
            }
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
   }
}

class GoScope extends CLikeScope {
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

class CScope extends CLikeScope {
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
      let origin_state = new fsm.State(new fsm.Condition(
         0, utils.act_push_origin, utils.always
      ));
      this.register_state('origin', origin_state);
      this.set_entry('origin');
   }
}

module.exports = {
   RubyScope,
   PythonLambdaScope,
   PythonScope,
   BracketScope,
   CLikeScope,
   JavaScriptScope,
   JavaScope,
   CsharpScope,
   GoScope,
   CPrecompileScope,
   CScope,
   ObjectiveCScope
};
