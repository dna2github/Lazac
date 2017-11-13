const fsm = require('./fsm');

const common_stops = [
   '~', '`', '!', '@', '#', '$', '%', '^', '&', '*', '(', ')',
   '-', '_', '=', '+', '{', '}', '[', ']', '\\', '|', ':', ';',
   '"', '\'', ',', '.', '<', '>', '/', '?', ' ', '\t', '\r', '\n'
];

class WordTokenizer {
   process(text) {
      let output = [];
      let new_word = true;
      text.split('').forEach((ch) => {
         if (common_stops.indexOf(ch) < 0) {
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
   // merge 'a' '_' 'b' => 'a_b'
   process(input) {
      let output = [];
      let in_word = false;
      input.forEach((x) => {
         if (x.token === '_' || common_stops.indexOf(x.token) < 0) {
            if (in_word) {
               last(output).token += x.token;
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
      this.features = [
         new fsm.FeatureCommonString(['\'', '"', '`']),
         new fsm.FeatureCommonComment('ruby_style_line_comment', '#', '\n', false),
         new fsm.FeatureRubyHereDocString(),
         new fsm.FeatureRubyPercentString(),
         new fsm.FeatureCommonComment('ruby_multiline_comment', ['=', 'begin'], ['\n', '=', 'end'], true)
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

function last (array) {
   return array[array.length-1];
}

module.exports = {
   WordTokenizer,
   SymbolTokenizer,
   CCTokenizer,
   PythonTokenizer,
   JavaScriptTokenizer,
   RubyTokenizer
};