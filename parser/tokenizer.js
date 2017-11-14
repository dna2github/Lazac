const utils = require('../utils');
const fsm = require('./fsm');
const scope = require('./scope');

class WordTokenizer {
   process(text) {
      let output = [];
      let new_word = true;
      text.split('').forEach((ch) => {
         if (utils.common_stops.indexOf(ch) < 0) {
            if (new_word) {
               output.push(ch);
               new_word = false;
            } else {
               output.push(output.pop() + ch);
            }
         } else {
            output.push(ch);
            new_word = true;
         }
      });
      return output.map((x) => {
         return { token: x, tag: null };
      });
   }
}

class SymbolTokenizer {
   // merge like 'a' '_' 'b' => 'a_b'
   constructor(connectors) {
      this.connectors = connectors || ['_'];
   }

   process(input) {
      let output = [];
      let in_word = false;
      input.forEach((x) => {
         if (!x.tag && (utils.contains(this.connectors, x.token) || !utils.contains(utils.common_stops, x.token))) {
            if (in_word) {
               utils.last(output).token += x.token;
            } else {
               in_word = true;
               output.push({ token: x.token, tag: x.tag });
            }
         } else {
            in_word = false;
            output.push({ token: x.token, tag: x.tag });
         }
      });
      return output;
   }
}

class CCTokenizer {
   constructor() {
      this.parser = new fsm.FeatureRoot();
      this.features = [
         new fsm.FeatureCommonString(['\'', '"']),
         new fsm.FeatureCommonComment('c_style_line_comment', '//'.split(''), '\n', false),
         new fsm.FeatureCommonComment('c_style_multiline_comment', '/*'.split(''), '*/'.split(''), true)
      ];
      this.features.forEach((f) => {
         f.merge_feature_to(this.parser);
      });
   }

   process(text) {
      let input = new WordTokenizer().process(text);
      let tokens = this.parser.process(input);
      tokens = new SymbolTokenizer().process(tokens);
      return tokens;
   }
}

class JavaScriptTokenizer {
   constructor() {
      this.parser = new fsm.FeatureRoot();
      this.features = [
         new fsm.FeatureCommonString(['\'', '"', '`']),
         new fsm.FeatureCommonComment('c_style_line_comment', '//'.split(''), '\n', false),
         new fsm.FeatureCommonComment('c_style_multiline_comment', '/*'.split(''), '*/'.split(''), true)
      ];
      this.features.forEach((f) => {
         f.merge_feature_to(this.parser);
      });
   }

   process(text) {
      let input = new WordTokenizer().process(text);
      let tokens = this.parser.process(input);
      tokens = new SymbolTokenizer().process(tokens);
      return tokens;
   }
}

class PythonTokenizer {
   constructor() {
      this.parser = new fsm.FeatureRoot();
      this.features = [
         new fsm.FeatureCommonString(['\'', '"']),
         new fsm.FeatureCommonComment('python_style_line_comment', '#', '\n', false)
      ];
      this.features.forEach((f) => {
         f.merge_feature_to(this.parser);
      });
      f[0].merge_feature_as_python_doc_to(this.parser);
   }

   process(text) {
      let input = new WordTokenizer().process(text);
      let tokens = this.parser.process(input);
      tokens = new SymbolTokenizer().process(tokens);
      return tokens;
   }
}

class RubyTokenizer {
   constructor() {
      this.parser = new fsm.FeatureRoot();
      new fsm.FeatureCommonString(['\'', '"', '`']).merge_feature_as_ruby_expandable_string_to(this.parser);
      new fsm.FeatureCommonString(['/']).merge_feature_as_regex(this.parser);
      this.features = [
         new fsm.FeatureCommonComment('ruby_style_line_comment', '#', '\n', false),
         new fsm.FeatureRubyHereDocString(),
         new fsm.FeatureRubyPercentString(),
         new fsm.FeatureDolarSign(),
         new fsm.FeatureCommonComment('ruby_multiline_comment', ['=', 'begin'], ['\n', '=', 'end'], true),
         new fsm.FeatureRubyENDDoc()
      ];
      this.features.forEach((f) => {
         f.merge_feature_to(this.parser);
      });
   }

   process(text) {
      let input = new WordTokenizer().process(text);
      let tokens = this.parser.process(input);
      tokens = new SymbolTokenizer(['_', '@']).process(tokens);
      tokens = new scope.RubyScope().process(tokens);
      return tokens;
   }
}

module.exports = {
   WordTokenizer,
   SymbolTokenizer,
   CCTokenizer,
   PythonTokenizer,
   JavaScriptTokenizer,
   RubyTokenizer
};