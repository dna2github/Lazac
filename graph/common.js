const fs = require('fs');

/* graph = {nodes: { id, node }, autoid} */

function create() {
   return { nodes: {}, autoid: 0 };
}

function add(graph, obj) {
   let node = Object.assign({ links: {} }, obj);
   graph.audoid ++;
   node.id = graph.autoid;
   graph.nodes[node.id] = node;
   return node;
}

function del(graph, id) {
   let node = graph.nodes[id];
   if (!node) return null;
   delete graph.nodes[id];
   // cascade delete links
   Object.keys(node.links).forEach((to) => {
      to = graph.nodes[to];
      if (!to) return;
      delete to.links[id];
   });
   return node;
}

function load(filename) {
   let graph = JSON.parse(fs.readFileSync(filename).toString());
   if (graph) {
      if (!graph.autoid) graph.autoid = 0;
   }
   return graph;
}

function save(graph, filename) {
   fs.writeFileSync(filename, JSON.stringify(graph));
   return graph;
}

module.exports = {
   create,
   add,
   del,
   load,
   save
};