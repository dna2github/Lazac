const i_ws = require('ws');
const i_uuid = require('uuid');
const i_search = require('./search');

const data = {
   engine: {
      nimbus: null
   },
   dirmap: {
      project_name: '/path/to/project'
   }
};

function query_cancel(client, env, cmd, val) {
}

function send_json(client, obj) {
   client.send(JSON.stringify(obj));
}

function query_search(client, env, cmd, val) {
   if (!val.repository) {
      console.log('[debug]', env.name + ' no specified repository ...');
      send_json(client, { result: 'x' });
      return;
   }
   if (!val.search) {
      console.log('[debug]', env.name + ' no specified search text ...');
      send_json(client, { result: 'x' });
      return;
   }
   let repo = val.repository;
   if (!data.engine[repo]) {
      data.engine[repo] = i_search.load_engine_into_memory(data.dirmap[repo]);
   }
   let engine = data.engine[repo];
   if (!engine) {
      console.log('[debug]', env.name + ' no specified engine ...');
      send_json(client, { result: 'x' });
      return;
   }
   let doc_set = i_search.query(engine, val.search);
   send_json(client, { result: 'o', doc_set: doc_set });
}

function message_handler(client, env, message) {
   /* message = {command, value} */
   let cmd = message.command;
   let val = message.value;
   switch(cmd) {
      case 'search':
      query_cancel(client, env, cmd, val);
      query_search(client, env, cmd, val);
      break;
      case 'cancel':
      query_cancel(client, env, cmd, val);
      break;
   }
}

function websocket_handler(client) {
   let env = {
      name: i_uuid.v4(),
      timer: null,
      search: []
   };
   client.on('open', () => {
      console.log('[debug]', 'connected ...');
      env.timer = setInterval(() => {
         client.ping();
      }, 20*1000);
   });
   client.on('message', (message) => {
      console.log('[debug]', message);
      try {
         message = JSON.parse(message);
         message_handler(client, env, message);
      } catch(e) {}
   });
   client.on('close', () => {
      if (!env.name) {
         console.log('[debug]', env.name + ' closed ...');
         delete clients[env.name];
         clearInterval(env.timer);
      }
   });
   client.on('error', () => {
      if (!env.name) {
         console.log('[debug]', env.name + ' error ...');
         delete clients[env.name];
         clearInterval(env.timer);
      }
   });
}

module.exports = {
   bind: (server, path) => {
      const wssrv = new i_ws.Server({
         server: server,
         path: path
      });
      wssrv.on('connection', websocket_handler);
   }
};
