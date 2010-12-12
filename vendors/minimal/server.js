var _ = require('../../lib/underscore')._;
var logger = require('../../lib/log').logger;


var sys    = require('sys'),
    Step   = require('../../lib/step'),
    Connect = require('../connect/lib/connect');

exports.start = function(path) {
    var env = { path: path, lang: 'zh', conn: function(key) { return this.conns[key]; } };

    Step(
      function() {
          require('./config').load(this, env);
      },
      function() {
          require('./template').load(this, env);
      },
      function(err) {
          if(err) throw err;

          function routes(app) {
              _(env.routers).chain().keys().each(function(key) {
                  app.get(env.routers[key], require('../../app/' + key).app(env));
              });
          }

          var server = Connect.createServer(
              Connect.logger(),
              Connect.conditionalGet(),
              Connect.router(routes),
              Connect.staticProvider(env.path + 'public')
          );

          server.listen(env.server.port, env.server.host);
      }
    );

}


