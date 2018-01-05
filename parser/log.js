const fs = require('fs');

const fsm = require('./fsm');
const utils = require('../utils');

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
   }

   process(filename) {
   }
}

module.exports = {
   BuildLogScope,
   BuildLogTokenizer
}