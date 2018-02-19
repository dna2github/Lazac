const fs = require('fs');

const fsm = require('./fsm');
const tokenizer = require('./tokenizer');
const utils = require('../utils');

class FeatureEmail extends fsm.Feature {
   constructor() {
      super();
      this.set_entry(null);
   }

   merge_feature_to(feature) {
      if (!('epsilon' in feature.state)) return;
      let epsilon = feature.state.epsilon;
      epsilon.register_condition(new fsm.Condition(
         5, utils.act_harvest, (x, env) => {
            if (x.token !== '@') return false;
            let st, ed;
            st = utils.search_prev(env.input, env.input_i-1, {
               key: 'token', stop: utils.common_stops_without_underscore
            }) + 1;
            if (st < 0 || env.input_i-st < 1) return false;
            ed = utils.search_next(env.input, env.input_i+1, {
               key: 'token', stop: ['.'].concat(utils.common_space)
            });
            if (ed < 0 || env.input[ed].token !== '.') return false;
            ed = utils.search_next(env.input, ed+1, {
               key: 'token', stop: utils.common_stops_without_underscore
            }) - 1;
            if (ed < 0) ed = env.input.length - 1;
            if (ed - env.input_i <= 2) return false;
            env.range = {start: st, end: ed, tag: 'email'};
            return true;
         }, epsilon
      ));
      return feature;
   }
}

class FeatureUrl extends fsm.Feature {
   constructor() {
      super();
      this.set_entry(null);
   }

   merge_feature_to(feature) {
      if (!('epsilon' in feature.state)) return;
      let epsilon = feature.state.epsilon;
      epsilon.register_condition(new fsm.Condition(
         5, utils.act_harvest, (x, env) => {
            if (x.token !== ':') return false;
            if (utils.next(env.input, env.input_i, 'token') !== '/') return false;
            if (utils.next(env.input, env.input_i+1, 'token') !== '/') return false;
            let st, ed;
            st = utils.search_prev(env.input, env.input_i-1, utils.SEARCH_STOPSPACEN) + 1;
            if (st < 0 || env.input_i-st < 1) return false;
            ed = utils.search_next(env.input, env.input_i+1, utils.SEARCH_STOPSPACEN) - 1;
            if (ed < 0) ed = env.input.length - 1;
            if (ed - env.input_i <= 2) return false;
            env.range = {start: st, end: ed, tag: 'url'};
            return true;
         }, epsilon
      ));
      return feature;
   }
}

class FeatureDateTime extends fsm.Feature {
   constructor() {
      super();
      this.set_entry(null);
   }

   is_number(num_str) {
      return /[0-9]+/.test(num_str);
   }

   search_for_3triple(punc, env) {
      // e.g. 2018-01-01, 01/01/2018, 00:30:00
      let x = env.input[env.input_i];
      let st = 0, ed = env.input.length;
      for (let i = env.input_i-1; i >= 0; i--) {
         if (!this.is_number(env.input[i].token)) {
            st = i + 1;
            break;
         }
      }
      if (st === env.input_i) return null;
      for (let i = env.input_i+1; i < env.input.length; i++) {
         let x = env.input[i];
         if (!this.is_number(x.token) && x.token !== punc) {
            ed = i - 1;
            break;
         }
      }
      if (ed === env.input_i) return null;
      let token = env.input.slice(st, ed+1).map((x) => x.token).join('');
      if (new RegExp('[0-9]+' + punc + '[0-9]+' + punc + '[0-9]+').test(token)) {
         return {start: st, end: ed, tag: punc===':'?'time':'date'};
      } else {
         return null;
      }
   }

   merge_feature_to(feature) {
      if (!('epsilon' in feature.state)) return;
      let epsilon = feature.state.epsilon;
      epsilon.register_condition(new fsm.Condition(
         5, utils.act_harvest, (x, env) => {
            if ([':', '/', '-'].indexOf(x.token) < 0) return false;
            let r = this.search_for_3triple(x.token, env);
            if (r) {
               env.range = r;
               return true;
            }
            return false;
         }, epsilon
      ));
      return feature;
   }
}

class FeaturePath extends fsm.Feature {
   constructor() {
      super();
      this.set_entry(null);
   }

   merge_feature_to(feature) {
      if (!('epsilon' in feature.state)) return;
      let epsilon = feature.state.epsilon;
      epsilon.register_condition(new fsm.Condition(
         5, utils.act_harvest, (x, env) => {
            if (x.token !== '/') return false;
            let st, ed;
            st = utils.search_prev(env.input, env.input_i-1, utils.SEARCH_STOPSPACEN) + 1;
            if (st < 0 || env.input_i-st < 1) return false;
            ed = utils.search_next(env.input, env.input_i+1, utils.SEARCH_STOPSPACEN) - 1;
            if (ed < 0) ed = env.input.length - 1;
            if (ed - env.input_i <= 2) return false;
            env.range = {start: st, end: ed, tag: 'path'};
            return true;
         }, epsilon
      ));
      return feature;
   }
}

class BuildLogScope extends fsm.Feature {
   constructor() {
      super();
      let origin_state = new fsm.State(new fsm.Condition(
         0, utils.act_push_origin, utils.always
      ));
      this.register_state('origin', origin_state);
      this.set_entry('origin');
   }
}

class BuildLogTokenizer {
   constructor() {
      this.parser = new fsm.FeatureRoot();
      this.features = [
         new FeatureEmail(),
         new FeatureUrl(),
         new FeatureDateTime(),
         new FeaturePath()
      ];
      this.features.forEach((f) => {
         f.merge_feature_to(this.parser);
      });
   }

   process(text) {
      let input = new tokenizer.WordTokenizer().process(text);
      let tokens = this.parser.process(input);
      return tokens;
   }
}

module.exports = {
   BuildLogScope,
   BuildLogTokenizer
}