var net = require('net'),
    http = require('http'),
    wss = require('./lib/ws-stream'),
    proxy = require('./lib/proxy_tunnel');

var port = process.env.port || 1337;

var server = http.createServer(function (req, res) {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('I\'m working.\n');
}).listen(port);

new wss.listen({ server: server }, function (s) {
    s.pipe(new proxy.ProxyTunnel({ type: 'direct' })).pipe(s);
});

process.on('uncaughtException', function (err) {
    console.log('[Error catched by process] ' + err);
});
