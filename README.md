node.qproxy
===========

It's a nodejs socks4/5, http proxy based on WebSocket.

1. Deploy server.js to web server with websocket supported.
   (dependence on module "proxy.stream" and "ws.stream".)
2. Run app.js on local computer. (Change the url in app.js to the web site which deployed server.js.)
   (dependence on module "ws.stream".)
