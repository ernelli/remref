var io = require("socket.io")(8087);

// server is a simple request reply router

var txid = 1;
var clientid = 1;

// map of client id<->socket
var clients = {};

// map of pending requests, txid<->txid
var requests = {};

io.on('connection', function(socket) {
    console.log("client connected");
    socket.on('init', function(params) {
        var id = (params && params.clientid) || (""+clientid++);

        console.log("client sent init, id: " + id);
        clients[id] = socket;
        console.log("emit init response: " + id);
        socket.emit('init', { clientid: id });
    });

    // route request to client socket identified by params.client
    socket.on('request', function(params) {
        //console.log("request: ");
        var client = params.client;

        if(clients[client]) {
            requests[txid] = { txid: params.txid, socket: socket, timestamp: Date.now() };
            clients[client].emit('request', { txid: txid, message: params.message});
            txid++;
        } else {
            socket.emit('reply', { txid: params.txid, error: "Invalid target client: " + params.client} );
        }
    });
    
    // route reply back to initiating client
    socket.on('reply', function(params) {
        var request = requests[params.txid];
        if(request) {
            request.socket.emit('reply', { txid: request.txid, message: params.message });
            delete requests[params.txid];
        }
    });
              
});

