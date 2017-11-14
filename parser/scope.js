const utils = require('../utils');
const fsm = require('./fsm');

class RubyScope extends fsm.Feature {
   constructor () {
      super();
      this.env.block_stack = [];
      this.env.last_non_space = null;

      let origin_state = new fsm.State(new fsm.Condition(
         0, (output, x, env) => {
            utils.act_push_origin(output, x, env);
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
               if (env.input[env.input_i-1] && !utils.contains([' ', '\n', '\t', ';'], env.input[env.input_i-1].token)) {
                  break;
               }
               let block = env.block_stack.pop();
               block.endIndex = env.input_i;
               break;
            }
            if (x.token === '\n') {
               if (env.input[env.input_i-1] && env.input[env.input_i-1].token !== '\\') {
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

module.exports = {
   RubyScope
};