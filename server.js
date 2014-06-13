var net = require('net'),
    http = require('http'),
    ios = require('socket.io'),
    io = require('./lib/socket.io_tunnel'),
    proxy = require('./lib/proxy_tunnel');

var port = process.env.port || 1337;

var server = http.createServer(function (req, res) {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('I\'m working.\n');
}).listen(port);

io.listen(ios(server)).on('connect', function (t) {
    t.pipe(new proxy.ProxyTunnel({ type: 'direct' })).pipe(t);
});

process.on('uncaughtException', function (err) {
    console.log('#[Error catched by process] ' + err);
});
