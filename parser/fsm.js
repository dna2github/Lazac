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
      input.forEach((x, i) => {
         this.env.input_i = i;
         cursor = cursor.next(x, this.env);
         cursor.act(output, x, this.env);
         cursor = cursor.state;
      });
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
               tag: null
            });
         }, always)
      );
      empty_state.bydefault.state = empty_state;
      this.register_state('epsilon', empty_state);
      this.set_entry('epsilon');
   }
}

class FeatureCStyleString extends Feature {
   constructor(marks) {
      super();
      let string_state = new State(
         new Condition(0, this._concat, always)
      );
      let string_escape_state = new State(
         new Condition(0, this._concat, always, string_state)
      );
      string_state.register_condition(new Condition(
         0, this._concat,
         (x, env) => x.token === '\\',
         string_escape_state
      ));
      this.register_state('c_style_string', string_state);
      this.register_state('c_style_string_escape', string_escape_state);
      this.marks = marks || ['\'', '"'];
      this.env.stop_mark = null;
      this.set_entry(null);
   }

   merge_feature_to(feature) {
      // merge to feature root
      // connect c_style_string to epsilon
      if (!('epsilon' in feature.state)) return;
      let epsilon = feature.state.epsilon;
      let string_state = this.state.c_style_string;
      epsilon.register_condition(new Condition(
         5, (output, x, env) => {
            output.push({
               token: x.token,
               tag: 'S'
            });
            env.stop_mark = x.token;
         }, (x, env) => {
            return contains(this.marks, x.token);
         }, string_state
      ));
      string_state.register_condition(new Condition(
         5, (output, x, env) => {
            this._concat(output, x, env);
            env.stop_mark = null;
         }, (x, env) => {
            return env.stop_mark === x.token;
         }, epsilon
      ));
      return feature;
   }

   _concat(output, x, env) {
      let m = last(output);
      m.token += x.token;
   }
}

function always() {
   return true;
}

function last(array) {
   return array[array.length - 1];
}

function contains(array, value) {
   return array.indexOf(value) >= 0;
}

module.exports = {
   Condition,
   State,
   Feature,
   FeatureRoot,
   FeatureCStyleString
};