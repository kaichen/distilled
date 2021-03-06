var _ = require('../../lib/underscore')._;
var logger = require('../../lib/log').logger;

var sys = require('sys');

var step   = require('../../lib/step'),
    connect = require('../connect/lib/connect');

var environment = require('./environment'),
    controller  = require('./controller');

function loadApp(env, app, key) {
    var applet = environment.access(env.controllers, key)(env),
        route = environment.access(env.routers, key);
    if (_.isFunction(applet)) {
        logger.info('load simple get at ' + key);
        app.get(route, applet);
    } else if (applet.index) {
        logger.info('load resource at ' + key);
        app.get(route + '/empty', applet.empty);
        app.show(route, applet.show);
        app.update(route, applet.update);
        app.destroy(route, applet.destroy);
        app.edit(route, applet.edit);
        app.post(route, applet.create);
        app.get(route, applet.index);
    } else {
        logger.info('load app at ' + key);
        if (applet.get) {
            app.get(route, applet.get);
        }
        if (applet.post) {
            app.post(route, applet.post);
        }
        if (applet.put) {
            app.put(route, applet.put);
        }
        if (applet.delete) {
            app.delete(route, applet.delete);
        }
    }
}

function getRealms(env) {
    var realms = {'_': []}, underRealms = [];
    environment.visit(env.routers, function(routekey, route) {
        environment.visit(env.realms, function(realmkey, realm) {
            if (routekey.indexOf(realmkey) !== -1) {
                if(!realms[realm]) {
                    realms[realm] = [];
                }
                if (realms[realm].indexOf(routekey) === -1) {
                    realms[realm].push(routekey);
                    underRealms.push(routekey);
                }
            }
        });
    });
    environment.visit(env.routers, function(routekey, route) {
        if (underRealms.indexOf(routekey) === -1) {
            realms['_'].push(routekey);
        }
    });
    return realms;
}

function base(route) {
    var part = route.split(':')[0];
    if (part[part.length - 1] === '/') {
        part = part.substring(0, part.length - 1);
    }
    return part;
}

function remnants(route) {
    return route.substring(base(route).length);
}

function auth(env, realm) {
    var auths = env.auths, usersInRealm = auths[realm], users = env.users;
    return function (user, pass) {
        return result = usersInRealm && user && pass &&
          _(usersInRealm).indexOf(user) !== -1 &&
          users[user] === pass;
    };
}

exports.start = function (path) {
    var env = { path: path };

    step(
      function () {
          require('./config').load(env, this);
      },
      function () {
          require('./template').load(env, this);
      },
      function () {
          controller.load(env, this);
      },
      function (err) {
          if (err) {
              throw err;
          }

          var realms = getRealms(env);
          function plainRoutes(app) {
              _(realms['_']).each(function (key) {
                  loadApp(env, app, key);
              });
          }

          var server = connect.createServer(
              connect.logger(),
              connect.bodyDecoder(),
              connect.methodOverride(),
              connect.conditionalGet(),
              connect.router(plainRoutes),
              connect.staticProvider(env.path + 'public')
          );

          var load = function (method, realm) {
              return function (route, handler) {

                  var newHandler = function (app) {
                      app[method](remnants(route), handler);
                  };
                  server.use(base(route),
                      connect.basicAuth(auth(env, realm), realm), connect.router(newHandler));
              };
          };
          var load2 = function (op, realm) {
              var method = {
                show: 'get', update: 'put', edit: 'get', destroy: 'delete'
              };
              var path = {
                show: '/:id', update: '/:id', edit: '/:id/edit', destroy: '/:id'
              };
              return function (route, handler) {
                  var newHandler = function (app) {
                      app[method[op]](remnants(route) + path[op], handler);
                  };
                  server.use(base(route),
                      connect.basicAuth(auth(env, realm), realm), connect.router(newHandler));
              };
          };
          var app = function (realm) {
              return {
                  get: load('get', realm),
                  put: load('put', realm),
                  post: load('post', realm),
                  delete: load('delete', realm),
                  show: load2('show', realm),
                  update: load2('update', realm),
                  edit: load2('edit', realm),
                  destroy: load2('destroy', realm)
              };
          };

          _(realms).chain().keys().each(function (realm) {
              if(realm !== '_') {
                  _.each(realms[realm], function (appkey) {
                      logger.info('load app[' + appkey + '] under ' + realm);
                      loadApp(env, app(realm), appkey);
                  });
              }
          });

          server.listen(env.server.port, env.server.host);
      }
    );

}


