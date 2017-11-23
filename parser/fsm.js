const utils = require('../utils');

class Condition {
   constructor(priority, act, check, state) {
      this.priority = priority;
      this.act = act;
      this.check = check;
      this.state = state;
   }
}

class State {
   constructor(bydefault) {
      this.transform = [];
      this.bydefault = bydefault;
      if (this.bydefault && !this.bydefault.state) {
         this.bydefault.state = this;
      }
   }

   register_condition(condition) {
      if(!this.transform.length) {
         this.transform.push(condition);
         return 0;
      }
      let i = 0;
      while (i < this.transform.length && this.transform[i].priority <= condition.priority) {
         ++i;
      }
      this.transform.splice(i, 0, condition);
      return i;
   }

   remove_condition(condition) {
      let i = this.transform.indexOf(condition);
      if (i < 0) return i;
      this.transform.splice(i, 1);
      return i;
   }

   next(item, env) {
      for (let i = 0; i < this.transform.length; ++i) {
         let condition = this.transform[i];
         if (condition.check(item, env)) {
            return condition;
         }
      }
      return this.bydefault;
   }
}

class Feature {
   constructor() {
      this.state = {};
      this.entry = null;
      this.env = {};
   }

   merge_feature_to(feature) {
      return;
   }

   register_state(name, state) {
      this.state[name] = state;
   }

   set_entry(name) {
      this.entry = name;
   }

   process(input) {
      // input = [ { token: characters, tag: name } ]
      this.env.input = input;
      let output = [];
      let cursor = this.state[this.entry];
      for(let i = 0, n = input.length; i < n; ++i ) {
         let x = input[i];
         this.env.input_i = i;
         cursor = cursor.next(x, this.env);
         let offset = cursor.act(output, x, this.env);
         if (offset) {
            i += offset - 1;
         }
         cursor = cursor.state;
      }
      delete this.env.input;
      delete this.env.input_i;
      return output;
   }
}

class FeatureRoot extends Feature {
   constructor() {
      super();
      let empty_state = new State(
         new Condition(0, (output, x, env) => {
            output.push({
               token: x.token,
               tag: x.tag
            });
         }, utils.always)
      );
      this.register_state('epsilon', empty_state);
      this.set_entry('epsilon');
   }
}

class FeatureCommonString extends Feature {
   constructor(marks) {
      super();
      let string_state = new State(
         new Condition(0, utils.act_concat, utils.always)
      );
      let string_escape_state = new State(
         new Condition(0, utils.act_concat, utils.always, string_state)
      );
      string_state.register_condition(new Condition(
         0, utils.act_concat,
         (x, env) => x.token === '\\',
         string_escape_state
      ));
      this.register_state('common_string', string_state);
      this.register_state('common_string_escape', string_escape_state);
      this.marks = marks || ['\'', '"'];
      this.env.stop_mark = null;
      this.set_entry(null);
   }

   merge_feature_to(feature) {
      // merge to feature root
      // connect common_string to epsilon
      if (!('epsilon' in feature.state)) return;
      let epsilon = feature.state.epsilon;
      let string_state = this.state.common_string;
      epsilon.register_condition(new Condition(
         5, (output, x, env) => {
            output.push({
               token: x.token,
               tag: utils.TAG_STRING
            });
            env.stop_mark = x.token;
         }, (x, env) => {
            return utils.contains(this.marks, x.token);
         }, string_state
      ));
      string_state.register_condition(new Condition(
         5, (output, x, env) => {
            utils.act_concat(output, x, env);
            env.stop_mark = null;
         }, (x, env) => {
            return env.stop_mark === x.token;
         }, epsilon
      ));
      return feature;
   }

   merge_feature_as_python_doc_to(feature) {
      // merge to feature root
      // connect common_string to epsilon
      if (!('epsilon' in feature.state)) return;
      let epsilon = feature.state.epsilon;
      let string_state = this.state.common_string;
      epsilon.register_condition(new Condition(
         5, (output, x, env) => {
            // ''' """
            let punc = x.token.repeat(3);
            output.push({
               token: punc,
               tag: utils.TAG_STRING
            });
            env.stop_mark = punc;
            return 3;
         }, (x, env) => {
            return (
               utils.contains(this.marks, x.token) &&
               utils.text_cmp_n(x.token.repeat(3), env.input, env.input_i, 3)
            );
         }, string_state
      ));
      string_state.register_condition(new Condition(
         5, (output, x, env) => {
            utils.act_concat(output, { token: env.stop_mark }, env);
            env.stop_mark = null;
            return 3;
         }, (x, env) => {
            return (
               utils.contains(this.marks, x.token) &&
               utils.text_cmp_n(env.stop_mark, env.input, env.input_i, 3)
            );
         }, epsilon
      ));
      return feature;
   }

   merge_feature_as_ruby_expandable_string_to(feature) {
      // merge to feature root
      // connect common_string to epsilon
      if (this.state.ruby_expandable_string) return fature;
      let expandable_state = new State(
         new Condition(0, utils.act_concat, utils.always)
      );
      let string_state = this.state.common_string;
      string_state.register_condition(new Condition(
         5, (output, x, env) => {
            utils.act_concat(output, x, env);
            return 2;
         }, (x, env) => {
            if (x.token !== '#') return false;
            if (env.input_i + 1 < env.input.length && env.input[env.input_i+1] == '{') return true;
            return false;
         }, expandable_state
      ));
      expandable_state.register_condition(new Condition(
         5, utils.act_concat, (x, env) => {
            return x.token === '}';
         }, string_state
      ));
      this.register_state('ruby_expandable_string', expandable_state);
      return this.merge_feature_to(feature);
   }

   merge_feature_as_regex(feature) {
      // merge to feature root
      // connect common_string to epsilon
      if (!('epsilon' in feature.state)) return;
      let epsilon = feature.state.epsilon;
      let string_state = this.state.common_string;
      epsilon.register_condition(new Condition(
         5, (output, x, env) => {
            output.push({
               token: x.token,
               tag: utils.TAG_REGEX
            });
            env.stop_mark = x.token;
         }, (x, env) => {
            if (!utils.contains(this.marks, x.token)) return false;
            for(let i = env.input_i-1; i >= 0; i--) {
               if (utils.contains([' ', '\t'], env.input[i].token)) continue;
               if (utils.contains(['=', '~', '!', '&', '|', '^', '[', '{', '<', '('], env.input[i].token)) return true;
               return false;
            }
            return false;
         }, string_state
      ));
      string_state.register_condition(new Condition(
         5, (output, x, env) => {
            utils.act_concat(output, x, env);
            env.stop_mark = null;
         }, (x, env) => {
            return env.stop_mark === x.token;
         }, epsilon
      ));
      return feature;
   }
}

class FeatureCommonComment extends Feature {
   constructor(state_name, start, end, include_end, tag) {
      super();
      let comment = new State(
         new Condition(0, utils.act_concat, utils.always)
      );
      this.register_state(state_name, comment);
      this.set_entry(null);
      // e.g. start = ['/', '/'], end = ['\n'], include_end = false
      //      start = ['/', '*'], end = ['*', '/'], include_end = true
      if (Array.isArray(start)) {
         this.env.start_len = start.length;
         this.env.start = start.join('');
      } else {
         this.env.start_len = 1;
         this.env.start = start;
      }
      if (Array.isArray(end)) {
         this.env.end_len = end.length;
         this.env.end = end.join('');
      } else {
         this.env.end_len = 1;
         this.env.end = end;
      }
      this.env.include_end = include_end;
      this.env.tag = tag || utils.TAG_COMMENT;
   }

   merge_feature_to(feature) {
      // merge to feature root
      // connect common_string to epsilon
      if (!('epsilon' in feature.state)) return;
      let epsilon = feature.state.epsilon;
      let comment = this.state[Object.keys(this.state)[0]];
      let start = this.env.start;
      let start_len = this.env.start_len;
      let end = this.env.end;
      let end_len = this.env.end_len;
      let include_end = this.env.include_end;
      let tag = this.env.tag;
      epsilon.register_condition(new Condition(
         5, (output, x, env) => {
            output.push({ token: start, tag: tag });
            return start_len;
         }, utils.factory_text_cmp(start, start_len), comment
      ));
      comment.register_condition(new Condition(
         5, (output, x, env) => {
            if (include_end) {
               utils.act_concat(output, { token: end }, env);
            } else {
               output.push({ token: end, tag: null });
            }
            return end_len;
         }, utils.factory_text_cmp(end, end_len), epsilon
      ));
      return feature;
   }
}

class FeatureDolarSign extends Feature {
   // e.g. $@, $0, $', $<
   constructor(){
      super();
      this.set_entry(null);
   }

   merge_feature_to(feature) {
      // merge to feature root
      // connect common_string to epsilon
      if (!('epsilon' in feature.state)) return;
      let epsilon = feature.state.epsilon;
      epsilon.register_condition(new Condition(
         5, (output, x, env) => {
            output.push({ token: x.token, tag: x.tag });
            let next_token = env.input[env.input_i+1];
            if (next_token) {
               output.push({ token: next_token.token, tag: next_token.tag });
               return 2;
            } else {
               return 1;
            }
         }, (x, env) => {
            return x.token === '$';
         }, epsilon
      ));
      return feature;
   }
}

class FeatureRubyENDDoc extends Feature {
   constructor() {
      super();
      let end_state = new State(
         new Condition(0, utils.act_concat, utils.always)
      );
      this.register_state('ruby_end_doc', end_state);
      this.set_entry(null);
   }

   merge_feature_to(feature) {
      // merge to feature root
      // connect common_string to epsilon
      if (!('epsilon' in feature.state)) return;
      let epsilon = feature.state.epsilon;
      let end_state = this.state.ruby_end_doc;
      epsilon.register_condition(new Condition(
         5, (output, x, env) => {
            output.pop(); // pop '_'
            output.pop(); // pop '_'
            output.push({
               token: '__END__',
               tag: utils.TAG_COMMENT
            });
            return 3; // skip END__
         }, (x, env) => {
            if (x.token !== 'END') return false;
            if (env.input_i < 2 || env.input_i + 2 >= env.input.length) return false;
            if (env.input[env.input_i-2].token !== '_') return false;
            if (env.input[env.input_i-1].token !== '_') return false;
            if (env.input[env.input_i+1].token !== '_') return false;
            if (env.input[env.input_i+2].token !== '_') return false;
            return true;
         }, end_state
      ));
      return feature;
   }
}

class FeatureRubyHereDocString extends Feature {
   // e.g. <<-EOF
   //      hello world
   //      EOF
   constructor() {
      super();
      let string_state = new State(
         new Condition(0, utils.act_concat, utils.always)
      );
      let select_state = new State(
         new Condition(0, (output, x, env) => {
            utils.act_concat(output, x, env);
            env.stop_mark = x.token;
         }, utils.always, string_state)
      );
      select_state.register_condition(
         new Condition(5, utils.act_concat, (x, env) => {
            return utils.contains(['\'', '"', '-', '`'], x.token);
         }, select_state)
      );
      this.register_state('ruby_heredoc_string', string_state);
      this.register_state('ruby_heredoc_string_start_select', select_state);
      this.set_entry(null);
   }

   merge_feature_to(feature) {
      // merge to feature root
      // connect common_string to epsilon
      if (!('epsilon' in feature.state)) return;
      let epsilon = feature.state.epsilon;
      let string_state = this.state.ruby_heredoc_string;
      let select_state = this.state.ruby_heredoc_string_start_select;
      epsilon.register_condition(new Condition(
         5, (output, x, env) => {
            output.push({
               token: '<<',
               tag: utils.TAG_STRING
            });
            return 2;
         }, (x, env) => {
            if (x.token !== '<') return;
            if (env.input_i+2 >= env.input.length) return false;
            if (env.input[env.input_i+1].token !== '<') return false;
            if (!utils.contains([
               'EOF', '"', '\'', '`', '-'
            ], env.input[env.input_i+2].token)) return false;
            return true;
         }, select_state
      ));
      string_state.register_condition(new Condition(
         5, (output, x, env) => {
            utils.act_concat(output, x, env);
            env.stop_mark = null;
         }, (x, env) => {
            if (env.stop_mark === x.token) {
               if (env.input_i >= env.input.length) return true;
               return env.input[env.input_i+1].token === '\n';
            }
            return false;
         }, epsilon
      ));
      return feature;
   }
}

class FeatureRubyPercentString extends Feature {
   // e.g. %Q(h(e(l(l(o)w)o)r)ld)
   constructor() {
      super();
      let string_state = new State(
         new Condition(0, utils.act_concat, utils.always)
      );
      let string_escape_state = new State(
         new Condition(0, utils.act_concat, utils.always, string_state)
      );
      string_state.register_condition(
         new Condition(5, utils.act_concat, (x, env) => {
            return env.stop_mark !== '\\' && x.token === '\\';
         }, string_escape_state)
      );
      this.register_state('ruby_percent_string', string_state);
      this.register_state('ruby_percent_string_escape', string_escape_state);
      this.set_entry(null);
   }

   merge_feature_to(feature) {
      // merge to feature root
      // connect common_string to epsilon
      const starter = [
         '`', '~', '!', '@', '#', '$', '%', '^',
         '&', '*', '(', ')', '-', '_', '=', '+',
         '[', ']', '{', '}', '\\', '|', ';', ':',
         '\'', '"', '<', '>', ',', '.', '/', '?'
      ];
      const flag = ['q', 'Q', 'w', 'W', 'i', 'I', 'r', 'x', 's'];
      if (!('epsilon' in feature.state)) return;
      let epsilon = feature.state.epsilon;
      let string_state = this.state.ruby_percent_string;
      epsilon.register_condition(new Condition(
         5, (output, x, env) => {
            let token = '%' + env.flag + env.left_mark;
            output.push({
               token: token,
               tag: utils.TAG_STRING
            });
            env.deep = 1;
            switch(env.left_mark) {
               case '(': env.stop_mark = ')'; break;
               case '{': env.stop_mark = '}'; break;
               case '[': env.stop_mark = ']'; break;
               case '<': env.stop_mark = '>'; break;
               default: env.stop_mark = env.left_mark;
            }
            return token.length;
         }, (x, env) => {
            if (x.token !== '%') return false;
            let f1 = env.input[env.input_i+1];
            let f2 = env.input[env.input_i+2];
            if (!f1) return false;
            if (utils.contains(starter, f1.token)) {
               env.left_mark = f1.token;
               env.flag = '';
               return true;
            } else if (f2 && utils.contains(flag, f1.token) && utils.contains(starter, f2.token)) {
               env.left_mark = f2.token;
               env.flag = f1.token;
               return true;
            }
            return false;
         }, string_state
      ));
      string_state.register_condition(new Condition(
         5, (output, x, env) => {
            utils.act_concat(output, x, env);
            delete env.deep;
            delete env.left_mark;
            env.stop_mark = null;
         }, (x, env) => {
            if (x.token === env.stop_mark) {
               env.deep --;
               if (!env.deep) return true;
               return false;
            }
            if (x.token === env.left_mark) {
               env.deep ++;
            }
            return false;
         }, epsilon
      ));
      return feature;
   }
}

module.exports = {
   Condition,
   State,
   Feature,
   FeatureRoot,
   FeatureCommonString,
   FeatureCommonComment,
   FeatureDolarSign,
   FeatureRubyENDDoc,
   FeatureRubyHereDocString,
   FeatureRubyPercentString
};